# US-037 — Selezionare la scala temporale del grafico del titolo

Mockup del selettore delle cinque scale temporali sopra il grafico del titolo
(EP-007, FR-016, ADR-003, ADR-008).

Il grafico è **lo stesso di US-036** — stessi segni, stessa cornice quadrettata,
stesso tratteggio, stesso SVG scritto a mano senza librerie. US-037 gli aggiunge
soltanto due cose: la **traversa dei cinque bottoni** sopra la cornice e i **due
stati** che la scelta di una finestra può produrre. `shared.css` è quello di
US-036, esteso in coda con la sezione «US-037»: nessuna regola preesistente è
stata riscritta.

Il selettore a bottoni non è nuovo nel linguaggio del progetto: viene da
`libro-mastro/shared.css` (`.scala-temporale`, usato in `libro-mastro/portafoglio.html`),
qui ripreso e agganciato al bordo superiore del grafico.

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | Lo stato d'apertura: i cinque bottoni con **«Tutto lo storico» attivo** e la postilla *predefinita*, e sotto il grafico di US-036 immutato — quattro punti (due carichi in carminio, due rilevazioni in inchiostro), riga d'ottone del prezzo medio ponderato di carico, segmenti tratteggiati, quote dei vuoti. Serve a mostrare che il selettore si inserisce senza stravolgere nulla. Una legenda dice che cosa comprende ciascuna delle cinque scale su questo titolo. | **1**, **2**, **3** |
| `finestra-vuota.html` | Scala **«Ultimo mese»** su un titolo le cui rilevazioni sono tutte anteriori. Al posto della cornice compare una **dichiarazione**: timbro «dato non disponibile», l'intervallo chiesto per esteso (10.VII.2026 → 10.VIII.2026, 31 giorni), la data in cui il dato esiste davvero (3.V.2026, *fuori da questa finestra*, 68 giorni prima del suo inizio) e l'invito a tornare a una scala più ampia. Un *rigo del tempo* mostra geometricamente il punto fuori finestra e nega il trascinamento dell'ultimo prezzo noto. | **4** |
| `copertura-parziale.html` | Scala **«Ultimi 10 anni»** su uno storico cominciato il 16.II.2026. L'asse copre davvero i 3.652 giorni chiesti — non si accorcia di nascosto — e i primi **3.477 giorni** sono campiti con la stessa obliqua che US-036 usa per i vuoti, contornati e dichiarati: *dei 10 anni richiesti ne risultano coperti 0 anni e 5 mesi*. I quattro punti reali si addensano tutti sul bordo destro; un regolo sotto la cornice misura la copertura (4,8 %). | **5** |
| `shared.css` | `US-036/shared.css` copiato e **esteso**: `.barra-scala`, `.scala-temporale` (con gli stati `.attiva`, `.attiva.senza-dati`, `.attiva.parziale`), `.postilla-predefinita`, `.dichiarazione-vuota` e i suoi elementi, `.misura-copertura` / `.barra-copertura`. |

## Il selettore

Cinque bottoni in fila — **Ultimo mese · Ultimo anno · Ultimi 5 anni ·
Ultimi 10 anni · Tutto lo storico** — sulla traversa che sormonta la cornice del
grafico, con a destra la finestra effettivamente risolta (date ed estensione).
Ogni pagina ne mostra uno diverso attivo, e il colore del bottone attivo ripete
lo stato del riquadro sottostante, non lo decora:

| Bottone attivo | Significato |
|---|---|
| Panno verde (`--verde-mastro`) | la scala scelta ha dati e il grafico li mostra |
| Carminio (`--rosso-margine`) | la finestra chiesta è priva di dati |
| Ottone (`--ottone`) | la finestra chiesta è coperta solo in parte |

Su schermo stretto (≤ 900 px) la traversa passa a colonna e i bottoni vanno a
capo occupando la riga; sotto i 560 px si impilano a piena larghezza.

## La regola che nessuna scala viola

Cambiare scala è **ritagliare** una finestra dentro i punti già in archivio, mai
**infittirlo**: la scelta non interroga la fonte, non aggiunge punti e non stima
nulla. In particolare l'ultimo prezzo noto non viene mai portato dentro una
finestra che non lo contiene, né all'indietro per riempire una scala più lunga
della storia disponibile (ADR-003). Lo storico è rado per costruzione e comincia
dall'entrata in esercizio del registro: le scale a 5 e 10 anni resteranno a lungo
quasi tutte scoperte, e i mockup lo dichiarano invece di nasconderlo (ADR-008).
