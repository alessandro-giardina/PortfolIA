import type { SecurityInfo } from '@portfolia/shared';
import type { MorningStarBundle } from './morningStarTypes.js';

/**
 * Parser di MorningStar: funzione pura `bundle → SecurityInfo` (US-024).
 *
 * È l'unico punto da aggiornare se cambia la forma dei dati raccolti dalla fonte
 * (anti-corruption layer, ADR-002). I campi non esposti da MorningStar vengono
 * dichiarati `null` ("dato non disponibile"): mai stimati o inventati (FR-006).
 *
 * I dati arrivano già normalizzati nel `bundle`: denominazione dall'`h1`, valuta
 * e categoria dalle API JSON `sal-service`, tipo strumento dedotto dall'URL, e il
 * prezzo come testo grezzo best-effort (la fonte non lo espone via un endpoint
 * JSON affidabile). I testi restano in inglese, come da spec.
 */
export function parseMorningStar(bundle: MorningStarBundle, isin: string): SecurityInfo {
  return {
    isin,
    name: cleanField(bundle.h1),
    price: parsePrice(bundle.priceText),
    // MorningStar non espone questi campi nel percorso di backup: dichiarati assenti.
    ticker: null,
    instrumentType: cleanField(bundle.instrumentType),
    totalAnnualFees: null,
    currency: cleanField(bundle.sal.baseCurrency),
    issuer: null,
    segment: cleanField(bundle.sal.categoryName),
    dividendPolicy: null,
  };
}

/** Ritorna `null` per valori vuoti o segnaposto ("-", "n.d.", "N/A"). */
function cleanField(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v === '') return null;
  const placeholder = v.toLowerCase().replace(/[.\s]/g, '');
  if (placeholder === '-' || placeholder === 'nd' || placeholder === 'na') return null;
  return v;
}

/**
 * Converte un testo di prezzo ("€ 13.60", "1,234.55", "13,60") in numero.
 * Best-effort: ritorna `null` quando il valore è assente o non numerico,
 * senza mai inventare un prezzo.
 */
function parsePrice(value: string | null | undefined): number | null {
  const cleaned = cleanField(value ?? null);
  if (cleaned === null) return null;

  // Tiene solo cifre e separatori; rimuove simboli di valuta e spazi.
  const raw = cleaned.replace(/[^0-9.,]/g, '');
  if (raw === '') return null;

  // Determina il separatore decimale come l'ultimo tra ',' e '.' presente,
  // così "1.234,55" (it) e "1,234.55" (en) sono interpretati correttamente.
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = raw;
  } else if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }

  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}
