import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSecurityByIsin } from '../src/market/morningStarAdapter.js';
import { USER_AGENT } from '../src/market/borsaItalianaAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

const BASE = 'https://fake.morningstar.test';
const ISIN = 'IE00BJRHVJ28';

function htmlResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => body,
  } as unknown as Response;
}

/** Pagina di ricerca MorningStar con link alla scheda contenente l'ISIN. */
const searchPage = (isin: string): string =>
  `<html><body>
    <ul class="results">
      <li><a href="/it/etf/scheda/${isin}.html">ETF di test</a></li>
    </ul>
  </body></html>`;

describe('fetchSecurityByIsin (MorningStar)', () => {
  it('ISIN trovato → status found con campi corretti e User-Agent su entrambe le chiamate', async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('search')) return htmlResponse(searchPage(ISIN));
      return htmlResponse(fixture('morningstar-etf.html'));
    });

    const result = await fetchSecurityByIsin(ISIN, {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });

    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.security.name).toBe('iShares Core MSCI EM IMI UCITS ETF USD (Acc)');
      expect(result.security.price).toBe(32.45);
      expect(result.security.ticker).toBe('EMIM');
      expect(result.security.issuer).toBe('iShares (BlackRock)');
    }

    // User-Agent realistico inviato su entrambe le richieste (ricerca + scheda).
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    for (const call of calls) {
      const headers = call[1].headers as Record<string, string>;
      expect(headers['User-Agent']).toBe(USER_AGENT);
    }
  });

  it('ricerca senza link alla scheda → not-found (una sola richiesta)', async () => {
    const fetchFn = vi.fn(async () =>
      htmlResponse('<html><body>Nessun risultato per questo ISIN</body></html>'),
    );

    const result = await fetchSecurityByIsin(ISIN, {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });

    expect(result.status).toBe('not-found');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('scheda con markup malformato (nome e prezzo assenti) → not-found', async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('search')) return htmlResponse(searchPage(ISIN));
      return htmlResponse('<html><body><div>contenuto inatteso senza campi riconoscibili</div></body></html>');
    });

    const result = await fetchSecurityByIsin(ISIN, {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });

    expect(result.status).toBe('not-found');
  });

  it('errore di rete → status error con reason', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    const result = await fetchSecurityByIsin(ISIN, {
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

    const result = await fetchSecurityByIsin(ISIN, {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
      timeoutMs: 20,
    });

    expect(result.status).toBe('error');
  });

  it('risposta HTTP 5xx → status error', async () => {
    const fetchFn = vi.fn(async () => htmlResponse('Internal Server Error', false, 500));

    const result = await fetchSecurityByIsin(ISIN, {
      fetchFn: fetchFn as unknown as typeof fetch,
      baseUrl: BASE,
    });

    expect(result.status).toBe('error');
  });
});
