import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Portfolio } from '@portfolia/shared';
import CreatePortfolioForm from '../components/CreatePortfolioForm.js';

export default function DashboardPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div>
          <p style={styles.marchio}>Registro Personale degli Investimenti</p>
          <h1 style={styles.title}>
            Libro <em style={styles.corsivo}>Mastro</em>
          </h1>
          <p style={styles.subtitle}>
            {portfolios.length > 0
              ? `Conti aperti · panoramica portafogli`
              : 'Nessun conto ancora iscritto a registro'}
          </p>
        </div>
      </header>

      {error && <p style={styles.error}>{error}</p>}
      {loading && <p style={styles.muted}>Caricamento portafogli…</p>}

      {!loading && !error && (
        <>
          <section aria-label="Lista portafogli">
            <div style={styles.sezioneTitolo}>
              Conti aperti a mastro
              <span style={styles.nota}>
                {portfolios.length > 0
                  ? 'clicca un conto per aprirne il dettaglio'
                  : 'nessun portafoglio ancora registrato'}
              </span>
            </div>

            <div style={styles.tabellaScroll}>
              <table style={styles.mastro}>
                <thead>
                  <tr>
                    <th style={styles.th}>Conto / Portafoglio</th>
                    <th style={{ ...styles.th, width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {portfolios.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={styles.tdVuota}>
                        <div style={styles.statoVuotoInterno}>
                          <span style={styles.titoloVuoto}>Il registro è ancora vuoto</span>
                          <span style={styles.descVuoto}>
                            Non hai ancora aperto alcun conto a mastro. Ogni portafoglio che crei
                            sarà iscritto qui.
                          </span>
                          <a href="#modulo-nuovo-conto" style={styles.ctaVuoto}>
                            + Apri il tuo primo conto a mastro
                          </a>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    portfolios.map((p) => (
                      <tr key={p.id} style={styles.rigaCliccabile}>
                        <td style={styles.td}>
                          <Link to={`/portfolio/${p.id}`} style={styles.linkPortafoglio}>
                            <span style={styles.voce}>{p.name}</span>
                          </Link>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <Link to={`/portfolio/${p.id}`} style={styles.freccia} aria-hidden="true">
                            ›
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div id="modulo-nuovo-conto" style={{ marginTop: '44px' }}>
            <div style={styles.sezioneTitolo}>
              Apri un nuovo conto a mastro
              <span style={styles.nota}>Modulo n. 01/A — Registrazione portafoglio</span>
            </div>
            <CreatePortfolioForm onCreated={handleCreated} />
          </div>
        </>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: 'Georgia, serif',
    maxWidth: '720px',
    margin: '0 auto',
    padding: '2rem',
    color: '#221c14',
  },
  header: {
    borderBottom: '2px solid #221c14',
    paddingBottom: '12px',
    marginBottom: '24px',
  },
  marchio: {
    margin: '0 0 4px',
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#6e5a36',
  },
  title: {
    margin: 0,
    fontSize: '2rem',
    letterSpacing: '0.04em',
  },
  corsivo: {
    fontStyle: 'italic',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '0.9rem',
    color: '#6e5a36',
    fontStyle: 'italic',
  },
  sezioneTitolo: {
    fontFamily: 'Georgia, serif',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#3b3120',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
  },
  nota: {
    fontSize: '0.75rem',
    fontStyle: 'italic',
    textTransform: 'none',
    letterSpacing: '0',
    color: '#6e5a36',
    opacity: 0.75,
  },
  tabellaScroll: {
    overflowX: 'auto',
  },
  mastro: {
    width: '100%',
    borderCollapse: 'collapse',
    borderTop: '2px solid #221c14',
    borderBottom: '2px solid #221c14',
  },
  th: {
    padding: '8px 6px',
    textAlign: 'left',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6e5a36',
    borderBottom: '1px solid rgba(34,28,20,0.3)',
  },
  td: {
    padding: '10px 6px',
    borderBottom: '1px solid rgba(34,28,20,0.15)',
    verticalAlign: 'middle',
  },
  tdVuota: {
    padding: '40px 6px',
  },
  rigaCliccabile: {
    cursor: 'pointer',
  },
  linkPortafoglio: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
  },
  voce: {
    fontSize: '1rem',
    color: '#221c14',
  },
  freccia: {
    fontSize: '1.4rem',
    color: '#6e5a36',
    textDecoration: 'none',
    opacity: 0.6,
  },
  statoVuotoInterno: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    textAlign: 'center',
  },
  titoloVuoto: {
    fontFamily: 'Georgia, serif',
    fontSize: '1rem',
    fontStyle: 'italic',
    color: '#3b3120',
  },
  descVuoto: {
    fontSize: '0.875rem',
    color: '#6e5a36',
    maxWidth: '400px',
  },
  ctaVuoto: {
    display: 'inline-block',
    padding: '8px 18px',
    border: '1px solid rgba(34,28,20,0.4)',
    color: '#221c14',
    textDecoration: 'none',
    fontSize: '0.875rem',
    letterSpacing: '0.04em',
  },
  error: {
    color: '#8d231f',
    fontStyle: 'italic',
  },
  muted: {
    color: '#6e5a36',
    fontStyle: 'italic',
  },
};
