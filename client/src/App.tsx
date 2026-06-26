import { useEffect, useState } from 'react';
import type { HealthResponse } from '@portfolia/shared';

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setError('Backend non raggiungibile'));
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>PortfolIA</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {health && (
        <p>
          Backend raggiungibile — status: <strong>{health.status}</strong>, timestamp:{' '}
          <strong>{health.timestamp}</strong>
        </p>
      )}
      {!health && !error && <p>Verifica connessione al backend...</p>}
    </main>
  );
}
