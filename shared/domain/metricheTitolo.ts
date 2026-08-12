/**
 * Le due metriche della scheda titolo (US-038, FR-011, FR-012).
 *
 * Sono **due misure distinte**, e l'intero valore di questo modulo sta nel non
 * farle confondere:
 *
 * - il **P&L da carico** misura il denaro dell'utente contro quello che ha
 *   speso. Discende dai carichi e dal prezzo corrente, e non sa nulla della
 *   finestra temporale scelta nel grafico;
 * - la **variazione di periodo** misura il mercato dentro la finestra scelta.
 *   Discende dalle sole rilevazioni comprese nel ritaglio, e non sa nulla di
 *   quanto l'utente abbia speso né di quante quote possieda.
 *
 * Un titolo può essere in guadagno da carico e in calo nell'ultimo anno: sono
 * due fatti veri insieme, e sommarli o confrontarli sarebbe un errore.
 *
 * Come per `serieTitolo.ts`, le funzioni sono **pure**: nessuna rete, nessun
 * archivio, nessun orologio.
 */

// `import type` e non un import a runtime: `types/index.ts` riesporta questo
// modulo, quindi un import di valori creerebbe un ciclo fra i due file.
import type { Position } from '../types/index.js';
import type { PuntoSerie } from './serieTitolo.js';

/** Un giorno civile in millisecondi, l'unità di `PuntoSerie.at`. */
const MS_GIORNO = 24 * 60 * 60 * 1000;

// ─── P&L da carico ───────────────────────────────────────────────────────────

/** Il carico, ridotto ai due soli campi che il P&L legge. */
export type CaricoPnl = Pick<Position, 'loadPrice' | 'quantity'>;

/** Ingresso di `calcolaPnlDaCarico`. */
export interface CalcolaPnlInput {
  /** I carichi che compongono la posizione. */
  loads: readonly CaricoPnl[];
  /** Prezzo corrente dall'archivio; `null` quando non è in cache. */
  currentPrice: number | null;
}

/**
 * Il P&L da carico, nella stessa forma che `PositionDetail` già espone.
 *
 * I tre campi derivati dal prezzo corrente sono nullable e `null` significa
 * **dato non disponibile**: mai zero, mai un valore stimato. È la stessa
 * disciplina di ADR-003 applicata ai valori calcolati.
 */
export interface PnlDaCarico {
  /** Somma delle quantità di tutti i carichi: Σ(quantity). */
  totalQuantity: number;
  /** Prezzo medio di carico **ponderato sulle quantità**: Σ(load_price × quantity) / Σ(quantity). */
  avgLoadPrice: number;
  /** Controvalore totale di carico: avgLoadPrice × totalQuantity. */
  totalLoadValue: number;
  /** Valore attuale: currentPrice × totalQuantity, `null` senza prezzo corrente. */
  currentValue: number | null;
  /** Differenza: currentValue − totalLoadValue, `null` senza prezzo corrente. */
  difference: number | null;
  /** Differenza in percentuale sul controvalore di carico, `null` se non calcolabile. */
  differencePercent: number | null;
}

/**
 * Il P&L della posizione rispetto al prezzo medio ponderato di carico.
 *
 * **L'ordine delle operazioni non si «semplifica».** Il conto è
 * `currentPrice × qty − avgLoadPrice × qty`, e **non**
 * `(currentPrice − avgLoadPrice) × qty`: algebricamente identici, in virgola
 * mobile no. Questa funzione è l'estrazione *letterale* dell'aritmetica che il
 * gestore di `GET /api/portfolios/:id/positions/:isin/detail` faceva in linea, e
 * la scheda mostra il suo esito in due punti — la casella «Differenza» di
 * *Posizione a conto* e il riquadro del P&L sotto il grafico. Riscrivere la
 * formula in forma raccolta cambierebbe l'ultimo bit in casi rari e farebbe
 * divergere di un centesimo proprio le due letture che devono coincidere, con
 * ogni test verde perché nessuno confronta i due percorsi.
 *
 * La media è **ponderata sulle quantità** e non aritmetica sui prezzi: le due
 * coincidono solo a quantità uguali, e la ponderata è la sola che risponda alla
 * domanda «quanto ho speso in media per una quota».
 */
export function calcolaPnlDaCarico({ loads, currentPrice }: CalcolaPnlInput): PnlDaCarico {
  const totalQuantity = loads.reduce((sum, row) => sum + row.quantity, 0);
  const weightedSum = loads.reduce((sum, row) => sum + row.loadPrice * row.quantity, 0);
  // Posizione a quantità totale nulla: la media non è definita e non viene
  // inventata dividendo per zero, che darebbe `NaN` o `Infinity`.
  const avgLoadPrice = totalQuantity > 0 ? weightedSum / totalQuantity : 0;
  const totalLoadValue = avgLoadPrice * totalQuantity;

  const currentValue = currentPrice !== null ? currentPrice * totalQuantity : null;
  const difference = currentValue !== null ? currentValue - totalLoadValue : null;
  // La percentuale è definita solo su un controvalore di carico non nullo:
  // dividere per zero produrrebbe Infinity, cioè un numero inventato.
  const differencePercent =
    difference !== null && totalLoadValue !== 0 ? (difference / totalLoadValue) * 100 : null;

  return {
    totalQuantity,
    avgLoadPrice,
    totalLoadValue,
    currentValue,
    difference,
    differencePercent,
  };
}

// ─── Variazione di periodo ───────────────────────────────────────────────────

/** Ingresso di `calcolaVariazionePeriodo`. */
export interface CalcolaVariazioneInput {
  /**
   * I punti **già ritagliati** sulla finestra scelta — cioè
   * `ritagliaSerie(...).punti` — e già ordinati per istante crescente, come li
   * produce `componiSerieTitolo`.
   *
   * **Contratto:** la funzione non ritaglia e non riordina. Passarle la serie
   * intera misurerebbe un periodo diverso da quello mostrato a schermo, e nulla
   * lo segnalerebbe.
   */
  punti: readonly PuntoSerie[];
}

/**
 * Esito della variazione di periodo: un'**unione discriminata**, perché il tipo
 * deve rendere *impossibile* leggere un valore che non esiste.
 *
 * Un `valore: number` con `0` di ripiego non sarebbe un dettaglio di resa:
 * «0,00 %» afferma che il prezzo non si è mosso, che è un'affermazione diversa
 * da «non lo so» (ADR-003, FR-012).
 */
export type VariazionePeriodo =
  | {
      stato: 'disponibile';
      /** La **prima** rilevazione compresa nella finestra. */
      prima: PuntoSerie;
      /** L'**ultima** rilevazione compresa nella finestra. */
      ultima: PuntoSerie;
      /** Differenza di prezzo unitario fra i due capi: `ultima − prima`. */
      valore: number;
      /**
       * Variazione percentuale sul prezzo del primo capo. `null` — mai
       * `Infinity` — quando la prima rilevazione è a prezzo zero: il valore
       * assoluto resta misurato, la percentuale no.
       */
      percentuale: number | null;
      /**
       * Giorni **trascorsi** fra i due capi, arrotondati al giorno intero.
       *
       * Non giorni *civili*: i due capi sono istanti reali, e due rilevazioni di
       * giorni consecutivi distanti 38 ore contano 2. La distinzione ha un nome
       * altrove (`giornoCivilePunto`) e qui non serve — la cifra accompagna la
       * frase «N giorni fra i due capi», non un conteggio di calendario.
       */
      giorni: number;
      /** Quante rilevazioni cadono nella finestra (i capi inclusi). */
      rilevazioniComprese: number;
    }
  | {
      stato: 'non-disponibile';
      /** Quante rilevazioni cadono nella finestra: 0 oppure 1. */
      rilevazioniComprese: number;
      /** L'unica rilevazione compresa, quando ce n'è esattamente una; `null` altrimenti. */
      unica: PuntoSerie | null;
    };

/** Quante rilevazioni servono per misurare un movimento: un capo da cui partire e uno a cui arrivare. */
export const RILEVAZIONI_MINIME_VARIAZIONE = 2;

/**
 * La variazione del prezzo dentro la finestra scelta, misurata fra la **prima**
 * e l'**ultima rilevazione** comprese nel ritaglio.
 *
 * **I prezzi di carico non entrano nel conto.** Un prezzo di carico dice quanto
 * ha pagato *l'utente*, non a quanto il mercato scambiava il titolo: includerlo
 * misurerebbe le sue decisioni invece del movimento del titolo. Ne segue una
 * conseguenza da dichiarare a schermo: una finestra con tre carichi e una sola
 * rilevazione è «dato non disponibile», e va spiegato perché i carichi non
 * contano.
 *
 * **Lo zero misurato non è l'assenza.** Due rilevazioni allo stesso prezzo danno
 * `valore: 0` e sono `disponibile`: il divieto riguarda lo zero al posto
 * dell'assenza, non lo zero come misura. Una guardia scritta `if (!valore)`
 * romperebbe proprio questo caso, e la rottura sarebbe invisibile — un dato
 * piatto reso indistinguibile da un dato assente.
 */
export function calcolaVariazionePeriodo({ punti }: CalcolaVariazioneInput): VariazionePeriodo {
  const rilevazioni = punti.filter(
    (p) => p.origin === 'rilevazione' && Number.isFinite(p.at) && Number.isFinite(p.price),
  );
  const rilevazioniComprese = rilevazioni.length;

  if (rilevazioniComprese < RILEVAZIONI_MINIME_VARIAZIONE) {
    return {
      stato: 'non-disponibile',
      rilevazioniComprese,
      unica: rilevazioniComprese === 1 ? rilevazioni[0] : null,
    };
  }

  // I capi si prendono per posizione e non con un min/max sugli istanti: i punti
  // arrivano già ordinati da `componiSerieTitolo`, che a pari istante ha già
  // sciolto il pari merito. Ricalcolare qui l'ordine potrebbe scioglierlo in un
  // altro modo, e due letture della stessa serie divergerebbero.
  const prima = rilevazioni[0];
  const ultima = rilevazioni[rilevazioniComprese - 1];

  const valore = ultima.price - prima.price;
  const percentuale = prima.price !== 0 ? (valore / prima.price) * 100 : null;
  const giorni = Math.max(0, Math.round((ultima.at - prima.at) / MS_GIORNO));

  return { stato: 'disponibile', prima, ultima, valore, percentuale, giorni, rilevazioniComprese };
}
