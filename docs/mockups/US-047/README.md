# US-047 — Iscrivere un carico con quantita frazionaria

Mockup del modulo di carico aggiornato e della resa a schermo delle quantita
frazionarie in tutte le superfici dell'app.

## Schermate

| File | Contenuto |
|---|---|
| `index.html` | Modulo di carico con `type="text" inputmode="decimal"`, sotto-etichetta aggiornata, tre scenari di validazione (troppi decimali, zero, non numerico), confronto prima/dopo del formatter `quantita()`. |
| `registro.html` | Riepilogo e Registro delle iscrizioni con quantita frazionarie formattate (`19,845`, `100`, `3,14159`), tabella Titoli iscritti a conto, dimostrazione del flusso spec (12,345 + 7,5 quote). |
| `rettifica.html` | Rettifica inline di un carico da intero (10) a frazionario (5,25), errore di validazione nella riga di modifica, stato dopo il salvataggio con totali e prezzo medio ricalcolati. |

## Navigazione

Aprire `index.html` nel browser. I link in fondo a ogni pagina collegano le tre schermate.
