import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { portfolios } from '../src/db/schema.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

function createTestDb(dbPath: string) {
  const conn = new Database(dbPath);
  const db = drizzle(conn, { schema: { portfolios } });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { conn, db };
}

const TEST_DB = join(tmpdir(), `test-portfolios-${Date.now()}.db`);

afterEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe('portfolios repository', () => {
  it('inserimento corretto restituisce un record con id', () => {
    const { conn, db } = createTestDb(TEST_DB);
    try {
      const result = db.insert(portfolios).values({ name: 'Test Portfolio' }).returning().get();
      expect(result.id).toBeGreaterThan(0);
      expect(result.name).toBe('Test Portfolio');
    } finally {
      conn.close();
    }
  });

  it('nome duplicato lancia errore SQLite UNIQUE', () => {
    const { conn, db } = createTestDb(TEST_DB);
    try {
      db.insert(portfolios).values({ name: 'Duplicato' }).run();
      expect(() => db.insert(portfolios).values({ name: 'Duplicato' }).run()).toThrow();
    } finally {
      conn.close();
    }
  });

  it('la riga persiste dopo riapertura della connessione', () => {
    const { conn: conn1, db: db1 } = createTestDb(TEST_DB);
    try {
      db1.insert(portfolios).values({ name: 'Persistente' }).run();
    } finally {
      conn1.close();
    }

    const conn2 = new Database(TEST_DB);
    try {
      const db2 = drizzle(conn2, { schema: { portfolios } });
      const rows = db2.select().from(portfolios).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Persistente');
    } finally {
      conn2.close();
    }
  });

  it('la lista è vuota su un DB appena inizializzato', () => {
    const { conn, db } = createTestDb(TEST_DB);
    try {
      const rows = db.select().from(portfolios).all();
      expect(rows).toHaveLength(0);
    } finally {
      conn.close();
    }
  });
});
