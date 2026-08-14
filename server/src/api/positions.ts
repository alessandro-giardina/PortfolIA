import type { FastifyInstance } from 'fastify';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { portfolios, positions, priceObservations, sales, securities } from '../db/schema.js';
import type { Position, PositionLoad, CreatePositionRequest, UpdatePositionRequest, PositionSummary, EnrichedPositionSummary, PositionDetail, PriceObservation, CaricoLotto, VenditaLotto, RegistroInput, Sale, PortfolioSeriesEntry, RilevazioneSerie } from '@portfolia/shared';
import { isValidIsin, normalizeIsin, normalizzaDataSource, residuoPerIsin, rigiocaRegistro } from '@portfolia/shared';
import { classifyPriceFreshness } from '../domain/marketHours.js';
import { toSale } from './sales.js';

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

/** Il carico, nella forma ridotta che l'attribuzione LIFO legge. */
function toCaricoLotto(row: typeof positions.$inferSelect): CaricoLotto {
  return { id: row.id, loadDate: row.load_date, loadPrice: row.load_price, quantity: row.quantity };
}

/** La vendita, nella forma ridotta che l'attribuzione LIFO legge. */
function toVenditaLotto(row: typeof sales.$inferSelect): VenditaLotto {
  return { id: row.id, saleDate: row.sale_date, quantity: row.quantity, salePrice: row.sale_price };
}

/**
 * Il registro di **ogni ISIN** di un portafoglio: carichi e vendite, raggruppati
 * in memoria.
 *
 * Da US-042 le tre viste aggregate non aggregano più in SQL, e non è una scelta
 * di stile: `SUM` e la media ponderata non sanno fare LIFO. Attribuire una
 * vendita richiede di percorrere i lotti **in ordine**, portandosi dietro quanto
 * resta di ciascuno — un ciclo con stato, che una query per gruppi non esprime.
 * Tentare di esprimerlo comunque (window function, CTE ricorsiva) produrrebbe una
 * seconda implementazione del criterio, in un linguaggio dove non è provabile,
 * accanto a quella del dominio che invece lo è. US-038 ha già fatto questa scelta
 * per il P&L da carico, e per la stessa ragione.
 *
 * Le chiavi sono gli ISIN che risultano **caricati**: un titolo del portafoglio è
 * un titolo di cui esiste un carico, come prima di US-042. Una vendita senza
 * carichi non è iscrivibile (la POST la rifiuta) e un carico consumato non è
 * rimovibile (FR-024), quindi ogni ISIN con vendite ha per costruzione almeno un
 * carico: l'insieme delle chiavi non perde nulla.
 */
function leggiRegistriPortafoglio(portfolioId: number): Map<string, RegistroInput> {
  const registri = new Map<string, { carichi: CaricoLotto[]; vendite: VenditaLotto[] }>();

  for (const row of db.select().from(positions).where(eq(positions.portfolio_id, portfolioId)).all()) {
    const registro = registri.get(row.isin) ?? { carichi: [], vendite: [] };
    registro.carichi.push(toCaricoLotto(row));
    registri.set(row.isin, registro);
  }

  for (const row of db.select().from(sales).where(eq(sales.portfolio_id, portfolioId)).all()) {
    // `?.` e non un ramo che crea la voce: un ISIN venduto ma non caricato non
    // deve comparire fra i titoli del portafoglio. Se l'archivio ne contenesse
    // uno — scritto a mano, o da una versione anteriore alla guardia — la vista
    // lo ignora invece di elencare una posizione a residuo negativo.
    registri.get(row.isin)?.vendite.push(toVenditaLotto(row));
  }

  return registri;
}

/**
 * I registri per ISIN in ordine di ISIN crescente: l'ordine che le due viste
 * aggregate avevano dall'`ORDER BY` della query, e che i test già asseriscono.
 */
function ordinaPerIsin(registri: Map<string, RegistroInput>): [string, RegistroInput][] {
  return [...registri.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** L'anagrafica in cache dei soli ISIN richiesti; le chiavi assenti restano fuori dalla mappa. */
function leggiAnagrafiche(isins: readonly string[]): Map<string, typeof securities.$inferSelect> {
  if (isins.length === 0) return new Map();
  return new Map(
    db
      .select()
      .from(securities)
      .where(inArray(securities.isin, [...isins]))
      .all()
      .map((row) => [row.isin, row]),
  );
}

/** Il registro di **un solo ISIN** di un portafoglio: carichi e vendite. */
function leggiRegistroIsin(portfolioId: number, isin: string): {
  carichi: CaricoLotto[];
  vendite: VenditaLotto[];
  righeCarico: (typeof positions.$inferSelect)[];
  righeVendita: (typeof sales.$inferSelect)[];
} {
  const righeCarico = db
    .select()
    .from(positions)
    .where(and(eq(positions.portfolio_id, portfolioId), eq(positions.isin, isin)))
    .orderBy(positions.load_date, positions.id)
    .all();

  const righeVendita = db
    .select()
    .from(sales)
    .where(and(eq(sales.portfolio_id, portfolioId), eq(sales.isin, isin)))
    .orderBy(sales.sale_date, sales.id)
    .all();

  return {
    carichi: righeCarico.map(toCaricoLotto),
    vendite: righeVendita.map(toVenditaLotto),
    righeCarico,
    righeVendita,
  };
}

/**
 * La ragione per cui un carico **non** può essere modificato né rimosso, oppure
 * `null` quando può (FR-009, FR-024, criterio 6 di US-042).
 *
 * Un carico consumato da una vendita, **anche solo in parte**, è immodificabile.
 * La modifica è inclusa nel divieto quanto la rimozione, e non per simmetria:
 * cambiare prezzo o data di un lotto già consumato riscriverebbe a posteriori il
 * costo attribuito a una vendita già iscritta — cioè cambierebbe un risultato
 * realizzato senza toccare l'iscrizione che lo ha prodotto. Ridurne la quantità
 * sotto la quota consumata farebbe di più: renderebbe il registro incoerente.
 *
 * Il messaggio **distingue le due operazioni** invece di limitarsi a vietare,
 * perché è la distinzione stessa la cosa che il criterio chiede di rendere
 * esplicita: chi vuole ridurre una posizione dopo un'operazione realmente
 * eseguita non sta correggendo un errore, e ha bisogno di sapere che lo strumento
 * giusto esiste e qual è.
 */
function ragioneCaricoImmodificabile(
  portfolioId: number,
  carico: typeof positions.$inferSelect,
): string | null {
  const { carichi, vendite } = leggiRegistroIsin(portfolioId, carico.isin);
  if (vendite.length === 0) return null;

  const registro = rigiocaRegistro({ carichi, vendite });
  const lotto = registro.lotti.find((l) => l.caricoId === carico.id);
  if (!lotto || lotto.quantitaConsumata === 0) return null;

  // Le vendite che hanno attinto a questo lotto, in ordine di registro: nominarle
  // dice all'utente *quale* iscrizione va corretta prima, se è quella a essere
  // sbagliata.
  const scarichi = registro.vendite
    .filter((v) => v.attribuzioni.some((a) => a.caricoId === carico.id))
    .map((v) => v.saleDate);
  const misura = lotto.quantitaResidua === 0 ? 'per intero' : `in parte (${lotto.quantitaConsumata} quote su ${lotto.quantita})`;
  const daChi = scarichi.length === 1 ? `dalla vendita del ${scarichi[0]}` : `dalle vendite del ${scarichi.join(' e del ')}`;

  return (
    `Il carico del ${carico.load_date} è già stato consumato ${misura} ${daChi}: non può essere né ` +
    `modificato né rimosso. La rimozione di un carico è la correzione di un'iscrizione errata — cancella ` +
    `il carico come se non fosse mai avvenuto, e non produce alcun risultato realizzato. Per ridurre una ` +
    `posizione a seguito di un'operazione realmente eseguita si registra invece una vendita. Se è la ` +
    `vendita a essere errata, va corretta prima quella.`
  );
}

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

    // Il registro di questo ISIN: i carichi individuali in ordine cronologico e
    // le vendite che ne hanno consumato quote.
    const { carichi, vendite, righeCarico: loadRows, righeVendita: saleRows } = leggiRegistroIsin(portfolioId, isin);

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

    const currentPrice = security?.price ?? null;

    // Il P&L da carico non si calcola più qui (US-038): la stessa aritmetica
    // alimenta ora anche il riquadro sotto il grafico, e due copie della stessa
    // formula possono divergere di un centesimo senza che alcun test se ne
    // accorga — nessuno confronta i due percorsi. La regola vive quindi in una
    // funzione pura provabile, come già `componiSerieTitolo` per il grafico.
    //
    // Da US-042 quella funzione è `residuoPerIsin`, che misura il **residuo**
    // dopo le vendite: a registro senza vendite restituisce cifra per cifra ciò
    // che `calcolaPnlDaCarico` restituiva, e con vendite iscritte il medio dei
    // soli lotti non consumati.
    const pnl = residuoPerIsin({ carichi, vendite, currentPrice });

    // La quota che ogni lotto ha ancora, per `id` di carico: la riga del registro
    // la mostra accanto alla quantità nominale, ed è la coppia di cifre che
    // dimostra a schermo che il carico non è stato riscritto (ADR-009).
    const residuoPerLotto = new Map(pnl.registro.lotti.map((l) => [l.caricoId, l.quantitaResidua]));
    const loads: PositionLoad[] = loadRows.map((row) => ({
      ...toPosition(row),
      residualQuantity: residuoPerLotto.get(row.id) ?? 0,
    }));

    // Le vendite grezze del registro, già in ordine di data crescente perché la
    // query di `leggiRegistroIsin` ordina `(sale_date, id)` — lo stesso ordine di
    // `loads` qui sopra: nessun `.sort()` aggiuntivo serve.
    const salesList: Sale[] = saleRows.map(toSale);

    const detail: PositionDetail = {
      isin,
      loadedQuantity: pnl.loadedQuantity,
      soldQuantity: pnl.soldQuantity,
      totalQuantity: pnl.totalQuantity,
      avgLoadPrice: pnl.avgLoadPrice,
      totalLoadValue: pnl.totalLoadValue,
      currentPrice,
      currentValue: pnl.currentValue,
      difference: pnl.difference,
      differencePercent: pnl.differencePercent,
      realizedPnl: pnl.realizedPnl,
      latentPnl: pnl.latentPnl,
      totalLoadCost: pnl.totalLoadCost,
      totalPnl: pnl.totalPnl,
      soldRevenue: pnl.soldRevenue,
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
      loads,
      sales: salesList,
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

    // Il registro per ISIN, e l'anagrafica in cache dei soli ISIN che servono:
    // ciò che prima era una LEFT JOIN con GROUP BY. L'aggregazione avviene nel
    // dominio perché è LIFO (vedi `leggiRegistriPortafoglio`); la cache resta una
    // lettura per chiave, e `null` continua a significare «non in cache».
    const voci = ordinaPerIsin(leggiRegistriPortafoglio(portfolioId));
    const anagrafiche = leggiAnagrafiche(voci.map(([isin]) => isin));

    // Un solo istante per l'intera risposta: righe della stessa tabella devono
    // essere classificate rispetto allo stesso "adesso", altrimenti due titoli
    // rilevati insieme potrebbero cadere ai due lati del confine di sessione.
    const adesso = now();

    const result: EnrichedPositionSummary[] = voci.map(([isin, registro]) => {
      const security = anagrafiche.get(isin);
      const currentPrice = security?.price ?? null;
      const residuo = residuoPerIsin({ ...registro, currentPrice });
      const fetchedAt = security?.fetched_at ?? null;
      // Stesso predicato della cella «Ultimo rilevamento» del riepilogo, e per
      // la stessa ragione: una riga in cache può avere `fetched_at` valorizzato
      // e `price` nullo, e chiamarla «obsoleta» accanto a un «–» direbbe che un
      // prezzo è stato rilevato — falso. Senza prezzo il rilevamento non c'è
      // stato: «mai rilevato».
      const istante = currentPrice !== null && fetchedAt !== null ? new Date(fetchedAt * 1000) : null;
      return {
        isin,
        name: security?.name ?? null,
        loadedQuantity: residuo.loadedQuantity,
        soldQuantity: residuo.soldQuantity,
        totalQuantity: residuo.totalQuantity,
        avgLoadPrice: residuo.avgLoadPrice,
        currentPrice,
        currentValue: residuo.currentValue,
        difference: residuo.difference,
        realizedPnl: residuo.realizedPnl,
        latentPnl: residuo.latentPnl,
        totalLoadCost: residuo.totalLoadCost,
        totalPnl: residuo.totalPnl,
        soldRevenue: residuo.soldRevenue,
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

    // Aggregazione per ISIN sul **residuo**: i carichi restano tutti iscritti, le
    // vendite ne consumano quote secondo LIFO, e la media ponderata si ricalcola
    // sui soli lotti non consumati (vedi `leggiRegistriPortafoglio` per il perché
    // non sia più una GROUP BY).
    const summaries: PositionSummary[] = ordinaPerIsin(leggiRegistriPortafoglio(portfolioId)).map(
      ([isin, registro]) => {
        const residuo = residuoPerIsin(registro);
        return {
          isin,
          loadedQuantity: residuo.loadedQuantity,
          soldQuantity: residuo.soldQuantity,
          totalQuantity: residuo.totalQuantity,
          avgLoadPrice: residuo.avgLoadPrice,
          totalLoadValue: residuo.totalLoadValue,
          realizedPnl: residuo.realizedPnl,
          latentPnl: residuo.latentPnl,
          totalLoadCost: residuo.totalLoadCost,
          totalPnl: residuo.totalPnl,
          soldRevenue: residuo.soldRevenue,
        };
      },
    );

    return summaries;
  });

  /**
   * GET /api/portfolios/:id/series
   * Dati grezzi per comporre il grafico del valore del portafoglio (US-019):
   * per ogni ISIN detenuto, registro carichi, registro vendite, storico delle
   * rilevazioni di prezzo (ordinato per data crescente) e nome. Una sola
   * chiamata: l'aggregazione fra titoli avviene lato client, così il grafico
   * non moltiplica le richieste di rete per ISIN.
   *
   * `[]` quando il portafoglio esiste ma non ha titoli — non un 404, perché il
   * portafoglio esiste davvero. Nessuna fonte esterna viene contattata: è una
   * lettura d'archivio, come le altre viste di questo file.
   */
  fastify.get<{
    Params: { id: string };
    Reply: PortfolioSeriesEntry[] | { error: string };
  }>('/api/portfolios/:id/series', async (request, reply) => {
    const portfolioId = Number(request.params.id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    // Verifica esistenza portafoglio
    const portfolio = db.select().from(portfolios).where(eq(portfolios.id, portfolioId)).get();
    if (!portfolio) {
      return reply.status(404).send({ error: 'Portafoglio non trovato.' });
    }

    const voci = ordinaPerIsin(leggiRegistriPortafoglio(portfolioId));
    if (voci.length === 0) return [];

    const isins = voci.map(([isin]) => isin);
    const anagrafiche = leggiAnagrafiche(isins);

    // Un'unica query per **tutti** gli ISIN del portafoglio insieme, ordinata
    // per data di rilevazione crescente — non una per ISIN: la stessa
    // disciplina di `leggiRegistriPortafoglio`, per la stessa ragione (evitare
    // N query dove una basta).
    const observationRows = db
      .select()
      .from(priceObservations)
      .where(inArray(priceObservations.isin, isins))
      .orderBy(priceObservations.observed_at, priceObservations.id)
      .all();

    const storicoPerIsin = new Map<string, RilevazioneSerie[]>();
    for (const row of observationRows) {
      const lista = storicoPerIsin.get(row.isin) ?? [];
      lista.push({ price: row.price, observedAt: row.observed_at });
      storicoPerIsin.set(row.isin, lista);
    }

    const result: PortfolioSeriesEntry[] = voci.map(([isin, registro]) => ({
      isin,
      name: anagrafiche.get(isin)?.name ?? null,
      loads: registro.carichi.map(({ loadDate, loadPrice, quantity }) => ({ loadDate, loadPrice, quantity })),
      sales: registro.vendite.map(({ saleDate, quantity, salePrice }) => ({ saleDate, quantity, salePrice })),
      priceHistory: storicoPerIsin.get(isin) ?? [],
    }));

    return result;
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

    // La guardia sul lotto consumato precede la validazione del body, e
    // l'ordine è deliberato: se l'iscrizione è immodificabile non c'è modifica di
    // cui discutere la forma, e un 400 sul formato di un campo suggerirebbe che
    // con il campo corretto la richiesta passerebbe. 409 e non 400 perché la
    // richiesta è ben formata: è lo **stato del registro** a renderla impossibile.
    const immodificabile = ragioneCaricoImmodificabile(portfolioId, existing);
    if (immodificabile) {
      return reply.status(409).send({ error: immodificabile });
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

    // Un carico già consumato da una vendita non è rimovibile (FR-024): la
    // rimozione è la correzione di un'iscrizione errata, e cancellare un lotto
    // che una vendita ha già consumato lascerebbe quella vendita senza il costo
    // che le è stato attribuito.
    const immodificabile = ragioneCaricoImmodificabile(portfolioId, existing);
    if (immodificabile) {
      return reply.status(409).send({ error: immodificabile });
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
