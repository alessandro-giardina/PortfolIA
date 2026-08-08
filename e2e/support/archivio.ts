/**
 * Primitive di test sulla cache `securities` di `data/portfolia.db`.
 *
 * Perché SQLite diretto e non l'API: non esiste (e non deve esistere) un endpoint
 * per svuotare o seminare la cache dei prezzi. Aggiungerne uno significherebbe
 * scrivere codice di produzione al servizio dei test — esattamente ciò che US-029
 * vieta. Questo modulo vive solo dentro `e2e/` e non viene mai importato dal server.
 *
 * Convivenza con il server: il processo Fastify tiene lo stesso file aperto e il
 * journal è in modalità `delete`, non WAL. Quindi ogni operazione (a) imposta
 * `busy_timeout`, così una scrittura del server in corso ci fa *attendere* invece
 * di farci fallire con SQLITE_BUSY, e (b) chiude subito la connessione, per non
 * trattenere lock oltre il necessario.
 *
 * Le transazioni sono aperte con `.immediate()`, non con la modalità predefinita,
 * e la differenza non è cosmetica. Il `BEGIN` semplice è *deferred*: prende un
 * lock SHARED e lo promuove a RESERVED alla prima scrittura — e su quella
 * promozione SQLite scavalca di proposito il busy handler, per non rischiare un
 * deadlock fra due transazioni che tentano di promuovere insieme. Il risultato è
 * che `busy_timeout` verrebbe ignorato proprio qui, cioè nelle uniche operazioni
 * che leggono e poi scrivono, e un test fallirebbe a caso quando il server scrive
 * nello stesso istante. `BEGIN IMMEDIATE` prende subito il RESERVED, e lì il busy
 * handler viene rispettato: l'attesa torna a funzionare come promesso sopra.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as ConnessioneSQLite } from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Percorso dell'archivio SQLite usato dal server in sviluppo. */
export const PERCORSO_ARCHIVIO = join(__dirname, '..', '..', 'data', 'portfolia.db');

/** Millisecondi di attesa su un lock del server prima di arrendersi. */
const ATTESA_LOCK_MS = 5000;

/** Colonne della tabella `securities`, nell'ordine dello schema. */
const COLONNE = [
  'isin',
  'name',
  'price',
  'ticker',
  'instrument_type',
  'total_annual_fees',
  'currency',
  'issuer',
  'segment',
  'dividend_policy',
  'data_source',
  'fetched_at',
] as const;

/** Riga della cache `securities`. */
export interface RigaTitolo {
  isin: string;
  name: string | null;
  price: number | null;
  ticker: string | null;
  instrument_type: string | null;
  total_annual_fees: string | null;
  currency: string | null;
  issuer: string | null;
  segment: string | null;
  dividend_policy: string | null;
  /**
   * Fonte da cui l'anagrafica è stata rilevata: `'borsaitaliana'`,
   * `'morningstar'`, oppure `null` quando la provenienza non è registrata
   * (riga scritta prima che la colonna esistesse). Seminarla esplicitamente è
   * l'unico modo per mettere alla prova il timbro di provenienza di US-018.
   */
  data_source: string | null;
  fetched_at: number;
}

/** Campi seminabili: tutto tranne l'ISIN, che è la chiave. */
export type CampiTitolo = Partial<Omit<RigaTitolo, 'isin'>>;

/**
 * Ciò che un test ha trovato e ciò che ha lasciato su un ISIN. `undefined`
 * significa "non in cache": ripristinare quello stato vuol dire rimuovere la
 * riga, non riscriverla vuota.
 *
 * Serve registrare *entrambi* gli stati perché i file spec girano in parallelo su
 * worker diversi (`fullyParallel: false` serializza solo dentro un file). Due test
 * possono quindi seminare lo stesso ISIN a cavallo l'uno dell'altro, e un
 * ripristino incondizionato farebbe scrivere al secondo uno stato ormai superato,
 * lasciando in archivio proprio il residuo che il ripristino deve evitare.
 */
export interface IstantaneaTitolo {
  isin: string;
  /** Stato precedente all'intervento del test: è qui che si deve tornare. */
  precedente: RigaTitolo | undefined;
  /** Stato lasciato dal test: il ripristino avviene solo se è ancora quello. */
  lasciata: RigaTitolo | undefined;
}

/** Apre l'archivio, esegue `fn` e chiude sempre la connessione. */
function conArchivio<T>(fn: (db: ConnessioneSQLite) => T): T {
  let db: ConnessioneSQLite;
  try {
    db = new Database(PERCORSO_ARCHIVIO, { fileMustExist: true });
  } catch (causa) {
    throw new Error(
      `Archivio non trovato in ${PERCORSO_ARCHIVIO}. Avvia il server almeno una volta ` +
        `(npm run dev) perché le migrazioni lo creino.`,
      { cause: causa },
    );
  }
  try {
    db.pragma(`busy_timeout = ${ATTESA_LOCK_MS}`);
    return fn(db);
  } finally {
    db.close();
  }
}

/** Legge la riga di cache di un ISIN, oppure `undefined` se assente. */
export function leggiTitolo(isin: string): RigaTitolo | undefined {
  return conArchivio((db) => {
    const riga = db.prepare('SELECT * FROM securities WHERE isin = ?').get(isin);
    return riga as RigaTitolo | undefined;
  });
}

/** Due righe rappresentano lo stesso stato? (`undefined` = riga assente) */
function stessaRiga(a: RigaTitolo | undefined, b: RigaTitolo | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return COLONNE.every((colonna) => a[colonna] === b[colonna]);
}

/** Legge la riga di un ISIN su una connessione già aperta. */
function leggiSu(db: ConnessioneSQLite, isin: string): RigaTitolo | undefined {
  return db.prepare('SELECT * FROM securities WHERE isin = ?').get(isin) as RigaTitolo | undefined;
}

/** Riscrive una riga completa su una connessione già aperta (upsert su `isin`). */
function scriviSu(db: ConnessioneSQLite, riga: RigaTitolo): void {
  const segnaposto = COLONNE.map(() => '?').join(', ');
  const aggiornamenti = COLONNE.filter((c) => c !== 'isin')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  db.prepare(
    `INSERT INTO securities (${COLONNE.join(', ')}) VALUES (${segnaposto}) ` +
      `ON CONFLICT(isin) DO UPDATE SET ${aggiornamenti}`,
  ).run(COLONNE.map((c) => riga[c]));
}

/**
 * Semina un ISIN in cache e restituisce l'istantanea dell'operazione: cosa c'era
 * prima e cosa è stato lasciato. I campi omessi conservano il valore già presente;
 * su un ISIN nuovo diventano NULL.
 *
 * Lettura e scrittura stanno in **una sola transazione**: separate, due worker
 * potrebbero interfoliarle e leggere entrambi lo stato pre-esistente.
 */
export function seminaTitolo(isin: string, campi: CampiTitolo = {}): IstantaneaTitolo {
  return conArchivio((db) =>
    db.transaction((): IstantaneaTitolo => {
      const precedente = leggiSu(db, isin);
      const lasciata: RigaTitolo = {
        isin,
        name: null,
        price: null,
        ticker: null,
        instrument_type: null,
        total_annual_fees: null,
        currency: null,
        issuer: null,
        segment: null,
        dividend_policy: null,
        data_source: null,
        ...precedente,
        // `fetched_at` è riscritto *dopo* la riga esistente, non prima: seminare un
        // titolo equivale a un recupero appena avvenuto. Con un timestamp vecchio il
        // server classificherebbe la cache come scaduta e ricontatterebbe la fonte —
        // rete reale, browser headless, 8-12 secondi — riaprendo dalla finestra la
        // dipendenza dall'esterno che il seeding serve proprio a chiudere.
        fetched_at: Math.floor(Date.now() / 1000),
        ...campi,
      };
      scriviSu(db, lasciata);
      return { isin, precedente, lasciata };
    }).immediate(),
  );
}

/**
 * Rimuove un ISIN dalla cache, garantendo un cache miss allo scenario che segue,
 * e restituisce l'istantanea dell'operazione.
 */
export function rimuoviTitolo(isin: string): IstantaneaTitolo {
  return conArchivio((db) =>
    db.transaction((): IstantaneaTitolo => {
      const precedente = leggiSu(db, isin);
      db.prepare('DELETE FROM securities WHERE isin = ?').run(isin);
      return { isin, precedente, lasciata: undefined };
    }).immediate(),
  );
}

/**
 * Riporta gli ISIN allo stato precedente, così la suite non lascia effetti
 * collaterali sull'ambiente di sviluppo.
 *
 * Il ripristino è **condizionato**: avviene solo se la riga è ancora quella che
 * questo test aveva lasciato. Se nel frattempo l'ha toccata qualcun altro — un
 * altro worker, o il server — la sua versione è più recente della nostra e
 * sovrascriverla reintrodurrebbe uno stato defunto. In quel caso è più corretto
 * non fare nulla: sarà il test che ha scritto per ultimo a ripulire.
 *
 * Le istantanee sono applicate in ordine inverso, come uno stack di undo.
 */
export function ripristinaTitoli(istantanee: IstantaneaTitolo[]): void {
  for (const istantanea of [...istantanee].reverse()) {
    conArchivio((db) =>
      db.transaction(() => {
        if (!stessaRiga(leggiSu(db, istantanea.isin), istantanea.lasciata)) return;
        if (istantanea.precedente === undefined) {
          db.prepare('DELETE FROM securities WHERE isin = ?').run(istantanea.isin);
        } else {
          scriviSu(db, istantanea.precedente);
        }
      }).immediate(),
    );
  }
}
