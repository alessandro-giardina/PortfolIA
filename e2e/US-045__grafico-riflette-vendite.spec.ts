/**
 * US-045: la curva del valore della posizione riflette le vendite — scenario
 * dimostrativo.
 *
 * Dimostra esattamente ciò che la spec promette: su un titolo con **1.000
 * quote** caricate nel passato e **400 vendute** più di recente, la curva del
 * «valore della posizione» moltiplica per 1.000 i punti anteriori alla
 * vendita e per 600 (il residuo) quelli successivi — con lo scalino visibile
 * alla data della vendita — mentre la vista «prezzo unitario» resta
 * identica a quella di un titolo mai venduto con lo stesso storico prezzi.
 *
 * Le due asserzioni che portano il peso dello scenario non sono visive:
 *
 *  - nella vista del **valore**, i quattro punti della serie (`punto-serie-N`)
 *    portano `data-quantita` e `data-valore` letti direttamente dal DOM: i
 *    punti anteriori alla vendita dichiarano 1.000 quote, quelli successivi
 *    600 — e il controvalore è il prodotto coi rispettivi prezzi, non un
 *    numero ricalcolato una seconda volta dal test (che verificherebbe solo
 *    che due copie della stessa aritmetica concordino, vero anche se
 *    entrambe sbagliano). Il punto tra i due — prezzo più alto ma valore più
 *    basso — è la prova che il calo è la vendita e non un prezzo in discesa;
 *  - nella vista del **prezzo**, gli stessi quattro punti non portano
 *    nessun attributo di quantità: è la conferma diretta che questa vista
 *    non dipende in alcun modo da carichi o vendite, cioè che sarebbe
 *    disegnata identica anche se le 400 quote non fossero mai state vendute.
 *
 * Un solo carico è deliberato: con un lotto solo il prezzo medio ponderato del
 * residuo coincide col prezzo di quel lotto, quindi la vista del prezzo non
 * ha alcuna complicazione LIFO da cui la vendita potrebbe distrarla — la
 * spec riguarda il grafico, non l'attribuzione dei lotti (già di US-042).
 *
 * Le premesse sono in **giorni indietro da adesso** e non in date fisse: una
 * data scritta a mano invecchia, e il rapporto d'ordine fra carico, vendita e
 * rilevazioni — che è l'intero contenuto dello scenario — smetterebbe di
 * essere quello che il test crede di aver costruito.
 *
 * Titolo seminato: TITOLO_US_045, riservato a questo file. Il seme porta
 * `fetched_at` di adesso (il default di `seminaTitolo`) ed è la guardia
 * contro un recupero reale dalla fonte, che costerebbe 8-12 secondi non
 * deterministici e sposterebbe l'ultimo punto della curva sotto i piedi del
 * test.
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLO_US_045 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-045/demo-grafico-riflette-vendite.webm');
});

const ISIN = TITOLO_US_045.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC non è un dettaglio: `Position.loadDate` e `Sale.saleDate` sono date
 * civili ancorate a mezzanotte UTC — è la stessa regola con cui
 * `quantitaDetenutaA` decide da che lato del proprio giorno cada un carico o
 * una vendita. Comporla dai campi locali la farebbe scivolare di un giorno a
 * ogni offset negativo, e potrebbe invertire l'ordine fra carico, vendita e
 * rilevazioni — cioè rompere la premessa dello scenario invece del codice.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Il carico: 1.000 quote, «nel 2023» reso come giorni indietro da adesso. */
const CARICO = { giorniFa: 1080, prezzo: 45, quantita: 1000 };

/** La vendita parziale: 400 quote, «nel 2025» — successiva al carico. */
const VENDITA = { giorniFa: 380, prezzo: 60, quantita: 400 };

/** Il residuo dopo la vendita: 600 quote. */
const QUANTITA_RESIDUA = CARICO.quantita - VENDITA.quantita;

/**
 * Tre rilevazioni: una prima della vendita (quantità intera), due dopo
 * (quantità residua). La prima e la seconda hanno un prezzo **crescente**
 * (50 → 55) mentre il controvalore *scende*: è la prova che il calo è la
 * vendita, non un prezzo in discesa. La terza coincide con l'istante
 * «adesso» e con il prezzo che la scheda dichiara come attuale.
 */
const OSSERVAZIONI = [
  { giorniFa: 700, prezzo: 50 }, // prima della vendita (380 giorni fa)
  { giorniFa: 100, prezzo: 55 }, // dopo la vendita
  { giorniFa: 0, prezzo: TITOLO_US_045.campi.price! }, // adesso, dopo la vendita
];

/** Il controvalore atteso, calcolato con la stessa aritmetica di `data-valore`. */
function controvalore(prezzo: number, quantita: number): string {
  return String(prezzo * quantita);
}

test('demo: la curva del valore riflette la vendita parziale con uno scalino, la vista del prezzo resta invariata', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Grafico Vendite');

  // ─── Premesse possedute dal test, non ereditate ─────────────────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_045.campi);

  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN,
    dataCivileIndietro(CARICO.giorniFa),
    CARICO.prezzo,
    CARICO.quantita,
  );

  await registraVendita(
    portfolioId,
    ISIN,
    dataCivileIndietro(VENDITA.giorniFa),
    VENDITA.prezzo,
    VENDITA.quantita,
  );

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il numero
  // dei punti è una premessa garantita e non un'eredità del backfill d'avvio.
  archivio.seminaOsservazioni(
    ISIN,
    OSSERVAZIONI.map((rilevazione) => ({
      price: rilevazione.prezzo,
      observed_at: adesso - rilevazione.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    })),
  );

  // 1. Il portafoglio si apre sul riepilogo, con il titolo in tabella
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1000);

  // 2. Il clic sulla riga apre la scheda titolo
  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1000);

  // 3. In fondo alla scheda, «Andamento del titolo»: la vista predefinita è
  //    il prezzo unitario (criterio di US-039, qui premessa di partenza)
  const sezione = page.getByTestId('sezione-grafico-titolo');
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();

  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toHaveAttribute('data-vista', 'prezzo');
  await expect(page.getByTestId('vista-prezzo')).toHaveAttribute('aria-pressed', 'true');
  await expect(grafico).toHaveAttribute('data-punti', '4');

  await page.waitForTimeout(1200);

  // 4. La vista del prezzo, letta punto per punto: nessuno dei quattro porta
  //    un attributo di quantità — questa vista non sa nemmeno che una
  //    vendita esiste, ed è per questo che resta identica a quella di un
  //    titolo mai venduto con lo stesso storico prezzi.
  for (let indice = 0; indice < 4; indice += 1) {
    const punto = page.getByTestId(`punto-serie-${indice}`);
    await expect(punto).toBeAttached();
    expect(await punto.getAttribute('data-quantita')).toBeNull();
    expect(await punto.getAttribute('data-valore')).toBeNull();
  }

  // I prezzi dei quattro punti sono quelli seminati, tal quali: carico a 45,
  // poi le tre rilevazioni a 50, 55 e al prezzo di cartellino — nessuna
  // traccia della vendita nella cifra.
  await expect(page.getByTestId('punto-serie-0')).toHaveAttribute('data-prezzo', String(CARICO.prezzo));
  await expect(page.getByTestId('punto-serie-1')).toHaveAttribute(
    'data-prezzo',
    String(OSSERVAZIONI[0].prezzo),
  );
  await expect(page.getByTestId('punto-serie-2')).toHaveAttribute(
    'data-prezzo',
    String(OSSERVAZIONI[1].prezzo),
  );
  await expect(page.getByTestId('punto-serie-3')).toHaveAttribute(
    'data-prezzo',
    String(OSSERVAZIONI[2].prezzo),
  );

  // Il prezzo medio ponderato di carico — un solo lotto, quindi coincide col
  // prezzo del carico — è tracciato anche lui, indifferente alla vendita.
  await expect(page.getByTestId('linea-prezzo-medio')).toHaveAttribute(
    'data-prezzo',
    String(CARICO.prezzo),
  );

  await page.waitForTimeout(1500);

  // 5. La commutazione: la curva passa al controvalore della posizione
  const commutatore = page.getByTestId('vista-grafico');
  await commutatore.scrollIntoViewIfNeeded();
  await page.getByTestId('vista-valore').click();
  await expect(grafico).toHaveAttribute('data-vista', 'valore');
  await expect(page.getByTestId('vista-valore')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('vista-prezzo')).toHaveAttribute('aria-pressed', 'false');

  // Nessun gradino da nuovo carico (è il primo e unico carico, origine della
  // serie) e nessun punto escluso (il carico è il primo punto della serie):
  // il calo che sta per apparire non può essere confuso con nessuno dei due.
  await expect(grafico).toHaveAttribute('data-gradini', '0');
  await expect(grafico).toHaveAttribute('data-esclusi', '0');
  await expect(grafico).toHaveAttribute('data-copertura', 'piena');

  // La riga del prezzo medio non compare in questa vista — è priva di posto
  // dove stare su un'ordinata di controvalori — e la legenda dichiara perché.
  await expect(page.getByTestId('linea-prezzo-medio')).toHaveCount(0);
  await expect(page.getByTestId('legenda-prezzo-medio-soppressa')).toContainText(
    'assente per scelta in questa vista',
  );

  await page.waitForTimeout(1200);

  // 6. Il criterio che regge la spec: i punti anteriori alla vendita portano
  //    1.000 quote, quelli successivi 600 — letti dal DOM, non ricalcolati.
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

  await expect(puntoPostVenditaA).toHaveAttribute('data-quantita', String(QUANTITA_RESIDUA));
  await expect(puntoPostVenditaA).toHaveAttribute(
    'data-valore',
    controvalore(OSSERVAZIONI[1].prezzo, QUANTITA_RESIDUA),
  );

  await expect(puntoPostVenditaB).toHaveAttribute('data-quantita', String(QUANTITA_RESIDUA));
  await expect(puntoPostVenditaB).toHaveAttribute(
    'data-valore',
    controvalore(OSSERVAZIONI[2].prezzo, QUANTITA_RESIDUA),
  );

  // Lo scalino non è un'illusione del prezzo: fra il punto anteriore e quello
  // successivo alla vendita il prezzo unitario **sale** (50 → 55), eppure il
  // controvalore **scende**. Solo la quantità venduta lo spiega.
  expect(OSSERVAZIONI[1].prezzo).toBeGreaterThan(OSSERVAZIONI[0].prezzo);
  const valoreAnte = Number(await puntoAnteVendita.getAttribute('data-valore'));
  const valorePost = Number(await puntoPostVenditaA.getAttribute('data-valore'));
  expect(valorePost).toBeLessThan(valoreAnte);

  await page.waitForTimeout(1200);

  // 7. La fascia della quantità detenuta, sotto l'asse: lo stesso scalino
  //    reso come cambio di quota, da 1.000 a 600 quote.
  const fasciaPiena = page.getByTestId('fascia-quantita-0');
  const fasciaResidua = page.getByTestId('fascia-quantita-1');
  await fasciaPiena.scrollIntoViewIfNeeded();
  await expect(fasciaPiena).toHaveAttribute('data-quantita', String(CARICO.quantita));
  await expect(fasciaResidua).toHaveAttribute('data-quantita', String(QUANTITA_RESIDUA));

  // Pausa finale: lo scalino resta nel fotogramma registrato, invece di
  // essere spazzato via dal teardown un istante dopo l'ultima asserzione.
  await page.waitForTimeout(1500);
});
