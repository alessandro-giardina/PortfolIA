# US-048 — Scarico con quantita frazionaria

Mockup del modulo di scarico titolo con supporto alle quantita frazionarie,
del flusso LIFO con `round6`, e delle posizioni chiuse dopo vendita totale.

## Schermate

| File | Contenuto |
|---|---|
| `index.html` | Modulo di scarico con input decimale, validazione client (3 scenari), rifiuto server FR-024, resa a schermo con `quantita()` |
| `flusso-lifo.html` | Dimostrazione del flusso della spec: due carichi frazionari, vendita parziale con LIFO, vendita totale con chiusura, la «lavagna dell'errore» IEEE 754 (senza/con `round6`), registro completo |
| `posizioni-chiuse.html` | Riepilogo senza il titolo chiuso, tabella «Posizioni chiuse» con quantita formattata, avviso di successo, mappa degli interventi |

## Aprire

```bash
open docs/mockups/US-048/index.html
```
