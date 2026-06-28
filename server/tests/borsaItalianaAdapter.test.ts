import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSecurityByIsin, USER_AGENT } from '../src/market/borsaItalianaAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

const BASE = 'https://fake.borsa.test';

function htmlResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => body,
  } as unknown as Response;
}

// Pagina dei risultati di ricerca con un link alla scheda contenente l'ISIN.
const searchPage = (isin: string): string =>
  `<html><body><ul class="results"><li><a href="/borsa/etf/scheda/${isin}.html">Vai alla scheda</a></li></ul></body></html>`;

describe('fetchSecurityByIsin', () => {
  it('ISIN trovato → status found con anagrafica e User-Agent corretto', async () => {
    const isin = 'IE00BMVB5S82';
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('search.html')) return htmlResponse(searchPage(isin));
      return htmlResponse(fixture('etf-ishares.html'));
    });

    const result = await fetchSecurityByIsin(isin, { fetchFn: fetchFn as unknown as typeof fetch, baseUrl: BASE });

    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.security.name).toBe('iShares Core MSCI World UCITS ETF');
      expect(result.security.price).toBe(94.55);
      expect(result.security.currency).toBe('EUR');
    }

    // User-Agent realistico inviato su entrambe le richieste.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    for (const call of calls) {
      const headers = call[1].headers as Record<string, string>;
      expect(headers['User-Agent']).toBe(USER_AGENT);
    }
  });

  it('ricerca senza risultati → status not-found (una sola richiesta)', async () => {
    const fetchFn = vi.fn(async () => htmlResponse('<html><body>Nessun risultato</body></html>'));
    const result = await fetchSecurityByIsin('US0378331005', {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });
    expect(result.status).toBe('not-found');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('scheda con markup malformato → not-found (degradazione trasparente)', async () => {
    const isin = 'IT0000000111';
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('search.html')) return htmlResponse(searchPage(isin));
      return htmlResponse('<html><body><div>contenuto inatteso</div></body></html>');
    });
    const result = await fetchSecurityByIsin(isin, {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });
    expect(result.status).toBe('not-found');
  });

  it('errore di rete → status error senza eccezioni opache', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await fetchSecurityByIsin('IE00BMVB5S82', {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.reason).toContain('ECONNREFUSED');
    }
  });

  it('timeout (abort) → status error', async () => {
    const fetchFn = vi.fn((_url: string | URL, opts?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = opts?.signal;
        if (signal) {
          signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
        }
      });
    });
    const result = await fetchSecurityByIsin('IE00BMVB5S82', {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
      timeoutMs: 20,
    });
    expect(result.status).toBe('error');
  });

  it('risposta HTTP non ok (500) → status error', async () => {
    const fetchFn = vi.fn(async () => htmlResponse('errore server', false, 500));
    const result = await fetchSecurityByIsin('IE00BMVB5S82', {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });
    expect(result.status).toBe('error');
  });
});
