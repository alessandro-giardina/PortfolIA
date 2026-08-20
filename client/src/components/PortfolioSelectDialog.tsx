import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Portfolio } from '@portfolia/shared';
import { useDesign } from '../hooks/useDesign.js';

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
  const { design } = useDesign();
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
  // NB: gli stili qui sotto sono ora solo `className`, senza regole CSS ancora
  // scritte (arrivano in TASK-04). `.overlay-dialog` deve restare
  // `position: fixed; inset: 0; display: flex; align-items/justify-content: center;
  // padding: 24px` — il padding è il respiro fra il riquadro e i bordi della
  // finestra quando l'elenco è alla massima altezza.
  return createPortal(
    <div className="overlay-dialog" role="presentation" onClick={handleOverlayClick}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-titolo"
        className="dialog-portafoglio"
      >
        {/*
          `.dialog-portafoglio` deve restare una colonna flex con un tetto
          d'altezza (`display: flex; flex-direction: column; max-height: 100%`):
          l'elenco non deve far crescere il riquadro oltre la finestra, deve
          scorrere dentro `.dialog-corpo`. Il 100% è l'altezza utile
          dell'overlay già al netto del suo padding.
        */}
        <div className="dialog-intestazione">
          <div>
            <div className="titolo-dialog" id="dialog-titolo">
              Scegli un Portafoglio
            </div>
            <div className="sottotitolo-dialog">
              {name ?? isin} &middot; {isin}
            </div>
          </div>
          <button type="button" className="chiudi-dialog" aria-label="Chiudi" onClick={onClose}>
            ✕
          </button>
        </div>

        {/*
          L'unica area scorrevole del dialog. Nel `.dialog-corpo` di TASK-04, `min-height: 0`
          è indispensabile: senza, la base minima di un figlio flex è il suo contenuto,
          quindi il corpo si rifiuterebbe di rimpicciolirsi e il tetto d'altezza del
          riquadro verrebbe sfondato dall'elenco invece che assorbito dallo
          scorrimento (`flex: 1 1 auto; overflow-y: auto`). `overscroll-behavior: contain`
          ferma lo scorrimento qui: arrivati a fondo elenco non deve proseguire
          trascinando la pagina che sta sotto l'overlay.
        */}
        <div className="dialog-corpo" data-testid="dialog-corpo">
          {/*
            I due paragrafi che aprono direttamente il corpo (caricamento e nota,
            classi `caricamento-dialog`/`nota-dialog`) devono avere `margin-top: 0`
            esplicito. Lo stato "nessun portafoglio" non ne ha bisogno: il suo `<p>`
            è avvolto in un `<div>` con padding (`msg-nessun-portafoglio-corpo`), che
            il margine non attraversava nemmeno prima. Prima erano i 13px del margine
            predefinito dello user-agent, che risalivano attraverso `.dialog-corpo` e
            collassavano con il `margin-bottom: 16px` dell'intestazione —
            `max(16, 13)`, quindi 16. Da quando il riquadro è un contenitore flex i
            margini dei figli non collassano più e quei 13px si sommerebbero,
            spostando in basso l'intero dialog: azzerarli conserva la spaziatura di
            prima invece di affidarla a un collasso che non avviene più.
          */}
          {loading ? (
            <p className="caricamento-dialog">Caricamento portafogli…</p>
          ) : portfolios.length === 0 ? (
            <div data-testid="msg-nessun-portafoglio" className="msg-nessun-portafoglio-corpo">
              <p className="msg-nessun-portafoglio-titolo">Nessun portafoglio disponibile.</p>
              <p className="msg-nessun-portafoglio-dettaglio">
                Crea prima un portafoglio dalla pagina principale per poter aggiungere un titolo.
              </p>
            </div>
          ) : (
            <>
              <p className="nota-dialog">
                Seleziona il portafoglio di destinazione. Il modulo di carico sarà pre-compilato
                con ISIN, nome e prezzo corrente del titolo.
              </p>
              <div className="lista-portafogli" role="listbox" aria-label="Portafogli disponibili">
                {portfolios.map((p) => (
                  // Lo stato selezionato (bordo/sfondo della riga, riempimento del
                  // pallino) è espresso solo dalla classe `selezionata`: TASK-04 lo
                  // stila con i selettori composti `.riga-portafoglio.selezionata`
                  // e `.riga-portafoglio.selezionata .radio-custom`, non più con
                  // uno stile inline calcolato da `selectedId === p.id`.
                  <div
                    key={p.id}
                    className={`riga-portafoglio${selectedId === p.id ? ' selezionata' : ''}`}
                    role="option"
                    aria-selected={selectedId === p.id}
                    tabIndex={0}
                    data-testid={`portafoglio-option-${p.id}`}
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(p.id); }}
                  >
                    <div className="radio-custom" aria-hidden="true" />
                    <div className="nome-portafoglio">{p.name}</div>
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
        <div className="dialog-bottoni">
          <button
            type="button"
            className={design === 'quadro' ? 'bottone quieto' : 'bottone secondario'}
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
