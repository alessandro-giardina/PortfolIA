import { useId, useMemo, useState, type ReactNode } from 'react';
import type {
  CaricoValore,
  Copertura,
  FinestraTemporale,
  GradinoCarico,
  OriginePunto,
  PuntoSerie,
  PuntoValore,
  RilevazioneSerie,
  ScalaTemporale,
  VenditaValore,
  VistaGrafico,
} from '@portfolia/shared';
import {
  SCALA_PREDEFINITA,
  SCALE_TEMPORALI,
  VISTA_PREDEFINITA,
  VISTE_GRAFICO,
  calcolaFinestra,
  calcolaScalaSerie,
  componiSerieTitolo,
  componiSerieValore,
  definizioneScala,
  definizioneVista,
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
 * Il contesto che il grafico consegna a chi disegna sotto il tracciato (US-038).
 *
 * Sono i quattro fatti della **finestra**, e nient'altro. Vive qui e non nel
 * componente che lo consuma perché è il contratto di una prop *di questo*
 * componente: dichiararlo altrove farebbe importare al grafico il modulo che
 * doveva restare libero di ignorare.
 */
export interface ContestoSottoIlGrafico {
  /**
   * I punti **già ritagliati** sulla finestra: `ritagliaSerie(...).punti`.
   *
   * Sono sempre quelli della serie del **prezzo**, in entrambe le viste (US-039).
   * La render prop alimenta `calcolaVariazionePeriodo`, che misura il prezzo
   * unitario fra due rilevazioni e si dichiara tale a schermo («sul prezzo
   * unitario · 1 quota»): passarle i punti della serie del valore ne cambierebbe
   * silenziosamente il significato, e la bilancia mostrerebbe una differenza di
   * controvalore sotto un'etichetta che promette un prezzo.
   */
  punti: readonly PuntoSerie[];
  /** La finestra della scala scelta. */
  finestra: FinestraTemporale;
  /** La scala attualmente scelta dall'utente. */
  scala: ScalaTemporale;
  /** Quanto la finestra è coperta dai dati d'archivio. */
  copertura: Copertura;
}

/**
 * Props del grafico dell'andamento del prezzo del titolo (US-036, FR-015).
 *
 * Tutto arriva da chi monta il componente: **nessuna richiesta di rete** parte da
 * qui, e nel file non esiste codice che ne possa fare una. I due elenchi hanno i
 * tipi ritagliati di `@portfolia/shared`, quindi `detail.loads` e
 * `detail.priceHistory` si passano così come sono — `Position` soddisfa
 * `CaricoValore` e `PriceObservation` soddisfa `RilevazioneSerie`.
 */
export interface GraficoTitoloProps {
  /**
   * I carichi registrati per il titolo: si passa `detail.loads`.
   *
   * Da US-039 il tipo comprende anche `quantity`, perché la vista del valore
   * della posizione ha bisogno di sapere **quante quote** erano detenute a
   * ciascuna data. `CaricoValore` resta un `Pick` su `Position`: il grafico non
   * legge nient'altro del carico.
   */
  loads: readonly CaricoValore[];
  /**
   * Le vendite registrate per il titolo (US-042, US-045): si passa
   * `detail.sales`.
   *
   * Come `loads`, è un `Pick` sul tipo di dominio — qui `Sale` — e non
   * l'oggetto intero: il grafico ha bisogno solo di quando e di quante quote,
   * non degli altri campi della vendita (prezzo, lotti LIFO, …).
   */
  sales: readonly VenditaValore[];
  /** Le rilevazioni già in archivio (US-009): si passa `detail.priceHistory`. */
  observations: readonly RilevazioneSerie[];
  /**
   * Prezzo medio ponderato di carico **così come il server lo calcola**
   * (`detail.avgLoadPrice`). Non viene mai ricalcolato qui: due letture dello
   * stesso fatto potrebbero divergere, e una delle due sarebbe falsa.
   *
   * `null` da US-042: a quantità residua nulla — titolo interamente venduto — non
   * esiste un residuo su cui calcolare una media, e la riga d'ottone non ha un
   * livello dove stare. Il ramo «prezzo medio non disponibile» qui sotto esisteva
   * già per la stessa ragione ed è quello che accoglie il caso: `null` non aggiunge
   * un comportamento, dà un nome al comportamento che c'era.
   */
  avgLoadPrice: number | null;
  /** Simbolo della valuta di denominazione; l'euro è la valuta del registro. */
  simboloValuta?: string;
  /**
   * Istante corrente, estremo destro dell'asse dei tempi. Arriva come prop —
   * come già fa il server con `now` — così il grafico è riproducibile in un test
   * invece di dipendere dall'orologio della macchina.
   */
  now?: number | Date;
  /**
   * Che cosa disegnare **sotto il tracciato**, dentro la stessa sezione (US-038).
   *
   * È una prop di *rendering* e non un elenco di campi perché ciò che va sotto
   * il grafico — le due metriche del titolo — ha bisogno di fatti della
   * **posizione** (differenza, prezzo medio, carichi) che il grafico non
   * possiede e non deve possedere; e insieme di fatti della **finestra** (i
   * punti ritagliati, la scala scelta) che vivono qui e che US-037 ha deciso, con
   * motivazione, di non sollevare nella scheda. La prop cuce i due lati senza
   * far scendere sei campi di posizione dentro un componente che non li usa.
   *
   * Viene invocata in **tutti e tre** i rami d'uscita — serie vuota, copertura
   * assente, disegno — perché il P&L non dipende dalla copertura: dimenticarne
   * uno lo farebbe sparire proprio nelle finestre in cui l'utente si sta
   * chiedendo se ha perso denaro.
   */
  sottoIlGrafico?: (contesto: ContestoSottoIlGrafico) => ReactNode;
}

/** Quanti pixel di tela deve essere larga una campitura perché ci stia dentro una scritta. */
const LARGHEZZA_MINIMA_SCRITTA = 150;

/** Larghezza in unità di tela dell'etichetta che accompagna il punto unico. */
const LARGHEZZA_ETICHETTA_PUNTO = 290;

/** Quanti pixel di tela deve essere larga una quota perché la sua etichetta non si sovrapponga. */
const LARGHEZZA_MINIMA_QUOTA = 110;

/** Come si chiama un'origine d'archivio dentro una frase. */
const NOME_ORIGINE: Record<OriginePunto, string> = {
  carico: 'prezzo di carico',
  vendita: 'prezzo di vendita',
  rilevazione: 'rilevazione registrata',
};

/**
 * Gli stessi due fatti letti sull'ordinata del controvalore (US-039).
 *
 * Non è un sinonimo di comodo: nella vista del valore il punto del carico non
 * *è* un prezzo di carico, è il controvalore della posizione calcolato a quel
 * prezzo. Ripetere «prezzo di carico» accanto a una cifra da 14.240 euro
 * scriverebbe a schermo un dato falso.
 */
const NOME_ORIGINE_VALORE: Record<OriginePunto, string> = {
  carico: 'controvalore al prezzo di carico',
  vendita: 'controvalore al prezzo di vendita',
  rilevazione: 'controvalore alla rilevazione registrata',
};

/** Altezza in unità di tela della fascia della quantità detenuta (solo vista valore). */
const ALTEZZA_FASCIA = 48;

/** Larghezza in unità di tela del cartellino «capitale versato» di un gradino. */
const LARGHEZZA_CARTELLINO_GRADINO = 250;

/** Distanza fra il gradino e la sua quota di misura. */
const SCOSTAMENTO_QUOTA_GRADINO = 36;

/**
 * Il modificatore di classe che il bottone attivo porta secondo il verdetto di
 * copertura. Il colore non decora: ripete quello che il riquadro sotto già dice
 * a parole, e una copertura piena non ha nulla da aggiungere.
 */
const MODIFICATORE_COPERTURA: Record<Copertura, string> = {
  piena: '',
  parziale: 'parziale',
  assente: 'senza-dati',
};

/** Lo stesso nome a inizio frase, per il `<title>` di ciascun punto. */
const TITOLO_ORIGINE: Record<OriginePunto, string> = {
  carico: 'Prezzo di carico',
  vendita: 'Prezzo di vendita',
  rilevazione: 'Rilevazione registrata',
};

/** E lo stesso, sull'ordinata del controvalore. */
const TITOLO_ORIGINE_VALORE: Record<OriginePunto, string> = {
  carico: 'Controvalore al prezzo di carico',
  vendita: 'Controvalore al prezzo di vendita',
  rilevazione: 'Controvalore alla rilevazione registrata',
};

/**
 * I campi che solo un punto della serie del valore possiede.
 *
 * Il controllo è su `quantita` e non su un cast: `PuntoValore` estende
 * `PuntoSerie`, quindi un cast passerebbe il typecheck e restituirebbe
 * `undefined` a runtime sui punti della serie del prezzo.
 */
function comeValore(punto: PuntoSerie): PuntoValore | null {
  return 'quantita' in punto ? (punto as PuntoValore) : null;
}

/* `prezzo` — il prezzo unitario a quattro decimali — arriva da `Foglio.tsx`:
   è lo stesso formattatore della tabella dei carichi e del riquadro delle
   metriche (US-038), e tre copie della stessa regola potrebbero divergere. */

/** Un intervallo dell'asse dei tempi in cui l'archivio non possiede alcun prezzo. */
interface Vuoto {
  /**
   * Chiave di lista, distinta dalle coordinate: due vuoti consecutivi possono
   * cadere sulle stesse ascisse arrotondate — bastano rilevazioni ravvicinate su
   * un asse pluriennale — e chiavi identiche farebbero collassare due elementi
   * in uno.
   */
  id: number;
  /** Ascissa di tela d'inizio. */
  da: number;
  /** Ascissa di tela di fine. */
  a: number;
  /** Giorni civili che l'intervallo misura. */
  giorni: number;
}

/**
 * Grafico dell'andamento del prezzo unitario di un titolo (US-036, FR-015, ADR-008).
 *
 * L'SVG è scritto a mano, come nei mockup `docs/mockups/US-036/`: nessuna
 * libreria di grafici entra nel progetto, nessuno script e nessuna risorsa
 * remota. I colori non sono letterali nel markup ma classi definite in
 * `ledger.css`, che leggono le variabili del registro.
 *
 * Il componente **non calcola il dominio**: la composizione della serie e la
 * scala vivono in `shared/domain/serieTitolo.ts` (`componiSerieTitolo`,
 * `calcolaScalaSerie`), pure e verificate, e sono le uniche a decidere gli
 * estremi degli assi. Qui si proietta soltanto.
 *
 * Due scelte sono deliberate e non vanno "sistemate":
 *
 * - **Nessun punto sintetico a oggi.** `currentPrice` non entra nella serie: un
 *   prezzo timbrato a un istante in cui non è stato osservato sarebbe
 *   indistinguibile da una rilevazione vera. L'asse arriva a oggi, e il tratto
 *   finale senza dati resta campito e dichiarato.
 * - **Nessun segmento continuo.** Ogni tratto fra due punti è tratteggiato
 *   perché fra quei due istanti l'archivio non possiede alcun prezzo: il
 *   tratteggio è una dichiarazione, non uno stile (ADR-003).
 */
export default function GraficoTitolo({
  loads,
  sales,
  observations,
  avgLoadPrice,
  simboloValuta = '€',
  now,
  sottoIlGrafico,
}: GraficoTitoloProps) {
  /**
   * Identificativo unico della campitura: due grafici nella stessa pagina non si
   * rubano il `pattern`. `useId` produce un valore con caratteri di
   * punteggiatura, qui rimossi perché l'id finisce dentro un `url(#…)`.
   */
  const idCampitura = `campitura-vuoto-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  /**
   * La scala temporale scelta (US-037), con «tutto lo storico» come predefinita
   * (criterio 2).
   *
   * Lo stato vive **qui** e non nella scheda: il grafico è già un componente a
   * sé, e sollevarlo obbligherebbe `SchedaTitolo` a conoscere un dettaglio che
   * non la riguarda. L'azzeramento all'apertura di un altro titolo non passa
   * quindi da un effetto ma dal montaggio: `SchedaTitolo` monta il grafico con
   * `key={detail.isin}`, e cambiare chiave rimonta il componente riportando la
   * scala al valore iniziale — vero per costruzione invece che per un effetto da
   * ricordarsi.
   */
  const [scalaScelta, setScalaScelta] = useState<ScalaTemporale>(SCALA_PREDEFINITA);

  /**
   * Che cosa la curva misura (US-039), col prezzo unitario come vista
   * predefinita (criterio 2).
   *
   * Lo stato vive **accanto** a quello della scala e non dentro di esso, e da
   * questo discendono per costruzione due criteri: la vista predefinita è il
   * prezzo perché lo stato nasce da `VISTA_PREDEFINITA`, e all'apertura di un
   * altro titolo si azzera perché `SchedaTitolo` monta il grafico con
   * `key={detail.isin}`. Il criterio 1 — commutare la vista non muove la scala —
   * è vero perché i due stati sono indipendenti e nessuno dei due scrive
   * sull'altro.
   */
  const [vistaScelta, setVistaScelta] = useState<VistaGrafico>(VISTA_PREDEFINITA);
  const vistaValore = vistaScelta === 'valore';
  const definizioneDellaVista = definizioneVista(vistaScelta);

  const istanteOra = useMemo(
    () => (now === undefined ? Date.now() : now instanceof Date ? now.getTime() : now),
    [now],
  );

  /** La serie **intera**, prima di qualunque ritaglio. */
  const serie = useMemo<PuntoSerie[]>(
    () => componiSerieTitolo({ loads, observations }),
    [loads, observations],
  );

  /**
   * La finestra della scala scelta e il ritaglio della serie su di essa.
   *
   * Cambiare scala è **filtrare un array già in memoria**: non parte alcuna
   * richiesta, non si aggiunge alcun punto e non si infittisce nulla. In questo
   * file non esiste codice che possa contattare la rete, e questa è la ragione
   * per cui il criterio «il grafico si aggiorna» si soddisfa senza tornare al
   * server.
   */
  const finestra = useMemo(
    () => calcolaFinestra({ scala: scalaScelta, punti: serie, now: istanteOra }),
    [scalaScelta, serie, istanteOra],
  );

  /**
   * La serie del **valore della posizione**, rimisurata dalla serie del prezzo e
   * non ricomposta da capo (US-039). Si calcola sempre, anche nella vista del
   * prezzo: costa una passata su un array già in memoria, e serve comunque a
   * sapere se il commutatore ha qualcosa da mostrare.
   *
   * Riceve la serie **intera**: il ritaglio si applica dopo. Comporre sui soli
   * carichi caduti in finestra rifarebbe il difetto della retroattività in forma
   * ritagliata — una finestra che comincia dopo il primo carico ne dimenticherebbe
   * le quote.
   */
  const serieValore = useMemo(
    () => componiSerieValore({ punti: serie, loads, sales }),
    [serie, loads, sales],
  );

  /**
   * La vista del valore è stata scelta ma non ha nulla da tracciare: nessun
   * carico, o nessun punto dalla prima detenzione in poi. Non è la «finestra
   * priva di dati» di US-037 — là il dato esiste e cade fuori dall'intervallo, e
   * il rimedio è una scala più ampia; qui la serie non esiste per **nessun**
   * intervallo, e il rimedio è un carico.
   */
  const vistaSenzaSerie = vistaValore && serieValore.punti.length === 0;

  /**
   * Il ritaglio della serie del **prezzo**: è quello che `sottoIlGrafico` riceve
   * in entrambe le viste, perché le due metriche di US-038 misurano un prezzo
   * unitario e lo dichiarano a schermo.
   */
  const ritaglioPrezzo = useMemo(
    () => ritagliaSerie({ punti: serie, finestra }),
    [serie, finestra],
  );

  const ritaglioValore = useMemo(
    () => ritagliaSerie({ punti: serieValore.punti, finestra }),
    [serieValore, finestra],
  );

  const ritaglio: {
    punti: PuntoSerie[];
    copertura: Copertura;
    primoDatoDisponibile: number | null;
  } = vistaValore ? ritaglioValore : ritaglioPrezzo;

  /** I punti effettivamente disegnati: quelli che cadono nella finestra. */
  const punti = ritaglio.punti;

  /** Il contesto che la render prop riceve: sempre sul prezzo unitario. */
  const contestoSotto = {
    punti: ritaglioPrezzo.punti,
    finestra,
    scala: scalaScelta,
    copertura: ritaglioPrezzo.copertura,
  };

  const dominio = useMemo(
    () =>
      calcolaScalaSerie({
        punti,
        // Criterio 5 reso vero **nel dominio** e non solo nella resa: nella vista
        // del valore il prezzo medio non è «nascosto», è privo di posto dove
        // stare — un prezzo per quota non individua alcun livello su un'ordinata
        // di controvalori, e lasciarlo nel calcolo terrebbe la scala allargata
        // per accogliere una riga che nessuno disegna.
        prezzoMedio: vistaValore ? null : avgLoadPrice,
        now: istanteOra,
        finestra,
        // La grandezza assoluta si misura dalla sua base: tagliarla ingrandirebbe
        // di nascosto proprio il gradino che questa vista deve misurare.
        ancoraAZero: vistaValore,
      }),
    [punti, avgLoadPrice, istanteOra, finestra, vistaValore],
  );

  /**
   * La scala più stretta, fra quelle diverse da quella scelta, che conterrebbe
   * almeno un punto: serve solo allo stato «dato non disponibile», dove indicare
   * il rimedio vale più che ripetere il problema. È `null` quando non serve.
   */
  const scalaSuggerita = useMemo(() => {
    if (ritaglio.copertura !== 'assente') return null;
    return (
      SCALE_TEMPORALI.find(
        (candidata) =>
          candidata.id !== scalaScelta &&
          ritagliaSerie({
            punti: serie,
            finestra: calcolaFinestra({ scala: candidata.id, punti: serie, now: istanteOra }),
          }).punti.length > 0,
      ) ?? null
    );
  }, [ritaglio.copertura, scalaScelta, serie, istanteOra]);

  // Serie vuota: nessun carico e nessuna rilevazione. Si degrada a testo invece
  // di disegnare un riquadro vuoto, che si leggerebbe come un guasto. Il
  // selettore di scala non compare: senza un solo punto in archivio non c'è
  // orizzonte da scegliere, e cinque bottoni che non cambiano nulla sarebbero
  // una promessa di controllo che il dato non mantiene.
  if (serie.length === 0) {
    return (
      <div
        data-testid="grafico-titolo"
        data-punti={0}
        data-scala={scalaScelta}
        data-vista={vistaScelta}
        data-copertura="assente"
      >
        <div className="avviso-rado senza-andamento" data-testid="grafico-titolo-vuoto">
          <span>
            Nessun punto in archivio: senza carichi registrati e senza rilevazioni non c&rsquo;&egrave;
            alcun prezzo da tracciare. Il grafico compare col primo carico iscritto a registro.
          </span>
        </div>
        {/* Le metriche compaiono anche qui: il P&L non dipende dai punti in
            finestra, e farlo sparire dove il tracciato manca lo toglierebbe
            proprio a chi sta cercando di capire se ha perso denaro. */}
        {sottoIlGrafico?.(contestoSotto)}
        <p className="nota-sezione" data-testid="nota-grafico-titolo">
          Il tracciato si compone dei soli dati d&rsquo;archivio &mdash; prezzi di carico e rilevazioni
          registrate &mdash; e non ne inventa nessuno: a serie vuota corrisponde un grafico assente,
          dichiarato a parole invece che disegnato vuoto.
        </p>
      </div>
    );
  }

  const definizione = definizioneScala(scalaScelta);
  /** Vero quando la scala ritaglia davvero: «tutto lo storico» è il caso senza ritaglio. */
  const ritaglioAttivo = definizione.mesi !== null;
  const copertura = ritaglio.copertura;
  const giorniFinestra = giorniFra(finestra.da, finestra.a);

  /**
   * L'etichetta dell'estremo sinistro dell'asse.
   *
   * Con un ritaglio attivo `xMin` è un istante **reale** calcolato da «adesso»,
   * e va letto — come «oggi» — nel fuso di chi guarda: la deduzione per
   * coincidenza va quindi scavalcata, altrimenti un punto che casualmente cada
   * sull'estremo lo farebbe leggere come una mezzanotte UTC. Senza ritaglio
   * restano i tre casi di US-036, distinti perché `xMin` non ha sempre la stessa
   * natura.
   */
  let etichettaInizio: string;
  if (ritaglioAttivo) {
    // `calcolaFinestra` àncora l'inizio alla mezzanotte UTC del giorno civile,
    // esattamente come una `loadDate`: si legge quindi con la stessa regola dei
    // carichi (campi UTC) e non come un istante reale, che a ovest di Greenwich
    // farebbe scivolare l'etichetta al giorno prima.
    etichettaInizio = dataPunto({ at: dominio.xMin, origin: 'carico' });
  } else {
    const puntoDiXMin = punti.find((p) => p.at === dominio.xMin);
    if (puntoDiXMin !== undefined) {
      // Caso ordinario: l'estremo è un punto della serie e porta la sua origine.
      etichettaInizio = dataPunto(puntoDiXMin);
    } else if (dominio.xMin === istanteOra) {
      // Tutti i punti in data futura: `calcolaScalaSerie` ripiega su `now`, che è
      // un istante reale.
      etichettaInizio = dataIstante(dominio.xMin);
    } else {
      // Caso degenere del punto unico: l'estremo è il primo punto arretrato di un
      // giorno *esatto*, arretramento che non ne cambia la natura.
      etichettaInizio = dataPunto({ at: dominio.xMin, origin: punti[0]?.origin ?? 'rilevazione' });
    }
  }
  const etichettaFine = dataIstante(finestra.a);

  /**
   * La traversa delle cinque scale, sopra la cornice (mockup `docs/mockups/US-037/`).
   *
   * Sono bottoni veri — quindi attivabili da tastiera senza una riga di codice in
   * più — dentro un gruppo con etichetta, e `aria-pressed` dice quale è attivo.
   * Il colore del bottone attivo ripete il verdetto di copertura invece di
   * decorarlo: è la stessa cosa che il riquadro sotto già dichiara a parole.
   */
  /**
   * La traversa della **vista**, sopra quella della scala (mockup
   * `docs/mockups/US-039/`).
   *
   * Sta sopra perché la prima domanda contiene la seconda: si sceglie una
   * grandezza, poi la si guarda su una finestra. La meccanica dei bottoni è
   * quella della scala — sono comandi della stessa specie — e cambia solo il
   * sigillo del bottone scelto, perché il gruppo è un altro.
   *
   * Il bottone della vista **non si disabilita mai**, nemmeno quando la serie del
   * valore non esiste: un bottone spento non spiega perché è spento. Porta invece
   * il carminio, come quello della scala quando la finestra è priva di dati, e la
   * ragione sta scritta al posto del tracciato.
   */
  const barraVista = (
    <>
      <div
        className="barra-vista"
        role="group"
        aria-label="Che cosa mostra la curva"
        data-testid="vista-grafico"
      >
        <span className="et-vista">Che cosa mostra la curva</span>
        <div className="commutatore-vista">
          {VISTE_GRAFICO.map((candidata) => (
            <button
              key={candidata.id}
              type="button"
              data-testid={`vista-${candidata.id}`}
              aria-pressed={candidata.id === vistaScelta}
              className={
                candidata.id === vistaScelta
                  ? `attiva${vistaSenzaSerie ? ' senza-dati' : ''}`
                  : undefined
              }
              onClick={() => setVistaScelta(candidata.id)}
            >
              {candidata.etichetta}
              {candidata.id === VISTA_PREDEFINITA && (
                <span className="postilla-predefinita">predefinita</span>
              )}
            </button>
          ))}
        </div>
        <span
          className={`ordinata-attiva${vistaSenzaSerie ? ' senza-dati' : ''}`}
          data-testid="ordinata-attiva"
        >
          Ordinata:{' '}
          <b>{vistaSenzaSerie ? 'nessuna serie da rappresentare' : definizioneDellaVista.ordinata}</b>
        </span>
      </div>

      {/* Il sigillo scrive quello che i due colori suggeriscono: i comandi non si
          toccano. È il criterio 1 dichiarato a parole accanto al fatto che lo
          rende vero — i due stati sono indipendenti e nessuno scrive sull'altro. */}
      <p className="sigillo-indipendenza" data-testid="sigillo-indipendenza">
        <span className="graffa" aria-hidden="true">
          &#8214;
        </span>
        <span>
          Due comandi indipendenti: commutare la vista <b>non</b> tocca la scala scelta qui sotto,
          e cambiare scala non riporta la curva al prezzo. Nessuno dei due interroga la fonte
          &mdash; entrambi rileggono gli stessi punti d&rsquo;archivio.
        </span>
      </p>
    </>
  );

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
                ? `attiva${MODIFICATORE_COPERTURA[copertura] === '' ? '' : ` ${MODIFICATORE_COPERTURA[copertura]}`}`
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
        className={`finestra-attiva${copertura === 'piena' ? '' : ` ${copertura}`}`}
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

  // ─── US-039 · criterio 3 ───────────────────────────────────────────────────
  // «Una quantità che non esiste non è una quantità pari a zero.» Ogni punto
  // della serie del valore è `prezzo × quantità detenuta a quella data`: quando
  // il secondo fattore non esiste, il prodotto non vale zero — non è definito.
  // Al posto di una retta piatta appoggiata allo zero, che affermerebbe che la
  // posizione c'era e non valeva niente, compare la dichiarazione. Va prima del
  // ramo di US-037 perché quello spiegherebbe la cosa sbagliata: là il dato
  // esiste e cade fuori finestra, qui non esiste per nessuna finestra.
  if (vistaSenzaSerie) {
    const senzaCarichi = serieValore.ragioneVuota === 'senza-carichi';
    const ultimoArchivio = serie[serie.length - 1];

    return (
      <div
        data-testid="grafico-titolo"
        data-punti={0}
        data-scala={scalaScelta}
        data-vista={vistaScelta}
        data-copertura="assente"
      >
        {barraVista}
        {barraScala}

        <div className="dichiarazione-vuota" data-testid="vista-valore-non-disponibile">
          <p style={{ margin: 0 }}>
            <span className="timbro-grande">Dato non disponibile</span>
          </p>

          <p className="riga-intervallo" data-testid="ragione-vista-valore">
            <span className="et-int">Quantit&agrave; detenuta a ciascuna data</span>
            {senzaCarichi ? (
              <>
                nessun carico registrato &nbsp;&middot;&nbsp; quantit&agrave;{' '}
                <b>inesistente</b>, non pari a zero
              </>
            ) : (
              <>
                {conteggio(serieValore.puntiEsclusi)}{' '}
                {serieValore.puntiEsclusi === 1 ? 'punto anteriore' : 'punti anteriori'} al primo
                carico &nbsp;&middot;&nbsp; nessun punto <b>dalla prima detenzione in poi</b>
              </>
            )}
          </p>

          <p className="spiegazione">
            Il valore della posizione &egrave; <b>prezzo &times; quantit&agrave;</b>.{' '}
            {senzaCarichi ? (
              <>
                Di questo titolo l&rsquo;archivio conosce {conteggio(serie.length)}{' '}
                {serie.length === 1 ? 'prezzo' : 'prezzi'}, ma non conosce nessuna
                quantit&agrave;: non risulta caricata una sola quota. Non c&rsquo;&egrave; dunque
                nulla da tracciare &mdash; e in particolare non c&rsquo;&egrave; una posizione che
                valga zero euro.
              </>
            ) : (
              <>
                I prezzi che l&rsquo;archivio possiede sono tutti anteriori al primo carico: a
                quelle date non possedevi nulla, e moltiplicarli per zero affermerebbe una
                posizione che allora non esisteva.
              </>
            )}
          </p>

          <p className="dove-esiste" data-testid="dove-esiste-valore">
            <span className="et">Dove il dato esiste davvero</span>
            <span>
              i prezzi sono al loro posto &mdash; l&rsquo;ultimo &egrave; del{' '}
              <b>{dataPunto(ultimoArchivio)}</b> ({simboloValuta} {prezzo(ultimoArchivio.price)},{' '}
              {NOME_ORIGINE[ultimoArchivio.origin]}): la vista{' '}
              <span className="tasto-citato">{VISTE_GRAFICO[0].etichetta}</span> li traccia tutti.
              Il comando resta <b>attivo e selezionabile</b>: un bottone spento non spiegherebbe
              perch&eacute; &egrave; spento.
            </span>
          </p>
        </div>

        {/* Stessa ragione degli altri due rami: il P&L della posizione non
            dipende da che cosa la curva stia misurando. */}
        {sottoIlGrafico?.(contestoSotto)}

        <p className="nota-sezione" data-testid="nota-grafico-titolo">
          Nessuna scala pu&ograve; produrre una serie che non esiste: cambiare finestra qui sopra
          non far&agrave; comparire un tracciato, perch&eacute; ci&ograve; che manca non &egrave;
          l&rsquo;intervallo ma il <b>secondo fattore</b> del prodotto. La vista del prezzo
          unitario resta piena: il prezzo di una quota esiste anche prima che tu la compri.
        </p>
      </div>
    );
  }

  // ─── Criterio 4 · ADR-003 ──────────────────────────────────────────────────
  // Finestra senza alcun punto: al posto della cornice compare una
  // dichiarazione. Non si disegna nemmeno la sola riga del prezzo medio — una
  // cornice con dentro una riga si legge come un grafico, e sarebbe un grafico
  // che non mostra nulla. E l'ultimo prezzo noto **non** viene portato dentro la
  // finestra: sarebbe un valore timbrato a un istante in cui non è stato
  // osservato.
  if (copertura === 'assente') {
    const ultimoArchivio = serie[serie.length - 1];
    const anteriore = ultimoArchivio.at < finestra.da;
    const distanza = anteriore
      ? giorniFra(ultimoArchivio.at, finestra.da)
      : giorniFra(finestra.a, ultimoArchivio.at);

    return (
      <div
        data-testid="grafico-titolo"
        data-punti={0}
        data-scala={scalaScelta}
        data-vista={vistaScelta}
        data-copertura="assente"
      >
        {barraVista}
        {barraScala}

        <div className="dichiarazione-vuota" data-testid="dato-non-disponibile">
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
            In questa finestra l&rsquo;archivio non possiede <b>alcun</b> prezzo di questo titolo:
            n&eacute; carichi, n&eacute; rilevazioni. Non &egrave; un guasto della fonte n&eacute; un
            errore di lettura &mdash; &egrave; assenza di dati, e come tale viene dichiarata.
          </p>

          <p className="dove-esiste" data-testid="dove-esiste">
            <span className="et">Dove il dato esiste davvero</span>
            <span>
              il punto pi&ugrave; recente in archivio &egrave; del <b>{dataPunto(ultimoArchivio)}</b> (
              {simboloValuta} {prezzo(ultimoArchivio.price)}, {NOME_ORIGINE[ultimoArchivio.origin]})
              &mdash; <b>fuori da questa finestra</b>, {conteggio(distanza)}{' '}
              {distanza === 1 ? 'giorno' : 'giorni'}{' '}
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
              <b>{dataPunto(serie[0])}</b> a oggi.
            </p>
          )}
        </div>

        {/* Stessa ragione del ramo a serie vuota: la finestra è priva di punti,
            ma il P&L della posizione non lo è. */}
        {sottoIlGrafico?.(contestoSotto)}

        <div className="avviso-rado senza-trascinamento" data-testid="avviso-grafico-titolo">
          <span>
            Il prezzo del <b>{dataPunto(ultimoArchivio)}</b> resta dov&rsquo;&egrave;: PortfolIA non lo
            prolunga fino a oggi, non lo ripete come ultimo valore noto e non traccia una retta
            piatta al suo livello. Portarlo dentro una finestra che non lo contiene significherebbe
            affermare un prezzo mai osservato: la finestra resta perci&ograve; senza tracciato
            (ADR-003).
          </span>
        </div>

        <p className="nota-sezione" data-testid="nota-grafico-titolo">
          Cambiare scala &egrave; <em>ritagliare</em> la finestra, mai <em>infittire</em>{' '}
          l&rsquo;archivio: la scelta non interroga la fonte e non aggiunge punti. Dove
          l&rsquo;archivio tace, il grafico tace con lui e lo dichiara.
        </p>
      </div>
    );
  }

  // ─── Proiezione ────────────────────────────────────────────────────────────
  // Le ampiezze arrivano da `calcolaScalaSerie`, che le garantisce finite e non
  // nulle: nessun min/max viene ricalcolato qui, quindi nessuna coordinata può
  // diventare NaN per un dominio degenere ricostruito male.
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

  const primoPunto = punti[0];
  const ultimoPunto = punti[punti.length - 1];

  /**
   * Come si nomina un'origine d'archivio **su questa ordinata**: il punto del
   * carico, letto sul controvalore, non *è* un prezzo di carico.
   */
  const nomeOrigine = vistaValore ? NOME_ORIGINE_VALORE : NOME_ORIGINE;
  const titoloOrigine = vistaValore ? TITOLO_ORIGINE_VALORE : TITOLO_ORIGINE;

  /**
   * Con quanti decimali si scrive una cifra dell'ordinata: quattro per il prezzo
   * di una quota (dove il quarto decimale è denaro), due per un controvalore —
   * gli stessi due della casella «Differenza» e del P&L.
   */
  const cifra = vistaValore ? importo : prezzo;

  // Il capo basso di un gradino porta origine `carico`, ma non è un carico in
  // più: è lo stesso carico letto con la quantità precedente. Contarlo
  // raddoppierebbe in legenda i rombi che il disegno mostra.
  const numeroCarichi = punti.filter(
    (p) => p.origin === 'carico' && comeValore(p)?.capo !== 'ante',
  ).length;
  const numeroRilevazioni = punti.filter((p) => p.origin === 'rilevazione').length;

  const centroX = a1((RIQUADRO.sinistra + RIQUADRO.destra) / 2);
  // Con un ritaglio attivo l'estremo destro della finestra **è** «adesso», quindi
  // la verticale di oggi cade sul bordo del riquadro; senza ritaglio resta dove
  // US-036 la mette.
  const xOggi = a1(proiettaX(Math.min(istanteOra, dominio.xMax)));
  const xUltimo = a1(proiettaX(ultimoPunto.at));
  const xPrimo = a1(proiettaX(primoPunto.at));

  const giorniScoperti = giorniFra(ultimoPunto.at, istanteOra);

  /**
   * Il tratto iniziale scoperto: dall'inizio della finestra al primo punto
   * visibile l'archivio non possiede alcun prezzo.
   *
   * A copertura `parziale` è il criterio 5 in forma di disegno — l'asse copre
   * **davvero** l'orizzonte chiesto e il tratto senza dati resta campito, invece
   * di far partire l'asse dal primo dato e riempire la larghezza disponibile
   * lasciando intendere una copertura piena. A copertura `piena` è un vuoto come
   * gli altri: campito allo stesso modo, ma senza dichiarazione, perché lì la
   * storia comincia prima della finestra.
   */
  const larghezzaIniziale = a1(xPrimo - RIQUADRO.sinistra);
  const trattoInizialeScoperto = larghezzaIniziale > 0.5;
  const giorniInizialiScoperti = giorniFra(dominio.xMin, primoPunto.at);

  /**
   * Il prezzo medio si disegna solo se è un numero: senza di esso non si può
   * collocare una riga, e una riga collocata a caso sarebbe un dato inventato.
   */
  // Criterio 5: nella vista del valore la riga non è «nascosta», è priva di posto
  // dove stare — un prezzo *per quota* non individua alcun livello su
  // un'ordinata di controvalori. Il dominio già la esclude (`prezzoMedio: null`),
  // e qui il disegno la segue invece di collocarla dove il dominio non l'attende.
  // Il medio *disegnabile* e non un booleano: il valore stesso, oppure `null`.
  // Un booleano direbbe la stessa cosa al lettore e nulla al compilatore, che poi
  // non saprebbe che dentro il ramo il prezzo esiste.
  const medioDisegnabile =
    !vistaValore && avgLoadPrice !== null && Number.isFinite(avgLoadPrice) ? avgLoadPrice : null;
  // `0` come ordinata di ripiego non è un dato: è la coordinata di una riga che in
  // questo ramo non viene disegnata, e il controllo `medioDisegnabile !== null` è
  // la guardia che lo garantisce in ogni punto di resa.
  const yMedio = medioDisegnabile !== null ? a1(proiettaY(medioDisegnabile)) : 0;
  // L'etichetta sta sopra la riga, salvo quando la riga è troppo in alto e la
  // scritta uscirebbe dal riquadro.
  const yEtichettaMedia = yMedio - 6 < RIQUADRO.alto + 12 ? yMedio + 15 : yMedio - 6;

  /** Le cinque quote della scala dei prezzi: estremi compresi, così min e max si leggono. */
  const quoteY = [0, 1, 2, 3, 4].map((i) => {
    const valore = dominio.yMax - (i / 4) * ampiezzaY;
    return { valore, y: a1(proiettaY(valore)) };
  });

  /** I segmenti fra punti consecutivi. */
  const segmenti = punti.slice(0, -1).map((da, i) => ({ da, a: punti[i + 1] }));

  /**
   * I due capi di uno stesso gradino, riconosciuti dal gradino che condividono e
   * non dall'istante: due carichi nello stesso giorno producono anch'essi due
   * punti sullo stesso `at`, ma quello è un salto di prezzo — non un gradino di
   * quantità — e disegnarlo pieno direbbe il falso.
   */
  const capiDelloStessoGradino = (da: PuntoSerie, a: PuntoSerie): boolean => {
    const primo = comeValore(da);
    const secondo = comeValore(a);
    return (
      primo !== null &&
      secondo !== null &&
      primo.gradino !== null &&
      primo.gradino === secondo.gradino &&
      primo.capo === 'ante' &&
      secondo.capo === 'post'
    );
  };

  /**
   * Il tratto verticale del gradino è **pieno**, ed è l'unico dell'intero
   * disegno. Il tratteggio di US-036 dichiara che *fra due punti l'archivio non
   * possiede alcun prezzo*; fra i due capi di un gradino non passa un solo
   * giorno, quindi non c'è nulla che l'archivio ignori e il tratteggio direbbe il
   * falso.
   */
  const segmentiGradino = segmenti.filter(({ da, a }) => capiDelloStessoGradino(da, a));

  /** Tutti gli altri: tratteggiati, mai continui. */
  const segmentiTratteggiati = segmenti.filter(({ da, a }) => !capiDelloStessoGradino(da, a));

  /**
   * I gradini che cadono davvero nella finestra: si riconoscono dal capo alto
   * presente fra i punti ritagliati, non dal solo istante — una finestra che
   * tagliasse a metà un gradino non ne dichiarerebbe la cifra sotto un disegno
   * che non la mostra.
   */
  const gradiniVisibili: GradinoCarico[] = vistaValore
    ? serieValore.gradini.filter((gradino) =>
        punti.some((p) => {
          const valore = comeValore(p);
          return valore?.gradino === gradino && valore.capo === 'post';
        }),
      )
    : [];

  /**
   * Il tratto finale scoperto: dall'ultimo punto a oggi non esiste alcun dato, e
   * a differenza dei vuoti interni non ha nemmeno un punto a destra che lo
   * chiuda. È l'unico intervallo campito, perché è l'unico che altrimenti si
   * leggerebbe come «il tracciato finisce qui».
   */
  const larghezzaFinale = a1(xOggi - xUltimo);
  const trattoFinaleScoperto = larghezzaFinale > 0.5;

  /** Le quote dei vuoti sotto l'asse: un intervallo per ogni tratto senza dati. */
  const vuoti: Vuoto[] = [];
  if (trattoInizialeScoperto) {
    vuoti.push({
      id: vuoti.length,
      da: RIQUADRO.sinistra,
      a: xPrimo,
      giorni: giorniInizialiScoperti,
    });
  }
  // I capi di un gradino non racchiudono alcun giorno: una quota di «0 giorni
  // senza dati» misurerebbe un vuoto che non esiste.
  for (const { da, a } of segmentiTratteggiati) {
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
   * La fascia a gradini della **quantità detenuta**, sotto l'asse dei tempi: è
   * il criterio 3 in forma di disegno, cioè il secondo fattore del prodotto reso
   * visibile. Il salto della fascia cade sullo stesso istante del salto della
   * curva, ed è quello che spiega l'altro.
   *
   * Si costruisce dai soli capi *alti*: il capo basso di un gradino porta ancora
   * la quantità precedente e chiuderebbe la fascia un punto troppo tardi.
   */
  interface Fascia {
    id: number;
    da: number;
    a: number;
    quantita: number;
  }
  const fasce: Fascia[] = [];
  if (vistaValore) {
    let corrente: Fascia | null = null;
    for (const punto of punti) {
      const valore = comeValore(punto);
      if (valore === null || valore.capo === 'ante') continue;
      const x = a1(proiettaX(punto.at));
      if (corrente === null) {
        corrente = { id: 0, da: x, a: x, quantita: valore.quantita };
      } else if (valore.quantita !== corrente.quantita) {
        corrente.a = x;
        fasce.push(corrente);
        corrente = { id: fasce.length, da: x, a: x, quantita: valore.quantita };
      }
    }
    if (corrente !== null) {
      // L'ultima fascia arriva a oggi: la quantità detenuta non finisce con
      // l'ultimo prezzo osservato, e troncarla lì suggerirebbe una posizione
      // chiusa.
      corrente.a = xOggi;
      fasce.push(corrente);
    }
  }

  /**
   * L'altezza della tela: la vista del valore ne chiede un tratto in più, sotto
   * l'asse dei tempi, per la fascia della quantità. Il `viewBox` cresce e il
   * riquadro del tracciato resta dov'è — le coordinate di US-036 non si spostano
   * di un'unità.
   */
  const altezzaTela = TELA.altezza + (vistaValore && fasce.length > 0 ? ALTEZZA_FASCIA : 0);

  /**
   * La scala scelta entra nella descrizione parlata: chi legge con uno screen
   * reader deve sapere *quale* finestra sta ascoltando, altrimenti due ritagli
   * diversi suonerebbero come lo stesso grafico. Da US-039 la precede la vista:
   * due ordinate diverse sulla stessa finestra suonerebbero altrimenti identiche.
   */
  const premessaVista = `Vista «${definizioneDellaVista.etichetta.toLowerCase()}»: l'ordinata porta il ${definizioneDellaVista.ordinata}. `;
  const premessaScala = `Scala «${definizione.etichetta.toLowerCase()}», finestra dal ${etichettaInizio} al ${etichettaFine}. `;

  /**
   * Perché il tratto iniziale della finestra è scoperto — e sono **due** ragioni
   * diverse, non una scritta due volte.
   *
   * Nella vista del prezzo l'archivio tace: prima di quella data PortfolIA non
   * possedeva alcun prezzo (ADR-008). Nella vista del valore la serie comincia
   * per costruzione al primo carico, quindi lo scoperto iniziale non è silenzio
   * d'archivio ma **assenza di posizione**: i prezzi di quei giorni esistono
   * eccome — la dichiarazione dei punti esclusi, poche righe più sotto, li conta
   * uno per uno — e attribuirli a un archivio muto contraddirebbe a schermo ciò
   * che quella dichiarazione afferma.
   */
  const scopertoPerNonDetenzione = vistaValore;

  const dichiarazioneCopertura =
    copertura === 'parziale'
      ? scopertoPerNonDetenzione
        ? ` La finestra chiesta comincia prima della tua prima detenzione: la posizione esiste dal ${dataPunto(primoPunto)}, e i ${conteggio(giorniInizialiScoperti)} giorni civili precedenti restano scoperti perché a quelle date non possedevi nulla — l'asse li mostra vuoti invece di appiattirli a zero. I prezzi di quei giorni, però, esistono: la vista del prezzo unitario li traccia tutti.`
        : ` L'orizzonte chiesto supera la storia disponibile: i dati cominciano il ${dataPunto(primoPunto)}, e i ${conteggio(giorniInizialiScoperti)} giorni civili precedenti restano scoperti — l'asse li mostra vuoti invece di accorciarsi.`
      : '';

  /**
   * Il gradino entra nella descrizione parlata con la sua cifra: è il fatto
   * centrale della vista, e chi ascolta non ha il cartellino sotto gli occhi.
   */
  const dichiarazioneGradini =
    gradiniVisibili.length === 0
      ? ''
      : ` ${conteggio(gradiniVisibili.length)} ${gradiniVisibili.length === 1 ? 'gradino verticale' : 'gradini verticali'} da nuovo carico: ` +
        gradiniVisibili
          .map(
            (gradino) =>
              `il ${dataPunto({ at: gradino.at, origin: 'carico' })} la posizione passa da ${conteggio(gradino.quantitaPrima)} a ${conteggio(gradino.quantitaDopo)} quote e il controvalore da ${simboloValuta} ${importo(gradino.valorePrima)} a ${simboloValuta} ${importo(gradino.valoreDopo)}, cioè ${simboloValuta} ${importo(gradino.capitaleVersato)} di capitale versato — denaro entrato, non rendimento`,
          )
          .join('; ') +
        '.';

  const dichiarazioneEsclusi =
    vistaValore && serieValore.puntiEsclusi > 0
      ? ` ${conteggio(serieValore.puntiEsclusi)} ${serieValore.puntiEsclusi === 1 ? 'punto d’archivio è anteriore' : 'punti d’archivio sono anteriori'} al primo carico e ${serieValore.puntiEsclusi === 1 ? 'resta escluso' : 'restano esclusi'}: a quelle date non possedevi nulla, e portarli a zero affermerebbe una posizione che non esisteva.`
      : '';

  const descrizione =
    premessaVista +
    premessaScala +
    (punti.length === 1
      ? `Un solo punto d'archivio: ${nomeOrigine[primoPunto.origin]} del ${dataPunto(primoPunto)} a ${simboloValuta} ${cifra(primoPunto.price)}. ` +
        `Da quel punto a oggi, ${dataIstante(istanteOra)}, passano ${conteggio(giorniScoperti)} giorni civili senza alcuna rilevazione: non esiste ancora un andamento da tracciare. ` +
        (medioDisegnabile !== null
          ? `Prezzo medio ponderato di carico di riferimento: ${simboloValuta} ${prezzo(medioDisegnabile)}.`
          : vistaValore
            ? 'La riga del prezzo medio di carico non compare: è un prezzo per quota, e su un’ordinata di controvalori non individua alcun livello.'
            : 'Il prezzo medio di carico non è disponibile.')
      : `Andamento ${vistaValore ? 'del controvalore della posizione' : 'del prezzo unitario'} dal ${dataPunto(primoPunto)} a oggi, ${dataIstante(istanteOra)}: ` +
        `${conteggio(punti.length)} punti in ${conteggio(giorniFinestra)} giorni civili — ` +
        `${conteggio(numeroCarichi)} ${numeroCarichi === 1 ? 'prezzo di carico' : 'prezzi di carico'} e ` +
        `${conteggio(numeroRilevazioni)} ${numeroRilevazioni === 1 ? 'rilevazione registrata' : 'rilevazioni registrate'}. ` +
        (medioDisegnabile !== null
          ? `Prezzo medio ponderato di carico di riferimento: ${simboloValuta} ${prezzo(medioDisegnabile)}. `
          : vistaValore
            ? 'La riga del prezzo medio di carico non compare: è un prezzo per quota, e su un’ordinata di controvalori non individua alcun livello. '
            : 'Il prezzo medio di carico non è disponibile. ') +
        `Fra due punti l'archivio non possiede alcun prezzo: i segmenti sono tratteggiati e nessun valore è interpolato.`) +
    dichiarazioneGradini +
    dichiarazioneEsclusi +
    dichiarazioneCopertura;

  return (
    <div
      data-testid="grafico-titolo"
      data-punti={punti.length}
      data-scala={scalaScelta}
      data-vista={vistaScelta}
      data-gradini={gradiniVisibili.length}
      data-esclusi={vistaValore ? serieValore.puntiEsclusi : 0}
      data-copertura={copertura}
    >
      {barraVista}
      {barraScala}

      <div className="grafico-cornice">
        <span className="cartellino-finestra">
          {etichettaInizio} &rarr; {etichettaFine}
        </span>

        <svg
          className="tracciato"
          viewBox={`0 0 ${TELA.larghezza} ${altezzaTela}`}
          role="img"
          aria-label={descrizione}
        >
          <defs>
            {/* Campitura obliqua, non superficie piena: una superficie piena
                somiglierebbe a un dato, il tratteggio no. */}
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
              <line
                key={quota.y}
                x1={RIQUADRO.sinistra}
                y1={quota.y}
                x2={RIQUADRO.destra}
                y2={quota.y}
              />
            ))}
          </g>

          {/* ---------- Il tratto iniziale scoperto (criterio 5) ----------
              L'asse non si accorcia fino al primo dato: l'orizzonte chiesto
              resta per intero, e la parte che l'archivio non copre è campita
              con la stessa obliqua dei vuoti. Un grafico che riempisse la
              larghezza disponibile lascerebbe intendere una copertura piena. */}
          {trattoInizialeScoperto && (
            <>
              <rect
                x={RIQUADRO.sinistra}
                y={RIQUADRO.alto}
                width={larghezzaIniziale}
                height={altezzaRiquadro}
                fill={`url(#${idCampitura})`}
              />
              <rect
                className="contorno-vuoto"
                x={RIQUADRO.sinistra}
                y={RIQUADRO.alto}
                width={larghezzaIniziale}
                height={altezzaRiquadro}
              />
              {larghezzaIniziale >= LARGHEZZA_MINIMA_SCRITTA && (
                <text
                  className="dichiarazione-forte"
                  x={a1(RIQUADRO.sinistra + larghezzaIniziale / 2)}
                  y={RIQUADRO.alto + 18}
                  textAnchor="middle"
                >
                  {copertura === 'parziale'
                    ? scopertoPerNonDetenzione
                      ? 'PRIMA DELLA PRIMA DETENZIONE'
                      : 'PRIMA DEI DATI D’ARCHIVIO'
                    : `${conteggio(giorniInizialiScoperti)} GIORNI SENZA RILEVAZIONI`}
                </text>
              )}
            </>
          )}

          {/* ---------- Il tratto finale scoperto, campito e contornato ---------- */}
          {trattoFinaleScoperto && (
            <>
              <rect
                x={xUltimo}
                y={RIQUADRO.alto}
                width={larghezzaFinale}
                height={altezzaRiquadro}
                fill={`url(#${idCampitura})`}
              />
              <rect
                className="contorno-vuoto"
                x={xUltimo}
                y={RIQUADRO.alto}
                width={larghezzaFinale}
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

          {/* ---------- Scala dei prezzi: estremi inclusi ---------- */}
          <g className="etichetta-asse" textAnchor="end">
            {quoteY.map((quota) => (
              <text key={quota.y} x={RIQUADRO.sinistra - 8} y={quota.y + 3.8}>
                {prezzoScala(quota.valore)}
              </text>
            ))}
          </g>
          <text className="didascalia-asse" x={RIQUADRO.sinistra} y={22} data-testid="didascalia-ordinata">
            {simboloValuta} {definizioneDellaVista.didascalia}
          </text>

          {/* ---------- Verticale di «oggi»: l'asse arriva alla data corrente ---------- */}
          <line
            className="verticale-oggi"
            x1={xOggi}
            y1={RIQUADRO.alto}
            x2={xOggi}
            y2={RIQUADRO.basso}
          />
          <text className="didascalia-asse" x={xOggi - 4} y={22} textAnchor="end">
            OGGI &middot; {dataIstante(istanteOra)}
          </text>

          {/* ---------- Riga del prezzo medio ponderato di carico ---------- */}
          {medioDisegnabile !== null && (
            <>
              <line
                className="riga-media"
                data-testid="linea-prezzo-medio"
                data-prezzo={medioDisegnabile}
                x1={RIQUADRO.sinistra}
                y1={yMedio}
                x2={RIQUADRO.destra}
                y2={yMedio}
              >
                <title>{`Prezzo medio ponderato di carico: ${simboloValuta} ${prezzo(medioDisegnabile)}`}</title>
              </line>
              <rect className="fondo-etichetta" x={centroX - 155} y={yEtichettaMedia - 11} width={310} height={15} />
              <text className="etichetta-media" x={centroX} y={yEtichettaMedia} textAnchor="middle">
                PREZZO MEDIO PONDERATO DI CARICO &nbsp;{simboloValuta} {prezzo(medioDisegnabile)}
              </text>
            </>
          )}

          {/* ---------- Segmenti: tratteggiati perché fra due punti l'archivio è muto ---------- */}
          <g className="segmento-vuoto">
            {segmentiTratteggiati.map(({ da, a }, indice) => (
              <line
                key={indice}
                x1={a1(proiettaX(da.at))}
                y1={a1(proiettaY(da.price))}
                x2={a1(proiettaX(a.at))}
                y2={a1(proiettaY(a.price))}
              />
            ))}
          </g>

          {/* ---------- Il gradino: l'unico tratto pieno del disegno ----------
              Fra i suoi due capi non passa un solo giorno di cui l'archivio
              taccia: è un fatto registrato — un carico — non un percorso
              ipotizzato, e il tratteggio direbbe il falso. */}
          <g className="segmento-gradino">
            {segmentiGradino.map(({ da, a }, indice) => (
              <line
                key={indice}
                data-testid={`tratto-gradino-${indice}`}
                x1={a1(proiettaX(da.at))}
                y1={a1(proiettaY(da.price))}
                x2={a1(proiettaX(a.at))}
                y2={a1(proiettaY(a.price))}
              />
            ))}
          </g>

          {/* ---------- Quota e cartellino del capitale versato (criterio 4) ----------
              La cifra è l'altezza del salto, cioè `prezzo di carico × quote
              nuove`: è un'identità, non una convenzione grafica, ed è per questo
              che si può dichiarare accanto al segno che la misura. */}
          {gradiniVisibili.map((gradino, indice) => {
            const x = a1(proiettaX(gradino.at));
            const yBasso = a1(proiettaY(gradino.valorePrima));
            const yAlto = a1(proiettaY(gradino.valoreDopo));
            // Il cartellino si ribalta a sinistra quando a destra non ci sta:
            // un carico recente cade a ridosso del bordo, e 250 unità di
            // scritta uscirebbero dalla tela.
            const verso =
              x + SCOSTAMENTO_QUOTA_GRADINO + 8 + LARGHEZZA_CARTELLINO_GRADINO <= TELA.larghezza
                ? 1
                : -1;
            const xQuota = a1(x + verso * SCOSTAMENTO_QUOTA_GRADINO);
            const xCartellino =
              verso === 1 ? a1(xQuota + 8) : a1(xQuota - 8 - LARGHEZZA_CARTELLINO_GRADINO);
            const yCartellino = a1(
              Math.min(
                RIQUADRO.basso - 52,
                Math.max(RIQUADRO.alto + 2, (yAlto + yBasso) / 2 - 24),
              ),
            );

            return (
              <g
                key={`${gradino.at}-${gradino.quantitaDopo}`}
                className="gradino-carico"
                data-testid={`gradino-carico-${indice}`}
                data-istante={gradino.at}
                data-capitale-versato={gradino.capitaleVersato}
                data-quote-aggiunte={gradino.quoteAggiunte}
                data-prezzo-carico={gradino.prezzoCarico}
              >
                <title>{`Capitale versato il ${dataPunto({ at: gradino.at, origin: 'carico' })}: ${simboloValuta} ${importo(gradino.capitaleVersato)} — ${conteggio(gradino.quoteAggiunte)} quote × ${simboloValuta} ${prezzo(gradino.prezzoCarico)}. Non è rendimento.`}</title>
                <line className="filo-quota" x1={x} y1={yBasso} x2={xQuota} y2={yBasso} />
                <line className="filo-quota" x1={x} y1={yAlto} x2={xQuota} y2={yAlto} />
                <line className="asta-quota" x1={xQuota} y1={yAlto} x2={xQuota} y2={yBasso} />
                <rect
                  className="cartellino-gradino"
                  x={xCartellino}
                  y={yCartellino}
                  width={LARGHEZZA_CARTELLINO_GRADINO}
                  height={48}
                />
                <text className="et-capitale" x={xCartellino + 6} y={yCartellino + 13}>
                  CAPITALE VERSATO
                </text>
                <text className="cifra-capitale" x={xCartellino + 6} y={yCartellino + 30}>
                  {simboloValuta} {importo(gradino.capitaleVersato)}
                </text>
                <text className="conto-capitale" x={xCartellino + 6} y={yCartellino + 43}>
                  {conteggio(gradino.quoteAggiunte)} quote &times; {simboloValuta}{' '}
                  {prezzo(gradino.prezzoCarico)} &mdash; non &egrave; rendimento
                </text>
              </g>
            );
          })}

          {/* ---------- Un solo punto: il criterio 6 si dichiara dentro il disegno ---------- */}
          {punti.length === 1 && (
            <g textAnchor="middle">
              <rect className="riquadro-dichiarazione" x={centroX - 210} y={66} width={420} height={34} />
              <text className="dichiarazione-forte" x={centroX} y={80}>
                {conteggio(giorniScoperti)} GIORNI CIVILI, NESSUNA RILEVAZIONE
              </text>
              <text className="dichiarazione-tenue" x={centroX} y={94}>
                non esiste ancora un andamento da tracciare
              </text>
            </g>
          )}

          {/* ---------- Scritta dentro il tratto finale, quando c'è spazio ---------- */}
          {trattoFinaleScoperto && punti.length > 1 && larghezzaFinale >= LARGHEZZA_MINIMA_SCRITTA && (
            <text
              className="dichiarazione-forte"
              x={a1(xUltimo + larghezzaFinale / 2)}
              y={RIQUADRO.alto + 18}
              textAnchor="middle"
            >
              {conteggio(giorniScoperti)} GIORNI SENZA RILEVAZIONI
            </text>
          )}

          {/* ---------- I punti d'archivio ----------
              Convenzione dei testid: `punto-serie-N`, con N indice progressivo da
              **0**, nell'ordine crescente di istante — a pari istante il carico
              precede la rilevazione. Da US-037 l'indice è quello della serie
              **ritagliata sulla finestra**, non della serie intera: `punto-serie-0`
              è il primo punto *visibile*, quindi cambiando scala gli indici si
              rinumerano. È la lettura giusta per un test, che asserisce su ciò che
              l'utente vede; resta stabile a parità di dati e di scala. */}
          {punti.map((punto, indice) => {
            const cx = a1(proiettaX(punto.at));
            const cy = a1(proiettaY(punto.price));
            const valore = comeValore(punto);
            const testo =
              `${titoloOrigine[punto.origin]} del ${dataPunto(punto)}: ${simboloValuta} ${cifra(punto.price)}` +
              (valore === null
                ? ''
                : ` = ${conteggio(valore.quantita)} ${valore.quantita === 1 ? 'quota' : 'quote'} × ${simboloValuta} ${prezzo(valore.prezzoUnitario)}`);
            // L'indice entra nella chiave perché due carichi con la stessa data
            // e lo stesso prezzo — un ordine spezzato in due righe — sono per il
            // resto indistinguibili, e due chiavi identiche collasserebbero in un
            // segno solo.
            const chiave = `${indice}-${punto.at}-${punto.origin}-${punto.price}`;
            /* La quantità detenuta è il fatto che il criterio 3 mette alla prova,
               e la si legge sul singolo punto: `data-quantita` è ciò che
               distingue una serie onesta da una moltiplicata all'indietro per la
               quantità di oggi. */
            const attributi = {
              'data-testid': `punto-serie-${indice}`,
              'data-origine': punto.origin,
              'data-prezzo': punto.price,
              'data-istante': punto.at,
              ...(valore === null
                ? {}
                : {
                    'data-valore': punto.price,
                    'data-quantita': valore.quantita,
                    'data-prezzo-unitario': valore.prezzoUnitario,
                    ...(valore.capo === null ? {} : { 'data-capo': valore.capo }),
                  }),
            };

            // Il capo basso di un gradino non è un dato nuovo: è il valore della
            // posizione *precedente* calcolato al prezzo del giorno. Porta perciò
            // un cerchio vuoto, non il rombo pieno del carico, che affermerebbe
            // un secondo acquisto in quella posizione.
            if (valore?.capo === 'ante') {
              return (
                <circle key={chiave} className="punto-ante-carico" cx={cx} cy={cy} r={4.8} {...attributi}>
                  <title>{testo}</title>
                </circle>
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

          {/* Col punto unico il valore va scritto accanto al segno: non c'è un
              tracciato da cui leggerlo, e la casella di dichiarazione parla dei
              giorni, non del prezzo.

              L'etichetta si ribalta a sinistra quando a destra non ci sta. Prima
              di US-037 non serviva — il punto unico stava sempre sull'estremo
              sinistro, perché l'asse *cominciava* da lui — ma con una finestra
              può cadere ovunque: un solo carico di tre mesi fa dentro «ultimi 10
              anni» finisce a ridosso del bordo destro, e una scritta larga 290
              unità uscirebbe interamente dalla tela. */}
          {punti.length === 1 &&
            (() => {
              const cx = a1(proiettaX(primoPunto.at));
              const cy = a1(proiettaY(primoPunto.price));
              const aDestra = cx + 9 + LARGHEZZA_ETICHETTA_PUNTO <= TELA.larghezza;
              const xRiquadro = aDestra ? cx + 9 : cx - 9 - LARGHEZZA_ETICHETTA_PUNTO;
              return (
                <g className="etichetta-punto">
                  <rect
                    className="fondo-etichetta"
                    x={xRiquadro}
                    y={cy + 7}
                    width={LARGHEZZA_ETICHETTA_PUNTO}
                    height={14}
                  />
                  <text
                    x={aDestra ? xRiquadro + 3 : xRiquadro + LARGHEZZA_ETICHETTA_PUNTO - 3}
                    y={cy + 18}
                    textAnchor={aDestra ? 'start' : 'end'}
                  >
                    {simboloValuta} {cifra(primoPunto.price)} &middot;{' '}
                    {nomeOrigine[primoPunto.origin]} del {dataPunto(primoPunto)}
                  </text>
                </g>
              );
            })()}

          {/* ---------- Quote dei vuoti: quanti giorni civili senza alcun dato ---------- */}
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
            GIORNI CIVILI &middot;{' '}
            {ritaglioAttivo
              ? definizione.etichetta.toUpperCase()
              : 'PRIMO PUNTO D’ARCHIVIO'}{' '}
            &rarr; OGGI{vistaValore ? ' · SCALA DEL VALORE ANCORATA A ZERO' : ''}
          </text>

          {/* ---------- La fascia della quantità detenuta (criterio 3) ----------
              È il secondo fattore del prodotto, reso visibile: la quantità che
              moltiplica il prezzo a ciascuna data. Il suo salto cade sullo stesso
              istante di quello della curva, ed è la ragione dell'altro. */}
          {vistaValore && fasce.length > 0 && (
            <g data-testid="fascia-quantita">
              <text className="didascalia-asse" x={RIQUADRO.sinistra} y={TELA.altezza + 10}>
                QUANTIT&Agrave; DETENUTA A CIASCUNA DATA &mdash; &Egrave; QUESTA CHE MOLTIPLICA IL
                PREZZO
              </text>
              {fasce.map((fascia) => (
                <g
                  key={fascia.id}
                  data-testid={`fascia-quantita-${fascia.id}`}
                  data-quantita={fascia.quantita}
                >
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
                      {conteggio(fascia.quantita)} {fascia.quantita === 1 ? 'quota' : 'quote'}
                    </text>
                  )}
                </g>
              ))}
            </g>
          )}
        </svg>

        <p className="estremi-tracciato">
          <span>
            Primo punto: <b>{dataPunto(primoPunto)}</b> ({nomeOrigine[primoPunto.origin]})
          </span>
          <span>
            {conteggio(punti.length)} {punti.length === 1 ? 'punto' : 'punti'} in{' '}
            {conteggio(giorniFinestra)} giorni civili &middot;{' '}
            {vistaValore ? 'scala del controvalore' : 'scala dei prezzi'} da{' '}
            <b>
              {simboloValuta} {prezzoScala(dominio.yMin)}
            </b>{' '}
            a{' '}
            <b>
              {simboloValuta} {prezzoScala(dominio.yMax)}
            </b>
          </span>
          <span>
            Ultimo punto: <b>{dataPunto(ultimoPunto)}</b> ({nomeOrigine[ultimoPunto.origin]})
            {giorniScoperti > 0 && <> &mdash; {conteggio(giorniScoperti)} giorni prima di oggi</>}
          </span>
        </p>
      </div>

      {/* ---------- Criterio 4: il gradino, dichiarato ----------
          La cifra del salto, il conto che la produce e la lettura da non fare.
          Non è un'approssimazione: `valoreDopo − valorePrima` vale per
          costruzione `prezzo di carico × quote nuove`, ed è la stessa identità
          che il test aritmetico verifica. */}
      {gradiniVisibili.map((gradino, indice) => (
        <div
          key={`${gradino.at}-${gradino.quantitaDopo}`}
          className="dichiarazione-gradino"
          data-testid={`dichiarazione-gradino-${indice}`}
          data-capitale-versato={gradino.capitaleVersato}
        >
          <span className="misura-salto">
            <span className="et-salto">
              Gradino del {dataPunto({ at: gradino.at, origin: 'carico' })}
            </span>
            <span className="cifra-salto" data-testid={`capitale-versato-${indice}`}>
              {simboloValuta} {importo(gradino.capitaleVersato)}
            </span>
            <span className="conto-salto">
              {conteggio(gradino.quoteAggiunte)}{' '}
              {gradino.quoteAggiunte === 1 ? 'quota' : 'quote'} &times; {simboloValuta}{' '}
              {prezzo(gradino.prezzoCarico)}
            </span>
          </span>
          <p className="spiega-salto">
            Quel tratto verticale &egrave; <b>denaro che hai versato</b>, non valore che il mercato
            ha prodotto: <span className="non-e">non &egrave; rendimento</span>. Al prezzo di{' '}
            <b>
              {simboloValuta} {prezzo(gradino.prezzoCarico)}
            </b>{' '}
            la posizione passa da <b>{conteggio(gradino.quantitaPrima)}</b> a{' '}
            <b>{conteggio(gradino.quantitaDopo)}</b> quote, e il controvalore da{' '}
            <b>
              {simboloValuta} {importo(gradino.valorePrima)}
            </b>{' '}
            a{' '}
            <b>
              {simboloValuta} {importo(gradino.valoreDopo)}
            </b>{' '}
            nello stesso giorno: la differenza &egrave; per costruzione il prezzo di carico
            moltiplicato per le quote nuove. Il prezzo unitario, quel giorno, non si muove di un
            centesimo &mdash; nella vista{' '}
            <span className="tasto-citato">{VISTE_GRAFICO[0].etichetta}</span> lo stesso punto
            &egrave; un semplice rombo di carico, senza alcun gradino. La performance sta tutta
            negli altri tratti, quelli obliqui.
          </p>
        </div>
      ))}

      {/* ---------- Criterio 3: i punti che questa vista non può mostrare ----------
          «Una quantità che non esiste non è una quantità pari a zero.» Le
          rilevazioni anteriori al primo carico restano fuori — `priceHistory` è
          per ISIN, non per posizione — e il loro numero si dichiara invece di
          essere appiattito su una retta a zero, che si leggerebbe poi come un
          guadagno del 100 % mai avvenuto. */}
      {vistaValore && serieValore.puntiEsclusi > 0 && (
        <div
          className="avviso-rado"
          data-testid="punti-esclusi"
          data-esclusi={serieValore.puntiEsclusi}
        >
          <span>
            <b>{conteggio(serieValore.puntiEsclusi)}</b>{' '}
            {serieValore.puntiEsclusi === 1 ? 'punto d’archivio è anteriore' : 'punti d’archivio sono anteriori'}{' '}
            al primo carico del{' '}
            <b>
              {serieValore.primaDetenzione === null
                ? '—'
                : dataPunto({ at: serieValore.primaDetenzione, origin: 'carico' })}
            </b>{' '}
            e {serieValore.puntiEsclusi === 1 ? 'resta escluso' : 'restano esclusi'} da questa
            vista: a quelle date non possedevi nulla. Lo storico dei prezzi &egrave; per{' '}
            <b>ISIN</b> e non per posizione, quindi pu&ograve; cominciare prima di te; portare
            quei punti a zero affermerebbe una posizione che non esisteva, e i giorni che li
            separano dal primo carico somiglierebbero a un guadagno mai avvenuto. Nella vista{' '}
            <span className="tasto-citato">{VISTE_GRAFICO[0].etichetta}</span> sono tutti al loro
            posto: il prezzo di una quota esiste anche prima che tu la compri.
          </span>
        </div>
      )}

      {/* ---------- Criterio 5: la copertura si misura e si dichiara ----------
          La scala chiesta è più lunga della storia disponibile. L'orizzonte non
          si accorcia — il regolo dice quanta parte della finestra l'archivio
          copre davvero, e da quando. */}
      {copertura === 'parziale' && (
        <div
          className="misura-copertura"
          data-testid="dichiarazione-copertura"
          data-inizio-dati={primoPunto.at}
        >
          <div className="intestazione-misura">
            <span>Copertura della finestra chiesta</span>
            <span className="cifra-misura">
              {scopertoPerNonDetenzione ? 'la posizione esiste dal' : 'i dati cominciano il'}{' '}
              {dataPunto(primoPunto)} &middot; {conteggio(giorniInizialiScoperti)} giorni civili
              scoperti su {conteggio(giorniFinestra)}
            </span>
          </div>
          <div className="barra-copertura">
            <span
              className="coperto"
              style={{
                width: `${Math.max(0, Math.min(100, ((finestra.a - primoPunto.at) / Math.max(1, finestra.a - finestra.da)) * 100))}%`,
              }}
            />
            <span className="etichetta-scoperto">
              {scopertoPerNonDetenzione ? 'nessuna quota detenuta prima del' : 'nessun dato prima del'}{' '}
              {dataPunto(primoPunto)}
            </span>
          </div>
          <p className="legenda-copertura">
            <span>
              Finestra chiesta: <b>{definizione.etichetta.toLowerCase()}</b>, dal {etichettaInizio}
            </span>
            <span>
              {scopertoPerNonDetenzione ? (
                <>
                  Prima di quella data non possedevi alcuna quota, e un controvalore senza
                  quantit&agrave; non esiste: l&rsquo;asse mostra il tratto vuoto invece di
                  appiattirlo a zero. I <b>prezzi</b> di quei giorni, invece, l&rsquo;archivio li
                  possiede &mdash; sono i punti esclusi contati qui sopra, e la vista{' '}
                  <span className="tasto-citato">{VISTE_GRAFICO[0].etichetta}</span> li traccia
                  tutti.
                </>
              ) : (
                <>
                  PortfolIA conserva prezzi solo da quando &egrave; in esercizio (ADR-008): prima di
                  quella data l&rsquo;archivio &egrave; muto, e l&rsquo;asse lo mostra invece di
                  accorciarsi.
                </>
              )}
            </span>
          </p>
        </div>
      )}

      {/* ---------- Sotto il tracciato: le metriche del titolo (US-038) ----------
          Il posto è quello dei mockup: sotto la cornice e sopra la legenda.
          Riceve sempre `contestoSotto`, cioè il ritaglio della serie del
          **prezzo**, in entrambe le viste: le due metriche misurano un prezzo
          unitario e lo dichiarano a schermo, e commutare la vista non deve
          muoverle di un centesimo (US-039). */}
      {sottoIlGrafico?.(contestoSotto)}

      {/* ---------- Legenda: nomina i segni, cioè le due origini d'archivio ---------- */}
      <div className="legenda-tracciato" data-testid="legenda-grafico">
        <div className="intestazione-legenda">
          Legenda del tracciato &mdash; due sole origini, nessuna terza
        </div>

        <div className="voce-legenda">
          <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true">
            <path className="punto-carico" d={rombo(18, 8)} />
          </svg>
          <span>
            <span className="et">Prezzi di carico &mdash; rombo in carminio</span>
            <span className="spiega">
              il prezzo d&rsquo;acquisto di ciascuna iscrizione a registro.{' '}
              <span className="conto">
                {numeroCarichi === 0
                  ? 'Nessun punto.'
                  : `${conteggio(numeroCarichi)} ${numeroCarichi === 1 ? 'punto' : 'punti'}.`}
              </span>
            </span>
          </span>
        </div>

        <div className="voce-legenda">
          <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true">
            {/* Il segno compare vuoto quando la categoria esiste ma l'archivio non
                ne ha ancora alcuna: dichiara l'assenza invece di ometterla. */}
            {numeroRilevazioni === 0 ? (
              <circle className="punto-assente" cx="18" cy="8" r="5" />
            ) : (
              <circle className="punto-rilevazione" cx="18" cy="8" r="5" />
            )}
          </svg>
          <span>
            <span className="et">Rilevazioni registrate &mdash; cerchio in inchiostro</span>
            <span className="spiega">
              le quotazioni che i tuoi aggiornamenti hanno gi&agrave; osservato e che l&rsquo;archivio
              conserva (US-009).{' '}
              <span className="conto">
                {numeroRilevazioni === 0
                  ? 'Nessun punto.'
                  : `${conteggio(numeroRilevazioni)} ${numeroRilevazioni === 1 ? 'punto' : 'punti'}.`}
              </span>
            </span>
          </span>
        </div>

        {/* ---------- Criterio 5: la voce resta, la riga no ----------
            Nella vista del valore il posto in legenda non si toglie: si occupa
            con la ragione. Un'assenza dichiarata non è una dimenticanza;
            un'assenza silenziosa sembra un difetto. */}
        <div
          className={`voce-legenda${vistaValore ? ' soppressa' : ''}`}
          data-testid={vistaValore ? 'legenda-prezzo-medio-soppressa' : 'legenda-prezzo-medio'}
        >
          <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true">
            <line className="riga-media" x1="1" y1="8" x2="35" y2="8" />
          </svg>
          <span>
            <span className="et">Prezzo medio ponderato di carico</span>
            {vistaValore && (
              <span className="segna-soppressa">assente per scelta in questa vista</span>
            )}
            <span className="spiega">
              {vistaValore ? (
                <>
                  {avgLoadPrice !== null && Number.isFinite(avgLoadPrice) ? (
                    <>
                      <span className="conto">
                        {simboloValuta} {prezzo(avgLoadPrice)}
                      </span>{' '}
                      &egrave;
                    </>
                  ) : (
                    <>il prezzo medio &egrave;</>
                  )}{' '}
                  un prezzo <em>per quota</em>: su un&rsquo;ordinata che porta controvalori non
                  individua alcun livello, e tracciarla qui suggerirebbe un confronto che non
                  esiste. Non &egrave; una dimenticanza &mdash; torna, con la sua quota di misura,
                  nella vista{' '}
                  <span className="tasto-citato">{VISTE_GRAFICO[0].etichetta}</span>.
                </>
              ) : medioDisegnabile !== null ? (
                <>
                  riga orizzontale d&rsquo;ottone a{' '}
                  <span className="conto">
                    {simboloValuta} {prezzo(medioDisegnabile)}
                  </span>
                  : il guadagno latente si legge come distanza fra il tracciato e questa riga.
                </>
              ) : (
                <>
                  la riga non &egrave; tracciata: il prezzo medio di carico non risulta disponibile,
                  e una riga collocata a stima sarebbe un dato inventato.
                </>
              )}
            </span>
          </span>
        </div>

        {/* ---------- I due segni che solo questa vista porta ---------- */}
        {vistaValore && (
          <div className="voce-legenda" data-testid="legenda-gradino">
            <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true">
              <g className="segmento-gradino">
                <line x1="18" y1="1" x2="18" y2="15" />
              </g>
            </svg>
            <span>
              <span className="et">Gradino di carico &mdash; l&rsquo;unico tratto pieno</span>
              <span className="spiega">
                il salto verticale del giorno in cui hai comprato: la sua altezza &egrave;{' '}
                <em>capitale versato</em>, non rendimento. &Egrave; pieno e non tratteggiato
                perch&eacute; fra i suoi due capi non passa un solo giorno di cui l&rsquo;archivio
                taccia.{' '}
                <span className="conto">
                  {gradiniVisibili.length === 0
                    ? 'Nessun gradino in finestra.'
                    : `${conteggio(gradiniVisibili.length)} ${gradiniVisibili.length === 1 ? 'gradino' : 'gradini'}.`}
                </span>
              </span>
            </span>
          </div>
        )}

        {vistaValore && fasce.length > 0 && (
          <div className="voce-legenda" data-testid="legenda-fascia">
            <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true">
              <rect className="riquadro-fascia" x="1" y="8" width="17" height="7" />
              <rect className="riquadro-fascia" x="18" y="3" width="17" height="12" />
            </svg>
            <span>
              <span className="et">Fascia a gradini &mdash; quantit&agrave; detenuta</span>
              <span className="spiega">
                sotto l&rsquo;asse dei tempi, la quantit&agrave; che moltiplica il prezzo a
                ciascuna data:{' '}
                <span className="conto">
                  {fasce.map((fascia) => conteggio(fascia.quantita)).join(' → ')}
                </span>{' '}
                {fasce.length === 1 ? 'quote per tutta la finestra' : 'quote'}. Il salto sta
                l&igrave;, non prima: i carichi successivi non retroagiscono sul passato.
              </span>
            </span>
          </div>
        )}

        <div className="voce-legenda">
          <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true">
            <line className="segmento-vuoto" x1="1" y1="8" x2="35" y2="8" />
          </svg>
          <span>
            <span className="et">Tratto senza rilevazioni</span>
            <span className="spiega">
              il segmento &egrave; tratteggiato, non continuo: fra i due estremi l&rsquo;archivio non
              possiede alcun prezzo, e la quota sotto il tracciato dice quanti giorni dura il vuoto.
            </span>
          </span>
        </div>
      </div>

      <div
        className={`avviso-rado${punti.length === 1 ? ' senza-andamento' : ''}`}
        data-testid="avviso-grafico-titolo"
      >
        {punti.length === 1 ? (
          <span>
            Il grafico c&rsquo;&egrave; anche con <b>1</b> punto solo, e mostra quel punto. Ci&ograve;
            che non c&rsquo;&egrave; &egrave; l&rsquo;andamento: per averne uno servono almeno due punti
            d&rsquo;archivio, e il secondo arriver&agrave; alla prima quotazione rilevata. Il tratto
            scoperto a destra non &egrave; un guasto, ed &egrave; per questo che porta scritto quanti
            giorni misura.
          </span>
        ) : (
          <span>
            Il tracciato non chiede nulla alla fonte: si compone dei soli{' '}
            <b>{conteggio(punti.length)}</b> punti che l&rsquo;archivio gi&agrave; possiede &mdash;{' '}
            <b>{conteggio(numeroCarichi)}</b> di carico e <b>{conteggio(numeroRilevazioni)}</b> da
            rilevazione. I giorni non osservati restano vuoti: PortfolIA non li stima, non li
            interpola e non li fa apparire.
          </span>
        )}
      </div>

      <p className="nota-sezione" data-testid="nota-grafico-titolo">
        Il tratteggio &egrave; una dichiarazione, non uno stile: unisce due punti d&rsquo;archivio{' '}
        <em>senza affermare</em> che il prezzo abbia seguito quella retta. Fra due punti
        l&rsquo;archivio non possiede alcun prezzo, e nessun valore intermedio viene stimato o
        interpolato (ADR-003). L&rsquo;asse dei tempi prosegue fino a <b>oggi</b> anche quando
        l&rsquo;ultimo punto &egrave; anteriore
        {giorniScoperti > 0 ? (
          <>
            {' '}
            &mdash; qui di <b>{conteggio(giorniScoperti)}</b> giorni civili
          </>
        ) : null}
        : il vuoto a destra si vede e si dichiara, non si riempie con il prezzo corrente.
      </p>
    </div>
  );
}
