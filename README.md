# PortfolIA

Web app **locale e privata** per tracciare il rendimento reale dei propri portafogli di titoli
nel tempo, a partire dai dati ufficiali di Borsa Italiana. Nessun account, nessun cloud: gira
interamente sulla macchina su cui la installi e i dati non la lasciano mai.

Il dettaglio di prodotto è in [docs/PRD.md](docs/PRD.md); questo documento spiega come
installarla e usarla.

---

## Installazione su un Mac nuovo

### Prerequisiti

| Cosa | Come verificarlo / installarlo |
|---|---|
| **Node.js 20 LTS** e npm 10+ | `node --version` → `v20.x`. Con [nvm](https://github.com/nvm-sh/nvm): `nvm install` (legge `.nvmrc`). Funziona anche su Node 22 e 24. |
| **Xcode Command Line Tools** | `xcode-select --install`. Servono se npm non trova un pacchetto precompilato di `better-sqlite3` e deve compilarlo sul posto. |
| **Connessione a Internet** | L'app interroga le fonti di mercato a ogni ricerca di un ISIN (vedi *Rete in uscita*). |

Non serve altro: nessun database da installare a parte, nessun file `.env`, nessuna chiave API.

### Passi

```bash
git clone https://github.com/alessandro-giardina/PortfolIA.git
cd PortfolIA
npm run setup
```

`npm run setup` esegue in sequenza tre cose, tutte necessarie:

1. **`npm ci`** — installa le dipendenze dei tre workspace (`client`, `server`, `shared`) dal
   lockfile. Non aggiungere `--omit=dev` (serve TypeScript al passo 2) né `--ignore-scripts`
   (`better-sqlite3` deve poter eseguire il proprio script di installazione).
2. **build di `shared`** — non è opzionale: `@portfolia/shared` è pubblicato dalla sua cartella
   `dist/`, che non è versionata, e sia il server sia il client ne importano funzioni usate a
   runtime. Senza questo passo l'app non parte.
3. **`playwright install chromium`** — scarica Chromium (~300 MB). Serve **all'applicazione**,
   non solo ai test: è il browser headless con cui il server interroga MorningStar quando
   Borsa Italiana non trova un ISIN.

---

## Avviare l'app

```bash
npm run build   # una volta dopo ogni aggiornamento del codice
npm start
```

Poi apri **<http://localhost:4173>**.

Restano occupate due porte: **3200** per il backend e **4173** per l'interfaccia. Entrambi i
processi girano in primo piano nel terminale; per fermare l'app basta `Ctrl-C`. L'app ascolta in
locale e non ha autenticazione — è pensata per essere usata dalla macchina su cui gira.

---

## Dove stanno i dati

Tutto l'archivio è un unico file SQLite:

```
data/portfolia.db
```

Viene creato automaticamente al primo avvio, con le tabelle già aggiornate all'ultima versione
dello schema: parti quindi da un archivio **vuoto**, senza portafogli. Il file non è versionato in
git, quindi ogni installazione ha i propri dati.

- **Backup:** copia `data/portfolia.db` ad app ferma.
- **Ripartire da zero:** cancella il file; verrà ricreato al riavvio.
- **Spostare i dati su un'altra macchina:** copia lo stesso file nella cartella `data/` della
  nuova installazione, ad app ferma su entrambe.

---

## Rete in uscita

Per risolvere un ISIN e recuperare prezzi e serie storica, il server contatta:

- `https://www.borsaitaliana.it` — fonte primaria, veloce;
- `https://www.morningstar.com` — fonte di backup, raggiunta con Chromium headless quando la
  prima non trova il titolo.

Su una rete aziendale con proxy o firewall queste chiamate possono essere bloccate: in quel caso
l'app non inventa dati, dichiara semplicemente che il titolo non è stato trovato.

---

## Aggiornare all'ultima versione

```bash
git pull
npm run setup
npm run build
```

L'archivio in `data/portfolia.db` viene conservato: al riavvio il server applica da solo le
eventuali migrazioni di schema.

---

## Problemi noti

| Sintomo | Causa e rimedio |
|---|---|
| `npm ci` fallisce compilando `better-sqlite3` | Mancano gli Xcode Command Line Tools: `xcode-select --install`, poi ripeti `npm run setup`. |
| All'avvio: `EADDRINUSE :3200` (o `:4173`) | La porta è già occupata, spesso da un'altra istanza dell'app rimasta aperta. Chiudila, oppure trova il processo con `lsof -i :3200`. |
| Errore `Cannot find module '@portfolia/shared'` | Manca il passo 2 del setup: `npm run build --workspace=shared`. |
| La prima ricerca di un ISIN impiega 8-12 secondi | È scattata la fonte di backup MorningStar, che avvia un browser headless. I titoli già in cache rispondono subito. |
| Errore su Chromium mancante durante una ricerca | `npx playwright install chromium`. |

---

## Sviluppo

Questo documento copre l'uso dell'app. Per lavorare sul codice — `npm run dev`, la suite di test,
le convenzioni sui dati di test — vedi [CLAUDE.md](CLAUDE.md).
