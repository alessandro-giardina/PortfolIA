import type { EnrichedPositionSummary } from '@portfolia/shared';
import { RAGGIO_CIAMBELLA, calcolaComposizione } from '../domain/composizione.js';
import { importo } from '../domain/formattazione.js';
import CellaTitolo from './CellaTitolo.js';

export interface ComposizioneProps {
  /**
   * Le posizioni arricchite del portafoglio, **solo quelle aperte**
   * (quantità residua maggiore di zero): una posizione interamente venduta
   * non deve comparire come fetta a valore zero né alterare il conteggio
   * della nota di chiusura (US-066). Chi monta il componente passa lo stesso
   * array `posizioniAperte` già calcolato da `useDatiPortafoglio`, la
   * medesima convenzione di `AggiornaObsoleti`.
   */
  posizioniAperte: readonly EnrichedPositionSummary[];
}

/**
 * La palette dei colori delle fette, presa dai soli accenti che `quadro.css`
 * già definisce (nessun colore inventato). Le posizioni possono superarne il
 * numero: la palette viene allora ciclata, {@link coloreFetta}.
 */
const PALETTE_FETTE = [
  '--accento',
  '--viola',
  '--ciano',
  '--ambra',
  '--guadagno',
  '--accento-2',
  '--perdita',
] as const;

/** Il colore della fetta all'indice `i`, ciclando la palette quando le posizioni la superano. */
function coloreFetta(indice: number): string {
  return `var(${PALETTE_FETTE[indice % PALETTE_FETTE.length]})`;
}

/**
 * La nota di chiusura del pannello: quante posizioni entrano nel calcolo e,
 * quando ce n'è, quante ne restano fuori per prezzo mancante.
 *
 * Non è un dettaglio tipografico: la regola della spec è che una posizione
 * esclusa va **detta**, mai omessa in silenzio — la stessa regola che
 * `MetrichePortafoglio` applica al proprio perimetro parziale.
 */
function notaChiusura(numeroIncluse: number, numeroEscluse: number): string {
  const posizioniIncluse = numeroIncluse === 1 ? '1 posizione' : `${numeroIncluse} posizioni`;

  if (numeroEscluse === 0) {
    return numeroIncluse === 0
      ? 'Nessuna posizione in portafoglio.'
      : `Calcolato sulle ${posizioniIncluse} con prezzo.`;
  }

  const posizioniEscluse = numeroEscluse === 1 ? '1 posizione esclusa' : `${numeroEscluse} posizioni escluse`;

  if (numeroIncluse === 0) {
    return `Nessuna posizione valorizzata: ${posizioniEscluse} per prezzo mancante.`;
  }

  return `Calcolato sulle ${posizioniIncluse} con prezzo — ${posizioniEscluse} per prezzo mancante.`;
}

/**
 * Il pannello «Composizione»: la ciambella del valore attuale per posizione,
 * con la legenda a fianco (US-051/TASK-06, mockup `docs/mockups/US-051/`,
 * sezione `.composizione`).
 *
 * Nessuna chiamata di rete: le posizioni arricchite arrivano già complete da
 * chi monta la pagina (`useDatiPortafoglio`), la stessa fonte di
 * `QuadroRisultato` e `MetrichePortafoglio` — due letture dello stesso array
 * non possono divergere fra loro.
 *
 * La geometria delle fette è calcolata da {@link calcolaComposizione}
 * (dominio puro, testato indipendentemente): questo componente si limita a
 * disegnarla e a colorarla.
 */
export default function Composizione({ posizioniAperte }: ComposizioneProps) {
  const { fette, totale, numeroIncluse, numeroEscluse } = calcolaComposizione(posizioniAperte);

  return (
    <div className="composizione" data-testid="composizione-portafoglio">
      <div className="ciambella">
        <svg viewBox="0 0 100 100" role="img" aria-label="Composizione del portafoglio per valore attuale">
          <circle cx={50} cy={50} r={RAGGIO_CIAMBELLA} fill="none" stroke="var(--superficie-3)" strokeWidth={12} />
          {fette.map((fetta, indice) => (
            <circle
              key={fetta.isin}
              cx={50}
              cy={50}
              r={RAGGIO_CIAMBELLA}
              fill="none"
              stroke={coloreFetta(indice)}
              strokeWidth={12}
              strokeDasharray={fetta.strokeDasharray}
              strokeDashoffset={fetta.strokeDashoffset}
              strokeLinecap="butt"
              transform="rotate(-90 50 50)"
              data-isin={fetta.isin}
            />
          ))}
        </svg>
        <div className="centro">
          <span className="et">Valorizzato</span>
          <span className="cifra">€ {importo(totale)}</span>
        </div>
      </div>

      <div className="elenco-quote">
        {fette.map((fetta, indice) => (
          <div className="quota" key={fetta.isin}>
            <span className="punto" style={{ background: coloreFetta(indice) }} aria-hidden="true" />
            <CellaTitolo isin={fetta.isin} nome={fetta.name} />
            <span className="valori">
              <b>€ {importo(fetta.currentValue)}</b>
              <span>{importo(fetta.percentuale)} %</span>
            </span>
          </div>
        ))}
      </div>

      <p className="nota-composizione">{notaChiusura(numeroIncluse, numeroEscluse)}</p>
    </div>
  );
}
