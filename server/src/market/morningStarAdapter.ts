import * as cheerio from 'cheerio';
import { parseMorningStar } from './morningStarParser.js';
import type { AdapterResult, AdapterOptions } from './borsaItalianaAdapter.js';
import { USER_AGENT } from './borsaItalianaAdapter.js';

/**
 * Adapter verso MorningStar (anti-corruption layer, fonte di backup).
 *
 * Espone lo stesso tipo di esito discriminato (`found` / `not-found` / `error`)
 * dell'adapter di Borsa Italiana, così da essere intercambiabile senza
 * accoppiare il resto dell'app a un secondo scraper.
 *
 * Buona cittadinanza: stesso User-Agent realistico di Borsa Italiana,
 * timeout per richiesta e al massimo due chiamate per ISIN (ricerca + scheda).
 */

const BASE_URL = 'https://global.morningstar.com/it';
const DEFAULT_TIMEOUT_MS = 8000;

function searchUrl(baseUrl: string, isin: string): string {
  return `${baseUrl}/search/#?q=${encodeURIComponent(isin)}&page=1`;
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
      throw new Error(`Risposta HTTP ${res.status} dalla fonte MorningStar`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dalla pagina dei risultati di ricerca MorningStar estrae l'URL della scheda.
 *
 * MorningStar restituisce link di scheda che contengono l'ISIN nel percorso
 * (es. `/it/etf/scheda/IE00BJRHVJ28.html`). I link auto-referenziali alla
 * pagina di ricerca e i link canonici sono esclusi.
 */
export function extractInstrumentUrl(searchHtml: string, baseUrl: string, isin: string): string | null {
  const $ = cheerio.load(searchHtml);
  let schedaWithIsin: string | null = null;
  let scheda: string | null = null;
  let withIsin: string | null = null;

  // Pattern di link da escludere (auto-referenziali o navigazione sito).
  const isSelfSearch = (href: string): boolean =>
    /search[/#]/i.test(href) || /\/search\b/i.test(href);

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
 * Recupera l'anagrafica di un titolo per ISIN da MorningStar.
 * Esegue al massimo due richieste (ricerca + scheda strumento).
 * Intercambiabile con `fetchSecurityByIsin` di Borsa Italiana.
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
    const security = parseMorningStar(pageHtml, normalized);

    // Pagina non riconducibile a uno strumento: nessuna denominazione né prezzo.
    if (security.name === null && security.price === null) {
      return { status: 'not-found' };
    }

    return { status: 'found', security };
  } catch (err) {
    return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
}

export type { AdapterResult, AdapterOptions };
