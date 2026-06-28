import * as cheerio from 'cheerio';
import type { SecurityInfo } from '@portfolia/shared';

/**
 * Parser di Borsa Italiana: funzione pura HTML → SecurityInfo.
 *
 * È l'unico punto da aggiornare se il layout della scheda strumento cambia
 * (anti-corruption layer, ADR-002). I campi assenti dalla fonte vengono
 * dichiarati `null` ("dato non disponibile"): mai stimati o inventati.
 *
 * La scheda di Borsa Italiana espone i dati come righe etichetta/valore dentro
 * tabelle (`<tr><th>Etichetta</th><td>Valore</td></tr>` oppure due `<td>`),
 * più la denominazione in un titolo e il prezzo in evidenza. Il parser è
 * volutamente tollerante: cerca le etichette in modo normalizzato (minuscolo,
 * senza accenti) così da reggere piccole variazioni di markup.
 */
export function parseSecurity(html: string, isin: string): SecurityInfo {
  const $ = cheerio.load(html);

  // Mappa normalizzata "etichetta" → "valore" da tutte le righe di tabella.
  const labels = new Map<string, string>();
  $('tr').each((_, tr) => {
    const cells = $(tr).children('th, td');
    if (cells.length < 2) return;
    const key = normalizeLabel(normText($(cells[0]).text()));
    const value = normText($(cells[1]).text());
    if (key && value && !labels.has(key)) {
      labels.set(key, value);
    }
  });

  const lookup = (candidates: string[]): string | null => {
    for (const c of candidates) {
      const v = cleanField(labels.get(normalizeLabel(c)));
      if (v) return v;
    }
    return null;
  };

  const name =
    cleanField(normText($('h1').first().text())) ??
    lookup(['denominazione', 'strumento', 'nome', 'descrizione']);

  // Le schede azioni espongono il prezzo solo nell'intestazione di sintesi
  // (`<span class="… -formatPrice"><strong>81,92</strong></span>`), senza righe
  // di tabella; gli ETF lo hanno come riga etichettata. Si tenta nell'ordine.
  const priceRaw =
    cleanField(normText($('[data-price]').first().text())) ??
    cleanField(normText($('.summary-value [class*="formatPrice"]').first().text())) ??
    lookup([
      'prezzo ufficiale',
      'prezzo di riferimento',
      'prezzo ultimo contratto',
      'prezzo ultimo',
      'ultimo prezzo',
      'prezzo',
    ]);

  return {
    isin,
    name,
    price: parseItalianNumber(priceRaw),
    ticker: lookup(['codice alfanumerico', 'ticker', 'trading code', 'codice strumento', 'codice negoziazione']),
    instrumentType: lookup(['tipologia', 'tipo strumento', 'strumento finanziario', 'tipo', 'asset class']),
    totalAnnualFees: lookup(['ter', 'spese correnti', 'commissioni totali annue', 'commissioni annue', 'total expense ratio']),
    currency: lookup(['valuta di negoziazione', 'valuta di denominazione', 'valuta', 'divisa']),
    issuer: lookup(['emittente', 'societa emittente', 'gestore', 'issuer']),
    segment: lookup(['segmento', 'segmento di mercato', 'mercato']),
    dividendPolicy: lookup([
      'politica dei dividendi',
      'politica di distribuzione dei dividendi',
      'politica di distribuzione',
      'distribuzione proventi',
      'politica dividendi',
    ]),
  };
}

/** Normalizza gli spazi di una stringa di testo estratta. */
function normText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Normalizza un'etichetta: minuscolo, senza accenti, senza punteggiatura finale. */
function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[:.]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Converte un prezzo in formato italiano ("€ 1.234,55", "94,55") in numero.
 * Ritorna `null` quando il valore è assente o non numerico.
 */
function parseItalianNumber(value: string | null): number | null {
  const cleaned = cleanField(value);
  if (cleaned === null) return null;
  // Rimuove simboli di valuta, spazi e separatori delle migliaia; virgola → punto.
  const normalized = cleaned
    .replace(/[^0-9.,-]/g, '')
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.');
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}
