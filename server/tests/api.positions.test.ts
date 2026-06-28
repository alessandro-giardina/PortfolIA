import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, desc } from 'drizzle-orm';
import Fastify from 'fastify';
import * as schema from '../src/db/schema.js';
import type { Position } from '@portfolia/shared';
import { isValidIsin, normalizeIsin } from '@portfolia/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let testDbPath: string;
let conn: InstanceType<typeof Database>;

function toPosition(row: typeof schema.positions.$inferSelect): Position {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    isin: row.isin,
    loadDate: row.load_date,
    loadPrice: row.load_price,
    quantity: row.quantity,
    createdAt: row.created_at,
  };
}

async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-positions-${Date.now()}.db`);
  conn = new Database(testDbPath);
  const db = drizzle(conn, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const fastify = Fastify();

  // POST /api/portfolios — helper per creare portafogli nei test
  fastify.post<{ Body: { name?: string } }>('/api/portfolios', async (req, reply) => {
    const { name } = req.body ?? {};
    if (!name || name.trim() === '') {
      return reply.status(400).send({ error: 'Il nome non può essere vuoto.' });
    }
    const result = db.insert(schema.portfolios).values({ name: name.trim() }).returning().get();
    return reply.status(201).send(result);
  });

  // POST /api/portfolios/:id/positions
  fastify.post<{ Params: { id: string }; Body: { isin?: unknown; load_date?: unknown; load_price?: unknown; quantity?: unknown } }>(
    '/api/portfolios/:id/positions',
    async (req, reply) => {
      const portfolioId = Number(req.params.id);
      if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      const portfolio = db.select().from(schema.portfolios).where(eq(schema.portfolios.id, portfolioId)).get();
      if (!portfolio) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      const body = req.body ?? {};

      // Validazione ISIN
      const rawIsin = typeof body.isin === 'string' ? body.isin : '';
      if (!rawIsin || !isValidIsin(rawIsin)) {
        return reply.status(400).send({ error: 'Inserire un codice ISIN valido (12 caratteri alfanumerici).' });
      }
      const isin = normalizeIsin(rawIsin);

      // Validazione load_date
      const loadDate = body.load_date;
      if (!loadDate || typeof loadDate !== 'string' || !ISO_DATE_RE.test(loadDate)) {
        return reply.status(400).send({ error: 'La data di carico è obbligatoria e deve essere nel formato YYYY-MM-DD.' });
      }

      // Validazione load_price
      const loadPrice = body.load_price;
      if (typeof loadPrice !== 'number' || !Number.isFinite(loadPrice) || loadPrice <= 0) {
        return reply.status(400).send({ error: 'Il prezzo di acquisto deve essere un valore positivo.' });
      }

      // Validazione quantity
      const quantity = body.quantity;
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
        return reply.status(400).send({ error: 'La quantità deve essere un intero positivo.' });
      }

      const row = db
        .insert(schema.positions)
        .values({ portfolio_id: portfolioId, isin, load_date: loadDate, load_price: loadPrice, quantity })
        .returning()
        .get();

      return reply.status(201).send(toPosition(row));
    }
  );

  // GET /api/portfolios/:id/positions
  fastify.get<{ Params: { id: string } }>(
    '/api/portfolios/:id/positions',
    async (req, reply) => {
      const portfolioId = Number(req.params.id);
      if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      const portfolio = db.select().from(schema.portfolios).where(eq(schema.portfolios.id, portfolioId)).get();
      if (!portfolio) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      const rows = db
        .select()
        .from(schema.positions)
        .where(eq(schema.positions.portfolio_id, portfolioId))
        .orderBy(desc(schema.positions.created_at))
        .all();

      return rows.map(toPosition);
    }
  );

  await fastify.ready();
  return fastify;
}

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

// ---------------------------------------------------------------------------
// POST /api/portfolios/:id/positions
// ---------------------------------------------------------------------------

describe('POST /api/portfolios/:id/positions', () => {
  it('201 carico valido — posizione persistita con i dati corretti', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Test Portfolio' },
    });
    const { id: portfolioId } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${portfolioId}/positions`,
      payload: {
        isin: 'IE00B4L5Y983',
        load_date: '2026-03-15',
        load_price: 89.42,
        quantity: 40,
      },
    });

    expect(res.statusCode).toBe(201);
    const position = res.json<Position>();
    expect(position.id).toBeTypeOf('number');
    expect(position.portfolioId).toBe(portfolioId);
    expect(position.isin).toBe('IE00B4L5Y983');
    expect(position.loadDate).toBe('2026-03-15');
    expect(position.loadPrice).toBe(89.42);
    expect(position.quantity).toBe(40);
    expect(position.createdAt).toBeTypeOf('number');
  });

  it('404 portafoglio non trovato', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/portfolios/99999/positions',
      payload: {
        isin: 'IE00B4L5Y983',
        load_date: '2026-03-15',
        load_price: 89.42,
        quantity: 40,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });

  it('400 ISIN malformato (troppo corto)', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio ISIN' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00BJ', load_date: '2026-03-15', load_price: 89.42, quantity: 40 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/ISIN/i);
  });

  it('400 ISIN assente', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio ISIN2' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { load_date: '2026-03-15', load_price: 89.42, quantity: 40 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/ISIN/i);
  });

  it('400 load_date assente', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Data' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B4L5Y983', load_price: 89.42, quantity: 40 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/data/i);
  });

  it('400 load_date formato errato (non YYYY-MM-DD)', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Data Formato' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B4L5Y983', load_date: '15/03/2026', load_price: 89.42, quantity: 40 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/data/i);
  });

  it('400 load_price = 0 (non positivo)', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Prezzo Zero' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B4L5Y983', load_date: '2026-03-15', load_price: 0, quantity: 40 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/prezzo/i);
  });

  it('400 load_price negativo', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Prezzo Negativo' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B4L5Y983', load_date: '2026-03-15', load_price: -5.5, quantity: 40 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/prezzo/i);
  });

  it('400 quantity = 0 (non positiva)', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Qty Zero' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B4L5Y983', load_date: '2026-03-15', load_price: 89.42, quantity: 0 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/quantit/i);
  });

  it('400 quantity non intera (decimale)', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Qty Decimale' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B4L5Y983', load_date: '2026-03-15', load_price: 89.42, quantity: 2.5 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/quantit/i);
  });

  it('ISIN è normalizzato prima del salvataggio (lowercase → uppercase)', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Normalize' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: {
        isin: 'ie00b4l5y983',
        load_date: '2026-03-15',
        load_price: 89.42,
        quantity: 40,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<Position>().isin).toBe('IE00B4L5Y983');
  });
});

// ---------------------------------------------------------------------------
// GET /api/portfolios/:id/positions
// ---------------------------------------------------------------------------

describe('GET /api/portfolios/:id/positions', () => {
  it('lista vuota per un portafoglio senza posizioni', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Vuoto' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    const res = await app.inject({ method: 'GET', url: `/api/portfolios/${id}/positions` });
    expect(res.statusCode).toBe(200);
    expect(res.json<Position[]>()).toEqual([]);
  });

  it('lista con posizioni dopo POST', async () => {
    const app = await buildApp();
    const portfolioRes = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portfolio Con Posizioni' },
    });
    const { id } = portfolioRes.json<{ id: number }>();

    await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B4L5Y983', load_date: '2026-03-15', load_price: 89.42, quantity: 40 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/portfolios/${id}/positions`,
      payload: { isin: 'IE00B3RBWM25', load_date: '2026-06-01', load_price: 115.20, quantity: 20 },
    });

    const res = await app.inject({ method: 'GET', url: `/api/portfolios/${id}/positions` });
    expect(res.statusCode).toBe(200);
    const positionsList = res.json<Position[]>();
    expect(positionsList).toHaveLength(2);
    const isins = positionsList.map((p) => p.isin);
    expect(isins).toContain('IE00B4L5Y983');
    expect(isins).toContain('IE00B3RBWM25');
  });

  it('404 portafoglio non trovato', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/portfolios/99999/positions' });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });
});
