# US-039 — Commutare il grafico fra prezzo unitario e valore della posizione

Mockup del secondo comando che sormonta il grafico del titolo: quello che decide
**che cosa la curva misura** (EP-007, FR-017, ADR-003).

Il grafico è **lo stesso di US-036/US-037/US-038** — stessi segni, stessa cornice
quadrettata, stesso tratteggio, stesso SVG scritto a mano senza librerie di
charting e senza script. US-039 gli aggiunge una **seconda traversa** sopra quella
della scala e i segni che la vista valore porta con sé. `shared.css` è quello di
US-038, esteso in coda con la sezione «US-039»: nessuna regola preesistente è
stata riscritta.

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | La **vista valore della posizione**: il commutatore con «Valore della posizione» attivo, l'ordinata del controvalore ancorata a zero, il **gradino verticale** del secondo carico misurato e dichiarato *capitale versato €&nbsp;8.544,00 — non è rendimento*, la fascia a gradini della quantità detenuta sotto l'asse dei tempi, il fantasma barrato del carico retroagito e la legenda con la voce del prezzo medio **soppressa e motivata**. | **1**, **3**, **4**, **5** |
| `vista-prezzo.html` | La **stessa scheda, stessa finestra, stessi quattro punti** nella vista predefinita del prezzo unitario. Al 4.III.2023 il tracciato non salta: un cartiglio lo dichiara (*nessun gradino*), e la riga d'ottone è al suo posto con la quota dello scarto. Il confronto fra le due pagine isola una sola differenza di sostanza. | **1**, **2**, **5** |
| `casi-limite.html` | I due casi in cui la serie valore non può esistere: **(a)** rilevazioni anteriori al primo carico, in un confronto a due riquadri sulla stessa scala; **(b)** titolo senza alcun carico, che dichiara *dato non disponibile* invece di tracciare una retta piatta a zero — con quella retta disegnata e barrata. | **3** |
| `shared.css` | `US-038/shared.css` copiato e **esteso**: `.barra-vista`, `.commutatore-vista`, `.sigillo-indipendenza`, `.dichiarazione-gradino`, `.cosi-no`, `.voce-legenda.soppressa` / `.segna-soppressa`, `.confronto-viste` / `.riquadro-vista`, `.caso-limite`, `.bilancia.ridotta`. |

## Lo scenario, ed è uno solo

Le prime due pagine descrivono **lo stesso titolo nello stesso istante**, perché è
il confronto a dimostrare la storia. I numeri discendono da quelli di US-036:

| | |
|---|---|
| 1º carico | 19.IX.2021 · **80** quote a €&nbsp;58,4000 = €&nbsp;4.672,00 |
| 2º carico | 4.III.2023 · **120** quote a €&nbsp;71,2000 = €&nbsp;8.544,00 |
| Rilevazioni | 7.VIII.2026 €&nbsp;126,9000 · 10.VIII.2026 €&nbsp;128,4600 |
| Prezzo medio ponderato | €&nbsp;66,0800 su 200 quote (capitale versato €&nbsp;13.216,00) |
| Valore attuale | €&nbsp;25.692,00 — che è, alla cifra, l'ultimo punto della curva |

## Due comandi, due traverse, due sigilli

Il commutatore sta **sopra** il selettore della scala, perché la prima domanda
contiene la seconda: si sceglie una grandezza, poi la si guarda su una finestra.
Le due traverse condividono la meccanica dei bottoni — stessa carta, stesso
rilievo, stessa ombra: sono comandi della stessa specie — e si distinguono per il
**sigillo del bottone scelto**:

| Gruppo | Bottone attivo |
|---|---|
| Vista (US-039) | inchiostro con filo d'**ottone** |
| Scala (US-037) | panno **verde** con filo di **carminio** |

Fra le due corre il *sigillo d'indipendenza*, che scrive quello che il colore
suggerisce: commutare la vista non tocca la scala, e viceversa. Per dimostrarlo,
entrambe le pagine tengono attiva **«Ultimi 5 anni»**, che *non* è la predefinita:
la postilla «predefinita» resta visibile su «Tutto lo storico», spento. Se il
commutatore reimpostasse la scala, si vedrebbe.

## Il gradino, e perché è pieno

Nella vista valore il 4.III.2023 la curva salta da €&nbsp;5.696,00 (80 quote al
prezzo del giorno) a €&nbsp;14.240,00 (200 quote allo stesso prezzo). Il salto vale
€&nbsp;8.544,00, cioè **esattamente** il prezzo di carico per le quote nuove: è
denaro entrato, non prodotto dal mercato.

Il gradino è l'**unico tratto pieno** del disegno. Tutti gli altri segmenti restano
tratteggiati perché fra due punti l'archivio non possiede alcun prezzo (ADR-003);
il gradino invece ha larghezza zero nel tempo — fra i suoi due capi non passa un
solo giorno ignoto — ed è un fatto registrato, non un'ipotesi. Il pieno non è una
decorazione: è la distinzione fra *quello che il registro sa* e *quello che il
registro tace*.

Tre dispositivi lo dichiarano, in ordine di lettura: la **quota di misura** con
cartellino dentro il grafico, la **fascia a gradini della quantità detenuta**
sotto l'asse dei tempi (80 quote fino al 4.III.2023, 200 da allora), e il
cartellino `.dichiarazione-gradino` sotto la cornice, che porta la cifra, il conto
che la produce e la lettura da non fare.

## Il fantasma «così no»

Applicare a ogni data la quantità posseduta *oggi* è la scorciatoia comoda e
falsa: il punto del 2021 passerebbe da €&nbsp;4.672,00 a €&nbsp;11.680,00 e il
gradino svanirebbe, spalmato all'indietro su cinque anni come se fosse crescita.
Quella curva è disegnata — tratteggiata, in carminio, barrata — dentro il grafico,
e spiegata a parole nel riquadro `.cosi-no` sotto.

È un segno riusato: la stessa grammatica torna in `casi-limite.html` per la retta
piatta a zero. Mostrare la lettura sbagliata accanto a quella giusta costa poco
spazio e chiude la questione meglio di qualunque nota.

## La riga d'ottone che sparisce

Nella vista valore la riga orizzontale del prezzo medio ponderato di carico **non
compare**, e la legenda tiene comunque il suo posto: voce barrata, timbro *assente
per scelta in questa vista*, e la ragione scritta accanto — €&nbsp;66,0800 è un
prezzo *per quota*, e su un'ordinata che porta controvalori non individua nessun
livello. Un'assenza dichiarata non è una dimenticanza; un'assenza silenziosa
sembra un difetto.

Simmetricamente, in `vista-prezzo.html` la stessa voce porta il timbro *solo in
questa vista*: le due pagine si rispondono.

## Perché lo zero, e perché soltanto qui

La scala della vista valore parte da **zero**; quella del prezzo unitario resta
ancorata alle quotazioni osservate, come in US-036. La ragione è una sola: su una
grandezza assoluta, tagliare la base ingrandirebbe di nascosto proprio il gradino,
che è il fatto che quella pagina deve misurare onestamente.

## La regola dei casi limite

> Una quantità che non esiste non è una quantità pari a zero.

Ogni punto della serie valore è `prezzo × quantità detenuta a quella data`. Quando
il secondo fattore non esiste, il prodotto non vale zero: non è definito. Uno zero
affermerebbe che la posizione c'era e non valeva niente. Perciò:

- **(a)** le rilevazioni anteriori al primo carico sono **escluse** dalla serie —
  non portate a zero — e l'esclusione è dichiarata due volte: con la campitura
  obliqua sulla zona e con i cerchi vuoti barrati nella striscia sotto l'asse. Il
  riquadro affiancato della vista prezzo mostra gli stessi punti al loro posto,
  perché il prezzo di una quota esiste anche prima che tu la compri. Portarli a
  zero farebbe somigliare quei 98 giorni a un guadagno del 100 % mai avvenuto.
- **(b)** un titolo senza alcun carico non produce un grafico vuoto ma il timbro
  **dato non disponibile**, con la ragione accanto e il rimando alla vista del
  prezzo. Il bottone della vista resta *attivo e selezionabile* — un bottone
  spento non spiega perché è spento — e porta il carminio, come fa quello della
  scala in US-037 quando la finestra è priva di dati.

La differenza fra questo stato e la «finestra priva di dati» di US-037 è
sostanziale, e la pagina la nomina: là i dati esistono ma cadono fuori
dall'intervallo, e il rimedio è una scala più ampia; qui la serie non esiste per
**nessun** intervallo, e il rimedio è un carico.

## Che cosa il commutatore non tocca

La bilancia di US-038 compare in forma ridotta in entrambe le viste, con le
cifre identiche e il segnalino *non dipende dalla vista*: il P&L da carico
(+€&nbsp;12.476,00) e la variazione di periodo (+€&nbsp;1,5600 per quota) non
sanno nulla di quale grandezza la curva stia tracciando. Serve a chiudere per
esclusione l'unica differenza che conta — il gradino.

Cambiare vista, come cambiare scala, non interroga la fonte e non aggiunge punti:
le due curve nascono dagli **stessi quattro punti d'archivio**, letti una volta
come euro per quota e una volta come euro di controvalore.
