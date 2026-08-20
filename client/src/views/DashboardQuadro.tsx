import { dataCivile } from '../domain/formattazione.js';
import CreaPortafoglioQuadro from './CreaPortafoglioQuadro.js';
import type { DashboardProps } from './DashboardMastro.js';

/**
 * Scheda "elenco portafogli" del design Quadro strumenti (US-053/TASK-06):
 * stessi dati e stessa navigazione di `DashboardMastro` (`DashboardProps`,
 * condivise), sola resa diversa — titolo di pagina, pannello con
 * `table.dati` e modulo di creazione a parte (`CreaPortafoglioQuadro`).
 */
export default function DashboardQuadro({ portfolios, loading, error, onOpen, onCreated }: DashboardProps) {
  return (
    <>
      <div className="titolo-pagina">
        <div>
          <h1>Portafogli</h1>
          <p className="sottotitolo">
            {portfolios.length} {portfolios.length === 1 ? 'conto aperto' : 'conti aperti'} · seleziona un
            portafoglio per aprirne il riepilogo
          </p>
        </div>
      </div>

      {error && <p className="messaggio errore">{error}</p>}
      {loading && <p className="chiosa">Caricamento portafogli…</p>}

      {!loading && !error && (
        <>
          <section className="pannello" aria-label="Elenco portafogli">
            <div className="testa-pannello">
              <div>
                <h3>Portafogli iscritti a registro</h3>
                <span className="chiosa">apri un conto per vederne il riepilogo</span>
              </div>
              <span className="contatore-portafogli">
                <b>{portfolios.length}</b> {portfolios.length === 1 ? 'portafoglio' : 'portafogli'}
              </span>
            </div>

            {portfolios.length === 0 ? (
              <div className="placeholder-quadro" data-testid="dashboard-vuoto">
                <h3>Nessun portafoglio</h3>
                <p>
                  Non hai ancora nessun portafoglio. Usa il modulo <em>Nuovo portafoglio</em> qui sotto per
                  crearne uno e iniziare a registrare i tuoi carichi.
                </p>
              </div>
            ) : (
              <div className="tabella-scroll">
                <table className="dati" aria-label="Portafogli">
                  <thead>
                    <tr>
                      <th scope="col">Nome del conto</th>
                      <th scope="col">Aperto il</th>
                      <th scope="col" aria-label="Apri il portafoglio"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolios.map((p) => (
                      <tr
                        key={p.id}
                        className="cliccabile"
                        role="button"
                        tabIndex={0}
                        aria-label={`Apri ${p.name}`}
                        data-testid={`riga-portafoglio-${p.id}`}
                        onClick={() => onOpen(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpen(p.id);
                          }
                        }}
                      >
                        <td>
                          <span className="voce-portafoglio">
                            <strong>{p.name}</strong>
                          </span>
                        </td>
                        <td>{dataCivile(p.created_at)}</td>
                        <td className="freccia-riga" aria-hidden="true">›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <CreaPortafoglioQuadro onCreated={onCreated} />
        </>
      )}
    </>
  );
}
