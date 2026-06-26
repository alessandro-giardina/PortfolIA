import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { portfolios } from '../src/db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');
const TEST_DB = join(tmpdir(), 'test-portfolia.db');

afterAll(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe('persistenza SQLite', () => {
  it('scrive un record e lo trova dopo riapertura della connessione', () => {
    const conn1 = new Database(TEST_DB);
    try {
      const db1 = drizzle(conn1, { schema: { portfolios } });
      migrate(db1, { migrationsFolder: MIGRATIONS_DIR });
      db1.insert(portfolios).values({ name: 'Test' }).run();
    } finally {
      conn1.close();
    }

    const conn2 = new Database(TEST_DB);
    try {
      const db2 = drizzle(conn2, { schema: { portfolios } });
      const rows = db2.select().from(portfolios).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Test');
    } finally {
      conn2.close();
    }
  });
});
