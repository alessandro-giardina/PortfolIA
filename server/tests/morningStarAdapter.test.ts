import { describe, it, expect, vi } from 'vitest';
import { fetchSecurityByIsin } from '../src/market/morningStarAdapter.js';
import type { MorningStarBundle, MorningStarRenderer } from '../src/market/morningStarTypes.js';

const ISIN = 'IE00BJRHVJ28';

function bundle(overrides: Partial<MorningStarBundle> = {}): MorningStarBundle {
  return {
    instrumentUrl: 'https://www.morningstar.com/funds/_/0P0001HAAY/quote',
    instrumentType: 'Fund',
    h1: 'Wellington Euro High Yield Bond Fund EUR D Ac',
    priceText: '€ 13.60',
    isinPresent: true,
    sal: { baseCurrency: 'EUR', categoryName: 'EUR High Yield Bond' },
    ...overrides,
  };
}

describe('fetchSecurityByIsin (MorningStar)', () => {
  it('strumento risolto e ISIN presente → found con campi mappati dal bundle', async () => {
    const renderer: MorningStarRenderer = vi.fn(async () => bundle());

    const result = await fetchSecurityByIsin(ISIN, { renderer });

    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.security.name).toBe('Wellington Euro High Yield Bond Fund EUR D Ac');
      expect(result.security.price).toBe(13.6);
      expect(result.security.currency).toBe('EUR');
      expect(result.security.segment).toBe('EUR High Yield Bond');
      expect(result.security.instrumentType).toBe('Fund');
    }
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it('nessuno strumento risolto (renderer → null) → not-found', async () => {
    const renderer: MorningStarRenderer = vi.fn(async () => null);

    const result = await fetchSecurityByIsin(ISIN, { renderer });

    expect(result.status).toBe('not-found');
  });

  it('scheda risolta ma ISIN assente → not-found (anti-titolo-errato)', async () => {
    const renderer: MorningStarRenderer = vi.fn(async () => bundle({ isinPresent: false }));

    const result = await fetchSecurityByIsin(ISIN, { renderer });

    expect(result.status).toBe('not-found');
  });

  it('scheda senza denominazione né prezzo → not-found', async () => {
    const renderer: MorningStarRenderer = vi.fn(async () =>
      bundle({ h1: null, priceText: null, sal: {} }),
    );

    const result = await fetchSecurityByIsin(ISIN, { renderer });

    expect(result.status).toBe('not-found');
  });

  it('renderer che lancia (blocco/timeout) → error con reason', async () => {
    const renderer: MorningStarRenderer = vi.fn(async () => {
      throw new Error('navigation timeout');
    });

    const result = await fetchSecurityByIsin(ISIN, { renderer });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.reason).toContain('timeout');
    }
  });

  it('normalizza l’ISIN (trim + maiuscolo) prima di interrogare la fonte', async () => {
    const renderer: MorningStarRenderer = vi.fn(async () => bundle());

    await fetchSecurityByIsin('  ie00bjrhvj28 ', { renderer });

    expect(renderer).toHaveBeenCalledWith(ISIN, expect.anything());
  });
});
