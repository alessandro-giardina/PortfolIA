import * as cheerio from 'cheerio';
import type { SecurityInfo } from '@portfolia/shared';
import { parseSecurity } from './parser.js';

/**
 * Adapter verso Borsa Italiana (anti-corruption layer, ADR-002).
 *
 * Isola tutto il fetch HTTP fragile verso la fonte ufficiale. Espone un esito
 * tipizzato — trovato / non trovato / errore — e non lancia mai eccezioni
 * opache: timeout, errori di rete e markup malformato degradano in modo
 * trasparente in `not-found`/`error`. Buona cittadinanza: User-Agent realistico
 * e una singola sessione di richieste a basso volume per ISIN.
 */

const BASE_URL = 'https://www.borsaitaliana.it';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 8000;

export type AdapterResult =
  | { status: 'found'; security: SecurityInfo }
  | { status: 'not-found' }
  | { status: 'error'; reason: string };

export interface AdapterOptions {
  /** fetch iniettabile per i test; default `globalThis.fetch`. */
  fetchFn?: typeof fetch;
  /** Timeout per singola richiesta (ms). */
  timeoutMs?: number;
  /** Base URL della fonte (override per i test). */
  baseUrl?: string;
}

function searchUrl(baseUrl: string, isin: string): string {
  return `${baseUrl}/borsa/searchengine/search.html?q=${encodeURIComponent(isin)}`;
}

/** Singola GET con User-Agent corretto e timeout via AbortController. */
async function httpGet(url: string, fetchFn: typeof fetch, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'it-IT,it;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Risposta HTTP ${res.status} dalla fonte`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dalla pagina dei risultati di ricerca estrae l'URL della scheda strumento.
 * Preferisce il link che contiene l'ISIN, poi un qualsiasi link a una "scheda".
 */
function extractInstrumentUrl(searchHtml: string, baseUrl: string, isin: string): string | null {
  const $ = cheerio.load(searchHtml);
  let withIsin: string | null = null;
  let withScheda: string | null = null;

  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    if (!withIsin && href.toUpperCase().includes(isin)) {
      withIsin = href;
    }
    if (!withScheda && /scheda/i.test(href)) {
      withScheda = href;
    }
  });

  const chosen = withIsin ?? withScheda;
  if (!chosen) return null;
  try {
    return new URL(chosen, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Recupera l'anagrafica di un titolo per ISIN dalla fonte ufficiale.
 * Esegue al massimo due richieste a basso volume (ricerca + scheda strumento).
 */
export async function fetchSecurityByIsin(isin: string, options: AdapterOptions = {}): Promise<AdapterResult> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? BASE_URL;
  const normalized = isin.trim().toUpperCase();

  try {
    const searchHtml = await httpGet(searchUrl(baseUrl, normalized), fetchFn, timeoutMs);
    const instrumentUrl = extractInstrumentUrl(searchHtml, baseUrl, normalized);
    if (!instrumentUrl) {
      return { status: 'not-found' };
    }

    const pageHtml = await httpGet(instrumentUrl, fetchFn, timeoutMs);
    const security = parseSecurity(pageHtml, normalized);

    // Pagina non riconducibile a uno strumento: nessuna denominazione né prezzo.
    if (security.name === null && security.price === null) {
      return { status: 'not-found' };
    }

    return { status: 'found', security };
  } catch (err) {
    return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
}

export { USER_AGENT };
