import { Link } from 'react-router-dom';
import { useDesign } from '../hooks/useDesign.js';
import { useTema } from '../hooks/useTema.js';
import type { GuscioProps } from './Guscio.js';
import type { Linguetta } from './Foglio.js';

/**
 * Props del guscio «quadro strumenti» — stessa forma di `GuscioProps`
 * (quindi di `FoglioProps`) così che `Guscio` possa inoltrarle senza
 * adattamenti. `Quadro` è libero di rimappare il significato di ciascun
 * campo sulla propria struttura visiva (sidebar + testata + contenuto):
 * la fedeltà completa a card KPI/tabella/grafico è compito dei task
 * successivi (TASK-04/05) — qui esiste solo il guscio.
 */
export type QuadroProps = GuscioProps;

/** Icona SVG per ciascuna voce di navigazione, tenuta minima e senza pretese di fedeltà pixel-perfect. */
function iconaVoce(chiave: string) {
  switch (chiave) {
    case 'portafogli':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case 'riepilogo':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case 'carico':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'ricerca':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case 'titolo':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M9 12h7M9 16h5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

/**
 * Renderizza una `Linguetta` come voce della barra laterale (`.voce-nav`).
 * Riusa la stessa semantica di stato di `Foglio` (attiva/cliccabile/
 * disabilitata) — la navigazione completa (routing, evidenziazione della
 * scheda attiva) resta compito di TASK-08; qui la voce è resa in modo
 * ragionevole ma non è ancora rifinita.
 */
function renderVoceNav(l: Linguetta) {
  const icona = iconaVoce(l.chiave);

  if (l.stato === 'disabilitata') {
    return (
      <span key={l.chiave} className="voce-nav disabilitata" aria-disabled="true">
        {icona}
        {l.etichetta}
      </span>
    );
  }

  if (l.stato === 'cliccabile' && l.to) {
    return (
      <Link key={l.chiave} className="voce-nav" to={l.to}>
        {icona}
        {l.etichetta}
      </Link>
    );
  }

  if (l.stato === 'cliccabile') {
    return (
      <a key={l.chiave} className="voce-nav" onClick={l.onClick} style={{ cursor: 'pointer' }}>
        {icona}
        {l.etichetta}
      </a>
    );
  }

  // stato === 'attiva'
  return (
    <a
      key={l.chiave}
      className="voce-nav attiva"
      href={l.href}
      onClick={l.onClick}
      aria-current="page"
      style={l.onClick ? { cursor: 'pointer' } : undefined}
    >
      {icona}
      {l.etichetta}
    </a>
  );
}

/**
 * Guscio "quadro strumenti" (US-051), alternativa al foglio di libro
 * mastro (`Foglio.tsx`). Replica la struttura del mockup
 * `docs/mockups/US-051/index.html`: barra laterale con marchio e
 * navigazione, testata con briciole e azioni, contenuto della pagina.
 *
 * Questo componente fornisce solo l'impalcatura (TASK-02): le card KPI,
 * la tabella dei titoli e il grafico arrivano nei task successivi, e lo
 * stile vero e proprio in `client/src/quadro.css` (TASK-04) — per ora le
 * classi usate qui non sono ancora rifinite graficamente.
 */
export default function Quadro({
  marchio,
  titolo,
  titoloCorsivo,
  sottotesto,
  registro,
  linguette,
  children,
}: QuadroProps) {
  const { commutaDesign } = useDesign();
  const { commutaTema } = useTema();

  const vociTornaAllElenco = linguette.find((l) => l.chiave === 'portafogli');

  return (
    <div className="guscio">
      <aside className="barra-laterale" data-testid="barra-laterale">
        <div className="marchio">
          <span className="segno" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l5-6 4 4 5-8 4 5" />
            </svg>
          </span>
          <span>
            <span className="nome">PortfolIA</span>
            <span className="coda">Quadro strumenti</span>
          </span>
        </div>

        <nav className="gruppo-nav" aria-label="Navigazione principale">
          <span className="et-nav">Registro</span>
          {linguette.map(renderVoceNav)}
        </nav>

        <div className="piede-laterale">
          <span>PortfolIA</span>
        </div>
      </aside>

      <main className="principale">
        <header className="testata">
          <nav className="briciole" aria-label="Percorso">
            {vociTornaAllElenco?.to ? (
              <Link to={vociTornaAllElenco.to}>Portafogli</Link>
            ) : vociTornaAllElenco?.href ? (
              <a href={vociTornaAllElenco.href}>Portafogli</a>
            ) : (
              <span>{marchio}</span>
            )}
            <span className="sep">/</span>
            <b title={sottotesto}>
              {titolo}
              {titoloCorsivo}
            </b>
          </nav>
          <div className="azioni-testata">
            <div className="colonna-registro">{registro}</div>
            <button
              type="button"
              className="icona-bottone"
              data-testid="toggle-tema"
              aria-label="Alterna tema chiaro e scuro"
              onClick={commutaTema}
            >
              <svg
                className="solo-scuro"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
              </svg>
              <svg
                className="solo-chiaro"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
              </svg>
            </button>
            <button type="button" className="bottone nudo" onClick={commutaDesign}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 2.5h4.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1 1 0 0 0-1-1H2z" />
                <path d="M14 2.5H9.5A1.5 1.5 0 0 0 8 4v9.5a1 1 0 0 1 1-1h5z" />
              </svg>
              Libro Mastro
            </button>
          </div>
        </header>

        <div className="contenuto">{children}</div>
      </main>
    </div>
  );
}
