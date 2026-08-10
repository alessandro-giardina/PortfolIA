# Mockup US-034 — Segnalare nel riepilogo i titoli con rilevamento obsoleto

Riferimento visivo per la marcatura delle righe con rilevamento obsoleto nella scheda
**Riepilogo** del portafoglio, e per il riquadro di conteggio che le somma sopra la tabella.
Continua il linguaggio di `US-017` (la tabella del riepilogo), `US-030` (la scheda titolo) e
`libro-mastro`: nessuna schermata nuova, una postilla in più su una tabella che esiste già.

| File | Cosa mostra |
|---|---|
| `index.html` | Il riepilogo completo con cinque titoli: due obsoleti, uno mai rilevato, due allineati. Sopra la tabella, il riquadro di conteggio nel caso misto. In fondo, un comando che toglie il colore alla tabella per verificare che la marcatura resti leggibile. |
| `stati-conteggio.html` | L'anatomia della cella «Ultimo rilevamento» nelle tre condizioni, i quattro stati del riquadro di conteggio (più la variante al singolare dello stato a zero) e il riepilogo con tutti i titoli allineati. |

## Decisioni di progetto

- **La postilla sta dentro la cella del rilevamento, su riga propria.** Non c'è un'ottava
  colonna: la tabella resta a sette, il `tfoot` conserva il suo `colspan="5"` e i due totali
  restano incolonnati sotto «Valore attuale» e «Differenza» — che è esattamente ciò che
  US-032 verifica misurando i bounding box. La marcatura *affianca* la data perché le sta
  sotto, nella stessa cella, non perché le sia accanto in una colonna nuova.

- **L'istante non viene sostituito, viene sottolineato.** Sulla riga obsoleta la data resta
  al suo posto e prende una sottolineatura tratteggiata, il gesto del revisore che segna a
  matita la cifra da rivedere. Cancellarla avrebbe tolto all'utente l'unico dato che gli
  dice *quanto* è vecchia.

- **La marcatura è una parola, il colore la ripete soltanto.** «da aggiornare» in rosso
  margine, «mai rilevato» in seppia; ma i due casi portano anche segni di richiamo diversi
  (`†` contro `—`) e, soprattutto, testi diversi. Il comando «Togli il colore» in fondo a
  `index.html` mette la tabella in scala di grigi: le tre condizioni restano distinguibili.
  È il criterio di accessibilità reso ispezionabile a occhio.

- **«Mai rilevato» non riscrive la cella, la spiega.** Il «–» stabilito da US-032 resta
  identico — anche nel caso misto di una riga in cache con `fetched_at` valorizzato e
  `price` nullo, dove mostrare un istante racconterebbe una rilevazione che non c'è stata.
  La postilla dice *quale* delle due assenze si sta guardando, senza contraddire la cella.

- **Il riquadro di conteggio sta fra il valore totale e la tabella**, e l'ordine è
  deliberato: la domanda «quanto vale il portafoglio» va letta subito dopo la riserva
  «quante di queste cifre sono ancora attendibili». Riusa la grammatica del riquadro del
  valore totale (fascia di colore a sinistra, etichetta in maiuscoletto, frase in corsivo)
  in scala minore, perché dichiara una condizione, non una cifra.

- **A zero il riquadro resta.** Cambia fascia (verde), cambia frase — «Tutti i N titoli sono
  allineati all'ultima sessione di borsa» — ma non sparisce: uno spazio vuoto sarebbe
  indistinguibile da una funzionalità che non ha caricato. La variante al singolare è
  mostrata perché il portafoglio da un titolo solo è il caso di chi comincia.

- **La fascia del conteggio ha tre colori, non due.** Rosso margine quando c'è almeno un
  rilevamento obsoleto, seppia quando mancano soltanto rilevazioni mai fatte, verde a zero.
  La distinzione rosso/seppia ricalca quella delle due postille: vecchiaia di una cifra e
  assenza di una cifra non sono lo stesso difetto.

- **Nessuna azione dalla riga.** La postilla dichiara, non rimedia: non c'è un «aggiorna
  ora» in tabella. L'aggiornamento vive già nella scheda titolo (US-030), e la nota di piè
  di tabella ci rimanda esplicitamente.

- **Nessuna cifra cambia.** Valore attuale, differenza e totali sono quelli di sempre: la
  spec aggiunge testo, non ricalcola nulla. Nel mockup i totali tornano con le righe, così
  che il confronto con la schermata di oggi sia a saldo zero.

## Formati

Le date in tabella sono nel formato che il registro usa davvero (`gg/mm/aaaa hh:mm`, come
`dataRilevamento` di US-032), non nella numerazione romana usata nelle testate decorative:
la tabella è la parte che verrà confrontata con l'implementazione.

Gli istanti dell'esempio sono scelti perché il verdetto sia verificabile a mano: il registro
è consultato sabato 08.VIII.2026, i titoli allineati sono rilevati alla chiusura di venerdì
(nessuna sessione conclusa da allora), gli obsoleti a martedì e al venerdì precedente.
