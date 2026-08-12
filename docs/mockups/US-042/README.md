# US-042 — Registrare la vendita parziale o totale con attribuzione LIFO

Mockup dello **scarico**: la seconda specie di iscrizione del registro (EP-008, FR-022,
FR-023, FR-024, ADR-009).

Lo stile è quello del libro mastro già in uso — stessa carta, stessa rigatura, stesso
margine rosso, stessi bottoni. `shared.css` è quello di `US-011` copiato ed **esteso in
coda** con la sezione «US-042»: nessuna regola preesistente è stata riscritta. L'unica
variazione di struttura è la larghezza del foglio, portata a 1440px come in US-031 e
US-039, perché la riga del registro deve portare tipo, lotto, residuo e azioni senza
scorrere.

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | La **vendita parziale**: il modulo di scarico, la fascia dei lotti con l'attribuzione LIFO dell'operazione appena iscritta, il riquadro del residuo (600 quote, prezzo medio ricalcolato da €&nbsp;10,4800 a €&nbsp;9,8000) e il registro unificato dove lo scarico compare come **nuova riga** accanto ai due carichi intatti. | **1**, **2**, **3** |
| `vendita-totale.html` | La **vendita totale** delle 600 quote restanti: residuo 0, prezzo medio del residuo dichiarato **assente** e non «0,0000», quattro iscrizioni a registro e nessuna cancellata. | **2**, **3** |
| `rifiuti.html` | I **tre rifiuti** con tre messaggi distinti: quantità eccedente, vendita anteriore al carico che dovrebbe consumare, rimozione di un carico già consumato. | **4**, **5**, **6** |
| `shared.css` | `US-011/shared.css` + sezione US-042: `.riquadro-modulo.scarico`, `.fascia-lifo` / `.lotto` / `.barra`, `.riquadro-residuo`, `.marca` (carico / esaurito / scarico), `.bottone.impedito` con la sua `.perche`, `.banner-errore`, `.cartiglio`. |

## Lo scenario, ed è uno solo

Le tre pagine descrivono lo **stesso titolo**, così che il confronto isoli una differenza
per volta:

| | |
|---|---|
| Carico n. 1 | 12.IV.2023 · **600** quote a €&nbsp;9,8000 = €&nbsp;5.880,00 |
| Carico n. 2 | 07.II.2025 · **400** quote a €&nbsp;11,5000 = €&nbsp;4.600,00 |
| Prezzo medio ponderato prima di ogni vendita | €&nbsp;10,4800 su 1.000 quote (costo €&nbsp;10.480,00) |
| Scarico n. 1 | 03.VI.2026 · **400** quote a €&nbsp;12,5000 — LIFO consuma **tutto il carico n. 2** |
| Residuo dopo lo scarico n. 1 | **600** quote a €&nbsp;9,8000 (costo €&nbsp;5.880,00) |
| Scarico n. 2 | 10.VIII.2026 · **600** quote a €&nbsp;12,9000 — consuma il carico n. 1 |

L'identità che regge tutto e che si legge in fondo alla fascia dei lotti: **costo attribuito
+ costo residuo = costo dei carichi** (€&nbsp;4.600,00 + €&nbsp;5.880,00 = €&nbsp;10.480,00).
È l'invariante che US-043 userà per la base della percentuale, e qui è già scritta a schermo
perché sia verificabile a occhio prima ancora che da un test.

## La fascia dei lotti

È l'elemento che si ricorda, e non è decorazione: LIFO è **un ordine**, e un ordine si
mostra disponendo le cose. I lotti stanno uno sotto l'altro **dal più recente al più
antico** — l'ordine esatto in cui il criterio li consuma — con la quota consumata
tratteggiata in carminio e quella ancora detenuta piena in ottone.

Tre conseguenze deliberate:

- **la quantità è la larghezza.** Le barre sono proporzionali (`flex: 400` contro `flex: 600`),
  quindi il rapporto fra consumato e residuo si legge senza aritmetica;
- **il lotto successivo alla data di vendita non è nascosto, è barrato** (`.quota.futura`,
  in `rifiuti.html`). Sparire direbbe «non esiste»; comparire tratteggiato dice la cosa vera,
  cioè «esiste ma non a quella data» — che è precisamente il criterio 5;
- **nessuna cifra è animata o interpolata.** Le larghezze sono statiche: la fascia racconta un
  fatto già accaduto, non una simulazione.

## Che cosa questi mockup **non** mostrano, di proposito

- Il **P&L realizzato** dell'operazione. Compare qui solo il *costo attribuito*, che è ciò che
  LIFO produce; separare realizzato e latente è **US-043**, e anticiparlo qui significherebbe
  disegnare una cifra che l'implementazione di US-042 non deve ancora scrivere.
- La sezione **Posizioni chiuse**. È **US-044**. Perciò in `vendita-totale.html` il titolo
  resta elencato con quantità **0**: una riga a zero è un'informazione vera e verificabile,
  una riga sparita senza che nulla lo dichiari no.
- Qualunque effetto sul **grafico** della posizione: la quantità detenuta a una data è **US-045**.

## Due scelte di interfaccia che vale la pena discutere

**Un solo registro, non due tabelle.** Carichi e scarichi stanno nella stessa tabella, in
ordine di data, distinti da una marca in prima colonna. Due tabelle affiancate sarebbero più
facili da costruire e direbbero una cosa falsa: che i due fatti vivono in libri separati.
Sono invece iscrizioni dello stesso libro, ed è esattamente la tesi di ADR-009.

**Il bottone impedito resta visibile.** Sul carico consumato «Modifica» e «Rimuovi» non
spariscono: restano al loro posto, tratteggiati e inerti, con la ragione scritta sotto. Un
bottone scomparso non spiega perché è scomparso, e la distinzione fra errata e vendita è
proprio la cosa che il criterio 6 chiede di rendere esplicita.
