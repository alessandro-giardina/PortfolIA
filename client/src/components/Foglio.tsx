import type { ReactNode } from 'react';
import { useDesign } from '../hooks/useDesign.js';

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
  const { design, commutaDesign } = useDesign();

  return (
    <div className="foglio">
      <button type="button" className="commutatore" onClick={commutaDesign}>
        {design === 'mastro' ? (
          <>
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="4" height="4" rx=".5" />
              <rect x="7" y="1" width="4" height="2.5" rx=".5" />
              <rect x="7" y="5.5" width="4" height="5.5" rx=".5" />
              <rect x="1" y="7" width="4" height="4" rx=".5" />
            </svg>
            Quadro strumenti
          </>
        ) : (
          <>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 2.5h4.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1 1 0 0 0-1-1H2z" />
              <path d="M14 2.5H9.5A1.5 1.5 0 0 0 8 4v9.5a1 1 0 0 1 1-1h5z" />
            </svg>
            Libro Mastro
          </>
        )}
      </button>
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

/** Quantità con i soli decimali presenti, es. «12,345» e «10», mai «10,000000». */
export function quantita(valore: number): string {
  return valore.toLocaleString('it-IT', { maximumFractionDigits: 6 });
}
