import type { PuntoSerie } from '@portfolia/shared';
import { giornoCivilePunto } from '@portfolia/shared';
import { dataCarico, dataRegistro } from './Foglio.js';

/**
 * La tela del tracciato, in unità del `viewBox`. Il disegno non è responsivo in
 * unità: lo diventa perché `svg.tracciato` è largo il 100% del contenitore e la
 * proporzione la tiene il `viewBox` (vedi `.grafico-cornice` in `ledger.css`).
 */
export const TELA = { larghezza: 960, altezza: 304 };

/** Il riquadro disegnabile dentro la tela: fuori da qui stanno assi ed etichette. */
export const RIQUADRO = { sinistra: 88, destra: 884, alto: 34, basso: 254 };

/**
 * Respiro verticale fra il riquadro e i segni.
 *
 * È una scelta di resa, non di dominio: `calcolaScalaSerie` fissa `yMin`/`yMax`
 * sui prezzi effettivi, quindi senza questo margine il punto più alto e quello
 * più basso finirebbero a cavallo della cornice, mezzi dentro e mezzi fuori. Il
 * dominio non viene toccato — si comprime la banda su cui lo si proietta.
 */
export const MARGINE_SEGNO = 10;

export const MS_GIORNO = 24 * 60 * 60 * 1000;

/** Prezzo a due decimali, per le etichette della scala dei prezzi. */
export function prezzoScala(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Conteggio con separatore delle migliaia, es. "1.785". */
export function conteggio(valore: number): string {
  return valore.toLocaleString('it-IT');
}

/**
 * Data di un **punto della serie** in stile registro (es. "19.IX.2021").
 *
 * Il giorno lo decide `giornoCivilePunto`, non questa funzione, e la ragione è
 * che `PuntoSerie.at` porta due nature diverse sotto un solo campo: il carico
 * nasce da una data civile ancorata a mezzanotte UTC, la rilevazione è un
 * istante reale. Leggere i campi *locali* di entrambi farebbe scivolare il
 * carico al giorno prima a ogni offset negativo — e la stessa scheda direbbe
 * due date diverse per lo stesso carico, una nella tabella «Carichi registrati»
 * e una nel grafico. La resa è poi affidata a `dataCarico`, lo stesso
 * formattatore di quella tabella: unico giorno, unico modo di scriverlo.
 */
export function dataPunto(punto: Pick<PuntoSerie, 'at' | 'origin'>): string {
  return dataCarico(giornoCivilePunto(punto));
}

/**
 * Data di un istante **reale** (l'orologio di oggi) in stile registro.
 *
 * Qui il fuso locale è la lettura giusta, non un difetto: «oggi» è oggi per chi
 * guarda. `PuntoSerie.at` è in millisecondi mentre `dataRegistro` distingue
 * secondi e millisecondi con una soglia: la divisione esplicita evita di
 * appoggiarsi a quell'euristica, che su un istante anteriore al 2001
 * sceglierebbe l'unità sbagliata.
 */
export function dataIstante(at: number): string {
  return dataRegistro(Math.floor(at / 1000));
}

/** Giorni civili fra due istanti, mai negativi. */
export function giorniFra(da: number, a: number): number {
  return Math.max(0, Math.round((a - da) / MS_GIORNO));
}

/** Una coordinata di tela con un solo decimale: il markup resta leggibile. */
export function a1(valore: number): number {
  return Math.round(valore * 10) / 10;
}

/** Il rombo del prezzo di carico, centrato sul punto. */
export function rombo(cx: number, cy: number): string {
  return `M${cx},${a1(cy - 7)} L${a1(cx + 6.7)},${cy} L${cx},${a1(cy + 7)} L${a1(cx - 6.7)},${cy} Z`;
}
