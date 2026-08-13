# US-043 — Mostrare il P&L realizzato congelato accanto al P&L latente

Mockup del **quadro del risultato**: il blocco che, nella linguetta *Riepilogo*, separa il
guadagno già incassato da quello ancora sulla carta (EP-008, FR-025, ADR-009).

Lo stile è quello del libro mastro già in uso. `shared.css` è quello di `US-042` copiato ed
**esteso in coda** con la sezione «US-043»: nessuna regola preesistente è stata riscritta.
Stessa carta, stessa rigatura, stesso margine rosso, stessi bottoni, stessa larghezza di
foglio (1440px).

Due trascrizioni vanno dichiarate, perché non sono invenzioni ma riporti:

- il **riquadro del valore totale** (`.riquadro-valore-totale`, `.nota-mancante`,
  `.timestamp-totale`) è copiato **parola per parola** da `US-014/shared.css`. US-042 non ne
  aveva bisogno e quindi non lo portava con sé, ma il quadro del risultato gli si dispone
  sotto e non avrebbe senso mostrarlo senza;
- la nota «Valore parziale» è riportata identica anche sotto `.quadro-risultato`, dove la
  regola di US-014 non arriva perché è annidata sotto il proprio riquadro. La disciplina del
  dato parziale dev'essere **la stessa** nei due blocchi — è metà del criterio 3.

Tutto il resto riusa le classi che c'erano già: `.mastro`, `.cifra`, `.euro`, `.guadagno`,
`.perdita`, `.dato-mancante`, `.cartiglio`, `.sezione-titolo`, `.avviso-successo`,
`.prima-dopo`.

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | Il riepilogo **dopo la vendita**, con il mercato fermo a €&nbsp;12,5000: le tre cifre (+&nbsp;400,00 / +&nbsp;1.620,00 / +&nbsp;2.020,00), la percentuale sulla base dichiarata, la postilla sulla liquidità e il cartiglio che dimostra l'invariante *prima/dopo*. | **1**, **2**, **4**, **5**, **6** |
| `nuova-rilevazione.html` | Sopraggiunge una rilevazione a €&nbsp;12,9000: il latente e il totale si muovono, il realizzato resta **identico al centesimo**. Ogni cifra porta la propria striscia di *moto*. | **2**, **1**, **5** |
| `casi-limite.html` | Tre stati d'archivio affiancati: nessuna vendita iscritta, titolo interamente venduto, prezzo mancante su posizione detenuta. In coda, la legenda dei **due zeri**. | **3**, **1**, **5**, **6** |
| `shared.css` | `US-042/shared.css` + sezione US-043: `.quadro-risultato` con `.somma`/`.voce-pl`/`.operatore`, `.cifra-pl`, `.verdetto`, `.sigillo`, `.moto`, `.percentuale` + `.base-percentuale`, `.postilla-liquidita`, `.conteggio`, `.trittico`/`.caso`/`.premessa`, `.zero-misurato`, `.legenda-zeri`. |

## Lo scenario, ed è deliberatamente quello di US-042

Stesso titolo, stesse cifre, così che le due serie di pagine si leggano in continuità.

| | |
|---|---|
| Carico n. 1 | 12.IV.2023 · **600** quote a €&nbsp;9,8000 = €&nbsp;5.880,00 |
| Carico n. 2 | 07.II.2025 · **400** quote a €&nbsp;11,5000 = €&nbsp;4.600,00 |
| Costo di **tutti** i carichi | €&nbsp;10.480,00 — è la base della percentuale (criterio 5) |
| Scarico | 03.VI.2026 · **400** quote a €&nbsp;12,5000 — LIFO consuma tutto il carico n. 2 |
| Costo attribuito · ricavo | €&nbsp;4.600,00 · €&nbsp;5.000,00 → **P&L realizzato + €&nbsp;400,00** |
| Residuo | **600** quote · costo residuo €&nbsp;5.880,00 |

L'identità che US-042 già scriveva in fondo alla fascia dei lotti — **4.600,00 + 5.880,00 =
10.480,00** — qui torna sotto la percentuale, come sua base dichiarata: è lo stesso numero
letto due volte, prima come attribuzione e poi come denominatore.

### Le cifre di ciascuna pagina

| | `index.html` (€ 12,5000) | `nuova-rilevazione.html` (€ 12,9000) |
|---|---|---|
| Valore attuale (600 quote) | € 7.500,00 | € 7.740,00 |
| P&L realizzato | **+ € 400,00** | **+ € 400,00** *(invariato)* |
| P&L latente | + € 1.620,00 | + € 1.860,00 *(+ € 240,00)* |
| P&L totale | **+ € 2.020,00** | **+ € 2.260,00** |
| Percentuale su € 10.480,00 | +19,27 % | +21,56 % |

E i tre casi limite:

| | Realizzato | Latente | Totale | Percentuale |
|---|---|---|---|---|
| I · nessuna vendita iscritta (1.000 quote a € 12,5000) | **€ 0,00** | + € 2.020,00 | + € 2.020,00 | +19,27 % su € 10.480,00 |
| II · interamente venduto (400 a 12,50 + 600 a 12,90) | + € 2.260,00 | **€ 0,00** | + € 2.260,00 | +21,56 % su € 10.480,00 |
| III · prezzo mancante su Enel (600 ETF + 500 Enel) | + € 400,00 *(completo)* | + € 1.620,00 *(parziale)* | + € 2.020,00 *(parziale)* | **«–»** |

Una coincidenza che vale la pena notare, e che il caso II sfrutta: vendere **tutto** a
€&nbsp;12,9000 dà +21,56 %, esattamente la percentuale che `nuova-rilevazione.html` mostra a
titolo ancora interamente detenuto allo stesso prezzo. La vendita ha spostato l'intero
risultato dal latente al realizzato **senza cambiarlo** — la stessa tesi di `index.html`,
portata al caso totale.

---

## Le decisioni di disegno, e perché

### Perché il quadro sta dove sta

**Subito sotto il riquadro del valore totale, sopra la tabella dei titoli.** È la posizione
ipotizzata nella spec, ed è quella che ho tenuto — non per adesione, ma perché regge a tre
prove:

1. **Il valore attuale è uno *stock*, il risultato è la sua *misura*.** Sono la stessa
   grandezza letta due volte: quanto il conto tiene, e quanto quel tenere è valso. Metterli a
   contatto li rende un blocco solo, e il quadro eredita il telaio del riquadro sopra —
   bordo a doppio filo, fascia di colore a sinistra, ombra portata — perché sono due righe
   dello stesso conto, non due componenti diversi impilati.
2. **Fra i due c'è una discrepanza che va spiegata proprio lì.** Il valore attuale è sceso da
   €&nbsp;12.500,00 a €&nbsp;7.500,00 dopo la vendita, e nulla, sopra, dice dove siano finiti i
   €&nbsp;5.000,00. La risposta è il P&L realizzato, ed è il criterio 6. La **postilla sulla
   liquidità** occupa perciò tutta la larghezza in fondo al quadro, sotto una riga piena: è la
   cerniera fra il riquadro sopra e le tre cifre qui. In fondo alla pagina sarebbe una nota;
   qui è una risposta.
3. **La tabella qui sotto ne è la verifica.** Il totale della colonna *Differenza*
   (+&nbsp;1.620,00) è, al centesimo, il P&L latente del quadro. La chiosa del latente lo
   dichiara e la postilla sotto la tabella lo ripete dal lato opposto: *la colonna Differenza
   misura il solo latente; il realizzato non ha riga perché non appartiene a una giacenza,
   nasce dalle iscrizioni di scarico*. Se il quadro stesse **sotto** la tabella questa
   riconciliazione andrebbe letta a ritroso; sopra, la tabella diventa il dettaglio di una
   delle tre cifre appena lette.

Il riquadro di aggiornamento dei titoli obsoleti (US-034/US-035) non è riprodotto — US-043
non lo tocca — ma la sua posizione non cambia: il quadro si inserisce **prima** di esso.

### Perché le tre cifre sono disposte così

**La somma è scritta, non sottintesa.**

```
[ P&L realizzato ]   +   [ P&L latente ]   ═   [ P&L totale ]
```

Tre caselle e due operatori veri fra loro. L'alternativa ovvia — tre riquadri uguali
affiancati — direbbe che le cifre sono tre grandezze omogenee da confrontare, e sono invece
**due addendi e un risultato**. Con l'operatore in mezzo, il criterio 1 («il totale pari alla
somma dei due») non è una promessa da verificare altrove: si legge nella disposizione.

La casella del totale sta **oltre una doppia riga verticale** (`border-left: 3px double`), che
è la stessa doppia riga con cui il mastro chiude una colonna (`.mastro tfoot { border-top: 3px
double }`) girata di novanta gradi, e ha lo stesso fondo verde tenue del `tfoot`. Chi legge il
registro riconosce la convenzione senza spiegazioni: oltre la doppia riga c'è il totale.

L'ordine **realizzato → latente → totale** non è alfabetico né per grandezza: è cronologico e
poi logico. Il realizzato è ciò che è già accaduto, il latente ciò che ancora dipende dal
mercato, il totale la loro somma. È anche l'ordine in cui il criterio 1 li nomina.

Sotto ciascuna cifra, tre livelli in scaletta fissa: la **cifra**, il **verdetto** (una parola
in un riquadro), la **chiosa** (che cosa la cifra misura e da che cosa *non* dipende). Solo la
casella del totale ne ha un quarto, la **percentuale con la base scritta sotto**: una
percentuale senza base dichiarata è un numero senza unità di misura, e il criterio 5 esiste
perché quella base è precisamente il punto controverso.

Nel trittico dei casi limite, dove lo spazio orizzontale scarseggia, la somma si rialza in
colonna: stessi tre nomi, stesso ordine, e la doppia riga torna dov'è di casa nel mastro,
cioè **sopra** il totale. Non è un layout diverso, è la stessa somma vista da un'altra
angolazione.

### Guadagno e perdita senza affidarsi al colore

Ogni cifra porta **tre** segnali ridondanti, e il colore è il terzo:

1. il **segno** `+` / `−` scritto davanti al numero;
2. la **parola** nel riquadro del verdetto — «guadagno incassato», «guadagno sulla carta»,
   «guadagno complessivo» — che riusa `.guadagno`/`.perdita` del mastro e ne eredita il
   triangolo ▲/▼;
3. il **colore** verde/carminio.

Tolto il colore restano segno, glifo e parola. La stessa disciplina vale per le strisce di
*moto*, che differiscono per bordo (punteggiato / pieno), glifo (`=` / `↕`) e parola
(«invariato» / «mosso»), non per tinta.

### Lo zero misurato e il dato assente

È metà della specifica, e la tipografia li separa prima ancora del testo:

| | Zero misurato | Dato assente |
|---|---|---|
| Segno | `€ 0,00` in **Playfair nero**, cifra come tutte le altre (`.zero-misurato`) | `–` in corsivo seppia (`.dato-mancante`, la classe che c'era già) |
| Dichiarazione | verdetto **neutro** che dice *perché*: «nessuna vendita iscritta», «nessuna quota residua» | nota «Valore parziale» che dice *che cosa* manca e *che cosa* il totale di conseguenza esclude |
| Dove compare | caso I (realizzato), caso II (latente) | caso III (latente di Enel, e percentuale del totale) |

Il verdetto neutro ha bordo **punteggiato** e non pieno: anche la cornice dice che quella
cifra non è un giudizio di guadagno o perdita, è una constatazione.

Il caso II è quello che la distinzione rende non ambiguo: il prezzo corrente del titolo
interamente venduto **non è in archivio** (colonna *Prezzo attuale*: «–»), eppure il latente
vale `€ 0,00` e non «dato non disponibile». Zero quote valgono zero qualunque sia il prezzo:
è l'unico caso in cui un prezzo assente non produce un'assenza, e la chiosa lo scrive.

Il caso III fa il percorso inverso e per questo la **percentuale del totale è «–»**. La base
sarebbe €&nbsp;13.580,00 — costo di tutti i carichi delle due posizioni — ma il numeratore non
copre la posizione priva di prezzo: un rapporto fra numeratore parziale e base intera è una
cifra falsa, e ADR-003 non la ammette. Al suo posto la dichiarazione, più una cifra che invece
*è* interamente calcolabile: il realizzato sulla propria base, +&nbsp;€&nbsp;400,00 su
€&nbsp;4.600,00 di costo attribuito, cioè **+8,70 %**. Serve a mostrare che l'incompletezza è
circoscritta e non contagia il realizzato.

### Come si vede a colpo d'occhio che il realizzato non si è mosso

Due dispositivi, uno costante e uno di confronto.

**Il sigillo** (`.sigillo`) sta **solo** sulla casella del realizzato, in ogni pagina, e porta
sempre la stessa data: *«✽ congelato il 03.VI.2026»*. Bordo tratteggiato carminio, leggermente
ruotato, come un timbro apposto a mano. È la forma più corta di dire che quella cifra ha una
data di nascita e non ne avrà altre. Che sia **identico** fra `index.html` e
`nuova-rilevazione.html` è parte del messaggio: passando da una pagina all'altra il timbro non
cambia, mentre tutto il resto sì.

**Le strisce di moto** (`.moto`) compaiono in `nuova-rilevazione.html` sotto ciascuna delle
tre cifre, e sono la dimostrazione vera e propria:

| | Bordo | Etichetta | Contenuto |
|---|---|---|---|
| Realizzato | punteggiato seppia | `= invariato al centesimo` | prima **+ € 400,00** · ora **+ € 400,00** |
| Latente | pieno carminio | `↕ mosso dal rilevamento` | ~~+ € 1.620,00~~ → **+ € 1.860,00** (+ € 240,00) |
| Totale | pieno carminio | `↕ mosso per intero dal latente` | ~~+ € 2.020,00~~ → **+ € 2.260,00**; ~~+19,27 %~~ → **+21,56 %** |

Le due strisce carminio *si accendono* e quella seppia resta spenta: la lettura avviene per
contrasto di trattamento, prima che per lettura di cifre. Il valore barrato accanto a quello
nuovo riusa la convenzione che US-042 aveva già introdotto per il prezzo medio ricalcolato
(`.prima-dopo s`) — anche lì il fatto era il *cambiamento*, non la cifra.

Il cartiglio in fondo alla stessa pagina chiude il ragionamento a parole: se anche il
realizzato si muovesse, la stessa vendita cambierebbe valore ogni giorno e il numero
smetterebbe di rispondere alla domanda che gli si pone — *quanto ho realmente incassato* — per
rispondere a un'altra, *quanto avrei incassato vendendo oggi*.

### L'invariante del criterio 4, mostrato prima ancora che testato

`index.html` porta un cartiglio con due conteggi affiancati, incolonnati come in un
brogliaccio, a prezzo di mercato fermo a €&nbsp;12,5000:

| Prima dello scarico (1.000 quote) | Dopo lo scarico (600 quote) |
|---|---|
| latente + € 2.020,00 · realizzato 0,00 | latente + € 1.620,00 · realizzato + € 400,00 |
| **totale + € 2.020,00** | **totale + € 2.020,00** |

Vendere a prezzo di mercato **sposta** valore dal latente al realizzato: non lo crea né lo
distrugge. È la frase che la spec chiede di mettere nel foglio, ed è il titolo del cartiglio.

Il conteggio serve anche a mostrare perché la base della percentuale dev'essere il costo di
*tutti* i carichi: con quella base la percentuale resta +19,27 % da entrambi i lati. Se fosse
il solo costo residuo — €&nbsp;5.880,00 — lo **stesso identico** P&L totale di €&nbsp;2.020,00
varrebbe +34,35 %, e la percentuale salterebbe per il solo fatto d'aver venduto. È
precisamente ciò che il criterio 5 vieta.

Si noti che il conteggio «prima dello scarico» scrive il realizzato come `0,00` e non come
«–»: è già, in miniatura, il caso I del trittico.

## Che cosa questi mockup **non** mostrano, di proposito

- La **sezione Posizioni chiuse** è US-044. Nel caso II il titolo resta perciò elencato con
  quantità 0 nella tabella del riepilogo, e il suo realizzato entra regolarmente nel quadro:
  una riga sparita senza che nulla lo dichiari sarebbe la variante peggiore di un dato
  mancante.
- Il **dettaglio per titolo** del realizzato. Il criterio 1 chiede le tre cifre nel riepilogo
  *del portafoglio*; una colonna «Realizzato» nella tabella dei titoli sarebbe un'altra
  specifica, e in questa pagina introdurrebbe una quarta cifra da riconciliare senza che
  nessun criterio la richieda.
- La **quantità detenuta a una data** e ogni effetto sul grafico: è US-045.
