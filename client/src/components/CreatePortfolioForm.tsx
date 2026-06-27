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
    <form onSubmit={handleSubmit} style={styles.form} aria-label="Crea portafoglio">
      <h2 style={styles.heading}>Apri un nuovo conto a mastro</h2>

      <div style={styles.fieldRow}>
        <label htmlFor="portfolio-name" style={styles.label}>
          Denominazione del conto
        </label>
        <div style={styles.inputWrapper}>
          <input
            id="portfolio-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. Conto Obbligazionario"
            maxLength={80}
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? 'portfolio-name-error' : undefined}
            style={{
              ...styles.input,
              ...(error ? styles.inputError : {}),
            }}
          />
          {error && (
            <span id="portfolio-name-error" role="alert" style={styles.errorText}>
              {error}
            </span>
          )}
        </div>
      </div>

      <div style={styles.actions}>
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Registrazione…' : 'Registra a mastro'}
        </button>
      </div>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    background: '#f7efda',
    border: '1.5px solid #221c14',
    padding: '24px 28px',
    marginTop: '32px',
    maxWidth: '520px',
  },
  heading: {
    fontFamily: 'Georgia, serif',
    fontSize: '1rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#221c14',
    margin: '0 0 20px',
    borderBottom: '1px solid rgba(34,28,20,0.3)',
    paddingBottom: '10px',
  },
  fieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '18px',
  },
  label: {
    fontFamily: 'Georgia, serif',
    fontSize: '0.85rem',
    color: '#6e5a36',
    letterSpacing: '0.03em',
  },
  inputWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  input: {
    fontFamily: 'Courier New, monospace',
    fontSize: '0.95rem',
    padding: '8px 10px',
    border: '1.5px solid #221c14',
    background: '#fff',
    color: '#221c14',
    outline: 'none',
  },
  inputError: {
    borderColor: '#8d231f',
  },
  errorText: {
    fontFamily: 'Georgia, serif',
    fontSize: '0.82rem',
    color: '#8d231f',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  button: {
    fontFamily: 'Courier New, monospace',
    fontSize: '0.9rem',
    padding: '9px 20px',
    border: '1.5px solid #221c14',
    background: '#221c14',
    color: '#f7efda',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
};
