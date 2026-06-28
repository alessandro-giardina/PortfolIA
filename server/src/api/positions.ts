import type { FastifyInstance } from 'fastify';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { portfolios, positions } from '../db/schema.js';
import type { Position, CreatePositionRequest, UpdatePositionRequest, PositionSummary } from '@portfolia/shared';
import { isValidIsin, normalizeIsin } from '@portfolia/shared';

/** Mappa una PositionRow Drizzle nell'interfaccia condivisa Position. */
function toPosition(row: typeof positions.$inferSelect): Position {
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

/** RegExp formato data ISO-8601 YYYY-MM-DD */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function positionsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/portfolios/:id/positions
   * Crea una nuova posizione (carico titolo) nel portafoglio specificato.
   */
  fastify.post<{
    Params: { id: string };
    Body: CreatePositionRequest;
    Reply: Position | { error: string };
  }>('/api/portfolios/:id/positions', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const body = request.body ?? {};

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
      .insert(positions)
      .values({
        portfolio_id: portfolioId,
        isin,
        load_date: loadDate,
        load_price: loadPrice,
        quantity,
      })
      .returning()
      .get();

    return reply.status(201).send(toPosition(row));
  });

  /**
   * GET /api/portfolios/:id/positions/summary
   * Restituisce la vista aggregata per ISIN: totalQuantity, avgLoadPrice (media
   * ponderata sulle quantità), totalLoadValue. Ordinata per ISIN.
   * Deve essere registrata PRIMA di GET /positions per evitare conflitti di routing.
   */
  fastify.get<{
    Params: { id: string };
    Reply: PositionSummary[] | { error: string };
  }>('/api/portfolios/:id/positions/summary', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Aggregazione per ISIN con media ponderata
    const rows = db
      .select({
        isin: positions.isin,
        totalQuantity: sql<number>`SUM(${positions.quantity})`,
        weightedSum: sql<number>`SUM(${positions.load_price} * ${positions.quantity})`,
      })
      .from(positions)
      .where(eq(positions.portfolio_id, portfolioId))
      .groupBy(positions.isin)
      .orderBy(positions.isin)
      .all();

    const summaries: PositionSummary[] = rows.map((row) => {
      const avgLoadPrice = row.totalQuantity > 0 ? row.weightedSum / row.totalQuantity : 0;
      return {
        isin: row.isin,
        totalQuantity: row.totalQuantity,
        avgLoadPrice,
        totalLoadValue: avgLoadPrice * row.totalQuantity,
      };
    });

    return summaries;
  });

  /**
   * PATCH /api/portfolios/:portfolioId/positions/:positionId
   * Modifica parzialmente una posizione (carico) esistente.
   * Aggiorna solo i campi presenti nel body (load_date, load_price, quantity).
   * Restituisce la Position aggiornata (200) o 404.
   */
  fastify.patch<{
    Params: { portfolioId: string; positionId: string };
    Body: UpdatePositionRequest;
    Reply: Position | { error: string };
  }>('/api/portfolios/:portfolioId/positions/:positionId', async (request, reply) => {
    const portfolioId = Number(request.params.portfolioId);
    const positionId = Number(request.params.positionId);

    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }
    if (!Number.isInteger(positionId) || positionId <= 0) {
      return reply.status(404).send({ error: 'Posizione non trovata.' });
    }

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Verifica esistenza posizione e appartenenza al portafoglio
    const existing = db
      .select()
      .from(positions)
      .where(and(eq(positions.id, positionId), eq(positions.portfolio_id, portfolioId)))
      .get();
    if (!existing) {
      return reply.status(404).send({ error: 'Posizione non trovata.' });
    }

    const body = request.body ?? {};

    // Validazione campi opzionali
    const updates: Partial<typeof positions.$inferInsert> = {};

    if ('load_date' in body) {
      const loadDate = body.load_date;
      if (!loadDate || typeof loadDate !== 'string' || !ISO_DATE_RE.test(loadDate)) {
        return reply.status(400).send({ error: 'La data di carico è obbligatoria e deve essere nel formato YYYY-MM-DD.' });
      }
      updates.load_date = loadDate;
    }

    if ('load_price' in body) {
      const loadPrice = body.load_price;
      if (typeof loadPrice !== 'number' || !Number.isFinite(loadPrice) || loadPrice <= 0) {
        return reply.status(400).send({ error: 'Il prezzo di acquisto deve essere un valore positivo.' });
      }
      updates.load_price = loadPrice;
    }

    if ('quantity' in body) {
      const quantity = body.quantity;
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
        return reply.status(400).send({ error: 'La quantità deve essere un intero positivo.' });
      }
      updates.quantity = quantity;
    }

    // Body vuoto (nessun campo da aggiornare)
    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'Nessun campo da aggiornare fornito.' });
    }

    const updated = db
      .update(positions)
      .set(updates)
      .where(and(eq(positions.id, positionId), eq(positions.portfolio_id, portfolioId)))
      .returning()
      .get();

    return reply.status(200).send(toPosition(updated));
  });

  /**
   * DELETE /api/portfolios/:portfolioId/positions/:positionId
   * Elimina una posizione (carico) esistente dal portafoglio.
   * Restituisce 204 No Content o 404.
   */
  fastify.delete<{
    Params: { portfolioId: string; positionId: string };
    Reply: void | { error: string };
  }>('/api/portfolios/:portfolioId/positions/:positionId', async (request, reply) => {
    const portfolioId = Number(request.params.portfolioId);
    const positionId = Number(request.params.positionId);

    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }
    if (!Number.isInteger(positionId) || positionId <= 0) {
      return reply.status(404).send({ error: 'Posizione non trovata.' });
    }

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Verifica esistenza posizione e appartenenza al portafoglio
    const existing = db
      .select()
      .from(positions)
      .where(and(eq(positions.id, positionId), eq(positions.portfolio_id, portfolioId)))
      .get();
    if (!existing) {
      return reply.status(404).send({ error: 'Posizione non trovata.' });
    }

    db.delete(positions).where(and(eq(positions.id, positionId), eq(positions.portfolio_id, portfolioId))).run();

    return reply.status(204).send();
  });

  /**
   * GET /api/portfolios/:id/positions
   * Restituisce tutte le posizioni del portafoglio ordinate per created_at DESC.
   */
  fastify.get<{
    Params: { id: string };
    Reply: Position[] | { error: string };
  }>('/api/portfolios/:id/positions', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const rows = db
      .select()
      .from(positions)
      .where(eq(positions.portfolio_id, portfolioId))
      .orderBy(desc(positions.created_at))
      .all();

    return rows.map(toPosition);
  });
}
