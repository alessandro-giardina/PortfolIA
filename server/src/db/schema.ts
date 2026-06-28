import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const portfolios = sqliteTable('portfolios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  created_at: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Portfolio = typeof portfolios.$inferSelect;

/**
 * Cache locale dell'anagrafica titoli recuperata da Borsa Italiana.
 * L'ISIN è la chiave primaria; i campi anagrafici sono nullable (dato non
 * disponibile alla fonte). `fetched_at` (unix, secondi) è l'istante dell'ultimo
 * recupero ed è usato dalla guardia di buona cittadinanza per decidere se
 * ripetere lo scraping.
 */
export const securities = sqliteTable('securities', {
  isin: text('isin').primaryKey(),
  name: text('name'),
  price: real('price'),
  ticker: text('ticker'),
  instrument_type: text('instrument_type'),
  total_annual_fees: text('total_annual_fees'),
  currency: text('currency'),
  issuer: text('issuer'),
  segment: text('segment'),
  dividend_policy: text('dividend_policy'),
  fetched_at: integer('fetched_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SecurityRow = typeof securities.$inferSelect;

/**
 * Posizioni (carichi titolo) all'interno di un portafoglio.
 * `load_date` è in formato TEXT ISO-8601 (YYYY-MM-DD).
 * FK su portfolios.id con ON DELETE CASCADE.
 */
export const positions = sqliteTable('positions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolio_id: integer('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  isin: text('isin').notNull(),
  load_date: text('load_date').notNull(),
  load_price: real('load_price').notNull(),
  quantity: integer('quantity').notNull(),
  created_at: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export type PositionRow = typeof positions.$inferSelect;
