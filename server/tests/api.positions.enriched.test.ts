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
import type { EnrichedPositionSummary } from '@portfolia/shared';

/** ISIN dello scenario US-042/US-043: due carichi a prezzi diversi. */
const ISIN_LIFO = 'IE00BK5BQT80';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

// ---------------------------------------------------------------------------
// Sostituiamo il singleton db con un'istanza di test controllata
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

const { positionsRoutes } = await import('../src/api/positions.js');
const { salesRoutes } = await import('../src/api/sales.js');

// ---------------------------------------------------------------------------
// buildApp — crea un db SQLite temporaneo per ogni test
// ---------------------------------------------------------------------------

/**
 * `now` viene inoltrato al plugin come opzione di registrazione: è l'orologio
 * che il verdetto di freschezza (US-034) usa al posto di `new Date()`. Omesso,
 * la rotta si comporta esattamente come in produzione — è la retrocompatibilità
 * che tutti i test preesistenti di questo file continuano a esercitare.
 */
async function buildApp(opzioni: { now?: () => Date } = {}) {
  testDbPath = join(tmpdir(), `test-api-enriched-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  conn = new Database(testDbPath);
  testDb = drizzle(conn, { schema });
  migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });

  const fastify = Fastify();

  // Helper: POST /api/portfolios
  fastify.post<{ Body: { name?: string } }>('/api/portfolios', async (req, reply) => {
    const { name } = req.body ?? {};
    if (!name || name.trim() === '') {
      return reply.status(400).send({ error: 'Il nome non può essere vuoto.' });
    }
    const result = testDb.insert(schema.portfolios).values({ name: name.trim() }).returning().get();
    return reply.status(201).send(result);
  });

  await fastify.register(positionsRoutes, opzioni);
  await fastify.register(salesRoutes);
  await fastify.ready();
  return fastify;
}

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createPortfolio(app: Awaited<ReturnType<typeof buildApp>>, name: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/portfolios',
    payload: { name },
  });
  return res.json<{ id: number }>().id;
}

async function addPosition(
  app: Awaited<ReturnType<typeof buildApp>>,
  portfolioId: number,
  isin: string,
  loadPrice: number,
  quantity: number,
) {
  return app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/positions`,
    payload: { isin, load_date: '2026-01-15', load_price: loadPrice, quantity },
  });
}

/**
 * `fetchedAt` è opzionale: quando non è passato la colonna prende il default
 * dello schema (`unixepoch()`), come nella scrittura reale della cache. I test
 * che asseriscono il momento del rilevamento lo fissano a un valore noto,
 * perché è l'unico modo di distinguere un timestamp propagato da uno inventato.
 */
function insertSecurity(isin: string, name: string | null, price: number | null, fetchedAt?: number) {
  testDb
    .insert(schema.securities)
    .values(fetchedAt === undefined ? { isin, name, price } : { isin, name, price, fetched_at: fetchedAt })
    .onConflictDoUpdate({
      target: schema.securities.isin,
      set: fetchedAt === undefined ? { name, price } : { name, price, fetched_at: fetchedAt },
    })
    .run();
}

// ---------------------------------------------------------------------------
// GET /api/portfolios/:id/positions/enriched
// ---------------------------------------------------------------------------

describe('GET /api/portfolios/:id/positions/enriched', () => {
  it('portafoglio vuoto → risponde []', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Vuoto');

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<EnrichedPositionSummary[]>()).toEqual([]);
  });

  it('portafoglio inesistente → 404', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/portfolios/99999/positions/enriched',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });

  it('ISIN con security in cache — tutti i campi valorizzati', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Con Security');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.50);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.isin).toBe('IE00B4L5Y983');
    expect(row.name).toBe('iShares Core MSCI World UCITS ETF');
    expect(row.totalQuantity).toBe(40);
    expect(row.avgLoadPrice).toBeCloseTo(89.00, 3);
    expect(row.currentPrice).toBeCloseTo(95.50, 4);
    // currentValue = 95.50 × 40 = 3820
    expect(row.currentValue).toBeCloseTo(3820.00, 2);
    // difference = 3820 − (89.00 × 40) = 3820 − 3560 = 260
    expect(row.difference).toBeCloseTo(260.00, 2);
  });

  it('ISIN senza security in cache — campi derivati null', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Senza Cache');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    // Non inseriamo nulla nella cache securities

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.isin).toBe('IE00B4L5Y983');
    expect(row.name).toBeNull();
    expect(row.currentPrice).toBeNull();
    expect(row.currentValue).toBeNull();
    expect(row.difference).toBeNull();
    // avgLoadPrice e totalQuantity restano valorizzati
    expect(row.totalQuantity).toBe(40);
    expect(row.avgLoadPrice).toBeCloseTo(89.00, 3);
  });

  it('carichi multipli stesso ISIN — media ponderata corretta', async () => {
    // 89.00×40 + 91.00×60 = 3560 + 5460 = 9020 su 100 → avg = 90.20
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Media Ponderata');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 91.00, 60);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.00);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.totalQuantity).toBe(100);
    expect(row.avgLoadPrice).toBeCloseTo(90.20, 3);
    // currentValue = 95.00 × 100 = 9500
    expect(row.currentValue).toBeCloseTo(9500.00, 2);
    // difference = 9500 − 9020 = 480
    expect(row.difference).toBeCloseTo(480.00, 2);
  });

  it('mix ISIN con e senza cache — risultati coerenti su due righe', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Mix');

    await addPosition(app, portfolioId, 'IE00B3RBWM25', 115.20, 20);
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    // Solo il primo ISIN in cache
    insertSecurity('IE00B3RBWM25', 'Vanguard FTSE All-World UCITS ETF', 120.00);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(2);

    // Ordine per ISIN: IE00B3RBWM25 < IE00B4L5Y983
    const first = rows[0];
    expect(first.isin).toBe('IE00B3RBWM25');
    expect(first.name).toBe('Vanguard FTSE All-World UCITS ETF');
    expect(first.currentPrice).toBeCloseTo(120.00, 4);
    // currentValue = 120 × 20 = 2400; loadValue = 115.20 × 20 = 2304 → diff = 96
    expect(first.currentValue).toBeCloseTo(2400.00, 2);
    expect(first.difference).toBeCloseTo(96.00, 2);

    const second = rows[1];
    expect(second.isin).toBe('IE00B4L5Y983');
    expect(second.name).toBeNull();
    expect(second.currentPrice).toBeNull();
    expect(second.currentValue).toBeNull();
    expect(second.difference).toBeNull();
  });

  // -------------------------------------------------------------------------
  // fetchedAt — momento dell'ultimo rilevamento del prezzo (US-032)
  // -------------------------------------------------------------------------

  it('ISIN in cache — espone il momento esatto dell ultimo rilevamento', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Rilevamento');

    const rilevatoIl = 1_770_000_000; // istante noto, non "adesso"
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.50, rilevatoIl);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0].fetchedAt).toBe(rilevatoIl);
  });

  it('ISIN senza security in cache — fetchedAt è null', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Senza Rilevamento');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    // Nessuna riga in cache: il rilevamento non esiste, non è "adesso"

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0].fetchedAt).toBeNull();
  });

  it('carichi multipli sullo stesso ISIN — una sola riga, fetchedAt invariato', async () => {
    // Il rilevamento appartiene al titolo, non al carico: aggregare tre carichi
    // non deve moltiplicare le righe né alterare il timestamp.
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Carichi Multipli');

    const rilevatoIl = 1_769_500_000;
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 91.00, 60);
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 93.00, 10);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.00, rilevatoIl);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0].totalQuantity).toBe(110);
    expect(rows[0].fetchedAt).toBe(rilevatoIl);
  });

  it('riga in cache con prezzo nullo — fetchedAt resta valorizzato, il prezzo no', async () => {
    // Stato raggiungibile: la fonte risponde con l'anagrafica ma senza quotazione.
    // L'endpoint riporta ciò che l'archivio contiene — istante sì, prezzo no — e
    // lascia al client la decisione su cosa mostrare accanto a un prezzo assente.
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Prezzo Nullo');

    const rilevatoIl = 1_767_000_000;
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', null, rilevatoIl);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0].currentPrice).toBeNull();
    expect(rows[0].currentValue).toBeNull();
    expect(rows[0].difference).toBeNull();
    expect(rows[0].fetchedAt).toBe(rilevatoIl);
  });

  it('due ISIN con rilevamenti distinti — ogni riga porta il proprio timestamp', async () => {
    // `fetched_at` è raggruppato come le altre colonne della cache: due titoli
    // distinti non devono mai scambiarsi l'istante di rilevamento.
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Due Rilevamenti');

    const rilevatoPrimo = 1_768_000_000;
    const rilevatoSecondo = 1_771_000_000;

    await addPosition(app, portfolioId, 'IE00B3RBWM25', 115.20, 20);
    await addPosition(app, portfolioId, 'IE00B3RBWM25', 117.00, 5);
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    insertSecurity('IE00B3RBWM25', 'Vanguard FTSE All-World UCITS ETF', 120.00, rilevatoPrimo);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.50, rilevatoSecondo);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows).toHaveLength(2);
    expect(rows[0].isin).toBe('IE00B3RBWM25');
    expect(rows[0].fetchedAt).toBe(rilevatoPrimo);
    expect(rows[1].isin).toBe('IE00B4L5Y983');
    expect(rows[1].fetchedAt).toBe(rilevatoSecondo);
  });

  // -------------------------------------------------------------------------
  // freshness — verdetto di obsolescenza del rilevamento (US-034)
  //
  // L'orologio è congelato dalla registrazione della rotta: senza, l'esito
  // dipenderebbe dal giorno e dall'ora in cui la suite gira, cioè da tutto
  // tranne che dal dato sotto esame.
  // -------------------------------------------------------------------------

  /** Istante assoluto da un orario civile di Roma esplicito, in secondi unix. */
  const unix = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000);

  /** Martedì 30 giugno 2026, 11:00 — mercato aperto, sessione in corso. */
  const ADESSO = (): Date => new Date('2026-06-30T11:00:00+02:00');

  it('rilevamento di una sessione precedente → freshness stale', async () => {
    const app = await buildApp({ now: ADESSO });
    const portfolioId = await createPortfolio(app, 'Portfolio Obsoleto');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.0, 40);
    // Lunedì 10:00: la sessione di lunedì si è conclusa prima di martedì mattina.
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.5, unix('2026-06-29T10:00:00+02:00'));

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows[0].freshness).toBe('stale');
    // Nessuna cifra cambia per effetto del verdetto.
    expect(rows[0].currentPrice).toBeCloseTo(95.5, 4);
    expect(rows[0].currentValue).toBeCloseTo(3820.0, 2);
    expect(rows[0].difference).toBeCloseTo(260.0, 2);
  });

  it('rilevamento nella sessione corrente → freshness current', async () => {
    const app = await buildApp({ now: ADESSO });
    const portfolioId = await createPortfolio(app, 'Portfolio Allineato');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.0, 40);
    // Martedì 10:00, un'ora prima dell'istante congelato: stessa sessione.
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.5, unix('2026-06-30T10:00:00+02:00'));

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    expect(res.json<EnrichedPositionSummary[]>()[0].freshness).toBe('current');
  });

  it('ISIN fuori cache → freshness never-fetched, con currentPrice null', async () => {
    const app = await buildApp({ now: ADESSO });
    const portfolioId = await createPortfolio(app, 'Portfolio Mai Rilevato');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.0, 40);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    const row = res.json<EnrichedPositionSummary[]>()[0];
    expect(row.freshness).toBe('never-fetched');
    expect(row.currentPrice).toBeNull();
    expect(row.fetchedAt).toBeNull();
  });

  it('riga in cache con prezzo nullo → never-fetched, non stale', async () => {
    // Il caso misto: `fetched_at` valorizzato ma `price` a NULL. Chiamarla
    // «obsoleta» direbbe che un prezzo è stato rilevato, mentre la colonna
    // accanto mostra «–». Il verdetto usa lo stesso predicato della cella.
    const app = await buildApp({ now: ADESSO });
    const portfolioId = await createPortfolio(app, 'Portfolio Prezzo Nullo Freschezza');

    const rilevatoIl = unix('2026-06-29T10:00:00+02:00');
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.0, 40);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', null, rilevatoIl);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    const row = res.json<EnrichedPositionSummary[]>()[0];
    expect(row.freshness).toBe('never-fetched');
    // L'istante resta esposto: è il client a decidere di non mostrarlo.
    expect(row.fetchedAt).toBe(rilevatoIl);
  });

  it('due ISIN con verdetti diversi — nessuno prende quello dell’altro', async () => {
    const app = await buildApp({ now: ADESSO });
    const portfolioId = await createPortfolio(app, 'Portfolio Verdetti Misti');

    await addPosition(app, portfolioId, 'IE00B3RBWM25', 115.2, 20);
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.0, 40);
    insertSecurity('IE00B3RBWM25', 'Vanguard FTSE All-World UCITS ETF', 120.0, unix('2026-06-29T10:00:00+02:00'));
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.5, unix('2026-06-30T10:00:00+02:00'));

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    const rows = res.json<EnrichedPositionSummary[]>();
    expect(rows.map((r) => [r.isin, r.freshness])).toEqual([
      ['IE00B3RBWM25', 'stale'],
      ['IE00B4L5Y983', 'current'],
    ]);
  });

  it('senza orologio iniettato la rotta resta registrabile e risponde comunque un verdetto', async () => {
    // La retrocompatibilità della firma è il punto: `register(positionsRoutes)`
    // senza opzioni continua a funzionare, e `freshness` è sempre definito.
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Senza Orologio');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.0, 40);
    insertSecurity('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 95.5);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/enriched`,
    });

    // Seminato "adesso": qualunque sia l'ora di esecuzione, non può essere
    // obsoleto — `classifyRefetch(now, now)` non restituisce mai `none`.
    expect(res.json<EnrichedPositionSummary[]>()[0].freshness).toBe('current');
  });
});

// ---------------------------------------------------------------------------
// I campi del P&L (US-043): realizedPnl, latentPnl, totalPnl, totalLoadCost.
// ---------------------------------------------------------------------------

function vendi(
  app: Awaited<ReturnType<typeof buildApp>>,
  portfolioId: number,
  payload: Record<string, unknown>,
) {
  return app.inject({ method: 'POST', url: `/api/portfolios/${portfolioId}/sales`, payload });
}

describe('GET /api/portfolios/:id/positions/enriched — i campi del P&L (US-043)', () => {
  it('un ISIN senza vendite riporta realizedPnl 0 e latentPnl identico a difference', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Arricchito Senza Vendite Pnl');

    await addPosition(app, portfolioId, ISIN_LIFO, 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, 11.5, 400);
    insertSecurity(ISIN_LIFO, 'Vanguard FTSE All-World UCITS ETF Acc', 12.5);

    const [ep] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/enriched` })
    ).json<EnrichedPositionSummary[]>();

    expect(ep.realizedPnl).toBe(0);
    // Nessuna regressione sulle cifre già fissate da US-042/US-034.
    expect(ep.currentValue).toBeCloseTo(12.5 * 1000, 8);
    expect(ep.difference).toBeCloseTo(ep.latentPnl ?? NaN, 8);
    expect(ep.totalPnl).toBeCloseTo(ep.realizedPnl + (ep.latentPnl ?? NaN), 8);
  });

  it('dopo una vendita il totale è la somma di realizzato e latente, con la base della percentuale su tutti i carichi', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Arricchito Con Vendita Pnl');

    await addPosition(app, portfolioId, ISIN_LIFO, 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, 11.5, 400);
    insertSecurity(ISIN_LIFO, 'Vanguard FTSE All-World UCITS ETF Acc', 12.5);
    const venditaRes = await vendi(app, portfolioId, {
      isin: ISIN_LIFO,
      sale_date: '2026-06-03',
      sale_price: 12.5,
      quantity: 400,
    });
    expect(venditaRes.statusCode).toBe(201);

    const [ep] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/enriched` })
    ).json<EnrichedPositionSummary[]>();

    expect(ep.totalQuantity).toBe(600);
    expect(ep.realizedPnl).toBeCloseTo(400, 8);
    expect(ep.latentPnl).toBeCloseTo(12.5 * 600 - 9.8 * 600, 8);
    expect(ep.totalPnl).toBeCloseTo(ep.realizedPnl + (ep.latentPnl ?? NaN), 8);
    // Criterio 5: costo di tutti i carichi, lotti venduti inclusi.
    expect(ep.totalLoadCost).toBeCloseTo(9.8 * 600 + 11.5 * 400, 8);
  });

  it('un titolo interamente venduto porta il latente a zero misurato, non assente', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Arricchito Interamente Venduto');

    await addPosition(app, portfolioId, ISIN_LIFO, 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, 11.5, 400);
    // Nessun prezzo corrente in cache: il residuo è comunque zero misurato.
    const venditaRes = await vendi(app, portfolioId, {
      isin: ISIN_LIFO,
      sale_date: '2026-06-03',
      sale_price: 12.5,
      quantity: 1000,
    });
    expect(venditaRes.statusCode).toBe(201);

    const [ep] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/enriched` })
    ).json<EnrichedPositionSummary[]>();

    expect(ep.totalQuantity).toBe(0);
    expect(ep.avgLoadPrice).toBeNull();
    expect(ep.currentPrice).toBeNull();
    expect(ep.latentPnl).toBe(0);
    expect(ep.totalPnl).toBe(ep.realizedPnl);
    // US-044: l'incasso della vendita che azzera il residuo, coerente con la
    // cifra reale (1.000 quote a 12,50), e il realizzato resta quello di
    // sempre — l'aggiunta di soldRevenue non lo tocca.
    expect(ep.soldRevenue).toBeCloseTo(1000 * 12.5, 8);
    expect(ep.realizedPnl).toBeCloseTo(1000 * 12.5 - (9.8 * 600 + 11.5 * 400), 8);
  });

  it('un ISIN senza vendite riporta soldRevenue 0 (US-044)', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Arricchito Senza Vendite Ricavo');

    await addPosition(app, portfolioId, ISIN_LIFO, 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, 11.5, 400);
    insertSecurity(ISIN_LIFO, 'Vanguard FTSE All-World UCITS ETF Acc', 12.5);

    const [ep] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/enriched` })
    ).json<EnrichedPositionSummary[]>();

    expect(ep.soldRevenue).toBe(0);
  });
});
