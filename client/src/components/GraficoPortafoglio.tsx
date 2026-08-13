import { useId, useMemo } from 'react';
import type { OriginePunto, PrezzoNoto, PuntoPortafoglio, TitoloPortafoglio } from '@portfolia/shared';
import {
  calcolaFinestra,
  calcolaScalaSerie,
  componiSerieValorePortafoglio,
  ritagliaSerie,
} from '@portfolia/shared';
import { importo, prezzo } from './Foglio.js';
import {
  MARGINE_SEGNO,
  RIQUADRO,
  TELA,
  a1,
  conteggio,
  dataIstante,
  dataPunto,
  giorniFra,
  prezzoScala,
  rombo,
} from './graficoTela.js';

/**
 * Props del grafico del valore complessivo del portafoglio (US-019, FR-015, ADR-010).
 *
 * Come `GraficoTitolo`, **nessuna richiesta di rete** parte da qui: `titoli`
 * arriva già letto dal server (`GET /api/portfolios/:id/series`, TASK-05) e la
 * sola cosa che questo componente fa con quel dato è aggregarlo
 * (`componiSerieValorePortafoglio`) e proiettarlo. Il file non contiene alcun
 * `fetch`.
 */
export interface GraficoPortafoglioProps {
  /**
   * Il perimetro del portafoglio: un elemento per ogni titolo iscritto, coi
   * propri carichi, vendite e rilevazioni. Nessun tipo gemello — è lo stesso
   * `TitoloPortafoglio` che `shared/domain/serieValorePortafoglio.ts` consuma.
   */
  titoli: readonly TitoloPortafoglio[];
  /** Simbolo della valuta di denominazione; l'euro è la valuta del registro. */
  simboloValuta?: string;
  /**
   * Istante corrente, estremo destro dell'asse dei tempi. Arriva come prop —
   * come già fa `GraficoTitolo` — così il grafico è riproducibile in un test
   * invece di dipendere dall'orologio della macchina.
   */
  now?: number | Date;
}

/** Quanti pixel di tela deve essere larga una campitura perché ci stia dentro una scritta. */
const LARGHEZZA_MINIMA_SCRITTA = 150;

/** Quanti pixel di tela deve essere larga una quota perché la sua etichetta non si sovrapponga. */
const LARGHEZZA_MINIMA_QUOTA = 110;

/** Altezza in unità di tela della striscia del perimetro, sotto l'asse dei tempi. */
const ALTEZZA_STRISCIA_PERIMETRO = 48;

/** Come si nomina un'origine d'evento del portafoglio dentro una frase. */
const NOME_ORIGINE: Record<OriginePunto, string> = {
  carico: 'carico',
  vendita: 'vendita',
  rilevazione: 'rilevazione',
};

/** Il rettangolo del prezzo di vendita: quadrato, come il rombo del carico e il cerchio della rilevazione. */
function quadrato(cx: number, cy: number): string {
  const r = 6;
  return `M${a1(cx - r)},${a1(cy - r)} h${a1(2 * r)} v${a1(2 * r)} h${a1(-2 * r)} Z`;
}

/**
 * Un intervallo dell'asse dei tempi in cui l'archivio non possiede alcuna
 * rilevazione fra due punti a copertura piena: lo stesso concetto dei «vuoti»
 * di `GraficoTitolo`, qui limitato al tratto in cui il valore del portafoglio
 * è affermabile per intero.
 */
interface Vuoto {
  id: number;
  da: number;
  a: number;
  giorni: number;
}

/** Una fascia della striscia del perimetro: quanti titoli sono detenuti in quel tratto. */
interface FasciaPerimetro {
  id: number;
  da: number;
  a: number;
  titoli: number;
  /** Istante (unix ms) in cui la fascia comincia: serve alla didascalia testuale. */
  daIstante: number;
}

/**
 * Il timbro che dichiara la provenienza del prezzo usato per un contributo
 * (US-019, ADR-010): i tre stati sono distinti a colore e a parole, mai
 * confusi in un solo «prezzo».
 */
function TimbroRiporto({ prezzoNoto }: { prezzoNoto: PrezzoNoto }) {
  if (prezzoNoto.stato === 'nessuno') {
    return <span className="timbro-riporto assente">nessun prezzo noto</span>;
  }
  if (prezzoNoto.stato === 'del-giorno') {
    return (
      <span className="timbro-riporto del-giorno">
        rilevazione del {dataIstante(prezzoNoto.osservatoA)}
      </span>
    );
  }
  return (
    <span className="timbro-riporto">
      quotazione del {dataIstante(prezzoNoto.osservatoA)} &middot; {conteggio(prezzoNoto.etaGiorni)}{' '}
      {prezzoNoto.etaGiorni === 1 ? 'giorno' : 'giorni'}
    </span>
  );
}

/**
 * Il segno vuoto e barrato di un punto a perimetro incompleto (criterio 6): la
 * data d'evento esiste, il valore del portafoglio no. Mai un segno pieno, mai
 * unito alla curva.
 */
function SegnoParziale({ origin, cx, cy }: { origin: OriginePunto; cx: number; cy: number }) {
  const d = 3.8;
  const barra = (
    <g stroke="var(--rosso-margine)" strokeWidth={1.6}>
      <line x1={a1(cx - d)} y1={a1(cy - d)} x2={a1(cx + d)} y2={a1(cy + d)} />
      <line x1={a1(cx + d)} y1={a1(cy - d)} x2={a1(cx - d)} y2={a1(cy + d)} />
    </g>
  );
  if (origin === 'carico') {
    return (
      <g className="segno-parziale">
        <path d={rombo(cx, cy)} fill="none" stroke="var(--rosso-margine)" strokeWidth={1.6} />
        {barra}
      </g>
    );
  }
  if (origin === 'vendita') {
    return (
      <g className="segno-parziale">
        <path d={quadrato(cx, cy)} fill="none" stroke="var(--rosso-margine)" strokeWidth={1.6} />
        {barra}
      </g>
    );
  }
  return (
    <g className="segno-parziale">
      <circle cx={cx} cy={cy} r={5.4} fill="none" stroke="var(--rosso-margine)" strokeWidth={1.8} />
      {barra}
    </g>
  );
}

/**
 * Grafico del valore complessivo del portafoglio nel tempo (US-019, FR-015, ADR-010, ADR-003).
 *
 * Stessa grafica di `GraficoTitolo` — cornice quadrettata, segni, tratteggio,
 * SVG scritto a mano — misurata su un perimetro di più titoli invece che su
 * uno solo. Due cose della scheda titolo non compaiono qui, e non per
 * dimenticanza: il commutatore prezzo/valore (US-039, un prezzo unitario non
 * ha significato per un portafoglio) e il selettore della scala (US-037/US-020,
 * bloccata da questa spec) — la finestra è sempre «tutto lo storico».
 *
 * La decisione centrale, presa dal dominio e non da questo componente, è che
 * cosa conti come «prezzo noto» (ADR-010): una rilevazione realmente
 * registrata, riportata in avanti fino alla data del punto. Il prezzo di
 * carico non è mai una quotazione. Ne segue che il tratto anteriore alla prima
 * copertura piena non ha una curva: disegnarne una coi soli titoli valorizzati
 * mostrerebbe un portafoglio che sembra valere meno, ed è la lettura falsa che
 * il criterio 6 vieta.
 */
export default function GraficoPortafoglio({
  titoli,
  simboloValuta = '€',
  now,
}: GraficoPortafoglioProps) {
  const idCampitura = `campitura-portafoglio-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const istanteOra = useMemo(
    () => (now === undefined ? Date.now() : now instanceof Date ? now.getTime() : now),
    [now],
  );

  /** La serie aggregata **intera**: un punto per ogni data d'evento del perimetro. */
  const serie = useMemo(() => componiSerieValorePortafoglio(titoli), [titoli]);
  const puntiCompleti = serie.punti;

  /**
   * Quanti titoli hanno **mai** avuto una rilevazione, a prescindere dalla
   * data: distingue «non ancora valorizzato a questa data» (US-016 lo
   * spiegherà titolo per titolo) da «mai rilevato in archivio».
   */
  const titoliValorizzatiMaiUnaVolta = useMemo(
    () => titoli.filter((titolo) => titolo.priceHistory.length > 0).length,
    [titoli],
  );
  const titoliMaiValorizzati = titoli.length - titoliValorizzatiMaiUnaVolta;

  // ─── Ramo 1: nessun titolo nel perimetro ──────────────────────────────────
  // Si degrada a testo invece di disegnare un riquadro vuoto, come il ramo
  // gemello di `GraficoTitolo`: un grafico senza un solo titolo si leggerebbe
  // come un guasto, non come l'assenza che è.
  if (titoli.length === 0) {
    return (
      <div data-testid="grafico-portafoglio" data-titoli={0} data-punti={0} data-copertura="nessuno">
        <div className="avviso-rado senza-andamento" data-testid="grafico-portafoglio-vuoto">
          <span>
            Nessun titolo nel perimetro del portafoglio: senza titoli detenuti non c&rsquo;&egrave;
            alcun valore complessivo da tracciare. Il grafico compare con il primo titolo iscritto a
            registro.
          </span>
        </div>
      </div>
    );
  }

  // ─── Ramo 2: titoli detenuti, ma nessun prezzo noto per nessuno di essi ───
  // «Una quantità che non esiste non è pari a zero», e qui è il fattore
  // opposto a mancare: le quantità ci sono (i carichi sono iscritti), ma
  // l'archivio non possiede una sola rilevazione — a nessuna data. Il totale
  // non è mai affermabile, nemmeno in forma parziale: non esiste una singola
  // cifra, nemmeno barrata, da scrivere. Mai una retta a zero (ADR-003).
  const maiUnValoreAffermabile = puntiCompleti.every((punto) => punto.valoreTotale === null);
  if (puntiCompleti.length === 0 || maiUnValoreAffermabile) {
    return (
      <div
        data-testid="grafico-portafoglio"
        data-titoli={titoli.length}
        data-punti={puntiCompleti.length}
        data-copertura="assente"
      >
        <div className="barra-perimetro" role="group" aria-label="Perimetro del grafico">
          <span className="et-perimetro">Perimetro</span>
          <span className="conteggio-titoli">
            <b>{conteggio(titoli.length)}</b> {titoli.length === 1 ? 'titolo detenuto' : 'titoli detenuti'}{' '}
            &middot; <b>0</b> valorizzati
          </span>
          <span className="verdetto assente">nessun prezzo noto</span>
        </div>

        <div className="dichiarazione-vuota" data-testid="valore-portafoglio-non-disponibile">
          <p style={{ margin: 0 }}>
            <span className="timbro-grande">Dato non disponibile</span>
          </p>

          <p className="riga-intervallo">
            <span className="et-int">Perimetro del portafoglio</span>
            {conteggio(titoli.length)} {titoli.length === 1 ? 'titolo detenuto' : 'titoli detenuti'}{' '}
            &nbsp;&middot;&nbsp; <b>nessuna rilevazione</b> registrata per alcuno di essi
          </p>

          <p className="spiegazione">
            Il valore di un punto &egrave; <b>quantit&agrave; detenuta &times; ultimo prezzo noto</b>.
            Le quantit&agrave; ci sono &mdash; i carichi sono iscritti a registro &mdash; ma di prezzi
            noti l&rsquo;archivio non ne possiede nessuno: lo storico &egrave; osservazionale e si
            accumula con gli aggiornamenti che chiedi tu. Non c&rsquo;&egrave; dunque nulla da
            tracciare, e in particolare non c&rsquo;&egrave; un portafoglio che valga zero euro.
          </p>

          <p className="invito-scala">
            Nessuna scala pu&ograve; produrre un punto che non esiste: ci&ograve; che manca non
            &egrave; l&rsquo;intervallo ma il <b>prezzo</b>, e l&rsquo;archivio non lo inventa
            n&eacute; lo chiede alla fonte per conto proprio.
          </p>
        </div>
      </div>
    );
  }

  // ─── Rami 3 e 4: il tracciato ──────────────────────────────────────────────
  // Nessun selettore di scala in questa spec (US-020): la finestra è sempre
  // «tutto lo storico», calcolata con gli stessi primitivi del titolo.
  const finestra = calcolaFinestra({ scala: 'tutto', punti: puntiCompleti, now: istanteOra });
  const ritaglio = ritagliaSerie({ punti: puntiCompleti, finestra });
  const punti: PuntoPortafoglio[] = ritaglio.punti;

  const dominio = calcolaScalaSerie({
    punti,
    // Il valore del portafoglio non ha una riga di prezzo medio da collocare:
    // è una somma di controvalori, non un prezzo per quota.
    prezzoMedio: null,
    now: istanteOra,
    finestra,
    // Grandezza assoluta, come la vista del valore di US-039: tagliare la base
    // ingrandirebbe di nascosto ogni movimento del conto.
    ancoraAZero: true,
  });

  const primoPunto = punti[0];
  const ultimoPunto = punti[punti.length - 1];

  /** Vero quando il tratto **iniziale** della finestra non ha copertura piena. */
  const zonaParzialeEsiste = primoPunto.copertura !== 'piena';
  const primaCoperturaPiena = serie.primaCoperturaPiena;
  const puntoConfine =
    primaCoperturaPiena !== null ? punti.find((punto) => punto.at === primaCoperturaPiena) : undefined;

  const ampiezzaX = dominio.xMax - dominio.xMin;
  const ampiezzaY = dominio.yMax - dominio.yMin;
  const larghezzaRiquadro = RIQUADRO.destra - RIQUADRO.sinistra;
  const altezzaRiquadro = RIQUADRO.basso - RIQUADRO.alto;

  const proiettaX = (at: number) =>
    RIQUADRO.sinistra + ((at - dominio.xMin) / ampiezzaX) * larghezzaRiquadro;
  const proiettaY = (valore: number) =>
    RIQUADRO.basso -
    MARGINE_SEGNO -
    ((valore - dominio.yMin) / ampiezzaY) * (altezzaRiquadro - 2 * MARGINE_SEGNO);

  const xOggi = a1(proiettaX(Math.min(istanteOra, dominio.xMax)));
  const xUltimo = a1(proiettaX(ultimoPunto.at));

  /**
   * Il confine della zona a perimetro incompleto: la x del punto in cui la
   * copertura diventa piena, oppure il bordo destro del riquadro quando non lo
   * diventa mai (`copertura-parziale.html`, caso a) — l'intera finestra resta
   * campita.
   */
  const xConfine = !zonaParzialeEsiste
    ? RIQUADRO.sinistra
    : primaCoperturaPiena !== null
      ? a1(proiettaX(primaCoperturaPiena))
      : RIQUADRO.destra;
  const larghezzaZona = a1(Math.max(0, xConfine - RIQUADRO.sinistra));
  const giorniZona = giorniFra(primoPunto.at, primaCoperturaPiena ?? finestra.a);

  /**
   * Le cinque quote della scala del valore: estremi compresi, come in
   * `GraficoTitolo`.
   */
  const quoteY = [0, 1, 2, 3, 4].map((i) => {
    const valore = dominio.yMax - (i / 4) * ampiezzaY;
    return { valore, y: a1(proiettaY(valore)) };
  });

  /**
   * I segmenti fra due punti **entrambi** a copertura piena: è l'unico tratto
   * su cui la curva ha un senso da disegnare. Un punto a perimetro incompleto
   * non si unisce mai alla curva, nemmeno per il lato che lo precede o lo
   * segue (criterio 6).
   */
  const segmentiPieni: { da: PuntoPortafoglio; a: PuntoPortafoglio }[] = [];
  for (let i = 0; i < punti.length - 1; i += 1) {
    if (punti[i].copertura === 'piena' && punti[i + 1].copertura === 'piena') {
      segmentiPieni.push({ da: punti[i], a: punti[i + 1] });
    }
  }

  /**
   * Il tratto finale scoperto: dall'ultimo punto a oggi non esiste alcun
   * evento. Solo quando l'ultimo punto è a copertura piena — se non lo è, la
   * zona a perimetro incompleto arriva già fino al bordo destro e non c'è un
   * secondo vuoto da dichiarare sopra di essa.
   */
  const trattoFinaleScoperto = ultimoPunto.copertura === 'piena' && xOggi - xUltimo > 0.5;
  const giorniScoperti = giorniFra(ultimoPunto.at, istanteOra);

  const vuoti: Vuoto[] = [];
  for (const { da, a } of segmentiPieni) {
    vuoti.push({
      id: vuoti.length,
      da: a1(proiettaX(da.at)),
      a: a1(proiettaX(a.at)),
      giorni: giorniFra(da.at, a.at),
    });
  }
  if (trattoFinaleScoperto) {
    vuoti.push({ id: vuoti.length, da: xUltimo, a: xOggi, giorni: giorniScoperti });
  }

  /**
   * La striscia del perimetro, sotto l'asse: quanti titoli il conto detiene a
   * ciascun tratto — l'analogo aggregato della fascia della quantità di
   * US-039, il secondo fattore del prodotto reso visibile.
   */
  const fascePerimetro: FasciaPerimetro[] = [];
  {
    let corrente: FasciaPerimetro | null = null;
    for (const punto of punti) {
      const x = a1(proiettaX(punto.at));
      const numeroTitoli = punto.contributi.length;
      if (corrente === null) {
        corrente = { id: 0, da: x, a: x, titoli: numeroTitoli, daIstante: punto.at };
      } else if (numeroTitoli !== corrente.titoli) {
        corrente.a = x;
        fascePerimetro.push(corrente);
        corrente = { id: fascePerimetro.length, da: x, a: x, titoli: numeroTitoli, daIstante: punto.at };
      }
    }
    if (corrente !== null) {
      corrente.a = xOggi;
      fascePerimetro.push(corrente);
    }
  }

  const altezzaTela = TELA.altezza + (fascePerimetro.length > 0 ? ALTEZZA_STRISCIA_PERIMETRO : 0);

  const etichettaInizio = dataPunto(primoPunto);
  const etichettaFine = dataIstante(finestra.a);
  const etichettaConfine = puntoConfine ? dataPunto(puntoConfine) : null;

  const giorniFinestra = giorniFra(finestra.da, finestra.a);

  // ─── La descrizione parlata (aria-label) ───────────────────────────────────
  const descrizionePerimetro = zonaParzialeEsiste
    ? primaCoperturaPiena !== null
      ? `Fino al ${etichettaConfine} la copertura è parziale: per ${conteggio(giorniZona)} giorni civili non ogni titolo detenuto ha un prezzo noto. La copertura piena comincia il ${etichettaConfine}. `
      : `L'intera finestra resta a copertura parziale: non esiste alcuna data in cui ogni titolo detenuto abbia un prezzo noto, quindi il valore complessivo non è mai affermabile per intero. `
    : `L'intera finestra è a copertura piena: ogni titolo detenuto ha sempre un prezzo noto. `;

  const descrizioneUltimoPunto =
    ultimoPunto.valoreTotale === null
      ? `Il punto più recente è del ${dataPunto(ultimoPunto)}, e il suo valore non è affermabile: nessuno dei titoli detenuti ha un prezzo noto. `
      : ultimoPunto.copertura !== 'piena'
        ? `Il punto più recente è del ${dataPunto(ultimoPunto)}, con una somma parziale di ${simboloValuta} ${importo(ultimoPunto.valoreTotale)} calcolata sui soli titoli valorizzati: non è il valore del portafoglio. `
        : `Il punto più recente è del ${dataPunto(ultimoPunto)}: ${simboloValuta} ${importo(ultimoPunto.valoreTotale)}, con ${conteggio(ultimoPunto.suPrezzoDelGiorno)} ${ultimoPunto.suPrezzoDelGiorno === 1 ? 'titolo' : 'titoli'} su rilevazione del giorno e ${conteggio(ultimoPunto.suPrezzoRiportato)} su quotazione riportata. `;

  const descrizione =
    `Valore complessivo del portafoglio dal ${etichettaInizio} al ${etichettaFine}: ${conteggio(punti.length)} date d'evento in ${conteggio(giorniFinestra)} giorni civili. ` +
    descrizionePerimetro +
    descrizioneUltimoPunto +
    'Nessun valore è stimato o interpolato: fra due punti l\'archivio non possiede alcuna rilevazione, e i segmenti sono tratteggiati.';

  return (
    <div
      data-testid="grafico-portafoglio"
      data-titoli={titoli.length}
      data-punti={punti.length}
      data-copertura={zonaParzialeEsiste ? 'parziale' : 'piena'}
    >
      <div className="barra-perimetro" role="group" aria-label="Perimetro del grafico">
        <span className="et-perimetro">Perimetro</span>
        <span className="conteggio-titoli">
          <b>{conteggio(titoli.length)}</b> {titoli.length === 1 ? 'titolo detenuto' : 'titoli detenuti'}{' '}
          &middot; <b>{conteggio(titoliValorizzatiMaiUnaVolta)}</b>{' '}
          {titoliValorizzatiMaiUnaVolta === 1 ? 'valorizzato' : 'valorizzati'}
          {titoliMaiValorizzati > 0 && (
            <>
              {' '}
              &middot; <b>{conteggio(titoliMaiValorizzati)}</b> senza alcun prezzo noto
            </>
          )}{' '}
          &middot; <b>{conteggio(punti.length)}</b> {punti.length === 1 ? "data d'evento" : "date d'evento"}{' '}
          in archivio &middot; finestra{' '}
          <b>
            {etichettaInizio} &rarr; {etichettaFine}
          </b>
        </span>
        <span className={`verdetto${zonaParzialeEsiste ? ` ${primaCoperturaPiena !== null ? 'parziale' : 'assente'}` : ''}`}>
          {zonaParzialeEsiste
            ? primaCoperturaPiena !== null
              ? `copertura piena dal ${etichettaConfine}`
              : 'copertura parziale su tutta la finestra'
            : 'copertura piena su tutta la finestra'}
        </span>
      </div>

      <div
        className="grafico-cornice"
        data-testid={zonaParzialeEsiste ? 'grafico-portafoglio-parziale' : 'grafico-portafoglio-piena'}
      >
        <span className="cartellino-finestra">Valore complessivo &middot; tutto lo storico</span>

        <svg
          className="tracciato"
          viewBox={`0 0 ${TELA.larghezza} ${altezzaTela}`}
          role="img"
          aria-label={descrizione}
        >
          <defs>
            {/* Campitura dei vuoti d'archivio: fra due punti a copertura piena
                l'archivio non possiede alcuna rilevazione (ADR-003). Stessa
                obliqua di `GraficoTitolo`. */}
            <pattern
              id={idCampitura}
              width="11"
              height="11"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line className="campitura-vuoto" x1="0" y1="0" x2="0" y2="11" />
            </pattern>
          </defs>

          {/* ---------- Rigatura di lettura ---------- */}
          <g className="rigatura-tracciato">
            {quoteY.slice(1, -1).map((quota) => (
              <line key={quota.y} x1={RIQUADRO.sinistra} y1={quota.y} x2={RIQUADRO.destra} y2={quota.y} />
            ))}
          </g>

          {/* =====================================================================
              LA ZONA A PERIMETRO INCOMPLETO (criterio 6)
              Non è un intervallo senza prezzi: è un intervallo in cui non OGNI
              titolo detenuto ha un prezzo noto. La curva non ci entra mai —
              disegnarla coi soli titoli valorizzati mostrerebbe un portafoglio
              che sembra valere meno, ed è un dato falso, non un dato parziale.
              ===================================================================== */}
          {zonaParzialeEsiste && (
            <>
              <rect
                x={RIQUADRO.sinistra}
                y={RIQUADRO.alto}
                width={larghezzaZona}
                height={altezzaRiquadro}
                fill={
                  primaCoperturaPiena !== null
                    ? 'color-mix(in srgb, var(--ottone) 22%, transparent)'
                    : 'color-mix(in srgb, var(--rosso-margine) 18%, transparent)'
                }
              />
              <rect
                x={RIQUADRO.sinistra}
                y={RIQUADRO.alto}
                width={larghezzaZona}
                height={altezzaRiquadro}
                fill="none"
                stroke={primaCoperturaPiena !== null ? 'var(--ottone)' : 'var(--rosso-margine)'}
                strokeWidth={1.2}
                strokeDasharray="5 5"
                opacity={0.8}
              />
              {larghezzaZona >= LARGHEZZA_MINIMA_SCRITTA &&
                (primaCoperturaPiena !== null ? (
                  <text
                    className="dichiarazione-forte"
                    x={a1(RIQUADRO.sinistra + larghezzaZona / 2)}
                    y={RIQUADRO.alto + 18}
                    textAnchor="middle"
                  >
                    {conteggio(giorniZona)} GIORNI A COPERTURA PARZIALE
                  </text>
                ) : (
                  <g textAnchor="middle">
                    <rect
                      className="riquadro-dichiarazione"
                      x={a1(RIQUADRO.sinistra + larghezzaZona / 2) - 210}
                      y={a1((RIQUADRO.alto + RIQUADRO.basso) / 2) - 30}
                      width={420}
                      height={48}
                    />
                    <text
                      className="dichiarazione-forte"
                      x={a1(RIQUADRO.sinistra + larghezzaZona / 2)}
                      y={a1((RIQUADRO.alto + RIQUADRO.basso) / 2) - 10}
                    >
                      VALORE COMPLESSIVO NON AFFERMABILE
                    </text>
                    <text
                      className="dichiarazione-tenue"
                      x={a1(RIQUADRO.sinistra + larghezzaZona / 2)}
                      y={a1((RIQUADRO.alto + RIQUADRO.basso) / 2) + 8}
                    >
                      {conteggio(titoliMaiValorizzati)} {titoliMaiValorizzati === 1 ? 'titolo' : 'titoli'} su{' '}
                      {conteggio(titoli.length)} non ha alcun prezzo noto
                    </text>
                  </g>
                ))}
              {primaCoperturaPiena !== null && (
                <>
                  <line
                    x1={xConfine}
                    y1={RIQUADRO.alto}
                    x2={xConfine}
                    y2={RIQUADRO.basso}
                    stroke="var(--ottone)"
                    strokeWidth={1.6}
                  />
                  <text
                    x={Math.min(xConfine + 6, RIQUADRO.destra - 4)}
                    y={RIQUADRO.alto + 12}
                    fill="var(--ottone)"
                    fontSize={10}
                    letterSpacing="0.06em"
                  >
                    COPERTURA PIENA DAL {etichettaConfine}
                  </text>
                </>
              )}
            </>
          )}

          {/* ---------- Il tratto finale scoperto, campito e contornato ---------- */}
          {trattoFinaleScoperto && (
            <>
              <rect
                x={xUltimo}
                y={RIQUADRO.alto}
                width={a1(xOggi - xUltimo)}
                height={altezzaRiquadro}
                fill={`url(#${idCampitura})`}
              />
              <rect
                className="contorno-vuoto"
                x={xUltimo}
                y={RIQUADRO.alto}
                width={a1(xOggi - xUltimo)}
                height={altezzaRiquadro}
              />
            </>
          )}

          {/* ---------- Assi ---------- */}
          <line
            className="asse-tracciato"
            x1={RIQUADRO.sinistra}
            y1={RIQUADRO.alto}
            x2={RIQUADRO.sinistra}
            y2={RIQUADRO.basso}
          />
          <line
            className="asse-tracciato"
            x1={RIQUADRO.sinistra}
            y1={RIQUADRO.basso}
            x2={RIQUADRO.destra}
            y2={RIQUADRO.basso}
          />

          {/* ---------- Scala del valore: estremi inclusi ---------- */}
          <g className="etichetta-asse" textAnchor="end">
            {quoteY.map((quota) => (
              <text key={quota.y} x={RIQUADRO.sinistra - 8} y={quota.y + 3.8}>
                {prezzoScala(quota.valore)}
              </text>
            ))}
          </g>
          <text className="didascalia-asse" x={RIQUADRO.sinistra} y={22} data-testid="didascalia-ordinata">
            {simboloValuta} VALORE COMPLESSIVO DEL PORTAFOGLIO
          </text>

          {/* ---------- Verticale di «oggi» ---------- */}
          <line className="verticale-oggi" x1={xOggi} y1={RIQUADRO.alto} x2={xOggi} y2={RIQUADRO.basso} />
          <text className="didascalia-asse" x={xOggi - 4} y={22} textAnchor="end">
            OGGI &middot; {dataIstante(istanteOra)}
          </text>

          {/* ---------- I segmenti a copertura piena: tratteggiati, mai continui ---------- */}
          <g className="segmento-vuoto">
            {segmentiPieni.map(({ da, a }, indice) => (
              <line
                key={indice}
                x1={a1(proiettaX(da.at))}
                y1={a1(proiettaY(da.price))}
                x2={a1(proiettaX(a.at))}
                y2={a1(proiettaY(a.price))}
              />
            ))}
          </g>

          {/* ---------- I punti d'evento ----------
              Convenzione dei testid: `punto-portafoglio-N`, N progressivo da 0
              nell'ordine crescente d'istante — la stessa di `punto-serie-N` in
              `GraficoTitolo`. Un punto a copertura piena porta il segno pieno
              (rombo carico, cerchio rilevazione, quadrato vendita); un punto a
              perimetro incompleto porta il segno vuoto e barrato (criterio 6),
              mai unito alla curva. */}
          {punti.map((punto, indice) => {
            const cx = a1(proiettaX(punto.at));
            const cy = a1(proiettaY(punto.price));
            const chiave = `${indice}-${punto.at}-${punto.origin}`;
            const attributi = {
              'data-testid': `punto-portafoglio-${indice}`,
              'data-origine': punto.origin,
              'data-istante': punto.at,
              'data-copertura': punto.copertura,
              ...(punto.valoreTotale !== null ? { 'data-valore': punto.valoreTotale } : {}),
            };

            if (punto.copertura !== 'piena') {
              const contoValorizzati = punto.contributi.length - punto.nonValorizzati;
              const testo =
                `${NOME_ORIGINE[punto.origin]} del ${dataPunto(punto)}: perimetro incompleto — ` +
                `${conteggio(contoValorizzati)} di ${conteggio(punto.contributi.length)} titoli valorizzati. ` +
                (punto.valoreTotale === null
                  ? 'Nessuna somma affermabile.'
                  : `Somma parziale ${simboloValuta} ${importo(punto.valoreTotale)}, non il valore del portafoglio.`);
              return (
                <g key={chiave} {...attributi}>
                  <title>{testo}</title>
                  <SegnoParziale origin={punto.origin} cx={cx} cy={cy} />
                </g>
              );
            }

            const testo =
              `${NOME_ORIGINE[punto.origin]} del ${dataPunto(punto)}: ${simboloValuta} ${importo(punto.valoreTotale ?? 0)}` +
              (punto.suPrezzoRiportato > 0
                ? ` — ${conteggio(punto.suPrezzoRiportato)} su quotazione riportata`
                : '');

            if (punto.origin === 'vendita') {
              return (
                <path
                  key={chiave}
                  className="punto-vendita"
                  d={quadrato(cx, cy)}
                  style={{ fill: 'var(--carminio)', stroke: 'var(--inchiostro)', strokeWidth: 1.4 }}
                  {...attributi}
                >
                  <title>{testo}</title>
                </path>
              );
            }

            return punto.origin === 'carico' ? (
              <path key={chiave} className="punto-carico" d={rombo(cx, cy)} {...attributi}>
                <title>{testo}</title>
              </path>
            ) : (
              <circle key={chiave} className="punto-rilevazione" cx={cx} cy={cy} r={4.6} {...attributi}>
                <title>{testo}</title>
              </circle>
            );
          })}

          {/* ---------- Quote dei vuoti: quanti giorni civili senza alcun evento ---------- */}
          <g className="quota-vuoto">
            {vuoti.map((vuoto) => (
              <g key={vuoto.id}>
                <line x1={vuoto.da} y1={RIQUADRO.basso + 4} x2={vuoto.da} y2={RIQUADRO.basso + 14} />
                <line x1={vuoto.a} y1={RIQUADRO.basso + 4} x2={vuoto.a} y2={RIQUADRO.basso + 14} />
                <line x1={vuoto.da} y1={RIQUADRO.basso + 9} x2={vuoto.a} y2={RIQUADRO.basso + 9} />
              </g>
            ))}
          </g>
          <g className="etichetta-vuoto" textAnchor="middle">
            {vuoti
              .filter((vuoto) => vuoto.a - vuoto.da >= LARGHEZZA_MINIMA_QUOTA)
              .map((vuoto) => (
                <g key={vuoto.id}>
                  <rect
                    className="fondo-etichetta"
                    x={a1((vuoto.da + vuoto.a) / 2) - 70}
                    y={RIQUADRO.basso + 2}
                    width={140}
                    height={13}
                  />
                  <text x={a1((vuoto.da + vuoto.a) / 2)} y={RIQUADRO.basso + 12}>
                    {conteggio(vuoto.giorni)} giorni senza dati
                  </text>
                </g>
              ))}
          </g>

          {/* ---------- Estremi della scala dei tempi ---------- */}
          <g className="etichetta-asse">
            <text x={RIQUADRO.sinistra} y={RIQUADRO.basso + 28} textAnchor="start">
              {etichettaInizio}
            </text>
            <text x={xOggi} y={RIQUADRO.basso + 28} textAnchor="end">
              oggi
            </text>
          </g>
          <text className="didascalia-asse" x={RIQUADRO.sinistra} y={RIQUADRO.basso + 45}>
            GIORNI CIVILI &middot; TUTTO LO STORICO &middot; SCALA ANCORATA A ZERO
          </text>

          {/* ---------- La striscia del perimetro: quanti titoli detenuti ---------- */}
          {fascePerimetro.length > 0 && (
            <g data-testid="striscia-perimetro">
              <text className="didascalia-asse" x={RIQUADRO.sinistra} y={TELA.altezza + 10}>
                TITOLI DETENUTI A CIASCUNA DATA &mdash; QUANTI ENTRANO NELLA SOMMA
              </text>
              {fascePerimetro.map((fascia) => (
                <g key={fascia.id} data-testid={`fascia-perimetro-${fascia.id}`} data-titoli={fascia.titoli}>
                  <rect
                    className="riquadro-fascia"
                    x={fascia.da}
                    y={TELA.altezza + 16}
                    width={Math.max(0, a1(fascia.a - fascia.da))}
                    height={22}
                  />
                  {fascia.a - fascia.da >= LARGHEZZA_MINIMA_QUOTA && (
                    <text
                      className="etichetta-fascia"
                      x={a1((fascia.da + fascia.a) / 2)}
                      y={TELA.altezza + 31}
                      textAnchor="middle"
                    >
                      {conteggio(fascia.titoli)} {fascia.titoli === 1 ? 'titolo' : 'titoli'}
                    </text>
                  )}
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>

      <p className="estremi-tracciato">
        <span>
          Finestra: <b>{etichettaInizio} &rarr; {etichettaFine}</b> &middot; {conteggio(giorniFinestra)}{' '}
          giorni civili
        </span>
        <span>
          Punti d&rsquo;evento: <b>{conteggio(punti.length)}</b>
        </span>
        <span>
          {zonaParzialeEsiste
            ? primaCoperturaPiena !== null
              ? <>Copertura piena dal <b>{etichettaConfine}</b></>
              : 'Copertura parziale su tutta la finestra'
            : 'Copertura piena su tutta la finestra'}
        </span>
      </p>

      {fascePerimetro.length > 0 && (
        <p className="didascalia-perimetro" data-testid="didascalia-perimetro">
          Titoli detenuti:{' '}
          {fascePerimetro.map((fascia, indice) => (
            <span key={fascia.id}>
              {indice > 0 && ' → '}
              {conteggio(fascia.titoli)} dal {dataPunto({ at: fascia.daIstante, origin: primoPunto.origin })}
            </span>
          ))}
        </p>
      )}

      {/* =====================================================================
          LA COMPOSIZIONE DEL PUNTO PIÙ RECENTE (criteri 3, 4, 5)
          Da quali titoli è composto, con quale quantità detenuta a quella
          data, a quale prezzo e di quando è la quotazione usata: qui il
          riporto smette di essere un dettaglio implementativo e diventa un
          fatto scritto.
          ===================================================================== */}
      <div className="composizione-punto">
        <div className="intestazione-composizione">
          <span className="data-punto">Punto del {dataPunto(ultimoPunto)}</span>
          <span className="conto-punto">
            {conteggio(ultimoPunto.suPrezzoDelGiorno)}{' '}
            {ultimoPunto.suPrezzoDelGiorno === 1 ? 'titolo' : 'titoli'} su rilevazione del giorno &middot;{' '}
            {conteggio(ultimoPunto.suPrezzoRiportato)} su quotazione riportata &middot;{' '}
            {conteggio(ultimoPunto.nonValorizzati)} non valorizzat{ultimoPunto.nonValorizzati === 1 ? 'o' : 'i'}
          </span>
          <span
            className="cifra-punto"
            style={
              ultimoPunto.valoreTotale === null
                ? { color: 'var(--rosso-margine)' }
                : ultimoPunto.copertura !== 'piena'
                  ? { textDecoration: 'line-through', fontStyle: 'italic' }
                  : undefined
            }
          >
            {ultimoPunto.valoreTotale === null
              ? 'non affermabile'
              : `${simboloValuta} ${importo(ultimoPunto.valoreTotale)}`}
          </span>
        </div>

        {ultimoPunto.contributi.map((contributo) => (
          <div
            key={contributo.isin}
            className={`riga-contributo${contributo.prezzo.stato === 'riportato' ? ' riportata' : ''}${
              contributo.prezzo.stato === 'nessuno' ? ' non-valorizzata' : ''
            }`}
          >
            <span className="titolo-contributo">
              <strong>{contributo.name ?? contributo.isin}</strong>
              <small>{contributo.isin}</small>
            </span>
            <span className="conto-contributo">
              {conteggio(contributo.quantita)} {contributo.quantita === 1 ? 'quota' : 'quote'} &times;{' '}
              {contributo.prezzo.stato === 'nessuno' ? '–' : `${simboloValuta} ${prezzo(contributo.prezzo.prezzo)}`}
              <TimbroRiporto prezzoNoto={contributo.prezzo} />
            </span>
            <span className="valore-contributo">
              {contributo.valore === null ? 'non valorizzato' : `${simboloValuta} ${importo(contributo.valore)}`}
            </span>
          </div>
        ))}
      </div>

      {/* ---------- Il tratto parziale, dichiarato a parole (criterio 6) ---------- */}
      {zonaParzialeEsiste && (
        <div className="copertura-parziale" data-testid="copertura-parziale">
          <span className="et-copertura">
            Copertura parziale &middot; {etichettaInizio} &rarr;{' '}
            {primaCoperturaPiena !== null ? etichettaConfine : etichettaFine}
          </span>
          {primaCoperturaPiena !== null ? (
            <>
              Per <b>{conteggio(giorniZona)}</b> giorni civili non ogni titolo detenuto ha un prezzo
              noto. Il tratto resta perci&ograve; <b>senza curva</b>: disegnare la somma dei soli titoli
              valorizzati mostrerebbe un portafoglio che sembra valere meno, ed &egrave; un dato falso
              &mdash; non un dato parziale.
            </>
          ) : (
            <>
              <b>{conteggio(titoliMaiValorizzati)}</b> {titoliMaiValorizzati === 1 ? 'titolo' : 'titoli'}{' '}
              detenut{titoliMaiValorizzati === 1 ? 'o' : 'i'} non ha mai avuto una rilevazione: la
              copertura piena non comincia a nessuna data di questa finestra, e la curva non viene mai
              disegnata. Le somme dei soli titoli valorizzati restano scritte, ma barrate.
            </>
          )}
          <span className="rimando-us016">
            Quale titolo manca, da quando l&rsquo;archivio lo copre e come rimediare &egrave; l&rsquo;elenco
            titolo per titolo di US&#8209;016; il selettore della scala temporale arriva con US&#8209;020.
          </span>
        </div>
      )}

      <p className="nota-sezione">
        La curva &egrave; una sola &mdash; il valore complessivo &mdash; perch&eacute; il prezzo
        unitario non ha significato per un portafoglio: il commutatore di vista della scheda titolo
        (US&#8209;039) qui non compare. Tutti i dati arrivano in <b>un solo giro di richieste</b> al
        server e la costruzione del grafico non genera <b>alcuna</b> richiesta alla fonte: il tracciato
        si compone dei soli fatti gi&agrave; in archivio &mdash; carichi, vendite e rilevazioni
        registrate.
      </p>
    </div>
  );
}
