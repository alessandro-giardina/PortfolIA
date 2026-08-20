# US-055 — Quadro strumenti: ricerca titoli

Mockup isolato: **nessuna riga di questo prototipo tocca il codice dell'applicazione**.
È la schermata di ricerca titoli per ISIN nella direzione visiva «Quadro strumenti» — sorella
del riepilogo in [`../US-051/`](../US-051/), della scheda titolo in [`../US-052/`](../US-052/)
e dell'elenco portafogli in [`../US-053/`](../US-053/).

## Schermate

| File | Che cosa mostra |
|---|---|
| `index.html` | **Ricerca per ISIN** — modulo di ricerca, riga di esito, anagrafica recuperata con la sua provenienza, azione «Aggiungi a portafoglio» e dialogo di scelta, più tutti gli stati intermedi |

`shared.css` e `app.js` sono la copia autosufficiente della cartella US-053 (a sua volta copia
di US-051): ciascuna cartella `US-*` porta la propria copia, come in tutto questo repository.
Questa copia aggiunge in coda una sola sezione nuova, la **21 — Ricerca titoli**.

## I sette stati, tutti ispezionabili

La schermata di ricerca è quasi tutta stati: il commutatore in cima alla pagina («solo nel
mockup») li mostra uno alla volta senza bisogno di un server.

| Stato | Che cosa si vede |
|---|---|
| Nessuna ricerca | modulo vuoto, riga di esito inerte, placeholder «nessun titolo in consultazione» |
| In attesa | punto pulsante nella riga di esito e scheletro dell'anagrafica a dieci righe |
| Trovato | intestazione del titolo, riga di provenienza, anagrafica completa, azione di aggiunta |
| Non trovato | riga di esito con pillola «Dato non disponibile» e placeholder che spiega perché |
| Fonte muta | 502: le fonti sono state interrogate e nessuna ha risposto — diverso da «non esiste» |
| Guardia | l'avviso di US-030 sopra un risultato già in archivio, con «Procedi comunque» / «Annulla» |
| ISIN non valido | errore inline sotto il campo, senza che nessuna richiesta parta |

Il modulo è anche vivo: digitando dodici caratteri e premendo «Recupera anagrafica» la pagina
passa da sé per l'attesa e arriva al risultato; con meno di dodici mostra l'errore inline.

## Interazioni disponibili

- toggle tema chiaro/scuro (memorizzato in `localStorage`, condiviso con le altre cartelle);
- commutatore degli stati della schermata (segmentato in cima al contenuto);
- contatore `n/12` dei caratteri dell'ISIN, che diventa verde a codice completo;
- invio del modulo con validazione della lunghezza e transizione attesa → trovato;
- bottone «Aggiungi a portafoglio» → dialogo di scelta con righe selezionabili (clic, invio o
  spazio), «Conferma» disabilitato finché non si sceglie una riga, Esc o clic fuori per chiudere.

## Che cosa è nuovo e che cosa è già in casa

Quasi nulla di questa schermata richiede superficie nuova: il modulo riusa
`.modulo-gestione`/`.campo-gestione`/`.riga-campo` spediti con US-051, l'anagrafica riusa
`.griglia-def`/`.voce-def` della scheda titolo, l'intestazione del risultato riusa
`.testa-titolo`, e i due stati «senza risultato» riusano `.placeholder-quadro`. Restano quattro
elementi che nessuna sezione precedente copriva, e sono l'unica aggiunta della sezione 21:

1. **il campo ISIN monospaziato** con il suo contatore di caratteri — dodici è una lunghezza
   fissa, mostrarla mentre si digita elimina metà degli errori di battitura;
2. **la riga di esito** (`.riga-esito-quadro`), una sola riga sempre nello stesso posto, con il
   bordo sinistro a dire di che esito si tratta;
3. **lo scheletro dell'anagrafica** (`.scheletro-quadro`), deliberatamente sobrio: il recupero
   di ripiego può durare una decina di secondi e una barra di avanzamento che corre a vuoto
   mentirebbe sul tempo che manca;
4. **la riga di provenienza** (`.riga-provenienza-quadro`) — esiste già in produzione nella
   scheda titolo del quadro (`client/src/quadro.css`, sezione 15), ma questa cartella non la
   porta e il mockup deve restare autosufficiente.

## Perché «Fonte muta» è uno stato a sé

Il design mastro racconta oggi il 502 con la stessa riga del 404. Sono due fatti diversi: il
primo dice «le fonti non hanno risposto», il secondo «le fonti hanno risposto che il titolo non
esiste». La differenza cambia cosa deve fare l'utente — riprovare fra un minuto contro
ricontrollare il codice — e il quadro la rende esplicita, con una pillola ambra invece che
rossa e un placeholder che dice cosa succede all'archivio nel frattempo: nulla.
