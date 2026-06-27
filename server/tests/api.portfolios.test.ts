import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Fastify from 'fastify';
import * as schema from '../src/db/schema.js';
import type { Portfolio } from '@portfolia/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

let testDbPath: string;
let conn: InstanceType<typeof Database>;

// Build a Fastify instance wired to a fresh test DB
async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-portfolios-${Date.now()}.db`);
  conn = new Database(testDbPath);
  const db = drizzle(conn, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const fastify = Fastify();

  fastify.get('/api/portfolios', async () => {
    return db.select().from(schema.portfolios).all();
  });

  fastify.post<{ Body: { name?: string } }>('/api/portfolios', async (req, reply) => {
    const { name } = req.body ?? {};
    if (!name || name.trim() === '') {
      return reply.status(400).send({ error: 'Il nome del portafoglio non può essere vuoto.' });
    }
    try {
      const result = db.insert(schema.portfolios).values({ name: name.trim() }).returning().get();
      return reply.status(201).send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: `Esiste già un portafoglio con il nome "${name.trim()}".` });
      }
      throw err;
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/portfolios/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const { eq } = await import('drizzle-orm');
    const row = db.select().from(schema.portfolios).where(eq(schema.portfolios.id, id)).get();
    if (!row) return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    return row;
  });

  fastify.patch<{ Params: { id: string }; Body: { name?: string } }>('/api/portfolios/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const { eq } = await import('drizzle-orm');
    const existing = db.select().from(schema.portfolios).where(eq(schema.portfolios.id, id)).get();
    if (!existing) return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    const { name } = req.body ?? {};
    if (!name || name.trim() === '') {
      return reply.status(400).send({ error: 'Il nome del portafoglio non può essere vuoto.' });
    }
    try {
      const result = db.update(schema.portfolios).set({ name: name.trim() }).where(eq(schema.portfolios.id, id)).returning().get();
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: `Esiste già un portafoglio con il nome "${name.trim()}".` });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/api/portfolios/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const { eq } = await import('drizzle-orm');
    const existing = db.select().from(schema.portfolios).where(eq(schema.portfolios.id, id)).get();
    if (!existing) return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    db.delete(schema.portfolios).where(eq(schema.portfolios.id, id)).run();
    return { deleted: true };
  });

  await fastify.ready();
  return fastify;
}

afterEach(() => {
  conn?.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

describe('POST /api/portfolios', () => {
  it('nome valido → 201 con id e name', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portafoglio Test' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<Portfolio>();
    expect(body.id).toBeGreaterThan(0);
    expect(body.name).toBe('Portafoglio Test');
  });

  it('nome vuoto → 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/vuoto/i);
  });

  it('nome duplicato → 409', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Duplicato' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Duplicato' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toMatch(/già/i);
  });
});

describe('GET /api/portfolios', () => {
  it('restituisce array con i portafogli creati', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Alpha' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/portfolios' });
    expect(res.statusCode).toBe(200);
    const rows = res.json<Portfolio[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alpha');
  });

  it('restituisce array vuoto su DB pulito', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/portfolios' });
    expect(res.statusCode).toBe(200);
    expect(res.json<Portfolio[]>()).toHaveLength(0);
  });
});

describe('GET /api/portfolios/:id', () => {
  it('happy path: POST poi GET → 200 con dati corretti', async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portafoglio Alpha' },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<Portfolio>();

    const res = await app.inject({ method: 'GET', url: `/api/portfolios/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json<Portfolio>();
    expect(body.id).toBe(id);
    expect(body.name).toBe('Portafoglio Alpha');
  });

  it('ID inesistente → 404', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/portfolios/99999' });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });
});

describe('PATCH /api/portfolios/:id', () => {
  it('happy path: rinomina → 200 con nome aggiornato', async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Vecchio Nome' },
    });
    const { id } = created.json<Portfolio>();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${id}`,
      payload: { name: 'Nuovo Nome' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Portfolio>();
    expect(body.id).toBe(id);
    expect(body.name).toBe('Nuovo Nome');
  });

  it('nome vuoto → 400', async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Portafoglio' },
    });
    const { id } = created.json<Portfolio>();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${id}`,
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/vuoto/i);
  });

  it('ID inesistente → 404', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/portfolios/99999',
      payload: { name: 'Qualsiasi' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });

  it('nome duplicato → 409', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Alpha' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Beta' },
    });
    const { id } = created.json<Portfolio>();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/portfolios/${id}`,
      payload: { name: 'Alpha' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toMatch(/già/i);
  });
});

describe('DELETE /api/portfolios/:id', () => {
  it('happy path: elimina → 200 { deleted: true }', async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Da Eliminare' },
    });
    const { id } = created.json<Portfolio>();

    const res = await app.inject({ method: 'DELETE', url: `/api/portfolios/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ deleted: boolean }>().deleted).toBe(true);
  });

  it('ID inesistente → 404', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/portfolios/99999' });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/non trovato/i);
  });

  it('dopo DELETE il portafoglio non compare in GET /api/portfolios', async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/portfolios',
      payload: { name: 'Eliminabile' },
    });
    const { id } = created.json<Portfolio>();

    await app.inject({ method: 'DELETE', url: `/api/portfolios/${id}` });

    const list = await app.inject({ method: 'GET', url: '/api/portfolios' });
    expect(list.statusCode).toBe(200);
    const rows = list.json<Portfolio[]>();
    expect(rows.find((p) => p.id === id)).toBeUndefined();
  });
});
