import type { RefetchConfirmation, SecurityLookupResponse } from '@portfolia/shared';

/**
 * Il recupero di un titolo dalla fonte, con l'esito classificato una volta sola.
 *
 * Esiste per un vincolo esplicito di US-035: «il recupero riusa la catena
 * esistente — fonte primaria, poi backup, con l'ordine dedotto dalla fonte già
 * registrata per l'ISIN — senza una seconda implementazione del fetch». La
 * catena vive tutta sul server, dietro `GET /api/securities/:isin`; ciò che il
 * client ripeterebbe, se lo scrivesse due volte, è la *lettura* di quella
 * risposta — quali stati significano «aggiornato», quali «non trovato», quale
 * significa «la guardia ha risposto dall'archivio». Sono quelle cinque righe di
 * interpretazione a vivere qui, condivise fra la scheda titolo (US-030) e
 * l'aggiornamento in blocco del riepilogo (US-035).
 *
 * **Restituisce fatti, non frasi.** La scheda titolo dice «I dati in scheda
 * restano quelli in archivio», il consuntivo del riepilogo dice «nessuna fonte
 * ha trovato il titolo»: due registri diversi per due contesti diversi, e
 * fonderli produrrebbe una frase giusta in nessuno dei due. La formulazione
 * resta quindi al chiamante; qui si decide soltanto *che cosa è successo*.
 */

/** Esito di un'interrogazione della fonte per un ISIN. */
export type EsitoRecupero =
  /** Una fonte ha risposto e l'archivio è stato riscritto. */
  | { tipo: 'aggiornato'; risposta: SecurityLookupResponse }
  /**
   * 200 con `confirmation`: la guardia di buona cittadinanza ha risposto
   * dall'archivio **senza contattare la fonte**. Nulla è cambiato, e la
   * decisione di procedere comunque spetta a chi ha chiesto.
   */
  | { tipo: 'guardia'; conferma: RefetchConfirmation }
  /** 404: nessuna fonte conosce questo ISIN. */
  | { tipo: 'non-trovato' }
  /** 502: le fonti sono state interrogate e nessuna ha risposto. */
  | { tipo: 'fonte-muta' }
  /**
   * Tutto il resto. `rete` distingue i due casi che il chiamante racconta in
   * modo diverso: `true` quando la richiesta non è nemmeno partita (backend non
   * raggiungibile), `false` quando il server ha risposto con uno stato inatteso.
   */
  | { tipo: 'errore'; rete: boolean };

/**
 * Interroga `GET /api/securities/:isin` e classifica la risposta.
 *
 * `forza` aggiunge `?force=true`, ed è il ramo che l'utente autorizza
 * esplicitamente rispondendo «Procedi comunque» all'avviso della guardia
 * (US-030). L'aggiornamento in blocco di US-035 non lo passa mai: il criterio
 * «nessun recupero è forzato oltre la guardia di buona cittadinanza» significa
 * proprio che un titolo per cui la guardia chiede conferma va registrato come
 * non aggiornato, non ri-chiesto d'ufficio.
 */
export async function recuperaTitolo(isin: string, forza = false): Promise<EsitoRecupero> {
  let res: Response;
  try {
    res = await fetch(`/api/securities/${isin}${forza ? '?force=true' : ''}`);
  } catch {
    return { tipo: 'errore', rete: true };
  }

  if (res.status === 404) return { tipo: 'non-trovato' };
  if (res.status === 502) return { tipo: 'fonte-muta' };
  if (!res.ok) return { tipo: 'errore', rete: false };

  let body: SecurityLookupResponse;
  try {
    body = (await res.json()) as SecurityLookupResponse;
  } catch {
    // Un 200 con un corpo illeggibile non è un aggiornamento: dichiararlo tale
    // significherebbe raccontare che l'archivio è stato riscritto senza saperlo.
    return { tipo: 'errore', rete: false };
  }

  if (body.confirmation) return { tipo: 'guardia', conferma: body.confirmation };
  return { tipo: 'aggiornato', risposta: body };
}
