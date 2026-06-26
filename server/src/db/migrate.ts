import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
}
