# Mockup US-011 — Carico titolo a portafoglio

Prototipi statici/interattivi per la user story **US-011**: aggiungere un titolo a un portafoglio con data di carico, prezzo di acquisto e quantità.

## Schermate

| File | Stato rappresentato |
|---|---|
| `index.html` | Form di carico vuoto, tabella posizioni vuota (stato iniziale) — **interattivo** |
| `con-errori.html` | Form con tre errori di validazione mostrati (ISIN incompleto, prezzo zero, quantità negativa) |
| `posizioni.html` | Portafoglio con tre posizioni iscritte; avviso di successo dopo l'ultima iscrizione; riga nuova evidenziata |

## Come navigare

Aprire `index.html` direttamente nel browser.

- Compila il form e premi **Iscrive nel registro**: la posizione viene aggiunta alla tabella sottostante, appare un avviso verde e il form si azzera.
- Lascia campi vuoti o inserisci valori non validi e premi il bottone: gli errori appaiono campo per campo.
- La schermata `con-errori.html` mostra lo stato di errore già renderizzato (statico, per revisione rapida).
- La schermata `posizioni.html` mostra il risultato finale con più posizioni e il totale in calce.

## Coerenza visuale

Il mockup eredita integralmente i token CSS da `ledger.css` (produzione) e dai mockup US-005 / US-007:
- font IM Fell English + Courier Prime + Playfair Display
- palette carta/inchiostro/rosso-margine/verde-mastro
- struttura foglio con rigatura orizzontale e margine rosso verticale
- componenti `.riquadro-modulo`, `.riga-modulo`, `.mastro`, `.timbro`
