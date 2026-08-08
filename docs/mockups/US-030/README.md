# Mockup US-030 — Aggiornare i dati di un titolo dalla sua scheda

Riferimento visivo per il comando di aggiornamento nella **riga di provenienza** della
Scheda Titolo. Continua il linguaggio di `US-018` (stesso `shared.css`, ampliato) perché
la spec non introduce una schermata nuova: aggiunge un&rsquo;azione a una riga che esiste già.

| File | Cosa mostra |
|---|---|
| `index.html` | La scheda completa con il comando &laquo;⟳ Aggiorna dati&raquo; nella riga di provenienza. Premendolo si vede il ciclo *in corso → riuscito* simulato in `app.js`. |
| `stati-riga-fonte.html` | I sei stati della riga, ciascuno annotato con il criterio di accettazione che copre: a riposo, in corso, riuscito con cambio di fonte, guardia di buona cittadinanza, esito negativo, fonte non registrata. |

## Decisioni di progetto

- **Il comando sta dentro la riga di provenienza**, spinto a destra da `margin-left:auto`.
  È accanto a &laquo;Rilevato il&raquo;, cioè accanto al dato che spiega *perché* si vuole
  aggiornare. Sotto i 640px scende a piena larghezza.
- **La scheda non si svuota durante l&rsquo;aggiornamento**: nessuno scheletro, nessun
  placeholder. Finché la fonte non risponde restano a schermo i valori d&rsquo;archivio, e una
  riga d&rsquo;esito dichiara l&rsquo;attesa. Con la fonte di backup l&rsquo;attesa può arrivare a una
  decina di secondi, e una scheda vuota per tutto quel tempo sarebbe una regressione.
- **Il timbro dichiara la fonte che ha risposto**, non quella tentata per prima: un titolo
  registrato su MorningStar riparte da MorningStar, e se il ripiego cambia fonte il timbro
  cambia con esso.
- **L&rsquo;esito negativo è una riga in più, non un valore diverso**: fonte e istante di
  rilevazione restano i precedenti, perché l&rsquo;archivio non è stato riscritto.
- **La guardia riusa `.avviso-conferma` della Ricerca titoli**, con lo stesso testo servito
  dal server: è una guardia sola, su un archivio solo.
