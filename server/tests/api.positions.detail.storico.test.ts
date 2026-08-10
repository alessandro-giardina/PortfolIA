/**
 * US-009 — lo storico dei prezzi osservati dentro il dettaglio del titolo.
 *
 * Verifica ciò che l'endpoint *promette al client*: l'ordine decrescente, il
 * vuoto dichiarato come vuoto, e la fonte non registrata che resta `null` invece
 * di scivolare in `'borsaitaliana'`.
 *
 * Le osservazioni sono scritte direttamente in tabella e non passando da
 * `registraOsservazione`: qui la regola di deduplica non è in prova (lo è in
 * `storicoPrezzi.test.ts`), mentre serve poter comporre stati che quella
 * funzione da sola non produrrebbe — due rilevazioni allo stesso istante, un
 * `data_source` scritto da una versione precedente dello schema.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Fastify from 'fastify';
import * as schema from '../src/db/schema.js';
import type { PositionDetail } from '@portfolia/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

let testDbPath: string;
let conn: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

vi.mock('../src/db/index.js', () => ({
  get db() {
    return testDb;
  },
  get conn() {
    return conn;
  },
}));

const { positionsRoutes } = await import('../src/api/positions.js');

const ISIN = 'IE00B4L5Y983';

async function buildApp() {
  testDbPath = join(tmpdir(), `test-detail-storico-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  conn = new Database(testDbPath);
  testDb = drizzle(conn, { schema });
  migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });

  const fastify = Fastify();
  await fastify.register(positionsRoutes);
  await fastify.ready();
  return fastify;
}

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

type App = Awaited<ReturnType<typeof buildApp>>;

/** Un portafoglio con un carico dell'ISIN di prova, il minimo per aprire la scheda. */
function preparaPosizione(nome: string): number {
  const portfolioId = testDb.insert(schema.portfolios).values({ name: nome }).returning().get().id;
  testDb
    .insert(schema.positions)
    .values({ portfolio_id: portfolioId, isin: ISIN, load_date: '2026-01-15', load_price: 100, quantity: 10 })
    .run();
  return portfolioId;
}

/** Scrive un'osservazione così com'è, senza passare dalla deduplica. */
function inserisciOsservazione(
  price: number,
  observedAt: number,
  observedDay: string,
  dataSource: string | null,
): void {
  testDb
    .insert(schema.priceObservations)
    .values({ isin: ISIN, price, observed_at: observedAt, observed_day: observedDay, data_source: dataSource })
    .run();
}

async function leggiDettaglio(app: App, portfolioId: number): Promise<PositionDetail> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/portfolios/${portfolioId}/positions/${ISIN}/detail`,
  });
  expect(res.statusCode).toBe(200);
  return res.json<PositionDetail>();
}

describe('GET …/detail → priceHistory (US-009)', () => {
  it('restituisce le osservazioni dalla più recente alla più antica', async () => {
    const app = await buildApp();
    const portfolioId = preparaPosizione('Conto Storico Ordine');

    // Inserite deliberatamente in ordine sparso: se l'endpoint restituisse
    // l'ordine di inserimento, il test lo vedrebbe.
    inserisciOsservazione(126.9, 1_785_000_000, '2026-08-07', 'borsaitaliana');
    inserisciOsservazione(122.4, 1_784_000_000, '2026-07-21', 'borsaitaliana');
    inserisciOsservazione(128.46, 1_786_000_000, '2026-08-10', 'borsaitaliana');

    const detail = await leggiDettaglio(app, portfolioId);

    expect(detail.priceHistory.map((o) => o.observedAt)).toEqual([
      1_786_000_000,
      1_785_000_000,
      1_784_000_000,
    ]);
    expect(detail.priceHistory.map((o) => o.price)).toEqual([128.46, 126.9, 122.4]);
  });

  it('due osservazioni dello stesso istante restano ordinate per registrazione, la più recente prima', async () => {
    const app = await buildApp();
    const portfolioId = preparaPosizione('Conto Storico Pari Merito');

    // Stesso giorno, stesso secondo, prezzi diversi: il vincolo UNIQUE le
    // ammette entrambe, e `observed_at` da solo non le ordina. Senza il criterio
    // secondario l'ordine sarebbe quello che SQLite decide, cioè nessuno.
    inserisciOsservazione(125.88, 1_786_000_000, '2026-08-10', 'borsaitaliana');
    inserisciOsservazione(127.31, 1_786_000_000, '2026-08-10', 'borsaitaliana');

    const detail = await leggiDettaglio(app, portfolioId);

    expect(detail.priceHistory.map((o) => o.price)).toEqual([127.31, 125.88]);
  });

  it('titolo senza osservazioni → priceHistory vuoto, non assente', async () => {
    const app = await buildApp();
    const portfolioId = preparaPosizione('Conto Storico Vuoto');

    const detail = await leggiDettaglio(app, portfolioId);

    expect(detail.priceHistory).toEqual([]);
  });

  it('data_source assente o non riconosciuto → null, mai «borsaitaliana»', async () => {
    const app = await buildApp();
    const portfolioId = preparaPosizione('Conto Storico Fonte Ignota');

    inserisciOsservazione(122.4, 1_786_000_000, '2026-08-10', null);
    inserisciOsservazione(121.0, 1_785_000_000, '2026-08-07', 'fonte-inventata');

    const detail = await leggiDettaglio(app, portfolioId);

    expect(detail.priceHistory.map((o) => o.dataSource)).toEqual([null, null]);
  });

  it('mostra la fonte di backup così com’è registrata', async () => {
    const app = await buildApp();
    const portfolioId = preparaPosizione('Conto Storico Backup');

    inserisciOsservazione(125.88, 1_786_000_000, '2026-08-10', 'morningstar');

    const detail = await leggiDettaglio(app, portfolioId);

    expect(detail.priceHistory).toEqual([
      { price: 125.88, observedAt: 1_786_000_000, dataSource: 'morningstar' },
    ]);
  });

  it('lo storico è quello dell’ISIN richiesto, non di tutta la tabella', async () => {
    const app = await buildApp();
    const portfolioId = preparaPosizione('Conto Storico Per ISIN');

    inserisciOsservazione(128.46, 1_786_000_000, '2026-08-10', 'borsaitaliana');
    testDb
      .insert(schema.priceObservations)
      .values({
        isin: 'IE00B5BMR087',
        price: 552.18,
        observed_at: 1_786_000_100,
        observed_day: '2026-08-10',
        data_source: 'borsaitaliana',
      })
      .run();

    const detail = await leggiDettaglio(app, portfolioId);

    expect(detail.priceHistory.map((o) => o.price)).toEqual([128.46]);
  });
});
