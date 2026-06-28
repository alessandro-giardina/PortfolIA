import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Portfolio } from '@portfolia/shared';
import CreatePortfolioForm from '../components/CreatePortfolioForm.js';
import Foglio, { dataRegistro } from '../components/Foglio.js';

export default function DashboardPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/portfolios')
      .then((res) => {
        if (!res.ok) throw new Error('Risposta non valida dal server');
        return res.json() as Promise<Portfolio[]>;
      })
      .then(setPortfolios)
      .catch(() => setError('Backend non raggiungibile'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (portfolio: Portfolio) => {
    setPortfolios((prev) => [...prev, portfolio]);
  };

  const linguette = (
    <>
      <a href="/" className="attiva">Portafogli</a>
      <a className="disabilitata">Riepilogo</a>
      <Link to="/ricerca">Ricerca titoli</Link>
      <a className="disabilitata">Scheda titolo</a>
    </>
  );

  const registro = (
    <>
      <div>VOL. <b>I</b> &mdash; ANNO <b>MMXXVI</b></div>
      <div>Conti aperti: <b>{portfolios.length}</b></div>
      <div>Aggiornato il <b>{dataRegistro(Date.now())}</b></div>
    </>
  );

  return (
    <Foglio
      marchio="Registro Personale degli Investimenti"
      titolo="Libro "
      titoloCorsivo="Mastro"
      sottotesto={
        portfolios.length > 0
          ? 'Conti aperti · panoramica portafogli'
          : 'Nessun conto ancora iscritto a registro'
      }
      registro={registro}
      linguette={linguette}
    >
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
                        onClick={() => navigate(`/portfolio/${p.id}`)}
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
            <CreatePortfolioForm onCreated={handleCreated} />
          </div>
        </>
      )}
    </Foglio>
  );
}
