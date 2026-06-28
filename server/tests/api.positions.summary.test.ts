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
import type { PositionSummary } from '@portfolia/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

// ---------------------------------------------------------------------------
// Sostituiamo il singleton db di server/src/db/index.ts con un'istanza di test
// controllata — stessa tecnica che permette a positionsRoutes di usare il db
// temporaneo anziché il file di produzione.
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

// positionsRoutes va importata DOPO il mock (import statico → hoisting gestito da vi.mock)
const { positionsRoutes } = await import('../src/api/positions.js');

// ---------------------------------------------------------------------------
// buildApp — crea un db SQLite temporaneo per ogni test e registra le route
// ---------------------------------------------------------------------------

async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-summary-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

  // Registriamo le route reali (POST positions + GET summary + GET positions)
  await fastify.register(positionsRoutes);

  await fastify.ready();
  return fastify;
}

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

// ---------------------------------------------------------------------------
// Helper per creare un portafoglio e aggiungere posizioni tramite inject
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

// ---------------------------------------------------------------------------
// GET /api/portfolios/:id/positions/summary
// ---------------------------------------------------------------------------

describe('GET /api/portfolios/:id/positions/summary', () => {
  it('portafoglio senza posizioni → risponde []', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Vuoto');

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/summary`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<PositionSummary[]>()).toEqual([]);
  });

  it('un carico singolo — avgLoadPrice, totalQuantity e totalLoadValue corretti', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Singolo');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/summary`,
    });

    expect(res.statusCode).toBe(200);
    const summaries = res.json<PositionSummary[]>();
    expect(summaries).toHaveLength(1);

    const s = summaries[0];
    expect(s.isin).toBe('IE00B4L5Y983');
    expect(s.totalQuantity).toBe(40);
    expect(s.avgLoadPrice).toBeCloseTo(89.00, 3);
    expect(s.totalLoadValue).toBeCloseTo(3560.00, 3);
  });

  it('due carichi stesso ISIN — media ponderata e totali corretti', async () => {
    // 89.00×40 + 91.00×60 = 3560 + 5460 = 9020 su 100 quote → avg = 90.20
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Doppio Carico');

    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 91.00, 60);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/summary`,
    });

    expect(res.statusCode).toBe(200);
    const summaries = res.json<PositionSummary[]>();
    expect(summaries).toHaveLength(1);

    const s = summaries[0];
    expect(s.isin).toBe('IE00B4L5Y983');
    expect(s.totalQuantity).toBe(100);
    expect(s.avgLoadPrice).toBeCloseTo(90.20, 3);
    expect(s.totalLoadValue).toBeCloseTo(9020.00, 3);
  });

  it('due ISIN diversi → due righe indipendenti ordinate per ISIN', async () => {
    const app = await buildApp();
    const portfolioId = await createPortfolio(app, 'Portfolio Due ISIN');

    // IE00B3RBWM25 viene prima di IE00B4L5Y983 in ordine alfabetico
    await addPosition(app, portfolioId, 'IE00B4L5Y983', 89.00, 40);
    await addPosition(app, portfolioId, 'IE00B3RBWM25', 115.20, 20);

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/summary`,
    });

    expect(res.statusCode).toBe(200);
    const summaries = res.json<PositionSummary[]>();
    expect(summaries).toHaveLength(2);

    // Ordine per ISIN: IE00B3RBWM25 < IE00B4L5Y983
    expect(summaries[0].isin).toBe('IE00B3RBWM25');
    expect(summaries[0].totalQuantity).toBe(20);
    expect(summaries[0].avgLoadPrice).toBeCloseTo(115.20, 3);
    expect(summaries[0].totalLoadValue).toBeCloseTo(2304.00, 3);

    expect(summaries[1].isin).toBe('IE00B4L5Y983');
    expect(summaries[1].totalQuantity).toBe(40);
    expect(summaries[1].avgLoadPrice).toBeCloseTo(89.00, 3);
    expect(summaries[1].totalLoadValue).toBeCloseTo(3560.00, 3);
  });

  it('404 portafoglio non trovato', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/portfolios/99999/positions/summary',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });
});
