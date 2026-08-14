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
import type { PortfolioSeriesEntry } from '@portfolia/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

// ---------------------------------------------------------------------------
// Sostituiamo il singleton db di server/src/db/index.ts con un'istanza di test
// controllata — stessa tecnica degli altri test d'integrazione delle API
// portfolio (vedi api.positions.summary.test.ts, api.positions.enriched.test.ts).
// ---------------------------------------------------------------------------

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

/**
 * Guardia contro chiamate alla fonte esterna (US-019, criterio "nessuna fonte
 * contattata"): la rotta /series legge solo dall'archivio, quindi se
 * `fetchSecurityByIsin` di *qualunque* adapter di `market/` venisse invocato
 * durante la richiesta, il test deve fallire — non silenziosamente ignorarlo.
 * Se `positions.ts` non importa questi moduli (come da TASK-05), il mock non
 * viene nemmeno risolto dal grafo di import della rotta: gli spy restano a
 * zero chiamate per costruzione, ed è esattamente ciò che verifichiamo.
 */
const borsaItalianaFetch = vi.fn(async () => {
  throw new Error('non deve essere chiamata: /series è una lettura d\'archivio, non contatta Borsa Italiana');
});
const morningStarFetch = vi.fn(async () => {
  throw new Error('non deve essere chiamata: /series è una lettura d\'archivio, non contatta MorningStar');
});

vi.mock('../src/market/borsaItalianaAdapter.js', () => ({
  fetchSecurityByIsin: borsaItalianaFetch,
}));
vi.mock('../src/market/morningStarAdapter.js', () => ({
  fetchSecurityByIsin: morningStarFetch,
}));

// positionsRoutes va importata DOPO i mock (import statico → hoisting gestito da vi.mock)
const { positionsRoutes } = await import('../src/api/positions.js');
const { salesRoutes } = await import('../src/api/sales.js');

// ---------------------------------------------------------------------------
// buildApp — crea un db SQLite temporaneo per ogni test e registra le route
// ---------------------------------------------------------------------------

async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-serie-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  conn = new Database(testDbPath);
  testDb = drizzle(conn, { schema });
  migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });

  const fastify = Fastify();

  // Helper: POST /api/portfolios — crea portafoglio nel db di test
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

type App = Awaited<ReturnType<typeof buildApp>>;

afterEach(() => {
  borsaItalianaFetch.mockClear();
  morningStarFetch.mockClear();
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

// ---------------------------------------------------------------------------
// Helper per creare portafogli/posizioni/vendite/osservazioni tramite inject
// e inserimento diretto (per lo storico prezzi, che non ha una rotta di scrittura
// dedicata: è popolato dagli adapter di mercato in produzione).
// ---------------------------------------------------------------------------

async function createPortfolio(app: App, name: string): Promise<number> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/portfolios',
    payload: { name },
  });
  return res.json<{ id: number }>().id;
}

async function addPosition(
  app: App,
  portfolioId: number,
  isin: string,
  loadDate: string,
  loadPrice: number,
  quantity: number,
) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/positions`,
    payload: { isin, load_date: loadDate, load_price: loadPrice, quantity },
  });
  expect(res.statusCode).toBe(201);
  return res;
}

async function vendi(
  app: App,
  portfolioId: number,
  isin: string,
  saleDate: string,
  salePrice: number,
  quantity: number,
) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/sales`,
    payload: { isin, sale_date: saleDate, sale_price: salePrice, quantity },
  });
  expect(res.statusCode).toBe(201);
  return res;
}

/**
 * Inserisce una rilevazione di prezzo direttamente nella tabella
 * `price_observations`, come farebbe un aggiornamento reale (ricerca titolo,
 * scheda titolo, refresh massivo) — nessuna rotta HTTP scrive qui.
 * `observedAt` è un unix timestamp in secondi; `observedDay` è derivato se
 * omesso (basta per i test, che non attraversano la mezzanotte).
 */
function seminaOsservazione(isin: string, observedAt: number, price: number, observedDay?: string): void {
  const day = observedDay ?? new Date(observedAt * 1000).toISOString().slice(0, 10);
  testDb
    .insert(schema.priceObservations)
    .values({ isin, price, observed_at: observedAt, observed_day: day })
    .run();
}

async function getSerie(app: App, portfolioId: number) {
  return app.inject({
    method: 'GET',
    url: `/api/portfolios/${portfolioId}/series`,
  });
}

// ---------------------------------------------------------------------------
// GET /api/portfolios/:id/series
// ---------------------------------------------------------------------------

describe('GET /api/portfolios/:id/series', () => {
  it('portafoglio inesistente → 404', async () => {
    const app = await buildApp();

    const res = await getSerie(app, 99999);

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });

  it('portafoglio esistente senza titoli → []', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Vuoto Serie');

    const res = await getSerie(app, portfolioId);

    expect(res.statusCode).toBe(200);
    expect(res.json<PortfolioSeriesEntry[]>()).toEqual([]);
  });

  it('un solo ISIN — riporta carichi, vendite e storico prezzi di quel titolo', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Singolo Serie');
    const isin = 'IE00B4L5Y983';

    await addPosition(app, portfolioId, isin, '2024-01-10', 89.0, 40);
    await vendi(app, portfolioId, isin, '2026-02-01', 95.0, 10);
    seminaOsservazione(isin, 1_700_000_000, 90.0);
    seminaOsservazione(isin, 1_701_000_000, 91.5);

    const res = await getSerie(app, portfolioId);

    expect(res.statusCode).toBe(200);
    const entries = res.json<PortfolioSeriesEntry[]>();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.isin).toBe(isin);
    expect(entry.loads).toEqual([{ loadDate: '2024-01-10', loadPrice: 89.0, quantity: 40 }]);
    expect(entry.sales).toEqual([{ saleDate: '2026-02-01', quantity: 10, salePrice: 95.0 }]);
    expect(entry.priceHistory).toEqual([
      { price: 90.0, observedAt: 1_700_000_000 },
      { price: 91.5, observedAt: 1_701_000_000 },
    ]);
  });

  // -------------------------------------------------------------------------
  // US-015 (TASK-02): salePrice per ciascuna vendita, come iscritto a registro.
  // -------------------------------------------------------------------------

  it('più vendite sullo stesso ISIN — ciascuna porta il proprio salePrice, così com\'è a registro', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio SalepPrice Serie');
    const isin = 'IE00B4L5Y983';

    await addPosition(app, portfolioId, isin, '2024-01-10', 89.0, 40);
    await vendi(app, portfolioId, isin, '2026-02-01', 95.0, 10);
    await vendi(app, portfolioId, isin, '2026-05-01', 102.75, 5);

    const res = await getSerie(app, portfolioId);
    const [entry] = res.json<PortfolioSeriesEntry[]>();

    expect(entry.sales).toEqual([
      { saleDate: '2026-02-01', quantity: 10, salePrice: 95.0 },
      { saleDate: '2026-05-01', quantity: 5, salePrice: 102.75 },
    ]);
  });

  // -------------------------------------------------------------------------
  // Ordinamento per ISIN e assenza di scambi di dati fra titoli.
  // -------------------------------------------------------------------------

  it('due ISIN — una sola risposta, ordinata per ISIN, senza scambio di carichi/vendite/storico fra titoli', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Due ISIN Serie');

    // IE00B3RBWM25 precede IE00B4L5Y983 in ordine alfabetico.
    const isinA = 'IE00B4L5Y983';
    const isinB = 'IE00B3RBWM25';

    await addPosition(app, portfolioId, isinA, '2024-01-10', 89.0, 40);
    await addPosition(app, portfolioId, isinB, '2023-05-05', 115.2, 20);
    await vendi(app, portfolioId, isinA, '2026-02-01', 95.0, 10);
    await vendi(app, portfolioId, isinB, '2026-03-01', 120.0, 5);

    seminaOsservazione(isinA, 1_700_000_000, 90.0);
    seminaOsservazione(isinA, 1_701_000_000, 91.5);
    seminaOsservazione(isinB, 1_700_500_000, 116.0);

    const res = await getSerie(app, portfolioId);

    expect(res.statusCode).toBe(200);
    const entries = res.json<PortfolioSeriesEntry[]>();
    expect(entries).toHaveLength(2);

    // Ordine per ISIN
    expect(entries[0].isin).toBe(isinB);
    expect(entries[1].isin).toBe(isinA);

    const entryB = entries[0];
    expect(entryB.loads).toEqual([{ loadDate: '2023-05-05', loadPrice: 115.2, quantity: 20 }]);
    expect(entryB.sales).toEqual([{ saleDate: '2026-03-01', quantity: 5, salePrice: 120.0 }]);
    expect(entryB.priceHistory).toEqual([{ price: 116.0, observedAt: 1_700_500_000 }]);

    const entryA = entries[1];
    expect(entryA.loads).toEqual([{ loadDate: '2024-01-10', loadPrice: 89.0, quantity: 40 }]);
    expect(entryA.sales).toEqual([{ saleDate: '2026-02-01', quantity: 10, salePrice: 95.0 }]);
    expect(entryA.priceHistory).toEqual([
      { price: 90.0, observedAt: 1_700_000_000 },
      { price: 91.5, observedAt: 1_701_000_000 },
    ]);
  });

  it('anagrafica: nome presente in cache per un ISIN, assente per l\'altro — nessuno scambio', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Anagrafiche Serie');
    const isinA = 'IE00B4L5Y983';
    const isinB = 'IE00B3RBWM25';

    await addPosition(app, portfolioId, isinA, '2024-01-10', 89.0, 40);
    await addPosition(app, portfolioId, isinB, '2023-05-05', 115.2, 20);
    testDb
      .insert(schema.securities)
      .values({ isin: isinB, name: 'Vanguard FTSE All-World UCITS ETF', price: 120.0 })
      .run();
    // isinA resta fuori dalla cache anagrafiche.

    const res = await getSerie(app, portfolioId);
    const entries = res.json<PortfolioSeriesEntry[]>();

    const entryB = entries.find((e) => e.isin === isinB);
    const entryA = entries.find((e) => e.isin === isinA);
    expect(entryB?.name).toBe('Vanguard FTSE All-World UCITS ETF');
    expect(entryA?.name).toBeNull();
  });

  // -------------------------------------------------------------------------
  // priceHistory in ordine crescente per data di rilevazione.
  // -------------------------------------------------------------------------

  it('priceHistory è in ordine crescente per data di rilevazione, indipendentemente dall\'ordine di inserimento', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Ordine Storico');
    const isin = 'IE00B4L5Y983';

    await addPosition(app, portfolioId, isin, '2024-01-10', 89.0, 40);

    // Inseriamo fuori ordine cronologico deliberatamente.
    seminaOsservazione(isin, 1_701_000_000, 91.5);
    seminaOsservazione(isin, 1_699_000_000, 88.0);
    seminaOsservazione(isin, 1_700_000_000, 90.0);

    const res = await getSerie(app, portfolioId);
    const [entry] = res.json<PortfolioSeriesEntry[]>();

    expect(entry.priceHistory.map((o) => o.observedAt)).toEqual([1_699_000_000, 1_700_000_000, 1_701_000_000]);
    expect(entry.priceHistory.map((o) => o.price)).toEqual([88.0, 90.0, 91.5]);
  });

  it('ISIN senza rilevazioni in cache → priceHistory vuoto, non assente', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Senza Storico');
    const isin = 'IE00B4L5Y983';

    await addPosition(app, portfolioId, isin, '2024-01-10', 89.0, 40);

    const res = await getSerie(app, portfolioId);
    const [entry] = res.json<PortfolioSeriesEntry[]>();

    expect(entry.priceHistory).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Carichi multipli sullo stesso ISIN: tutti presenti, nessuna riduzione LIFO.
  // -------------------------------------------------------------------------

  it('più carichi e più vendite sullo stesso ISIN sono tutti presenti in loads/sales, senza aggregazione LIFO', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Carichi Multipli Serie');
    const isin = 'IE00BK5BQT80';

    await addPosition(app, portfolioId, isin, '2023-04-12', 9.8, 600);
    await addPosition(app, portfolioId, isin, '2025-02-07', 11.5, 400);
    await vendi(app, portfolioId, isin, '2026-06-03', 12.5, 400);

    const res = await getSerie(app, portfolioId);
    const [entry] = res.json<PortfolioSeriesEntry[]>();

    expect(entry.loads).toHaveLength(2);
    expect(entry.loads).toEqual(
      expect.arrayContaining([
        { loadDate: '2023-04-12', loadPrice: 9.8, quantity: 600 },
        { loadDate: '2025-02-07', loadPrice: 11.5, quantity: 400 },
      ]),
    );
    expect(entry.sales).toEqual([{ saleDate: '2026-06-03', quantity: 400, salePrice: 12.5 }]);
  });

  // -------------------------------------------------------------------------
  // Nessuna chiamata alla fonte esterna (US-019, criterio archivio-only).
  // -------------------------------------------------------------------------

  it('non contatta alcuna fonte esterna — né Borsa Italiana né MorningStar', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Nessuna Fonte Esterna');
    const isin = 'IE00B4L5Y983';

    await addPosition(app, portfolioId, isin, '2024-01-10', 89.0, 40);
    // Nessuna riga in securities/price_observations: se la rotta cercasse di
    // "colmare" l'assenza contattando una fonte, gli spy la intercetterebbero.

    const res = await getSerie(app, portfolioId);

    expect(res.statusCode).toBe(200);
    expect(borsaItalianaFetch).not.toHaveBeenCalled();
    expect(morningStarFetch).not.toHaveBeenCalled();
  });
});
