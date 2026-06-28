import { useState } from 'react';
import type { Portfolio, CreatePortfolioRequest } from '@portfolia/shared';

interface Props {
  onCreated: (portfolio: Portfolio) => void;
}

export default function CreatePortfolioForm({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim() === '') {
      setError('Il nome del portafoglio non può essere vuoto.');
      return;
    }

    setLoading(true);
    try {
      const body: CreatePortfolioRequest = { name: name.trim() };
      const res = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const data = (await res.json()) as { error: string };
        setError(data.error);
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error ?? 'Errore durante la creazione del portafoglio.');
        return;
      }

      const created = (await res.json()) as Portfolio;
      setName('');
      onCreated(created);
    } catch {
      setError('Impossibile contattare il server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="riquadro-modulo" aria-label="Crea portafoglio">
      <div className="intestazione-modulo">
        <span>Dati del nuovo portafoglio</span>
        <span className="num-modulo">Mod. 01/A</span>
      </div>

      <div className="corpo-modulo">
        <div className={`riga-modulo${error ? ' con-errore' : ''}`}>
          <label htmlFor="portfolio-name">Denominazione del conto</label>
          <div className={`campo${error ? ' con-errore' : ''}`}>
            <input
              id="portfolio-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Conto Obbligazionario"
              maxLength={80}
              autoComplete="off"
              disabled={loading}
              aria-invalid={error !== null}
              aria-describedby={error ? 'portfolio-name-error' : undefined}
            />
            {error && (
              <span
                id="portfolio-name-error"
                role="alert"
                className="errore-campo visibile"
              >
                {error}
              </span>
            )}
          </div>
        </div>

        <div className="bottoni">
          <button type="submit" className="bottone" disabled={loading}>
            {loading ? 'Registrazione…' : 'Registra a mastro'}
          </button>
        </div>

        <p className="nota-contabile">
          Nota del contabile: il nome del conto deve essere univoco nel registro. Una volta
          registrato, il portafoglio è persistito nel libro mastro locale e sarà visibile ad
          ogni riapertura dell&rsquo;applicazione.
        </p>
      </div>
    </form>
  );
}
