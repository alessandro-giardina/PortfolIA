import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { securities, type SecurityRow } from '../db/schema.js';
import { isValidIsin, normalizeIsin, normalizzaDataSource } from '@portfolia/shared';
import type { DataSource, SecurityInfo, SecurityLookupResponse } from '@portfolia/shared';
import { fetchSecurityByIsin, type AdapterResult } from '../market/borsaItalianaAdapter.js';
import { fetchSecurityByIsin as fetchSecurityByIsinMorningStar } from '../market/morningStarAdapter.js';
import { classifyRefetch } from '../domain/marketHours.js';
import { registraOsservazione } from '../domain/storicoPrezzi.js';

type Db = typeof defaultDb;

/**
 * Risultato arricchito della funzione fetchWithFallback.
 * Aggiunge `dataSource` per sapere da quale fonte proviene il titolo trovato.
 */
type FallbackResult =
  | { status: 'found'; security: SecurityInfo; dataSource: DataSource }
  | { status: 'not-found' }
  | { status: 'error'; reason?: string };

/**
 * Dipendenze iniettabili dell'endpoint securities.
 * In produzione si usano i default (db reale, adapter live, orologio di sistema);
 * i test iniettano un db di prova, un adapter mockato e un tempo deterministico.
 */
export interface SecuritiesDeps {
  db?: Db;
  fetchSecurity?: (isin: string) => Promise<AdapterResult>;
  fetchSecurityFallback?: (isin: string) => Promise<AdapterResult>;
  now?: () => Date;
}

/**
 * Ordine dei tentativi, dedotto dalla fonte già registrata per l'ISIN.
 *
 * Un titolo che l'archivio attribuisce a MorningStar riparte da MorningStar:
 * è la fonte che quel titolo lo conosce, e ripartire da Borsa Italiana
 * significherebbe pagarne il fallimento a ogni aggiornamento. Senza una fonte
 * registrata l'ordine resta quello predefinito — prima la fonte primaria, poi
 * il backup — che è anche il comportamento di ogni recupero precedente a US-030.
 */
function ordineTentativi(preferita: DataSource | undefined): DataSource[] {
  return preferita === 'morningstar'
    ? ['morningstar', 'borsaitaliana']
    : ['borsaitaliana', 'morningstar'];
}

/**
 * Interroga le due fonti nell'ordine indicato, fermandosi alla prima che trova
 * il titolo: la seconda non viene mai contattata quando la prima ha risposto.
 *
 * La `dataSource` restituita è quella della fonte che ha *effettivamente*
 * risposto, non della prima tentata — è ciò che rende il timbro di provenienza
 * (FR-021) un dato rilevato e non una presunzione.
 *
 * L'esito è quello dell'ultimo tentativo: `not-found` se l'ultima fonte
 * interrogata ha risposto senza trovare il titolo, `error` se nessuna ha
 * risposto. Sul ramo `error` il chiamante non scrive nulla in archivio.
 */
async function fetchWithFallback(
  isin: string,
  fetchers: Record<DataSource, (isin: string) => Promise<AdapterResult>>,
  preferita: DataSource | undefined,
): Promise<FallbackResult> {
  // Esito dell'ultimo tentativo andato a vuoto. Il valore iniziale non è mai
  // quello restituito — l'ordine contiene sempre due fonti — ma tiene il tipo
  // onesto senza ricorrere a un'asserzione.
  let ultimo: Exclude<AdapterResult, { status: 'found' }> = {
    status: 'error',
    reason: 'Nessuna fonte interrogata.',
  };

  for (const fonte of ordineTentativi(preferita)) {
    const esito = await fetchers[fonte](isin);
    if (esito.status === 'found') {
      return { status: 'found', security: esito.security, dataSource: fonte };
    }
    ultimo = esito;
  }

  if (ultimo.status === 'not-found') {
    return { status: 'not-found' };
  }
  return { status: 'error', reason: ultimo.reason };
}

function rowToSecurity(row: SecurityRow): SecurityInfo {
  return {
    isin: row.isin,
    name: row.name,
    price: row.price,
    ticker: row.ticker,
    instrumentType: row.instrument_type,
    totalAnnualFees: row.total_annual_fees,
    currency: row.currency,
    issuer: row.issuer,
    segment: row.segment,
    dividendPolicy: row.dividend_policy,
  };
}

/**
 * Persiste l'anagrafica in cache insieme alla fonte da cui proviene.
 *
 * `dataSource` è scritta sia in inserimento sia in aggiornamento: un titolo
 * prima trovato da Borsa Italiana e poi recuperato dal backup deve riportare
 * la fonte del recupero più recente, quella coerente con i dati salvati.
 */
function upsertSecurity(db: Db, sec: SecurityInfo, fetchedAt: number, dataSource: DataSource): void {
  db.insert(securities)
    .values({
      isin: sec.isin,
      name: sec.name,
      price: sec.price,
      ticker: sec.ticker,
      instrument_type: sec.instrumentType,
      total_annual_fees: sec.totalAnnualFees,
      currency: sec.currency,
      issuer: sec.issuer,
      segment: sec.segment,
      dividend_policy: sec.dividendPolicy,
      data_source: dataSource,
      fetched_at: fetchedAt,
    })
    .onConflictDoUpdate({
      target: securities.isin,
      set: {
        name: sec.name,
        price: sec.price,
        ticker: sec.ticker,
        instrument_type: sec.instrumentType,
        total_annual_fees: sec.totalAnnualFees,
        currency: sec.currency,
        issuer: sec.issuer,
        segment: sec.segment,
        dividend_policy: sec.dividendPolicy,
        data_source: dataSource,
        fetched_at: fetchedAt,
      },
    })
    .run();
}

/**
 * Legge la fonte persistita in cache, restituendo `undefined` quando non è
 * registrata (riga anteriore alla colonna `data_source`).
 *
 * `undefined` e non `'borsaitaliana'`: attribuire d'ufficio la fonte primaria
 * a una riga che potrebbe venire da MorningStar significherebbe inventare un
 * dato, che è precisamente ciò che FR-021 vieta. Il campo resta assente e il
 * client dichiara la provenienza come non registrata.
 */
function cachedDataSource(row: SecurityRow): DataSource | undefined {
  // La regola di riconoscimento vive in un posto solo (`normalizzaDataSource`);
  // qui cambia solo come si dichiara l'assenza, perché `SecurityLookupResponse`
  // omette il campo invece di valorizzarlo a `null`.
  return normalizzaDataSource(row.data_source) ?? undefined;
}

/**
 * Espone `GET /api/securities/:isin`.
 *
 * - 400 se l'ISIN è malformato (validazione del formato + cifra di controllo).
 * - Consulta la cache locale. Se esiste un recupero precedente e non è stato
 *   passato `?force=true`, applica la guardia di buona cittadinanza
 *   (`classifyRefetch`): su `intra-session`/`no-session` restituisce i dati in
 *   cache + `confirmation` SENZA contattare la fonte; su `none` (o cache miss /
 *   `force`) interroga le fonti, persiste e aggiorna `fetched_at`.
 * - L'ordine dei tentativi parte dalla fonte registrata per l'ISIN, quando c'è
 *   (US-030); altrimenti Borsa Italiana e poi MorningStar.
 * - 200 con l'anagrafica, 404 se non trovato, 502 su errore della fonte.
 */
export function securitiesRoutes(deps: SecuritiesDeps = {}) {
  const db = deps.db ?? defaultDb;
  const fetchSecurity = deps.fetchSecurity ?? ((isin: string) => fetchSecurityByIsin(isin));
  const fetchSecurityFallback = deps.fetchSecurityFallback ?? ((isin: string) => fetchSecurityByIsinMorningStar(isin));
  const now = deps.now ?? (() => new Date());

  return async function (fastify: FastifyInstance): Promise<void> {
    fastify.get<{
      Params: { isin: string };
      Querystring: { force?: string };
      Reply: SecurityLookupResponse | { error: string };
    }>('/api/securities/:isin', async (request, reply) => {
      const isinParam = request.params.isin ?? '';
      if (!isValidIsin(isinParam)) {
        return reply.status(400).send({
          error: 'Codice ISIN non valido: sono richiesti 12 caratteri (2 lettere paese, 9 alfanumerici, 1 cifra di controllo).',
        });
      }

      const isin = normalizeIsin(isinParam);
      const force = request.query.force === 'true';
      const nowDate = now();
      const nowSeconds = Math.floor(nowDate.getTime() / 1000);

      const cached = db.select().from(securities).where(eq(securities.isin, isin)).get();

      // Guardia di buona cittadinanza: se i dati sono in cache e non è forzato,
      // evita di ricontattare la fonte quando il prezzo non può essere cambiato
      // o nella stessa sessione, chiedendo conferma all'utente.
      if (cached && !force) {
        const classification = classifyRefetch(new Date(cached.fetched_at * 1000), nowDate);
        if (classification.kind !== 'none' && classification.message !== null) {
          const response: SecurityLookupResponse = {
            security: rowToSecurity(cached),
            fromCache: true,
            lastFetchedAt: cached.fetched_at,
            confirmation: {
              kind: classification.kind,
              lastFetchedAt: cached.fetched_at,
              message: classification.message,
            },
            dataSource: cachedDataSource(cached),
          };
          return reply.status(200).send(response);
        }
      }

      // La fonte registrata in archivio decide da dove ripartire (US-030). È
      // letta da `cached`, disponibile su entrambi i rami — con `force` e senza.
      const result = await fetchWithFallback(
        isin,
        { borsaitaliana: fetchSecurity, morningstar: fetchSecurityFallback },
        cached ? cachedDataSource(cached) : undefined,
      );
      if (result.status === 'not-found') {
        return reply.status(404).send({
          error: `Nessuna corrispondenza disponibile per ${isin}.`,
        });
      }
      if (result.status === 'error') {
        return reply.status(502).send({
          error: 'Impossibile contattare la fonte ufficiale al momento. Riprova più tardi.',
        });
      }

      upsertSecurity(db, result.security, nowSeconds, result.dataSource);
      // Lo storico dei prezzi osservati (US-009, FR-018) cresce esattamente qui:
      // accanto alla scrittura in cache, con l'istante e la fonte del recupero
      // appena avvenuto. Nessuno degli altri rami passa da questa riga — la
      // guardia che risponde dalla cache, il 404 e il 502 lasciano l'archivio
      // com'era — ed è ciò che rende vero il criterio «nessuna richiesta
      // aggiuntiva alla fonte»: lo storico registra ciò che gli aggiornamenti
      // già esistenti rilevano, e non provoca il minimo traffico proprio.
      registraOsservazione(db, isin, result.security.price, nowDate, result.dataSource);
      const response: SecurityLookupResponse = {
        security: result.security,
        fromCache: false,
        lastFetchedAt: nowSeconds,
        dataSource: result.dataSource,
      };
      return reply.status(200).send(response);
    });
  };
}
