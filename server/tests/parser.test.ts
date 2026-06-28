import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSecurity } from '../src/market/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('parseSecurity', () => {
  it('ETF: estrae tutti i campi anagrafici dalla scheda', () => {
    const info = parseSecurity(fixture('etf-ishares.html'), 'IE00BMVB5S82');
    expect(info).toEqual({
      isin: 'IE00BMVB5S82',
      name: 'iShares Core MSCI World UCITS ETF',
      price: 94.55,
      ticker: 'SWDA',
      instrumentType: 'ETF azionario',
      totalAnnualFees: '0,20% (TER)',
      currency: 'EUR',
      issuer: 'iShares (BlackRock)',
      segment: 'ETFplus',
      dividendPolicy: 'ad accumulazione',
    });
  });

  it('azione: prezzo con simbolo di valuta viene normalizzato a numero', () => {
    const info = parseSecurity(fixture('azione-enel.html'), 'IT0003128367');
    expect(info.name).toBe('ENEL S.p.A.');
    expect(info.price).toBe(6.123);
    expect(info.ticker).toBe('ENEL');
    expect(info.instrumentType).toBe('Azione ordinaria');
    expect(info.currency).toBe('EUR');
    expect(info.issuer).toBe('Enel S.p.A.');
    expect(info.segment).toBe('Blue Chip');
    expect(info.dividendPolicy).toBe('a distribuzione');
  });

  it('campo assente alla fonte → null (mai inventato)', () => {
    // La scheda ENEL non riporta il TER.
    const info = parseSecurity(fixture('azione-enel.html'), 'IT0003128367');
    expect(info.totalAnnualFees).toBeNull();
  });

  it('markup privo di dati utili → tutti i campi anagrafici null', () => {
    const info = parseSecurity('<html><body><p>pagina non valida</p></body></html>', 'XX0000000000');
    expect(info.name).toBeNull();
    expect(info.price).toBeNull();
    expect(info.ticker).toBeNull();
    expect(info.currency).toBeNull();
    expect(info.isin).toBe('XX0000000000');
  });

  it('valori segnaposto ("-", "n.d.") sono trattati come dato assente', () => {
    const html =
      '<h1>Strumento Test</h1>' +
      '<table><tr><th>Prezzo</th><td>-</td></tr>' +
      '<tr><th>Ticker</th><td>n.d.</td></tr>' +
      '<tr><th>Valuta</th><td>EUR</td></tr></table>';
    const info = parseSecurity(html, 'IT0000000000');
    expect(info.name).toBe('Strumento Test');
    expect(info.price).toBeNull();
    expect(info.ticker).toBeNull();
    expect(info.currency).toBe('EUR');
  });

  it('prezzo con separatore delle migliaia in formato italiano', () => {
    const html = '<h1>Bond</h1><table><tr><th>Prezzo Ufficiale</th><td>1.234,55</td></tr></table>';
    const info = parseSecurity(html, 'IT0000000111');
    expect(info.price).toBe(1234.55);
  });
});
