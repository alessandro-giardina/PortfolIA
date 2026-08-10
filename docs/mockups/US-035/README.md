# Mockup US-035 — Aggiornare in un colpo solo i titoli obsoleti del portafoglio

Riferimento visivo per il comando di aggiornamento in blocco nella scheda **Riepilogo** del
portafoglio, per la riga che ne dichiara l'avanzamento e per il consuntivo che lo chiude.
Non c'è una schermata nuova: c'è un comando dentro il riquadro di conteggio consegnato da
`US-034`, e un cassetto che gli si apre sotto. Il linguaggio è quello di `libro-mastro`,
`US-017` (la tabella), `US-030` (l'aggiornamento del singolo titolo) e `US-034` (il riquadro
di conteggio e la postilla in tabella).

| File | Cosa mostra |
|---|---|
| `index.html` | Il riepilogo completo di 11 titoli **durante** la corsa, fermo sull'istante «2 di 3»: comando disabilitato, riga di stato con l'ISIN in corso, avanzamento a tacche, nota sui tempi, comando «Interrompi». Il primo titolo si è già riscritto e ha perso la postilla; il terzo aspetta il suo turno. I comandi in fondo rigiocano la corsa dall'inizio e tolgono il colore. |
| `stati-aggiornamento.html` | I quattro stati del comando, i due della riga di lavoro, i quattro consuntivi, e il prima/dopo della marcatura in tabella. Ogni stato è annotato col criterio di accettazione che copre. |
| `app.js` | La simulazione della corsa: quale cosa si riscrive, e quando. Nessuna logica di dominio — gli esiti sono scritti in tabella, come li deciderebbero le fonti. |

## Decisioni di progetto

- **Il comando sta dentro il riquadro di conteggio, non in una barra di strumenti.**
  US-034 ha messo sopra la tabella una frase che dice quanti titoli hanno il rilevamento
  obsoleto; quella cifra *è* la ragione del comando. Separarli vorrebbe dire chiedere
  all'utente di ricostruire da solo il perché di un bottone. La grammatica del riquadro non
  cambia — fascia di colore a sinistra, etichetta in maiuscoletto, frase in corsivo, cifre in
  monospazio — guadagna una colonna a destra, dove `.rinvio` conserva il suo `margin-left:auto`
  e il comando gli si accoda.

- **Il numero fra parentesi è la stessa cifra della frase, non un secondo conteggio.**
  «Aggiorna i titoli obsoleti (3)» ripete «3 titoli su 11 con rilevamento obsoleto» dove si
  preme. Quando il riquadro somma obsoleti e mai rilevati, N segue quel totale e la frase
  accanto ne scompone i due addendi: l'etichetta del bottone resta breve perché non deve
  dirlo due volte (stato 4 della tavola).

- **A N = 0 il comando resta a schermo, spento, con la ragione scritta accanto.**
  È lo stesso argomento per cui in US-034 il riquadro a zero non spariva: uno spazio vuoto è
  indistinguibile da una funzionalità che non ha caricato. Il cursore è `not-allowed` e non
  `progress`, perché la condizione è stabile e non transitoria — dettaglio piccolo, ma è la
  differenza fra «non c'è niente da fare» e «aspetta».

- **La riga di lavoro è un cassetto del riquadro, non un secondo riquadro.**
  Bordo continuo, nessun filetto superiore, fascia di colore larga quanto quella del riquadro
  sopra così che le due si incolonnino. Riusa la grammatica della riga d'esito di US-030
  (timbro a sinistra, frase in corsivo, cifre in monospazio) perché è la stessa cosa detta per
  tre titoli invece che per uno.

- **Tre informazioni, in quest'ordine: chi, a che punto, quanto può durare.**
  L'ISIN in corso viene per primo perché è l'unico nome che compare anche in tabella e lega la
  riga di stato alla riga che si sta riscrivendo. «2 di 3» segue. La nota sui dieci secondi
  della fonte di backup occupa una riga tutta sua, sotto un filetto punteggiato: è la premessa
  che rende sopportabile l'attesa, non una parentesi da leggere di sfuggita.

- **Le tacche sono ridondanti per costruzione.** Una casella per titolo, nell'ordine in cui
  saranno interrogati; ma «2 di 3» è già scritto per esteso nella frase. Le caselle si
  distinguono per glifo (✓ chiuso, ✕ non riuscito, ↻ in corso, · non interrogato) prima che
  per tinta, così che in scala di grigi restino quattro cose diverse. Non è una barra di
  percentuale: una corsa da tre titoli non ha percentuali interessanti, ha titoli.

- **L'interruzione è uno stato dichiarato, non un ritorno immediato al riposo.** La richiesta
  già in volo non si richiama indietro; fingere il contrario porterebbe la risposta a scrivere
  su una pagina che si crede ferma — lo stesso rischio che US-030 presidia con `isinMostrato`.
  La riga passa a «Interruzione richiesta», dichiara che attende la risposta del titolo
  corrente e quanti non saranno interrogati, e il comando d'arresto si disabilita subito, per
  la stessa ragione per cui si disabilita quello d'avvio. La fascia va al seppia: né riuscita
  né fallimento, sospensione.

- **Il consuntivo è lo stesso cassetto, che cambia timbro.** Non un avviso che compare
  altrove: chi ha guardato l'avanzamento trova l'esito nello stesso posto in cui stava
  guardando. Quattro varianti di colore, ciascuna col proprio timbro scritto: verde tutti
  rilevati, ottone in parte, seppia dopo interruzione, rosso margine nulla di fatto.

- **Le ragioni del mancato aggiornamento sono tre e restano tre.** «Nessuna fonte ha trovato
  il titolo» dice che l'ISIN non esiste per quelle fonti; «nessuna fonte ha risposto» dice che
  erano irraggiungibili e che vale la pena riprovare; «l'archivio ha risposto senza contattare
  la fonte» dice che la guardia di buona cittadinanza di US-030 ha fermato una richiesta
  troppo ravvicinata — e non è un guasto, è il sistema che si comporta bene. Un unico «3 non
  riusciti» le renderebbe indistinguibili, e l'utente non saprebbe quale riprovare.

- **«Non riuscito» e «non interrogato» sono separati.** Il primo ha consumato un tentativo,
  il secondo no. Portano segni di richiamo diversi (`†` contro `·`), parole diverse e tacche
  diverse, perché dopo un'interruzione è esattamente la distinzione che serve per decidere se
  rilanciare.

- **La postilla sparisce dalla riga rilevata, non dalla riga fallita.** Un titolo che nessuna
  fonte ha trovato è *ancora* obsoleto: togliergli «da aggiornare» sarebbe una bugia sulla
  riga. La tabella continua a dire lo stato del dato; il consuntivo dice l'esito del tentativo.
  Sono due affermazioni diverse e vivono in due posti diversi.

- **«In aggiornamento» è la terza variante della postilla di US-034**, non un elemento nuovo:
  stessa cella, stessa riga propria sotto l'istante, stesso maiuscoletto minuto. Cambia la
  parola e il segno di richiamo (`↻` contro `†` contro `—`), e la riga prende un segno di
  margine in ottone, come la matita del revisore sul rigo che sta controllando. Le cifre
  restano quelle d'archivio: la riga non si svuota mentre si aspetta, com'era già la regola
  della scheda titolo in US-030.

- **Il valore totale si riscrive con le righe, non a fine corsa.** La cifra grande in testa,
  i due totali in calce e la colonna del registro in testata cambiano dopo *ogni* titolo
  rilevato. Congelarli fino alla fine renderebbe l'attesa priva di riscontro; annebbiarli
  sarebbe peggio, perché toglierebbe l'unico dato che c'è mentre si aspetta.

- **Il conteggio del riquadro scende durante la corsa.** Nel fotogramma di `index.html` dice
  già «2 titoli su 11», non «3»: il primo titolo è stato rilevato e il conteggio non aspetta
  la fine del lavoro per accorgersene. È anche ciò che rende leggibile il consuntivo dopo
  un'interruzione — quanto resta si legge nel riquadro, non confrontando le date a mano.

- **«Chiudi il consuntivo» esiste perché il consuntivo deve poter finire.** Non è fra i
  criteri di accettazione, ma un riquadro d'esito senza congedo resta a schermo per sempre o
  sparisce da solo mentre lo si legge; entrambe le cose sono peggio di un bottone discreto.

## Il fotogramma di `index.html`

La pagina è servita **ferma** sull'istante «2 di 3», che è lo stato che la spec chiede di
mostrare: una pagina che parte da sola lo perderebbe dopo un secondo. `app.js` adotta quel
fotogramma come istante corrente tenuto in pausa, così che «Interrompi» funzioni davvero
(premendolo si vede l'interruzione attendere la risposta del titolo in corso) e «Rigioca la
corsa» possa rifare il percorso dall'inizio. Gli intervalli sono compressi a un secondo e
mezzo per titolo; la nota nella riga di lavoro dichiara i tempi veri.

## Numeri e formati

Le date in tabella sono nel formato che il registro usa davvero (`gg/mm/aaaa hh:mm`, come
`dataRilevamento` di US-032), non nella numerazione romana delle testate decorative.

Le cifre tornano, e tornano a ogni passo della corsa: valore di carico €&nbsp;91.676,55 fisso,
valore attuale €&nbsp;114.225,90 prima della corsa → €&nbsp;114.476,70 dopo il primo titolo →
€&nbsp;114.515,20 a lavoro concluso, con la differenza che segue esattamente gli stessi salti
(+22.549,35 → +22.800,15 → +22.838,65). Il secondo titolo fallisce e infatti non muove nulla.
Il confronto fra la schermata di prima e quella di dopo è verificabile a mano riga per riga.

Gli 8 titoli non obsoleti sono rilevati alla chiusura di venerdì 07.VIII.2026 e il registro è
consultato sabato 08.VIII.2026: nessuna sessione si è conclusa da allora, e nessuno di essi
viene mai chiesto alla fonte.
