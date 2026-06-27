# Mockup US-005 — Visualizzare l'elenco dei portafogli

## Schermate

| File | Descrizione |
|---|---|
| `dashboard-con-portafogli.html` | Dashboard principale con 3 portafogli di esempio cliccabili + modulo apertura nuovo conto |
| `dashboard-vuota.html` | Stesso layout ma senza portafogli: stato vuoto con CTA che ancora al modulo |
| `dettaglio-portafoglio-placeholder.html` | Placeholder per la vista di dettaglio; legge il nome del portafoglio dai query params |

## Come navigare

1. Apri `dashboard-con-portafogli.html` nel browser.
2. Clicca su una riga della tabella → arrivi al dettaglio placeholder con il nome del conto nell'intestazione.
3. Usa il link "← Torna all'elenco portafogli" per tornare indietro.
4. Apri `dashboard-vuota.html` per vedere lo stato vuoto con il CTA di creazione.

## Dipendenze

- `shared.css` — token di design condivisi (coerente con US-004)
- `app.js` — interazioni modulo + navigazione smoothscroll CTA
- Google Fonts (IM Fell English, Courier Prime, Playfair Display)

## Note di design

- Elenco portafogli come tabella mastro con righe cliccabili; hover evidenzia la riga e mostra la freccia `›` in carminio.
- Stato vuoto integrato nella tabella (riga `colspan=7`) con titolo, descrizione e CTA.
- Dettaglio placeholder legge `?nome=...&id=...` dai query params per simulare la navigazione reale della SPA.
