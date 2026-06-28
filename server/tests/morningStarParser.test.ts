import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMorningStar } from '../src/market/morningStarParser.js';
import type { MorningStarBundle, MorningStarSalData } from '../src/market/morningStarTypes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const salFixture = (): MorningStarSalData =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'morningstar-sal-performance.json'), 'utf-8'));

const ISIN = 'IE00BJRHVJ28';

function bundle(overrides: Partial<MorningStarBundle> = {}): MorningStarBundle {
  return {
    instrumentUrl: 'https://www.morningstar.com/funds/_/0P0001HAAY/quote',
    instrumentType: 'Fund',
    h1: 'Wellington Euro High Yield Bond Fund EUR D Ac',
    priceText: '€ 13.60',
    isinPresent: true,
    sal: {},
    ...overrides,
  };
}

describe('parseMorningStar', () => {
  it('bundle completo (con JSON sal-service reale) → campi popolati correttamente', () => {
    const result = parseMorningStar(bundle({ sal: salFixture() }), ISIN);

    expect(result.isin).toBe(ISIN);
    expect(result.name).toBe('Wellington Euro High Yield Bond Fund EUR D Ac');
    expect(result.price).toBe(13.6);
    expect(result.currency).toBe('EUR');
    expect(result.segment).toBe('EUR High Yield Bond');
    expect(result.instrumentType).toBe('Fund');
  });

  it('campi non esposti da MorningStar restano null, non stimati', () => {
    const result = parseMorningStar(bundle({ sal: salFixture() }), ISIN);

    expect(result.ticker).toBeNull();
    expect(result.totalAnnualFees).toBeNull();
    expect(result.issuer).toBeNull();
    expect(result.dividendPolicy).toBeNull();
  });

  it('bundle senza JSON sal e senza prezzo → solo nome, gli altri null', () => {
    const result = parseMorningStar(bundle({ sal: {}, priceText: null }), ISIN);

    expect(result.name).toBe('Wellington Euro High Yield Bond Fund EUR D Ac');
    expect(result.price).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.segment).toBeNull();
  });

  it('bundle vuoto → tutti i campi anagrafici null (nessun dato inventato)', () => {
    const result = parseMorningStar(
      bundle({ h1: null, priceText: null, instrumentType: null, sal: {} }),
      ISIN,
    );

    expect(result.isin).toBe(ISIN);
    expect(result.name).toBeNull();
    expect(result.price).toBeNull();
    expect(result.instrumentType).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.segment).toBeNull();
  });

  it('prezzo: interpreta sia formato inglese sia italiano, null se non numerico', () => {
    expect(parseMorningStar(bundle({ priceText: '1,234.55' }), ISIN).price).toBe(1234.55);
    expect(parseMorningStar(bundle({ priceText: '1.234,55 EUR' }), ISIN).price).toBe(1234.55);
    expect(parseMorningStar(bundle({ priceText: '13,60' }), ISIN).price).toBe(13.6);
    expect(parseMorningStar(bundle({ priceText: '—' }), ISIN).price).toBeNull();
    expect(parseMorningStar(bundle({ priceText: 'n.d.' }), ISIN).price).toBeNull();
  });

  it('parsing è determinista: chiamate multiple producono lo stesso risultato', () => {
    const b = bundle({ sal: salFixture() });
    expect(parseMorningStar(b, ISIN)).toEqual(parseMorningStar(b, ISIN));
  });
});
