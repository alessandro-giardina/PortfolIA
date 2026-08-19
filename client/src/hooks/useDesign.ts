import { useSyncExternalStore } from 'react';

type Design = 'mastro' | 'quadro';

function leggiDataset(): Design {
  const current = document.documentElement.dataset.design;
  return current === 'mastro' || current === 'quadro' ? current : 'mastro';
}

// Store esterno condiviso: `Foglio`, `Quadro`, `Guscio` e le pagine chiamano
// `useDesign()` ciascuno con la propria istanza dell'hook. Con `useState` locale,
// un clic sul commutatore in una di queste istanze aggiorna il `<html>` e il
// `localStorage`, ma non lo stato React delle altre istanze — che quindi
// continuano a renderizzare il guscio/vista vecchi finché la pagina non viene
// ricaricata. `useSyncExternalStore` fa sì che ogni istanza si abboni allo
// stesso valore e si aggiorni insieme alle altre, senza ricarica.
let design: Design = leggiDataset();
const ascoltatori = new Set<() => void>();

function getSnapshot(): Design {
  return design;
}

function subscribe(listener: () => void): () => void {
  ascoltatori.add(listener);
  return () => ascoltatori.delete(listener);
}

function commutaDesign(): void {
  const next: Design = design === 'mastro' ? 'quadro' : 'mastro';
  design = next;
  document.documentElement.dataset.design = next;
  localStorage.setItem('portfolia-design', next);
  ascoltatori.forEach((notifica) => notifica());
}

export function useDesign() {
  const design = useSyncExternalStore(subscribe, getSnapshot);
  return { design, commutaDesign };
}
