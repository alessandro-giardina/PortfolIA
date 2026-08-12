/**
 * `globalSetup` della suite: rimuove i portafogli residui prima che i test partano.
 *
 * La fixture `archivio` copre il caso normale — teardown eseguito anche su timeout
 * o asserzione fallita. Resta scoperto un caso: il run ucciso con SIGKILL, quando
 * nemmeno il teardown può girare. Questa bonifica è la rete sotto quel caso.
 *
 * Riconosce solo i nomi generati da `nomeUnico`, quindi non tocca i residui
 * anteriori a US-029: quelli sono già stati rimossi una volta per tutte dalla
 * prima esecuzione della suite, e le euristiche che servivano a trovarli sono
 * state tolte perché il loro raggio d'azione era pericolosamente ampio (vedi sotto).
 *
 * La rimozione passa dall'API, non da SQL diretto: la cancellazione a cascata delle
 * posizioni è dichiarata come vincolo di schema, e `PRAGMA foreign_keys` non è
 * attivo di default su una connessione SQLite esterna. Cancellare le righe a mano
 * lascerebbe posizioni orfane.
 *
 * La bonifica non fa mai fallire il run: se il server non risponde, avvisa e cede
 * il passo ai test, che falliranno da soli con un messaggio più utile.
 */
import { BASE_API, elencaPortafogli, eliminaPortafoglio, type Portafoglio } from './api.js';
import { rimuoviOsservazioni } from './archivio.js';
import { MARCATORE_E2E } from './nomi.js';
import { ISIN_CON_OSSERVAZIONI_E2E } from './titoli.js';
import { formattaViolazioni, intestazioneViolazioni, verificaChiavi } from './verifica-chiavi.js';

/**
 * Un portafoglio è residuo della suite se porta il marcatore di `nomeUnico`.
 *
 * Il criterio è deliberatamente stretto. Questa funzione cancella righe vere
 * dall'archivio di sviluppo, in silenzio e a cascata sulle posizioni: l'unico
 * errore che non ci si può permettere è cancellare il portafoglio di una persona.
 * Riconoscere per euristica i residui anteriori a US-029 — un nome contenente
 * `Date.now()`, o il nome fisso "Conto Unico" — è stato utile una volta sola, per
 * la bonifica iniziale dei 57 residui storici, ed è ormai a valore zero: ogni nome
 * generato da qui in avanti porta il marcatore. Restava però il rischio permanente
 * di far sparire un "Conto Unico" scritto da un utente, o un nome con un IBAN
 * dentro. Quelle regole sono state tolte a bonifica avvenuta.
 */
export function eResiduoDiTest(portafoglio: Portafoglio): boolean {
  return MARCATORE_E2E.test(portafoglio.name);
}

/** Attende che il server risponda su /health, entro `tentativi` secondi. */
async function attendiServer(tentativi = 20): Promise<boolean> {
  for (let i = 0; i < tentativi; i += 1) {
    try {
      const res = await fetch(`${BASE_API}/health`);
      if (res.ok) return true;
    } catch {
      /* non ancora pronto */
    }
    await new Promise((risolvi) => setTimeout(risolvi, 500));
  }
  return false;
}

/**
 * Rimuove lo storico dei prezzi seminato dalla suite (US-009).
 *
 * Va per SQL diretto e non per API — non esiste un endpoint che cancelli
 * osservazioni, e non deve esistere — e non ha bisogno della cautela della
 * cancellazione a cascata: `price_observations` non ha figli.
 *
 * Il raggio d'azione è limitato agli ISIN che la suite si è riservata, elencati
 * in `titoli.ts`. Un criterio più largo — «tutte le osservazioni antecedenti al
 * run», o quelle di ISIN mai iscritti a un portafoglio — cancellerebbe lo storico
 * di un titolo dell'utente, che è precisamente il dato che US-009 promette di
 * conservare.
 */
function bonificaOsservazioni(): void {
  let rimossi = 0;
  for (const isin of ISIN_CON_OSSERVAZIONI_E2E) {
    try {
      rimossi += rimuoviOsservazioni(isin).precedenti.length;
    } catch (causa) {
      console.warn(`[e2e] bonifica osservazioni di ${isin} non completata: ${String(causa)}`);
    }
  }
  if (rimossi > 0) {
    console.log(`[e2e] bonifica: rimosse ${rimossi} osservazioni residue.`);
  }
}

/**
 * Il controllo delle chiavi (US-040), eseguito **prima** dei test e non dentro.
 *
 * `npm run check:chiavi` lo esegue già in CI, ma chi lancia `npx playwright test`
 * in locale non passa da lì: senza questo passo scoprirebbe la collisione come un
 * fallimento intermittente a metà suite — cioè nel modo più costoso possibile,
 * dopo che l'archivio è già stato sporcato. Qui invece il run si ferma subito,
 * con l'elenco delle violazioni.
 *
 * È l'unico punto in cui la bonifica fa fallire il run: gli altri passi sono
 * best-effort per scelta, ma una chiave condivisa non è un residuo da ripulire —
 * è un difetto che i test successivi non potrebbero che nascondere.
 */
function verificaChiaviOFallisci(): void {
  const violazioni = verificaChiavi();
  if (violazioni.length === 0) return;
  throw new Error(
    `${intestazioneViolazioni(violazioni.length)}\n${formattaViolazioni(violazioni)}\n\n` +
      `La regola e i casi leciti sono documentati in e2e/support/titoli.ts.`,
  );
}

export default async function bonifica(): Promise<void> {
  verificaChiaviOFallisci();

  if (!(await attendiServer())) {
    console.warn(`[e2e] bonifica saltata: ${BASE_API} non raggiungibile.`);
    return;
  }

  bonificaOsservazioni();

  try {
    const residui = (await elencaPortafogli()).filter(eResiduoDiTest);
    if (residui.length === 0) return;

    for (const portafoglio of residui) {
      await eliminaPortafoglio(portafoglio.id);
    }
    console.log(`[e2e] bonifica: rimossi ${residui.length} portafogli residui.`);
  } catch (causa) {
    console.warn(`[e2e] bonifica non completata: ${String(causa)}`);
  }
}
