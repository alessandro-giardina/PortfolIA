import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMorningStar } from '../src/market/morningStarParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

const ISIN = 'IE00BJRHVJ28';

describe('parseMorningStar', () => {
  it('fixture completa → tutti i campi popolati correttamente', () => {
    const result = parseMorningStar(fixture('morningstar-etf.html'), ISIN);

    expect(result.isin).toBe(ISIN);
    expect(result.name).toBe('iShares Core MSCI EM IMI UCITS ETF USD (Acc)');
    expect(result.price).toBe(32.45);
    expect(result.ticker).toBe('EMIM');
    expect(result.instrumentType).toBe('ETF azionario');
    expect(result.totalAnnualFees).toBe('0,18%');
    expect(result.currency).toBe('USD');
    expect(result.issuer).toBe('iShares (BlackRock)');
    expect(result.segment).toBe('Mercati emergenti');
    expect(result.dividendPolicy).toBe('Ad accumulazione');
  });

  it('fixture parziale (campi assenti) → campi mancanti sono null, non stimati', () => {
    // HTML con solo nome e prezzo, tutti gli altri campi assenti.
    const partialHtml = `
      <!DOCTYPE html>
      <html lang="it">
      <body>
        <h1>ETF Parziale di Test</h1>
        <div class="price-section">
          <span class="current-price">10,00</span>
        </div>
        <table><tbody>
          <tr><td class="label">Emittente</td><td class="value">Test Issuer</td></tr>
        </tbody></table>
      </body>
      </html>
    `;
    const result = parseMorningStar(partialHtml, ISIN);

    expect(result.isin).toBe(ISIN);
    expect(result.name).toBe('ETF Parziale di Test');
    expect(result.price).toBe(10.0);
    expect(result.issuer).toBe('Test Issuer');
    // Campi assenti devono essere null, mai inventati.
    expect(result.ticker).toBeNull();
    expect(result.instrumentType).toBeNull();
    expect(result.totalAnnualFees).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.segment).toBeNull();
    expect(result.dividendPolicy).toBeNull();
  });

  it('fixture vuota → tutti i campi null (nessun dato inventato)', () => {
    const emptyHtml = `<!DOCTYPE html><html><body></body></html>`;
    const result = parseMorningStar(emptyHtml, ISIN);

    expect(result.isin).toBe(ISIN);
    expect(result.name).toBeNull();
    expect(result.price).toBeNull();
    expect(result.ticker).toBeNull();
    expect(result.instrumentType).toBeNull();
    expect(result.totalAnnualFees).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.issuer).toBeNull();
    expect(result.segment).toBeNull();
    expect(result.dividendPolicy).toBeNull();
  });

  it('parsing è determinista: chiamate multiple producono lo stesso risultato', () => {
    const html = fixture('morningstar-etf.html');
    const result1 = parseMorningStar(html, ISIN);
    const result2 = parseMorningStar(html, ISIN);
    expect(result1).toEqual(result2);
  });
});
