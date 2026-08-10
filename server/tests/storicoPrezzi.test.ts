/**
 * US-009 — il giorno civile di Roma e la semantica di deduplica dello storico.
 *
 * Due assi di verifica. Il primo è il fuso: il giorno di una rilevazione è
 * quello *locale*, e sbagliarlo significherebbe fondere in una sola riga due
 * osservazioni di giorni diversi (o separarne due dello stesso giorno) proprio
 * intorno alla mezzanotte e ai passaggi di ora legale, dove nessuno guarda.
 *
 * Il secondo è la deduplica: i quattro casi che i criteri di accettazione
 * distinguono, provati contro un archivio SQLite vero e non contro un doppio —
 * la regola *è* il vincolo UNIQUE della tabella, e verificarla su un finto
 * significherebbe verificare la propria idea del vincolo invece del vincolo.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { asc } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { giornoCivileRoma } from '../src/domain/marketHours.js';
import { registraOsservazione } from '../src/domain/storicoPrezzi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

const ISIN = 'IE00B4L5Y983';

let testDbPath: string;
let conn: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  testDbPath = join(tmpdir(), `test-storico-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  conn = new Database(testDbPath);
  db = drizzle(conn, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
});

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

/** Le osservazioni in archivio per l'ISIN di prova, in ordine di registrazione. */
function osservazioni() {
  return db
    .select()
    .from(schema.priceObservations)
    .orderBy(asc(schema.priceObservations.id))
    .all();
}

describe('giornoCivileRoma', () => {
  it('a Roma le 23:30 UTC d’estate sono già il giorno dopo', () => {
    // 9 agosto 23:30 UTC = 10 agosto 01:30 a Roma (+02:00): il giorno civile è
    // il 10, non il 9. Prendere il giorno UTC farebbe cadere questa rilevazione
    // nel giorno precedente, fondendola con quelle del 9.
    expect(giornoCivileRoma(new Date('2026-08-09T23:30:00Z'))).toBe('2026-08-10');
  });

  it('d’inverno le 23:30 UTC sono ancora il giorno dopo, di un’ora sola', () => {
    // Inverno (+01:00): 00:30 del 10. Il confine resta oltrepassato, ma con un
    // margine di 30 minuti invece di 90 — è il caso che un offset fisso di due
    // ore sbaglierebbe.
    expect(giornoCivileRoma(new Date('2026-01-09T23:30:00Z'))).toBe('2026-01-10');
  });

  it('la mezzanotte locale apre il giorno nuovo, il minuto prima no', () => {
    expect(giornoCivileRoma(new Date('2026-08-10T00:00:00+02:00'))).toBe('2026-08-10');
    expect(giornoCivileRoma(new Date('2026-08-09T23:59:00+02:00'))).toBe('2026-08-09');
  });

  it('regge il passaggio all’ora legale (29 marzo 2026, 02:00 → 03:00)', () => {
    // Le 00:30 UTC del 29 marzo sono ancora l'01:30 locale (+01:00); le 02:30
    // UTC sono le 04:30 (+02:00). Stesso giorno civile, offset diversi.
    expect(giornoCivileRoma(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29');
    expect(giornoCivileRoma(new Date('2026-03-29T02:30:00Z'))).toBe('2026-03-29');
    // E il confine del giorno prima, con l'ora solare ancora in vigore: le
    // 22:30 UTC del 28 marzo sono le 23:30 locali, ancora il 28.
    expect(giornoCivileRoma(new Date('2026-03-28T22:30:00Z'))).toBe('2026-03-28');
  });

  it('regge il ritorno all’ora solare (25 ottobre 2026, 03:00 → 02:00)', () => {
    // L'ora 02:00–03:00 locale si presenta due volte: le 00:30 UTC sono le 02:30
    // di ora legale (+02:00), le 01:30 UTC sono le 02:30 di ora solare (+01:00).
    // Entrambe cadono nel 25 ottobre.
    expect(giornoCivileRoma(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25');
    expect(giornoCivileRoma(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25');
    // E le 23:30 UTC del 24 ottobre, con l'ora legale ancora in vigore, sono
    // l'01:30 del 25.
    expect(giornoCivileRoma(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
  });
});

describe('registraOsservazione', () => {
  it('stesso giorno e stesso prezzo → una riga sola', () => {
    registraOsservazione(db, ISIN, 128.46, new Date('2026-08-10T09:14:00+02:00'), 'borsaitaliana');
    registraOsservazione(db, ISIN, 128.46, new Date('2026-08-10T16:02:00+02:00'), 'borsaitaliana');

    const righe = osservazioni();
    expect(righe).toHaveLength(1);
    // Resta la *prima*: l'osservazione registrata è quella effettivamente
    // avvenuta per prima, non l'ultima che l'ha ripetuta.
    expect(righe[0].observed_at).toBe(Math.floor(new Date('2026-08-10T09:14:00+02:00').getTime() / 1000));
    expect(righe[0].observed_day).toBe('2026-08-10');
  });

  it('stesso giorno e prezzi diversi → due righe distinte', () => {
    registraOsservazione(db, ISIN, 125.88, new Date('2026-08-05T09:31:00+02:00'), 'morningstar');
    registraOsservazione(db, ISIN, 127.31, new Date('2026-08-05T16:02:00+02:00'), 'borsaitaliana');

    const righe = osservazioni();
    expect(righe).toHaveLength(2);
    expect(righe.map((r) => r.price)).toEqual([125.88, 127.31]);
    expect(righe.map((r) => r.data_source)).toEqual(['morningstar', 'borsaitaliana']);
  });

  it('giorni diversi e prezzo invariato → due righe', () => {
    registraOsservazione(db, ISIN, 128.46, new Date('2026-08-07T17:41:00+02:00'), 'borsaitaliana');
    registraOsservazione(db, ISIN, 128.46, new Date('2026-08-10T09:14:00+02:00'), 'borsaitaliana');

    const righe = osservazioni();
    expect(righe).toHaveLength(2);
    expect(righe.map((r) => r.observed_day)).toEqual(['2026-08-07', '2026-08-10']);
  });

  it('la mezzanotte locale separa due rilevazioni a prezzo invariato', () => {
    // Il caso in cui il giorno UTC e quello di Roma divergono: senza il giorno
    // civile locale queste due finirebbero nella stessa riga.
    registraOsservazione(db, ISIN, 128.46, new Date('2026-08-09T23:50:00+02:00'), 'borsaitaliana');
    registraOsservazione(db, ISIN, 128.46, new Date('2026-08-10T00:10:00+02:00'), 'borsaitaliana');

    expect(osservazioni().map((r) => r.observed_day)).toEqual(['2026-08-09', '2026-08-10']);
  });

  it('prezzo nullo → nessuna riga', () => {
    registraOsservazione(db, ISIN, null, new Date('2026-08-10T09:14:00+02:00'), 'borsaitaliana');
    expect(osservazioni()).toHaveLength(0);
  });

  it('fonte non registrata → riga scritta con data_source a null, mai «borsaitaliana»', () => {
    registraOsservazione(db, ISIN, 122.4, new Date('2026-07-21T11:07:00+02:00'), null);

    const righe = osservazioni();
    expect(righe).toHaveLength(1);
    expect(righe[0].data_source).toBeNull();
  });

  it('due ISIN diversi non si deduplicano fra loro', () => {
    const altro = 'IE00B5BMR087';
    registraOsservazione(db, ISIN, 100, new Date('2026-08-10T09:14:00+02:00'), 'borsaitaliana');
    registraOsservazione(db, altro, 100, new Date('2026-08-10T09:14:00+02:00'), 'borsaitaliana');

    expect(osservazioni().map((r) => r.isin)).toEqual([ISIN, altro]);
  });
});
