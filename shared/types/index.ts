/**
 * Il dominio della serie di prezzo del titolo (US-036) vive in `shared/domain/`
 * ma si affaccia da qui: `@portfolia/shared` ha questo file come unico entry
 * point, quindi client e server lo importano dallo stesso nome di tutti gli
 * altri tipi condivisi.
 */
export * from '../domain/serieTitolo.js';
/**
 * Le due metriche della scheda titolo (US-038) — P&L da carico e variazione di
 * periodo — si affacciano da qui per la stessa ragione della serie: il server le
 * usa per calcolare la «Differenza», il client per mostrarla accanto al grafico,
 * e devono importarle dallo stesso nome.
 */
export * from '../domain/metricheTitolo.js';
/**
 * La serie del **valore della posizione** (US-039) si affaccia da qui per la
 * stessa ragione delle due precedenti: è la rimisura degli stessi punti, e chi
 * commuta la vista deve leggerne i tipi e le costanti dallo stesso nome invece di
 * riscriverli.
 */
export * from '../domain/serieValore.js';

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface Portfolio {
  id: number;
  name: string;
  created_at: number;
}

export interface CreatePortfolioRequest {
  name: string;
}

export interface UpdatePortfolioRequest {
  name: string;
}

/**
 * Anagrafica di un titolo recuperata da Borsa Italiana.
 * Tutti i campi anagrafici sono nullable: quando la fonte non fornisce un
 * campo viene dichiarato `null` ("dato non disponibile"), mai stimato o inventato.
 */
export interface SecurityInfo {
  /** Codice ISIN normalizzato (12 caratteri, maiuscolo). */
  isin: string;
  /** Denominazione ufficiale dello strumento. */
  name: string | null;
  /** Prezzo attuale rilevato alla fonte (valuta in `currency`). */
  price: number | null;
  /** Ticker / sigla di negoziazione. */
  ticker: string | null;
  /** Tipo di strumento (es. "ETF azionario", "Azione", "Obbligazione"). */
  instrumentType: string | null;
  /** Commissioni totali annue / TER, es. "0,20% (TER)". */
  totalAnnualFees: string | null;
  /** Valuta di denominazione (es. "EUR"). */
  currency: string | null;
  /** Emittente dello strumento. */
  issuer: string | null;
  /** Segmento di mercato (es. "ETFplus"). */
  segment: string | null;
  /** Politica di distribuzione dei dividendi (es. "ad accumulazione"). */
  dividendPolicy: string | null;
}

/**
 * Fonte da cui proviene l'anagrafica di un titolo (FR-021).
 * - `'borsaitaliana'`: fonte primaria.
 * - `'morningstar'`: fonte di backup, attivata quando Borsa Italiana non trova
 *   il titolo o è irraggiungibile.
 *
 * Dove compare come `DataSource | null`, `null` significa **fonte non
 * registrata**: la riga in archivio precede la persistenza della provenienza.
 * Non va mai reinterpretata come `'borsaitaliana'`.
 */
export type DataSource = 'borsaitaliana' | 'morningstar';

/**
 * Normalizza in `DataSource` un valore letto dall'archivio, dove la colonna è un
 * TEXT libero: `null` per un valore assente o non riconosciuto.
 *
 * Vive qui, accanto al tipo, perché la lettura di quella colonna avviene in più
 * punti — l'anagrafica, il dettaglio del titolo, lo storico dei prezzi — e la
 * regola «assenza ≠ Borsa Italiana» (FR-021) deve avere una sola
 * implementazione: aggiungere un giorno una terza fonte con tre copie del
 * controllo in giro significa dimenticarne una.
 */
export function normalizzaDataSource(value: string | null | undefined): DataSource | null {
  return value === 'borsaitaliana' || value === 'morningstar' ? value : null;
}

/**
 * Conferma richiesta dalla guardia di buona cittadinanza prima di ripetere
 * lo scraping di un ISIN già in cache.
 * - `intra-session`: ricerca già effettuata nella sessione di mercato corrente
 *   (il prezzo potrebbe essere cambiato, ma si invita a non ripetere).
 * - `no-session`: nessuna sessione di mercato tra l'ultimo recupero e ora
 *   (il prezzo non può essere cambiato).
 */
export interface RefetchConfirmation {
  kind: 'intra-session' | 'no-session';
  /** Timestamp (unix, secondi) dell'ultimo recupero dalla fonte. */
  lastFetchedAt: number;
  /** Messaggio da mostrare all'utente. */
  message: string;
}

/**
 * Risposta dell'endpoint di lookup anagrafica titolo.
 * Quando `confirmation` è presente i dati provengono dalla cache e la fonte
 * NON è stata interrogata: il client deve chiedere conferma all'utente e, in
 * caso affermativo, ripetere la chiamata con `?force=true`.
 */
export interface SecurityLookupResponse {
  security: SecurityInfo;
  /** `true` se i dati provengono dalla cache locale e non da un fetch fresco. */
  fromCache: boolean;
  /** Timestamp (unix, secondi) dell'ultimo recupero dalla fonte, se noto. */
  lastFetchedAt: number | null;
  /** Presente solo quando la guardia richiede conferma esplicita. */
  confirmation?: RefetchConfirmation;
  /**
   * Fonte da cui provengono i dati del titolo.
   * - `'borsaitaliana'`: fonte primaria (default).
   * - `'morningstar'`: fonte di backup, attivata quando Borsa Italiana non
   *   trova il titolo o è irraggiungibile.
   * Assente nelle risposte dalla cache (fromCache=true) che non hanno
   * ancora questo campo: il client tratta l'assenza come `'borsaitaliana'`.
   */
  dataSource?: DataSource;
}

/**
 * Valida il formato di un codice ISIN: 12 caratteri (2 lettere paese + 9
 * alfanumerici + 1 cifra di controllo) e verifica della cifra di controllo
 * (algoritmo di Luhn sull'espansione lettere→numeri).
 *
 * Riutilizzabile da backend e client: il client la usa per il feedback inline,
 * il backend come guardia autoritativa prima di interrogare la fonte.
 */
export function isValidIsin(value: string): boolean {
  if (typeof value !== 'string') return false;
  const isin = value.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;

  // Espansione lettere→numeri (A=10 … Z=35), poi Luhn sulle cifre risultanti.
  let digits = '';
  for (const ch of isin.slice(0, 11)) {
    digits += parseInt(ch, 36).toString();
  }

  let sum = 0;
  let double = true; // si parte dalla cifra meno significativa dell'espansione
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // '0' = 48
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === isin.charCodeAt(11) - 48;
}

/** Normalizza un ISIN (trim + maiuscolo) senza validarlo. */
export function normalizeIsin(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Posizione (carico titolo) all'interno di un portafoglio.
 * `loadDate` è in formato ISO-8601 (YYYY-MM-DD).
 */
export interface Position {
  id: number;
  portfolioId: number;
  isin: string;
  loadDate: string;
  loadPrice: number;
  quantity: number;
  createdAt: number;
}

/** Payload per creare una nuova posizione tramite POST /api/portfolios/:id/positions. */
export interface CreatePositionRequest {
  isin: string;
  load_date: string;
  load_price: number;
  quantity: number;
}

/** Payload per modificare una posizione esistente tramite PATCH /api/portfolios/:portfolioId/positions/:positionId. Tutti i campi sono opzionali. */
export interface UpdatePositionRequest {
  load_date?: string;
  load_price?: number;
  quantity?: number;
}

/**
 * Vista aggregata per ISIN di un portafoglio.
 * Aggrega tutti i carichi dello stesso ISIN calcolando la quantità totale
 * e il prezzo medio di carico ponderato (FR-008).
 */
export interface PositionSummary {
  /** Codice ISIN normalizzato. */
  isin: string;
  /** Somma delle quantità di tutti i carichi: Σ(quantity). */
  totalQuantity: number;
  /** Prezzo medio di carico ponderato: Σ(load_price × quantity) / Σ(quantity). */
  avgLoadPrice: number;
  /** Controvalore totale di carico: avgLoadPrice × totalQuantity. */
  totalLoadValue: number;
}

/**
 * Freschezza del prezzo di un titolo, decisa dal server (US-034).
 *
 * I valori sono in kebab-case come `RefetchKind`, la classificazione oraria da
 * cui questo verdetto è derivato: è la stessa frase letta dai due lati — la
 * guardia di buona cittadinanza dice «puoi ricontattare la fonte», il riepilogo
 * dice «questa cifra è vecchia».
 *
 * - `current`: il rilevamento cade nella sessione corrente, oppure nessuna
 *   sessione di borsa è trascorsa da allora. La cifra a schermo è attendibile.
 * - `stale`: almeno una sessione di borsa si è conclusa dall'ultimo rilevamento.
 * - `never-fetched`: l'archivio non ha né prezzo né istante di rilevamento.
 *
 * Non è nullable, e non deve diventarlo: l'assenza di dato è **essa stessa** uno
 * dei tre valori (`never-fetched`). Un `null` riaprirebbe nel client la domanda
 * «e adesso cosa scrivo?», cioè proprio la decisione che il criterio di US-034
 * vuole tenere sul server.
 */
export type PriceFreshness = 'current' | 'stale' | 'never-fetched';

/**
 * Vista arricchita per ISIN di un portafoglio (FR-013).
 * Aggrega tutti i carichi e, quando disponibile dalla cache securities,
 * arricchisce con il prezzo corrente e calcola la differenza rispetto al carico.
 * I campi derivati dal prezzo corrente sono nullable: null = dato non in cache.
 */
export interface EnrichedPositionSummary {
  /** Codice ISIN normalizzato. */
  isin: string;
  /** Denominazione ufficiale del titolo (dalla cache securities), null se non disponibile. */
  name: string | null;
  /** Somma delle quantità di tutti i carichi: Σ(quantity). */
  totalQuantity: number;
  /** Prezzo medio di carico ponderato: Σ(load_price × quantity) / Σ(quantity). */
  avgLoadPrice: number;
  /** Prezzo corrente dalla cache securities, null se non in cache. */
  currentPrice: number | null;
  /** Valore attuale: currentPrice × totalQuantity, null se currentPrice è null. */
  currentValue: number | null;
  /** Differenza rispetto al carico: currentValue − (avgLoadPrice × totalQuantity), null se currentPrice è null. */
  difference: number | null;
  /** Momento dell'ultimo rilevamento del prezzo (unix, secondi), null se l'ISIN non è nella cache securities. */
  fetchedAt: number | null;
  /**
   * Verdetto di freschezza del prezzo, calcolato dal server con la stessa
   * classificazione oraria della guardia di buona cittadinanza (US-034).
   * Sempre definito: `never-fetched` copre l'assenza di dato.
   */
  freshness: PriceFreshness;
}

/**
 * Una singola rilevazione di prezzo conservata nello storico locale (FR-018,
 * ADR-008).
 *
 * Non è un punto di una serie storica recuperata dalla fonte: è il registro di
 * ciò che gli aggiornamenti già esistenti hanno *osservato*. Lo storico è quindi
 * rado per costruzione, e i giorni non osservati restano vuoti — nessun valore
 * viene stimato né interpolato (ADR-003).
 */
export interface PriceObservation {
  /** Prezzo rilevato. Sempre valorizzato: un'osservazione senza prezzo non esiste. */
  price: number;
  /** Istante del rilevamento (unix, secondi). */
  observedAt: number;
  /**
   * Fonte che ha risposto al rilevamento, `null` quando non è registrata —
   * l'osservazione discende da una riga di cache anteriore alla persistenza
   * della provenienza. `null` non equivale a `'borsaitaliana'` (FR-021).
   */
  dataSource: DataSource | null;
}

/**
 * Dettaglio completo di un titolo iscritto a un portafoglio (FR-014).
 *
 * Compone in un'unica vista di sola lettura ciò che l'archivio già contiene:
 * l'aggregato di posizione, l'anagrafica dalla cache `securities`, la
 * provenienza del dato e i carichi individuali che compongono la posizione.
 * Non contatta mai la fonte esterna.
 *
 * **Ogni campo derivato dalla cache è nullable e `null` significa "dato non
 * disponibile": mai zero, mai un valore stimato.** È la stessa disciplina di
 * `SecurityInfo`, applicata anche ai valori calcolati (`currentValue`,
 * `difference`, `differencePercent`), che restano `null` finché manca il prezzo.
 */
export interface PositionDetail {
  /** Codice ISIN normalizzato. */
  isin: string;

  // ─── Aggregato di posizione — sempre valorizzato, deriva dai soli carichi ───
  /** Somma delle quantità di tutti i carichi: Σ(quantity). */
  totalQuantity: number;
  /** Prezzo medio di carico ponderato: Σ(load_price × quantity) / Σ(quantity). */
  avgLoadPrice: number;
  /** Controvalore totale di carico: avgLoadPrice × totalQuantity. */
  totalLoadValue: number;

  // ─── Valori correnti — null quando il prezzo non è in archivio ─────────────
  /** Prezzo corrente dalla cache securities, null se non in cache. */
  currentPrice: number | null;
  /** Valore attuale: currentPrice × totalQuantity, null se currentPrice è null. */
  currentValue: number | null;
  /** Differenza: currentValue − totalLoadValue, null se currentPrice è null. */
  difference: number | null;
  /** Differenza in percentuale sul controvalore di carico, null se non calcolabile. */
  differencePercent: number | null;

  // ─── Anagrafica ufficiale — null = non disponibile alla fonte o non in cache ─
  /** Denominazione ufficiale dello strumento. */
  name: string | null;
  /** Ticker / sigla di negoziazione. */
  ticker: string | null;
  /** Tipo di strumento (es. "ETF azionario", "Azione", "Obbligazione"). */
  instrumentType: string | null;
  /** Commissioni totali annue / TER, es. "0,20% (TER)". */
  totalAnnualFees: string | null;
  /** Valuta di denominazione (es. "EUR"). */
  currency: string | null;
  /** Emittente dello strumento. */
  issuer: string | null;
  /** Segmento di mercato (es. "ETFplus"). */
  segment: string | null;
  /** Politica di distribuzione dei dividendi (es. "ad accumulazione"). */
  dividendPolicy: string | null;

  // ─── Provenienza del dato (FR-021) ────────────────────────────────────────
  /**
   * Fonte da cui l'anagrafica è stata rilevata, `null` se non registrata:
   * il titolo non è in cache, oppure vi è entrato prima che la provenienza
   * fosse persistita. `null` non equivale a `'borsaitaliana'`.
   */
  dataSource: DataSource | null;
  /** Timestamp (unix, secondi) dell'ultimo recupero dalla fonte, null se non in cache. */
  fetchedAt: number | null;

  // ─── Carichi individuali ──────────────────────────────────────────────────
  /** I carichi che compongono la posizione, ordinati per data di carico crescente. */
  loads: Position[];

  // ─── Storico dei prezzi osservati (FR-018, ADR-008) ───────────────────────
  /**
   * Le rilevazioni di prezzo già registrate per questo ISIN, dalla più recente
   * alla più antica. Vuoto quando nessuna rilevazione risulta in archivio: un
   * array vuoto significa "nulla osservato", non "prezzo zero".
   */
  priceHistory: PriceObservation[];
}
