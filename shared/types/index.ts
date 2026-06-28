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
