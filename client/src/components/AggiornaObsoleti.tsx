import { useCallback, useEffect, useRef, useState } from 'react';
import type { EnrichedPositionSummary } from '@portfolia/shared';
import { recuperaTitolo } from '../domain/recuperoTitolo.js';

/**
 * Aggiornamento in blocco dei titoli con rilevamento obsoleto (US-035).
 *
 * Il componente ospita due cose che il mockup tratta come un corpo solo
 * (`docs/mockups/US-035/`): il riquadro di conteggio consegnato da US-034 — che
 * qui guadagna una colonna a destra con il comando — e il cassetto che gli si
 * apre sotto, dove vivono l'avanzamento e poi il consuntivo. Il comando sta
 * dentro il riquadro perché la cifra del riquadro *è* la ragione del comando:
 * separarli vorrebbe dire chiedere all'utente di ricostruire da solo il perché
 * di un bottone.
 *
 * ## Che cosa fa il ciclo, e che cosa non fa
 *
 * Non contiene una riga di logica di recupero: interroga
 * `GET /api/securities/:isin` — la catena completa, guardia compresa, con
 * l'ordine dei tentativi dedotto dalla fonte già registrata — e rilegge la vista
 * arricchita, che ricalcola prezzi, valori, differenze e `freshness`. Il lavoro
 * nuovo è la messa in fila: un titolo alla volta, con i presidi contro le
 * risposte che arrivano quando la pagina non è più quella di prima.
 *
 * ## Perché la lista non contiene mai un titolo che non si può interrogare
 *
 * Il server classifica `freshness === 'stale'` esattamente quando la guardia di
 * buona cittadinanza lascia passare il recupero senza chiedere conferma: sono la
 * stessa frase letta due volte (`server/src/domain/marketHours.ts`, e il
 * contratto fissato in `server/tests/marketHours.test.ts`). Ne segue che
 * costruire la lista dai soli titoli non `current` è già l'autorizzazione a
 * contattare la fonte, e che **`?force=true` non compare da nessuna parte**:
 * usarlo violerebbe il criterio «nessun recupero è forzato oltre la guardia».
 *
 * L'unica crepa è dichiarata invece che aggirata: una riga in cache con
 * `fetched_at` recente e `price` nullo è classificata `never-fetched`, ma per la
 * guardia è recentissima e la risposta torna con `confirmation`, senza che la
 * fonte sia stata contattata. Quel titolo viene registrato fra i **non
 * aggiornati**, con la ragione scritta. È l'esito onesto: il prezzo non è stato
 * rilevato e il consuntivo non finge il contrario. Chi voglia forzare ha la
 * strada di sempre, la scheda titolo, dove la guardia chiede e l'utente risponde.
 */

interface AggiornaObsoletiProps {
  /** Portafoglio in vista. Cambiandolo il lavoro in corso viene abbandonato. */
  portfolioId: string;
  /**
   * Le posizioni del riepilogo, con il `freshness` deciso dal server.
   *
   * Solo posizioni **aperte** (quantità residua maggiore di zero): il
   * conteggio e la coda di aggiornamento non devono mai includere posizioni
   * chiuse, il cui ISIN non è più detenuto in portafoglio (US-065).
   */
  posizioniAperte: EnrichedPositionSummary[];
  /**
   * Rilegge la vista arricchita in modalità silenziosa (senza sostituire la
   * tabella con «Caricamento titoli…»). Il ciclo la attende dopo ogni titolo:
   * prezzo, valore, differenza e valore totale si riscrivono man mano.
   */
  onRicalcola: () => Promise<void>;
  /**
   * Dichiara quale ISIN è in corso di rilevamento, perché la tabella possa
   * marcarne la riga. `null` quando nessun titolo è in volo.
   */
  onTitoloInCorso?: (isin: string | null) => void;
}

/** Perché un titolo non è stato aggiornato. Sono fatti distinti, e restano distinti. */
type Ragione = 'non-trovato' | 'fonte-muta' | 'guardia' | 'errore' | 'non-interrogato';

/** Esito registrato per un titolo della corsa. */
interface EsitoTitolo {
  isin: string;
  esito: 'aggiornato' | Ragione;
}

/** Le quattro condizioni del cassetto. */
type Fase = 'riposo' | 'in-corso' | 'fermata' | 'consuntivo';

/**
 * La ragione, scritta per esteso.
 *
 * Le prime tre sono le tre del mockup e vanno tenute separate: «non trovato»
 * dice che l'ISIN non esiste per quelle fonti, «nessuna risposta» dice che erano
 * irraggiungibili e che vale la pena riprovare, «l'archivio ha risposto» dice
 * che la guardia ha fermato una richiesta troppo ravvicinata — e non è un
 * guasto, è il sistema che si comporta bene. Un unico «3 non riusciti» le
 * renderebbe indistinguibili, e l'utente non saprebbe quale riprovare.
 */
function ragioneScritta(ragione: Ragione): string {
  switch (ragione) {
    case 'non-trovato':
      return 'nessuna fonte ha trovato il titolo';
    case 'fonte-muta':
      return 'nessuna fonte ha risposto';
    case 'guardia':
      return 'l’archivio ha risposto senza contattare la fonte';
    case 'errore':
      // Quarta voce, e dichiarata: un esito inatteso non è nessuno dei tre casi
      // sopra, e riciclarne la frase racconterebbe un fatto che non è avvenuto.
      return 'il server non ha risposto come previsto';
    case 'non-interrogato':
      return 'non interrogato: il lavoro è stato interrotto prima del suo turno';
  }
}

export default function AggiornaObsoleti({
  portfolioId,
  posizioniAperte,
  onRicalcola,
  onTitoloInCorso,
}: AggiornaObsoletiProps) {
  // ─── Il conteggio di US-034: si legge, non si decide ───────────────────────
  // `freshness` arriva già calcolato dal server con la stessa classificazione
  // oraria della guardia di buona cittadinanza. Qui si conta soltanto: nessuna
  // regola di orario di borsa vive nel client.
  const obsoleti = posizioniAperte.filter((p) => p.freshness === 'stale').length;
  const maiRilevati = posizioniAperte.filter((p) => p.freshness === 'never-fetched').length;
  const daAggiornare = obsoleti + maiRilevati;
  const totale = posizioniAperte.length;

  // ─── Stato del lavoro ─────────────────────────────────────────────────────
  const [fase, setFase] = useState<Fase>('riposo');
  /** La lista **congelata al clic**: vedi `avvia` per il perché. */
  const [lista, setLista] = useState<string[]>([]);
  const [indice, setIndice] = useState(0);
  const [esiti, setEsiti] = useState<EsitoTitolo[]>([]);
  const [interrotto, setInterrotto] = useState(false);

  /**
   * Guardia anti-doppio-avvio. Su `useRef` e non su stato perché `useState` è
   * asincrono: due clic ravvicinati leggerebbero entrambi `fase === 'riposo'` e
   * partirebbero due corse. Il `disabled` del bottone è la difesa visibile,
   * questo riferimento è quella vera.
   */
  const inCorso = useRef(false);
  /** Bandierina d'interruzione, controllata prima di iniziare il titolo successivo. */
  const interruzioneRichiesta = useRef(false);

  /**
   * Il portafoglio attualmente in vista — il riferimento `isinMostrato` di
   * US-030, promosso da titolo a portafoglio.
   *
   * Una risposta può impiegare una decina di secondi, abbastanza perché l'utente
   * sia altrove quando arriva. Alla risposta si confronta questo riferimento e,
   * se il conto è cambiato, la risposta viene lasciata cadere: niente `setState`,
   * niente ricalcolo, niente consuntivo scritto sulla vista di un altro conto.
   */
  const portafoglioMostrato = useRef(portfolioId);
  /** Il componente è ancora in pagina? Una risposta tardiva non deve risvegliarlo. */
  const montato = useRef(true);

  // I callback del chiamante cambiano identità a ogni render: il ciclo li legge
  // dai riferimenti invece che dalla chiusura del clic, così una corsa lunga non
  // continua a chiamare la versione di dieci secondi fa.
  const ricalcola = useRef(onRicalcola);
  const segnalaInCorso = useRef(onTitoloInCorso);
  useEffect(() => {
    ricalcola.current = onRicalcola;
    segnalaInCorso.current = onTitoloInCorso;
  }, [onRicalcola, onTitoloInCorso]);

  useEffect(() => {
    montato.current = true;
    return () => {
      montato.current = false;
      // Lasciare la scheda Riepilogo — o il portafoglio — smonta il componente:
      // il lavoro si ferma perché non c'è più nessuno a proseguirlo. La richiesta
      // già in volo non viene abortita (il server, una volta partito, scrive
      // comunque in archivio ciò che ha rilevato), ma il suo esito non trova più
      // una pagina su cui scrivere.
      interruzioneRichiesta.current = true;
      inCorso.current = false;
      segnalaInCorso.current?.(null);
    };
  }, []);

  /**
   * Cambio di conto: il lavoro precedente non appartiene a questa vista.
   *
   * Cambiare portafoglio non smonta il componente — la rotta è la stessa e
   * cambia solo il parametro — quindi la pulizia dello smontaggio qui non
   * scatta e va rifatta a mano. La marcatura «in aggiornamento» va spenta per
   * prima: vive nella pagina, e due conti che contengono lo stesso titolo sono
   * la norma, non l'eccezione. Senza, la riga di quel titolo resterebbe marcata
   * nel conto nuovo, per un lavoro che lì non è mai stato avviato.
   */
  useEffect(() => {
    portafoglioMostrato.current = portfolioId;
    interruzioneRichiesta.current = true;
    inCorso.current = false;
    segnalaInCorso.current?.(null);
    setFase('riposo');
    setLista([]);
    setEsiti([]);
    setIndice(0);
    setInterrotto(false);
  }, [portfolioId]);

  const avvia = useCallback(async (): Promise<void> => {
    if (inCorso.current) return;

    /**
     * La lista è congelata qui, e non riletta dalla prop a ogni giro.
     *
     * Dopo ogni titolo si rilegge la vista arricchita, che *cambia la prop*: un
     * titolo appena rilevato smette di essere `stale` e sparisce dalla lista.
     * Iterare sulla prop viva significherebbe iterare su un array che si accorcia
     * sotto i piedi — indici saltati, e un avanzamento «2 di 3» che diventa
     * «2 di 1». Il totale resta quello dello scatto iniziale, ed è l'unico numero
     * che l'utente possa seguire.
     */
    const daFare = posizioniAperte.filter((p) => p.freshness !== 'current').map((p) => p.isin);
    if (daFare.length === 0) return;

    inCorso.current = true;
    interruzioneRichiesta.current = false;
    const portafoglioDiPartenza = portafoglioMostrato.current;

    setLista(daFare);
    setEsiti([]);
    setIndice(0);
    setInterrotto(false);
    setFase('in-corso');

    /** Vero quando la risposta appena arrivata riguarda una pagina che non c'è più. */
    const paginaAbbandonata = () =>
      !montato.current || portafoglioMostrato.current !== portafoglioDiPartenza;

    const raccolti: EsitoTitolo[] = [];
    let fermato = false;

    for (let i = 0; i < daFare.length; i += 1) {
      // L'interruzione si controlla *prima* di iniziare il titolo successivo:
      // quello già chiesto alla fonte arriva a conclusione e il suo esito viene
      // registrato. Abortire il solo lato client produrrebbe un titolo aggiornato
      // in archivio ma dichiarato «non interrogato» nel consuntivo — una bugia
      // recuperabile solo ricaricando la pagina.
      if (interruzioneRichiesta.current) {
        fermato = true;
        for (let j = i; j < daFare.length; j += 1) {
          raccolti.push({ isin: daFare[j], esito: 'non-interrogato' });
        }
        break;
      }

      setIndice(i);
      segnalaInCorso.current?.(daFare[i]);

      // Un `for...of` con `await`: la sequenzialità è per costruzione, non per
      // disciplina. Non c'è un `Promise.all` da cui possa nascere una seconda
      // richiesta in volo.
      const esito = await recuperaTitolo(daFare[i]);

      if (paginaAbbandonata()) {
        inCorso.current = false;
        segnalaInCorso.current?.(null);
        return;
      }

      raccolti.push({
        isin: daFare[i],
        esito: esito.tipo === 'aggiornato' ? 'aggiornato' : esito.tipo,
      });
      setEsiti([...raccolti]);

      // Il ricalcolo è silenzioso: la tabella si riscrive, non sparisce.
      await ricalcola.current();
      if (paginaAbbandonata()) {
        inCorso.current = false;
        segnalaInCorso.current?.(null);
        return;
      }
    }

    segnalaInCorso.current?.(null);
    setEsiti([...raccolti]);
    setInterrotto(fermato);
    setFase('consuntivo');
    inCorso.current = false;
  }, [posizioniAperte]);

  /**
   * L'interruzione è uno stato dichiarato, non un ritorno immediato al riposo:
   * la richiesta in volo non si richiama indietro. L'interfaccia però risponde
   * subito, perché l'attesa non sembri un comando ignorato.
   */
  function interrompi(): void {
    interruzioneRichiesta.current = true;
    setFase('fermata');
  }

  // ─── Presentazione ────────────────────────────────────────────────────────
  const lavorando = fase === 'in-corso' || fase === 'fermata';
  const aggiornati = esiti.filter((e) => e.esito === 'aggiornato').length;
  const nonAggiornati = esiti.filter((e) => e.esito !== 'aggiornato');
  const nonInterrogati = esiti.filter((e) => e.esito === 'non-interrogato').length;
  /** Titoli che il lavoro non tocca: il loro rilevamento è già allineato. */
  const altri = Math.max(0, totale - lista.length);

  // Tre fasce, non due: vecchiaia di una cifra e assenza di una cifra non sono
  // lo stesso difetto, e la distinzione ricalca quella delle due postille.
  const statoRiquadro = daAggiornare === 0 ? ' allineato' : obsoleti === 0 ? ' mancante' : '';

  const frase =
    daAggiornare === 0 ? (
      totale === 1 ? (
        <>L&rsquo;unico titolo è allineato all&rsquo;ultima sessione di borsa.</>
      ) : (
        <>Tutti i <b>{totale}</b> titoli sono allineati all&rsquo;ultima sessione di borsa.</>
      )
    ) : obsoleti > 0 && maiRilevati > 0 ? (
      // Il totale viene per primo: è la cifra che serve a decidere se fidarsi del
      // valore letto sopra. La scomposizione segue.
      <>
        <b>{daAggiornare}</b> titoli su <b>{totale}</b> da aggiornare: <b>{obsoleti}</b> con
        rilevamento obsoleto, <b>{maiRilevati}</b> mai {maiRilevati === 1 ? 'rilevato' : 'rilevati'}.
      </>
    ) : obsoleti > 0 ? (
      <>
        <b>{obsoleti}</b> {obsoleti === 1 ? 'titolo' : 'titoli'} su <b>{totale}</b> con
        rilevamento obsoleto.
      </>
    ) : (
      <>
        <b>{maiRilevati}</b> {maiRilevati === 1 ? 'titolo' : 'titoli'} su <b>{totale}</b> mai{' '}
        {maiRilevati === 1 ? 'rilevato' : 'rilevati'}.
      </>
    );

  const rinvio =
    daAggiornare === 0
      ? 'nessuna postilla in tabella'
      : obsoleti === 0
        ? `— ${maiRilevati === 1 ? 'segnato' : 'segnati'} in tabella`
        : `† ${daAggiornare === 1 ? 'segnato' : 'segnati'} in tabella`;

  /** Le tacche: una casella per titolo, nell'ordine in cui saranno interrogati. */
  function classeTacca(posizione: number): string {
    const registrato = esiti[posizione];
    if (registrato !== undefined) {
      if (registrato.esito === 'aggiornato') return 'tacca fatta';
      if (registrato.esito === 'non-interrogato') return 'tacca saltata';
      return 'tacca fallita';
    }
    if (lavorando && posizione === indice) return 'tacca corrente';
    return 'tacca';
  }

  const tacche = (
    <span className="tacche" aria-hidden="true">
      {lista.map((isin, posizione) => (
        <i key={isin} className={classeTacca(posizione)}></i>
      ))}
    </span>
  );

  const elencoNonAggiornati = nonAggiornati.length > 0 && (
    <ul className="elenco-esiti" data-testid="elenco-non-aggiornati">
      <li className="capo">Titoli non aggiornati</li>
      {nonAggiornati.map((e) => (
        <li
          key={e.isin}
          className={e.esito === 'non-interrogato' ? 'non-interrogato' : undefined}
          data-testid={`esito-${e.isin}`}
        >
          <span className="segno">{e.esito === 'non-interrogato' ? '·' : '†'}</span>
          <span className="isin">{e.isin}</span>
          <span className="ragione">{ragioneScritta(e.esito as Ragione)}</span>
        </li>
      ))}
    </ul>
  );

  // Il timbro del consuntivo: quattro varianti, ciascuna col proprio testo, così
  // che la distinzione resti leggibile anche in scala di grigi.
  const classeConsuntivo = interrotto
    ? ' interrotto'
    : aggiornati === 0
      ? ' nulla'
      : aggiornati < lista.length
        ? ' parziale'
        : '';

  return (
    <div className="blocco-aggiornamento">
      {/* Il riquadro è sempre presente: a zero cambia fascia e frase, mai
          esistenza. Uno spazio vuoto sarebbe indistinguibile da una funzionalità
          che non ha caricato. */}
      <div
        className={`riquadro-conteggio${statoRiquadro}`}
        role="status"
        data-testid="conteggio-da-aggiornare"
      >
        <div className="fascia-conteggio"></div>
        <div className="contenuto-conteggio">
          <span className="et-conteggio">Stato dei rilevamenti</span>
          <span className="frase-conteggio" data-testid="frase-conteggio">{frase}</span>
          <span className="rinvio">{rinvio}</span>
          <span className="azione-conteggio">
            {/* A N = 0 il comando resta a schermo, spento, con la ragione scritta
                accanto: un comando spento senza spiegazione è indistinguibile da
                un guasto. */}
            {daAggiornare === 0 && !lavorando && (
              <span className="motivo-inattivo" data-testid="motivo-comando-inattivo">
                Nessun titolo da aggiornare: ogni rilevamento è già allineato all&rsquo;ultima
                sessione di borsa.
              </span>
            )}
            <button
              type="button"
              className={`bottone-minuto${lavorando ? ' in-corso' : daAggiornare === 0 ? ' inattivo' : ''}`}
              data-testid="btn-aggiorna-obsoleti"
              disabled={lavorando || daAggiornare === 0}
              aria-busy={lavorando}
              onClick={() => {
                void avvia();
              }}
            >
              <span className="glifo">&#x21bb;</span>{' '}
              {lavorando ? (
                <>Aggiornamento in corso&hellip;</>
              ) : (
                <>Aggiorna i titoli obsoleti ({daAggiornare})</>
              )}
            </button>
          </span>
        </div>
      </div>

      {/* Il cassetto: durante il lavoro dice a che punto è, alla fine dice com'è
          andata. Chi ha guardato l'avanzamento trova l'esito nello stesso posto
          in cui stava guardando. */}
      {lavorando && (
        <div
          className={`riga-lavoro ${fase === 'fermata' ? 'fermata' : 'in-corso'}`}
          role="status"
          aria-live="polite"
          data-testid="riga-lavoro"
        >
          <span className="timbro-lavoro">
            {fase === 'fermata' ? 'Interruzione richiesta' : 'In corso'}
          </span>
          <span className="testo-lavoro" data-testid="avanzamento-lavoro">
            {fase === 'fermata' ? (
              <>
                Attendo la risposta di <b>{lista[indice]}</b>, poi il lavoro si ferma. &mdash;{' '}
                <b>{indice + 1}</b> di <b>{lista.length}</b>.
              </>
            ) : (
              <>
                Rilevamento di <b>{lista[indice]}</b> &mdash; <b>{indice + 1}</b> di{' '}
                <b>{lista.length}</b>.
              </>
            )}
          </span>
          {tacche}
          <span className="azione-lavoro">
            <button
              type="button"
              className="bottone-minuto fermata"
              data-testid="btn-interrompi-aggiornamento"
              disabled={fase === 'fermata'}
              onClick={interrompi}
            >
              <span className="glifo">&#x25a0;</span>{' '}
              {fase === 'fermata' ? <>Interruzione in corso&hellip;</> : <>Interrompi</>}
            </button>
          </span>
          <p className="nota-lavoro">
            {fase === 'fermata' ? (
              <>
                Il titolo già chiesto alla fonte non viene abbandonato: la sua risposta sarà
                registrata. {lista.length - indice - 1 === 1 ? 'Il titolo rimanente' : `I ${lista.length - indice - 1} titoli rimanenti`}{' '}
                non {lista.length - indice - 1 === 1 ? 'sarà interrogato' : 'saranno interrogati'}.
              </>
            ) : (
              <>
                I titoli sono interrogati <b>uno alla volta</b>: la fonte di backup può richiedere{' '}
                <b>una decina di secondi</b> per titolo.
                {altri > 0 && (
                  <>
                    {' '}
                    {altri === 1 ? 'L’altro titolo non viene richiesto' : <>Gli altri <b>{altri}</b> titoli non vengono richiesti</>} alla
                    fonte: il loro rilevamento è già allineato all&rsquo;ultima sessione.
                  </>
                )}
              </>
            )}
          </p>
        </div>
      )}

      {fase === 'consuntivo' && (
        <div
          className={`riga-lavoro consuntivo${classeConsuntivo}`}
          role="status"
          data-testid="consuntivo-aggiornamento"
        >
          <span className="timbro-lavoro">
            {interrotto
              ? 'Lavoro interrotto'
              : aggiornati === 0
                ? 'Nessun titolo aggiornato'
                : 'Lavoro concluso'}
          </span>
          <span className="testo-lavoro">
            Aggiornati <b>{aggiornati}</b> {aggiornati === 1 ? 'titolo' : 'titoli'} su{' '}
            <b>{lista.length}</b>.
            {nonInterrogati > 0 && (
              <>
                {' '}
                <b>{nonInterrogati}</b> non{' '}
                {nonInterrogati === 1 ? 'è stato interrogato' : 'sono stati interrogati'}.
              </>
            )}
          </span>
          {tacche}
          <span className="azione-lavoro">
            {/* Un riquadro d'esito senza congedo resta a schermo per sempre o
                sparisce da solo mentre lo si legge: entrambe le cose sono peggio
                di un bottone discreto. */}
            <button
              type="button"
              className="bottone-minuto congedo"
              data-testid="btn-chiudi-consuntivo"
              onClick={() => setFase('riposo')}
            >
              Chiudi il consuntivo
            </button>
          </span>
          {interrotto && (
            <p className="nota-lavoro">
              I titoli già rilevati conservano i valori appena letti: l&rsquo;interruzione non
              annulla il lavoro fatto. Il conteggio qui sopra è già ricalcolato, e dice quanto
              resta.
            </p>
          )}
          {elencoNonAggiornati}
        </div>
      )}
    </div>
  );
}
