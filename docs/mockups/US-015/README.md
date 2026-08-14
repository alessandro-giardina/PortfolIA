# US-015 — Mostrare il P&L del portafoglio accanto al suo grafico

Mockup della **stanga a tre pesi**: sotto il grafico del portafoglio (US-019/US-020), la variazione
del valore nella finestra selezionata e la sua scomposizione in **capitale netto versato** e
**movimento di mercato** (EP-006, FR-011, FR-012, ADR-003).

Lo stile è quello del libro mastro già in uso. `shared.css` è quello di `US-020` copiato **senza
toccarne una riga** — stessa carta, stessa rigatura, stessa traversa delle cinque scale, stessa
larghezza di foglio (1440px) — e tutte le aggiunte di questa spec vivono in `metriche.css`, a parte
proprio perché si veda che nulla di preesistente è stato riscritto. Le due traverse (`.barra-perimetro`,
`.barra-scala`) e la cornice del tracciato sono riportate identiche: la sezione nuova nasce *sotto* di
esse e non avrebbe senso mostrarla staccata.

## L'idea visiva

Il problema che la spec risolve è che **+6.000 € non è un guadagno se 5.000 li hai versati tu**. La
pagina lo rende impossibile da sbagliare con tre dispositivi:

- **l'equazione incisa** — `variazione = versato + mercato`, con gli operatori veri fra le caselle,
  come il quadro del risultato di US-043 scrive `realizzato + latente ═ totale`. L'identità si legge
  nella disposizione, non va presa sulla parola;
- **il regolo della scomposizione** — una sola barra lunga quanto la variazione, divisa nei due
  addendi: la parte versata è **campita a righe d'ottone** (denaro entrato, mai performance), quella
  di mercato è **piena**. È il segno distintivo della pagina: in un colpo d'occhio si vede se un
  `+6.000` è un rendimento o un bonifico;
- **il sigillo `≠`** — una doppia riga separa ciò che dipende dalla finestra da ciò che non ci
  dipende, e cita il P&L complessivo di US-043 **senza ricalcolarlo**.

Il colore porta un solo significato, coerente su tutte e due le pagine: **ottone campito** = flusso di
cassa, **verde/carminio pieno** = mercato, **inchiostro** = la somma dei due.

## File

| File | Cosa mostra | Criterio |
|---|---|---|
| `index.html` | Lo scenario del campo *Dimostra*: finestra «ultimo anno» con un carico da 5.000 € dentro, valore da 20.000 a 26.000 €, e le tre cifre `+6.000 = +5.000 + 1.000` con il regolo e la base della percentuale scritta con i suoi addendi. In coda, le stesse tre cifre su due altre scale — e su «tutto lo storico» il caso in cui il movimento di mercato *coincide* con il P&L complessivo, con la ragione per cui coincide. | **1**, **2**, **3**, **4** |
| `casi-limite.html` | I due stati in cui la scomposizione non si scrive per intero: finestra con meno di due punti (timbro, mai zero) e perimetro parziale (variazione dichiarata parziale, titoli nominati uno per uno). | **5**, **6** |
| `metriche.css` | La sola aggiunta a `shared.css`: `.stanga` con `.equazione`/`.voce-scomposizione`/`.operatore`, `.regolo-scomposizione` con `.barra-scomposizione`, `.base-rapporto`, `.sigillo-non-pl`, `.timbro-scomposizione`, `.perche-assente-scomposizione`, `.perimetro-scomposizione`, `.trittico-casi`. |

## Lo scenario, ed è quello del campo *Dimostra*

| | |
|---|---|
| Primo punto della finestra | 14.VIII.2025 · valore complessivo **€ 20.000,00** |
| Carico dentro la finestra | 12.II.2026 · 40 quote a € 125,00 = **€ 5.000,00** |
| Ultimo punto della finestra | 10.VIII.2026 · valore complessivo **€ 26.000,00** |
| Variazione del valore | **+€ 6.000,00** |
| Capitale netto versato | **+€ 5.000,00** (carichi − vendite cadute nella finestra) |
| Movimento di mercato | **+€ 1.000,00** · **+4,00 %** su € 25.000,00 |
| P&L complessivo (US-043) | **+€ 3.600,00** — identico su tutte e cinque le scale |

## Tre scelte che il piano deve ereditare

1. **La base della percentuale è dichiarata come somma, non come cifra.** «+4,00 % = 1.000 ÷ 25.000,
   dove 25.000 = valore iniziale 20.000 + versato 5.000». Il denominatore è il **capitale esposto**
   e non il solo valore iniziale: versare denaro a metà periodo gonfierebbe la percentuale senza che
   il mercato abbia fatto nulla — cioè lo stesso errore, spostato dal numeratore al denominatore. La
   pagina dichiara anche il limite: non è un rendimento ponderato per il tempo, e il carico rimasto
   esposto mezza finestra pesa in denominatore come se ci fosse stato dal primo giorno.
2. **Il titolo fuori perimetro esce da entrambi i lati dell'identità.** Se il suo carico contasse fra
   i versamenti mentre il suo valore resta fuori dalla somma, il movimento di mercato ne assorbirebbe
   l'intero importo col segno rovesciato: una perdita inventata di 4.000 €. È il difetto che
   `casi-limite.html` mostra e nomina, e la ragione per cui il perimetro va calcolato **prima** delle
   tre cifre, non dopo.
3. **Sotto soglia non si scrive nemmeno il versato.** Sarebbe calcolabile anche con un punto solo, ma
   esposto accanto a due caselle vuote si leggerebbe come una variazione — proprio lo scambio che la
   spec esiste per impedire. Le tre cifre stanno o cadono insieme, perché sono un'identità sola.
