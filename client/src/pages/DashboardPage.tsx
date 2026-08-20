import { useNavigate } from 'react-router-dom';
import Guscio from '../components/Guscio.js';
import { dataRegistro, type Linguetta } from '../components/Foglio.js';
import { usePortafogli } from '../hooks/usePortafogli.js';
import { useDesign } from '../hooks/useDesign.js';
import DashboardMastro from '../views/DashboardMastro.js';
import DashboardQuadro from '../views/DashboardQuadro.js';

export default function DashboardPage() {
  const { portfolios, error, loading, handleCreated } = usePortafogli();
  const navigate = useNavigate();
  const { design } = useDesign();

  const linguette: Linguetta[] = [
    { chiave: 'portafogli', etichetta: 'Portafogli', stato: 'attiva', href: '/' },
    { chiave: 'riepilogo', etichetta: 'Riepilogo', stato: 'disabilitata' },
    { chiave: 'ricerca', etichetta: 'Ricerca titoli', stato: 'cliccabile', to: '/ricerca' },
    { chiave: 'titolo', etichetta: 'Scheda titolo', stato: 'disabilitata' },
  ];

  const registro = (
    <>
      <div>VOL. <b>I</b> &mdash; ANNO <b>MMXXVI</b></div>
      <div>Conti aperti: <b>{portfolios.length}</b></div>
      <div>Aggiornato il <b>{dataRegistro(Date.now())}</b></div>
    </>
  );

  return (
    <Guscio
      marchio="Registro Personale degli Investimenti"
      titolo="Libro "
      titoloCorsivo="Mastro"
      sottotesto={
        portfolios.length > 0
          ? 'Conti aperti · panoramica portafogli'
          : 'Nessun conto ancora iscritto a registro'
      }
      registro={registro}
      linguette={linguette}
    >
      {design === 'quadro' ? (
        <DashboardQuadro
          portfolios={portfolios}
          loading={loading}
          error={error}
          onOpen={(id) => navigate(`/portfolio/${id}`)}
          onCreated={handleCreated}
        />
      ) : (
        <DashboardMastro
          portfolios={portfolios}
          loading={loading}
          error={error}
          onOpen={(id) => navigate(`/portfolio/${id}`)}
          onCreated={handleCreated}
        />
      )}
    </Guscio>
  );
}
