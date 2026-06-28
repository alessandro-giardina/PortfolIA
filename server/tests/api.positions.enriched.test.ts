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

// ---------------------------------------------------------------------------
// buildApp — crea un db SQLite temporaneo per ogni test
// ---------------------------------------------------------------------------

async function buildApp() {
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

  await fastify.register(positionsRoutes);
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

function insertSecurity(isin: string, name: string | null, price: number | null) {
  testDb
    .insert(schema.securities)
    .values({ isin, name, price })
    .onConflictDoUpdate({
      target: schema.securities.isin,
      set: { name, price },
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
});
