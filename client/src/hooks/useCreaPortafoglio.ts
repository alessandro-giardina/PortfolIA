import { useState } from 'react';
import type { Portfolio, CreatePortfolioRequest } from '@portfolia/shared';

export function useCreaPortafoglio(onCreated: (portfolio: Portfolio) => void) {
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

  return { name, setName, error, loading, handleSubmit };
}
