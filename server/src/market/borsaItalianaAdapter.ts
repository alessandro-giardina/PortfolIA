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
 * `true` se la pagina di ricerca dichiara zero risultati.
 *
 * Per un ISIN inesistente Borsa Italiana risponde comunque con 200 e una pagina
 * di ricerca che riporta "Risultati totali: 0" / "Nessun Risultato Trovato".
 * Intercettarlo qui evita una seconda richiesta inutile e — soprattutto —
 * impedisce di scambiare la pagina di ricerca per uno strumento (FR-006).
 */
function searchIndicatesNoResults(searchHtml: string): boolean {
  const text = cheerio.load(searchHtml).text().replace(/\s+/g, ' ').toLowerCase();
  return text.includes('nessun risultato') || /risultati totali:\s*0\b/.test(text);
}

/**
 * Dalla pagina dei risultati di ricerca estrae l'URL della scheda strumento.
 *
 * La pagina di ricerca contiene molti link auto-referenziali al sotto-sistema di
 * ricerca (canonical, toggle lingua, tab "Documenti/Notizie/Pagine/Quotazioni"):
 * tutti includono l'ISIN e precedono nel DOM l'eventuale link alla scheda.
 * Sceglierli porterebbe a ri-scaricare una pagina di ricerca (denominazione
 * "Cerca", nessun dato). Vivono tutti sotto `/searchengine/`, mentre la scheda
 * reale sta sotto `/borsa/search/scheda.html`: per questo ogni link
 * `/searchengine/` è escluso. Ordine di preferenza:
 *   1. link a una "scheda" che contiene anche l'ISIN (caso ideale);
 *   2. un qualsiasi link a una "scheda";
 *   3. un link che contiene l'ISIN ma non punta alla ricerca.
 */
function extractInstrumentUrl(searchHtml: string, baseUrl: string, isin: string): string | null {
  const $ = cheerio.load(searchHtml);
  let schedaWithIsin: string | null = null;
  let scheda: string | null = null;
  let withIsin: string | null = null;

  const isSelfSearch = (href: string): boolean => /\/searchengine\//i.test(href);

  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href || isSelfSearch(href)) return;
    const hasIsin = href.toUpperCase().includes(isin);
    const hasScheda = /scheda/i.test(href);
    if (hasScheda && hasIsin && !schedaWithIsin) schedaWithIsin = href;
    if (hasScheda && !scheda) scheda = href;
    if (hasIsin && !withIsin) withIsin = href;
  });

  const chosen = schedaWithIsin ?? scheda ?? withIsin;
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
    if (searchIndicatesNoResults(searchHtml)) {
      return { status: 'not-found' };
    }
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
