import { describe, it, expect } from 'vitest';
import { isMarketOpen, hasSessionInInterval, classifyRefetch } from '../src/domain/marketHours.js';

// Helper: costruisce un istante a partire dall'orario civile di Roma esplicito.
// Estate (DST) = +02:00, inverno = +01:00.
const rome = (iso: string): Date => new Date(iso);

describe('isMarketOpen', () => {
  it('feriale dentro la finestra → aperto (estate, +02:00)', () => {
    expect(isMarketOpen(rome('2026-06-30T10:00:00+02:00'))).toBe(true); // martedì 10:00
  });

  it('feriale dentro la finestra → aperto (inverno, +01:00)', () => {
    expect(isMarketOpen(rome('2026-01-13T10:00:00+01:00'))).toBe(true); // martedì 10:00
  });

  it('confine di apertura 9:00 → aperto', () => {
    expect(isMarketOpen(rome('2026-06-30T09:00:00+02:00'))).toBe(true);
  });

  it('subito prima dell’apertura 8:59 → chiuso', () => {
    expect(isMarketOpen(rome('2026-06-30T08:59:00+02:00'))).toBe(false);
  });

  it('confine di chiusura 17:30 → chiuso', () => {
    expect(isMarketOpen(rome('2026-06-30T17:30:00+02:00'))).toBe(false);
  });

  it('subito prima della chiusura 17:29 → aperto', () => {
    expect(isMarketOpen(rome('2026-06-30T17:29:00+02:00'))).toBe(true);
  });

  it('sabato → chiuso anche in orario di mercato', () => {
    expect(isMarketOpen(rome('2026-07-04T10:00:00+02:00'))).toBe(false);
  });

  it('domenica → chiuso', () => {
    expect(isMarketOpen(rome('2026-07-05T10:00:00+02:00'))).toBe(false);
  });
});

describe('hasSessionInInterval', () => {
  it('intervallo dentro la stessa sessione → true', () => {
    expect(
      hasSessionInInterval(rome('2026-06-30T10:00:00+02:00'), rome('2026-06-30T11:00:00+02:00'))
    ).toBe(true);
  });

  it('lun 19:00 → mar 03:00 (nessuna sessione nel mezzo) → false', () => {
    expect(
      hasSessionInInterval(rome('2026-06-29T19:00:00+02:00'), rome('2026-06-30T03:00:00+02:00'))
    ).toBe(false);
  });

  it('ven 18:00 → dom 14:00 (weekend, nessuna sessione) → false', () => {
    expect(
      hasSessionInInterval(rome('2026-07-03T18:00:00+02:00'), rome('2026-07-05T14:00:00+02:00'))
    ).toBe(false);
  });

  it('mar 10:00 → mer 10:00 (sessioni attraversate) → true', () => {
    expect(
      hasSessionInInterval(rome('2026-06-30T10:00:00+02:00'), rome('2026-07-01T10:00:00+02:00'))
    ).toBe(true);
  });

  it('now precedente a fetchedAt → false', () => {
    expect(
      hasSessionInInterval(rome('2026-06-30T11:00:00+02:00'), rome('2026-06-30T10:00:00+02:00'))
    ).toBe(false);
  });
});

describe('classifyRefetch', () => {
  it('ripetizione nella stessa sessione → intra-session con orario nel messaggio', () => {
    const res = classifyRefetch(
      rome('2026-06-30T09:30:00+02:00'),
      rome('2026-06-30T11:00:00+02:00')
    );
    expect(res.kind).toBe('intra-session');
    expect(res.message).toContain('oggi alle 09:30');
    expect(res.message).toContain('procedere comunque');
  });

  it('nessuna sessione nel mezzo (lun sera → mar notte) → no-session con data nel messaggio', () => {
    const res = classifyRefetch(
      rome('2026-06-29T19:00:00+02:00'),
      rome('2026-06-30T03:00:00+02:00')
    );
    expect(res.kind).toBe('no-session');
    expect(res.message).toContain('29/06/2026');
    expect(res.message).toContain('Non possono esserci modifiche di prezzo');
  });

  it('weekend (ven sera → dom pomeriggio) → no-session', () => {
    const res = classifyRefetch(
      rome('2026-07-03T18:00:00+02:00'),
      rome('2026-07-05T14:00:00+02:00')
    );
    expect(res.kind).toBe('no-session');
  });

  it('sessione trascorsa (mar → mer) → none, nessuna conferma', () => {
    const res = classifyRefetch(
      rome('2026-06-30T10:00:00+02:00'),
      rome('2026-07-01T10:00:00+02:00')
    );
    expect(res.kind).toBe('none');
    expect(res.message).toBeNull();
  });

  it('recupero dopo la chiusura della stessa giornata → none (sessione conclusa)', () => {
    const res = classifyRefetch(
      rome('2026-06-30T10:00:00+02:00'),
      rome('2026-06-30T18:00:00+02:00')
    );
    expect(res.kind).toBe('none');
  });

  it('DST inverno: ripetizione intra-sessione gestita con +01:00', () => {
    const res = classifyRefetch(
      rome('2026-01-13T09:30:00+01:00'),
      rome('2026-01-13T11:00:00+01:00')
    );
    expect(res.kind).toBe('intra-session');
    expect(res.message).toContain('09:30');
  });
});
