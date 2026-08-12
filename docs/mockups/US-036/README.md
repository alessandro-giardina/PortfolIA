# US-036 — Grafico dell'andamento del prezzo del titolo

Mockup della sezione che chiude la scheda titolo: il tracciato del prezzo unitario
dal primo carico registrato a oggi (EP-007, FR-015, ADR-008).

Ogni pagina mostra il grafico **nel suo contesto**, cioè preceduto dalla sezione
«Storico prezzi» di US-009 in forma ridotta, così da rendere evidente che il
grafico sta in fondo alla scheda, sotto quella tabella.

Il tracciato è **SVG scritto a mano**, come già in `libro-mastro/portafoglio.html`:
nessuna libreria di grafici, nessuno script, nessuna risorsa remota oltre ai font
del progetto. Fuori scopo e volutamente assenti: il selettore di scala temporale
(US-037), le metriche di P&L (US-038), il commutatore prezzo/valore (US-039).

## File

| File | Cosa mostra |
|---|---|
| `index.html` | Lo scenario dimostrativo: **quattro punti** — due carichi (19.IX.2021 a € 58,4000 e 4.III.2023 a € 71,2000) e due rilevazioni (7 e 10.VIII.2026) — attraversati dalla riga orizzontale del prezzo medio ponderato di carico (€ 66,0800), con legenda, quote dei vuoti e quota di misura dello scarto sul prezzo. Dimostra i criteri **1, 2, 3, 4, 5**. |
| `punto-unico.html` | La variante degenere: un solo carico (14.II.2025), zero rilevazioni, **un punto solo**. Il grafico compare comunque, i 542 giorni fino a oggi sono campiti e misurati, e il testo dichiara che un andamento non esiste ancora. Dimostra i criteri **6** e **2**. |
| `storico-rado.html` | La variante realistica di ADR-008: carichi nel 2021 e 2023, le sole tre rilevazioni concentrate fra il 30.VII e il 5.VIII.2026, quindi **1.244 giorni di vuoto** fra il secondo carico e la prima quotazione osservata, più il tratto finale scoperto di cinque giorni. Dimostra i criteri **5**, **2** e **3**. |
| `shared.css` | Fogli di stile locale, discendente da `US-009/shared.css` (la tabella «Storico prezzi») e da `libro-mastro/shared.css` (`.grafico-cornice`, la carta quadrettata). Aggiunge `.legenda-tracciato`, `.estremi-tracciato`, `.cartellino-finestra`, `.timbro.mancante`. |

## Linguaggio del tracciato

Quattro segni, sempre gli stessi in tutte le pagine e sempre nominati in legenda:

| Segno | Significato |
|---|---|
| Rombo in carminio (`--carminio`) | prezzo di carico — una delle due sole origini d'archivio |
| Cerchio in inchiostro (`--inchiostro`) | rilevazione registrata — l'altra origine d'archivio (US-009) |
| Riga orizzontale tratteggiata d'ottone (`--ottone`) | prezzo medio ponderato di carico: il guadagno latente è la distanza fra tracciato e riga |
| Segmento tratteggiato + campitura obliqua (`--rosso-margine`) | fra i due estremi l'archivio non possiede alcun prezzo; la quota sotto il tracciato ne conta i giorni |

Nessun segmento è continuo, perché nessun valore intermedio esiste: il tratteggio
è una dichiarazione, non uno stile. L'asse dei tempi arriva sempre a **oggi**,
anche quando l'ultimo punto è anteriore.

## Nota sulla scala del tempo

Le rilevazioni cadono a pochi giorni l'una dall'altra su un asse che copre quasi
cinque anni: sul disegno i marcatori si toccano. Il mockup non altera la scala per
renderli distinti — sarebbe una bugia sul tempo — e li nomina invece uno per uno
con una linea di richiamo (`index.html`) o con un cartellino (`storico-rado.html`).
È l'attrito che US-037 (scala temporale) risolverà; qui viene dichiarato, non nascosto.

Lo stesso vale per il vuoto finale di `storico-rado.html`: cinque giorni su 1.785
valgono due pixel d'asse, quindi la campitura c'è ma è un filo, e una nota con
richiamo la nomina per iscritto. Dove il vuoto finale è ampio — `punto-unico.html`,
542 giorni — la campitura parla da sé.
