import type { EnrichedPositionSummary } from '@portfolia/shared';

/**
 * Raggio della ciambella, in unit&agrave; di `viewBox` SVG (US-051/TASK-06).
 *
 * Fisso e condiviso fra dominio e componente: `Composizione.tsx` disegna il
 * `<circle>` con questo stesso raggio, e la circonferenza qui sotto &egrave;
 * la base di ogni `stroke-dasharray`/`stroke-dashoffset` calcolato da
 * {@link calcolaComposizione}. Cambiarlo qui lo cambia ovunque.
 */
export const RAGGIO_CIAMBELLA = 40;

/** Circonferenza della ciambella: `2 * PI * RAGGIO_CIAMBELLA`. */
export const CIRCONFERENZA_CIAMBELLA = 2 * Math.PI * RAGGIO_CIAMBELLA;

/** Una fetta della ciambella: una posizione valorizzata, con la sua geometria SVG. */
export interface FettaComposizione {
  /** Codice ISIN della posizione — identifica la fetta e il suo colore. */
  isin: string;
  /** Denominazione dalla cache anagrafica, `null` se non disponibile. */
  name: string | null;
  /** Valore attuale della posizione: `currentPrice &times; totalQuantity`, mai `null` qui. */
  currentValue: number;
  /** Quota percentuale sul totale valorizzato, 0-100. */
  percentuale: number;
  /**
   * Valore dell'attributo SVG `stroke-dasharray`: `"<arco> <resto>"`, dove
   * `<arco>` &egrave; la lunghezza del segmento e `<resto>` completa la
   * circonferenza (tecnica standard del donut chart via `stroke-dasharray`).
   */
  strokeDasharray: string;
  /**
   * Valore dell'attributo SVG `stroke-dashoffset`: il **negativo** della somma
   * degli archi di tutte le fette precedenti, cos&igrave; che ciascuna fetta
   * cominci dove finisce la precedente invece di sovrapporsi alle altre.
   */
  strokeDashoffset: number;
}

/** Esito del calcolo della composizione del portafoglio (US-051/TASK-06). */
export interface Composizione {
  /** Le fette della ciambella, una per posizione con `currentValue !== null`, nello stesso ordine dell'input. */
  fette: FettaComposizione[];
  /** Somma dei `currentValue` delle sole posizioni incluse. */
  totale: number;
  /** Quante posizioni sono entrate nel calcolo (`currentValue !== null`). */
  numeroIncluse: number;
  /** Quante posizioni sono state escluse per prezzo mancante (`currentValue === null`). */
  numeroEscluse: number;
}

/**
 * Calcola la composizione del portafoglio per il pannello «Composizione»
 * (US-051/TASK-06, mockup `docs/mockups/US-051/index.html`).
 *
 * Una posizione entra nel calcolo solo se ha un prezzo noto
 * (`currentValue !== null`): senza prezzo non esiste un valore da mettere in
 * proporzione con le altre, e forzarne uno a zero mescolerebbe «vale zero»
 * con «non lo sappiamo» &mdash; la stessa distinzione che il resto del
 * dominio (`MetrichePortafoglio`, `QuadroRisultato`) tiene sempre separata.
 * La posizione esclusa non sparisce per&ograve; in silenzio: la funzione
 * restituisce anche `numeroEscluse`, e il componente lo scrive per esteso
 * nella nota di chiusura del pannello.
 *
 * La geometria di ciascuna fetta segue la tecnica standard del donut chart
 * SVG via `stroke-dasharray`/`stroke-dashoffset`: un cerchio di raggio fisso
 * ({@link RAGGIO_CIAMBELLA}) viene "tagliato" a tratteggio, un segmento per
 * fetta, ciascuno lungo quanto la sua quota di circonferenza e spostato
 * dell'arco gi&agrave; percorso dalle fette precedenti, cos&igrave; che le
 * fette si susseguano senza sovrapporsi.
 *
 * Pura: nessuna chiamata di rete, nessun accesso a `window`/`document
 * &mdash; solo aritmetica sull'array ricevuto, nello stesso ordine.
 */
export function calcolaComposizione(posizioni: readonly EnrichedPositionSummary[]): Composizione {
  const incluse = posizioni.filter(
    (posizione): posizione is EnrichedPositionSummary & { currentValue: number } => posizione.currentValue !== null,
  );
  const numeroEscluse = posizioni.length - incluse.length;
  const totale = incluse.reduce((somma, posizione) => somma + posizione.currentValue, 0);

  let arcoPercorso = 0;
  const fette: FettaComposizione[] = incluse.map((posizione) => {
    const quota = totale > 0 ? posizione.currentValue / totale : 0;
    const lunghezzaArco = quota * CIRCONFERENZA_CIAMBELLA;
    const fetta: FettaComposizione = {
      isin: posizione.isin,
      name: posizione.name,
      currentValue: posizione.currentValue,
      percentuale: quota * 100,
      strokeDasharray: `${lunghezzaArco} ${CIRCONFERENZA_CIAMBELLA - lunghezzaArco}`,
      strokeDashoffset: -arcoPercorso,
    };
    arcoPercorso += lunghezzaArco;
    return fetta;
  });

  return { fette, totale, numeroIncluse: incluse.length, numeroEscluse };
}
