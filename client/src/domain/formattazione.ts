/**
 * Il segno tipografico di una cifra con segno: `+` per il guadagno, il **meno
 * tipografico** `−` (U+2212, non il trattino) per la perdita.
 *
 * È parte della convenzione, non della resa: la stessa cifra scritta con due
 * segni diversi si legge come due cifre diverse.
 */
export function segnoDi(valore: number): string {
  return valore >= 0 ? '+' : '−';
}

/** La classe del registro che colora una cifra con segno. */
export function classeSegno(valore: number): 'guadagno' | 'perdita' {
  return valore >= 0 ? 'guadagno' : 'perdita';
}

/**
 * Cifra con due decimali all'italiana, es. "28.261,20".
 *
 * Vive qui, accanto ai formattatori di data, perché da US-038 la **stessa**
 * cifra compare in due punti della scheda titolo: la casella «Differenza» di
 * *Posizione a conto* e il riquadro del P&L sotto il grafico. Due formattatori
 * distinti scriverebbero due stringhe potenzialmente diverse per lo stesso
 * numero, e per chi guarda quella è una divergenza — indipendentemente dal fatto
 * che l'aritmetica dietro sia identica.
 */
export function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Prezzo unitario a quattro decimali, es. "68,3000". Stessa ragione di `importo`. */
export function prezzo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Importo firmato con simbolo di valuta, es. "+€ 13.235,20". */
export function importoConSegno(valore: number, simbolo = '€'): string {
  return `${segnoDi(valore)}${simbolo} ${importo(Math.abs(valore))}`;
}

/** Percentuale firmata a due decimali, es. "+88,08 %". */
export function percentualeConSegno(valore: number): string {
  return `${segnoDi(valore)}${importo(Math.abs(valore))} %`;
}

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/**
 * Data civile abbreviata, es. "27 giu 2026" — mese italiano minuscolo di tre
 * lettere, distinta sia da `dataRegistro` (numeri romani da libro mastro) sia
 * da `dataRilevamento` (gg/mm/aaaa hh:mm): è il titolo di pagina del design
 * quadro (US-051/TASK-13), non una terza convenzione per lo stesso dato.
 */
export function dataCivile(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getDate()} ${MESI_BREVI[d.getMonth()]} ${d.getFullYear()}`;
}
