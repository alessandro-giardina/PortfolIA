/**
 * US-045: la curva del valore della posizione riflette le vendite — varianti.
 *
 * File sorello del demo (`US-045__grafico-riflette-vendite.spec.ts`), senza
 * video: stessa coppia `US-026__*` per la ragione già documentata in
 * `CLAUDE.md` — `launchOptions.slowMo` non è scopabile a un solo `describe`,
 * quindi gli scenari senza video vivono in un file proprio.
 *
 * Il demo dimostra la vendita **parziale**: uno scalino che riduce la
 * quantità detenuta senza mai svuotarla. Qui i due scenari mettono alla prova
 * ciò che quel caso non tocca — la vendita **totale**:
 *
 *  - dopo una vendita che esaurisce l'intera quantità, i punti successivi non
 *    devono sparire dal tracciato: devono restare *presenti*, a controvalore e
 *    quantità **zero misurati** (`data-valore="0"`, `data-quantita="0"`), e non
 *    essere silenziosamente esclusi come i punti anteriori al primo carico
 *    (`data-esclusi`). È esattamente la distinzione che `componiSerieValore`
 *    dichiara nella propria documentazione: «una posizione che non esiste non
 *    è una posizione che vale zero» — e qui vale l'inverso, una posizione
 *    azzerata **non va confusa con una posizione inesistente**;
 *  - un nuovo carico registrato *dopo* la vendita totale (una riapertura) deve
 *    riportare la curva a un controvalore positivo dalla propria data, come
 *    **nuova origine**: `componiSerieValore` genera un gradino solo quando la
 *    quantità precedente al carico è positiva, e qui è zero — la stessa regola
 *    per cui il primissimo carico della serie non è mai un gradino. Il punto
 *    della riapertura non deve quindi portare `data-capo`, e la quantità che
 *    porta è quella del nuovo carico soltanto — non somma di quella venduta.
 *
 * Le premesse sono in giorni indietro da adesso e non in date fisse, per la
 * stessa ragione registrata nel file demo: una data scritta a mano invecchia,
 * e il rapporto d'ordine fra carichi, vendita e rilevazioni — l'intero
 * contenuto dello scenario — smetterebbe di essere quello che il test crede
 * di aver costruito.
 *
 * Titolo seminato: TITOLO_US_045_VARIANTI, riservato a questo file — non può
 * condividere la chiave con `TITOLO_US_045` perché i due file girano su
 * worker potenzialmente paralleli, e seminare-e-ripristinare le rilevazioni è
 * uno stack di undo per ISIN. I due scenari di questo file girano invece in
 * serie (`fullyParallel: false`), quindi entrambi possono seminare lo stesso
 * ISIN da capo con `seminaOsservazioni`, che *sostituisce* lo storico.
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLO_US_045_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_045_VARIANTI.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC** — stessa regola e
 * stessa ragione del file demo: `Position.loadDate` e `Sale.saleDate` sono
 * date civili ancorate a mezzanotte UTC, e comporla dai campi locali la
 * farebbe scivolare di un giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Il controvalore atteso, calcolato con la stessa aritmetica di `data-valore`. */
function controvalore(prezzo: number, quantita: number): string {
  return String(prezzo * quantita);
}

/**
 * Naviga al portafoglio e apre la scheda titolo cliccando la riga di
 * riepilogo (US-018): è l'**unico** modo con cui l'applicazione apre questa
 * scheda. Una riga di «Posizioni chiuse» (US-044) non porta alcun gestore di
 * clic — non è un dettaglio di questo file, è come l'interfaccia è scritta —
 * quindi uno scenario a residuo zero deve aprire la scheda **mentre la
 * posizione è ancora aperta** e registrare la vendita totale solo dopo.
 */
async function apriSchedaTitolo(page: import('@playwright/test').Page, portfolioId: number) {
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });
}

/** Linguetta della barra schede, per nome — stessa convenzione di US-026. */
function linguetta(page: import('@playwright/test').Page, nome: string) {
  return page.locator('nav.linguette a', { hasText: nome });
}

/** Commuta il grafico titolo, già in pagina, sulla vista del valore della posizione. */
async function commutaSuVistaValore(page: import('@playwright/test').Page) {
  const sezione = page.getByTestId('sezione-grafico-titolo');
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();

  const grafico = page.getByTestId('grafico-titolo');
  // Apertura sulla vista predefinita (il prezzo, criterio di US-039): la
  // commutazione è un passo esplicito e non una premessa.
  await expect(grafico).toHaveAttribute('data-vista', 'prezzo');

  const commutatore = page.getByTestId('vista-grafico');
  await commutatore.scrollIntoViewIfNeeded();
  await page.getByTestId('vista-valore').click();
  await expect(grafico).toHaveAttribute('data-vista', 'valore');
  await expect(page.getByTestId('vista-valore')).toHaveAttribute('aria-pressed', 'true');

  return grafico;
}

// ---------------------------------------------------------------------------
// Vendita totale: i punti a quantità zero restano presenti, non esclusi
// ---------------------------------------------------------------------------

/** Il carico: 500 quote. */
const CARICO = { giorniFa: 600, prezzo: 40, quantita: 500 };

/** La vendita totale: le stesse 500 quote, più tardi. */
const VENDITA_TOTALE = { giorniFa: 400, prezzo: 52, quantita: CARICO.quantita };

/**
 * Quattro rilevazioni: la prima prima della vendita (quantità intera), le due
 * successive dopo (quantità zero, perché la vendita ha esaurito il residuo).
 * La terza coincide con l'istante «adesso» e con il prezzo di cartellino.
 */
const OSSERVAZIONI = [
  { giorniFa: 500, prezzo: 45 }, // prima della vendita totale
  { giorniFa: 200, prezzo: 60 }, // dopo la vendita totale: quantità zero
  { giorniFa: 0, prezzo: TITOLO_US_045_VARIANTI.campi.price! }, // adesso: ancora zero
];

test('vendita totale: i punti successivi restano nel tracciato a controvalore zero, non vengono esclusi', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Vendita Totale Grafico');

  // ─── Premesse possedute da questo scenario, non ereditate ────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_045_VARIANTI.campi);

  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN,
    dataCivileIndietro(CARICO.giorniFa),
    CARICO.prezzo,
    CARICO.quantita,
  );

  // Le rilevazioni non dipendono dalla vendita: sono righe di `securities`
  // per ISIN, non per posizione, quindi si seminano già tutte qui.
  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(
    ISIN,
    OSSERVAZIONI.map((rilevazione) => ({
      price: rilevazione.prezzo,
      observed_at: adesso - rilevazione.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    })),
  );

  // 1. La scheda titolo si apre ora, mentre la posizione vale ancora 500
  //    quote: è la premessa che rende possibile il resto dello scenario.
  await apriSchedaTitolo(page, portfolioId);

  // 2. La linguetta "Riepilogo" smonta la scheda titolo (il componente non
  //    ha altra fonte dati che la propria lettura al montaggio): è qui,
  //    fuori dall'interfaccia di vendita — già coperta da US-042, non
  //    l'oggetto di questo criterio — che si registra la vendita totale.
  await linguetta(page, 'Riepilogo').click();
  await expect(page.getByTestId('scheda-titolo')).toHaveCount(0);

  await registraVendita(
    portfolioId,
    ISIN,
    dataCivileIndietro(VENDITA_TOTALE.giorniFa),
    VENDITA_TOTALE.prezzo,
    VENDITA_TOTALE.quantita,
  );

  // 3. Tornare sulla scheda titolo la rimonta: la nuova lettura del
  //    dettaglio porta con sé la vendita appena registrata, anche se la riga
  //    di riepilogo della posizione (ora a residuo zero) è nel frattempo
  //    scomparsa dalla tabella dei posseduti — non serve più, perché la
  //    scheda resta ancorata all'ISIN già scelto (US-018).
  await linguetta(page, 'Scheda titolo').click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  const grafico = await commutaSuVistaValore(page);

  // Quattro punti in tutto: il carico e le tre rilevazioni. Se i punti a
  // quantità zero fossero esclusi invece che azzerati, qui si leggerebbe 2 —
  // è esattamente il difetto che questo scenario dimostra corretto.
  await expect(grafico).toHaveAttribute('data-punti', '4');
  // Nessun punto è anteriore al primo carico (che è il primo punto della
  // serie): nulla va confuso con l'esclusione, il conteggio è zero.
  await expect(grafico).toHaveAttribute('data-esclusi', '0');
  // Un solo carico, e il primo della serie: nessun gradino da denaro versato.
  await expect(grafico).toHaveAttribute('data-gradini', '0');
  await expect(grafico).toHaveAttribute('data-copertura', 'piena');

  const puntoCarico = page.getByTestId('punto-serie-0');
  const puntoAnteVendita = page.getByTestId('punto-serie-1');
  const puntoPostVenditaA = page.getByTestId('punto-serie-2');
  const puntoPostVenditaB = page.getByTestId('punto-serie-3');

  await expect(puntoCarico).toHaveAttribute('data-quantita', String(CARICO.quantita));
  await expect(puntoCarico).toHaveAttribute(
    'data-valore',
    controvalore(CARICO.prezzo, CARICO.quantita),
  );

  await expect(puntoAnteVendita).toHaveAttribute('data-quantita', String(CARICO.quantita));
  await expect(puntoAnteVendita).toHaveAttribute(
    'data-valore',
    controvalore(OSSERVAZIONI[0].prezzo, CARICO.quantita),
  );

  // Il criterio che regge lo scenario: i due punti successivi alla vendita
  // totale sono *presenti* (attaccati al DOM, con un indice di serie), e
  // portano quantità e controvalore zero — letti dal DOM, non ricalcolati e
  // non semplicemente assenti dalla lista dei punti.
  await expect(puntoPostVenditaA).toBeAttached();
  await expect(puntoPostVenditaA).toHaveAttribute('data-quantita', '0');
  await expect(puntoPostVenditaA).toHaveAttribute('data-valore', '0');

  await expect(puntoPostVenditaB).toBeAttached();
  await expect(puntoPostVenditaB).toHaveAttribute('data-quantita', '0');
  await expect(puntoPostVenditaB).toHaveAttribute('data-valore', '0');

  // Nessun quinto punto: la lista non prosegue oltre i quattro dichiarati da
  // data-punti, cioè lo zero non nasconde né un troncamento né un'esclusione.
  await expect(page.getByTestId('punto-serie-4')).toHaveCount(0);

  // La fascia della quantità detenuta, sotto l'asse: da 500 quote a zero, e la
  // fascia a zero è disegnata — non omessa perché "non c'è nulla da mostrare".
  const fasciaPiena = page.getByTestId('fascia-quantita-0');
  const fasciaVenduta = page.getByTestId('fascia-quantita-1');
  await fasciaPiena.scrollIntoViewIfNeeded();
  await expect(fasciaPiena).toHaveAttribute('data-quantita', String(CARICO.quantita));
  await expect(fasciaVenduta).toHaveAttribute('data-quantita', '0');
});

// ---------------------------------------------------------------------------
// Riapertura dopo la vendita totale: nuova origine, non gradino
// ---------------------------------------------------------------------------

/** Il primo carico: 800 quote. */
const CARICO_A = { giorniFa: 900, prezzo: 30, quantita: 800 };

/** La vendita che esaurisce l'intero primo carico. */
const VENDITA_TOTALE_2 = { giorniFa: 500, prezzo: 42, quantita: CARICO_A.quantita };

/**
 * Il nuovo carico, registrato dopo la vendita totale: quantità
 * **deliberatamente diversa** dal primo (300 contro 800). Se la riapertura
 * fosse trattata come un gradino sulla posizione precedente invece che come
 * nuova origine, il punto mostrerebbe una quantità che include il residuo
 * venduto — qui impossibile, perché il residuo è zero e le quantità sono
 * diverse per costruzione.
 */
const CARICO_B = { giorniFa: 200, prezzo: 25, quantita: 300 };

/**
 * Quattro rilevazioni, una per ciascuna delle quattro fasi della storia:
 * prima della vendita (quantità di A), dopo la vendita e prima della
 * riapertura (quantità zero), dopo la riapertura (quantità di B), e
 * all'istante «adesso» (quantità di B, prezzo di cartellino).
 */
const OSSERVAZIONI_2 = [
  { giorniFa: 700, prezzo: 35 }, // prima della vendita totale: quantità di A
  { giorniFa: 350, prezzo: 38 }, // dopo la vendita, prima della riapertura: zero
  { giorniFa: 90, prezzo: 28 }, // dopo la riapertura: quantità di B
  { giorniFa: 0, prezzo: TITOLO_US_045_VARIANTI.campi.price! }, // adesso: quantità di B
];

test('riapertura dopo vendita totale: il nuovo carico è una nuova origine, non un gradino sulla posizione venduta', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Riapertura Dopo Vendita');

  // ─── Premesse possedute da questo scenario, non ereditate ────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_045_VARIANTI.campi);

  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN,
    dataCivileIndietro(CARICO_A.giorniFa),
    CARICO_A.prezzo,
    CARICO_A.quantita,
  );

  await registraVendita(
    portfolioId,
    ISIN,
    dataCivileIndietro(VENDITA_TOTALE_2.giorniFa),
    VENDITA_TOTALE_2.prezzo,
    VENDITA_TOTALE_2.quantita,
  );

  // Il nuovo carico, registrato *dopo* che la posizione era già stata venduta
  // per intero: è la riapertura che questo scenario mette alla prova.
  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN,
    dataCivileIndietro(CARICO_B.giorniFa),
    CARICO_B.prezzo,
    CARICO_B.quantita,
  );

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;

  archivio.seminaOsservazioni(
    ISIN,
    OSSERVAZIONI_2.map((rilevazione) => ({
      price: rilevazione.prezzo,
      observed_at: adesso - rilevazione.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    })),
  );

  // A differenza dello scenario precedente, qui la posizione ha residuo 300 —
  // la riapertura — quindi la riga di riepilogo esiste già alla prima
  // apertura: non serve la sequenza «apri, esci, vendi, rientra».
  await apriSchedaTitolo(page, portfolioId);
  const grafico = await commutaSuVistaValore(page);

  // Sei punti in tutto: due carichi e quattro rilevazioni.
  await expect(grafico).toHaveAttribute('data-punti', '6');
  await expect(grafico).toHaveAttribute('data-esclusi', '0');
  // Nessun gradino: né il primo carico (origine della serie) né la
  // riapertura (quantità precedente nulla) sono trattati come uno scalino da
  // denaro versato — è esattamente il criterio di questo scenario.
  await expect(grafico).toHaveAttribute('data-gradini', '0');
  await expect(grafico).toHaveAttribute('data-copertura', 'piena');

  const puntoCaricoA = page.getByTestId('punto-serie-0');
  const puntoAnteVendita = page.getByTestId('punto-serie-1');
  const puntoZero = page.getByTestId('punto-serie-2');
  const puntoRiapertura = page.getByTestId('punto-serie-3');
  const puntoPostRiapertura = page.getByTestId('punto-serie-4');
  const puntoAdesso = page.getByTestId('punto-serie-5');

  await expect(puntoCaricoA).toHaveAttribute('data-quantita', String(CARICO_A.quantita));
  await expect(puntoCaricoA).toHaveAttribute(
    'data-valore',
    controvalore(CARICO_A.prezzo, CARICO_A.quantita),
  );
  // Primo carico della serie: nessun capo di gradino.
  expect(await puntoCaricoA.getAttribute('data-capo')).toBeNull();

  await expect(puntoAnteVendita).toHaveAttribute('data-quantita', String(CARICO_A.quantita));
  await expect(puntoAnteVendita).toHaveAttribute(
    'data-valore',
    controvalore(OSSERVAZIONI_2[0].prezzo, CARICO_A.quantita),
  );

  // Il periodo a quantità zero, fra la vendita totale e la riapertura: la
  // posizione esiste (è stata posseduta) ma non vale più nulla — presente e
  // misurato a zero, non escluso.
  await expect(puntoZero).toBeAttached();
  await expect(puntoZero).toHaveAttribute('data-quantita', '0');
  await expect(puntoZero).toHaveAttribute('data-valore', '0');

  // Il criterio che regge lo scenario: il punto della riapertura porta la
  // quantità del *solo* nuovo carico (300), non la somma con quella venduta
  // (che darebbe 1.100) — e non porta `data-capo`, cioè non è un capo di
  // gradino. È la prova diretta che la serie tratta questo carico come una
  // nuova origine e non come uno scalino sulla posizione precedente.
  await expect(puntoRiapertura).toHaveAttribute('data-quantita', String(CARICO_B.quantita));
  await expect(puntoRiapertura).toHaveAttribute(
    'data-valore',
    controvalore(CARICO_B.prezzo, CARICO_B.quantita),
  );
  expect(await puntoRiapertura.getAttribute('data-capo')).toBeNull();

  // Dalla riapertura in poi il controvalore torna positivo e resta ancorato
  // alla sola quantità del nuovo carico.
  await expect(puntoPostRiapertura).toHaveAttribute('data-quantita', String(CARICO_B.quantita));
  await expect(puntoPostRiapertura).toHaveAttribute(
    'data-valore',
    controvalore(OSSERVAZIONI_2[2].prezzo, CARICO_B.quantita),
  );

  await expect(puntoAdesso).toHaveAttribute('data-quantita', String(CARICO_B.quantita));
  await expect(puntoAdesso).toHaveAttribute(
    'data-valore',
    controvalore(OSSERVAZIONI_2[3].prezzo, CARICO_B.quantita),
  );

  // Nessun settimo punto.
  await expect(page.getByTestId('punto-serie-6')).toHaveCount(0);

  // La fascia della quantità detenuta racconta la stessa storia in tre tratti:
  // 800 quote, poi zero, poi 300 — mai 1.100, che tradirebbe un accatastamento
  // sulla posizione venduta.
  const fasciaA = page.getByTestId('fascia-quantita-0');
  const fasciaZero = page.getByTestId('fascia-quantita-1');
  const fasciaB = page.getByTestId('fascia-quantita-2');
  await fasciaA.scrollIntoViewIfNeeded();
  await expect(fasciaA).toHaveAttribute('data-quantita', String(CARICO_A.quantita));
  await expect(fasciaZero).toHaveAttribute('data-quantita', '0');
  await expect(fasciaB).toHaveAttribute('data-quantita', String(CARICO_B.quantita));
});
