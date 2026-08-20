import { useCallback, useEffect, useRef, useState } from 'react';
import type { PositionDetail, RefetchConfirmation } from '@portfolia/shared';
import { nomeFonte, prezzo, simboloDi } from '../domain/formattazione.js';
import { recuperaTitolo } from '../domain/recuperoTitolo.js';

export interface UseSchedaTitoloProps {
  /** Portafoglio a cui il titolo è iscritto. */
  portfolioId: string;
  /** ISIN del titolo di cui mostrare il dettaglio. */
  isin: string;
  /**
   * Notifica un aggiornamento dei dati andato a buon fine (US-030).
   *
   * Serve a chi mostra anche il riepilogo del portafoglio: il prezzo appena
   * rilevato cambia valore attuale e differenza di *tutte* le viste, non solo
   * di questa scheda. Non viene invocata quando la guardia chiede conferma né
   * quando nessuna fonte ha risposto: in entrambi i casi l'archivio è intatto.
   */
  onDatiAggiornati?: () => void;
}

/** Esito dichiarato dell'ultimo aggiornamento richiesto dall'utente. */
export type EsitoAggiornamento =
  | { tipo: 'in-corso' }
  | { tipo: 'riuscito'; fonte: string | null; prezzo: string | null }
  | { tipo: 'fallito'; motivo: string };

/**
 * Ciò che `useSchedaTitolo` restituisce a chi lo consuma.
 *
 * Esiste come tipo nominato — e non come tipo di ritorno inferito — perché sia
 * la scheda mastro (`SchedaTitolo.tsx`) sia la futura vista quadro
 * (US-052/TASK-05, `SchedaTitoloQuadro.tsx`) devono condividere esattamente la
 * stessa forma: se le due rese divergessero nei campi che usano, il
 * compilatore lo segnala qui invece che scoprirlo a schermo.
 */
export interface UseSchedaTitoloResult {
  detail: PositionDetail | null;
  loading: boolean;
  error: string | null;
  esito: EsitoAggiornamento | null;
  conferma: RefetchConfirmation | null;
  appenaAggiornato: boolean;
  aggiornaDati: (force: boolean) => Promise<void>;
  /**
   * Chiude l'avviso della guardia senza procedere (bottone «Annulla»).
   * Non è nell'elenco che accompagna la spec di TASK-01, ma senza un modo per
   * azzerare `conferma` da fuori il bottone «Annulla» della scheda smetterebbe
   * di funzionare — e il JSX deve restare identico, non solo la sua forma.
   */
  annullaConferma: () => void;
}

/**
 * Stato e logica della scheda di dettaglio di un titolo (US-018, FR-014),
 * estratti da `SchedaTitolo.tsx` in US-052/TASK-01 senza alcun cambio di
 * comportamento — un puro spostamento di stato, perché sia il mastro sia una
 * futura vista "quadro" possano consumarlo.
 *
 * Governa il caricamento del dettaglio (con annullamento alla dismissione o al
 * cambio di `isin`) e l'aggiornamento dei dati dalla fonte (US-030): guardia di
 * buona cittadinanza, esito dichiarato, fallback sul dettaglio già in archivio.
 */
export function useSchedaTitolo({
  portfolioId,
  isin,
  onDatiAggiornati,
}: UseSchedaTitoloProps): UseSchedaTitoloResult {
  const [detail, setDetail] = useState<PositionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Aggiornamento dei dati dalla riga di provenienza (US-030) ─────────────
  const [esito, setEsito] = useState<EsitoAggiornamento | null>(null);
  const [conferma, setConferma] = useState<RefetchConfirmation | null>(null);
  const [appenaAggiornato, setAppenaAggiornato] = useState(false);

  /**
   * ISIN attualmente in pagina. Un aggiornamento può restare in volo una decina
   * di secondi, abbastanza perché l'utente torni al riepilogo e apra un altro
   * titolo: alla risposta si confronta questo riferimento, e se il titolo è
   * cambiato la risposta viene lasciata cadere. Senza, la scheda del titolo
   * nuovo mostrerebbe i valori di quello vecchio — un dato falso indistinguibile
   * da uno vero.
   */
  const isinMostrato = useRef(isin);
  useEffect(() => {
    isinMostrato.current = isin;
  }, [isin]);

  /** Legge il dettaglio dal server. Solleva con il messaggio da mostrare. */
  const leggiDettaglio = useCallback(async (): Promise<PositionDetail> => {
    const res = await fetch(`/api/portfolios/${portfolioId}/positions/${isin}/detail`);
    if (!res.ok) {
      const dati = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(dati?.error ?? 'Impossibile leggere il dettaglio del titolo.');
    }
    return (await res.json()) as PositionDetail;
  }, [portfolioId, isin]);

  useEffect(() => {
    let annullato = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    // Il verdetto di un aggiornamento vale per il titolo che lo ha richiesto:
    // cambiando titolo va via con lui.
    setEsito(null);
    setConferma(null);
    setAppenaAggiornato(false);

    leggiDettaglio()
      .then((dati) => {
        if (!annullato) setDetail(dati);
      })
      .catch((causa: Error) => {
        if (!annullato) setError(causa.message === 'Failed to fetch' ? 'Backend non raggiungibile.' : causa.message);
      })
      .finally(() => {
        if (!annullato) setLoading(false);
      });

    // Un cambio di titolo mentre la richiesta precedente è in volo non deve
    // far comparire nella scheda il dettaglio del titolo abbandonato.
    return () => {
      annullato = true;
    };
  }, [leggiDettaglio]);

  /**
   * Chiede alla fonte i dati aggiornati del titolo e rilegge il dettaglio.
   *
   * `loading` resta falso per tutta l'attesa: i valori d'archivio restano a
   * schermo, dichiarati come tali dalla riga d'esito. Con la fonte di backup
   * l'interrogazione arriva a una decina di secondi, e una scheda vuota per
   * tutto quel tempo sarebbe una regressione rispetto a US-018.
   *
   * Il ricalcolo di valore attuale e differenza non avviene qui: la formula
   * vive sul server, e rileggere l'endpoint di dettaglio è l'unico modo per non
   * duplicarla nel client.
   */
  async function aggiornaDati(force: boolean): Promise<void> {
    setConferma(null);
    setAppenaAggiornato(false);
    setEsito({ tipo: 'in-corso' });

    /** L'utente ha cambiato titolo mentre la fonte rispondeva? */
    const titoloAbbandonato = () => isinMostrato.current !== isin;

    // L'interrogazione e la lettura del suo esito vivono in un posto solo
    // (`domain/recuperoTitolo`), condiviso con l'aggiornamento in blocco del
    // riepilogo (US-035). Le frasi qui sotto restano invece di questa scheda:
    // dicono che cosa succede *ai dati in scheda*, cosa che il consuntivo di un
    // lavoro su più titoli non potrebbe affermare.
    const recupero = await recuperaTitolo(isin, force);
    if (titoloAbbandonato()) return;

    if (recupero.tipo === 'non-trovato') {
      setEsito({
        tipo: 'fallito',
        motivo: 'Nessuna delle due fonti ha trovato il titolo. I dati in scheda restano quelli in archivio.',
      });
      return;
    }
    if (recupero.tipo === 'fonte-muta') {
      setEsito({
        tipo: 'fallito',
        motivo: 'Nessuna delle due fonti ha risposto. I dati in scheda restano quelli già rilevati.',
      });
      return;
    }
    if (recupero.tipo === 'errore') {
      setEsito({
        tipo: 'fallito',
        motivo: recupero.rete
          ? 'Backend non raggiungibile. I dati in scheda restano quelli già rilevati.'
          : 'Errore inatteso durante l’aggiornamento. I dati in scheda restano quelli già rilevati.',
      });
      return;
    }

    // La guardia ha risposto dalla cache senza contattare la fonte: nulla è
    // cambiato in archivio, e la decisione di procedere spetta all'utente.
    if (recupero.tipo === 'guardia') {
      setConferma(recupero.conferma);
      setEsito(null);
      return;
    }

    try {
      const aggiornato = await leggiDettaglio();
      if (titoloAbbandonato()) return;

      setDetail(aggiornato);
      setAppenaAggiornato(true);
      setEsito({
        tipo: 'riuscito',
        // La fonte dichiarata è quella della riga appena riletta, la stessa che
        // valorizza il timbro di provenienza: due letture diverse dello stesso
        // fatto potrebbero divergere, e una di loro sarebbe falsa.
        fonte: nomeFonte(aggiornato.dataSource),
        prezzo:
          aggiornato.currentPrice !== null
            ? `${simboloDi(aggiornato.currency)} ${prezzo(aggiornato.currentPrice)}`
            : null,
      });
      onDatiAggiornati?.();
    } catch {
      if (titoloAbbandonato()) return;
      setEsito({
        tipo: 'fallito',
        motivo: 'Backend non raggiungibile. I dati in scheda restano quelli già rilevati.',
      });
    }
  }

  const annullaConferma = useCallback(() => setConferma(null), []);

  return { detail, loading, error, esito, conferma, appenaAggiornato, aggiornaDati, annullaConferma };
}
