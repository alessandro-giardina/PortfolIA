/**
 * US-009 — il backfill dello storico dai titoli già in archivio.
 *
 * Copre il criterio «i titoli già presenti in archivio compaiono nello storico
 * con il prezzo attualmente in cache come prima osservazione» e la proprietà da
 * cui dipende il fatto che possa girare a ogni avvio: l'idempotenza.
 *
 * L'ultimo caso è quello che ha motivato la scelta di scriverlo in TypeScript
 * anziché in SQL — una riga rilevata poco dopo la mezzanotte di Roma deve portare
 * il giorno *locale*, che `strftime(..., 'unixepoch')` non saprebbe calcolare.
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
import { backfillStoricoPrezzi } from '../src/domain/storicoPrezzi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

let testDbPath: string;
let conn: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  testDbPath = join(tmpdir(), `test-backfill-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  conn = new Database(testDbPath);
  db = drizzle(conn, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
});

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

/** Scrive una riga di cache come la lascerebbe un recupero già avvenuto. */
function seminaTitolo(
  isin: string,
  price: number | null,
  fetchedAt: number,
  dataSource: string | null,
): void {
  db.insert(schema.securities)
    .values({ isin, name: `Titolo ${isin}`, price, data_source: dataSource, fetched_at: fetchedAt })
    .run();
}

function osservazioni() {
  return db
    .select()
    .from(schema.priceObservations)
    .orderBy(asc(schema.priceObservations.isin), asc(schema.priceObservations.id))
    .all();
}

const ADESSO = Math.floor(new Date('2026-08-10T09:14:00+02:00').getTime() / 1000);

describe('backfillStoricoPrezzi', () => {
  it('una osservazione per ogni titolo con prezzo, con istante e fonte della riga di cache', () => {
    seminaTitolo('IE00B4L5Y983', 128.46, ADESSO, 'borsaitaliana');
    seminaTitolo('IE00B5BMR087', 552.18, ADESSO - 86_400, 'morningstar');

    backfillStoricoPrezzi(db);

    const righe = osservazioni();
    expect(righe).toHaveLength(2);
    expect(righe[0]).toMatchObject({
      isin: 'IE00B4L5Y983',
      price: 128.46,
      observed_at: ADESSO,
      observed_day: '2026-08-10',
      data_source: 'borsaitaliana',
    });
    expect(righe[1]).toMatchObject({
      isin: 'IE00B5BMR087',
      price: 552.18,
      observed_at: ADESSO - 86_400,
      observed_day: '2026-08-09',
      data_source: 'morningstar',
    });
  });

  it('nessuna osservazione per i titoli senza prezzo', () => {
    seminaTitolo('LU1650487413', null, ADESSO, 'borsaitaliana');

    backfillStoricoPrezzi(db);

    expect(osservazioni()).toHaveLength(0);
  });

  it('fonte non registrata in cache → osservazione con data_source a null', () => {
    seminaTitolo('LU0908500753', 61.4, ADESSO, null);

    backfillStoricoPrezzi(db);

    const righe = osservazioni();
    expect(righe).toHaveLength(1);
    expect(righe[0].data_source).toBeNull();
  });

  it('fonte non riconosciuta in cache → null, non «borsaitaliana»', () => {
    seminaTitolo('LU0908500753', 61.4, ADESSO, 'fonte-inventata');

    backfillStoricoPrezzi(db);

    expect(osservazioni()[0].data_source).toBeNull();
  });

  it('una seconda esecuzione non aggiunge alcuna riga', () => {
    seminaTitolo('IE00B4L5Y983', 128.46, ADESSO, 'borsaitaliana');
    seminaTitolo('IE00B5BMR087', 552.18, ADESSO, 'morningstar');

    backfillStoricoPrezzi(db);
    const primaPassata = osservazioni();

    backfillStoricoPrezzi(db);

    // Non solo il conteggio: anche gli id devono essere gli stessi, perché una
    // riga sostituita — cancellata e reinserita — sarebbe indistinguibile in un
    // confronto di sola lunghezza, e cambierebbe l'ordine mostrato in scheda.
    expect(osservazioni()).toEqual(primaPassata);
  });

  it('non tocca le osservazioni già registrate dal percorso di runtime', () => {
    seminaTitolo('IE00B4L5Y983', 128.46, ADESSO, 'borsaitaliana');
    // Una rilevazione di un altro giorno, come l'avrebbe scritta un aggiornamento
    // precedente: il backfill aggiunge la sua senza rimuovere questa.
    db.insert(schema.priceObservations)
      .values({
        isin: 'IE00B4L5Y983',
        price: 126.9,
        observed_at: ADESSO - 3 * 86_400,
        observed_day: '2026-08-07',
        data_source: 'borsaitaliana',
      })
      .run();

    backfillStoricoPrezzi(db);

    const righe = osservazioni();
    expect(righe).toHaveLength(2);
    expect(righe.map((r) => r.price)).toEqual([126.9, 128.46]);
  });

  it('un titolo rilevato dopo la mezzanotte di Roma porta il giorno locale, non quello UTC', () => {
    // 23:30 UTC del 9 agosto = 01:30 del 10 a Roma. Il giorno dell'osservazione è
    // il 10: con `strftime` su unixepoch sarebbe stato il 9, e la stessa riga
    // dedotta dal percorso di runtime avrebbe un giorno diverso.
    const istante = Math.floor(new Date('2026-08-09T23:30:00Z').getTime() / 1000);
    seminaTitolo('IE00B4L5Y983', 128.46, istante, 'borsaitaliana');

    backfillStoricoPrezzi(db);

    expect(osservazioni()[0].observed_day).toBe('2026-08-10');
  });

  it('su un archivio senza titoli non scrive nulla', () => {
    backfillStoricoPrezzi(db);
    expect(osservazioni()).toHaveLength(0);
  });
});
