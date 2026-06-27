import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Portfolio } from '@portfolia/shared';

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Rename form state
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/portfolios/${id}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) throw new Error('Risposta non valida dal server');
        return res.json() as Promise<Portfolio>;
      })
      .then((data) => {
        if (data) {
          setPortfolio(data);
          setRenameValue(data.name);
        }
      })
      .catch(() => setError('Backend non raggiungibile'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setRenameError(null);
    if (!renameValue || renameValue.trim() === '') {
      setRenameError('Il nome non può essere vuoto.');
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(`/api/portfolios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.status === 409) {
        const data = await res.json() as { error: string };
        setRenameError(data.error);
        return;
      }
      if (!res.ok) {
        setRenameError('Errore durante il salvataggio. Riprova.');
        return;
      }
      const updated = await res.json() as Portfolio;
      setPortfolio(updated);
      setRenameValue(updated.name);
    } catch {
      setRenameError('Backend non raggiungibile.');
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Eliminare il portafoglio "${portfolio?.name}"? L'operazione è irreversibile.`
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        setDeleteError(data.error ?? 'Errore durante l\'eliminazione.');
        return;
      }
      navigate('/');
    } catch {
      setDeleteError('Backend non raggiungibile.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div>
          <p style={styles.marchio}>Conto a mastro · partita singola</p>
          {portfolio ? (
            <h1 style={styles.title}>
              Conto <em style={styles.corsivo}>{portfolio.name}</em>
            </h1>
          ) : (
            <h1 style={styles.title}>Conto</h1>
          )}
          <p style={styles.subtitle}>Vista di dettaglio · in preparazione</p>
        </div>
      </header>

      <nav style={styles.nav}>
        <Link to="/" style={styles.backLink}>
          ← Portafogli
        </Link>
      </nav>

      {loading && <p style={styles.muted}>Caricamento portafoglio…</p>}

      {error && <p style={styles.error}>{error}</p>}

      {notFound && (
        <div style={styles.placeholder}>
          <p style={styles.titoloVuoto}>Portafoglio non trovato</p>
          <p style={styles.descVuoto}>
            Il portafoglio richiesto non esiste nel registro.
          </p>
          <Link to="/" style={styles.bottoneSecondario}>
            ← Torna all&apos;elenco portafogli
          </Link>
        </div>
      )}

      {!loading && !error && !notFound && portfolio && (
        <>
          <div style={styles.placeholder}>
            <span style={styles.iconaConto} aria-hidden="true">□</span>

            <div style={styles.avvisoWip}>Vista in preparazione</div>

            <h2 style={styles.nomePortafoglio}>{portfolio.name}</h2>
            <p style={styles.sottotitolo}>
              Questa schermata mostrerà il dettaglio completo del portafoglio selezionato.
            </p>

            <p style={styles.notaPlaceholder}>
              La vista di dettaglio sarà implementata nelle prossime user story.
              Troverai qui i titoli iscritti, la variazione di valore per orizzonte
              e il grafico dell&apos;andamento.
            </p>

            <div style={styles.sezioniFuture} aria-hidden="true">
              {['Variazione per orizzonte', 'Grafico andamento', 'Titoli iscritti a conto', 'Carico nuovo titolo'].map((nome) => (
                <div key={nome} style={styles.sezioneFutura}>
                  <span style={styles.sfLabel}>In arrivo</span>
                  <span style={styles.sfNome}>{nome}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '24px' }}>
            <Link to="/" style={styles.bottoneSecondario}>
              ← Torna all&apos;elenco portafogli
            </Link>
          </div>

          <section style={styles.sezioneAzioni}>
            <h3 style={styles.azioniTitolo}>Gestione portafoglio</h3>

            <form onSubmit={(e) => { void handleRename(e); }} style={styles.formRinomina}>
              <label style={styles.formLabel} htmlFor="rename-input">
                Rinomina portafoglio
              </label>
              <div style={styles.formRiga}>
                <input
                  id="rename-input"
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  style={styles.inputTesto}
                  disabled={renaming}
                />
                <button type="submit" style={styles.bottoneSalva} disabled={renaming}>
                  {renaming ? 'Salvataggio…' : 'Salva'}
                </button>
              </div>
              {renameError && (
                <p style={styles.erroreInline}>{renameError}</p>
              )}
            </form>

            <div style={styles.separatoreAzioni} />

            <div>
              <button
                onClick={() => { void handleDelete(); }}
                style={styles.bottoneElimina}
                disabled={deleting}
              >
                {deleting ? 'Eliminazione…' : 'Elimina portafoglio'}
              </button>
              {deleteError && (
                <p style={styles.erroreInline}>{deleteError}</p>
              )}
            </div>
          </section>
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
    marginBottom: '16px',
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
    color: '#8d231f',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '0.9rem',
    color: '#6e5a36',
    fontStyle: 'italic',
  },
  nav: {
    marginBottom: '24px',
    borderBottom: '1px solid rgba(34,28,20,0.2)',
    paddingBottom: '10px',
  },
  backLink: {
    textDecoration: 'none',
    color: '#6e5a36',
    fontSize: '0.875rem',
  },
  placeholder: {
    textAlign: 'center',
    padding: '60px 24px',
    border: '2px dashed rgba(110,90,54,0.45)',
    background: 'repeating-linear-gradient(45deg, transparent 0 10px, rgba(110,90,54,0.03) 10px 20px)',
    margin: '12px 0 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  iconaConto: {
    fontSize: '52px',
    opacity: 0.22,
    display: 'block',
    fontFamily: 'Georgia, serif',
    color: '#221c14',
  },
  avvisoWip: {
    display: 'inline-block',
    fontFamily: 'Georgia, serif',
    textTransform: 'uppercase',
    letterSpacing: '0.22em',
    fontSize: '12px',
    color: '#6e5a36',
    background: 'rgba(215,221,196,0.38)',
    border: '1px solid rgba(34,28,20,0.22)',
    padding: '8px 20px',
  },
  nomePortafoglio: {
    fontFamily: 'Georgia, serif',
    fontWeight: 900,
    fontSize: 'clamp(28px, 5vw, 48px)',
    lineHeight: 1.05,
    margin: 0,
    color: '#221c14',
  },
  sottotitolo: {
    fontFamily: 'Georgia, serif',
    fontStyle: 'italic',
    fontSize: '17px',
    color: '#6e5a36',
    margin: 0,
  },
  notaPlaceholder: {
    fontFamily: 'Georgia, serif',
    fontStyle: 'italic',
    fontSize: '14px',
    color: '#6e5a36',
    opacity: 0.75,
    maxWidth: '520px',
    margin: 0,
  },
  sezioniFuture: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    marginTop: '16px',
    justifyContent: 'center',
  },
  sezioneFutura: {
    border: '1px solid rgba(34,28,20,0.22)',
    background: 'rgba(215,221,196,0.38)',
    padding: '16px 22px',
    minWidth: '200px',
    textAlign: 'left',
    opacity: 0.6,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sfLabel: {
    fontFamily: 'Georgia, serif',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontSize: '11px',
    color: '#6e5a36',
  },
  sfNome: {
    fontFamily: 'Georgia, serif',
    fontSize: '16px',
    color: '#221c14',
  },
  bottoneSecondario: {
    display: 'inline-block',
    padding: '8px 18px',
    border: '1px solid rgba(34,28,20,0.4)',
    color: '#221c14',
    textDecoration: 'none',
    fontSize: '0.875rem',
    letterSpacing: '0.04em',
  },
  titoloVuoto: {
    fontSize: '1rem',
    fontStyle: 'italic',
    color: '#3b3120',
  },
  descVuoto: {
    fontSize: '0.875rem',
    color: '#6e5a36',
  },
  error: {
    color: '#8d231f',
    fontStyle: 'italic',
  },
  muted: {
    color: '#6e5a36',
    fontStyle: 'italic',
  },
  sezioneAzioni: {
    marginTop: '40px',
    borderTop: '1px solid rgba(34,28,20,0.2)',
    paddingTop: '24px',
  },
  azioniTitolo: {
    fontFamily: 'Georgia, serif',
    fontSize: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#6e5a36',
    marginBottom: '20px',
    marginTop: 0,
  },
  formRinomina: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    marginBottom: '24px',
  },
  formLabel: {
    fontFamily: 'Georgia, serif',
    fontSize: '0.875rem',
    color: '#221c14',
    letterSpacing: '0.02em',
  },
  formRiga: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  inputTesto: {
    fontFamily: 'Georgia, serif',
    fontSize: '1rem',
    color: '#221c14',
    border: '1px solid rgba(34,28,20,0.4)',
    padding: '6px 10px',
    background: '#faf9f5',
    flex: 1,
    minWidth: 0,
  },
  bottoneSalva: {
    fontFamily: 'Georgia, serif',
    fontSize: '0.875rem',
    padding: '6px 18px',
    border: '1px solid rgba(34,28,20,0.5)',
    background: '#221c14',
    color: '#faf9f5',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap' as const,
  },
  erroreInline: {
    color: '#8d231f',
    fontStyle: 'italic',
    fontSize: '0.875rem',
    margin: '4px 0 0',
  },
  separatoreAzioni: {
    borderTop: '1px dashed rgba(34,28,20,0.2)',
    marginBottom: '20px',
  },
  bottoneElimina: {
    fontFamily: 'Georgia, serif',
    fontSize: '0.875rem',
    padding: '8px 18px',
    border: '1px solid #8d231f',
    background: 'transparent',
    color: '#8d231f',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
};
