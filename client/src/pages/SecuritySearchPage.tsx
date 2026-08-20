import Guscio from '../components/Guscio.js';
import { dataRegistro, type Linguetta } from '../components/Foglio.js';
import { useDesign } from '../hooks/useDesign.js';
import { useRicercaTitolo } from '../hooks/useRicercaTitolo.js';
import RicercaMastro from '../views/RicercaMastro.js';
import RicercaQuadro from '../views/RicercaQuadro.js';

/**
 * Pagina «Ricerca titoli»: dispatcher fra le due rese del design (EP-009),
 * sullo stesso modello di `DashboardPage` → `DashboardMastro`/`DashboardQuadro`.
 *
 * `useRicercaTitolo` (US-049) è chiamato **una volta sola** qui e le sue
 * uscite sono passate alla vista scelta: le due rese leggono lo stesso stato,
 * quindi non possono divergere su cosa mostrano — solo su come lo scrivono.
 */
export default function SecuritySearchPage() {
  const ricerca = useRicercaTitolo();
  const { design } = useDesign();

  const linguette: Linguetta[] = [
    { chiave: 'portafogli', etichetta: 'Portafogli', stato: 'cliccabile', to: '/' },
    { chiave: 'riepilogo', etichetta: 'Riepilogo', stato: 'disabilitata' },
    { chiave: 'ricerca', etichetta: 'Ricerca titoli', stato: 'attiva' },
    { chiave: 'titolo', etichetta: 'Scheda titolo', stato: 'disabilitata' },
  ];

  const registro = (
    <>
      <div>Modulo <b>n. 07/A</b></div>
      <div>Epica <b>EP-002</b></div>
      <div>Consultato il <b>{dataRegistro(Date.now())}</b></div>
    </>
  );

  return (
    <Guscio
      marchio="Ricerca titoli · anagrafica e prezzo"
      titolo="Cerca un titolo "
      titoloCorsivo="per ISIN"
      sottotesto="Digita il codice ISIN e recupera i dati ufficiali dalla fonte disponibile"
      registro={registro}
      linguette={linguette}
    >
      {design === 'quadro' ? <RicercaQuadro {...ricerca} /> : <RicercaMastro {...ricerca} />}
    </Guscio>
  );
}
