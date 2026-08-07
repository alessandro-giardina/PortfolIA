/**
 * Nomi univoci per le risorse create dai test E2E.
 *
 * I nomi fissi (per esempio "Conto Unico" in US-004) sono una classe di difetti
 * per costruzione: alla seconda esecuzione la risorsa esiste già, quindi il test
 * verifica un percorso diverso da quello che dichiara di verificare. Un nome
 * univoco per esecuzione elimina il problema alla radice.
 *
 * Il suffisso non è solo un timestamp: include l'indice del worker, così due
 * worker che partono nello stesso millisecondo non collidono, e un contatore
 * locale, così due chiamate consecutive nello stesso worker restano distinte.
 *
 * Il formato è anche un *marcatore*: `bonifica.ts` lo riconosce per ripulire i
 * residui lasciati da un run interrotto, senza toccare dati veri.
 */

/** Indice del worker Playwright corrente (0 fuori da un worker). */
function indiceWorker(): number {
  const grezzo = process.env.TEST_WORKER_INDEX;
  const n = grezzo === undefined ? Number.NaN : Number(grezzo);
  return Number.isInteger(n) ? n : 0;
}

let progressivo = 0;

/**
 * Riconosce il suffisso prodotto da `nomeUnico`: ` e2e-<worker>-<epoch>-<seq>`.
 * Usato dalla bonifica per identificare i portafogli generati dalla suite.
 *
 * Volutamente non ancorato a fine stringa: uno scenario può rinominare ciò che ha
 * creato (US-006 aggiunge "-Rinominato"), e un residuo rinominato deve restare
 * riconoscibile. Il marcatore è comunque abbastanza specifico da non poter
 * comparire in un nome scelto da una persona.
 */
export const MARCATORE_E2E = / e2e-\d+-\d+-\d+/;

/** Costruisce un nome univoco a partire da un prefisso leggibile. */
export function nomeUnico(prefisso: string): string {
  progressivo += 1;
  return `${prefisso} e2e-${indiceWorker()}-${Date.now()}-${progressivo}`;
}
