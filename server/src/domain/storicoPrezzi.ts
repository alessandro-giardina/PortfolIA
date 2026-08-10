/**
 * Storico dei prezzi osservati (FR-018, ADR-008).
 *
 * Registra le rilevazioni che i percorsi *già esistenti* producono — ricerca
 * titolo, scheda titolo, aggiornamento massivo dei titoli obsoleti — e non
 * contatta mai la fonte per conto proprio. È la ragione per cui questo modulo
 * espone una sola scrittura e nessuna lettura remota: lo storico è un effetto
 * degli aggiornamenti dell'utente, non una funzionalità che ne provoca di nuovi.
 */
import { isNotNull } from 'drizzle-orm';
import type { db as defaultDb } from '../db/index.js';
import { priceObservations, securities } from '../db/schema.js';
import { normalizzaDataSource, type DataSource } from '@portfolia/shared';
import { giornoCivileRoma } from './marketHours.js';

type Db = typeof defaultDb;

/**
 * Registra una rilevazione di prezzo nello storico locale.
 *
 * Due regole, entrambe conseguenze dirette dei criteri di accettazione:
 *
 * 1. **Un prezzo assente non è un'osservazione.** Con `price` a `null` la
 *    funzione non scrive nulla: registrare la riga con uno zero, o con un
 *    segnaposto, produrrebbe nello storico una quotazione che non è mai stata
 *    rilevata (ADR-003).
 * 2. **La deduplica sta nell'indice, non qui.** Il vincolo UNIQUE su
 *    (isin, observed_day, price) *è* la regola «stesso giorno, stesso prezzo →
 *    una sola riga», e `onConflictDoNothing()` la applica in una singola
 *    istruzione atomica. Un controllo letto-poi-scritto in TypeScript
 *    lascerebbe aperta la finestra fra la SELECT e la INSERT, e l'aggiornamento
 *    massivo di US-035 scrive più ISIN in rapida successione — proprio la
 *    condizione in cui quella finestra si manifesta.
 *
 * Il giorno di confronto è quello civile di Roma: due rilevazioni a cavallo
 * della mezzanotte locale appartengono a giorni distinti e restano entrambe,
 * anche a prezzo invariato.
 */
export function registraOsservazione(
  db: Db,
  isin: string,
  price: number | null,
  observedAt: Date,
  dataSource: DataSource | null,
): void {
  if (price === null) return;

  db.insert(priceObservations)
    .values({
      isin,
      price,
      observed_at: Math.floor(observedAt.getTime() / 1000),
      observed_day: giornoCivileRoma(observedAt),
      data_source: dataSource,
    })
    .onConflictDoNothing({
      target: [priceObservations.isin, priceObservations.observed_day, priceObservations.price],
    })
    .run();
}

/**
 * Popola lo storico con il prezzo che l'archivio già conosce, una volta sola per
 * ogni titolo in cache (criterio: «i titoli già presenti in archivio compaiono
 * nello storico con il prezzo attualmente in cache come prima osservazione»).
 *
 * Sta in TypeScript e non in SQL per una ragione precisa: `observed_day` deve
 * venire dalla stessa implementazione DST-aware che usa il percorso di runtime.
 * Un `strftime('%Y-%m-%d', fetched_at, 'unixepoch')` produrrebbe il giorno UTC,
 * e le righe rilevate fra mezzanotte e le 2 di notte locali finirebbero nel
 * giorno precedente — una deduplica che si comporta diversamente a seconda di
 * come la riga è nata.
 *
 * È idempotente per costruzione, senza bisogno di una tabella di stato: la
 * stessa terna (isin, giorno, prezzo) è già respinta dal vincolo UNIQUE, quindi
 * una seconda esecuzione non aggiunge nulla. Viene invocato a ogni avvio dopo le
 * migrazioni, e su un archivio già popolato costa una INSERT respinta per
 * titolo.
 */
export function backfillStoricoPrezzi(db: Db): void {
  const righe = db
    .select({
      isin: securities.isin,
      price: securities.price,
      fetched_at: securities.fetched_at,
      data_source: securities.data_source,
    })
    .from(securities)
    .where(isNotNull(securities.price))
    .all();

  for (const riga of righe) {
    registraOsservazione(
      db,
      riga.isin,
      riga.price,
      new Date(riga.fetched_at * 1000),
      // La fonte è ripresa dalla riga di cache, normalizzata: un valore assente
      // o non riconosciuto resta "non registrata" e non diventa Borsa Italiana.
      normalizzaDataSource(riga.data_source),
    );
  }
}
