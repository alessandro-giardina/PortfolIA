import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Sale } from '@portfolia/shared';
import Guscio from '../components/Guscio.js';
import { dataRegistro, type Linguetta } from '../components/Foglio.js';
import SchedaTitolo from '../components/SchedaTitolo.js';
import { usePortafoglio } from '../hooks/usePortafoglio.js';
import { useDatiPortafoglio, type Scheda } from '../hooks/useDatiPortafoglio.js';
import { useFormCarico } from '../hooks/useFormCarico.js';
import { useModificaPosizione } from '../hooks/useModificaPosizione.js';
import { useDesign } from '../hooks/useDesign.js';
import RiepilogoMastro from '../views/RiepilogoMastro.js';
import RiepilogoQuadro from '../views/RiepilogoQuadro.js';
import SchedaTitoloQuadro from '../views/SchedaTitoloQuadro.js';
import CaricoMastro from '../views/CaricoMastro.js';
import CaricoQuadro from '../views/CaricoQuadro.js';

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
    enrichedPositions,
    enrichedLoading,
    series,
    seriesLoading,
    isinSelezionato,
    setIsinSelezionato,
    isinInLavorazione,
    setIsinInLavorazione,
    posizioniAperte,
    posizioniChiuse,
    ultimaVenditaPerIsin,
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
  const modifica = useModificaPosizione(id, onPositionChanged);
  const { setPositionDeleteError } = modifica;

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
              {design === 'quadro' ? (
                <SchedaTitoloQuadro portfolioId={id} isin={isinSelezionato} onDatiAggiornati={fetchEnriched} />
              ) : (
                <SchedaTitolo portfolioId={id} isin={isinSelezionato} onDatiAggiornati={fetchEnriched} />
              )}

              <div className="bottoni" style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className={design === 'quadro' ? 'bottone quieto' : 'bottone secondario'}
                  data-testid="btn-torna-riepilogo"
                  onClick={() => setScheda('riepilogo')}
                >
                  &larr; Torna al riepilogo
                </button>
              </div>
            </>
          )}

          {/* ===== SCHEDA: Carico titoli =====
              Terzo ternario gemello di quelli sopra (US-054): la scheda vive in
              `CaricoMastro`/`CaricoQuadro`, la pagina resta il dispatcher. Gli hook
              restano qui e le viste ricevono `CaricoProps` — commutare design con il
              modulo mezzo compilato non deve azzerarlo, e `useFormCarico` consuma il
              `prefill` di navigazione una volta sola, al mount. */}
          {scheda === 'carico' && (
            design === 'quadro' ? (
              <CaricoQuadro
                id={id}
                carico={carico}
                dati={dati}
                modifica={modifica}
                dopoScaricoCompleto={dopoScaricoCompleto}
              />
            ) : (
              <CaricoMastro
                id={id}
                carico={carico}
                dati={dati}
                modifica={modifica}
                dopoScaricoCompleto={dopoScaricoCompleto}
              />
            )
          )}
        </>
      )}
    </Guscio>
  );
}
