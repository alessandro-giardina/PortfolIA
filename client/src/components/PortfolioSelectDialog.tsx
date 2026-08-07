import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Portfolio } from '@portfolia/shared';

interface Props {
  /** Info del titolo trovato, per mostrare nel sottotitolo del dialog */
  isin: string;
  name: string | null;
  /** Callback quando l'utente seleziona e conferma un portafoglio */
  onConfirm: (portfolioId: number) => void;
  /** Callback quando l'utente annulla o chiude il dialog */
  onClose: () => void;
}

export default function PortfolioSelectDialog({ isin, name, onConfirm, onClose }: Props) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchPortfolios = useCallback(() => {
    setLoading(true);
    fetch('/api/portfolios')
      .then((res) => (res.ok ? (res.json() as Promise<Portfolio[]>) : []))
      .then((data) => setPortfolios(data))
      .catch(() => setPortfolios([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Il dialog è montato su `document.body`, non dove lo si usa. `ledger.css` dà a
  // ogni figlio del foglio `position: relative; z-index: 2`: sono contesti di
  // impilamento fratelli, quindi lo `z-index: 100` dell'overlay resta confinato
  // dentro quello di `.corpo` e il footer `.pie` — pari livello, ma successivo nel
  // DOM — gli si dipinge sopra. Finché il riquadro era basso non si vedeva; da
  // quando arriva in fondo alla finestra il footer intercetta i clic sulle ultime
  // righe dell'elenco. Il portale toglie il dialog da quel contesto una volta per tutte.
  return createPortal(
    <div
      className="overlay-dialog"
      role="presentation"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Respiro fra il riquadro e i bordi della finestra: senza, con l'elenco al
        // massimo dell'altezza il dialog toccherebbe i lati dello schermo.
        padding: '24px',
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-titolo"
        className="dialog-portafoglio"
        style={{
          background: 'var(--carta)',
          border: '1.5px solid var(--oro)',
          borderRadius: '2px',
          padding: '28px',
          minWidth: '360px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
          // Colonna flex con un tetto d'altezza: l'elenco non fa più crescere il
          // riquadro oltre la finestra, scorre dentro `.dialog-corpo`. Il 100% è
          // l'altezza utile dell'overlay, già al netto del suo padding, e comprende
          // padding e bordo del riquadro grazie al `box-sizing: border-box` globale.
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100%',
        }}
      >
        <div className="dialog-intestazione" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexShrink: 0 }}>
          <div>
            <div className="titolo-dialog" id="dialog-titolo" style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>
              Scegli un Portafoglio
            </div>
            <div className="sottotitolo-dialog" style={{ fontSize: '12px', color: 'var(--seppia)', opacity: 0.8 }}>
              {name ?? isin} &middot; {isin}
            </div>
          </div>
          <button
            type="button"
            className="chiudi-dialog"
            aria-label="Chiudi"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>

        {/*
          L'unica area scorrevole del dialog. `minHeight: 0` è indispensabile: senza,
          la base minima di un figlio flex è il suo contenuto, quindi il corpo si
          rifiuterebbe di rimpicciolirsi e il tetto d'altezza del riquadro verrebbe
          sfondato dall'elenco invece che assorbito dallo scorrimento.
        */}
        <div
          className="dialog-corpo"
          data-testid="dialog-corpo"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            // Lo scorrimento si ferma qui: arrivati a fondo elenco non prosegue
            // trascinando la pagina che sta sotto l'overlay.
            overscrollBehavior: 'contain',
          }}
        >
          {/*
            `marginTop: 0` esplicito sui due paragrafi che aprono direttamente il corpo
            (caricamento e nota). Lo stato "nessun portafoglio" non ne ha bisogno: il
            suo `<p>` è avvolto in un `<div>` con padding, che il margine non
            attraversava nemmeno prima. Prima erano i
            13px del margine predefinito dello user-agent, che risalivano attraverso
            `.dialog-corpo` e collassavano con il `marginBottom: 16px`
            dell'intestazione — `max(16, 13)`, quindi 16. Da quando il riquadro è un
            contenitore flex i margini dei figli non collassano più e quei 13px si
            sommerebbero, spostando in basso l'intero dialog: azzerarli conserva la
            spaziatura di prima invece di affidarla a un collasso che non avviene più.
          */}
          {loading ? (
            <p style={{ marginTop: 0, fontStyle: 'italic', color: 'var(--seppia)', fontSize: '13px' }}>Caricamento portafogli…</p>
          ) : portfolios.length === 0 ? (
            <div data-testid="msg-nessun-portafoglio" style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontStyle: 'italic', marginBottom: '8px' }}>Nessun portafoglio disponibile.</p>
              <p style={{ fontSize: '12px', color: 'var(--seppia)' }}>
                Crea prima un portafoglio dalla pagina principale per poter aggiungere un titolo.
              </p>
            </div>
          ) : (
            <>
              <p className="nota-dialog" style={{ marginTop: 0, fontSize: '13px', fontStyle: 'italic', marginBottom: '14px', color: 'var(--seppia)' }}>
                Seleziona il portafoglio di destinazione. Il modulo di carico sarà pre-compilato
                con ISIN, nome e prezzo corrente del titolo.
              </p>
              <div
                className="lista-portafogli"
                role="listbox"
                aria-label="Portafogli disponibili"
                style={{ marginBottom: '20px' }}
              >
                {portfolios.map((p) => (
                  <div
                    key={p.id}
                    className={`riga-portafoglio${selectedId === p.id ? ' selezionata' : ''}`}
                    role="option"
                    aria-selected={selectedId === p.id}
                    tabIndex={0}
                    data-testid={`portafoglio-option-${p.id}`}
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(p.id); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      marginBottom: '6px',
                      cursor: 'pointer',
                      border: `1px solid ${selectedId === p.id ? 'var(--oro)' : 'rgba(110,90,54,0.25)'}`,
                      background: selectedId === p.id ? 'rgba(174,144,73,0.08)' : 'transparent',
                      borderRadius: '2px',
                    }}
                  >
                    <div
                      className="radio-custom"
                      aria-hidden="true"
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: `2px solid var(--oro)`,
                        background: selectedId === p.id ? 'var(--oro)' : 'transparent',
                        flexShrink: 0,
                      }}
                    />
                    <div className="nome-portafoglio" style={{ fontWeight: 600, fontSize: '14px', flex: 1 }}>
                      {p.name}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/*
          Fuori dal corpo, quindi fuori dallo scorrimento: "Annulla" e "Conferma"
          restano ancorati in fondo al riquadro comunque sia lungo l'elenco.
        */}
        <div className="dialog-bottoni" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            type="button"
            className="bottone secondario"
            data-testid="btn-annulla-dialog"
            onClick={onClose}
          >
            Annulla
          </button>
          {portfolios.length > 0 && (
            <button
              type="button"
              className="bottone"
              data-testid="btn-conferma-dialog"
              disabled={selectedId === null}
              onClick={() => { if (selectedId !== null) onConfirm(selectedId); }}
            >
              Conferma →
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
