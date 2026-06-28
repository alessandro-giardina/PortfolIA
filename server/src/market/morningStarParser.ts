import * as cheerio from 'cheerio';
import type { SecurityInfo } from '@portfolia/shared';

/**
 * Parser di MorningStar: funzione pura HTML → SecurityInfo.
 *
 * È l'unico punto da aggiornare se il layout della scheda MorningStar cambia
 * (anti-corruption layer, ADR-002). I campi assenti dalla fonte vengono
 * dichiarati `null` ("dato non disponibile"): mai stimati o inventati.
 *
 * La scheda MorningStar espone i dati come righe etichetta/valore con classi
 * CSS (`<td class="label">Etichetta</td><td class="value">Valore</td>`),
 * più la denominazione in un `<h1>` e il prezzo in un elemento `.current-price`.
 * Il parser è tollerante: normalizza le etichette in minuscolo senza accenti.
 */
export function parseMorningStar(html: string, isin: string): SecurityInfo {
  const $ = cheerio.load(html);

  // Mappa normalizzata "etichetta" → "valore" da righe label/value MorningStar.
  const labels = new Map<string, string>();

  // Struttura MorningStar: <td class="label">...</td><td class="value">...</td>
  $('tr').each((_, tr) => {
    const cells = $(tr).children('td');
    if (cells.length < 2) return;
    const first = $(cells[0]);
    const second = $(cells[1]);
    // Accetta sia celle con classe "label"/"value" sia coppie generiche di td.
    const key = normalizeLabel(normText(first.text()));
    const value = normText(second.text());
    if (key && value && !labels.has(key)) {
      labels.set(key, value);
    }
  });

  // Fallback: righe th/td come in Borsa Italiana (compatibilità strutturale).
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
    lookup(['denominazione', 'nome', 'strumento', 'descrizione']);

  // Il prezzo su MorningStar è in un elemento con classe `.current-price`
  // o in una riga di tabella etichettata.
  const priceRaw =
    cleanField(normText($('.current-price').first().text())) ??
    lookup([
      'prezzo attuale',
      'prezzo',
      'nav',
      'last price',
      'valore quota',
    ]);

  return {
    isin,
    name,
    price: parseItalianNumber(priceRaw),
    ticker: lookup(['ticker', 'codice alfanumerico', 'trading code', 'codice strumento']),
    instrumentType: lookup(['tipo strumento', 'tipologia', 'tipo', 'asset class', 'categoria']),
    totalAnnualFees: lookup(['commissioni totali annue', 'ter', 'spese correnti', 'total expense ratio', 'commissioni annue']),
    currency: lookup(['valuta', 'valuta di negoziazione', 'valuta di denominazione', 'divisa']),
    issuer: lookup(['emittente', 'gestore', 'societa emittente', 'issuer', 'fund company']),
    segment: lookup(['segmento', 'categoria', 'area geografica', 'mercato', 'segmento di mercato']),
    dividendPolicy: lookup([
      'politica di distribuzione dei dividendi',
      'politica dei dividendi',
      'politica di distribuzione',
      'distribuzione proventi',
      'politica dividendi',
      'dividend policy',
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
