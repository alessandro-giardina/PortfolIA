import type { ReactNode } from 'react';

interface FoglioProps {
  marchio: string;
  /** Parte in tondo del titolo, es. "Libro " */
  titolo: string;
  /** Parte in corsivo/rosso del titolo, es. "Mastro" */
  titoloCorsivo?: string;
  sottotesto: string;
  /** Righe della colonna registro in alto a destra */
  registro: ReactNode;
  /** Linguette di navigazione */
  linguette: ReactNode;
  children: ReactNode;
}

/**
 * Guscio "foglio di libro mastro" condiviso da tutte le pagine.
 * Replica la struttura dei mockup docs/mockups/US-005 e libro-mastro.
 */
export default function Foglio({
  marchio,
  titolo,
  titoloCorsivo,
  sottotesto,
  registro,
  linguette,
  children,
}: FoglioProps) {
  return (
    <div className="foglio">
      <header className="testata">
        <div>
          <p className="marchio">{marchio}</p>
          <h1>
            {titolo}
            {titoloCorsivo && <span className="corsivo">{titoloCorsivo}</span>}
          </h1>
          <p className="sottotesto">{sottotesto}</p>
        </div>
        <div className="colonna-registro">{registro}</div>
      </header>

      <nav className="linguette">{linguette}</nav>

      <main className="corpo">{children}</main>

      <footer className="pie">
        <span className="firma">
          Pareggiato e sottoscritto — A. Giardina, contabile in proprio
        </span>
        <span>PortfolIA · libro mastro · c. 1</span>
      </footer>
    </div>
  );
}

/** Numerali romani per il mese, nello stile del registro (es. "04.III.2019"). */
const MESI_ROMANI = [
  'I', 'II', 'III', 'IV', 'V', 'VI',
  'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
];

/** Formatta un timestamp (secondi o millisecondi) come data da registro. */
export function dataRegistro(createdAt: number): string {
  const ms = createdAt < 1e12 ? createdAt * 1000 : createdAt;
  const d = new Date(ms);
  const giorno = String(d.getDate()).padStart(2, '0');
  const mese = MESI_ROMANI[d.getMonth()];
  return `${giorno}.${mese}.${d.getFullYear()}`;
}

/**
 * Formatta una data **civile** già in forma `YYYY-MM-DD` (es. "19.IX.2021").
 *
 * Distinta da `dataRegistro`, che parte da un istante e ne legge il giorno
 * *locale*: qui il giorno è già deciso da chi chiama, e la stringa viene spezzata
 * invece di passare da una `Date` — costruirne una la riporterebbe in un fuso, e
 * la stessa data cadrebbe al giorno prima a ogni offset negativo.
 *
 * Vive qui, accanto ai numerali romani, perché la scheda titolo la usa in due
 * punti che devono coincidere: la tabella dei carichi e il grafico dell'andamento
 * (US-036). Due formattatori distinti potrebbero divergere, e uno dei due
 * sarebbe falso.
 */
export function dataCarico(iso: string): string {
  const [anno, mese, giorno] = iso.split('-').map(Number);
  return `${String(giorno).padStart(2, '0')}.${MESI_ROMANI[mese - 1]}.${anno}`;
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

/** Importo firmato con simbolo di valuta, es. "+€ 13.235,20". */
export function importoConSegno(valore: number, simbolo = '€'): string {
  return `${segnoDi(valore)}${simbolo} ${importo(Math.abs(valore))}`;
}

/** Percentuale firmata a due decimali, es. "+88,08 %". */
export function percentualeConSegno(valore: number): string {
  return `${segnoDi(valore)}${importo(Math.abs(valore))} %`;
}
