import type { ReactNode } from 'react';
import { useDesign } from '../hooks/useDesign.js';
import Foglio, { type Linguetta } from './Foglio.js';
import Quadro from './Quadro.js';

/**
 * Props condivise fra i due gusci (mastro/quadro). Rispecchiano le
 * `FoglioProps` esistenti perché `Guscio` deve poter inoltrare le stesse
 * props a `Foglio` o a `Quadro` indifferentemente: sono i due gusci a
 * decidere come usarle (o ignorarle), non chi li monta.
 */
export interface GuscioProps {
  marchio: string;
  /** Parte in tondo del titolo, es. "Conto " */
  titolo: string;
  /** Parte in corsivo/rosso (mastro) o d'accento (quadro) del titolo */
  titoloCorsivo?: string;
  sottotesto: string;
  /** Righe della colonna registro in alto a destra (semantica del mastro) */
  registro: ReactNode;
  /** Linguette/voci di navigazione, condivise fra i due gusci */
  linguette: Linguetta[];
  children: ReactNode;
}

/**
 * Guscio di pagina che sceglie la resa in base al design attivo
 * (US-050/US-051, EP-009). Ogni pagina monta `<Guscio>` invece di
 * `<Foglio>` direttamente: così l'unico punto in cui vive il ternario
 * mastro/quadro è questo componente, non ripetuto in ogni pagina.
 *
 * `Foglio` resta utilizzabile da solo (es. in test mirati) e non cambia.
 */
export default function Guscio(props: GuscioProps) {
  const { design } = useDesign();

  return design === 'quadro' ? <Quadro {...props} /> : <Foglio {...props} />;
}
