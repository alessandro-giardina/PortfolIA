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
