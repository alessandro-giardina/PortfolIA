import type { ReactNode } from 'react';

/**
 * La cella **«Denominazione · ISIN»**: il nome del titolo in evidenza, il codice
 * sotto in caratteri minori (US-046, FR-005).
 *
 * Esiste per una ragione sola: la stessa resa era scritta due volte nel Riepilogo
 * — tabella dei posseduti e «Posizioni chiuse» — e US-046 ne chiede una terza e
 * una quarta nelle due tabelle di «Carico titoli». Quattro copie della stessa
 * cella divergono al primo ritocco, e divergono in silenzio: due tabelle della
 * stessa scheda mostrerebbero lo stesso titolo in due modi diversi.
 *
 * Due dettagli non sono decorativi e vanno tenuti insieme:
 *
 * - **l'ISIN non sparisce mai.** Quando la denominazione manca la cella mostra il
 *   solo codice, senza etichette sostitutive né trattini: «denominazione ignota»
 *   occuperebbe la riga per dire che non c'è nulla da dire, e il trattino —
 *   altrove in tabella significa «questa misura non esiste» — qui affermerebbe il
 *   falso, perché l'ISIN esiste eccome;
 * - **l'`opacity` dell'ISIN dipende dalla presenza del nome.** Con il nome sopra,
 *   il codice è la riga di servizio e sta a 0.7; da solo torna a piena opacità,
 *   perché è l'unica cosa che identifica il titolo.
 *
 * Lo slot `children` serve al badge «↺ riaperta» di US-044, che si inserisce fra
 * denominazione e ISIN nella sola tabella dei posseduti. È l'unico punto in cui
 * le quattro celle differiscono, ed è per questo un parametro invece di quattro
 * varianti del componente.
 */
export interface CellaTitoloProps {
  /** Codice ISIN: sempre reso, anche quando è l'unica cosa nota. */
  isin: string;
  /** Denominazione dalla cache anagrafica, `null` quando non disponibile. */
  nome: string | null;
  /** Contenuto opzionale fra denominazione e ISIN (il badge «↺ riaperta»). */
  children?: ReactNode;
}

export default function CellaTitolo({ isin, nome, children }: CellaTitoloProps) {
  return (
    <span className="voce">
      {nome ? <strong>{nome}</strong> : null}
      {children}
      <small style={{ display: 'block', letterSpacing: '.08em', opacity: nome ? 0.7 : 1 }}>{isin}</small>
    </span>
  );
}
