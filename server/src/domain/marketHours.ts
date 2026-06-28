/**
 * Guardia di buona cittadinanza — orari di Borsa Italiana.
 *
 * Funzioni pure, DST-aware (Europe/Rome), con il tempo passato sempre come
 * parametro (nessun orologio interno): testabili in modo deterministico.
 *
 * Sessione di mercato: qualsiasi giorno feriale (lun–ven) dalle 9:00 alle 17:30
 * locali. **Il calendario dei festivi di Borsa Italiana è ignorato per l'MVP**
 * (scelta conservativa: in un festivo non si mostra il messaggio "forte" e si
 * consente un normale recupero); la gestione festivi è una miglioria futura.
 */

const TZ = 'Europe/Rome';
const OPEN_MIN = 9 * 60; // 09:00
const CLOSE_MIN = 17 * 60 + 30; // 17:30

export type RefetchKind = 'none' | 'intra-session' | 'no-session';

export interface RefetchResult {
  kind: RefetchKind;
  /** Messaggio da mostrare all'utente; `null` quando non serve conferma. */
  message: string | null;
}

interface RomeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = domenica … 6 = sabato. */
  weekday: number;
}

/** Componenti dell'orario locale di Roma per un dato istante assoluto. */
function getRomeParts(date: Date): RomeParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // alcune piattaforme rendono mezzanotte come "24"
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  // Il giorno della settimana è invariante rispetto al fuso per una data civile.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute: Number(p.minute), weekday };
}

/** Offset (ms) tra l'orario civile di Roma e l'UTC per un dato istante. */
function romeOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  let hour = Number(p.hour);
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return asUTC - date.getTime();
}

/** Converte un orario civile di Roma (Y/M/D + minuti dal mezzanotte) in istante assoluto. */
function romeWallToInstant(year: number, month: number, day: number, minutes: number): Date {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const guess = new Date(Date.UTC(year, month - 1, day, hh, mm));
  const offset = romeOffsetMs(guess);
  let instant = new Date(guess.getTime() - offset);
  // Una raffinatura per i confini DST.
  const offset2 = romeOffsetMs(instant);
  if (offset2 !== offset) instant = new Date(guess.getTime() - offset2);
  return instant;
}

/** `true` se il mercato è aperto nell'istante dato (feriale, 09:00 ≤ t < 17:30). */
export function isMarketOpen(now: Date): boolean {
  const p = getRomeParts(now);
  if (p.weekday === 0 || p.weekday === 6) return false;
  const minutes = p.hour * 60 + p.minute;
  return minutes >= OPEN_MIN && minutes < CLOSE_MIN;
}

/**
 * `true` se l'intervallo aperto-chiuso `(fetchedAt, now]` interseca almeno una
 * sessione di mercato. In caso negativo il prezzo non può essere cambiato.
 */
export function hasSessionInInterval(fetchedAt: Date, now: Date): boolean {
  if (now.getTime() <= fetchedAt.getTime()) return false;
  const startParts = getRomeParts(fetchedAt);
  const endParts = getRomeParts(now);
  const lastDayUTC = Date.UTC(endParts.year, endParts.month - 1, endParts.day);

  let cursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  for (let i = 0; i < 400 && cursor.getTime() <= lastDayUTC; i++) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const d = cursor.getUTCDate();
      const sessionStart = romeWallToInstant(y, m, d, OPEN_MIN);
      const sessionEnd = romeWallToInstant(y, m, d, CLOSE_MIN);
      // Intersezione di (fetchedAt, now] con [sessionStart, sessionEnd).
      if (now.getTime() > sessionStart.getTime() && fetchedAt.getTime() < sessionEnd.getTime()) {
        return true;
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return false;
}

/** `true` se i due istanti cadono nella stessa sessione di mercato (stesso giorno, entrambi in finestra). */
function isSameSession(fetchedAt: Date, now: Date): boolean {
  const f = getRomeParts(fetchedAt);
  const n = getRomeParts(now);
  return (
    f.year === n.year &&
    f.month === n.month &&
    f.day === n.day &&
    isMarketOpen(fetchedAt) &&
    isMarketOpen(now)
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(p: RomeParts): string {
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function formatDate(p: RomeParts): string {
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/**
 * Classifica una richiesta di ri-recupero di un ISIN già in cache rispetto agli
 * orari di mercato:
 * - `intra-session`: già recuperato nella sessione corrente (advisory soft).
 * - `no-session`: nessuna sessione tra l'ultimo recupero e ora (advisory forte).
 * - `none`: è trascorsa almeno una sessione → recupero diretto senza conferma.
 */
export function classifyRefetch(fetchedAt: Date, now: Date): RefetchResult {
  const fetchedParts = getRomeParts(fetchedAt);

  if (!hasSessionInInterval(fetchedAt, now)) {
    return {
      kind: 'no-session',
      message:
        `Hai già chiesto il recupero informazioni di questo titolo il ${formatDate(fetchedParts)} alle ${formatTime(fetchedParts)}. ` +
        'Non possono esserci modifiche di prezzo dall’ultima ricerca. Vuoi procedere comunque?',
    };
  }

  if (isSameSession(fetchedAt, now)) {
    return {
      kind: 'intra-session',
      message:
        `Hai già chiesto il recupero informazioni di questo titolo oggi alle ${formatTime(fetchedParts)}. ` +
        'Vuoi procedere comunque a una nuova ricerca?',
    };
  }

  return { kind: 'none', message: null };
}
