import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as BetterSQLite3Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const conn: BetterSQLite3Database = new Database(join(dataDir, 'portfolia.db'));

export const db = drizzle(conn, { schema });
