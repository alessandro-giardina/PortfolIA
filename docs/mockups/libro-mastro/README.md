# PortfolIA — Mockup "Libro Mastro"

Prototipo visuale isolato. **Non** è codice di produzione e non tocca `client/` o `server/`.

## Stile

Quaderni di contabilità anni Trenta: carta manila rigata, riga rossa di margine,
inchiostro ferrogallico, numeri a macchina da scrivere (Courier Prime), titoli
incisi (Playfair Display / IM Fell), tabelle a mastro e timbri di registrazione.

## Schermi

| File | Schermo |
|---|---|
| `index.html` | Libro mastro dei portafogli (lista conti + totali) — **entrata principale** |
| `portafoglio.html` | Riepilogo conto: P&L multi-orizzonte, grafico andamento, tabella titoli |
| `titolo.html` | Scheda anagrafica titolo + carichi registrati |
| `ricerca.html` | Modulo di carico: ricerca ISIN e iscrizione posizione |

`shared.css` contiene token e componenti condivisi; `app.js` aggiunge interazioni
leggere (scala temporale del grafico, esito ricerca ISIN simulato).

## Avvio

Apri `index.html` nel browser. I font sono caricati da Google Fonts (serve rete);
in assenza di rete il layout resta valido con i fallback serif/monospace.
