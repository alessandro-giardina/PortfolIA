# US-052 — Quadro strumenti: scheda titolo

Mockup isolato: **nessuna riga di questo prototipo tocca il codice dell'applicazione**.
È la scheda di dettaglio di un titolo nella direzione visiva «Quadro strumenti», sorella
del riepilogo in [`../US-051/`](../US-051/).

## Schermate

| File | Che cosa mostra |
|---|---|
| `scheda-titolo.html` | **Scheda titolo** — posizione a conto, grafico con le due viste e le quattro scale, le due misure, anagrafica ufficiale, carichi, vendite, storico prezzi |

`shared.css` e `app.js` sono la copia autosufficiente della cartella US-051: le due pagine
condividono i token e lo stesso prototipo di grafici, e ciascuna cartella porta la propria
copia come tutte le altre cartelle `US-*` di questo repository. Tenerle allineate a mano è
il costo, previsto, di quella convenzione.

## Interazioni disponibili

- toggle tema chiaro/scuro (memorizzato in `localStorage`);
- vista *Prezzo unitario* ↔ *Valore della posizione* e le quattro scale temporali — il
  riquadro «Variazione di periodo» si aggiorna, quello «P&L da carico» no, esattamente
  come nell'app;
- puntatore sul grafico con valore del punto.

## Correzioni tipografiche (19 ago 2026)

Le stesse applicate a `../US-051/shared.css` — cifre fluide e interlinea sopra il box del
carattere. Il dettaglio è nel README di quella cartella.
