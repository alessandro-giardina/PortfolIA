import type { Portfolio } from '@portfolia/shared';
import { useCreaPortafoglio } from '../hooks/useCreaPortafoglio.js';

interface CreaPortafoglioQuadroProps {
  onCreated: (portfolio: Portfolio) => void;
}

/**
 * Modulo "Nuovo portafoglio" del design Quadro strumenti (US-053/TASK-05):
 * stessa logica di `CreatePortfolioForm` (via `useCreaPortafoglio`), sola resa
 * diversa — pannello con lo stesso schema di "Gestione del conto" in
 * `RiepilogoQuadro` (`.campo-gestione` + `.riga-campo`).
 */
export default function CreaPortafoglioQuadro({ onCreated }: CreaPortafoglioQuadroProps) {
  const { name, setName, error, loading, handleSubmit } = useCreaPortafoglio(onCreated);

  return (
    <section className="pannello" aria-label="Nuovo portafoglio">
      <div className="testa-pannello">
        <div>
          <h3>Nuovo portafoglio</h3>
          <span className="chiosa">apri un conto per iniziare a registrare carichi e vendite</span>
        </div>
      </div>
      <div className="corpo-pannello modulo-gestione">
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className="campo-gestione">
            <label htmlFor="nuovo-portafoglio-input-quadro">Nome del portafoglio</label>
            <div className="riga-campo">
              <input
                id="nuovo-portafoglio-input-quadro"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Portafoglio Principale"
                maxLength={80}
                autoComplete="off"
                disabled={loading}
                aria-invalid={error !== null}
                aria-describedby={error ? 'nuovo-portafoglio-input-quadro-errore' : undefined}
                data-testid="input-nuovo-portafoglio"
              />
              <button
                type="submit"
                className="bottone"
                disabled={loading}
                data-testid="btn-crea-portafoglio-quadro"
              >
                {loading ? 'Creazione…' : 'Crea portafoglio'}
              </button>
              {error && (
                <span id="nuovo-portafoglio-input-quadro-errore" role="alert" className="errore-campo-quadro">
                  {error}
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
