# US-053 — Quadro strumenti: elenco portafogli

Mockup isolato: **nessuna riga di questo prototipo tocca il codice dell'applicazione**.
È la schermata iniziale dell'app nella direzione visiva «Quadro strumenti» — l'elenco dei
portafogli, la creazione di uno nuovo e il dialogo di scelta portafoglio — sorella del
riepilogo in [`../US-051/`](../US-051/) e della scheda titolo in [`../US-052/`](../US-052/).

## Schermate

| File | Che cosa mostra |
|---|---|
| `index.html` | **Elenco portafogli** — tabella dei conti aperti (nome, data di apertura, posizioni, freccia), il suo stato vuoto («nessun portafoglio»), il modulo **Nuovo portafoglio** con validazione inline, e il dialogo `PortfolioSelectDialog` restilizzato coi token del quadro |

`shared.css` e `app.js` sono la copia autosufficiente della cartella US-051: le tre pagine
condividono i token, e ciascuna cartella porta la propria copia come tutte le altre cartelle
`US-*` di questo repository. Tenerle allineate a mano è il costo, previsto, di quella
convenzione. Questa copia aggiunge in coda tre sezioni nuove (18–20): i vuoti e il modulo di
gestione (già presenti in produzione in `client/src/quadro.css`, sezione 16, spediti con
US-051), le classi della riga di elenco portafoglio, e il dialogo di scelta — quest'ultimo
non esiste ancora nel design system del quadro, è la parte di superficie nuova introdotta da
questa scheda.

## Interazioni disponibili

- toggle tema chiaro/scuro (memorizzato in `localStorage`, condiviso con le altre cartelle);
- righe della tabella cliccabili (tastiera inclusa) — portano al riepilogo di US-051;
- bottone «Mostra stato "nessun portafoglio" (demo)» — commuta lo stesso pannello fra
  l'elenco popolato e il placeholder, per ispezionare entrambi senza svuotare l'archivio;
- il modulo «Nuovo portafoglio» mostra l'errore di validazione (`.errore-campo-quadro`) se si
  prova a inviare un nome vuoto, e lo ritira non appena si digita qualcosa;
- bottone «Mostra dialogo di selezione portafoglio» — apre l'overlay con le righe
  selezionabili in stile radio (clic, invio o spazio), il bottone «Conferma» resta disabilitato
  finché non si sceglie una riga; Esc o un clic fuori dal riquadro chiude il dialogo.

## Perché il dialogo cambia interamente stile

`PortfolioSelectDialog.tsx` è oggi condiviso fra i due design ed è stilizzato **interamente
inline** con le variabili del Libro Mastro (`--carta`, `--oro`, `--seppia`): nel quadro arriva
solo per alias di variabile CSS, non per intento — il riquadro resta un rettangolo con bordo
dorato e angoli vivi in un'interfaccia che altrove usa `--raggio: 14px` e `--ombra` morbide.
Questo mockup lo rifà come un `.pannello` a tutti gli effetti (stessa superficie, stesso
raggio, stessa ombra, stessa testata pannello/corpo/piede), con righe selezionabili che
riprendono il linguaggio del comando segmentato (radio piena, bordo evidenziato, alone
d'accento) invece del bordo oro pieno del mastro.
