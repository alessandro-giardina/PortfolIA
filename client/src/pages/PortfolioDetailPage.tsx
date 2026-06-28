import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Portfolio } from '@portfolia/shared';
import Foglio, { dataRegistro } from '../components/Foglio.js';

const SEZIONI_FUTURE = [
  'Variazione per orizzonte',
  'Grafico andamento',
  'Titoli iscritti a conto',
  'Carico nuovo titolo',
];

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
        const data = (await res.json()) as { error: string };
        setRenameError(data.error);
        return;
      }
      if (!res.ok) {
        setRenameError('Errore durante il salvataggio. Riprova.');
        return;
      }
      const updated = (await res.json()) as Portfolio;
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
        const data = (await res.json()) as { error: string };
        setDeleteError(data.error ?? "Errore durante l'eliminazione.");
        return;
      }
      navigate('/');
    } catch {
      setDeleteError('Backend non raggiungibile.');
    } finally {
      setDeleting(false);
    }
  }

  const linguette = (
    <>
      <Link to="/">&larr; Portafogli</Link>
      <a className="attiva">Riepilogo</a>
      <a className="disabilitata">Carico titoli</a>
      <a className="disabilitata">Scheda titolo</a>
    </>
  );

  const registro = (
    <>
      <div>VOL. <b>I</b> &mdash; ANNO <b>MMXXVI</b></div>
      <div>
        Portafoglio n. <b>{id ? String(id).padStart(3, '0') : '—'}</b>
      </div>
      {portfolio && (
        <div>Aperto il <b>{dataRegistro(portfolio.created_at)}</b></div>
      )}
    </>
  );

  return (
    <Foglio
      marchio="Conto a mastro · partita singola"
      titolo="Conto "
      titoloCorsivo={portfolio?.name ?? ''}
      sottotesto="Vista di dettaglio · in preparazione"
      registro={registro}
      linguette={linguette}
    >
      {loading && <p className="messaggio attesa">Caricamento portafoglio…</p>}
      {error && <p className="messaggio errore">{error}</p>}

      {notFound && (
        <>
          <div className="dettaglio-placeholder">
            <span className="icona-conto" aria-hidden="true">
              &#9634;
            </span>
            <h2>Portafoglio non trovato</h2>
            <p className="sottotitolo">Il portafoglio richiesto non esiste nel registro.</p>
          </div>
          <div className="bottoni">
            <Link to="/" className="bottone secondario">
              &larr; Torna all&rsquo;elenco portafogli
            </Link>
          </div>
        </>
      )}

      {!loading && !error && !notFound && portfolio && (
        <>
          <div className="dettaglio-placeholder">
            <span className="icona-conto" aria-hidden="true">
              &#9634;
            </span>

            <div className="avviso-wip">Vista in preparazione</div>

            <h2>{portfolio.name}</h2>
            <p className="sottotitolo">
              Questa schermata mostrerà il dettaglio completo del portafoglio selezionato.
            </p>

            <p className="nota-placeholder">
              La vista di dettaglio sarà implementata nelle prossime user story. Troverai qui
              i titoli iscritti, la variazione di valore per orizzonte e il grafico
              dell&rsquo;andamento.
            </p>

            <div className="sezioni-future" aria-hidden="true">
              {SEZIONI_FUTURE.map((nome) => (
                <div key={nome} className="sezione-futura">
                  <span className="sf-label">In arrivo</span>
                  <span className="sf-nome">{nome}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bottoni">
            <Link to="/" className="bottone secondario">
              &larr; Torna all&rsquo;elenco portafogli
            </Link>
          </div>

          <div className="sezione-titolo">
            Gestione del conto
            <span className="nota">rinomina o estingui il portafoglio</span>
          </div>

          <section className="sezione-gestione" aria-label="Gestione portafoglio">
            <form
              onSubmit={(e) => {
                void handleRename(e);
              }}
              className="form-gestione"
            >
              <div className={`riga-modulo${renameError ? ' con-errore' : ''}`}>
                <label htmlFor="rename-input">Rinomina conto</label>
                <div className={`campo${renameError ? ' con-errore' : ''}`}>
                  <input
                    id="rename-input"
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={80}
                    autoComplete="off"
                    disabled={renaming}
                  />
                  <button type="submit" className="bottone" disabled={renaming}>
                    {renaming ? 'Salvataggio…' : 'Salva'}
                  </button>
                  {renameError && (
                    <span role="alert" className="errore-campo visibile">
                      {renameError}
                    </span>
                  )}
                </div>
              </div>
            </form>

            <hr className="separatore-gestione" />

            <div className="zona-pericolo">
              <p className="avviso-pericolo">
                L&rsquo;eliminazione del conto è irreversibile: ogni dato associato sarà
                cancellato dal registro.
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleDelete();
                }}
                className="bottone rosso"
                disabled={deleting}
              >
                {deleting ? 'Eliminazione…' : 'Elimina portafoglio'}
              </button>
              {deleteError && <p className="messaggio errore">{deleteError}</p>}
            </div>
          </section>
        </>
      )}
    </Foglio>
  );
}
