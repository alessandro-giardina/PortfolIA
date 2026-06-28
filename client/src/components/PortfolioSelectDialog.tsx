import { useEffect, useState, useCallback } from 'react';
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

  return (
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
        }}
      >
        <div className="dialog-intestazione" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
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

        <div className="dialog-corpo">
          {loading ? (
            <p style={{ fontStyle: 'italic', color: 'var(--seppia)', fontSize: '13px' }}>Caricamento portafogli…</p>
          ) : portfolios.length === 0 ? (
            <div data-testid="msg-nessun-portafoglio" style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontStyle: 'italic', marginBottom: '8px' }}>Nessun portafoglio disponibile.</p>
              <p style={{ fontSize: '12px', color: 'var(--seppia)' }}>
                Crea prima un portafoglio dalla pagina principale per poter aggiungere un titolo.
              </p>
            </div>
          ) : (
            <>
              <p className="nota-dialog" style={{ fontSize: '13px', fontStyle: 'italic', marginBottom: '14px', color: 'var(--seppia)' }}>
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

          <div className="dialog-bottoni" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
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
      </div>
    </div>
  );
}
