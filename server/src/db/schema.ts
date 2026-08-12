import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
  /**
   * Fonte da cui l'anagrafica è stata rilevata: 'borsaitaliana' o 'morningstar'.
   * NULL sulle righe scritte prima che la colonna esistesse: significa "fonte
   * non registrata" e non va mai reinterpretata come Borsa Italiana (FR-021).
   */
  data_source: text('data_source'),
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

/**
 * Vendite (scarichi titolo) all'interno di un portafoglio (FR-022, FR-023,
 * ADR-009).
 *
 * È la **seconda specie di iscrizione** dello stesso registro, non una
 * correzione dei carichi: una vendita si registra aggiungendo una riga qui, e
 * nessuna riga di `positions` viene mai modificata o cancellata per effetto di
 * una vendita. Da qui discende la forma della tabella, gemella di `positions`
 * fin nella cascade su `portfolios.id` — di cui la teardown della fixture
 * `archivio` degli E2E ha bisogno per non lasciare scarichi orfani.
 *
 * **Nessun campo calcolato è persistito.** Non il P&L realizzato, non la
 * quantità residua dei lotti, non il costo attribuito: ADR-009 li vuole
 * *derivati* rigiocando il registro, perché un valore memorizzato accanto ai
 * fatti che lo generano può divergere da essi — basta un carico corretto a
 * posteriori — e nulla nel modello segnalerebbe la divergenza. La sola verità
 * conservata è l'operazione: quando, a che prezzo, quante quote.
 *
 * `sale_date` è in formato TEXT ISO-8601 (YYYY-MM-DD) come `positions.load_date`:
 * l'attribuzione LIFO confronta le due date fra loro, e devono essere
 * ordinabili con lo stesso confronto lessicografico.
 */
export const sales = sqliteTable('sales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolio_id: integer('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  isin: text('isin').notNull(),
  sale_date: text('sale_date').notNull(),
  sale_price: real('sale_price').notNull(),
  quantity: integer('quantity').notNull(),
  created_at: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SaleRow = typeof sales.$inferSelect;

/**
 * Storico dei prezzi *osservati* (FR-018, ADR-008).
 *
 * Non è una serie storica recuperata dalla fonte: ogni riga è una rilevazione
 * che un aggiornamento già esistente ha prodotto — ricerca titolo, scheda
 * titolo, aggiornamento massivo dei titoli obsoleti. Nessuna richiesta in più
 * alla fonte nasce da questa tabella, ed è ciò che rende la buona cittadinanza
 * vera per costruzione al prezzo di una copertura rada.
 *
 * `price` è NOT NULL: una rilevazione senza prezzo non è un'osservazione e non
 * va registrata. `observed_day` è il giorno civile di Roma (YYYY-MM-DD) del
 * rilevamento, denormalizzato perché è la chiave della deduplica: SQLite non sa
 * convertire un unix timestamp in un giorno DST-aware, quindi il giorno viene
 * calcolato in TypeScript e scritto qui. `data_source` è nullable con la stessa
 * semantica di `securities.data_source`: NULL è "fonte non registrata", mai
 * Borsa Italiana per default (FR-021).
 *
 * L'indice UNIQUE su (isin, observed_day, price) *è* la regola di deduplica:
 * due rilevazioni dello stesso giorno allo stesso prezzo sono la stessa
 * osservazione, mentre prezzi diversi nello stesso giorno restano entrambi.
 */
export const priceObservations = sqliteTable(
  'price_observations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    isin: text('isin').notNull(),
    price: real('price').notNull(),
    observed_at: integer('observed_at')
      .notNull()
      .default(sql`(unixepoch())`),
    /** Giorno civile di Roma del rilevamento, formato TEXT YYYY-MM-DD. */
    observed_day: text('observed_day').notNull(),
    data_source: text('data_source'),
  },
  (table) => ({
    osservazioneUnica: uniqueIndex('price_observations_isin_day_price_unique').on(
      table.isin,
      table.observed_day,
      table.price,
    ),
    perLettura: index('price_observations_isin_observed_at_idx').on(table.isin, table.observed_at),
  }),
);

export type PriceObservationRow = typeof priceObservations.$inferSelect;
