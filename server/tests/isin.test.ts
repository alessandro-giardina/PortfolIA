import { describe, it, expect } from 'vitest';
import { isValidIsin, normalizeIsin } from '@portfolia/shared';

describe('isValidIsin', () => {
  it('accetta ISIN reali con cifra di controllo corretta', () => {
    expect(isValidIsin('IE00BMVB5S82')).toBe(true); // iShares Core MSCI World
    expect(isValidIsin('IT0003128367')).toBe(true); // ENEL
    expect(isValidIsin('IE00BMVB5R75')).toBe(true); // iShares MSCI EM IMI
    expect(isValidIsin('US0378331005')).toBe(true); // Apple
  });

  it('normalizza minuscolo/spazi prima di validare', () => {
    expect(isValidIsin('  ie00bmvb5s82  ')).toBe(true);
  });

  it('rifiuta lunghezza errata', () => {
    expect(isValidIsin('IT00031283')).toBe(false); // troppo corto
    expect(isValidIsin('IT00031283671')).toBe(false); // troppo lungo
  });

  it('rifiuta formato non valido (prefisso non alfabetico, ultimo carattere non cifra)', () => {
    expect(isValidIsin('1T0003128367')).toBe(false);
    expect(isValidIsin('IT000312836X')).toBe(false);
  });

  it('rifiuta cifra di controllo errata', () => {
    expect(isValidIsin('IT9999999999')).toBe(false);
    expect(isValidIsin('IT0003128368')).toBe(false); // ENEL con check digit sbagliato
  });

  it('rifiuta input vuoto', () => {
    expect(isValidIsin('')).toBe(false);
  });
});

describe('normalizeIsin', () => {
  it('trim + maiuscolo', () => {
    expect(normalizeIsin('  ie00bmvb5s82 ')).toBe('IE00BMVB5S82');
  });
});
