import { describe, it, expect } from 'vitest';
import type { EnrichedPositionSummary } from '@portfolia/shared';
import { CIRCONFERENZA_CIAMBELLA, calcolaComposizione } from './composizione.js';

/** Fabbrica minima: solo i campi che il calcolo legge sono parametrizzabili, il resto è un riempimento innocuo. */
function posizione(overrides: Partial<EnrichedPositionSummary> & { isin: string }): EnrichedPositionSummary {
  return {
    name: null,
    loadedQuantity: 10,
    soldQuantity: 0,
    totalQuantity: 10,
    avgLoadPrice: 10,
    currentPrice: 10,
    currentValue: 100,
    difference: 0,
    realizedPnl: 0,
    latentPnl: 0,
    totalLoadCost: 100,
    totalPnl: 0,
    soldRevenue: 0,
    fetchedAt: 1_700_000_000,
    freshness: 'current',
    ...overrides,
  };
}

describe('calcolaComposizione', () => {
  it('input vuoto: nessuna fetta, totale zero, nessun conteggio', () => {
    const esito = calcolaComposizione([]);
    expect(esito.fette).toEqual([]);
    expect(esito.totale).toBe(0);
    expect(esito.numeroIncluse).toBe(0);
    expect(esito.numeroEscluse).toBe(0);
  });

  it('tutte le posizioni prezzate: tutte incluse, nessuna esclusa', () => {
    const posizioni = [
      posizione({ isin: 'IE00B4L5Y983', currentValue: 300 }),
      posizione({ isin: 'IE00BK5BQT80', currentValue: 200 }),
      posizione({ isin: 'IE00BKM4GZ66', currentValue: 500 }),
    ];
    const esito = calcolaComposizione(posizioni);

    expect(esito.numeroIncluse).toBe(3);
    expect(esito.numeroEscluse).toBe(0);
    expect(esito.totale).toBe(1000);
    expect(esito.fette).toHaveLength(3);
    expect(esito.fette.map((f) => f.percentuale)).toEqual([30, 20, 50]);
  });

  it('alcune posizioni senza prezzo: escluse dal calcolo, ma conteggiate', () => {
    const posizioni = [
      posizione({ isin: 'IE00B4L5Y983', currentValue: 400 }),
      posizione({ isin: 'IE00BK5BQT80', currentValue: null, currentPrice: null }),
      posizione({ isin: 'IE00BKM4GZ66', currentValue: 600 }),
    ];
    const esito = calcolaComposizione(posizioni);

    expect(esito.numeroIncluse).toBe(2);
    expect(esito.numeroEscluse).toBe(1);
    expect(esito.totale).toBe(1000);
    expect(esito.fette.map((f) => f.isin)).toEqual(['IE00B4L5Y983', 'IE00BKM4GZ66']);
  });

  it('le percentuali sommano a ~100 (tolleranza per virgola mobile)', () => {
    const posizioni = [
      posizione({ isin: 'A', currentValue: 333 }),
      posizione({ isin: 'B', currentValue: 333 }),
      posizione({ isin: 'C', currentValue: 334 }),
    ];
    const esito = calcolaComposizione(posizioni);
    const sommaPercentuali = esito.fette.reduce((s, f) => s + f.percentuale, 0);
    expect(sommaPercentuali).toBeCloseTo(100, 9);
  });

  it('le lunghezze d\'arco sommano all\'intera circonferenza', () => {
    const posizioni = [
      posizione({ isin: 'A', currentValue: 150 }),
      posizione({ isin: 'B', currentValue: 250 }),
      posizione({ isin: 'C', currentValue: 100 }),
    ];
    const esito = calcolaComposizione(posizioni);

    const lunghezzaArco = (dasharray: string) => Number(dasharray.split(' ')[0]);
    const sommaArchi = esito.fette.reduce((s, f) => s + lunghezzaArco(f.strokeDasharray), 0);
    expect(sommaArchi).toBeCloseTo(CIRCONFERENZA_CIAMBELLA, 9);

    // Ogni fetta comincia dove finisce la precedente: nessuna sovrapposizione.
    let atteso = 0;
    for (const fetta of esito.fette) {
      expect(fetta.strokeDashoffset).toBeCloseTo(-atteso, 9);
      atteso += lunghezzaArco(fetta.strokeDasharray);
    }
  });

  it('totale a zero (posizioni tutte a valore nullo ma prezzate): nessuna divisione per zero', () => {
    const posizioni = [posizione({ isin: 'A', currentValue: 0, totalQuantity: 0, currentPrice: 10 })];
    const esito = calcolaComposizione(posizioni);
    expect(esito.numeroIncluse).toBe(1);
    expect(esito.totale).toBe(0);
    expect(esito.fette[0].percentuale).toBe(0);
    expect(Number.isNaN(esito.fette[0].percentuale)).toBe(false);
  });
});
