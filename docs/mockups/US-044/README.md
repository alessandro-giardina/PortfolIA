# US-044 — Elencare le posizioni chiuse in una sezione dedicata

Mockup della **sezione «Posizioni chiuse»**: il complemento della tabella dei titoli
posseduti, per i titoli che il conto ha venduto per intero (EP-008, FR-026, FR-013).

Lo stile è quello del libro mastro già in uso. `shared.css` è quello di `US-043` copiato ed
**esteso in coda** con la sezione «US-044»: nessuna regola preesistente è stata riscritta.
Stessa carta, stessa rigatura, stesso margine rosso, stesso foglio a 1440px.

Una trascrizione va dichiarata, perché non è un'invenzione ma un riporto: `.stato-vuoto` e la
sua famiglia (`.ornamento`, `.titolo-vuoto`, `.desc-vuoto`, `.timbro-vuoto`) sono copiati
**parola per parola** da `US-017/shared.css`. Né US-042 né US-043 ne avevano bisogno, quindi
non li portavano con sé; qui invece la tabella dei posseduti può restare vuota per davvero
(`esaurito.html`), e non c'era motivo di disegnare un secondo stato vuoto diverso da quello già
approvato per il portafoglio senza titoli.

Tutto il resto riusa le classi che c'erano già: `.mastro`, `.cifra`, `.euro`, `.guadagno`,
`.riquadro-valore-totale`, `.quadro-risultato` con tutto il suo interno (`.somma`, `.voce-pl`,
`.cifra-pl`, `.zero-misurato`, `.dato-mancante`, `.postilla-liquidita`, `.percentuale`,
`.base-percentuale`), `.cartiglio`, `.coppia`, `.trittico`, `.caso`/`.insegna` (qui riletti come
base di `.pannello`), `.timbro`, `.sezione-titolo`.

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | Il riepilogo **a regime**: la tabella dei titoli posseduti con **sole tre** posizioni (quantità residua > 0), la nuova sezione **Posizioni chiuse** con due righe (ISIN, data di chiusura, quantità venduta, incasso, P&L realizzato), il quadro del risultato che continua a comprendere il realizzato delle posizioni chiuse, e il cartiglio che dichiara perché le due tabelle rispondono a due domande diverse. | **1**, **2**, **3** |
| `riapertura.html` | Il caso limite del **criterio 4**: un estratto solo sul Vanguard, prima (chiuso, in *Posizioni chiuse*) e dopo (un nuovo carico lo riporta nella tabella dei posseduti con un badge «riaperta»), a due pannelli affiancati. | **4** |
| `esaurito.html` | Il caso limite del **portafoglio interamente venduto**: la tabella dei posseduti è vuota (stato vuoto di US-017), il valore attuale totale è **€ 0,00 misurato**, il quadro del risultato è tutto realizzato e nessun latente, e *Posizioni chiuse* porta le cinque posizioni del conto. | **1**, **3** |
| `shared.css` | `US-043/shared.css` + sezione US-044: `.blocco-posizioni-chiuse`, `.mastro.chiuse`, `.capo-chiuse`, `.timbro.carminio`, `.badge-riaperta`, `.nota-storico`, `.trittico.due`/`.pannello`, `.stato-vuoto` (trascritto da US-017). |

## Lo scenario, ed è la continuazione diretta di US-042/US-043

`index.html` riprende **esattamente** il portafoglio «Deposito Titoli Alfa» (n. 004) delle due
specifiche precedenti, portato un passo più avanti nel tempo:

| | |
|---|---|
| Vanguard FTSE All-World (IE00BK5BQT80) | **Chiuso.** Due scarichi, 03.VI.2026 e 10.VIII.2026 — le stesse cifre di US-042/US-043: 1.000 quote vendute, incasso € 12.740,00, realizzato **+ € 2.260,00**. |
| BTP Italia Tf 2,80% Sc2030 (IT0005438004) | **Chiuso.** Un solo scarico, 02.VII.2026: 5.000 quote, incasso € 5.225,00, realizzato **+ € 125,00**. Posizione nuova, introdotta solo per mostrare che la sezione ne ospita più di una. |
| Enel S.p.A., iShares Core MSCI World, Recordati | **Posseduti.** Le stesse tre righe (stesse quantità, stessi prezzi) già canoniche in `libro-mastro/portafoglio.html` — riuso deliberato, non coincidenza: sono lo stesso portafoglio di riferimento visto in un'altra pagina. |

Le cifre del quadro del risultato di `index.html` sono ricostruite da questi numeri, non
inventate a parte:

| | |
|---|---|
| Costo di tutti i carichi (5 posizioni) | € 6.504,00 + € 15.026,00 + € 3.780,00 + € 10.480,00 + € 5.100,00 = **€ 40.890,00** |
| P&L realizzato (2 posizioni chiuse) | € 2.260,00 + € 125,00 = **+ € 2.385,00** |
| P&L latente (3 posizioni possedute, colonna *Differenza*) | € 2.112,00 + € 5.775,00 + € 1.197,00 = **+ € 9.084,00** |
| P&L totale | **+ € 11.469,00** su € 40.890,00 = **+28,04 %** |
| Valore attuale totale (solo posseduti) | € 8.616,00 + € 20.801,00 + € 4.977,00 = **€ 34.394,00** |

`esaurito.html` estende la stessa aritmetica a un'ipotesi: se anche Enel, iShares e Recordati
venissero liquidati, il costo totale dei carichi resterebbe € 40.890,00 (nessun carico è mai
cancellato da una vendita — lo stabilisce già US-042), ma diventerebbe tutto realizzato:
€ 2.396,00 + € 5.974,00 + € 1.320,00 + € 2.260,00 + € 125,00 = **+ € 12.075,00**, cioè
+29,53 % sulla stessa base, con latente **€ 0,00 misurato**.

## Le decisioni di disegno, e perché

### Perché la sezione è un riquadro a sé, non una seconda tabella libera

`.blocco-posizioni-chiuse` avvolge la tabella in un contenitore con una **fascia carminio a
sinistra** — la stessa identica convenzione già in uso in `client/src/ledger.css` per
`.riquadro-residuo.chiuso` (un lotto senza residuo prende l'accento carminio). Non ho introdotto
un colore nuovo per "chiuso": ho riletto quello che l'app già usa altrove per lo stesso concetto,
così che chi la conosce non debba imparare un secondo linguaggio cromatico.

Dentro il riquadro, un **capo** (`.capo-chiuse`) porta il timbro «Sola consultazione» prima
ancora della tabella. È il dispositivo che risponde esplicitamente al punto 1 della consegna
— *rendere visivamente chiaro che questa sezione è informativa/storica, distinta dalla tabella
azionabile sopra* — e l'ho scelto stamp-like (`.timbro.carminio`, la stessa meccanica del
timbro verde «Verificato» già nel mastro) invece che come sottotitolo, perché un timbro si legge
prima del testo, mentre un sottotitolo compete con la `.nota` della `.sezione-titolo` per la
stessa attenzione.

**Perché non un elenco di card, ma un'altra tabella `.mastro`.** La consegna lasciava la scelta
aperta ("tabella o elenco di card"). Ho tenuto la tabella perché le quattro cifre richieste
(ISIN, quantità venduta, incasso, realizzato) sono serie numeriche allineate in colonna, ed è
esattamente ciò per cui `.mastro` — con le sue colonne monospaziate e il tfoot a doppia riga —
esiste già. Introdurre un componente card avrebbe significato disegnare da zero un allineamento
numerico che il mastro offre gratis, per un guadagno visivo che la sezione, essendo
dichiaratamente una consultazione e non un'azione, non richiede.

**Ho aggiunto una colonna: «Chiusa il».** Non è nell'elenco letterale del criterio
("ISIN, quantità complessivamente venduta, incasso e P&L realizzato"), ma è quasi gratuita da un
punto di vista implementativo — è la data dell'ultimo scarico che ha azzerato il residuo, un
dato che il registro possiede già — e rafforza esattamente lo scopo della user story: Giulia
vuole "non perdere la traccia di *che cosa* ha prodotto il guadagno", e una traccia senza una
data è una traccia più debole. Se l'implementazione preferisse ometterla, nessun'altra parte del
mockup ne dipende.

### Perché la tabella dei posseduti non guadagna una colonna «stato»

Un'alternativa plausibile era mantenere un'unica tabella e aggiungere una colonna o un filtro per
distinguere posseduto/chiuso. L'ho scartata perché le due tabelle rispondono a **due domande
diverse** (il cartiglio di `index.html` lo scrive esplicitamente): *che cosa ha il conto oggi* e
*che cosa ha prodotto ciò che non si ha più*. Un filtro dentro la stessa tabella lascerebbe che
la prima domanda debba sempre essere posta insieme alla seconda; due tabelle separate le
rispondono indipendentemente, e la tabella dei posseduti torna a essere — come chiede FR-013 —
la lista di ciò che il conto possiede, senza eccezioni da spiegare a chi legge una singola riga.

### Il caso limite della riapertura: perché «Posizioni chiuse» non è l'archivio permanente

Il criterio 4 chiede che un nuovo carico "riapra la posizione ... senza cancellare la riga
storica delle vendite". `riapertura.html` distingue deliberatamente **due righe diverse** che è
facile confondere:

1. la **riga del registro delle iscrizioni** (US-042) — i due scarichi del 2026, con le loro
   date, prezzi e quantità originarie. Questa non si tocca mai: è la traccia storica vera e
   propria, e la conserva per sempre indipendentemente da qualunque carico successivo;
2. la **riga di *Posizioni chiuse*** — che invece è una lettura *derivata*, filtrata su
   "quantità residua uguale a zero" in questo istante. Quando il nuovo carico porta la quantità
   residua a 250, quella condizione non è più vera, e la riga esce dalla sezione — non perché
   sia stata cancellata, ma perché il filtro che la generava non la seleziona più.

Il pannello «Dopo» lo dice a chiare lettere (`.nota-storico`): il P&L realizzato delle due
vendite pregresse, + € 2.260,00, resta intatto e resta dentro il P&L totale del portafoglio.
Il badge `.badge-riaperta` (↺, ottone, la stessa tinta di "aperto/attivo" già in uso nel mastro)
sta accanto al nome nella tabella dei posseduti — non è una riga speciale con un trattamento
diverso, è una riga come le altre con un'unica informazione in più: che quell'ISIN ha un passato.
Non ho disegnato un badge "chiuso" complementare da mostrare nella sezione delle chiuse, perché
lì il concetto è già portato dall'intero riquadro carminio: sarebbe un'informazione ridondante,
non una seconda.

### Il caso limite del portafoglio interamente venduto: il perimetro dello stato vuoto

`esaurito.html` verifica che lo stato vuoto della tabella dei posseduti — riusato letteralmente
da US-017 — **non trascini con sé** nessun'altra parte della pagina. Un portafoglio appena
creato e un portafoglio interamente liquidato condividono la stessa risposta alla domanda "che
cosa possiedo ora" (nulla), e per questo condividono la stessa illustrazione grafica in quel
punto della pagina; ma il registro dietro le due situazioni non potrebbe essere più diverso, e
il resto della pagina lo dichiara senza ambiguità:

- il **valore attuale totale** è € 0,00, ma è marcato `.zero-misurato` — la stessa distinzione
  tipografica che US-043 ha già introdotto — mai `.dato-mancante`: il conto è stato fatto, ed è
  zero perché non resta nulla, non perché un prezzo sia irreperibile;
- il **quadro del risultato** mostra un realizzato di dodicimila euro e un latente
  esplicitamente `.zero-misurato` con la propria dichiarazione ("nessuna quota residua in
  portafoglio") — non un quadro spento o assente;
- **Posizioni chiuse** porta tutte e cinque le posizioni, con la stessa tabella già vista in
  `index.html`, semplicemente più lunga.

Il cartiglio finale rende esplicito questo confine, perché è il punto più facile da sbagliare
nell'implementazione: riusare un componente per la sua somiglianza visiva non autorizza a
riusarne anche il significato.

## Che cosa questi mockup **non** mostrano, di proposito

- **Il modulo per registrare un nuovo carico o scarico.** `riapertura.html` mostra l'*esito* di
  un carico già iscritto, non il modulo che lo produce — quello è già disegnato in US-042 e non
  cambia per questa specifica.
- **Una colonna "P&L realizzato" nella tabella dei posseduti.** Il realizzato di ogni posizione
  ancora aperta è, per costruzione, sempre zero (non ha ancora venduto nulla) o il residuo di
  vendite pregresse se è stata parzialmente venduta e poi non richiusa — quel caso intermedio
  (parzialmente venduta, ancora aperta, con un realizzato diverso da zero) è già coperto dal
  quadro del risultato complessivo di US-043 e non necessita di una colonna propria: introdurla
  qui sposterebbe lo scopo della specifica dalla visibilità delle posizioni chiuse a un'altra
  discussione.
- **La scheda titolo di un ISIN chiuso o riaperto.** La consegna chiede che la posizione resti
  "consultabile"; nei mockup la consultazione è implicita nel fatto che la riga esiste ed è
  leggibile, non nell'aver disegnato la pagina di dettaglio — la stessa scelta che US-042 e
  US-043 hanno già fatto lasciando la linguetta «Scheda titolo» disabilitata.
- **Qualunque effetto sul grafico** della posizione o del portafoglio: resta materia di US-045.
