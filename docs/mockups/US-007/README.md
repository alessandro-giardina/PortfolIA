# Mockup US-007 — Recuperare anagrafica e prezzo di un titolo per ISIN

Epica **EP-002** — Ricerca titoli e dati di mercato.

> Come Alessandro, investitore-proprietario, voglio cercare un titolo inserendo il suo ISIN
> e ottenere denominazione e dati ufficiali da Borsa Italiana, in modo da non dover inserire
> manualmente i dati dei titoli.

## Ambito del mockup

Questo mockup copre **solo** la ricerca per ISIN e la **visualizzazione** dell'anagrafica + prezzo
recuperati. L'iscrizione del carico (data di carico, prezzo d'acquisto, quantità) **non** è inclusa:
appartiene a una spec successiva (FR-007).

Campi mostrati nella scheda anagrafica: denominazione, prezzo attuale, ticker, tipo strumento,
commissioni totali annue, valuta di denominazione, emittente, segmento, politica di distribuzione
dividendi (più ISIN e fonte/data di rilevazione del prezzo).

## Schermate (i tre stati richiesti)

| File | Stato | Descrizione |
|---|---|---|
| `index.html` | (1) Trovato | Barra di ricerca ISIN + "Recupera anagrafica" e scheda anagrafica completa con tutti i campi e la fonte/data del prezzo. |
| `stato-caricamento.html` | (2) Caricamento | Stessa pagina mentre la fonte viene interrogata: pennino lampeggiante e campi a scheletro tremolante; nessun valore mostrato prima della conferma. |
| `stato-non-trovato.html` | (3) Non trovato / dato assente | Timbro tratteggiato "Dato non disponibile", riquadro di esito vuoto, e un esempio di anagrafica con alcuni campi dichiarati assenti (nessun valore inventato). |

## Come navigare

1. Apri `index.html` nel browser.
2. Nel campo ISIN prova uno dei codici noti e premi **Recupera anagrafica** (o Invio):
   - `IE00BMVB5S82` — iShares Core MSCI World (ETF, accumulazione)
   - `IT0003128367` — ENEL S.p.A. (azione; TER dichiarato non disponibile)
   - `IE00BMVB5R75` — iShares MSCI EM IMI (ETF, valuta USD)
3. La ricerca passa dallo **stato di caricamento** (scheletri animati) al risultato.
4. Inserisci un ISIN di 12 caratteri non noto (es. `IT9999999999`) per vedere lo **stato "Dato non disponibile"**.
5. Le linguette in alto permettono di vedere i tre stati come pagine statiche separate.

## Dipendenze

- `shared.css` — token e componenti del **Libro Mastro** (foglio, testata, linguette, sezione-titolo,
  anagrafica/voce-def, bottone, timbro verde/mancante) più le aggiunte US-007 (barra ricerca ISIN,
  scheletri di caricamento, trattamento "Dato non disponibile", riquadro vuoto).
- `app.js` — ricerca ISIN simulata con i tre stati (caricamento → trovato / non trovato).
- Google Fonts: IM Fell English, IM Fell English SC, Courier Prime, Playfair Display.

## Note di design

- Aderenza all'estetica **Libro Mastro** (quaderno contabile) coerente con `docs/mockups/libro-mastro/`
  e con le convenzioni React di `docs/mockups/US-005/`.
- **Trasparenza sul dato**: ogni campo assente è marcato con il timbro tratteggiato *Dato non disponibile*;
  il prototipo non mostra mai denominazioni, prezzi o valori stimati.
- Il prezzo riporta sempre **fonte** (Borsa Italiana) e **data/ora di rilevazione**.
