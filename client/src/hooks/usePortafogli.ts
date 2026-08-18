import { useCallback, useEffect, useState } from 'react';
import type { Portfolio } from '@portfolia/shared';

export function usePortafogli() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portfolios')
      .then((res) => {
        if (!res.ok) throw new Error('Risposta non valida dal server');
        return res.json() as Promise<Portfolio[]>;
      })
      .then(setPortfolios)
      .catch(() => setError('Backend non raggiungibile'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = useCallback((portfolio: Portfolio) => {
    setPortfolios((prev) => [...prev, portfolio]);
  }, []);

  return { portfolios, error, loading, handleCreated };
}
