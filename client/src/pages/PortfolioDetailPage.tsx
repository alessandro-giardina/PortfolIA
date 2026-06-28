import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import type { Portfolio, Position, PositionSummary, EnrichedPositionSummary, CreatePositionRequest, UpdatePositionRequest } from '@portfolia/shared';
import { isValidIsin } from '@portfolia/shared';
import Foglio, { dataRegistro } from '../components/Foglio.js';

/** Formatta una data ISO-8601 (YYYY-MM-DD) in stile registro (es. "15.III.2026"). */
const MESI_ROMANI = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
function dataCarico(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2,'0')}.${MESI_ROMANI[m - 1]}.${y}`;
}

type Scheda = 'riepilogo' | 'carico';

interface PrefillState {
  isin: string;
  name: string | null;
  price: number | null;
  currency: string | null;
}

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [scheda, setScheda] = useState<Scheda>('carico');

  // Rename form state
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Positions state
  const [positions, setPositions] = useState<Position[]>([]);
  const [summaries, setSummaries] = useState<PositionSummary[]>([]);
  const [enrichedPositions, setEnrichedPositions] = useState<EnrichedPositionSummary[]>([]);
  const [enrichedLoading, setEnrichedLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [newPositionId, setNewPositionId] = useState<number | null>(null);

  // Edit/Delete position state
  const [editingPositionId, setEditingPositionId] = useState<number | null>(null);
  const [editLoadDate, setEditLoadDate] = useState('');
  const [editLoadPrice, setEditLoadPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [positionDeleteError, setPositionDeleteError] = useState<string | null>(null);
  const [deletingPositionId, setDeletingPositionId] = useState<number | null>(null);

  // Carico form state
  const [isin, setIsin] = useState('');
  const [prefillName, setPrefillName] = useState<string | null>(null);
  const [loadDate, setLoadDate] = useState('');
  const [loadPrice, setLoadPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    isin?: string;
    loadDate?: string;
    loadPrice?: string;
    quantity?: string;
  }>({});

  const fetchPositions = useCallback(() => {
    if (!id) return;
    setPositionsLoading(true);
    fetch(`/api/portfolios/${id}/positions`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<Position[]>;
      })
      .then((data) => setPositions(data))
      .catch(() => setPositions([]))
      .finally(() => setPositionsLoading(false));
  }, [id]);

  const fetchSummary = useCallback(() => {
    if (!id) return;
    fetch(`/api/portfolios/${id}/positions/summary`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<PositionSummary[]>;
      })
      .then((data) => setSummaries(data))
      .catch(() => setSummaries([]));
  }, [id]);

  const fetchEnriched = useCallback(() => {
    if (!id) return;
    setEnrichedLoading(true);
    fetch(`/api/portfolios/${id}/positions/enriched`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<EnrichedPositionSummary[]>;
      })
      .then((data) => setEnrichedPositions(data))
      .catch(() => setEnrichedPositions([]))
      .finally(() => setEnrichedLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/portfolios/${id}`)
      .then((res) => {
        if (res.status === 404) { setNotFound(true); return null; }
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

  useEffect(() => {
    if (!loading && !notFound && !error) {
      fetchPositions();
      fetchSummary();
      fetchEnriched();
    }
  }, [loading, notFound, error, fetchPositions, fetchSummary, fetchEnriched]);

  useEffect(() => {
    const state = location.state as { prefill?: PrefillState } | null;
    if (state?.prefill?.isin) {
      const prefill = state.prefill;
      setIsin(prefill.isin);
      if (prefill.price !== null) {
        setLoadPrice(String(prefill.price));
      }
      if (prefill.name) {
        setPrefillName(prefill.name);
      }
      window.history.replaceState({}, document.title);
    }
  }, []);

  /** Validazione client-side del form di carico. */
  function validateForm(): boolean {
    const errors: typeof fieldErrors = {};
    if (!isin || !isValidIsin(isin)) {
      errors.isin = 'Inserire un codice ISIN valido (12 caratteri alfanumerici).';
    }
    if (!loadDate || !/^\d{4}-\d{2}-\d{2}$/.test(loadDate)) {
      errors.loadDate = 'La data di carico è obbligatoria.';
    }
    const price = parseFloat(loadPrice);
    if (!loadPrice || isNaN(price) || price <= 0) {
      errors.loadPrice = 'Il prezzo deve essere un valore positivo.';
    }
    const qty = parseInt(quantity, 10);
    if (!quantity || isNaN(qty) || qty <= 0 || String(qty) !== quantity.trim()) {
      errors.quantity = 'La quantità deve essere un intero positivo.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCarico(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const payload: CreatePositionRequest = {
        isin: isin.trim().toUpperCase(),
        load_date: loadDate,
        load_price: parseFloat(loadPrice),
        quantity: parseInt(quantity, 10),
      };
      const res = await fetch(`/api/portfolios/${id}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setSubmitError(data.error ?? 'Errore durante il salvataggio.');
        return;
      }
      const created = (await res.json()) as Position;
      setNewPositionId(created.id);
      setSubmitSuccess(`Posizione ${created.isin} iscritta nel registro con successo.`);
      // Reset form
      setIsin('');
      setLoadDate('');
      setLoadPrice('');
      setQuantity('');
      setFieldErrors({});
      fetchPositions();
      fetchSummary();
      fetchEnriched();
    } catch {
      setSubmitError('Backend non raggiungibile.');
    } finally {
      setSubmitting(false);
    }
  }

  /** Apre il form inline di modifica per la posizione specificata. */
  function startEdit(pos: Position) {
    setEditingPositionId(pos.id);
    setEditLoadDate(pos.loadDate);
    setEditLoadPrice(String(pos.loadPrice));
    setEditQuantity(String(pos.quantity));
    setEditError(null);
  }

  /** Annulla la modifica in corso. */
  function cancelEdit() {
    setEditingPositionId(null);
    setEditError(null);
  }

  /** Invia il form di modifica tramite PATCH. */
  async function handleEditSubmit(e: React.FormEvent, posId: number) {
    e.preventDefault();
    setEditError(null);

    const updates: UpdatePositionRequest = {};
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    if (!editLoadDate || !ISO_DATE_RE.test(editLoadDate)) {
      setEditError('La data di carico deve essere nel formato YYYY-MM-DD.');
      return;
    }
    updates.load_date = editLoadDate;

    const price = parseFloat(editLoadPrice);
    if (!editLoadPrice || isNaN(price) || price <= 0) {
      setEditError('Il prezzo deve essere un valore positivo.');
      return;
    }
    updates.load_price = price;

    const qty = parseInt(editQuantity, 10);
    if (!editQuantity || isNaN(qty) || qty <= 0 || String(qty) !== editQuantity.trim()) {
      setEditError('La quantità deve essere un intero positivo.');
      return;
    }
    updates.quantity = qty;

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/portfolios/${id}/positions/${posId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setEditError(data.error ?? 'Errore durante il salvataggio.');
        return;
      }
      setEditingPositionId(null);
      fetchPositions();
      fetchSummary();
      fetchEnriched();
    } catch {
      setEditError('Backend non raggiungibile.');
    } finally {
      setEditSubmitting(false);
    }
  }

  /** Rimuove una posizione previa conferma. */
  async function handleDeletePosition(posId: number) {
    const confirmed = window.confirm('Rimuovere questo carico? L\'operazione è irreversibile.');
    if (!confirmed) return;
    setPositionDeleteError(null);
    setDeletingPositionId(posId);
    try {
      const res = await fetch(`/api/portfolios/${id}/positions/${posId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setPositionDeleteError(data.error ?? 'Errore durante la rimozione.');
        return;
      }
      fetchPositions();
      fetchSummary();
      fetchEnriched();
    } catch {
      setPositionDeleteError('Backend non raggiungibile.');
    } finally {
      setDeletingPositionId(null);
    }
  }

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
      <a
        className={scheda === 'riepilogo' ? 'attiva' : 'cliccabile'}
        onClick={() => setScheda('riepilogo')}
        style={{ cursor: 'pointer' }}
      >
        Riepilogo
      </a>
      <a
        className={scheda === 'carico' ? 'attiva' : 'cliccabile'}
        onClick={() => setScheda('carico')}
        style={{ cursor: 'pointer' }}
      >
        Carico titoli
      </a>
      <a className="disabilitata">Scheda titolo</a>
    </>
  );

  const registro = (
    <>
      <div>VOL. <b>I</b> &mdash; ANNO <b>MMXXVI</b></div>
      <div>Portafoglio n. <b>{id ? String(id).padStart(3, '0') : '—'}</b></div>
      {portfolio && (
        <div>Aperto il <b>{dataRegistro(portfolio.created_at)}</b></div>
      )}
    </>
  );

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <Foglio
      marchio="Conto a mastro · partita singola"
      titolo="Conto "
      titoloCorsivo={portfolio?.name ?? ''}
      sottotesto={scheda === 'carico' ? 'Carico titoli · iscrizione nuova posizione' : 'Vista di dettaglio'}
      registro={registro}
      linguette={linguette}
    >
      {loading && <p className="messaggio attesa">Caricamento portafoglio…</p>}
      {error && <p className="messaggio errore">{error}</p>}

      {notFound && (
        <>
          <div className="dettaglio-placeholder">
            <span className="icona-conto" aria-hidden="true">&#9634;</span>
            <h2>Portafoglio non trovato</h2>
            <p className="sottotitolo">Il portafoglio richiesto non esiste nel registro.</p>
          </div>
          <div className="bottoni">
            <Link to="/" className="bottone secondario">&larr; Torna all&rsquo;elenco portafogli</Link>
          </div>
        </>
      )}

      {!loading && !error && !notFound && portfolio && (
        <>
          {/* ===== SCHEDA: Riepilogo ===== */}
          {scheda === 'riepilogo' && (
            <>
              {/* Tabella titoli arricchita (FR-013) */}
              <div className="sezione-titolo" style={{ marginTop: '6px' }}>
                Titoli iscritti a conto
                <span className="nota">FR-013 &middot; valore attuale e differenza rispetto al carico</span>
              </div>

              {enrichedLoading ? (
                <p className="messaggio attesa">Caricamento titoli…</p>
              ) : enrichedPositions.length === 0 ? (
                <div className="dettaglio-placeholder" data-testid="riepilogo-vuoto">
                  <span className="icona-conto" aria-hidden="true">&#9634;</span>
                  <p className="sottotitolo" style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', fontSize: '18px', fontWeight: 400 }}>
                    Il registro è ancora bianco
                  </p>
                  <p className="sottotitolo">
                    Nessun titolo è stato ancora iscritto in questo portafoglio.
                    Vai alla scheda <em>Carico titoli</em> per registrare il primo carico.
                  </p>
                </div>
              ) : (
                <>
                  {(() => {
                    const positionsWithPrice = enrichedPositions.filter((ep) => ep.currentValue !== null);
                    const totalCurrentValue = positionsWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
                    const missingPriceCount = enrichedPositions.length - positionsWithPrice.length;
                    return (
                      <div className="riquadro-valore-totale" data-testid="valore-totale-portafoglio" aria-label="Valore attuale totale del portafoglio">
                        <div className={`fascia-colore${missingPriceCount > 0 ? (positionsWithPrice.length === 0 ? ' assente' : ' parziale') : ''}`}></div>
                        <div className="contenuto-totale">
                          <div className="blocco-cifra">
                            <span className="et-totale">Valore attuale totale</span>
                            <span className={`cifra-totale${positionsWithPrice.length === 0 ? ' assente' : missingPriceCount > 0 ? ' parziale' : ''}`}>
                              <span className="valuta">EUR</span>
                              {positionsWithPrice.length === 0
                                ? '–'
                                : totalCurrentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          {missingPriceCount > 0 && (
                            <div className="nota-mancante" role="note">
                              <strong>{positionsWithPrice.length === 0 ? 'Nessun prezzo disponibile' : 'Valore parziale'}</strong>
                              {positionsWithPrice.length === 0
                                ? `Il prezzo corrente non è in archivio per nessuna delle ${enrichedPositions.length} ${enrichedPositions.length === 1 ? 'posizione' : 'posizioni'}. Il valore sarà calcolato non appena almeno un prezzo sarà recuperato.`
                                : `${missingPriceCount} ${missingPriceCount === 1 ? 'posizione senza prezzo corrente' : 'posizioni senza prezzo corrente'}: il totale esclude ${missingPriceCount === 1 ? 'questo titolo' : 'questi titoli'}.`}
                            </div>
                          )}
                          <div className="timestamp-totale">
                            {positionsWithPrice.length} di {enrichedPositions.length} {enrichedPositions.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="tabella-scroll">
                    <table className="mastro" data-testid="tabella-riepilogo" aria-label="Tabella titoli del portafoglio">
                      <thead>
                        <tr>
                          <th>Denominazione &middot; ISIN</th>
                          <th>Quantità</th>
                          <th>Pr. medio carico</th>
                          <th>Valore attuale</th>
                          <th>Differenza</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrichedPositions.map((ep) => (
                          <tr key={ep.isin} data-testid={`riepilogo-${ep.isin}`}>
                            <td>
                              <span className="voce">
                                {ep.name ? <strong>{ep.name}</strong> : null}
                                <small style={{ display: 'block', letterSpacing: '.08em', opacity: ep.name ? 0.7 : 1 }}>{ep.isin}</small>
                              </span>
                            </td>
                            <td className="cifra">{ep.totalQuantity.toLocaleString('it-IT')}</td>
                            <td className="cifra euro">{ep.avgLoadPrice.toFixed(4)}</td>
                            <td className={ep.currentValue !== null ? 'cifra euro' : 'cifra dato-mancante'}>
                              {ep.currentValue !== null
                                ? ep.currentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '–'}
                            </td>
                            <td className={
                              ep.difference === null
                                ? 'cifra dato-mancante'
                                : ep.difference >= 0
                                  ? 'cifra guadagno'
                                  : 'cifra perdita'
                            } data-testid={`diff-${ep.isin}`}>
                              {ep.difference !== null
                                ? `${ep.difference >= 0 ? '+' : ''}${ep.difference.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '–'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {(() => {
                        const enrichedWithPrice = enrichedPositions.filter((ep) => ep.currentValue !== null);
                        if (enrichedWithPrice.length === 0) return null;
                        const totalCurrentValue = enrichedWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
                        const totalDiff = enrichedWithPrice.reduce((s, ep) => s + (ep.difference ?? 0), 0);
                        return (
                          <tfoot>
                            <tr>
                              <td colSpan={3}>Totale portafoglio ({enrichedWithPrice.length} {enrichedWithPrice.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}{enrichedWithPrice.length < enrichedPositions.length ? ` di ${enrichedPositions.length}` : ''})</td>
                              <td className="cifra euro">{totalCurrentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className={totalDiff >= 0 ? 'cifra guadagno' : 'cifra perdita'}>
                                {`${totalDiff >= 0 ? '+' : ''}${totalDiff.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              </td>
                            </tr>
                          </tfoot>
                        );
                      })()}
                    </table>
                  </div>
                  <p style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', color: 'var(--seppia)', fontSize: '13px', margin: '14px 0 0', paddingTop: '10px', borderTop: '1px dotted rgba(110,90,54,.4)' }}>
                    I valori contrassegnati con &laquo;&ndash;&raquo; indicano che il prezzo corrente non è ancora
                    disponibile in archivio; la differenza non può essere calcolata.
                  </p>
                </>
              )}

              <div className="bottoni" style={{ marginTop: '24px' }}>
                <Link to="/" className="bottone secondario">&larr; Torna all&rsquo;elenco portafogli</Link>
              </div>

              <div className="sezione-titolo" style={{ marginTop: '40px' }}>
                Gestione del conto
                <span className="nota">rinomina o estingui il portafoglio</span>
              </div>

              <section className="sezione-gestione" aria-label="Gestione portafoglio">
                <form onSubmit={(e) => { void handleRename(e); }} className="form-gestione">
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
                        <span role="alert" className="errore-campo visibile">{renameError}</span>
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
                    onClick={() => { void handleDelete(); }}
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

          {/* ===== SCHEDA: Carico titoli ===== */}
          {scheda === 'carico' && (
            <>
              {/* Banner successo */}
              {submitSuccess && (
                <div className="avviso-successo" role="status" data-testid="avviso-successo">
                  <span className="timbro-ok">Iscritto</span>
                  <p>{submitSuccess}</p>
                </div>
              )}

              {/* Banner errori sommario */}
              {hasFieldErrors && (
                <div className="banner-errore" role="alert" data-testid="banner-errore">
                  <span className="timbro-ko">Rifiutato</span>
                  <div>
                    <p>Il modulo contiene voci non valide. Correggere prima di procedere:</p>
                    <ul>
                      {fieldErrors.isin && <li>{fieldErrors.isin}</li>}
                      {fieldErrors.loadDate && <li>{fieldErrors.loadDate}</li>}
                      {fieldErrors.loadPrice && <li>{fieldErrors.loadPrice}</li>}
                      {fieldErrors.quantity && <li>{fieldErrors.quantity}</li>}
                    </ul>
                  </div>
                </div>
              )}

              {/* Errore submit server */}
              {submitError && (
                <p className="messaggio errore" role="alert" data-testid="submit-errore">
                  {submitError}
                </p>
              )}

              {/* Sezione modulo iscrizione */}
              <div className="sezione-titolo">
                Iscrizione nuova posizione
                <span className="nota">FR-007 · compila tutti i campi obbligatori</span>
              </div>

              <div className="riquadro-modulo">
                <div className="intestazione-modulo">
                  <span>Modulo di carico titolo</span>
                  <span className="num-modulo">MOD/CPC-001 · rev. I</span>
                </div>
                <div className="corpo-modulo">
                  <form id="form-carico" onSubmit={(e) => { void handleCarico(e); }} noValidate>

                    {/* Nome titolo (da ricerca) */}
                    {prefillName && (
                      <div className="riga-modulo">
                        <label htmlFor="carico-nome">
                          Nome titolo
                          <span className="sotto-etichetta">da ricerca — sola lettura</span>
                        </label>
                        <div className="campo">
                          <input
                            id="carico-nome"
                            data-testid="input-nome-titolo"
                            type="text"
                            value={prefillName}
                            readOnly
                            disabled
                            style={{ fontStyle: 'italic', color: 'var(--seppia)' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* ISIN */}
                    <div className={`riga-modulo${fieldErrors.isin ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-isin">
                        ISIN
                        <span className="sotto-etichetta">12 caratteri alfanumerici</span>
                      </label>
                      <div className={`campo${fieldErrors.isin ? ' con-errore' : ''}`}>
                        <input
                          id="carico-isin"
                          data-testid="input-isin"
                          type="text"
                          maxLength={12}
                          placeholder="es. IE00BJRHVJ28"
                          autoComplete="off"
                          spellCheck={false}
                          style={{ textTransform: 'uppercase', letterSpacing: '.1em' }}
                          value={isin}
                          onChange={(e) => setIsin(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.isin && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-isin">
                            {fieldErrors.isin}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Data di carico */}
                    <div className={`riga-modulo${fieldErrors.loadDate ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-data">
                        Data di carico
                        <span className="sotto-etichetta">data di acquisto</span>
                      </label>
                      <div className={`campo${fieldErrors.loadDate ? ' con-errore' : ''}`}>
                        <input
                          id="carico-data"
                          data-testid="input-data"
                          type="date"
                          value={loadDate}
                          onChange={(e) => setLoadDate(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.loadDate && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-data">
                            {fieldErrors.loadDate}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prezzo di acquisto */}
                    <div className={`riga-modulo${fieldErrors.loadPrice ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-prezzo">
                        Prezzo di acquisto
                        <span className="sotto-etichetta">per singola quota, in euro</span>
                      </label>
                      <div className={`campo${fieldErrors.loadPrice ? ' con-errore' : ''}`}>
                        <span className="unita">EUR</span>
                        <input
                          id="carico-prezzo"
                          data-testid="input-prezzo"
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          placeholder="0,0000"
                          value={loadPrice}
                          onChange={(e) => setLoadPrice(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.loadPrice && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-prezzo">
                            {fieldErrors.loadPrice}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantità */}
                    <div className={`riga-modulo${fieldErrors.quantity ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-quantita">
                        Quantità
                        <span className="sotto-etichetta">numero intero di quote</span>
                      </label>
                      <div className={`campo${fieldErrors.quantity ? ' con-errore' : ''}`}>
                        <span className="unita">QTÀ</span>
                        <input
                          id="carico-quantita"
                          data-testid="input-quantita"
                          type="number"
                          min="1"
                          step="1"
                          placeholder="0"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.quantity && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-quantita">
                            {fieldErrors.quantity}
                          </span>
                        )}
                      </div>
                    </div>

                  </form>

                  <p className="nota-contabile">
                    Il controvalore di carico sarà calcolato automaticamente come prodotto di prezzo &times; quantità
                    e iscritto nel registro al momento del salvataggio.
                  </p>

                  <div className="bottoni">
                    <button
                      type="submit"
                      form="form-carico"
                      className="bottone"
                      data-testid="btn-iscrive"
                      disabled={submitting}
                    >
                      {submitting ? 'Iscrizione…' : 'Iscrive nel registro'}
                    </button>
                    <Link to="/" className="bottone secondario">Annulla</Link>
                  </div>
                </div>
              </div>

              {/* Divisore */}
              <hr className="divisore-sezione" />

              {/* Sezione tabella posizioni aggregate per ISIN */}
              <div className="sezione-titolo" style={{ marginTop: '32px' }}>
                Titoli iscritti a conto
                <span className="contatore-posizioni" data-testid="contatore-posizioni">
                  {positionsLoading ? '…' : `${summaries.length} ISIN distint${summaries.length === 1 ? 'o' : 'i'}`}
                </span>
              </div>

              <div className="tabella-scroll">
                <table className="mastro" data-testid="tabella-posizioni">
                  <thead>
                    <tr>
                      <th>Titolo (ISIN)</th>
                      <th>Quantità totale</th>
                      <th>Prezzo medio carico</th>
                      <th>Controvalore carico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.length === 0 ? (
                      <tr className="riga-vuota">
                        <td colSpan={4}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, opacity: .45 }}>
                              Nessuna posizione iscritta
                            </span>
                            <span style={{ fontSize: '14px' }}>
                              Compila il modulo sopra per registrare il primo titolo del portafoglio.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      summaries.map((summary) => (
                        <tr key={summary.isin} data-testid={`summary-${summary.isin}`}>
                          <td>
                            <span className="voce">{summary.isin}</span>
                          </td>
                          <td className="cifra">{summary.totalQuantity}</td>
                          <td className="cifra euro">{summary.avgLoadPrice.toFixed(4)}</td>
                          <td className="cifra euro">{summary.totalLoadValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {summaries.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Totale controvalore carico</td>
                        <td className="cifra euro">
                          {summaries.reduce((sum, s) => sum + s.totalLoadValue, 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Divisore registro carichi */}
              <hr className="divisore-sezione" />

              {/* Sezione registro carichi (ledger completo) */}
              <div className="sezione-titolo" style={{ marginTop: '32px' }}>
                Registro carichi
                <span className="nota">tutte le iscrizioni individuali</span>
              </div>

              {positionDeleteError && (
                <p className="messaggio errore" role="alert" data-testid="position-delete-errore">
                  {positionDeleteError}
                </p>
              )}

              <div className="tabella-scroll">
                <table className="mastro" data-testid="tabella-registro-carichi">
                  <thead>
                    <tr>
                      <th>Titolo (ISIN)</th>
                      <th>Data carico</th>
                      <th>Prezzo carico</th>
                      <th>Quantità</th>
                      <th>Controvalore carico</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.length === 0 ? (
                      <tr className="riga-vuota">
                        <td colSpan={6}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, opacity: .45 }}>
                              Nessun carico registrato
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      positions.map((pos) => (
                        editingPositionId === pos.id ? (
                          /* ── Form inline modifica ── */
                          <tr key={pos.id} data-testid={`edit-riga-${pos.id}`}>
                            <td>
                              <span className="voce">{pos.isin}</span>
                            </td>
                            <td>
                              <input
                                type="date"
                                value={editLoadDate}
                                onChange={(e) => setEditLoadDate(e.target.value)}
                                data-testid="edit-input-data"
                                disabled={editSubmitting}
                                style={{ width: '130px' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                value={editLoadPrice}
                                onChange={(e) => setEditLoadPrice(e.target.value)}
                                data-testid="edit-input-prezzo"
                                disabled={editSubmitting}
                                style={{ width: '90px' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                data-testid="edit-input-quantita"
                                disabled={editSubmitting}
                                style={{ width: '70px' }}
                              />
                            </td>
                            <td className="cifra euro">—</td>
                            <td>
                              {editError && (
                                <span
                                  role="alert"
                                  className="errore-campo visibile"
                                  data-testid={`edit-errore-${pos.id}`}
                                  style={{ display: 'block', marginBottom: '4px' }}
                                >
                                  {editError}
                                </span>
                              )}
                              <button
                                type="button"
                                className="bottone"
                                data-testid={`btn-salva-modifica-${pos.id}`}
                                disabled={editSubmitting}
                                onClick={(e) => { void handleEditSubmit(e, pos.id); }}
                                style={{ marginRight: '4px' }}
                              >
                                {editSubmitting ? 'Salvataggio…' : 'Salva'}
                              </button>
                              <button
                                type="button"
                                className="bottone secondario"
                                data-testid={`btn-annulla-modifica-${pos.id}`}
                                disabled={editSubmitting}
                                onClick={cancelEdit}
                              >
                                Annulla
                              </button>
                            </td>
                          </tr>
                        ) : (
                          /* ── Riga normale ── */
                          <tr
                            key={pos.id}
                            className={pos.id === newPositionId ? 'riga-nuova' : ''}
                            data-testid={`posizione-${pos.id}`}
                          >
                            <td>
                              <span className="voce">{pos.isin}</span>
                            </td>
                            <td className="cifra">{dataCarico(pos.loadDate)}</td>
                            <td className="cifra euro">{pos.loadPrice.toFixed(4)}</td>
                            <td className="cifra">{pos.quantity}</td>
                            <td className="cifra euro">{(pos.loadPrice * pos.quantity).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>
                              <button
                                type="button"
                                className="bottone secondario"
                                data-testid={`btn-modifica-${pos.id}`}
                                onClick={() => startEdit(pos)}
                                style={{ marginRight: '4px' }}
                              >
                                Modifica
                              </button>
                              <button
                                type="button"
                                className="bottone rosso"
                                data-testid={`btn-rimuovi-${pos.id}`}
                                disabled={deletingPositionId === pos.id}
                                onClick={() => { void handleDeletePosition(pos.id); }}
                              >
                                {deletingPositionId === pos.id ? 'Rimozione…' : 'Rimuovi'}
                              </button>
                            </td>
                          </tr>
                        )
                      ))
                    )}
                  </tbody>
                  {positions.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={5}>Totale controvalore carico</td>
                        <td className="cifra euro">
                          {positions.reduce((sum, p) => sum + p.loadPrice * p.quantity, 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Foglio>
  );
}
