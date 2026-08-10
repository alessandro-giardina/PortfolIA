import type { FastifyInstance } from 'fastify';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { portfolios, positions, priceObservations, securities } from '../db/schema.js';
import type { Position, CreatePositionRequest, UpdatePositionRequest, PositionSummary, EnrichedPositionSummary, PositionDetail, PriceObservation } from '@portfolia/shared';
import { isValidIsin, normalizeIsin, normalizzaDataSource } from '@portfolia/shared';
import { classifyPriceFreshness } from '../domain/marketHours.js';

/**
 * Opzioni del plugin. `now` esiste solo per congelare l'orologio nei test del
 * verdetto di freschezza (US-034): si usa il secondo parametro che Fastify passa
 * già a ogni plugin, così `fastify.register(positionsRoutes)` resta valido
 * ovunque sia già scritto e nessuna registrazione esistente va toccata.
 */
export interface PositionsRoutesOptions {
  now?: () => Date;
}

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

/** Mappa una riga di `price_observations` nell'osservazione condivisa (US-009). */
function toPriceObservation(row: typeof priceObservations.$inferSelect): PriceObservation {
  return {
    price: row.price,
    observedAt: row.observed_at,
    dataSource: normalizzaDataSource(row.data_source),
  };
}

export async function positionsRoutes(
  fastify: FastifyInstance,
  opts: PositionsRoutesOptions = {},
): Promise<void> {
  const now = opts.now ?? ((): Date => new Date());

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
   * GET /api/portfolios/:id/positions/:isin/detail
   * Dettaglio completo di un titolo iscritto al portafoglio (FR-014).
   *
   * Compone l'aggregato di posizione, l'anagrafica dalla cache `securities`
   * (LEFT JOIN, con la provenienza del dato) e l'elenco dei carichi ordinato
   * per data. È una vista di sola lettura: non contatta mai la fonte esterna,
   * perché un recupero a freddo costa 8-12 secondi e scavalcherebbe la guardia
   * di buona cittadinanza di GET /api/securities/:isin. Quando l'anagrafica non
   * è in archivio i campi restano null e il client lo dichiara.
   *
   * Va registrata PRIMA di GET /positions, come le altre GET a percorso specifico.
   */
  fastify.get<{
    Params: { id: string; isin: string };
    Reply: PositionDetail | { error: string };
  }>('/api/portfolios/:id/positions/:isin/detail', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const rawIsin = request.params.isin ?? '';
    if (!isValidIsin(rawIsin)) {
      return reply.status(400).send({ error: 'Inserire un codice ISIN valido (12 caratteri alfanumerici).' });
    }
    const isin = normalizeIsin(rawIsin);

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // I carichi individuali di questo ISIN, in ordine cronologico di carico.
    const loadRows = db
      .select()
      .from(positions)
      .where(and(eq(positions.portfolio_id, portfolioId), eq(positions.isin, isin)))
      .orderBy(positions.load_date, positions.id)
      .all();

    // Un ISIN formalmente valido ma senza carichi non è un titolo di questo
    // portafoglio: 404, non una scheda vuota con zeri inventati.
    if (loadRows.length === 0) {
      return reply.status(404).send({ error: 'Titolo non presente in questo portafoglio.' });
    }

    const security = db.select().from(securities).where(eq(securities.isin, isin)).get();

    // Lo storico delle rilevazioni già osservate (US-009, FR-018): dalla più
    // recente alla più antica. `id DESC` scioglie il pari merito fra due
    // osservazioni dello stesso istante — prezzi diversi rilevati nello stesso
    // secondo — mettendo comunque per prima quella registrata per ultima, così
    // l'ordine è totale e la prima riga è sempre l'ultima rilevazione.
    // È una lettura d'archivio: nessuna fonte esterna viene contattata.
    const observationRows = db
      .select()
      .from(priceObservations)
      .where(eq(priceObservations.isin, isin))
      .orderBy(desc(priceObservations.observed_at), desc(priceObservations.id))
      .all();

    const totalQuantity = loadRows.reduce((sum, row) => sum + row.quantity, 0);
    const weightedSum = loadRows.reduce((sum, row) => sum + row.load_price * row.quantity, 0);
    const avgLoadPrice = totalQuantity > 0 ? weightedSum / totalQuantity : 0;
    const totalLoadValue = avgLoadPrice * totalQuantity;

    const currentPrice = security?.price ?? null;
    const currentValue = currentPrice !== null ? currentPrice * totalQuantity : null;
    const difference = currentValue !== null ? currentValue - totalLoadValue : null;
    // La percentuale è definita solo su un controvalore di carico non nullo:
    // dividere per zero produrrebbe Infinity, cioè un numero inventato.
    const differencePercent =
      difference !== null && totalLoadValue !== 0 ? (difference / totalLoadValue) * 100 : null;

    const detail: PositionDetail = {
      isin,
      totalQuantity,
      avgLoadPrice,
      totalLoadValue,
      currentPrice,
      currentValue,
      difference,
      differencePercent,
      name: security?.name ?? null,
      ticker: security?.ticker ?? null,
      instrumentType: security?.instrument_type ?? null,
      totalAnnualFees: security?.total_annual_fees ?? null,
      currency: security?.currency ?? null,
      issuer: security?.issuer ?? null,
      segment: security?.segment ?? null,
      dividendPolicy: security?.dividend_policy ?? null,
      dataSource: normalizzaDataSource(security?.data_source),
      fetchedAt: security?.fetched_at ?? null,
      loads: loadRows.map(toPosition),
      priceHistory: observationRows.map(toPriceObservation),
    };

    return reply.status(200).send(detail);
  });

  /**
   * GET /api/portfolios/:id/positions/enriched
   * Restituisce la vista aggregata per ISIN arricchita con il prezzo corrente
   * dalla cache securities (LEFT JOIN). Calcola currentValue e difference
   * lato server. I campi derivati dal prezzo corrente sono null se l'ISIN
   * non è in cache.
   * Deve essere registrata PRIMA di /summary e /positions per evitare conflitti Fastify.
   */
  fastify.get<{
    Params: { id: string };
    Reply: EnrichedPositionSummary[] | { error: string };
  }>('/api/portfolios/:id/positions/enriched', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Aggregazione per ISIN con LEFT JOIN sulla cache securities
    const rows = db
      .select({
        isin: positions.isin,
        name: securities.name,
        totalQuantity: sql<number>`SUM(${positions.quantity})`,
        weightedSum: sql<number>`SUM(${positions.load_price} * ${positions.quantity})`,
        currentPrice: securities.price,
        fetchedAt: securities.fetched_at,
      })
      .from(positions)
      .leftJoin(securities, eq(positions.isin, securities.isin))
      .where(eq(positions.portfolio_id, portfolioId))
      // `fetched_at` sta nella GROUP BY come le altre colonne della cache: la join
      // è 1-a-1 sull'ISIN, quindi oggi il valore sarebbe comunque univoco, ma
      // raggruppare ciò che si seleziona tiene la query corretta per costruzione
      // e non dipendente da come SQLite risolve una colonna non aggregata.
      .groupBy(positions.isin, securities.name, securities.price, securities.fetched_at)
      .orderBy(positions.isin)
      .all();

    // Un solo istante per l'intera risposta: righe della stessa tabella devono
    // essere classificate rispetto allo stesso "adesso", altrimenti due titoli
    // rilevati insieme potrebbero cadere ai due lati del confine di sessione.
    const adesso = now();

    const result: EnrichedPositionSummary[] = rows.map((row) => {
      const avgLoadPrice = row.totalQuantity > 0 ? row.weightedSum / row.totalQuantity : 0;
      const currentPrice = row.currentPrice ?? null;
      const currentValue = currentPrice !== null ? currentPrice * row.totalQuantity : null;
      const difference = currentValue !== null ? currentValue - avgLoadPrice * row.totalQuantity : null;
      const fetchedAt = row.fetchedAt ?? null;
      // Stesso predicato della cella «Ultimo rilevamento» del riepilogo, e per
      // la stessa ragione: una riga in cache può avere `fetched_at` valorizzato
      // e `price` nullo, e chiamarla «obsoleta» accanto a un «–» direbbe che un
      // prezzo è stato rilevato — falso. Senza prezzo il rilevamento non c'è
      // stato: «mai rilevato».
      const istante = currentPrice !== null && fetchedAt !== null ? new Date(fetchedAt * 1000) : null;
      return {
        isin: row.isin,
        name: row.name ?? null,
        totalQuantity: row.totalQuantity,
        avgLoadPrice,
        currentPrice,
        currentValue,
        difference,
        fetchedAt,
        freshness: classifyPriceFreshness(istante, adesso),
      };
    });

    return result;
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
