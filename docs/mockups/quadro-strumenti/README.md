# Quadro strumenti — direzione visiva alternativa

Mockup isolato: **nessuna riga di questo prototipo tocca il codice dell'applicazione**.
È una proposta di lettura alternativa al «Libro Mastro» (carta, IM Fell English, filetti,
postille in corsivo), nata dalla segnalazione che alcune schermate sono troppo dense e
con testi troppo piccoli per essere lette comodamente.

## Schermate

| File | Che cosa mostra |
|---|---|
| `index.html` | **Riepilogo del portafoglio** — KPI, andamento, composizione, tabella dei titoli iscritti |
| `scheda-titolo.html` | **Scheda titolo** — posizione, grafico con le due viste, le due misure, anagrafica, carichi, storico prezzi |

Apri `index.html` nel browser: le due pagine sono collegate fra loro (le righe della tabella
portano alla scheda titolo, la barra laterale torna al riepilogo). Serve la rete solo per i
font di Google.

## Che cosa cambia rispetto al Libro Mastro

- **Nessun testo informativo sotto i 13px.** La scala parte da 15px di base; i 12px restano
  solo per le etichette maiuscole spaziate, che sono nomi di campo, non prosa da leggere.
- **Le cifre diventano il primo livello di lettura** (34–44px, `tabular-nums`): il valore del
  portafoglio si legge da lontano, come nella dashboard di riferimento.
- **Una decorazione sola per superficie.** Niente carta+righe+filetti+timbri+corsivi insieme:
  card piatte, un bordo da 1px, ombre appena percettibili.
- **Le postille lunghe diventano brevi chiose** accanto al titolo di sezione, o pillole di stato
  (`da aggiornare`, `mai rilevato`, `MorningStar`) dove prima c'era una frase in corsivo.
- **Tema scuro predefinito, tema chiaro nel toggle in alto a destra** (icona sole/luna): utile
  per confrontare la stessa densità sui due fondi prima di decidere.

## Che cosa resta del Libro Mastro

Il lessico del registro (*conto*, *carico*, *rilevamento*, *posizione a conto*, *anagrafica
ufficiale*) e — soprattutto — il **rigore sui dati mancanti**: il «—» al posto del prezzo,
la posizione esclusa dal totale con il conteggio dichiarato («4 di 5 valorizzate»), il perno
`≠` fra P&L da carico e variazione di periodo, la nota che PortfolIA non interpola i giorni
non osservati.

## Dati

Tutti i numeri sono inventati ma **coerenti fra loro**: quantità × prezzo medio = capitale
investito, quantità × prezzo attuale = valore attuale, e la somma delle differenze di riga
coincide con il totale in fondo alla tabella. Le serie dei grafici vivono in `app.js`.

## Interazioni disponibili

- toggle tema chiaro/scuro (memorizzato in `localStorage`);
- finestra temporale del portafoglio (12 mesi / 5 anni / tutto);
- scheda titolo: vista *Prezzo unitario* ↔ *Valore della posizione* e le quattro scale
  temporali — il riquadro «Variazione di periodo» si aggiorna, quello «P&L da carico» no,
  esattamente come nell'app;
- puntatore sul grafico con valore del punto;
- passaggio sulla legenda della composizione per isolare la fetta.
