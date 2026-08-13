/**
 * US-018 — GET /api/portfolios/:id/positions/:isin/detail
 *
 * Due assi di verifica: la fedeltà dei numeri (media ponderata, differenza,
 * percentuale) e l'onestà sui dati assenti (null dove il dato non c'è, mai uno
 * zero o una fonte presunta).
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
const { salesRoutes } = await import('../src/api/sales.js');

const ISIN = 'IE00B4L5Y983';
/** ISIN formalmente valido ma mai iscritto ad alcun portafoglio di prova. */
const ISIN_ESTRANEO = 'IE00B3RBWM25';
/** ISIN dello scenario US-042/US-043: due carichi a prezzi diversi. */
const ISIN_LIFO = 'IE00BK5BQT80';

async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-detail-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

async function createPortfolio(app: App, name: string): Promise<number> {
  const res = await app.inject({ method: 'POST', url: '/api/portfolios', payload: { name } });
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
  return app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/positions`,
    payload: { isin, load_date: loadDate, load_price: loadPrice, quantity },
  });
}

/** Anagrafica completa, come la lascerebbe un recupero riuscito da Borsa Italiana. */
function insertSecurityCompleta(isin: string) {
  testDb
    .insert(schema.securities)
    .values({
      isin,
      name: 'iShares Core MSCI World UCITS ETF',
      price: 128.46,
      ticker: 'SWDA',
      instrument_type: 'ETF azionario',
      total_annual_fees: '0,20% (TER)',
      currency: 'EUR',
      issuer: 'iShares (BlackRock)',
      segment: 'ETFplus',
      dividend_policy: 'ad accumulazione',
      data_source: 'borsaitaliana',
      fetched_at: 1_780_000_000,
    })
    .run();
}

async function fetchDetail(app: App, portfolioId: number | string, isin: string) {
  return app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/${isin}/detail` });
}

describe('GET /api/portfolios/:id/positions/:isin/detail', () => {
  it('anagrafica completa in cache → tutti i campi valorizzati con la fonte corretta', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Anagrafica Completa');
    await addPosition(app, portfolioId, ISIN, '2021-09-19', 61.40, 80);
    insertSecurityCompleta(ISIN);

    const res = await fetchDetail(app, portfolioId, ISIN);

    expect(res.statusCode).toBe(200);
    const detail = res.json<PositionDetail>();
    expect(detail.isin).toBe(ISIN);
    expect(detail.name).toBe('iShares Core MSCI World UCITS ETF');
    expect(detail.ticker).toBe('SWDA');
    expect(detail.instrumentType).toBe('ETF azionario');
    expect(detail.totalAnnualFees).toBe('0,20% (TER)');
    expect(detail.currency).toBe('EUR');
    expect(detail.issuer).toBe('iShares (BlackRock)');
    expect(detail.segment).toBe('ETFplus');
    expect(detail.dividendPolicy).toBe('ad accumulazione');
    expect(detail.dataSource).toBe('borsaitaliana');
    expect(detail.fetchedAt).toBe(1_780_000_000);

    // Posizione: 80 quote a 61,40 → carico 4.912,00; valore 128,46 × 80 = 10.276,80
    expect(detail.totalQuantity).toBe(80);
    expect(detail.avgLoadPrice).toBeCloseTo(61.40, 4);
    expect(detail.totalLoadValue).toBeCloseTo(4912.00, 2);
    expect(detail.currentPrice).toBeCloseTo(128.46, 4);
    expect(detail.currentValue).toBeCloseTo(10276.80, 2);
    expect(detail.difference).toBeCloseTo(5364.80, 2);
    expect(detail.differencePercent).toBeCloseTo(109.2183, 3);
  });

  it('ISIN senza riga in cache → anagrafica, valori correnti e fonte tutti null', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Senza Anagrafica');
    await addPosition(app, portfolioId, ISIN, '2026-05-03', 242.50, 40);

    const res = await fetchDetail(app, portfolioId, ISIN);

    expect(res.statusCode).toBe(200);
    const detail = res.json<PositionDetail>();

    // Nessun campo anagrafico inventato, nessuna fonte presunta.
    expect(detail.name).toBeNull();
    expect(detail.ticker).toBeNull();
    expect(detail.instrumentType).toBeNull();
    expect(detail.totalAnnualFees).toBeNull();
    expect(detail.currency).toBeNull();
    expect(detail.issuer).toBeNull();
    expect(detail.segment).toBeNull();
    expect(detail.dividendPolicy).toBeNull();
    expect(detail.dataSource).toBeNull();
    expect(detail.fetchedAt).toBeNull();

    // Valori correnti non calcolabili: null, non zero.
    expect(detail.currentPrice).toBeNull();
    expect(detail.currentValue).toBeNull();
    expect(detail.difference).toBeNull();
    expect(detail.differencePercent).toBeNull();

    // I dati di posizione derivano dai soli carichi e restano valorizzati.
    expect(detail.totalQuantity).toBe(40);
    expect(detail.avgLoadPrice).toBeCloseTo(242.50, 4);
    expect(detail.totalLoadValue).toBeCloseTo(9700.00, 2);
    expect(detail.loads).toHaveLength(1);
  });

  it('riga in cache senza provenienza registrata → dataSource null, non borsaitaliana', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Fonte Ignota');
    await addPosition(app, portfolioId, ISIN, '2026-01-15', 100.00, 10);
    testDb
      .insert(schema.securities)
      .values({ isin: ISIN, name: 'Titolo di provenienza ignota', price: 110.00, fetched_at: 1_780_000_000 })
      .run();

    const res = await fetchDetail(app, portfolioId, ISIN);

    expect(res.statusCode).toBe(200);
    const detail = res.json<PositionDetail>();
    expect(detail.name).toBe('Titolo di provenienza ignota');
    expect(detail.currentPrice).toBeCloseTo(110.00, 4);
    expect(detail.dataSource).toBeNull();
  });

  it('carichi multipli → media ponderata corretta e loads completo, ordinato per data', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Carichi Multipli');
    // Inseriti fuori ordine cronologico: l'ordinamento è responsabilità dell'endpoint.
    await addPosition(app, portfolioId, ISIN, '2025-02-14', 76.10, 50);
    await addPosition(app, portfolioId, ISIN, '2021-09-19', 61.40, 80);
    await addPosition(app, portfolioId, ISIN, '2023-03-07', 70.10, 90);
    insertSecurityCompleta(ISIN);

    const res = await fetchDetail(app, portfolioId, ISIN);

    expect(res.statusCode).toBe(200);
    const detail = res.json<PositionDetail>();

    // 61,40×80 + 70,10×90 + 76,10×50 = 4912 + 6309 + 3805 = 15.026 su 220 quote
    expect(detail.totalQuantity).toBe(220);
    expect(detail.avgLoadPrice).toBeCloseTo(68.30, 4);
    expect(detail.totalLoadValue).toBeCloseTo(15026.00, 2);
    // 128,46 × 220 = 28.261,20 → differenza 13.235,20
    expect(detail.currentValue).toBeCloseTo(28261.20, 2);
    expect(detail.difference).toBeCloseTo(13235.20, 2);
    expect(detail.differencePercent).toBeCloseTo(88.0821, 3);

    expect(detail.loads).toHaveLength(3);
    expect(detail.loads.map((l) => l.loadDate)).toEqual(['2021-09-19', '2023-03-07', '2025-02-14']);
    expect(detail.loads.map((l) => l.quantity)).toEqual([80, 90, 50]);
    expect(detail.loads.map((l) => l.loadPrice)).toEqual([61.40, 70.10, 76.10]);
    expect(detail.loads.every((l) => l.isin === ISIN)).toBe(true);
  });

  it('carichi multipli → differenza e percentuale pinnate al bit, non solo «vicine»', async () => {
    // US-038 ha estratto questa aritmetica dal gestore a una funzione pura
    // (`calcolaPnlDaCarico`), e la stessa formula alimenta ora anche il riquadro
    // del P&L sotto il grafico. Il rischio dell'estrazione non è che la rotta
    // smetta di rispondere: è che un decimale si sposti — una media riassociata,
    // un prodotto raccolto — e che nessuno se ne accorga, perché ogni altra
    // asserzione di questo file usa `toBeCloseTo`, che a un centesimo di
    // scostamento è cieca per costruzione. Qui i valori sono fissati con `toBe`
    // sui bit esatti che il percorso produce oggi, su tre carichi a prezzi **e
    // quantità** diversi (l'unico caso in cui una media ponderata si distingue
    // da una aritmetica).
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Pnl Pinnato');
    // Le date fissano l'ordine di somma: l'endpoint aggrega per `load_date`, e
    // in virgola mobile l'ordine degli addendi fa parte del risultato.
    await addPosition(app, portfolioId, ISIN, '2021-09-19', 85.31, 53);
    await addPosition(app, portfolioId, ISIN, '2023-03-07', 282.61, 103);
    await addPosition(app, portfolioId, ISIN, '2025-02-14', 167.86, 37);
    insertSecurityCompleta(ISIN); // prezzo corrente 128,46

    const res = await fetchDetail(app, portfolioId, ISIN);

    expect(res.statusCode).toBe(200);
    const detail = res.json<PositionDetail>();

    // 85,31×53 + 282,61×103 + 167,86×37 = 4.521,43 + 29.108,83 + 6.210,82 =
    // 39.841,08 su 193 quote → media ponderata 206,4304663…
    expect(detail.totalQuantity).toBe(193);
    expect(detail.avgLoadPrice).toBe(206.43046632124353);
    expect(detail.totalLoadValue).toBe(39841.08);
    // 128,46 × 193 = 24.792,78 → differenza −15.048,30, cioè −37,77 %
    expect(detail.currentValue).toBe(24792.780000000002);
    expect(detail.difference).toBe(-15048.3);
    expect(detail.differencePercent).toBe(-37.770813441804286);

    // La media aritmetica dei tre prezzi varrebbe 178,59: la riga sopra è
    // l'unica che distingua le due formule su questi carichi.
    expect(detail.avgLoadPrice).not.toBeCloseTo((85.31 + 282.61 + 167.86) / 3, 2);
  });

  it('prezzo corrente sotto il carico → differenza negativa con percentuale coerente', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto In Perdita');
    await addPosition(app, portfolioId, ISIN, '2026-01-15', 200.00, 10);
    testDb
      .insert(schema.securities)
      .values({ isin: ISIN, name: 'Titolo in perdita', price: 150.00, data_source: 'morningstar', fetched_at: 1_780_000_000 })
      .run();

    const res = await fetchDetail(app, portfolioId, ISIN);

    expect(res.statusCode).toBe(200);
    const detail = res.json<PositionDetail>();
    // carico 2.000,00; valore 1.500,00 → differenza −500,00 = −25%
    expect(detail.totalLoadValue).toBeCloseTo(2000.00, 2);
    expect(detail.currentValue).toBeCloseTo(1500.00, 2);
    expect(detail.difference).toBeCloseTo(-500.00, 2);
    expect(detail.differencePercent).toBeCloseTo(-25.00, 4);
    expect(detail.dataSource).toBe('morningstar');
  });

  it('i carichi di altri ISIN e di altri portafogli non entrano nel dettaglio', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Interrogato');
    const altroPortafoglio = await createPortfolio(app, 'Conto Estraneo');
    await addPosition(app, portfolioId, ISIN, '2026-01-15', 100.00, 10);
    await addPosition(app, portfolioId, ISIN_ESTRANEO, '2026-01-15', 50.00, 99);
    await addPosition(app, altroPortafoglio, ISIN, '2026-01-15', 500.00, 77);

    const res = await fetchDetail(app, portfolioId, ISIN);

    expect(res.statusCode).toBe(200);
    const detail = res.json<PositionDetail>();
    expect(detail.loads).toHaveLength(1);
    expect(detail.totalQuantity).toBe(10);
    expect(detail.avgLoadPrice).toBeCloseTo(100.00, 4);
  });

  it('ISIN in minuscolo → normalizzato, il dettaglio è quello del titolo iscritto', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Isin Minuscolo');
    await addPosition(app, portfolioId, ISIN, '2026-01-15', 100.00, 10);

    const res = await fetchDetail(app, portfolioId, ISIN.toLowerCase());

    expect(res.statusCode).toBe(200);
    expect(res.json<PositionDetail>().isin).toBe(ISIN);
  });

  it('ISIN valido ma non iscritto al portafoglio → 404', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Senza Quel Titolo');
    await addPosition(app, portfolioId, ISIN, '2026-01-15', 100.00, 10);

    const res = await fetchDetail(app, portfolioId, ISIN_ESTRANEO);

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non presente/i);
  });

  it('ISIN malformato → 400', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Isin Malformato');

    const res = await fetchDetail(app, portfolioId, 'NONVALIDO');

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/ISIN/i);
  });

  it('portafoglio inesistente → 404', async () => {
    const app = await buildApp();

    const res = await fetchDetail(app, 99999, ISIN);

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/portafoglio non trovato/i);
  });

  it('id di portafoglio non numerico → 404', async () => {
    const app = await buildApp();

    const res = await fetchDetail(app, 'abc', ISIN);

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/portafoglio non trovato/i);
  });
});

// ---------------------------------------------------------------------------
// I campi del P&L (US-043): realizedPnl, latentPnl, totalPnl, totalLoadCost.
// ---------------------------------------------------------------------------

function vendi(app: App, portfolioId: number, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/portfolios/${portfolioId}/sales`, payload });
}

describe('GET /api/portfolios/:id/positions/:isin/detail — i campi del P&L (US-043)', () => {
  it('un ISIN senza vendite riporta realizedPnl 0 e latentPnl identico a difference', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Dettaglio Senza Vendite Pnl');
    await addPosition(app, portfolioId, ISIN_LIFO, '2023-04-12', 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, '2025-02-07', 11.5, 400);
    insertSecurityCompleta(ISIN_LIFO);

    const detail = (await fetchDetail(app, portfolioId, ISIN_LIFO)).json<PositionDetail>();

    expect(detail.realizedPnl).toBe(0);
    expect(detail.latentPnl).toBeCloseTo(detail.difference ?? NaN, 8);
    expect(detail.totalPnl).toBeCloseTo(detail.realizedPnl + (detail.latentPnl ?? NaN), 8);
    // Nessuna regressione sui campi già fissati da US-042/US-038.
    expect(detail.totalQuantity).toBe(1000);
    expect(detail.avgLoadPrice).toBeCloseTo((9.8 * 600 + 11.5 * 400) / 1000, 8);
  });

  it('dopo una vendita di 400 quote a 12,50 il realizzato e il totale sono coerenti col dominio', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Dettaglio Con Vendita Pnl');
    await addPosition(app, portfolioId, ISIN_LIFO, '2023-04-12', 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, '2025-02-07', 11.5, 400);
    testDb
      .insert(schema.securities)
      .values({ isin: ISIN_LIFO, name: 'Vanguard FTSE All-World UCITS ETF Acc', price: 12.5 })
      .run();
    const venditaRes = await vendi(app, portfolioId, {
      isin: ISIN_LIFO,
      sale_date: '2026-06-03',
      sale_price: 12.5,
      quantity: 400,
    });
    expect(venditaRes.statusCode).toBe(201);

    const detail = (await fetchDetail(app, portfolioId, ISIN_LIFO)).json<PositionDetail>();

    expect(detail.totalQuantity).toBe(600);
    expect(detail.realizedPnl).toBeCloseTo(400, 8);
    expect(detail.latentPnl).toBeCloseTo(12.5 * 600 - 9.8 * 600, 8);
    expect(detail.totalPnl).toBeCloseTo(detail.realizedPnl + (detail.latentPnl ?? NaN), 8);
    // Criterio 5: costo di tutti i carichi, lotti venduti inclusi — 4.600 + 5.880.
    expect(detail.totalLoadCost).toBeCloseTo(9.8 * 600 + 11.5 * 400, 8);
  });

  it('una vendita totale porta il latente a zero misurato anche senza prezzo corrente', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Dettaglio Venduto Per Intero');
    await addPosition(app, portfolioId, ISIN_LIFO, '2023-04-12', 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, '2025-02-07', 11.5, 400);
    const venditaRes = await vendi(app, portfolioId, {
      isin: ISIN_LIFO,
      sale_date: '2026-06-03',
      sale_price: 12.5,
      quantity: 1000,
    });
    expect(venditaRes.statusCode).toBe(201);

    const detail = (await fetchDetail(app, portfolioId, ISIN_LIFO)).json<PositionDetail>();

    expect(detail.totalQuantity).toBe(0);
    expect(detail.avgLoadPrice).toBeNull();
    expect(detail.currentPrice).toBeNull();
    expect(detail.latentPnl).toBe(0);
    expect(detail.totalPnl).toBe(detail.realizedPnl);
    // US-044: soldRevenue coerente con l'incasso reale della vendita che
    // azzera il residuo, e il realizzato resta quello di sempre.
    expect(detail.soldRevenue).toBeCloseTo(1000 * 12.5, 8);
    expect(detail.realizedPnl).toBeCloseTo(1000 * 12.5 - (9.8 * 600 + 11.5 * 400), 8);
  });

  it('un ISIN senza vendite riporta soldRevenue 0 (US-044)', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Dettaglio Senza Vendite Ricavo');
    await addPosition(app, portfolioId, ISIN_LIFO, '2023-04-12', 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, '2025-02-07', 11.5, 400);
    insertSecurityCompleta(ISIN_LIFO);

    const detail = (await fetchDetail(app, portfolioId, ISIN_LIFO)).json<PositionDetail>();

    expect(detail.soldRevenue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// L'elenco delle vendite in detail.sales (US-045): saleDate/quantity/salePrice
// coerenti con le vendite iscritte, ordinate per data crescente.
// ---------------------------------------------------------------------------

describe('GET /api/portfolios/:id/positions/:isin/detail — le vendite in detail.sales (US-045)', () => {
  it('le vendite iscritte compaiono in detail.sales con saleDate/quantity/salePrice, ordinate per data crescente', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Dettaglio Vendite Elenco');
    await addPosition(app, portfolioId, ISIN_LIFO, '2023-04-12', 9.8, 600);
    await addPosition(app, portfolioId, ISIN_LIFO, '2025-02-07', 11.5, 400);

    // Iscritte fuori ordine cronologico: l'ordinamento in risposta è
    // responsabilità dell'endpoint, non dell'ordine di inserimento.
    const venditaRecente = await vendi(app, portfolioId, {
      isin: ISIN_LIFO,
      sale_date: '2026-06-10',
      sale_price: 12.5,
      quantity: 100,
    });
    expect(venditaRecente.statusCode).toBe(201);
    const venditaAntica = await vendi(app, portfolioId, {
      isin: ISIN_LIFO,
      sale_date: '2026-01-05',
      sale_price: 11.9,
      quantity: 50,
    });
    expect(venditaAntica.statusCode).toBe(201);

    const detail = (await fetchDetail(app, portfolioId, ISIN_LIFO)).json<PositionDetail>();

    expect(detail.sales).toHaveLength(2);
    expect(detail.sales.map((s) => s.saleDate)).toEqual(['2026-01-05', '2026-06-10']);
    expect(detail.sales.map((s) => s.quantity)).toEqual([50, 100]);
    expect(detail.sales.map((s) => s.salePrice)).toEqual([11.9, 12.5]);
    expect(detail.sales.every((s) => s.isin === ISIN_LIFO)).toBe(true);
  });

  it('un ISIN con carichi ma senza vendite riporta sales: []', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Conto Dettaglio Senza Vendite Elenco');
    await addPosition(app, portfolioId, ISIN_LIFO, '2023-04-12', 9.8, 600);
    insertSecurityCompleta(ISIN_LIFO);

    const detail = (await fetchDetail(app, portfolioId, ISIN_LIFO)).json<PositionDetail>();

    expect(detail.sales).toEqual([]);
  });
});
