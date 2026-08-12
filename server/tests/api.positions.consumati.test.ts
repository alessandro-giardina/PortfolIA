/**
 * US-042, criterio 6 — la rimozione e la modifica di un carico già consumato da
 * una vendita sono impedite, con un messaggio che **distingue** la correzione di
 * un'iscrizione errata dalla vendita.
 *
 * Tre cose vanno provate separatamente, e nessuna implica le altre:
 *
 * - che il comando sia **impedito**. Un 204 su un carico consumato lascerebbe la
 *   vendita senza il costo che le è stato attribuito: l'invariante
 *   «costo attribuito + costo residuo = costo dei carichi» si spezzerebbe in
 *   silenzio, e la quantità residua resterebbe plausibile;
 * - che sia impedito **anche su un consumo parziale**. È il caso che una guardia
 *   scritta come `residuo === 0` sbaglia, ed è il caso peggiore: metà del lotto è
 *   già uscita, e rimuoverlo cancellerebbe *anche* la metà che una vendita ha
 *   già consumato;
 * - che la **modifica** sia impedita quanto la rimozione. Cambiare prezzo o data
 *   di un lotto consumato riscrive a posteriori il costo attribuito a una vendita
 *   già iscritta — un risultato realizzato che cambia senza che alcuna iscrizione
 *   lo dica (FR-024). Una guardia messa solo sulla DELETE è la dimenticanza
 *   naturale, e nessun test sulla DELETE la vedrebbe.
 *
 * E una quarta, di segno opposto: che il carico **non** consumato resti rimovibile.
 * Una guardia troppo larga — «esiste una vendita su questo ISIN, dunque nulla si
 * tocca» — passerebbe i primi tre test e romperebbe FR-009 senza rompere nulla di
 * visibile.
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
import type { Position, PositionDetail } from '@portfolia/shared';

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
const { salesRoutes } = await import('../src/api/sales.js');

async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-consumati-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  conn = new Database(testDbPath);
  testDb = drizzle(conn, { schema });
  migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });

  const fastify = Fastify();

  fastify.post<{ Body: { name?: string } }>('/api/portfolios', async (req, reply) => {
    const { name } = req.body ?? {};
    if (!name || name.trim() === '') {
      return reply.status(400).send({ error: 'Il nome non può essere vuoto.' });
    }
    const result = testDb.insert(schema.portfolios).values({ name: name.trim() }).returning().get();
    return reply.status(201).send(result);
  });

  await fastify.register(positionsRoutes);
  await fastify.register(salesRoutes);

  await fastify.ready();
  return fastify;
}

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

type App = Awaited<ReturnType<typeof buildApp>>;

const ISIN = 'IE00BK5BQT80';

async function creaPortafoglio(app: App, name: string): Promise<number> {
  const res = await app.inject({ method: 'POST', url: '/api/portfolios', payload: { name } });
  return res.json<{ id: number }>().id;
}

async function carica(
  app: App,
  portfolioId: number,
  loadDate: string,
  loadPrice: number,
  quantity: number,
): Promise<Position> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/positions`,
    payload: { isin: ISIN, load_date: loadDate, load_price: loadPrice, quantity },
  });
  expect(res.statusCode).toBe(201);
  return res.json<Position>();
}

function vendi(app: App, portfolioId: number, saleDate: string, quantity: number) {
  return app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/sales`,
    payload: { isin: ISIN, sale_date: saleDate, sale_price: 12.5, quantity },
  });
}

function rimuovi(app: App, portfolioId: number, positionId: number) {
  return app.inject({
    method: 'DELETE',
    url: `/api/portfolios/${portfolioId}/positions/${positionId}`,
  });
}

function modifica(app: App, portfolioId: number, positionId: number, payload: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url: `/api/portfolios/${portfolioId}/positions/${positionId}`,
    payload,
  });
}

/**
 * Lo scenario dei mockup: due carichi, e una vendita che consuma **per intero** il
 * più recente lasciando intatto il più antico. È la coppia che permette di
 * provare nello stesso registro il lotto impedito e quello ancora rimovibile.
 */
async function scenarioConsumoTotale(app: App, nome: string) {
  const portfolioId = await creaPortafoglio(app, nome);
  const intatto = await carica(app, portfolioId, '2023-04-12', 9.8, 600);
  const consumato = await carica(app, portfolioId, '2025-02-07', 11.5, 400);
  expect((await vendi(app, portfolioId, '2026-06-03', 400)).statusCode).toBe(201);
  return { portfolioId, intatto, consumato };
}

describe('DELETE di un carico consumato', () => {
  it('risponde 409 e non rimuove il carico', async () => {
    const app = await buildApp();
    const { portfolioId, consumato } = await scenarioConsumoTotale(app, 'Delete consumato');

    const res = await rimuovi(app, portfolioId, consumato.id);

    // 409 e non 400: la richiesta è ben formata, è lo stato del registro a
    // renderla impossibile.
    expect(res.statusCode).toBe(409);

    const detail = (
      await app.inject({
        method: 'GET',
        url: `/api/portfolios/${portfolioId}/positions/${ISIN}/detail`,
      })
    ).json<PositionDetail>();
    expect(detail.loads.map((l) => l.id)).toContain(consumato.id);
  });

  it('spiega la differenza fra la correzione di un\'iscrizione errata e la vendita', async () => {
    const app = await buildApp();
    const { portfolioId, consumato } = await scenarioConsumoTotale(app, 'Delete messaggio');

    const { error } = (await rimuovi(app, portfolioId, consumato.id)).json<{ error: string }>();

    // Le due parole devono comparire entrambe: un messaggio che dicesse solo
    // «operazione non consentita» sarebbe corretto e inutile, perché chi legge
    // vuole ridurre una posizione e ha bisogno di sapere che lo strumento giusto
    // esiste e qual è.
    expect(error).toContain('errata');
    expect(error).toContain('vendita');
    // E deve nominare l'iscrizione da correggere, se è quella a essere sbagliata.
    expect(error).toContain('2026-06-03');
  });

  it('è impedita anche quando il consumo è solo parziale', async () => {
    const app = await buildApp();
    const portfolioId = await creaPortafoglio(app, 'Delete consumo parziale');
    const lotto = await carica(app, portfolioId, '2023-04-12', 9.8, 600);
    await vendi(app, portfolioId, '2026-06-03', 100);

    // 100 quote su 600: il lotto ha ancora un residuo, e una guardia scritta
    // `residuo === 0` lo lascerebbe rimuovere — cancellando anche le 100 quote
    // che una vendita ha già consumato.
    const res = await rimuovi(app, portfolioId, lotto.id);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toContain('in parte');
  });

  it('lascia rimovibile il carico che nessuna vendita ha toccato', async () => {
    const app = await buildApp();
    const { portfolioId, intatto } = await scenarioConsumoTotale(app, 'Delete lotto intatto');

    // Esiste una vendita su questo ISIN, ma non su questo lotto: FR-009 resta in
    // vigore, e una guardia per ISIN invece che per lotto lo romperebbe.
    const res = await rimuovi(app, portfolioId, intatto.id);
    expect(res.statusCode).toBe(204);
  });

  it('lascia rimovibile ogni carico quando nessuna vendita è iscritta', async () => {
    const app = await buildApp();
    const portfolioId = await creaPortafoglio(app, 'Delete senza vendite');
    const lotto = await carica(app, portfolioId, '2023-04-12', 9.8, 600);

    expect((await rimuovi(app, portfolioId, lotto.id)).statusCode).toBe(204);
  });

  it('risponde 404, non 409, su una posizione inesistente', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenarioConsumoTotale(app, 'Delete inesistente');
    expect((await rimuovi(app, portfolioId, 999_999)).statusCode).toBe(404);
  });
});

describe('PATCH di un carico consumato', () => {
  it('risponde 409 su un cambio di prezzo e non lo applica', async () => {
    const app = await buildApp();
    const { portfolioId, consumato } = await scenarioConsumoTotale(app, 'Patch prezzo');

    const res = await modifica(app, portfolioId, consumato.id, { load_price: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toContain('vendita');

    // Il prezzo è ancora quello iscritto: cambiarlo riscriverebbe a posteriori il
    // costo attribuito alla vendita del 03.VI.2026.
    const detail = (
      await app.inject({
        method: 'GET',
        url: `/api/portfolios/${portfolioId}/positions/${ISIN}/detail`,
      })
    ).json<PositionDetail>();
    expect(detail.loads.find((l) => l.id === consumato.id)?.loadPrice).toBe(11.5);
  });

  it('risponde 409 su un cambio di data', async () => {
    const app = await buildApp();
    const { portfolioId, consumato } = await scenarioConsumoTotale(app, 'Patch data');
    // Una data spostata **dopo** la vendita renderebbe il lotto non attribuibile:
    // la vendita resterebbe iscritta e senza costo.
    expect((await modifica(app, portfolioId, consumato.id, { load_date: '2026-12-31' })).statusCode).toBe(409);
  });

  it('risponde 409 su un cambio di quantità', async () => {
    const app = await buildApp();
    const { portfolioId, consumato } = await scenarioConsumoTotale(app, 'Patch quantità');
    expect((await modifica(app, portfolioId, consumato.id, { quantity: 10 })).statusCode).toBe(409);
  });

  it('è impedita anche quando il consumo è solo parziale', async () => {
    const app = await buildApp();
    const portfolioId = await creaPortafoglio(app, 'Patch consumo parziale');
    const lotto = await carica(app, portfolioId, '2023-04-12', 9.8, 600);
    await vendi(app, portfolioId, '2026-06-03', 1);

    // Una sola quota consumata su 600 basta: il costo di quella quota è già
    // attribuito, e ogni modifica del lotto lo riscriverebbe.
    expect((await modifica(app, portfolioId, lotto.id, { load_price: 1 })).statusCode).toBe(409);
  });

  it('lascia modificabile il carico che nessuna vendita ha toccato', async () => {
    const app = await buildApp();
    const { portfolioId, intatto } = await scenarioConsumoTotale(app, 'Patch lotto intatto');

    const res = await modifica(app, portfolioId, intatto.id, { load_price: 9.9 });
    expect(res.statusCode).toBe(200);
    expect(res.json<Position>().loadPrice).toBe(9.9);
  });

  it('risponde 409 prima di discutere la forma del body', async () => {
    const app = await buildApp();
    const { portfolioId, consumato } = await scenarioConsumoTotale(app, 'Patch body vuoto');

    // Body vuoto su un lotto consumato: 409 e non 400. Un «nessun campo da
    // aggiornare» suggerirebbe che con un campo valido la richiesta passerebbe.
    expect((await modifica(app, portfolioId, consumato.id, {})).statusCode).toBe(409);
  });
});
