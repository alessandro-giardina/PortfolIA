import { parseMorningStar } from './morningStarParser.js';
import type { AdapterResult } from './borsaItalianaAdapter.js';
import type { MorningStarRenderer } from './morningStarTypes.js';
import { renderMorningStar } from './morningStarBrowser.js';

/**
 * Adapter verso MorningStar (anti-corruption layer, fonte di backup — US-024).
 *
 * Espone lo stesso esito discriminato (`found` / `not-found` / `error`)
 * dell'adapter di Borsa Italiana, così da essere intercambiabile senza
 * accoppiare il resto dell'app a un secondo recuperatore.
 *
 * La fonte è raggiungibile solo via browser headless (vedi `morningStarBrowser`),
 * isolato dietro il seam iniettabile `MorningStarRenderer`: i test unitari
 * iniettano un renderer mockato e non avviano mai un browser reale.
 */

const DEFAULT_TIMEOUT_MS = 15000;

/** Opzioni dell'adapter MorningStar. */
export interface MorningStarAdapterOptions {
  /** Renderer iniettabile per i test; default = browser reale. */
  renderer?: MorningStarRenderer;
  /** Timeout per singola navigazione (ms). */
  timeoutMs?: number;
}

/**
 * Recupera l'anagrafica di un titolo per ISIN da MorningStar.
 * Intercambiabile con `fetchSecurityByIsin` di Borsa Italiana.
 */
export async function fetchSecurityByIsin(
  isin: string,
  options: MorningStarAdapterOptions = {},
): Promise<AdapterResult> {
  const renderer = options.renderer ?? renderMorningStar;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const normalized = isin.trim().toUpperCase();

  try {
    const bundle = await renderer(normalized, { timeoutMs });

    // Nessuno strumento risolto per questo ISIN.
    if (bundle === null) {
      return { status: 'not-found' };
    }

    // Anti-titolo-errato: la scheda risolta deve contenere l'ISIN richiesto.
    if (!bundle.isinPresent) {
      return { status: 'not-found' };
    }

    const security = parseMorningStar(bundle, normalized);

    // Scheda non riconducibile a uno strumento: nessuna denominazione né prezzo.
    if (security.name === null && security.price === null) {
      return { status: 'not-found' };
    }

    return { status: 'found', security };
  } catch (err) {
    return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
}

export type { AdapterResult };
