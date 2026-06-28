/**
 * Tipi del seam MorningStar (US-024).
 *
 * Separano il *cosa* (i dati grezzi raccolti dalla fonte) dal *come* (il browser
 * headless che li raccoglie). Il parser dipende solo da questi tipi, mai dal
 * browser: così la mappatura `bundle → SecurityInfo` resta una funzione pura
 * testabile senza avviare Chromium, e il renderer reale è iniettabile/mockabile.
 */

/** Sottoinsieme dei campi utili dalle risposte JSON `us-api.morningstar.com/sal-service`. */
export interface MorningStarSalData {
  /** Valuta base dello strumento (es. "EUR"). */
  baseCurrency?: string | null;
  /** Categoria Morningstar, usata come segmento (es. "EUR High Yield Bond"). */
  categoryName?: string | null;
  /** Paese di domicilio (ISO, es. "IRL"). */
  domicileCountryId?: string | null;
  /** Data di riferimento del dato. */
  asOfDate?: string | null;
}

/**
 * Dati grezzi normalizzati raccolti dalla scheda strumento MorningStar.
 * Tutto ciò che il parser deve sapere, senza alcun dettaglio del browser.
 */
export interface MorningStarBundle {
  /** URL della scheda strumento risolta (per tracciabilità/diagnostica). */
  instrumentUrl: string;
  /** Tipo strumento dedotto dal percorso URL ("Fund" / "ETF" / "Stock"), o null. */
  instrumentType: string | null;
  /** Denominazione letta dall'`h1` della scheda, o null. */
  h1: string | null;
  /** Testo grezzo del prezzo/NAV dall'header (best-effort), o null. */
  priceText: string | null;
  /** `true` se la scheda risolta contiene l'ISIN richiesto (anti-titolo-errato). */
  isinPresent: boolean;
  /** Campi strutturati intercettati dalle API `sal-service`. */
  sal: MorningStarSalData;
}

/** Opzioni passate al renderer per una singola risoluzione. */
export interface MorningStarRenderOptions {
  /** Timeout per singola navigazione (ms). */
  timeoutMs: number;
}

/**
 * Seam iniettabile: data un ISIN, restituisce il bundle grezzo della scheda,
 * oppure `null` quando nessuno strumento è risolto (→ `not-found`).
 * Lancia su blocco/timeout/errore di rete (→ `error` lato adapter).
 */
export type MorningStarRenderer = (
  isin: string,
  options: MorningStarRenderOptions,
) => Promise<MorningStarBundle | null>;
