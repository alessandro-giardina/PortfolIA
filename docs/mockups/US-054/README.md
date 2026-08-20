# US-054 — Quadro strumenti: iscrizione carichi e scarichi

Mockup isolato: **nessuna riga di questo prototipo tocca il codice dell'applicazione**.
È la scheda «Carico titoli» di un portafoglio nella direzione visiva «Quadro strumenti» —
sorella del riepilogo in [`../US-051/`](../US-051/), della scheda titolo in
[`../US-052/`](../US-052/), dell'elenco portafogli in [`../US-053/`](../US-053/) e della
ricerca titoli in [`../US-055/`](../US-055/).

## Schermate

| File | Che cosa mostra |
|---|---|
| `index.html` | **Carico titoli** — modulo di iscrizione di un carico, modulo di scarico, fascia dei lotti (LIFO), residuo dopo la vendita, titoli iscritti a conto e registro cronologico delle iscrizioni |

`shared.css` e `app.js` sono la copia autosufficiente della cartella US-055 (a sua volta copia
di US-053 → US-051): ciascuna cartella `US-*` porta la propria copia, come in tutto questo
repository. Questa copia aggiunge in coda tre sezioni nuove — **22 (i due moduli di
iscrizione)**, **23 (la fascia dei lotti)** e **24 (registro e residuo)**.

## I sette stati, tutti ispezionabili

Il commutatore in cima al contenuto («solo nel mockup») mostra uno stato alla volta senza
bisogno di un server. Nell'app lo stato lo decide il registro.

| Stato | Che cosa si vede |
|---|---|
| Registro vuoto | modulo di carico vuoto, nessun titolo a conto, nessuna iscrizione, «nulla da scaricare» |
| Da ricerca | arrivo da «Aggiungi a portafoglio»: denominazione in sola lettura, ISIN e prezzo precompilati |
| Modulo rifiutato | avviso critico con il conteggio delle voci non valide + i tre errori inline accanto ai campi che li hanno prodotti |
| Carico iscritto | avviso sereno con l'operazione iscritta, tabelle popolate |
| Scarico iscritto | avviso di scarico, tre carte del residuo con il *prima* di ogni cifra, riga di scarico nuova nel registro |
| Rettifica in linea | la riga del registro diventa modificabile *dentro la tabella*, con i suoi tre campi in linea |
| Senza giacenze | il modulo di scarico dichiara che non c'è nulla da vendere invece di mostrare campi inutili |

Il modulo di carico è anche vivo: premendo «Iscrive nel registro» il mockup applica la stessa
validazione di **forma** dell'app (ISIN di 12 caratteri, data presente, prezzo positivo,
quantità positiva con al più sei decimali) e commuta fra «Carico iscritto» e «Modulo rifiutato».
Cambiando la data nel modulo di scarico, la fascia dei lotti reagisce: i lotti successivi si
dichiarano fuori data. Nel mockup la legenda in fondo alla fascia non viene ricalcolata —
nell'app la calcola `rigiocaRegistro`, la stessa funzione pura che il server usa per iscrivere
la vendita.

## Interazioni disponibili

- toggle tema chiaro/scuro (memorizzato in `localStorage`, condiviso con le altre cartelle);
- commutatore degli stati della schermata;
- invio del modulo di carico con validazione di forma e transizione di stato;
- scelta del titolo nel modulo di scarico → la giacenza accanto alla `select` e l'ISIN della
  fascia seguono la scelta;
- data di vendita → i lotti successivi a quella data si dichiarano **fuori data** invece di
  sparire;
- «Modifica» su una riga del registro → rettifica in linea, con «Salva» e «Annulla».

## Le tre idee di questa schermata

### 1. Carico e scarico sono lo stesso oggetto, tranne il verso

I due moduli condividono griglia, unità di misura dentro i campi, note e forma degli errori.
Cambia una cosa sola, ed è l'unica che deve essere impossibile confondere: il **verso**
dell'operazione — un filo blu contro un filo carminio in cima al pannello, la pillola del verso
nella testa, il colore del bottone d'invio. Due griglie diverse per un'operazione e la sua
inversa costringerebbero a rileggere il modulo ogni volta.

Il carminio è `--rosso-mastro`, il rosso del margine del Libro Mastro ridotto ad accento e già
presente fra i token dal riepilogo: il verso di uscita porta lo stesso colore nei due design.

### 2. La quantità è la larghezza

LIFO è un *ordine*, e un ordine si mostra disponendo le cose. I lotti stanno uno sotto l'altro
dal più recente al più antico — l'ordine esatto in cui il criterio li consuma — e dentro ogni
barra le due quote sono **proporzionali alla quantità**: il rapporto fra consumato e residuo si
legge senza aritmetica. Una barra a larghezza fissa con la cifra scritta dentro costringerebbe a
fare il conto a mente, che è esattamente ciò che la fascia esiste per evitare.

La proporzione è *dentro* il lotto, non *fra* lotti: ogni barra occupa la stessa corsia, e la
quantità totale del lotto è scritta nella targa a sinistra. È la stessa scelta del componente
già in produzione (`FasciaLifo`), e mantenerla evita che le due direzioni visive mostrino due
attribuzioni diverse degli stessi dati.

Il lotto successivo alla data di vendita non è nascosto: è dichiarato fuori data, tratteggiato.
Sparire direbbe «non esiste»; comparire tratteggiato dice la cosa vera — «esiste, ma non a
quella data» — che è precisamente la ragione per cui una vendita antedatata viene rifiutata.
Averla *prima* dell'invio rende la spiegazione anticipata invece che postuma.

### 3. Il vincolo si spiega accanto al comando che blocca

Un carico consumato da una vendita non si rettifica. Il registro non nasconde il comando e non
lo spiega in un tooltip: lo mostra spento, con accanto il **perché**, in ambra e per esteso
(«consumato in parte (7 quote su 18) da una vendita: si rettifica solo un'iscrizione errata»).
Un vincolo che si spiega solo al passaggio del mouse non si spiega affatto su un telefono, e
questo vincolo è la regola centrale del registro.

## Che cosa è nuovo e che cosa è già in casa

Riusato senza aggiunte: `.pannello`/`.testa-pannello`/`.corpo-pannello` (sezione 6),
`.avviso` con `.sereno` e `.critico` (10), `table.dati` con `.voce-titolo` e `.cifra` (11),
`.placeholder-quadro` (18), `.pillola` (9), `.segmentato` e i bottoni (8), `.et-sezione` (5).

Nuovo, e limitato a ciò che nessuna sezione copriva:

1. **la griglia dei campi con l'unità dentro il campo** (`.griglia-campi`, `.campo-modulo`,
   `.guscio-campo`, `.unita-campo`) — «EUR» accanto alla cifra e non due righe sopra;
2. **la fascia dei lotti** (`.fascia-lifo-quadro` e discendenti) — l'unico disegno di questa
   schermata, e l'elemento che si ricorda;
3. **il registro come registro** (`.marca-iscrizione`, `tr.riga-nuova`, `tr.lotto-esaurito`,
   `.perche-impedito`, `.campo-inline`) — la marca del verso su ogni riga, la riga appena
   iscritta che si annuncia, il lotto esaurito che resta a registro attenuato invece di
   sparire, e la rettifica che vive nella riga;
4. **le tre carte del residuo** (`.griglia-residuo`, `.carta-residuo`) — per ogni cifra il suo
   *prima*, barrato: la vendita non riscrive nulla, ricalcola.

## Coerenza aritmetica

Le cifre del mockup sono coerenti fra loro, non decorative: tre carichi (12 + 20 + 18 = 50
quote, € 505,08 di costo), una vendita di 7 quote al 04/06/2026 che il criterio LIFO attribuisce
al carico n. 3 — il più recente. Da qui il residuo di 43 quote, il costo attribuito di € 72,87,
il costo residuo di € 432,21 e l'identità stampata in fondo alla fascia:
`72,87 + 432,21 = 505,08`. Chi legge il mockup può rifare i conti.
