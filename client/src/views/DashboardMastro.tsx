import type { Portfolio } from '@portfolia/shared';
import CreatePortfolioForm from '../components/CreatePortfolioForm.js';
import { dataRegistro } from '../components/Foglio.js';

/**
 * Le props della scheda "elenco portafogli" (US-053): questa, `DashboardMastro`,
 * e la gemella `DashboardQuadro` introdotta in un task successivo. Entrambe
 * leggono lo stesso stato — elenco portafogli, caricamento, errore — e
 * differiscono solo nella presentazione. Il dispatcher (`DashboardPage.tsx`)
 * possiede lo stato tramite `usePortafogli()` e la navigazione.
 */
export interface DashboardProps {
  portfolios: Portfolio[];
  loading: boolean;
  error: string | null;
  onOpen: (id: number) => void;
  onCreated: (portfolio: Portfolio) => void;
}

export default function DashboardMastro({
  portfolios,
  loading,
  error,
  onOpen,
  onCreated,
}: DashboardProps) {
  return (
    <>
      {error && <p className="messaggio errore">{error}</p>}
      {loading && <p className="messaggio attesa">Caricamento portafogli…</p>}

      {!loading && !error && (
        <>
          <section aria-label="Lista portafogli">
            <div className="sezione-titolo">
              Conti aperti a mastro
              <span className="nota">
                {portfolios.length > 0
                  ? 'clicca un conto per aprirne il dettaglio'
                  : 'nessun portafoglio ancora registrato'}
              </span>
            </div>

            <div className="tabella-scroll">
              <table className="mastro">
                <thead>
                  <tr>
                    <th>Conto / Portafoglio</th>
                    <th style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {portfolios.length === 0 ? (
                    <tr className="riga-vuota">
                      <td colSpan={2}>
                        <div className="stato-vuoto-interno">
                          <span className="titolo-vuoto">Il registro è ancora vuoto</span>
                          <span className="desc-vuoto">
                            Non hai ancora aperto alcun conto a mastro. Ogni portafoglio che
                            crei sarà iscritto qui.
                          </span>
                          <a href="#modulo-nuovo-conto" className="cta-vuoto">
                            + Apri il tuo primo conto a mastro
                          </a>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    portfolios.map((p) => (
                      <tr
                        key={p.id}
                        className="cliccabile"
                        onClick={() => onOpen(p.id)}
                      >
                        <td>
                          <span className="voce">
                            {p.name}
                            <small>aperto il {dataRegistro(p.created_at)}</small>
                          </span>
                        </td>
                        <td>
                          <span className="freccia-apertura" aria-hidden="true">
                            &#8250;
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div id="modulo-nuovo-conto">
            <div className="sezione-titolo">
              Apri un nuovo conto a mastro
              <span className="nota">Modulo n. 01/A — Registrazione portafoglio</span>
            </div>
            <CreatePortfolioForm onCreated={onCreated} />
          </div>
        </>
      )}
    </>
  );
}
