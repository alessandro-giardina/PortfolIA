# PortfolIA - Product Requirements Document

**Autore:** ARchetipo
**Data:** 2026-08-13
**Versione:** 1.2

---

## Elevator Pitch

<!-- archetipo:prd section=elevator_pitch required=true -->

> PortfolIA è una web app locale e privata che ti permette di tracciare il rendimento reale dei tuoi portafogli di titoli nel tempo, partendo dai dati ufficiali di Borsa Italiana.
>
> Per un **investitore privato che gestisce in autonomia i propri investimenti**, che ha il problema di **non avere una visione unificata e veritiera del rendimento reale dei propri titoli nel tempo**, **PortfolIA** è una **web app personale di portfolio tracking** che **calcola valore attuale e profit & loss multi-orizzonte a partire dai dati ufficiali di mercato**. A differenza di **un foglio di calcolo manuale o dell'area clienti del singolo broker**, il nostro prodotto **aggrega più portafogli, recupera automaticamente i dati per ISIN e gira interamente in locale, senza account, cloud o condivisione di dati finanziari sensibili**.

---

## Vision

<!-- archetipo:prd section=vision required=true -->

PortfolIA nasce per dare a un investitore privato uno strumento personale, onesto e sotto pieno controllo per rispondere a una domanda semplice ma difficile: *"i miei investimenti stanno effettivamente rendendo, e quanto?"*. La vision è uno strumento che privilegia la **verità del dato** sopra ogni cosa: nessun numero stimato o inventato, solo ciò che proviene da fonti ufficiali; quando un dato non esiste, l'app lo dichiara apertamente. Tutto questo girando in locale, senza autenticazione né esposizione esterna, perché i dati finanziari personali non devono lasciare la macchina dell'utente.

### Product Differentiator

A differenza dei portali dei broker (che mostrano solo i titoli detenuti presso quel broker) e dei fogli di calcolo manuali (che richiedono aggiornamento manuale dei prezzi e sono soggetti a errori), PortfolIA:

- **aggrega più portafogli** in un unico strumento;
- **recupera automaticamente** denominazione, prezzo attuale e serie storica per ISIN dai dati ufficiali di Borsa Italiana;
- **calcola il P&L su più orizzonti temporali** (giorno, mese, anno, 5 anni, 10 anni) con piena trasparenza sui dati mancanti;
- **gira 100% in locale e privato**, senza account, senza cloud, senza tracciamento.

---

## User Personas

<!-- archetipo:prd section=user_personas required=true -->

### Persona 1: Alessandro, l'investitore-proprietario

**Ruolo:** Investitore privato fai-da-te, professionista in ambito tech
**Età:** 35-50 | **Background:** Gestisce personalmente i propri investimenti in azioni ed ETF, distribuiti su più conti/portafogli logici

**Obiettivi:**
- Vedere in un colpo d'occhio il valore attuale e il rendimento reale dei propri portafogli
- Capire come si sono comportati gli investimenti su diversi orizzonti temporali (mese, anno, 5/10 anni)
- Mantenere il pieno controllo e la privacy dei propri dati finanziari

**Pain Point:**
- Il portale di ogni broker mostra solo una parte del quadro; manca una visione aggregata
- I fogli di calcolo richiedono aggiornamento manuale dei prezzi e sono soggetti a errori
- Diffidenza verso servizi cloud di aggregazione che richiedono di collegare conti e condividere dati sensibili

**Comportamenti e strumenti:** Consulta i mercati saltuariamente (settimanale/mensile), usa già fogli di calcolo e i portali dei broker, è a suo agio con strumenti tecnici e a lanciare un'app da terminale

**Motivazioni:** Controllo, trasparenza, privacy, comprensione reale della performance
**Confidenza tecnica:** Alta — sviluppatore/professionista tech, in grado di eseguire l'app in locale

#### Customer Journey - Alessandro

| Fase | Azione | Pensiero | Emozione | Opportunità |
|---|---|---|---|---|
| Consapevolezza | Si accorge che non ha una visione unica e affidabile dei suoi investimenti | "Quanto sto davvero guadagnando in totale?" | Frustrazione | Promettere una verità unificata del portafoglio |
| Valutazione | Decide di costruirsi uno strumento locale e privato | "Voglio i miei dati sul mio Mac, senza account" | Determinazione | Zero attrito di setup, nessuna registrazione |
| Primo utilizzo | Crea un portafoglio e inserisce i primi titoli per ISIN | "Funziona davvero il recupero dati?" | Curiosità / cautela | Inserimento ISIN fluido, feedback chiaro sul dato recuperato |
| Uso regolare | Apre l'app periodicamente per controllare valore e P&L | "Com'è andato il portafoglio quest'anno?" | Soddisfazione / consapevolezza | Riepilogo multi-orizzonte e grafico immediati |
| Advocacy | Estende l'app con nuove funzionalità per sé | "Posso aggiungere dividendi e import" | Senso di proprietà | Architettura estendibile, scope di crescita chiaro |

---

### Persona 2: Giulia, l'investitrice prudente

**Ruolo:** Investitrice privata orientata al lungo periodo
**Età:** 40-60 | **Background:** Detiene principalmente ETF e qualche azione in ottica buy-and-hold, meno tecnica ma attenta ai numeri

**Obiettivi:**
- Verificare con serenità l'andamento di lungo periodo dei propri investimenti
- Distinguere il guadagno reale dal "rumore" delle oscillazioni quotidiane
- Avere numeri affidabili senza doversi fidare di stime opache

**Pain Point:**
- Si sente sopraffatta dai dati e dalla terminologia finanziaria
- Non sa distinguere la variazione di periodo dal guadagno rispetto al prezzo di acquisto
- Teme di prendere decisioni su numeri sbagliati

**Comportamenti e strumenti:** Controlla gli investimenti raramente, preferisce viste sintetiche e chiare, usa pochi strumenti digitali

**Motivazioni:** Serenità, chiarezza, fiducia nei numeri
**Confidenza tecnica:** Media — usa app comuni; per lei l'avvio dell'app in locale dovrebbe essere il più semplice possibile

#### Customer Journey - Giulia

| Fase | Azione | Pensiero | Emozione | Opportunità |
|---|---|---|---|---|
| Consapevolezza | Vuole capire se il suo piano di lungo periodo sta funzionando | "Sto davvero andando bene a 5-10 anni?" | Incertezza | Enfatizzare gli orizzonti lunghi |
| Valutazione | Le viene mostrato lo strumento già configurato | "Sembra leggibile, non un foglio pieno di numeri" | Sollievo | UI chiara, pochi numeri ma giusti |
| Primo utilizzo | Guarda il riepilogo di un portafoglio già popolato | "Quindi questo è il guadagno reale?" | Comprensione | Distinzione chiara tra P&L da carico e variazione di periodo |
| Uso regolare | Controlla ogni tanto valore e grafico | "Tutto in linea, nessuna sorpresa" | Tranquillità | Lettura immediata, etichette comprensibili |
| Advocacy | Si fida dei numeri per le sue decisioni | "Finalmente vedo la verità dei miei investimenti" | Fiducia | Coerenza e trasparenza costanti sui dati |

---

## Brainstorming Insights

<!-- archetipo:prd section=brainstorming_insights required=true -->

> Scoperte chiave e direzioni alternative esplorate durante la sessione di inception.

### Assunzioni messe in discussione

- **"Bastano API pubbliche gratuite per ISIN + storico 10 anni":** falso nella pratica. Le API gratuite lavorano per ticker, non per ISIN, e lo storico decennale gratuito è raro. La decisione è stata usare lo **scraping dei dati ufficiali di Borsa Italiana** (URL `searchengine/search.html?q=<ISIN>`).
- **"P&L = un solo numero":** chiarito che esistono due metriche distinte e complementari — il **P&L totale rispetto al prezzo di carico** e la **variazione di valore di periodo** (mark-to-market) — da mostrare entrambe.
- **"Persistenza su JSON":** superata in favore di **SQLite**, più adatto a query storiche, cache prezzi e integrità dei dati.
- **Anti-problem / "dato mancante":** di fronte a storici incompleti, si è scelta la **trasparenza totale** (dichiarare "dato non disponibile") invece di stimare o interpolare.

### Nuove direzioni scoperte

- Lo scraper deve essere isolato in un **adapter dedicato**, unico punto da aggiornare quando il sito cambia layout.
- Una **cache locale dei prezzi storici su SQLite** abilita performance, riduce le richieste al sito ed è coerente con la natura "uso personale".
- Distinzione esplicita nel riepilogo tra performance "dall'acquisto" e performance "di periodo" come elemento di valore e chiarezza.

### Assunzioni da validare

- **Robustezza dello scraping di Borsa Italiana:** la struttura HTML del percorso ricerca → scheda strumento → serie storica va verificata sul campo per ciascun tipo di strumento (azione, ETF). *Domanda aperta.*
- **Disponibilità dello storico a 10 anni** per gli ISIN seed (in particolare ETF di emissione recente come `IE00BMVB5S82` / `IE00BMVB5R75`): probabile copertura parziale → applicare trasparenza totale. *Domanda aperta.*
- **Valuta unica EUR** assunta per MVP; nessuna gestione di cambi valuta. *Da confermare in caso di titoli in valuta diversa.*
- **Dividendi/cedole e commissioni esclusi** dall'MVP: il P&L considera solo capital gain/loss da prezzo. *Da validare con l'uso reale.*
- **Politica di accesso al sito** (rate limit, eventuali blocchi, ToS) per uso personale a basso volume.

### Rischi principali

- **Rischio tecnico/adozione (alto):** fragilità dello scraping — un cambio di layout di Borsa Italiana rompe il recupero dati. Mitigazione: adapter isolato + cache + degradazione trasparente.
- **Rischio di copertura dati:** alcuni strumenti o orizzonti storici potrebbero non essere disponibili. Mitigazione: trasparenza totale sui dati mancanti.
- **Rischio di correttezza:** errori di calcolo del P&L multi-orizzonte minerebbero la fiducia. Mitigazione: definizioni chiare delle metriche e test sui calcoli.
- **Rischio di blocco fonte:** richieste eccessive al sito potrebbero portare a blocchi. Mitigazione: caching aggressivo, richieste a basso volume e fonte di backup (MorningStar) come fallback quando la fonte primaria non risponde.

---

## Product Scope

<!-- archetipo:prd section=product_scope required=true -->

### MVP - Minimum Viable Product

1. **Gestione multi-portafoglio:** creare, rinominare ed eliminare più portafogli virtuali.
2. **Ricerca titoli per ISIN:** inserendo un ISIN, l'app recupera denominazione e prezzo attuale dai dati ufficiali di Borsa Italiana; quando il titolo non è trovato su Borsa Italiana (o la fonte è irraggiungibile), l'app interroga MorningStar come fonte di backup e indica all'utente la provenienza dei dati.
3. **Inserimento titoli in portafoglio:** aggiungere a un portafoglio un titolo con data di carico, prezzo di acquisto e quantità.
4. **Riepilogo portafoglio:** valore attuale, P&L complessivo (realizzato e latente) e variazione dell'orizzonte selezionato scomposta in capitale versato e movimento di mercato; gestione trasparente degli orizzonti senza dati e dei titoli non valorizzati.
5. **Tabella titoli:** elenco dei titoli del portafoglio con ISIN, descrizione, quantità, valore attuale, valore medio di carico e differenza.
6. **Grafico andamento:** andamento del valore nel tempo — per il singolo titolo e per il portafoglio nel suo insieme — con scala selezionabile tra ultimo mese, ultimo anno, ultimi 5 anni, ultimi 10 anni e tutto lo storico.
7. **Persistenza locale su SQLite:** tutti i dati salvati localmente; nessuna autenticazione; esecuzione solo in locale.
8. **Cache dei prezzi storici:** memorizzazione locale delle serie storiche recuperate per performance e per ridurre le richieste alla fonte.
9. **Vendite e posizioni chiuse:** registrare la vendita parziale o totale di una posizione con attribuzione LIFO del costo, distinguendo il P&L **realizzato** (già incassato e congelato) da quello **latente** (ancora esposto al mercato); un titolo venduto interamente esce dai titoli posseduti e resta consultabile fra le posizioni chiuse.
10. **Dati seed iniziali:** inizializzazione con gli ISIN `IT0003128367`, `IE00BMVB5S82`, `IE00BMVB5R75`.

### Funzionalità di crescita (Post-MVP)

- **Saldo di liquidità** del portafoglio, per trattenere l'incasso delle vendite e rendere continuo il valore totale (ADR-009).
- Gestione di **dividendi/cedole** e **commissioni** nel calcolo del rendimento (e total return).
- Supporto **multi-valuta** con conversione cambi.
- **Import automatico** da file di estratto conto / broker (CSV).
- **Benchmark** e confronto del portafoglio con un indice di riferimento.

### Visione (Futuro)

- **Alert e notifiche** locali su soglie di prezzo o variazioni.
- **Analisi di rischio/allocazione** (diversificazione, esposizione per settore/area).
- **Fonti dati aggiuntive** oltre Borsa Italiana e MorningStar (es. provider per la serie storica multi-fonte).
- **Reportistica esportabile** (PDF/Excel) e proiezioni.

---

## Technical Architecture

<!-- archetipo:prd section=technical_architecture required=true -->

> **Proposta da:** Leonardo (Architect)

### System Architecture

PortfolIA è un'applicazione **full-stack TypeScript a singolo processo locale**, pensata per essere avviata con un comando e usata dal browser su `localhost`. Il backend espone un'API interna, accede a SQLite per la persistenza e incapsula il recupero dei dati di mercato dietro un *adapter* dedicato che esegue lo scraping di Borsa Italiana. Il frontend è una SPA che consuma l'API ed effettua i calcoli di presentazione (riepiloghi, grafici).

**Pattern architetturale:** Architettura a livelli (presentation → API → service/domain → data access), con i **Market Data Adapter** isolati come *anti-corruption layer* verso le fonti esterne (scraping). Più adapter (Borsa Italiana come fonte primaria, MorningStar come backup) espongono la stessa interfaccia e sono coordinati da una logica di orchestrazione che applica il fallback e traccia la provenienza del dato.

**Componenti principali:**
- **Web UI (SPA):** dashboard portafogli, ricerca ISIN, form di carico, tabella titoli, grafico andamento.
- **API/Backend:** endpoint per portafogli, posizioni e dati di mercato; orchestrazione dei calcoli di P&L.
- **Domain/Service layer:** logica di calcolo valore attuale, P&L da carico e variazione multi-orizzonte; regole di trasparenza sui dati mancanti.
- **Market Data Adapter:** moduli isolati per lo scraping delle fonti (Borsa Italiana primaria, MorningStar di backup) — ricerca per ISIN → scheda strumento → serie storica — con parsing HTML, normalizzazione e orchestrazione del fallback con tracciamento della provenienza.
- **Cache & Persistenza (SQLite):** portafogli, posizioni, anagrafica titoli e serie storiche prezzi in cache.

### Technology Stack

| Livello | Tecnologia | Versione | Motivazione |
|---|---|---|---|
| Linguaggio | TypeScript | 5.x | Tipizzazione end-to-end, un solo linguaggio per front e back |
| Framework Backend | Node.js + Fastify (o Express) | Node 20 LTS / Fastify 4.x | Leggero, ideale per server locale a singolo utente |
| Framework Frontend | React + Vite | React 18 / Vite 5.x | SPA reattiva, dev server veloce, build semplice |
| Database | SQLite | 3.x | Persistenza locale su file, zero configurazione, query storiche efficienti |
| ORM | Drizzle ORM (o Prisma) | ultima stabile | Accesso dati tipizzato, migrazioni semplici su SQLite |
| Auth | Nessuna | — | App locale single-user senza accesso esterno (requisito esplicito) |
| Testing | Vitest + Playwright | ultima stabile | Unit/integration sui calcoli e sull'adapter; E2E sulle viste chiave |
| Scraping/Parsing | fetch + Cheerio | ultima stabile | Recupero e parsing HTML di Borsa Italiana nell'adapter |
| Grafici | Recharts (o Chart.js) | ultima stabile | Grafico andamento valore con scale temporali |

### Project Structure

**Pattern organizzativo:** Monorepo leggero con separazione `client` / `server` / `shared`, e isolamento esplicito dell'adapter dati di mercato.

```text
portfolIA/
├── package.json
├── data/
│   └── portfolia.db            # database SQLite locale
├── server/
│   ├── src/
│   │   ├── index.ts            # bootstrap server locale
│   │   ├── api/                # route: portfolios, positions, market
│   │   ├── domain/             # calcoli P&L, valore, orizzonti temporali
│   │   ├── market/             # Market Data Adapter (scraping multi-fonte + fallback)
│   │   │   ├── borsaItalianaAdapter.ts
│   │   │   ├── morningstarAdapter.ts
│   │   │   └── parser.ts
│   │   ├── db/                 # schema, migrazioni, repository (Drizzle)
│   │   └── seed/               # inizializzazione ISIN seed
│   └── tests/
├── client/
│   ├── src/
│   │   ├── pages/              # Dashboard, Portafoglio, Ricerca ISIN
│   │   ├── components/         # tabella titoli, grafico, riepilogo
│   │   └── api/                # client API verso il backend
│   └── tests/
└── shared/
    └── types/                  # tipi condivisi (Portfolio, Position, Quote...)
```

### Development Environment

Ambiente di sviluppo locale su macOS (MacBook). Avvio con un singolo comando (es. `npm run dev`) che lancia backend e frontend; l'app è raggiungibile via browser su `localhost`. Il database SQLite è un file locale creato/migrato all'avvio; il comando di seed popola gli ISIN iniziali.

**Strumenti richiesti:** Node.js 20 LTS, npm/pnpm, browser moderno; nessun servizio esterno né credenziali.

### CI/CD & Deployment

**Build tool:** Vite (frontend) + tsc/esbuild (backend).

**Pipeline:** Lint + type-check + test unitari/integrazione (Vitest) + E2E essenziali (Playwright). Trattandosi di progetto locale, la pipeline può essere eseguita localmente o tramite un workflow CI opzionale.

**Strategia di deployment:** Nessun deployment cloud. Distribuzione come progetto da clonare/installare ed eseguire localmente; opzionale packaging in script di avvio.

**Infrastruttura target:** Macchina locale dell'utente (MacBook). Nessuna esposizione di rete oltre `localhost`.

### Architecture Decision Records (ADR)

- **ADR-001 — SQLite invece di file JSON:** scelto SQLite per query storiche efficienti, cache prezzi e integrità, superando il requisito iniziale del JSON.
- **ADR-002 — Scraping di Borsa Italiana isolato in un adapter:** la fonte dati è il sito ufficiale via `searchengine/search.html?q=<ISIN>`; tutta la logica fragile di parsing HTML è confinata in un unico modulo (anti-corruption layer).
- **ADR-003 — Trasparenza totale sui dati mancanti:** quando un orizzonte storico non è disponibile, l'app dichiara "dato non disponibile" e non stima né interpola valori.
- **ADR-004 — Nessuna autenticazione:** l'app è single-user, locale e non esposta all'esterno; l'auth è esplicitamente fuori scope.
- **ADR-005 — Cache locale dei prezzi storici** *(superata da ADR-008)*: le serie storiche recuperate sono persistite su SQLite per performance e per minimizzare le richieste alla fonte. Decisione presa quando si dava per acquisito il recupero della serie storica completa dalla fonte; conservata come record storico.
- **ADR-006 — Full-stack TypeScript:** un solo linguaggio e tipi condivisi tra client e server per ridurre la complessità.
- **ADR-007 — Fonte di backup MorningStar con fallback e provenienza visibile:** quando Borsa Italiana non trova il titolo o è irraggiungibile, il sistema interroga MorningStar (`https://global.morningstar.com/it`) tramite un secondo adapter isolato dietro la stessa interfaccia della fonte primaria. La provenienza (fonte primaria o di backup) è mostrata all'utente. Estende ADR-002 e mitiga il rischio di blocco/fragilità della singola fonte; le regole di Buona Cittadinanza (User-Agent corretto, basso volume, caching) valgono per entrambe le fonti.
- **ADR-008 — Storico prezzi osservazionale invece di serie storica recuperata** *(supera ADR-005)*: lo storico dei prezzi non viene richiesto alla fonte, ma si accumula registrando le quotazioni già rilevate durante gli aggiornamenti che l'utente provoca (ricerca titolo, scheda titolo, aggiornamento massivo dei titoli obsoleti). Motivazione: il recupero della serie storica decennale via scraping era l'assunzione a maggior rischio del progetto — copertura incerta per gli ETF di emissione recente e muro anti-bot già incontrato con la fonte di backup — e la sua riuscita non dipendeva da noi. Con lo storico osservazionale la Buona Cittadinanza diventa vera per costruzione: la funzionalità non aggiunge una sola richiesta alla fonte. Costo accettato: lo storico è **rado** e parte dall'entrata in esercizio, quindi gli orizzonti lunghi (5 e 10 anni) resteranno a lungo "dato non disponibile" secondo ADR-003. La deduplica delle osservazioni è per giorno civile (Europe/Rome) e non per prezzo: due giorni consecutivi a prezzo invariato restano due osservazioni distinte, perché comprimerle renderebbe un dato piatto indistinguibile da un dato assente.
- **ADR-009 — Vendite come iscrizioni append-only, costo LIFO, nessun saldo di liquidità:** una vendita è un **nuovo fatto** nel registro, mai la modifica o la cancellazione di un carico esistente; la rimozione di un carico resta uno strumento di errata (FR-009) e diventa impossibile su un carico già consumato. Tre decisioni compongono questo ADR:
  1. **Attribuzione LIFO** invece del prezzo medio ponderato già usato da FR-008. Il medio ponderato avrebbe una proprietà comoda — la vendita parziale non altera il costo per quota del residuo — ma LIFO è il criterio che la normativa fiscale italiana impone sulle plusvalenze da titoli della stessa specie, e allineare il calcolo alla realtà fiscale dell'utente vale la complessità in più. Costo accettato: ogni carico diventa un **lotto** con quantità residua propria, e il prezzo medio del residuo cambia dopo ogni vendita. La quantità residua dei lotti è **derivata** rigiocando le vendite sul registro, non memorizzata, perché un valore salvato può divergere dal registro che dovrebbe riassumere.
  2. **P&L realizzato congelato.** Si calcola una volta, all'atto della vendita, e non varia più: un guadagno già incassato che si muovesse con le rilevazioni successive renderebbe i numeri inaffidabili. Da qui l'invariante da testare: `realizzato + latente = totale`, invariato prima e dopo una vendita a prezzo di mercato fermo. La percentuale del P&L totale ha per base il costo di **tutti** i carichi, lotti venduti inclusi — con LIFO il costo dei lotti consumati più quello dei residui somma esattamente al costo complessivo dei carichi, quindi la base è verificabile con un test. Escludere il costo dei lotti venduti dal denominatore mentre il loro guadagno resta al numeratore produrrebbe percentuali gonfiate.
  3. **Nessun saldo di liquidità.** L'app tiene i titoli, non la cassa: l'incasso di una vendita non è trattenuto come liquidità del portafoglio. Conseguenza da governare in UI e non da nascondere con la matematica: al momento di una vendita totale il valore attuale scende, e sommare il realizzato al valore attuale per "compensare" mescolerebbe un flusso con uno stock, gonfiando il patrimonio con un guadagno che non è titoli. L'app dichiara quindi esplicitamente che l'incasso è fuori dal suo perimetro. Un saldo di liquidità resta un candidato Post-MVP.
- **ADR-010 — Aggregazione del valore di portafoglio sull'ultimo prezzo noto, dichiarato:** il valore del portafoglio a una data passata richiede un prezzo per **ogni** titolo detenuto a quella data, ma lo storico di ADR-008 è rado e indipendente titolo per titolo: le date di rilevazione dei diversi ISIN non coincidono quasi mai. Il valore di un punto si calcola quindi facendo entrare ciascun titolo con la sua **ultima rilevazione registrata non successiva** alla data del punto, e ogni prezzo così riportato in avanti è **dichiarato a schermo** — data della quotazione usata e sua età in giorni. Le due alternative sono state scartate: ammettere un punto solo dove tutti i titoli hanno una rilevazione alla stessa data produce, su storici radi e disallineati, una serie di pochissimi punti o vuota; sommare a ogni data i soli titoli rilevati quel giorno produce una curva che sale e scende perché cambia l'insieme sommato, non perché il mercato si muova — un artefatto indistinguibile da una performance. Il confine con ADR-003 è netto e va tenuto: si **riporta** un prezzo realmente osservato, non se ne **stima** uno mai osservato, e nessun punto è interpolato fra due rilevazioni. Costo accettato: la copertura piena comincia dalla prima data in cui ogni titolo detenuto ha un prezzo noto, e il tratto anteriore è dichiarato parziale con i titoli non ancora valorizzati nominati uno per uno (FR-012) — non disegnato come un portafoglio che valeva meno.

---

## Functional Requirements

<!-- archetipo:prd section=functional_requirements required=true -->

### Gestione portafogli

- **FR-001:** L'utente può creare un nuovo portafoglio assegnandogli un nome.
- **FR-002:** L'utente può visualizzare l'elenco di tutti i portafogli esistenti.
- **FR-003:** L'utente può rinominare ed eliminare un portafoglio esistente.

### Ricerca e anagrafica titoli

- **FR-004:** L'utente può ricercare un titolo inserendo un codice ISIN.
- **FR-005:** Il sistema recupera dai dati ufficiali di Borsa Italiana, a partire dall'ISIN: la denominazione del titolo; il prezzo attuale, il ticker, il Tipo Strumento, le Commissioni totali annue, la Valuta di Denominazione; l'Emittente; il Segmento, la politica di distribuzione Dividendi.
- **FR-006:** Il sistema gestisce in modo esplicito il caso di ISIN non trovato su nessuna delle fonti (Borsa Italiana e MorningStar) o di dati non disponibili, senza generare valori inventati.
- **FR-020:** Quando Borsa Italiana non trova il titolo o è irraggiungibile (timeout/errore di rete), il sistema interroga MorningStar (`https://global.morningstar.com/it`) come fonte di backup, ricercando per ISIN e recuperando lo stesso insieme di dati anagrafici e di prezzo della fonte primaria.
- **FR-021:** Il sistema indica all'utente da quale fonte (Borsa Italiana primaria o MorningStar di backup) provengono i dati del titolo mostrati.

### Inserimento e gestione posizioni

- **FR-007:** L'utente può aggiungere un titolo a un portafoglio specificando data di carico, prezzo di acquisto e quantità acquistata.
- **FR-008:** L'utente può inserire più carichi dello stesso titolo nello stesso portafoglio, con calcolo del prezzo medio di carico.
- **FR-009:** L'utente può modificare o rimuovere una posizione/carico inserito. La rimozione è una **correzione di un'iscrizione errata** (errata) e non rappresenta una vendita: cancella il carico come se non fosse mai avvenuto, senza produrre alcun P&L realizzato. Per ridurre una posizione a seguito di un'operazione realmente eseguita si usa la vendita (FR-022).

### Vendite e posizioni chiuse

- **FR-022:** L'utente può registrare la vendita di una parte o di tutta la quantità posseduta di un titolo, indicando data, prezzo di vendita e quantità. La vendita è registrata come **nuova iscrizione** nel registro: nessun carico esistente viene modificato o cancellato.
- **FR-023:** Il sistema attribuisce il costo delle quote vendute secondo il criterio **LIFO** (ADR-009), consumando per primi i carichi con data più recente fra quelli non successivi alla data di vendita, e ricalcola il prezzo medio di carico della quantità residua sui soli lotti non consumati.
- **FR-024:** Il sistema rifiuta una vendita di quantità superiore a quella disponibile alla data indicata e una vendita anteriore al carico che dovrebbe consumare: la quantità residua non è mai negativa. Un carico già consumato, anche solo in parte, da una vendita non può essere rimosso né modificato.
- **FR-025:** Per ogni portafoglio il sistema mostra il **P&L realizzato** (calcolato all'atto della vendita e immutabile al sopraggiungere di nuove rilevazioni di prezzo), il **P&L latente** (calcolato sulla sola quantità residua) e il loro totale. Il P&L realizzato non è mai sommato al valore attuale del portafoglio (FR-010), che comprende i soli titoli posseduti; l'assenza di un saldo di liquidità è dichiarata esplicitamente all'utente (ADR-009).
- **FR-026:** Un titolo con quantità residua nulla non compare fra i titoli posseduti (FR-013) ed è elencato in una sezione **posizioni chiuse** con quantità venduta, incasso e P&L realizzato. Un nuovo carico sullo stesso ISIN riapre la posizione senza cancellare lo storico delle vendite.
- **FR-027:** La quantità detenuta a una data è calcolata come somma dei carichi meno somma delle vendite non successive a quella data, così che il grafico dell'andamento (FR-015) resti storicamente veritiero anche dopo una vendita.

### Riepilogo e indicatori di rendimento

- **FR-010:** Per ogni portafoglio il sistema mostra il valore attuale totale calcolato sui prezzi correnti dei titoli.
- **FR-011:** Per ogni portafoglio il sistema mostra, sull'orizzonte temporale selezionato per il grafico (FR-016), la variazione del valore in € e la sua **scomposizione** in capitale netto versato (carichi meno vendite cadute nell'orizzonte) e movimento di mercato, quest'ultimo anche in percentuale su una base dichiarata. Accanto a essa resta il P&L complessivo di FR-025, che non dipende dall'orizzonte scelto. *Formulazione rivista in v1.2: la versione precedente chiedeva il P&L su cinque orizzonti mostrati insieme; la sostituisce la coppia «variazione dell'orizzonte selezionato + P&L complessivo invariante», la stessa forma già in esercizio sulla scheda del singolo titolo. La scomposizione è un'aggiunta, non un taglio: su un aggregato la differenza fra due istanti comprende i versamenti, e presentarla come rendimento sarebbe un dato falso.*
- **FR-012:** Quando un orizzonte temporale non dispone di dati storici sufficienti, il sistema lo segnala chiaramente come "dato non disponibile". Su un aggregato la copertura ha **due** dimensioni indipendenti — quanta parte dell'orizzonte è coperta nel tempo e quanti titoli detenuti sono valorizzati — e il sistema le dichiara separatamente, nominando i titoli che rendono parziale il dato invece di riportarne il solo conteggio.

### Visualizzazione titoli

- **FR-013:** Per ogni portafoglio il sistema mostra la lista dei titoli in forma tabellare con: ISIN, descrizione titolo, quantità posseduta, valore attuale, valore medio di carico e differenza.
- **FR-014:** Cliccando su ogni titolo nella lista descritta dalla FR-013, il sistema mostra tutti i dati disponibili per il titolo: ISIN, descrizione titolo, quantità posseduta, valore attuale, valore medio di carico e differenza, il ticker, il Tipo Strumento, le Commissioni totali annue, la Valuta di Denominazione; l'Emittente; il Segmento, la politica di distribuzione Dividendi.

### Grafico andamento

- **FR-015:** Per ogni portafoglio il sistema mostra un grafico dell'andamento del valore nel tempo. La curva è una sola — il valore complessivo — e ha un punto a ogni data d'evento dell'archivio (rilevazione, carico, vendita); il valore di un punto è la somma, sui titoli del portafoglio, della quantità detenuta a quella data (FR-027) moltiplicata per l'ultimo prezzo noto a quella data secondo ADR-010. Lo stesso grafico esiste per il singolo titolo, dove commuta fra prezzo unitario e valore della posizione; per un portafoglio il prezzo unitario non ha significato e quel commutatore non compare.
- **FR-016:** L'utente può selezionare la scala temporale del grafico tra: ultimo mese, ultimo anno, ultimi 5 anni, ultimi 10 anni e tutto lo storico (dal primo carico a oggi, scala predefinita). *Formulazione rivista in v1.2: «giorno precedente» è stato rimosso dall'elenco. Con lo storico rado di ADR-008 un orizzonte di un giorno dichiarerebbe "dato non disponibile" quasi sempre, e "tutto lo storico" — assente nella versione precedente — è l'orizzonte che l'utente usa davvero. L'elenco è identico per il portafoglio e per il singolo titolo: una sola definizione di orizzonte in tutta l'app.*

### Persistenza e dati iniziali

- **FR-017:** Tutti i dati (portafogli, posizioni, anagrafica in cache e storico dei prezzi osservati) sono persistiti localmente su SQLite tra le sessioni.
- **FR-018:** Il sistema registra localmente le quotazioni rilevate durante gli aggiornamenti richiesti dall'utente (ricerca titolo, scheda titolo, aggiornamento massivo), costruendo nel tempo uno storico dei prezzi senza mai contattare la fonte per ottenerlo. Lo storico è rado per costruzione — contiene solo i giorni effettivamente osservati — e i periodi non osservati sono dichiarati mancanti secondo ADR-003, mai stimati.
- **FR-019:** All'inizializzazione il sistema popola i dati con gli ISIN seed `IT0003128367`, `IE00BMVB5S82`, `IE00BMVB5R75`.

---

## Non-Functional Requirements

<!-- archetipo:prd section=non_functional_requirements required=true -->

### Sicurezza

- L'applicazione gira esclusivamente in locale (`localhost`) e non espone alcuna interfaccia di rete verso l'esterno.
- Nessun servizio di autenticazione: l'accesso è garantito dal possesso fisico della macchina (requisito esplicito).
- Nessun dato finanziario viene inviato a servizi cloud o terze parti, ad eccezione delle richieste in sola lettura verso Borsa Italiana e, come fonte di backup, MorningStar per il recupero dei dati di mercato.
- Il database SQLite risiede come file locale nella directory dell'applicazione.

### Integrazioni

- **Borsa Italiana (scraping HTML, fonte primaria):** integrazione in sola lettura via `https://www.borsaitaliana.it/borsa/searchengine/search.html?q=<ISIN>`, seguendo il percorso ricerca → scheda strumento → serie storica. La logica è isolata in un adapter dedicato.
- **MorningStar (scraping HTML, fonte di backup):** integrazione in sola lettura via `https://global.morningstar.com/it`, inserendo l'ISIN nella casella di ricerca del sito per raggiungere la scheda dello strumento. Interrogata solo quando Borsa Italiana non trova il titolo o è irraggiungibile. La logica è isolata in un secondo adapter dietro la stessa interfaccia della fonte primaria.
- **Robustezza:** ogni adapter deve gestire variazioni di markup, timeout ed errori di rete in modo degradante, segnalando i dati non disponibili anziché bloccare l'app.
- **Buona cittadinanza:** per entrambe le fonti, richieste a basso volume, User-Agent corretto e caching aggressivo delle serie storiche per minimizzare le chiamate.

---

## Next Steps

<!-- archetipo:prd section=next_steps required=true -->

1. **Backlog** - Esegui `/archetipo-spec` per trasformare questo PRD in un backlog
2. **Design** - Esegui `/archetipo-design` per i mockup della UI (quando applicabile)
3. **Validazione** - Verifica sul campo la robustezza dello scraping di Borsa Italiana e la disponibilità dello storico a 10 anni per gli ISIN seed (assunzioni a maggior rischio)

---

_PRD generato tramite ARchetipo Product Inception - 2026-06-26_
_Sessione condotta da: Alessandro con il team ARchetipo_
