import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { securities, type SecurityRow } from '../db/schema.js';
import { isValidIsin, normalizeIsin } from '@portfolia/shared';
import type { SecurityInfo, SecurityLookupResponse } from '@portfolia/shared';
import { fetchSecurityByIsin, type AdapterResult } from '../market/borsaItalianaAdapter.js';
import { classifyRefetch } from '../domain/marketHours.js';

type Db = typeof defaultDb;

/**
 * Dipendenze iniettabili dell'endpoint securities.
 * In produzione si usano i default (db reale, adapter live, orologio di sistema);
 * i test iniettano un db di prova, un adapter mockato e un tempo deterministico.
 */
export interface SecuritiesDeps {
  db?: Db;
  fetchSecurity?: (isin: string) => Promise<AdapterResult>;
  now?: () => Date;
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

function upsertSecurity(db: Db, sec: SecurityInfo, fetchedAt: number): void {
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
        fetched_at: fetchedAt,
      },
    })
    .run();
}

/**
 * Espone `GET /api/securities/:isin`.
 *
 * - 400 se l'ISIN è malformato (validazione del formato + cifra di controllo).
 * - Consulta la cache locale. Se esiste un recupero precedente e non è stato
 *   passato `?force=true`, applica la guardia di buona cittadinanza
 *   (`classifyRefetch`): su `intra-session`/`no-session` restituisce i dati in
 *   cache + `confirmation` SENZA contattare la fonte; su `none` (o cache miss /
 *   `force`) interroga l'adapter, persiste e aggiorna `fetched_at`.
 * - 200 con l'anagrafica, 404 se non trovato, 502 su errore della fonte.
 */
export function securitiesRoutes(deps: SecuritiesDeps = {}) {
  const db = deps.db ?? defaultDb;
  const fetchSecurity = deps.fetchSecurity ?? ((isin: string) => fetchSecurityByIsin(isin));
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
          };
          return reply.status(200).send(response);
        }
      }

      const result = await fetchSecurity(isin);
      if (result.status === 'not-found') {
        return reply.status(404).send({
          error: `Nessuna corrispondenza su Borsa Italiana per ${isin}.`,
        });
      }
      if (result.status === 'error') {
        return reply.status(502).send({
          error: 'Impossibile contattare la fonte ufficiale al momento. Riprova più tardi.',
        });
      }

      upsertSecurity(db, result.security, nowSeconds);
      const response: SecurityLookupResponse = {
        security: result.security,
        fromCache: false,
        lastFetchedAt: nowSeconds,
      };
      return reply.status(200).send(response);
    });
  };
}
