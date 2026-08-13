# US-019 — Grafico del valore del portafoglio nel tempo

Mockup della sezione «Andamento del portafoglio» che si inserisce nella **scheda
Riepilogo**, sotto il riquadro del valore attuale (US-014) e il quadro del
risultato (US-043) — quelle due caselle dicono quanto il conto vale *adesso*, il
grafico dice come ci è arrivato (EP-006, FR-015, ADR-010, ADR-003).

Il tracciato è **lo stesso** di US-036/US-037/US-039: stessa cornice quadrettata,
stessi segni, stesso tratteggio, stesso SVG scritto a mano senza librerie di
charting e senza script. `shared.css` è quello di US-039, esteso in coda con la
sezione «US-019»: nessuna regola preesistente è stata riscritta.

Due cose della scheda titolo **non** compaiono, e non è una dimenticanza:

- il **commutatore prezzo/valore** di US-039: per un portafoglio il prezzo
  unitario non ha significato, quindi la curva è una sola;
- il **selettore della scala temporale** di US-037: per il portafoglio arriva con
  US-020, che è bloccata da questa spec. Qui la finestra è «tutto lo storico».

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | La curva a **copertura piena** dal 3.VI.2026, con il punto della dimostrazione: € 16.636,00 come somma di una rilevazione del giorno e di una quotazione **riportata in avanti di 22 giorni**, dichiarata come tale. Sotto il tracciato, il punto di oggi letto per esteso titolo per titolo; prima del 3.VI, la zona campita con i giorni a copertura parziale. | **1**, **2**, **3**, **4**, **5**, **6** |
| `copertura-parziale.html` | I due casi in cui la cifra non può essere affermata: **(a)** un titolo detenuto e **mai rilevato** tiene l'intera finestra a copertura parziale, con le somme parziali mostrate *barrate*; **(b)** un conto con carichi ma **nessuna rilevazione**, che dichiara «dato non disponibile» invece di disegnare una cornice vuota. | **5**, **6** |
| `shared.css` | `US-039/shared.css` + sezione US-019: `.barra-perimetro`, `.composizione-punto`, `.riga-contributo`, `.timbro-riporto`, `.copertura-parziale`, `.didascalia-perimetro`. |

## Lo scenario di `index.html`

Due titoli, e le loro date di rilevazione **non coincidono** — che è la condizione
normale con lo storico rado di ADR-008, non un caso patologico:

| Titolo | Carico | Rilevazioni |
|---|---|---|
| Ishares Core MSCI World `IE00B4L5Y983` | 19.IX.2025 · 80 quote a € 58,4000 | 12.V.2026 € 96,2000 · 10.VIII.2026 € 128,4600 |
| Vanguard FTSE All-World `IE00BK5BQT80` | 4.III.2026 · 120 quote a € 71,2000 | 3.VI.2026 € 74,5000 |

Cinque date d'evento, cinque punti — e nessun punto dove non cade alcun evento:

| Data | Evento | Perimetro | Valore |
|---|---|---|---|
| 19.IX.2025 | carico | 1 detenuto, **0 valorizzati** | non affermabile |
| 4.III.2026 | carico | 2 detenuti, **0 valorizzati** | non affermabile |
| 12.V.2026 | rilevazione | 2 detenuti, **1 valorizzato** | somma parziale, barrata |
| 3.VI.2026 | rilevazione | 2 detenuti, **2 valorizzati** | **€ 16.636,00** |
| 10.VIII.2026 | rilevazione | 2 detenuti, **2 valorizzati** | **€ 19.216,80** |

Il punto del **3.VI.2026** è quello che la spec chiede di dimostrare:

```
7.696,00   80 quote × € 96,2000   quotazione del 12.V.2026 · riportata, 22 giorni
8.940,00  120 quote × € 74,5000   rilevazione del giorno
─────────
16.636,00  → «1 di 2 titoli su prezzo riportato, 22 giorni»
```

## Che cos'è «ultimo prezzo noto», ed è la decisione centrale

Un prezzo noto è una **rilevazione realmente registrata** (`price_observations`),
riportata in avanti fino alla data del punto. Il prezzo di *carico* non conta come
quotazione: è il prezzo a cui hai comprato, non una rilevazione di mercato — ed è
la lettura letterale di ADR-010 («la sua ultima rilevazione registrata non
successiva alla data del punto»).

Ne segue la forma delle due pagine, e in particolare che il criterio 6 non sia
codice morto: se il carico contasse come quotazione, ogni titolo detenuto avrebbe
per costruzione un prezzo noto dal giorno del proprio carico, la copertura sarebbe
sempre piena e il «tratto precedente dichiarato parziale» non esisterebbe mai.

## Perché il tratto parziale non porta una curva

Il criterio 6 lo dice al negativo — «invece di disegnare un portafoglio che sembra
valere meno» — e le due pagine lo rendono al positivo:

- la zona anteriore alla prima copertura piena è **campita** e porta il conteggio
  dei giorni;
- i punti d'evento di quella zona **restano visibili**, ma come segni *vuoti e
  barrati*: la data esiste, la cifra di portafoglio no;
- la somma dei soli titoli valorizzati è comunque scritta — barrata, con il numero
  dei titoli su cui è calcolata. Nasconderla sarebbe un'omissione; presentarla come
  valore complessivo sarebbe un dato falso.

## Il riporto dichiarato, e come si dichiara

Ogni contributo porta un timbro, e i tre stati sono distinti a colore e a parole:

| Timbro | Significato |
|---|---|
| `rilevazione del 10.VIII.2026` (verde) | il prezzo è stato osservato **quel giorno** |
| `quotazione del 3.VI.2026 · 68 giorni` (ottone) | prezzo **riportato in avanti**, con data ed età |
| `nessun prezzo noto` (carminio, tratteggiato) | titolo detenuto e **non valorizzabile** |

Il conteggio in testa alla composizione del punto — «1 titolo su rilevazione del
giorno · 1 su quotazione riportata · 0 non valorizzati» — è il criterio 5 in forma
di riga sola: si legge senza scorrere l'elenco.

## Che cosa questa spec non fa

- **non nomina il titolo** che rende parziale il tratto: dichiara *quanti*. Il
  *quale*, con la data d'inizio copertura e il rimando all'aggiornamento in blocco
  di US-035, è US-016;
- **non ridisegna nulla** della scheda titolo: quantità detenuta a una data
  (US-045), gradini del capitale versato (US-039), resa SVG a mano (US-036) e
  scale condivise (US-037) sono riusati così come sono;
- **non tocca la fonte**: tutti i dati dei titoli arrivano in **un solo giro di
  richieste** al server, che li legge dall'archivio. La costruzione del grafico non
  genera alcuna richiesta di rete.
