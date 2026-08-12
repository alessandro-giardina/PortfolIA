import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { portfolios, positions, sales } from '../db/schema.js';
import type { CreateSaleRequest, Sale } from '@portfolia/shared';
import { isValidIsin, normalizeIsin, verificaVendita } from '@portfolia/shared';

/**
 * Le rotte delle **vendite** (US-042, FR-022, FR-023, FR-024).
 *
 * Vivono in un file e in un prefisso propri — `/api/portfolios/:id/sales` — e non
 * sotto `/positions`. Non è una preferenza di organizzazione: le rotte dei
 * carichi hanno vincoli d'ordine di registrazione delicati, documentati caso per
 * caso in `positions.ts` (le GET a percorso specifico vanno dichiarate prima di
 * `GET /positions`, altrimenti Fastify le oscura). Infilare due nuove rotte in
 * quella sequenza significherebbe rimetterla in discussione per una ragione che
 * non ha nulla a che vedere con le vendite.
 */

/** Mappa una riga di `sales` nell'interfaccia condivisa `Sale`. */
function toSale(row: typeof sales.$inferSelect): Sale {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    isin: row.isin,
    saleDate: row.sale_date,
    salePrice: row.sale_price,
    quantity: row.quantity,
    createdAt: row.created_at,
  };
}

/** RegExp formato data ISO-8601 YYYY-MM-DD, la stessa che valida i carichi. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function salesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/portfolios/:id/sales
   * Registra una vendita (scarico titolo) nel portafoglio indicato.
   *
   * L'ordine delle validazioni è parte del contratto: portafoglio, ISIN, data,
   * prezzo, quantità e **infine** `verificaVendita`. Le prime cinque riguardano
   * la forma della richiesta e non hanno bisogno di leggere il registro; l'ultima
   * riguarda lo **stato** del registro, ed è la sola che produce i due messaggi
   * distinti dei criteri 4 e 5. Anticiparla vorrebbe dire spiegare all'utente che
   * «alla data ... sono disponibili N quote» quando la data che ha scritto non è
   * nemmeno una data.
   */
  fastify.post<{
    Params: { id: string };
    Body: CreateSaleRequest;
    Reply: Sale | { error: string };
  }>('/api/portfolios/:id/sales', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const body = request.body ?? {};

    const rawIsin = typeof body.isin === 'string' ? body.isin : '';
    if (!rawIsin || !isValidIsin(rawIsin)) {
      return reply.status(400).send({ error: 'Inserire un codice ISIN valido (12 caratteri alfanumerici).' });
    }
    const isin = normalizeIsin(rawIsin);

    const saleDate = body.sale_date;
    if (!saleDate || typeof saleDate !== 'string' || !ISO_DATE_RE.test(saleDate)) {
      return reply.status(400).send({ error: 'La data di vendita è obbligatoria e deve essere nel formato YYYY-MM-DD.' });
    }

    const salePrice = body.sale_price;
    if (typeof salePrice !== 'number' || !Number.isFinite(salePrice) || salePrice <= 0) {
      return reply.status(400).send({ error: 'Il prezzo di vendita deve essere un valore positivo.' });
    }

    const quantity = body.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
      return reply.status(400).send({ error: 'La quantità venduta deve essere un intero positivo.' });
    }

    // Il registro di questo ISIN in questo portafoglio: i carichi e le vendite
    // già iscritte. Nessun campo derivato è letto dall'archivio perché nessuno vi
    // è scritto (ADR-009): il residuo si ottiene rigiocando.
    const carichi = db
      .select()
      .from(positions)
      .where(and(eq(positions.portfolio_id, portfolioId), eq(positions.isin, isin)))
      .all()
      .map((row) => ({
        id: row.id,
        loadDate: row.load_date,
        loadPrice: row.load_price,
        quantity: row.quantity,
      }));

    // Un ISIN senza carichi non è un titolo di questo portafoglio: non si può
    // vendere ciò che non risulta caricato, e dirlo esplicitamente è più utile
    // che parlare di «0 quote disponibili».
    if (carichi.length === 0) {
      return reply.status(400).send({
        error: 'Nessun carico risulta iscritto per questo titolo: non è possibile registrarne la vendita.',
      });
    }

    const vendite = db
      .select()
      .from(sales)
      .where(and(eq(sales.portfolio_id, portfolioId), eq(sales.isin, isin)))
      .all()
      .map((row) => ({ id: row.id, saleDate: row.sale_date, quantity: row.quantity }));

    // Fra la lettura del registro e l'inserimento non c'è alcun `await`, e non è
    // un caso: `better-sqlite3` è sincrono e Node ha un solo thread, quindi
    // nessuna seconda richiesta può insinuarsi fra la verifica e l'iscrizione. È
    // ciò che rende «la quantità residua non è mai negativa» (FR-024) vero anche
    // sotto due POST simultanee, senza una transazione esplicita. Inserire qui
    // un'operazione asincrona romperebbe la garanzia in silenzio.
    const verifica = verificaVendita({ carichi, vendite, saleDate, quantita: quantity });
    if (verifica.esito !== 'ok') {
      return reply.status(400).send({ error: verifica.messaggio });
    }

    const row = db
      .insert(sales)
      .values({
        portfolio_id: portfolioId,
        isin,
        sale_date: saleDate,
        sale_price: salePrice,
        quantity,
      })
      .returning()
      .get();

    return reply.status(201).send(toSale(row));
  });

  /**
   * GET /api/portfolios/:id/sales
   * Elenca le vendite del portafoglio in ordine di registro: `(sale_date, id)`
   * crescente.
   *
   * È lo stesso ordine in cui l'attribuzione LIFO le consuma, e per questo
   * l'`id` scioglie il pari merito fra due vendite dello stesso giorno: la
   * pagina che le elenca e il criterio che le attribuisce devono leggere il
   * registro nella stessa sequenza, altrimenti il residuo mostrato accanto a
   * ciascuna riga non corrisponderebbe alla riga.
   */
  fastify.get<{
    Params: { id: string };
    Reply: Sale[] | { error: string };
  }>('/api/portfolios/:id/sales', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const rows = db
      .select()
      .from(sales)
      .where(eq(sales.portfolio_id, portfolioId))
      .orderBy(sales.sale_date, sales.id)
      .all();

    return rows.map(toSale);
  });
}
