import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Sale } from '@portfolia/shared';
import Guscio from '../components/Guscio.js';
import { dataCarico, dataRegistro, quantita, type Linguetta } from '../components/Foglio.js';
import { importo, prezzo } from '../domain/formattazione.js';
import SchedaTitolo from '../components/SchedaTitolo.js';
import ModuloScarico from '../components/ModuloScarico.js';
import CellaTitolo from '../components/CellaTitolo.js';
import { usePortafoglio } from '../hooks/usePortafoglio.js';
import { useDatiPortafoglio, type Scheda } from '../hooks/useDatiPortafoglio.js';
import { useFormCarico } from '../hooks/useFormCarico.js';
import { useModificaPosizione } from '../hooks/useModificaPosizione.js';
import { useDesign } from '../hooks/useDesign.js';
import RiepilogoMastro from '../views/RiepilogoMastro.js';
import RiepilogoQuadro from '../views/RiepilogoQuadro.js';

export default function PortfolioDetailPage() {
  const location = useLocation();
  const { design } = useDesign();

  const portafoglio = usePortafoglio();
  const {
    id,
    portfolio,
    error,
    loading,
    notFound,
    renameValue,
    setRenameValue,
    renameError,
    renaming,
    handleRename,
    deleteError,
    deleting,
    handleDelete,
  } = portafoglio;

  const [scheda, setScheda] = useState<Scheda>(() => {
    const state = location.state as { prefill?: { isin: string } } | null;
    return state?.prefill?.isin ? 'carico' : 'riepilogo';
  });

  const dati = useDatiPortafoglio(id, !loading && !notFound && !error, scheda, setScheda);
  const {
    positions,
    ultimaVendita,
    summaries,
    enrichedPositions,
    enrichedLoading,
    series,
    seriesLoading,
    isinSelezionato,
    setIsinSelezionato,
    isinInLavorazione,
    setIsinInLavorazione,
    positionsLoading,
    residuoPerLotto,
    posizioniAperte,
    posizioniChiuse,
    ultimaVenditaPerIsin,
    nomePerIsin,
    titoliScaricabili,
    iscrizioni,
    residuoDopoVendita,
    dopoScarico,
    ricalcolaSilenzioso,
    fetchPositions,
    fetchSummary,
    fetchEnriched,
  } = dati;

  const onPositionChanged = useCallback(() => {
    fetchPositions();
    fetchSummary();
    fetchEnriched();
  }, [fetchPositions, fetchSummary, fetchEnriched]);

  const carico = useFormCarico(id, onPositionChanged);
  const {
    isin,
    setIsin,
    prefillName,
    loadDate,
    setLoadDate,
    loadPrice,
    setLoadPrice,
    quantity,
    setQuantity,
    submitError,
    submitSuccess,
    submitting,
    newPositionId,
    fieldErrors,
    handleCarico,
  } = carico;

  const modifica = useModificaPosizione(id, onPositionChanged);
  const {
    editingPositionId,
    editLoadDate,
    setEditLoadDate,
    editLoadPrice,
    setEditLoadPrice,
    editQuantity,
    setEditQuantity,
    editError,
    editSubmitting,
    positionDeleteError,
    setPositionDeleteError,
    deletingPositionId,
    startEdit,
    cancelEdit,
    handleEditSubmit,
    handleDeletePosition,
  } = modifica;

  const dopoScaricoCompleto = useCallback(
    (vendita: Sale) => {
      setPositionDeleteError(null);
      dopoScarico(vendita);
    },
    [dopoScarico, setPositionDeleteError],
  );

  function apriSchedaTitolo(isinTitolo: string) {
    setIsinSelezionato(isinTitolo);
    setScheda('titolo');
  }

  const linguette: Linguetta[] = [
    { chiave: 'portafogli', etichetta: '← Portafogli', stato: 'cliccabile', to: '/' },
    {
      chiave: 'riepilogo',
      etichetta: 'Riepilogo',
      stato: scheda === 'riepilogo' ? 'attiva' : 'cliccabile',
      onClick: () => setScheda('riepilogo'),
    },
    {
      chiave: 'carico',
      etichetta: 'Carico titoli',
      stato: scheda === 'carico' ? 'attiva' : 'cliccabile',
      onClick: () => setScheda('carico'),
    },
    { chiave: 'ricerca', etichetta: 'Ricerca titoli', stato: 'cliccabile', to: '/ricerca' },
    isinSelezionato === null
      ? { chiave: 'titolo', etichetta: 'Scheda titolo', stato: 'disabilitata' }
      : {
          chiave: 'titolo',
          etichetta: 'Scheda titolo',
          stato: scheda === 'titolo' ? 'attiva' : 'cliccabile',
          onClick: () => setScheda('titolo'),
        },
  ];

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
    <Guscio
      marchio="Conto a mastro · partita singola"
      titolo="Conto "
      titoloCorsivo={portfolio?.name ?? ''}
      sottotesto={
        scheda === 'carico'
          ? 'Carico titoli · iscrizione nuova posizione'
          : scheda === 'titolo'
            ? 'Scheda titolo · anagrafica completa della posizione'
            : 'Vista di dettaglio'
      }
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
          {/* ===== SCHEDA: Riepilogo =====
              Il guscio (`Guscio.tsx`) sceglie già mastro/quadro per l'impalcatura di
              pagina; questo ternario, gemello e indipendente, sceglie la resa del
              *contenuto* della scheda Riepilogo (US-051/TASK-05). Stesse props per
              entrambe le viste — `RiepilogoProps` è condiviso — nessun ricalcolo. */}
          {scheda === 'riepilogo' && (
            design === 'quadro' ? (
              <RiepilogoQuadro
                portfolioName={portfolio.name}
                portfolioCreatedAt={portfolio.created_at}
                enrichedPositions={enrichedPositions}
                enrichedLoading={enrichedLoading}
                posizioniAperte={posizioniAperte}
                posizioniChiuse={posizioniChiuse}
                ultimaVenditaPerIsin={ultimaVenditaPerIsin}
                series={series}
                seriesLoading={seriesLoading}
                isinInLavorazione={isinInLavorazione}
                setIsinInLavorazione={setIsinInLavorazione}
                id={id}
                ricalcolaSilenzioso={ricalcolaSilenzioso}
                apriSchedaTitolo={apriSchedaTitolo}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                renameError={renameError}
                renaming={renaming}
                handleRename={handleRename}
                deleteError={deleteError}
                deleting={deleting}
                handleDelete={handleDelete}
              />
            ) : (
              <RiepilogoMastro
                portfolioName={portfolio.name}
                portfolioCreatedAt={portfolio.created_at}
                enrichedPositions={enrichedPositions}
                enrichedLoading={enrichedLoading}
                posizioniAperte={posizioniAperte}
                posizioniChiuse={posizioniChiuse}
                ultimaVenditaPerIsin={ultimaVenditaPerIsin}
                series={series}
                seriesLoading={seriesLoading}
                isinInLavorazione={isinInLavorazione}
                setIsinInLavorazione={setIsinInLavorazione}
                id={id}
                ricalcolaSilenzioso={ricalcolaSilenzioso}
                apriSchedaTitolo={apriSchedaTitolo}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                renameError={renameError}
                renaming={renaming}
                handleRename={handleRename}
                deleteError={deleteError}
                deleting={deleting}
                handleDelete={handleDelete}
              />
            )
          )}

          {/* ===== SCHEDA: Scheda titolo (US-018) ===== */}
          {scheda === 'titolo' && isinSelezionato !== null && id && (
            <>
              <SchedaTitolo portfolioId={id} isin={isinSelezionato} onDatiAggiornati={fetchEnriched} />

              <div className="bottoni" style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="bottone secondario"
                  data-testid="btn-torna-riepilogo"
                  onClick={() => setScheda('riepilogo')}
                >
                  &larr; Torna al riepilogo
                </button>
              </div>
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
                        <span className="sotto-etichetta">numero positivo, al più 6 decimali</span>
                      </label>
                      <div className={`campo${fieldErrors.quantity ? ' con-errore' : ''}`}>
                        <span className="unita">QTÀ</span>
                        <input
                          id="carico-quantita"
                          data-testid="input-quantita"
                          type="text"
                          inputMode="decimal"
                          placeholder="es. 12,345"
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

              <div className="sezione-titolo" style={{ marginTop: '32px' }}>
                Scarico titoli &middot; registrazione di una vendita
                <span className="nota">
                  FR-022 &middot; la vendita è una nuova iscrizione, non la rettifica di un carico
                </span>
              </div>

              {ultimaVendita && (
                <div className="avviso-successo" role="status" data-testid="scarico-successo">
                  <span className="timbro-ok">Iscritto</span>
                  <p>
                    Scarico di <b>{quantita(ultimaVendita.quantity)}</b> quote <b>{ultimaVendita.isin}</b> del{' '}
                    <b>{dataCarico(ultimaVendita.saleDate)}</b> a{' '}
                    <b>€ {prezzo(ultimaVendita.salePrice)}</b> iscritto nel registro. Nessun carico è
                    stato modificato o cancellato.
                  </p>
                </div>
              )}

              <ModuloScarico
                portfolioId={id ?? ''}
                titoli={titoliScaricabili}
                onIscritta={dopoScaricoCompleto}
              />

              {residuoDopoVendita && (
                <div
                  className={`riquadro-residuo${residuoDopoVendita.dopo.totalQuantity === 0 ? ' chiuso' : ''}`}
                  data-testid="riquadro-residuo"
                >
                  <div className="fascia-colore" />
                  <div className="contenuto">
                    <div className="casella-residuo">
                      <span className="et">Quantità residua</span>
                      <span className="cifra-grande" data-testid="residuo-quantita">
                        {quantita(residuoDopoVendita.dopo.totalQuantity)}
                      </span>
                      <span className="prima-dopo">
                        Σ carichi {quantita(residuoDopoVendita.dopo.loadedQuantity)} − Σ
                        vendite {quantita(residuoDopoVendita.dopo.soldQuantity)}
                      </span>
                    </div>
                    <div className="casella-residuo">
                      <span className="et">Prezzo medio del residuo</span>
                      {residuoDopoVendita.dopo.avgLoadPrice !== null ? (
                        <span className="cifra-grande" data-testid="residuo-prezzo-medio">
                          <span className="valuta">EUR</span>
                          {prezzo(residuoDopoVendita.dopo.avgLoadPrice)}
                        </span>
                      ) : (
                        <span
                          className="cifra-grande assente dato-mancante"
                          data-testid="residuo-prezzo-medio"
                        >
                          —
                        </span>
                      )}
                      <span className="prima-dopo">
                        {residuoDopoVendita.prima.avgLoadPrice !== null ? (
                          <>
                            prima dell&apos;operazione{' '}
                            <s>€ {prezzo(residuoDopoVendita.prima.avgLoadPrice)}</s> — ricalcolato sui
                            soli lotti non consumati
                          </>
                        ) : (
                          <>ricalcolato sui soli lotti non consumati</>
                        )}
                      </span>
                    </div>
                    <div className="casella-residuo">
                      <span className="et">Controvalore di carico residuo</span>
                      <span className="cifra-grande" data-testid="residuo-controvalore">
                        <span className="valuta">EUR</span>
                        {importo(residuoDopoVendita.dopo.totalLoadValue)}
                      </span>
                      <span className="prima-dopo">
                        {residuoDopoVendita.dopo.totalQuantity === 0
                          ? 'il titolo contribuisce 0 al valore attuale del portafoglio'
                          : 'nessun carico modificato: il registro conserva tutte le iscrizioni'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

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
                      <th>Denominazione &middot; ISIN</th>
                      <th>Quantità residua</th>
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
                            <CellaTitolo isin={summary.isin} nome={nomePerIsin.get(summary.isin) ?? null} />
                          </td>
                          <td className="cifra">{quantita(summary.totalQuantity)}</td>
                          <td className={summary.avgLoadPrice !== null ? 'cifra euro' : 'cifra dato-mancante'}>
                            {summary.avgLoadPrice !== null ? summary.avgLoadPrice.toFixed(4) : '—'}
                          </td>
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

              {/* Sezione registro delle iscrizioni: carichi e scarichi (ledger completo) */}
              <div className="sezione-titolo" style={{ marginTop: '32px' }}>
                Registro delle iscrizioni
                <span className="nota">
                  carichi e scarichi in ordine di data &middot; nessuna riga è mai riscritta
                </span>
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
                      <th>Iscrizione</th>
                      <th>Denominazione &middot; ISIN</th>
                      <th>Data</th>
                      <th>Prezzo</th>
                      <th>Quantità</th>
                      <th>Controvalore</th>
                      <th>Residuo del lotto</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iscrizioni.length === 0 ? (
                      <tr className="riga-vuota">
                        <td colSpan={8}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, opacity: .45 }}>
                              Nessuna iscrizione registrata
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      iscrizioni.map((iscrizione) => {
                        if (iscrizione.specie === 'scarico') {
                          const { vendita } = iscrizione;
                          return (
                            <tr
                              key={`scarico-${vendita.id}`}
                              className={`iscrizione-scarico${ultimaVendita?.id === vendita.id ? ' riga-nuova' : ''}`}
                              data-testid={`scarico-${vendita.id}`}
                            >
                              <td>
                                <span className="marca scarico">Scarico</span>
                              </td>
                              <td>
                                <CellaTitolo isin={vendita.isin} nome={nomePerIsin.get(vendita.isin) ?? null} />
                              </td>
                              <td className="cifra">{dataCarico(vendita.saleDate)}</td>
                              <td className="cifra euro">{prezzo(vendita.salePrice)}</td>
                              <td className="cifra">{quantita(vendita.quantity)}</td>
                              <td className="cifra euro">{importo(vendita.salePrice * vendita.quantity)}</td>
                              <td className="cifra dato-mancante">—</td>
                              <td />
                            </tr>
                          );
                        }
                        const pos = iscrizione.posizione;
                        const residuo = residuoPerLotto.get(pos.id) ?? pos.quantity;
                        const consumato = residuo < pos.quantity;
                        const perche = consumato
                          ? residuo === 0
                            ? 'consumato da una vendita: si rettifica solo un\'iscrizione errata'
                            : `consumato in parte (${quantita(pos.quantity - residuo)} quote su ${quantita(pos.quantity)}) da una vendita: si rettifica solo un'iscrizione errata`
                          : null;
                        return editingPositionId === pos.id ? (
                          <tr key={pos.id} data-testid={`edit-riga-${pos.id}`}>
                            <td>
                              <span className="marca">Carico</span>
                            </td>
                            <td>
                              <CellaTitolo isin={pos.isin} nome={nomePerIsin.get(pos.isin) ?? null} />
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
                                type="text"
                                inputMode="decimal"
                                placeholder="es. 12,345"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                data-testid="edit-input-quantita"
                                disabled={editSubmitting}
                                style={{ width: '90px' }}
                              />
                            </td>
                            <td className="cifra euro">—</td>
                            <td className="cifra">{residuo}</td>
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
                          <tr
                            key={pos.id}
                            className={`${pos.id === newPositionId ? 'riga-nuova' : ''}${residuo === 0 ? ' lotto-esaurito' : ''}`.trim()}
                            data-testid={`posizione-${pos.id}`}
                          >
                            <td>
                              <span className={residuo === 0 ? 'marca esaurito' : 'marca'}>
                                {residuo === 0 ? 'Carico · esaurito' : 'Carico'}
                              </span>
                            </td>
                            <td>
                              <CellaTitolo isin={pos.isin} nome={nomePerIsin.get(pos.isin) ?? null} />
                            </td>
                            <td className="cifra">{dataCarico(pos.loadDate)}</td>
                            <td className="cifra euro">{pos.loadPrice.toFixed(4)}</td>
                            <td className="cifra">{quantita(pos.quantity)}</td>
                            <td className="cifra euro">{(pos.loadPrice * pos.quantity).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="cifra" data-testid={`residuo-lotto-${pos.id}`}>{quantita(residuo)}</td>
                            <td>
                              <button
                                type="button"
                                className={`bottone secondario${consumato ? ' impedito' : ''}`}
                                data-testid={`btn-modifica-${pos.id}`}
                                disabled={consumato}
                                onClick={() => startEdit(pos)}
                                style={{ marginRight: '4px' }}
                              >
                                Modifica
                              </button>
                              <button
                                type="button"
                                className={`bottone rosso${consumato ? ' impedito' : ''}`}
                                data-testid={`btn-rimuovi-${pos.id}`}
                                disabled={consumato || deletingPositionId === pos.id}
                                onClick={() => { void handleDeletePosition(pos.id); }}
                              >
                                {deletingPositionId === pos.id ? 'Rimozione…' : 'Rimuovi'}
                              </button>
                              {perche && (
                                <span className="perche" data-testid={`perche-impedito-${pos.id}`}>
                                  {perche}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {iscrizioni.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={5}>Controvalore di carico del residuo</td>
                        <td className="cifra euro" data-testid="registro-controvalore-residuo">
                          {importo(
                            positions.reduce(
                              (somma, p) => somma + p.loadPrice * (residuoPerLotto.get(p.id) ?? p.quantity),
                              0,
                            ),
                          )}
                        </td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Guscio>
  );
}
