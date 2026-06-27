import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { portfolios } from '../db/schema.js';
import type { Portfolio, CreatePortfolioRequest, UpdatePortfolioRequest } from '@portfolia/shared';

export async function portfoliosRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Reply: Portfolio[] }>('/api/portfolios', async () => {
    const rows = db.select().from(portfolios).all();
    return rows as Portfolio[];
  });

  fastify.get<{ Params: { id: string }; Reply: Portfolio | { error: string } }>(
    '/api/portfolios/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }
      const row = db.select().from(portfolios).where(eq(portfolios.id, id)).get();
      if (!row) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }
      return row as Portfolio;
    }
  );

  fastify.post<{ Body: CreatePortfolioRequest; Reply: Portfolio | { error: string } }>(
    '/api/portfolios',
    async (request, reply) => {
      const { name } = request.body ?? {};

      if (!name || name.trim() === '') {
        return reply.status(400).send({ error: 'Il nome del portafoglio non può essere vuoto.' });
      }

      try {
        const result = db
          .insert(portfolios)
          .values({ name: name.trim() })
          .returning()
          .get();
        return reply.status(201).send(result as Portfolio);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE constraint failed')) {
          return reply.status(409).send({ error: `Esiste già un portafoglio con il nome "${name.trim()}".` });
        }
        throw err;
      }
    }
  );

  fastify.patch<{ Params: { id: string }; Body: UpdatePortfolioRequest; Reply: Portfolio | { error: string } }>(
    '/api/portfolios/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      const existing = db.select().from(portfolios).where(eq(portfolios.id, id)).get();
      if (!existing) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      const { name } = request.body ?? {};
      if (!name || name.trim() === '') {
        return reply.status(400).send({ error: 'Il nome del portafoglio non può essere vuoto.' });
      }

      try {
        const result = db
          .update(portfolios)
          .set({ name: name.trim() })
          .where(eq(portfolios.id, id))
          .returning()
          .get();
        return result as Portfolio;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE constraint failed')) {
          return reply.status(409).send({ error: `Esiste già un portafoglio con il nome "${name.trim()}".` });
        }
        throw err;
      }
    }
  );

  fastify.delete<{ Params: { id: string }; Reply: { deleted: boolean } | { error: string } }>(
    '/api/portfolios/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      const existing = db.select().from(portfolios).where(eq(portfolios.id, id)).get();
      if (!existing) {
        return reply.status(404).send({ error: 'Portafoglio non trovato.' });
      }

      db.delete(portfolios).where(eq(portfolios.id, id)).run();
      return { deleted: true };
    }
  );
}
