/**
 * US-013: Test di integrazione per PATCH e DELETE delle posizioni.
 *
 * Copre:
 *  - PATCH /api/portfolios/:portfolioId/positions/:positionId
 *  - DELETE /api/portfolios/:portfolioId/positions/:positionId
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
import type { Position, PositionSummary } from '@portfolia/shared';

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

// positionsRoutes va importata DOPO il mock
const { positionsRoutes } = await import('../src/api/positions.js');

// ---------------------------------------------------------------------------
// buildApp — crea un db SQLite temporaneo per ogni test e registra le route
// ---------------------------------------------------------------------------

async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-edit-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

  await positionsRoutes(fastify);
  await fastify.ready();
  return fastify;
}

/** Helper: crea un portafoglio e restituisce l'id. */
async function createPortfolio(app: Awaited<ReturnType<typeof buildApp>>, name: string): Promise<number> {
  const res = await app.inject({ method: 'POST', url: '/api/portfolios', payload: { name } });
  return res.json<{ id: number }>().id;
}

/** Helper: crea una posizione e restituisce la Position. */
async function createPosition(
  app: Awaited<ReturnType<typeof buildApp>>,
  portfolioId: number,
  overrides: {
    isin?: string;
    load_date?: string;
    load_price?: number;
    quantity?: number;
  } = {}
): Promise<Position> {
  const payload = {
    isin: overrides.isin ?? 'IE00B4L5Y983',
    load_date: overrides.load_date ?? '2026-03-15',
    load_price: overrides.load_price ?? 89.42,
    quantity: overrides.quantity ?? 40,
  };
  const res = await app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/positions`,
    payload,
  });
  return res.json<Position>();
}

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

// ---------------------------------------------------------------------------
// PATCH /api/portfolios/:portfolioId/positions/:positionId
// ---------------------------------------------------------------------------

describe('PATCH /api/portfolios/:portfolioId/positions/:positionId', () => {
  it('200 modifica load_price — restituisce posizione aggiornata', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH prezzo');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { load_price: 99.99 },
    });

    expect(res.statusCode).toBe(200);
    const updated = res.json<Position>();
    expect(updated.id).toBe(pos.id);
    expect(updated.loadPrice).toBe(99.99);
    expect(updated.quantity).toBe(pos.quantity);
    expect(updated.loadDate).toBe(pos.loadDate);
  });

  it('200 modifica quantity — restituisce posizione aggiornata', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH qty');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { quantity: 100 },
    });

    expect(res.statusCode).toBe(200);
    const updated = res.json<Position>();
    expect(updated.quantity).toBe(100);
    expect(updated.loadPrice).toBe(pos.loadPrice);
  });

  it('200 modifica load_date — restituisce posizione aggiornata', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH data');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { load_date: '2026-06-01' },
    });

    expect(res.statusCode).toBe(200);
    const updated = res.json<Position>();
    expect(updated.loadDate).toBe('2026-06-01');
  });

  it('200 modifica più campi insieme', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH multi');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { load_price: 50.0, quantity: 200, load_date: '2026-01-01' },
    });

    expect(res.statusCode).toBe(200);
    const updated = res.json<Position>();
    expect(updated.loadPrice).toBe(50.0);
    expect(updated.quantity).toBe(200);
    expect(updated.loadDate).toBe('2026-01-01');
  });

  it('400 body vuoto — nessun campo da aggiornare', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH vuoto');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/campo/i);
  });

  it('400 load_date formato errato', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH data formato');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { load_date: '15/03/2026' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/data/i);
  });

  it('404 position di un altro portafoglio — PATCH isolata correttamente', async () => {
    const app = await buildApp();
    const pid1 = await createPortfolio(app, 'Test PATCH cross 1');
    const pid2 = await createPortfolio(app, 'Test PATCH cross 2');
    const pos = await createPosition(app, pid1);

    // Tenta di modificare la position di pid1 usando pid2
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid2}/positions/${pos.id}`,
      payload: { quantity: 999 },
    });

    expect(res.statusCode).toBe(404);
  });

  it('400 load_price non positivo (zero)', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH prezzo zero');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { load_price: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/prezzo/i);
  });

  it('400 load_price negativo', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH prezzo neg');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { load_price: -10 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/prezzo/i);
  });

  it('400 quantity decimale', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH qty dec');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
      payload: { quantity: 10.5 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/quantità/i);
  });

  it('404 position non trovata', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH 404 pos');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/99999`,
      payload: { quantity: 10 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovat/i);
  });

  it('404 portafoglio non trovato', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/portfolios/99999/positions/1',
      payload: { quantity: 10 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });

  it('summary aggiornato dopo PATCH quantity', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test PATCH summary');
    // due carichi stesso ISIN: 40@89 + 60@91 → avg=90.2
    await createPosition(app, pid, { quantity: 40, load_price: 89 });
    const pos2 = await createPosition(app, pid, { quantity: 60, load_price: 91 });

    // Modifica il secondo carico: quantity da 60 → 100
    await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${pid}/positions/${pos2.id}`,
      payload: { quantity: 100 },
    });

    // Summary: qty totale = 40+100 = 140, avg = (89*40 + 91*100)/140 ≈ 90.571...
    const summaryRes = await app.inject({ method: 'GET', url: `/api/portfolios/${pid}/positions/summary` });
    expect(summaryRes.statusCode).toBe(200);
    const summaries = summaryRes.json<PositionSummary[]>();
    const s = summaries.find((x) => x.isin === 'IE00B4L5Y983');
    expect(s).toBeDefined();
    expect(s!.totalQuantity).toBe(140);
    expect(s!.avgLoadPrice).toBeCloseTo((89 * 40 + 91 * 100) / 140, 4);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/portfolios/:portfolioId/positions/:positionId
// ---------------------------------------------------------------------------

describe('DELETE /api/portfolios/:portfolioId/positions/:positionId', () => {
  it('204 cancellazione ok', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test DELETE ok');
    const pos = await createPosition(app, pid);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/portfolios/${pid}/positions/${pos.id}`,
    });

    expect(res.statusCode).toBe(204);
  });

  it('dopo DELETE la position non è più restituita da GET positions', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test DELETE verifica');
    const pos = await createPosition(app, pid);

    await app.inject({ method: 'DELETE', url: `/api/portfolios/${pid}/positions/${pos.id}` });

    const getRes = await app.inject({ method: 'GET', url: `/api/portfolios/${pid}/positions` });
    const list = getRes.json<Position[]>();
    expect(list.find((p) => p.id === pos.id)).toBeUndefined();
  });

  it('404 position non trovata', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test DELETE 404 pos');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/portfolios/${pid}/positions/99999`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovat/i);
  });

  it('404 portafoglio non trovato', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/portfolios/99999/positions/1',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });

  it('404 position di un altro portafoglio', async () => {
    const app = await buildApp();
    const pid1 = await createPortfolio(app, 'Test DELETE cross 1');
    const pid2 = await createPortfolio(app, 'Test DELETE cross 2');
    const pos = await createPosition(app, pid1);

    // Tenta di eliminare la position di pid1 usando pid2
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/portfolios/${pid2}/positions/${pos.id}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('summary esclude la posizione rimossa dopo DELETE', async () => {
    const app = await buildApp();
    const pid = await createPortfolio(app, 'Test DELETE summary');
    // due carichi: 40@89 + 60@91
    const pos1 = await createPosition(app, pid, { quantity: 40, load_price: 89 });
    await createPosition(app, pid, { quantity: 60, load_price: 91 });

    // Elimina il primo carico
    await app.inject({ method: 'DELETE', url: `/api/portfolios/${pid}/positions/${pos1.id}` });

    // Summary: solo secondo carico resta: qty=60, avg=91
    const summaryRes = await app.inject({ method: 'GET', url: `/api/portfolios/${pid}/positions/summary` });
    const summaries = summaryRes.json<PositionSummary[]>();
    const s = summaries.find((x) => x.isin === 'IE00B4L5Y983');
    expect(s).toBeDefined();
    expect(s!.totalQuantity).toBe(60);
    expect(s!.avgLoadPrice).toBeCloseTo(91, 4);
  });
});
