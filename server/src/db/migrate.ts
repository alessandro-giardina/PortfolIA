import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index.js';
import { backfillStoricoPrezzi } from '../domain/storicoPrezzi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
  // Lo storico dei prezzi osservati parte da ciò che l'archivio già conosce
  // (US-009): ogni titolo in cache con un prezzo entra come prima osservazione,
  // così una scheda aperta subito dopo l'aggiornamento non mostra una tabella
  // vuota là dove un prezzo è invece stato rilevato. È idempotente — il vincolo
  // UNIQUE respinge la ripetizione — quindi vive qui, accanto alle migrazioni,
  // e non in un comando da ricordarsi di lanciare una volta.
  backfillStoricoPrezzi(db);
}
