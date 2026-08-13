import { useId, useMemo, useState } from 'react';
import type {
  Copertura,
  CoperturaPerimetro,
  OriginePunto,
  PrezzoNoto,
  PuntoPortafoglio,
  ScalaTemporale,
  TitoloPortafoglio,
} from '@portfolia/shared';
import {
  SCALA_PREDEFINITA,
  SCALE_TEMPORALI,
  calcolaFinestra,
  calcolaScalaSerie,
  componiSerieValorePortafoglio,
  coperturaPerimetroFinestra,
  definizioneScala,
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

/** Le classi che il bottone attivo della traversa porta secondo la copertura nel tempo. */
const MODIFICATORE_COPERTURA: Record<Copertura, string> = {
  piena: '',
  parziale: 'parziale',
  assente: 'senza-dati',
};

/** La misura della **prima** dimensione: quanta parte della finestra chiesta l'archivio possiede. */
interface MisuraTempo {
  /** Il verdetto di `ritagliaSerie` sulla finestra. */
  copertura: Copertura;
  /** Istante del primo dato d'archivio quando cade **dentro** la finestra; `null` altrimenti. */
  inizioArchivio: number | null;
  /** I giorni civili della finestra chiesta: il denominatore di questo regolo. */
  giorniChiesti: number;
  /** I giorni civili della finestra che l'archivio copre davvero. */
  giorniCoperti: number;
}

/** La misura della **seconda** dimensione: quanti titoli detenuti erano valorizzati dove i dati ci sono. */
interface MisuraPerimetro extends CoperturaPerimetro {
  /** I giorni coperti dall'archivio: il denominatore di *questo* regolo, diverso dall'altro. */
  giorniMisurabili: number;
  /** I giorni, fra quelli misurabili, in cui ogni titolo detenuto ha un prezzo noto. */
  giorniCompleti: number;
  /** Quante date d'evento cadono nella finestra. */
  punti: number;
}

/** La frazione coperta, sempre fra 0 e 1 e mai `NaN` su un denominatore nullo. */
function frazione(parte: number, totale: number): number {
  if (!(totale > 0)) return 0;
  return Math.min(1, Math.max(0, parte / totale));
}

/**
 * Il doppio regolo della copertura (US-020, criteri 5 e 6).
 *
 * Per un singolo titolo la copertura è una domanda sola, e US-037 la misura con
 * un regolo solo. Per un **aggregato** le domande sono due e indipendenti, e
 * possono essere una piena e l'altra parziale:
 *
 * - **I, il tempo**: quanta parte della finestra chiesta l'archivio possiede.
 *   Denominatore, i giorni della finestra chiesta; rimedio, una scala più stretta.
 * - **II, il perimetro**: quanti dei titoli *detenuti* erano valorizzati alle
 *   date che l'archivio copre. Denominatore, i giorni coperti dall'archivio;
 *   rimedio, aggiornare i prezzi (US-035).
 *
 * I denominatori sono diversi perché la seconda domanda si misura **dentro** la
 * prima: fuori dai giorni che l'archivio copre non esistono date su cui contare
 * i titoli valorizzati. Ne segue che i due numeri non si mediano — una media di
 * due frazioni con denominatori diversi non corrisponde ad alcun fatto — ed è la
 * ragione per cui entrambi i denominatori sono scritti accanto alla propria
 * barra invece di restare impliciti.
 */
function DoppioRegolo({
  tempo,
  perimetro,
  etichettaScala,
}: {
  tempo: MisuraTempo;
  perimetro: MisuraPerimetro;
  etichettaScala: string;
}) {
  const giorniScoperti = Math.max(0, tempo.giorniChiesti - tempo.giorniCoperti);
  const giorniIncompleti = Math.max(0, perimetro.giorniMisurabili - perimetro.giorniCompleti);
  const senzaOggetto = perimetro.verdetto === 'senza-oggetto';

  return (
    <div className="doppio-regolo" data-testid="doppio-regolo">
      <div className="testa-regoli">
        <span>Copertura della finestra chiesta</span>
        <span className="chiosa">
          {senzaOggetto
            ? 'la seconda dimensione si misura dentro la prima'
            : 'due dimensioni, due verdetti — mai una media dei due'}
        </span>
      </div>

      {/* ---------- I · il tempo ---------- */}
      <div className="regolo tempo" data-testid="regolo-tempo" data-verdetto={tempo.copertura}>
        <span className="et-dimensione">
          <span className="ordinale">I</span>
          Tempo
        </span>
        <div className="misura">
          <span className="verdetto-regolo">
            {tempo.copertura === 'assente' ? (
              <>
                <b>nessun punto</b> nella finestra &middot; {conteggio(tempo.giorniChiesti)} giorni
                civili chiesti, 0 coperti
              </>
            ) : tempo.copertura === 'parziale' && tempo.inizioArchivio !== null ? (
              <>
                i dati cominciano il <b>{dataIstante(tempo.inizioArchivio)}</b> &middot;{' '}
                {conteggio(giorniScoperti)} giorni civili scoperti su{' '}
                {conteggio(tempo.giorniChiesti)}
              </>
            ) : (
              <>
                l&rsquo;archivio copre l&rsquo;intera finestra &middot;{' '}
                <b>{conteggio(tempo.giorniChiesti)}</b> giorni civili su{' '}
                {conteggio(tempo.giorniChiesti)}
              </>
            )}
          </span>

          <div className="barra-copertura">
            <span
              className="coperto"
              style={{ width: `${(frazione(tempo.giorniCoperti, tempo.giorniChiesti) * 100).toFixed(1)}%` }}
            />
            <span className="etichetta-scoperto">
              {tempo.copertura === 'assente'
                ? 'nessuna data d’evento in questa finestra'
                : tempo.copertura === 'parziale' && tempo.inizioArchivio !== null
                  ? `nessun dato prima del ${dataIstante(tempo.inizioArchivio)}`
                  : 'nessun giorno scoperto'}
            </span>
            {tempo.giorniCoperti > 0 && (
              <span className="etichetta-coperto">{conteggio(tempo.giorniCoperti)} gg</span>
            )}
          </div>

          <p className="legenda-regolo" data-testid="denominatore-tempo">
            {tempo.copertura === 'assente' ? (
              <>
                L&rsquo;ultimo valore noto <b>non viene portato dentro</b> la finestra e non viene
                prolungato fino a oggi: una retta piatta al suo livello affermerebbe un valore mai
                osservato (ADR&#8209;003). Denominatore: i <b>{conteggio(tempo.giorniChiesti)}</b>{' '}
                giorni della finestra chiesta.
              </>
            ) : (
              <>
                La scala chiesta &mdash; <b>{etichettaScala.toLowerCase()}</b> &mdash;{' '}
                {tempo.copertura === 'parziale' ? (
                  <>
                    &egrave; pi&ugrave; lunga della storia disponibile, e l&rsquo;orizzonte{' '}
                    <b>non si accorcia</b>: l&rsquo;asse resta lungo quanto l&rsquo;orizzonte
                    chiesto, cos&igrave; il tratto scoperto si vede invece di sparire.
                  </>
                ) : (
                  <>
                    &egrave; interamente compresa nella storia disponibile: nessun tratto
                    dell&rsquo;asse cade fuori dall&rsquo;archivio.
                  </>
                )}{' '}
                Denominatore: i <b>{conteggio(tempo.giorniChiesti)}</b> giorni della finestra
                chiesta.
              </>
            )}
          </p>
        </div>
      </div>

      {/* ---------- II · il perimetro ---------- */}
      <div
        className="regolo perimetro"
        data-testid="regolo-perimetro"
        data-verdetto={perimetro.verdetto}
      >
        <span className="et-dimensione">
          <span className="ordinale">II</span>
          Perimetro
        </span>
        <div className="misura">
          <span className="verdetto-regolo">
            {senzaOggetto ? (
              <>
                <b>non misurabile</b> in questa finestra &mdash; n&eacute; piena n&eacute; parziale
              </>
            ) : perimetro.verdetto === 'piena' ? (
              <>
                perimetro completo su <b>tutte</b> le {conteggio(perimetro.punti)} date
                d&rsquo;evento della finestra
              </>
            ) : perimetro.primaCoperturaPiena !== null ? (
              <>
                perimetro completo dal <b>{dataIstante(perimetro.primaCoperturaPiena)}</b> &middot;{' '}
                {conteggio(giorniIncompleti)} giorni su {conteggio(perimetro.giorniMisurabili)} con
                almeno un titolo non valorizzato
              </>
            ) : (
              <>
                <b>nessuna data a perimetro completo</b> &middot; tutte le{' '}
                {conteggio(perimetro.punti)} date d&rsquo;evento hanno almeno un titolo detenuto
                senza prezzo noto
              </>
            )}
          </span>

          <div className="barra-copertura">
            {!senzaOggetto && (
              <span
                className="coperto"
                style={{
                  width: `${(frazione(perimetro.giorniCompleti, perimetro.giorniMisurabili) * 100).toFixed(1)}%`,
                }}
              />
            )}
            <span className="etichetta-scoperto">
              {senzaOggetto
                ? 'nessuna data su cui contare i titoli valorizzati'
                : perimetro.verdetto === 'piena'
                  ? 'ogni titolo detenuto ha un prezzo noto'
                  : 'non ogni titolo detenuto ha un prezzo noto'}
            </span>
            {!senzaOggetto && perimetro.giorniCompleti > 0 && (
              <span className="etichetta-coperto">{conteggio(perimetro.giorniCompleti)} gg</span>
            )}
          </div>

          <p className="legenda-regolo" data-testid="denominatore-perimetro">
            {senzaOggetto ? (
              <>
                &laquo;Quanti titoli detenuti erano valorizzati&raquo; &egrave; una domanda che si
                pone <em>a una data</em>: senza date in finestra non ha risposta, e inventarne una
                &mdash; &laquo;parziale&raquo;, oppure &laquo;piena&raquo; perch&eacute; non risulta
                alcuna eccezione &mdash; sarebbe un verdetto su un insieme che nessuno ha guardato.
              </>
            ) : (
              <>
                Nei giorni che l&rsquo;archivio copre, quanti dei titoli <em>detenuti</em> erano
                valorizzati: <b>{conteggio(perimetro.puntiPieni)}</b> di{' '}
                {conteggio(perimetro.punti)} date d&rsquo;evento a perimetro completo. Denominatore:
                i <b>{conteggio(perimetro.giorniMisurabili)}</b> giorni coperti
                dall&rsquo;archivio &mdash; fuori da quelli la domanda non si pone nemmeno.
              </>
            )}
          </p>
        </div>
      </div>

      <p className="sigillo-due-dimensioni" data-testid="sigillo-due-dimensioni">
        <span className="graffa" aria-hidden="true">
          &#8214;
        </span>
        {senzaOggetto ? (
          <span>
            Le due dimensioni restano <b>due</b> anche qui, e proprio qui si vede perch&eacute;: un
            verdetto unico dovrebbe scegliere fra &laquo;parziale&raquo; e &laquo;assente&raquo; per
            due domande che hanno risposte diverse. La prima &egrave; <b>assente</b>; la seconda non
            &egrave; assente, &egrave; <b>senza oggetto</b>.
          </span>
        ) : (
          <span>
            I due verdetti <b>non si deducono l&rsquo;uno dall&rsquo;altro</b> e non si sommano in
            un numero solo: il primo dice quanta parte dell&rsquo;orizzonte chiesto l&rsquo;archivio
            possiede, il secondo quanti titoli detenuti erano valorizzati dove i dati ci sono. Il
            secondo &egrave; misurato <em>dentro</em> il primo &mdash; ecco perch&eacute; i due
            regoli portano denominatori diversi, scritti entrambi. E il rimedio &egrave; diverso:
            alla prima dimensione si rimedia scegliendo una <b>scala pi&ugrave; stretta</b>, alla
            seconda <b>aggiornando i prezzi</b> dei titoli che ne sono privi (US&#8209;035); quale
            titolo manchi lo elenca US&#8209;016.
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Grafico del valore complessivo del portafoglio nel tempo (US-019, US-020, FR-015, FR-016, ADR-010, ADR-003).
 *
 * Stessa grafica di `GraficoTitolo` — cornice quadrettata, segni, tratteggio,
 * SVG scritto a mano — misurata su un perimetro di più titoli invece che su
 * uno solo. Una cosa della scheda titolo non compare qui, e non per
 * dimenticanza: il commutatore prezzo/valore (US-039), perché un prezzo
 * unitario non ha significato per un portafoglio. Il selettore della scala
 * invece c'è (US-020), ed è **lo stesso** di US-037: le cinque scale arrivano
 * da `SCALE_TEMPORALI`, lette e non ricopiate — una sola idea di orizzonte in
 * tutta l'app.
 *
 * Ciò che il portafoglio ha in più del titolo è la **doppia dimensione** della
 * copertura: quanta parte della finestra chiesta l'archivio possiede nel tempo,
 * e quanti titoli detenuti erano valorizzati alle date coperte. Sono due
 * domande indipendenti, con denominatori diversi e rimedi opposti, e il doppio
 * regolo le tiene separate invece di mediarle in un verdetto solo.
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
  const radiceId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const idCampitura = `campitura-portafoglio-${radiceId}`;
  /**
   * Campitura del tratto **fuori dall'archivio**: puntinata e in seppia,
   * deliberatamente diversa dall'obliqua del perimetro incompleto. Le due
   * assenze non sono la stessa assenza — là i dati non esistono per nessun
   * titolo, qui esistono ma non per ogni titolo detenuto — e un'unica trama le
   * farebbe leggere come una sola, mentre i rimedi sono opposti.
   */
  const idFuoriArchivio = `fuori-archivio-${radiceId}`;

  /**
   * La scala scelta dall'utente (US-020, criterio 2).
   *
   * Nasce da `SCALA_PREDEFINITA` — «tutto lo storico», la sola scala che non
   * ritagli nulla e quindi l'unica che non possa nascondere un punto senza
   * dirlo. Il ritorno alla predefinita rientrando sul Riepilogo non passa da un
   * effetto ma dal montaggio: `PortfolioDetailPage` rende questa sezione dentro
   * un `scheda === 'riepilogo' && …`, quindi cambiare linguetta smonta il
   * componente e rientrare lo rimonta col valore iniziale — vero per
   * costruzione invece che per un effetto da ricordarsi.
   */
  const [scalaScelta, setScalaScelta] = useState<ScalaTemporale>(SCALA_PREDEFINITA);

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

  // ─── La finestra della scala scelta (US-020) ───────────────────────────────
  // Cambiare scala è **filtrare un array già in memoria**: non parte alcuna
  // richiesta, non si aggiunge alcun punto e non si infittisce nulla. In questo
  // file non esiste codice che possa contattare la rete, ed è la ragione per cui
  // il criterio «il grafico si aggiorna» si soddisfa senza tornare al server.
  const definizione = definizioneScala(scalaScelta);
  const finestra = calcolaFinestra({ scala: scalaScelta, punti: puntiCompleti, now: istanteOra });
  const ritaglio = ritagliaSerie({ punti: puntiCompleti, finestra });
  const punti: PuntoPortafoglio[] = ritaglio.punti;

  /**
   * La copertura del perimetro **relativa a questa finestra**, non quella
   * globale della serie: su una scala stretta la copertura piena globale può
   * cadere fuori campo, e la copertura può anche regredire quando un titolo mai
   * rilevato entra a registro (vedi `coperturaPerimetroFinestra`).
   */
  const perimetro = coperturaPerimetroFinestra(punti);

  /**
   * Vero quando il tratto **iniziale** della finestra non è a copertura piena:
   * è la sola condizione che giustifichi una campitura a sinistra del confine.
   *
   * Distinta da `perimetro.verdetto`, che è parziale anche quando la copertura
   * **regredisce** dopo un tratto pieno — un titolo mai rilevato che entra a
   * registro a metà finestra. Confonderle campirebbe l'inizio della finestra
   * per un'incompletezza che comincia altrove.
   */
  const perimetroIncompletoInTesta = punti.length > 0 && punti[0].copertura !== 'piena';

  const etichettaInizio = dataIstante(finestra.da);
  const etichettaFine = dataIstante(finestra.a);
  const giorniFinestra = giorniFra(finestra.da, finestra.a);

  /**
   * Il primo dato d'archivio quando cade **dentro** la finestra, cioè quando
   * l'orizzonte chiesto è più lungo della storia disponibile. `null` quando
   * l'archivio comincia prima dell'inizio della finestra — non c'è alcun tratto
   * scoperto da dichiarare — o quando la finestra è priva di punti.
   */
  const inizioArchivio = ritaglio.copertura === 'parziale' ? ritaglio.primoDatoDisponibile : null;

  /** I giorni della finestra che l'archivio copre davvero: il denominatore del **secondo** regolo. */
  const giorniCoperti =
    ritaglio.copertura === 'assente' ? 0 : giorniFra(inizioArchivio ?? finestra.da, finestra.a);

  /** I giorni coperti in cui ogni titolo detenuto ha un prezzo noto. */
  const giorniPerimetroCompleto =
    perimetro.primaCoperturaPiena !== null
      ? Math.min(giorniCoperti, giorniFra(perimetro.primaCoperturaPiena, finestra.a))
      : 0;

  const misuraTempo: MisuraTempo = {
    copertura: ritaglio.copertura,
    inizioArchivio,
    giorniChiesti: giorniFinestra,
    giorniCoperti,
  };
  const misuraPerimetro: MisuraPerimetro = {
    ...perimetro,
    giorniMisurabili: giorniCoperti,
    giorniCompleti: giorniPerimetroCompleto,
    punti: punti.length,
  };

  /**
   * La scala più stretta, fra quelle diverse da quella scelta, che comprenderebbe
   * almeno un punto: serve solo allo stato «dato non disponibile», dove indicare
   * il rimedio vale più che ripetere il problema. Stesso criterio di
   * `scalaSuggerita` in `GraficoTitolo`, applicato alla serie aggregata.
   */
  const scalaSuggerita =
    ritaglio.copertura !== 'assente'
      ? null
      : (SCALE_TEMPORALI.find(
          (candidata) =>
            candidata.id !== scalaScelta &&
            ritagliaSerie({
              punti: puntiCompleti,
              finestra: calcolaFinestra({
                scala: candidata.id,
                punti: puntiCompleti,
                now: istanteOra,
              }),
            }).punti.length > 0,
        ) ?? null);

  /**
   * La traversa delle cinque scale: **le stesse** della scheda titolo, lette da
   * `SCALE_TEMPORALI` e non ricopiate qui con le stesse etichette. Nessun
   * bottone viene mai disabilitato — un bottone spento non spiegherebbe
   * perché è spento — e il bottone attivo porta il colore del verdetto di
   * copertura invece di un colore decorativo.
   */
  const barraScala = (
    <div className="barra-scala">
      <span className="et-scala">Scala temporale</span>
      <div
        className="scala-temporale"
        role="group"
        aria-label="Scala temporale del grafico"
        data-testid="scala-temporale"
      >
        {SCALE_TEMPORALI.map((candidata) => (
          <button
            key={candidata.id}
            type="button"
            data-testid={`scala-${candidata.id}`}
            aria-pressed={candidata.id === scalaScelta}
            className={
              candidata.id === scalaScelta
                ? `attiva${MODIFICATORE_COPERTURA[ritaglio.copertura] === '' ? '' : ` ${MODIFICATORE_COPERTURA[ritaglio.copertura]}`}`
                : undefined
            }
            onClick={() => setScalaScelta(candidata.id)}
          >
            {candidata.etichetta}
            {candidata.id === SCALA_PREDEFINITA && (
              <span className="postilla-predefinita">predefinita</span>
            )}
          </button>
        ))}
      </div>
      <span
        className={`finestra-attiva${ritaglio.copertura === 'piena' ? '' : ` ${ritaglio.copertura}`}`}
        data-testid="finestra-attiva"
      >
        Finestra:{' '}
        <b>
          {etichettaInizio} &rarr; {etichettaFine}
        </b>{' '}
        &middot; {conteggio(giorniFinestra)} giorni &middot; {conteggio(punti.length)}{' '}
        {punti.length === 1 ? 'punto' : 'punti'}
      </span>
    </div>
  );

  /**
   * La traversa del perimetro (US-019): dice **che cosa** entra nella curva, non
   * su quale finestra la si guarda. Sta sopra la traversa della scala, e le due
   * restano distinte proprio perché rispondono a domande diverse.
   */
  const barraPerimetro = (
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
        &middot; <b>{conteggio(puntiCompleti.length)}</b>{' '}
        {puntiCompleti.length === 1 ? "data d'evento" : "date d'evento"} in archivio &middot;
        visibili in finestra <b>{conteggio(punti.length)}</b>
      </span>
      <span
        className={`verdetto${
          perimetro.verdetto === 'senza-oggetto'
            ? ' assente'
            : perimetro.verdetto === 'parziale'
              ? perimetro.primaCoperturaPiena !== null && perimetroIncompletoInTesta
                ? ' parziale'
                : perimetro.primaCoperturaPiena === null
                  ? ' assente'
                  : ' parziale'
              : ''
        }`}
      >
        {perimetro.verdetto === 'senza-oggetto'
          ? 'nessun punto in questa finestra'
          : perimetro.verdetto === 'piena'
            ? 'copertura piena su tutta la finestra'
            : perimetro.primaCoperturaPiena === null
              ? 'copertura parziale su tutta la finestra'
              : perimetroIncompletoInTesta
                ? `copertura piena dal ${dataIstante(perimetro.primaCoperturaPiena)}`
                : // La copertura è tornata parziale *dopo* un tratto pieno: una
                  // data d'inizio si leggerebbe come «piena da lì in poi», che
                  // qui è falso. Si dichiara invece quante date sono incomplete.
                  `copertura parziale in ${conteggio(perimetro.puntiParziali)} ${perimetro.puntiParziali === 1 ? 'data' : 'date'} della finestra`}
      </span>
    </div>
  );

  // ─── Ramo 3: la finestra scelta non contiene alcun punto (criterio 4, ADR-003) ──
  // Al posto della cornice, la dichiarazione. Non una cornice vuota — si
  // leggerebbe come un guasto — e nemmeno l'ultimo valore noto portato dentro la
  // finestra: sarebbe una cifra timbrata a un istante in cui nessuno l'ha
  // osservata. Nessun bottone viene disabilitato: la scala resta scegliibile, ed
  // è dalla traversa che si rimedia.
  if (ritaglio.copertura === 'assente') {
    const ultimoArchivio = puntiCompleti[puntiCompleti.length - 1];
    const anteriore = ultimoArchivio.at < finestra.da;
    const distanza = anteriore
      ? giorniFra(ultimoArchivio.at, finestra.da)
      : giorniFra(finestra.a, ultimoArchivio.at);

    return (
      <div
        data-testid="grafico-portafoglio"
        data-titoli={titoli.length}
        data-punti={0}
        data-scala={scalaScelta}
        data-copertura="assente"
      >
        {barraPerimetro}
        {barraScala}

        <div className="dichiarazione-vuota" data-testid="finestra-portafoglio-vuota">
          <span className="cartellino-finestra">
            {etichettaInizio} &rarr; {etichettaFine}
          </span>

          <p style={{ margin: 0 }}>
            <span className="timbro-grande">Dato non disponibile</span>
          </p>

          <p className="riga-intervallo" data-testid="intervallo-richiesto">
            <span className="et-int">
              Intervallo richiesto &mdash; {definizione.etichetta.toLowerCase()}
            </span>
            {etichettaInizio} &nbsp;&rarr;&nbsp; {etichettaFine} &nbsp;&middot;&nbsp;{' '}
            {conteggio(giorniFinestra)} giorni civili
          </p>

          <p className="spiegazione">
            In questa finestra il portafoglio non ha <b>alcuna data d&rsquo;evento</b>: n&eacute;
            carichi, n&eacute; vendite, n&eacute; rilevazioni di prezzo per alcuno dei titoli
            detenuti. Non &egrave; un guasto della fonte n&eacute; un errore di lettura &mdash;
            &egrave; assenza di dati, e come tale viene dichiarata.
          </p>

          <p className="dove-esiste" data-testid="dove-esiste-portafoglio">
            <span className="et">Dove il dato esiste davvero</span>
            <span>
              il punto pi&ugrave; recente in archivio &egrave; del{' '}
              <b>{dataPunto(ultimoArchivio)}</b> (
              {ultimoArchivio.valoreTotale === null
                ? 'valore non affermabile'
                : `${simboloValuta} ${importo(ultimoArchivio.valoreTotale)}`}
              , {NOME_ORIGINE[ultimoArchivio.origin]}) &mdash; <b>fuori da questa finestra</b>,{' '}
              {conteggio(distanza)} {distanza === 1 ? 'giorno' : 'giorni'}{' '}
              {anteriore ? 'prima del suo inizio' : 'dopo la sua fine'}.
            </span>
          </p>

          {scalaSuggerita !== null && (
            <p className="invito-scala">
              Per vedere un tracciato, torna a una scala pi&ugrave; ampia:{' '}
              <span className="tasto-citato">{scalaSuggerita.etichetta}</span> comprende almeno un
              punto d&rsquo;archivio, e{' '}
              <span className="tasto-citato">
                {SCALE_TEMPORALI[SCALE_TEMPORALI.length - 1].etichetta}
              </span>{' '}
              apre la finestra completa &mdash; dal primo punto del{' '}
              <b>{dataPunto(puntiCompleti[0])}</b> a oggi.
            </p>
          )}
        </div>

        <DoppioRegolo
          tempo={misuraTempo}
          perimetro={misuraPerimetro}
          etichettaScala={definizione.etichetta}
        />

        <div className="avviso-rado senza-trascinamento" data-testid="avviso-grafico-portafoglio">
          <span>
            Il valore del <b>{dataPunto(ultimoArchivio)}</b> resta dov&rsquo;&egrave;: PortfolIA non
            lo prolunga fino a oggi, non lo ripete come ultimo valore noto e non traccia una retta
            piatta al suo livello. Portarlo dentro una finestra che non lo contiene significherebbe
            affermare un valore complessivo mai osservato (ADR&#8209;003).
          </span>
        </div>

        <p className="nota-sezione">
          Cambiare scala &egrave; <em>ritagliare</em> la finestra, mai <em>infittire</em>{' '}
          l&rsquo;archivio: la scelta non interroga la fonte, non aggiunge punti e non tocca il
          perimetro. Ci&ograve; che pu&ograve; aggiungere punti &egrave; un aggiornamento dei prezzi
          (US&#8209;035), non un bottone di questa traversa.
        </p>
      </div>
    );
  }

  // ─── Rami 4 e 5: il tracciato ──────────────────────────────────────────────
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
  const zonaParzialeEsiste = perimetroIncompletoInTesta;
  /**
   * Il confine della copertura piena **relativo alla finestra** (US-020), non
   * quello globale della serie: `serie.primaCoperturaPiena` può cadere prima di
   * `finestra.da`, e campire fino a lì disegnerebbe un tratto che in questa
   * finestra non esiste.
   */
  const primaCoperturaPiena = perimetro.primaCoperturaPiena;
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
   * La x del primo dato d'archivio dentro la finestra: fine del tratto **fuori
   * archivio** e inizio di quello a perimetro incompleto. Coincide col bordo
   * sinistro quando l'archivio copre l'intera finestra chiesta.
   *
   * L'asse **non** si accorcia fino a qui (criterio 5): se lo facesse, i giorni
   * d'archivio riempirebbero tutta la larghezza e la finestra sembrerebbe
   * coperta per intero — il dominio X resta quello della finestra, e il tratto
   * scoperto viene campito e dichiarato.
   */
  const xInizioArchivio =
    inizioArchivio !== null ? a1(proiettaX(inizioArchivio)) : RIQUADRO.sinistra;
  const larghezzaFuoriArchivio = a1(Math.max(0, xInizioArchivio - RIQUADRO.sinistra));

  /**
   * Il confine della zona a perimetro incompleto: la x del punto in cui la
   * copertura diventa piena, oppure il bordo destro del riquadro quando non lo
   * diventa mai (`copertura-parziale.html`, caso a) — l'intera parte coperta
   * resta campita.
   */
  const xConfine = !zonaParzialeEsiste
    ? xInizioArchivio
    : primaCoperturaPiena !== null
      ? a1(proiettaX(primaCoperturaPiena))
      : RIQUADRO.destra;
  const larghezzaZona = a1(Math.max(0, xConfine - xInizioArchivio));
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

  /** La data del **primo punto d'archivio** in finestra, distinta dall'inizio della finestra chiesta. */
  const etichettaPrimoPunto = dataPunto(primoPunto);
  const etichettaConfine = puntoConfine ? dataPunto(puntoConfine) : null;

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

  /**
   * La copertura nel tempo, detta a parole: la finestra chiesta è quella della
   * scala scelta, e quando l'archivio non la copre per intero la frase lo dice
   * invece di lasciar credere che dieci anni di asse siano dieci anni di dati.
   */
  const descrizioneTempo =
    misuraTempo.copertura === 'parziale' && inizioArchivio !== null
      ? `L'archivio ne copre ${conteggio(giorniCoperti)}, dal ${dataIstante(inizioArchivio)}: per i ${conteggio(giorniFinestra - giorniCoperti)} giorni precedenti non esiste alcun dato, e l'asse resta lungo quanto l'orizzonte chiesto invece di accorciarsi fino al primo dato. `
      : `L'archivio copre l'intera finestra chiesta. `;

  const descrizione =
    `Valore complessivo del portafoglio sulla finestra «${definizione.etichetta.toLowerCase()}», dal ${etichettaInizio} al ${etichettaFine}: ${conteggio(punti.length)} date d'evento in ${conteggio(giorniFinestra)} giorni civili chiesti. ` +
    descrizioneTempo +
    descrizionePerimetro +
    descrizioneUltimoPunto +
    "I due verdetti sono indipendenti: nessuno dei due si deduce dall'altro. " +
    'Nessun valore è stimato o interpolato: fra due punti l\'archivio non possiede alcuna rilevazione, e i segmenti sono tratteggiati.';

  return (
    <div
      data-testid="grafico-portafoglio"
      data-titoli={titoli.length}
      data-punti={punti.length}
      data-scala={scalaScelta}
      // Il verdetto **della finestra intera**, non del solo tratto iniziale:
      // con una copertura che regredisce — un titolo mai rilevato che entra a
      // registro a metà finestra — `zonaParzialeEsiste` è falso mentre delle
      // date incomplete esistono, e dichiarare «piena» sarebbe il guasto
      // silenzioso che ADR-003 vieta.
      data-copertura={perimetro.verdetto === 'piena' ? 'piena' : 'parziale'}
    >
      {barraPerimetro}
      {barraScala}

      <div
        className="grafico-cornice"
        data-testid={zonaParzialeEsiste ? 'grafico-portafoglio-parziale' : 'grafico-portafoglio-piena'}
      >
        <span className="cartellino-finestra">
          Valore complessivo &middot; {definizione.etichetta.toLowerCase()}
        </span>

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
            {/* Campitura del tratto SENZA DATI IN ARCHIVIO (US-020): puntinata
                e in seppia, deliberatamente diversa dall'obliqua di sopra. Le
                due assenze non sono la stessa assenza — là l'archivio non
                possiede rilevazioni fra due punti pieni, qui non possiede
                proprio nulla, per nessun titolo — e i due rimedi sono opposti:
                una scala più stretta contro un aggiornamento dei prezzi. */}
            <pattern id={idFuoriArchivio} width="9" height="9" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.1" fill="var(--seppia)" opacity="0.28" />
            </pattern>
          </defs>

          {/* ---------- Rigatura di lettura ---------- */}
          <g className="rigatura-tracciato">
            {quoteY.slice(1, -1).map((quota) => (
              <line key={quota.y} x1={RIQUADRO.sinistra} y1={quota.y} x2={RIQUADRO.destra} y2={quota.y} />
            ))}
          </g>

          {/* =====================================================================
              DIMENSIONE I — IL TRATTO FUORI DALL'ARCHIVIO (US-020, criterio 5)
              La scala chiesta è più lunga della storia disponibile. L'asse NON
              si accorcia fino al primo dato: se lo facesse, i giorni d'archivio
              riempirebbero tutta la larghezza e la finestra sembrerebbe coperta
              per intero. Resta invece lungo quanto l'orizzonte chiesto, e il
              tratto scoperto è campito e dichiarato.
              ===================================================================== */}
          {larghezzaFuoriArchivio > 0.5 && inizioArchivio !== null && (
            <g data-testid="zona-fuori-archivio">
              <rect
                x={RIQUADRO.sinistra}
                y={RIQUADRO.alto}
                width={larghezzaFuoriArchivio}
                height={altezzaRiquadro}
                fill={`url(#${idFuoriArchivio})`}
              />
              <rect
                x={RIQUADRO.sinistra}
                y={RIQUADRO.alto}
                width={larghezzaFuoriArchivio}
                height={altezzaRiquadro}
                fill="none"
                stroke="var(--seppia)"
                strokeWidth={1.2}
                strokeDasharray="2 4"
                opacity={0.75}
              />
              {larghezzaFuoriArchivio >= LARGHEZZA_MINIMA_SCRITTA && (
                <g textAnchor="middle">
                  <text
                    className="dichiarazione-forte"
                    x={a1(RIQUADRO.sinistra + larghezzaFuoriArchivio / 2)}
                    y={RIQUADRO.alto + 18}
                    fill="var(--seppia)"
                  >
                    {conteggio(giorniFinestra - giorniCoperti)} GIORNI FUORI DALL&rsquo;ARCHIVIO
                  </text>
                  <text
                    className="dichiarazione-tenue"
                    x={a1(RIQUADRO.sinistra + larghezzaFuoriArchivio / 2)}
                    y={RIQUADRO.alto + 34}
                    fill="var(--seppia)"
                  >
                    i dati cominciano il {dataIstante(inizioArchivio)}
                  </text>
                </g>
              )}
              <line
                x1={xInizioArchivio}
                y1={RIQUADRO.alto}
                x2={xInizioArchivio}
                y2={RIQUADRO.basso}
                stroke="var(--seppia)"
                strokeWidth={1.4}
              />
            </g>
          )}

          {/* =====================================================================
              DIMENSIONE II — LA ZONA A PERIMETRO INCOMPLETO (criterio 6)
              Non è un intervallo senza prezzi: è un intervallo in cui non OGNI
              titolo detenuto ha un prezzo noto. La curva non ci entra mai —
              disegnarla coi soli titoli valorizzati mostrerebbe un portafoglio
              che sembra valere meno, ed è un dato falso, non un dato parziale.
              ===================================================================== */}
          {zonaParzialeEsiste && (
            <>
              <rect
                x={xInizioArchivio}
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
                x={xInizioArchivio}
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
                    x={a1(xInizioArchivio + larghezzaZona / 2)}
                    y={RIQUADRO.alto + 18}
                    textAnchor="middle"
                  >
                    {conteggio(giorniZona)} GIORNI A COPERTURA PARZIALE
                  </text>
                ) : (
                  <g textAnchor="middle">
                    <rect
                      className="riquadro-dichiarazione"
                      x={a1(xInizioArchivio + larghezzaZona / 2) - 210}
                      y={a1((RIQUADRO.alto + RIQUADRO.basso) / 2) - 30}
                      width={420}
                      height={48}
                    />
                    <text
                      className="dichiarazione-forte"
                      x={a1(xInizioArchivio + larghezzaZona / 2)}
                      y={a1((RIQUADRO.alto + RIQUADRO.basso) / 2) - 10}
                    >
                      VALORE COMPLESSIVO NON AFFERMABILE
                    </text>
                    <text
                      className="dichiarazione-tenue"
                      x={a1(xInizioArchivio + larghezzaZona / 2)}
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
          <text
            className="didascalia-asse"
            x={RIQUADRO.sinistra}
            y={RIQUADRO.basso + 45}
            data-testid="didascalia-ascissa"
          >
            GIORNI CIVILI &middot; {definizione.etichetta.toUpperCase()} &middot; SCALA ANCORATA A
            ZERO
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
          Finestra chiesta: <b>{etichettaInizio} &rarr; {etichettaFine}</b> &middot;{' '}
          {conteggio(giorniFinestra)} giorni civili
        </span>
        <span>
          Punti d&rsquo;evento in finestra: <b>{conteggio(punti.length)}</b> su{' '}
          {conteggio(puntiCompleti.length)} in archivio
        </span>
        <span>
          {zonaParzialeEsiste
            ? primaCoperturaPiena !== null
              ? <>Copertura piena dal <b>{etichettaConfine}</b></>
              : 'Copertura parziale su tutta la finestra'
            : 'Copertura piena su tutta la finestra'}
        </span>
      </p>

      {/* =====================================================================
          IL DOPPIO REGOLO (criteri 5 e 6)
          Le due dimensioni della copertura, misurate separatamente e con
          denominatori diversi. Un verdetto solo non direbbe quale delle due
          manca, e i rimedi sono opposti.
          ===================================================================== */}
      <DoppioRegolo
        tempo={misuraTempo}
        perimetro={misuraPerimetro}
        etichettaScala={definizione.etichetta}
      />

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
            Copertura parziale &middot; {etichettaPrimoPunto} &rarr;{' '}
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
            titolo per titolo di US&#8209;016.
          </span>
        </div>
      )}

      <p className="nota-sezione">
        La curva &egrave; una sola &mdash; il valore complessivo &mdash; perch&eacute; il prezzo
        unitario non ha significato per un portafoglio: il commutatore di vista della scheda titolo
        (US&#8209;039) qui non compare. Tutti i dati arrivano in <b>un solo giro di richieste</b> al
        server e la costruzione del grafico non genera <b>alcuna</b> richiesta alla fonte: il tracciato
        si compone dei soli fatti gi&agrave; in archivio &mdash; carichi, vendite e rilevazioni
        registrate. Cambiare scala &egrave; <em>ritagliare</em> quegli stessi fatti, mai{' '}
        <em>infittirli</em>: le cinque scale sono le stesse della scheda titolo, lette e non
        ricopiate.
      </p>
    </div>
  );
}
