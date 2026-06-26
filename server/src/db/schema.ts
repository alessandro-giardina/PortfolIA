import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const portfolios = sqliteTable('portfolios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  created_at: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Portfolio = typeof portfolios.$inferSelect;
