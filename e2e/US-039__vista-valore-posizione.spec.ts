/**
 * US-039: commutare il grafico fra prezzo unitario e valore della posizione —
 * scenario dimostrativo.
 *
 * Dimostra ciò che la spec promette: su un titolo caricato **due volte** a
 * prezzi e quantità diversi, la vista «valore della posizione» mostra il gradino
 * verticale in corrispondenza del secondo carico, esplicitamente etichettato
 * come *capitale versato* e non come rendimento.
 *
 * L'asserzione che porta il peso dello scenario non è visiva ma **aritmetica**,
 * e i suoi due termini vengono da due letture indipendenti della pagina:
 *
 *  - la cifra dichiarata sotto il tracciato (`capitale-versato-0`), che il
 *    componente ottiene come *differenza dei due capi del gradino*;
 *  - il prodotto `prezzo di carico × quantità` del secondo carico, letto dalla
 *    tabella «Carichi registrati» in cima alla scheda.
 *
 * Confrontarli è ciò che rende il criterio 4 dimostrabile invece che
 * ispezionabile: un difetto di quantità retroattiva produrrebbe una curva
 * plausibile — più liscia di quella giusta — e nessuna occhiata al disegno lo
 * troverebbe.
 *
 * Lo scenario sceglie inoltre una scala che **non** è la predefinita *prima* di
 * commutare: il criterio 1 chiede che la finestra sopravviva al cambio di vista,
 * e una scala lasciata su «tutto lo storico» lo verificherebbe per coincidenza.
 *
 * Le premesse sono in **giorni indietro da adesso** e non in date fisse: una
 * data scritta a mano invecchia, e fra sei mesi la finestra smetterebbe di
 * contenere ciò che il test crede di averci messo.
 *
 * Titolo seminato: TITOLO_US_039, riservato a questo file. Il seme porta
 * `fetched_at` di adesso (il default di `seminaTitolo`) ed è la guardia che
 * impedisce un recupero reale dalla fonte: un recupero registrerebbe
 * un'osservazione a oggi e sposterebbe l'ultimo punto della curva sotto i piedi
 * del test.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_039 } from './support/titoli.js';

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
  await page.video()?.saveAs('docs/test-results/US-039/demo-vista-valore.webm');
});

const ISIN = TITOLO_US_039.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC non è un dettaglio: `Position.loadDate` è una data civile che il grafico
 * àncora a mezzanotte UTC — e con la stessa regola `quantitaDetenutaA` decide da
 * che lato del proprio giorno cada un carico. Comporla dai campi locali la
 * farebbe scivolare di un giorno a ogni offset negativo, e il gradino
 * comparirebbe accanto al rombo che lo causa invece che sopra.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/**
 * I due carichi della spec — «uno nel 2021 e uno nel 2023» — resi in giorni
 * indietro da adesso.
 *
 * Prezzi **e** quantità diversi: il gradino misura le quote *nuove*, e a
 * quantità uguali non si distinguerebbe un capitale versato calcolato bene da
 * uno calcolato sul totale. Entrambi cadono dentro gli ultimi cinque anni e
 * fuori dall'ultimo anno, così la scala scelta nello scenario li contiene
 * entrambi mentre la predefinita non è l'unica a mostrarli.
 */
const CARICHI = [
  { giorniFa: 1700, prezzo: 58.4, quantita: 80 },
  { giorniFa: 900, prezzo: 71.2, quantita: 120 },
];

/**
 * Due rilevazioni recenti, entrambe posteriori al secondo carico: la curva del
 * valore le porta con la quantità piena, e l'ultima sta sul prezzo che la scheda
 * dichiara come attuale.
 */
const RILEVAZIONI = [
  { giorniFa: 3, prezzo: 126.9 },
  { giorniFa: 0, prezzo: TITOLO_US_039.campi.price! },
];

/**
 * Il capitale versato atteso: `71,20 × 120 = 8544,00`.
 *
 * È scritto per esteso e non ricalcolato dalle costanti qui sopra: rifare nel
 * test la formula del componente verificherebbe che due copie della stessa
 * aritmetica concordino, il che è vero anche quando entrambe sbagliano.
 *
 * Senza separatore di migliaia, e non è una svista: l'italiano non raggruppa le
 * cifre a quattro posizioni (`minimumGroupingDigits` vale 2), quindi «8.544,00»
 * sarebbe una stringa che nessuno legge in pagina.
 */
const CAPITALE_VERSATO = '€ 8544,00';

/** I due capi del gradino: 80 × 71,20 e 200 × 71,20. */
const VALORE_ANTE_CARICO = 5696;
const VALORE_POST_CARICO = 14240;

/** Cifra a due decimali all'italiana, come la scheda la scrive. */
function importoScritto(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Prezzo unitario a quattro decimali, come la tabella dei carichi lo scrive. */
function prezzoScritto(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

test('demo: nella vista del valore il gradino del secondo carico è capitale versato, e la scala scelta sopravvive alla commutazione', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Vista Valore');

  // ─── Premesse possedute dal test, non ereditate ─────────────────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_039.campi);

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portfolioId,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il numero dei
  // punti è una premessa garantita e non un'eredità del backfill d'avvio.
  archivio.seminaOsservazioni(
    ISIN,
    RILEVAZIONI.map((rilevazione) => ({
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

  // 3. In cima alla scheda, la tabella «Carichi registrati»: da qui il test legge
  //    il prezzo e la quantità del secondo carico, cioè i due fattori del
  //    prodotto che il gradino dovrà misurare. Sono la fonte indipendente contro
  //    cui confrontare la cifra dichiarata sotto il grafico.
  const tabellaCarichi = page.getByTestId('tabella-carichi-titolo');
  await tabellaCarichi.scrollIntoViewIfNeeded();
  await expect(tabellaCarichi).toContainText(prezzoScritto(CARICHI[1].prezzo));
  await expect(tabellaCarichi).toContainText(String(CARICHI[1].quantita));

  await page.waitForTimeout(1000);

  // 4. In fondo alla scheda, «Andamento del titolo»: due traverse sopra il
  //    tracciato — la vista e la scala — e il criterio 2 vero all'apertura
  const sezione = page.getByTestId('sezione-grafico-titolo');
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();

  const grafico = page.getByTestId('grafico-titolo');
  const commutatore = page.getByTestId('vista-grafico');
  await commutatore.scrollIntoViewIfNeeded();
  await expect(commutatore).toBeVisible();

  await expect(grafico).toHaveAttribute('data-vista', 'prezzo');
  await expect(page.getByTestId('vista-prezzo')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('vista-valore')).toHaveAttribute('aria-pressed', 'false');

  // La riga d'ottone del prezzo medio è tracciata, e l'ordinata dichiara di
  // portare il prezzo di una singola quota (criterio 5, primo capo)
  await expect(page.getByTestId('linea-prezzo-medio')).toBeAttached();
  await expect(page.getByTestId('didascalia-ordinata')).toHaveText(/PER QUOTA/);

  // Il sigillo scrive per esteso ciò che i due comandi garantiscono
  await expect(page.getByTestId('sigillo-indipendenza')).toContainText('non');

  await page.waitForTimeout(1200);

  // 5. Si sceglie una scala che **non** è la predefinita: è la premessa del
  //    criterio 1, che sarebbe altrimenti vero per coincidenza
  await page.getByTestId('scala-cinque-anni').click();
  await expect(grafico).toHaveAttribute('data-scala', 'cinque-anni');
  await expect(page.getByTestId('scala-cinque-anni')).toHaveAttribute('aria-pressed', 'true');

  await page.waitForTimeout(1200);

  // 6. La commutazione: la curva passa al controvalore della posizione
  await page.getByTestId('vista-valore').click();
  await expect(grafico).toHaveAttribute('data-vista', 'valore');
  await expect(page.getByTestId('vista-valore')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('vista-prezzo')).toHaveAttribute('aria-pressed', 'false');

  // Criterio 1: la scala scelta è sopravvissuta alla commutazione
  await expect(grafico).toHaveAttribute('data-scala', 'cinque-anni');
  await expect(page.getByTestId('scala-cinque-anni')).toHaveAttribute('aria-pressed', 'true');

  // L'asse cambia didascalia: la cifra sull'ordinata non è più un prezzo
  await expect(page.getByTestId('didascalia-ordinata')).toHaveText(/CONTROVALORE/);
  await expect(page.getByTestId('ordinata-attiva')).toContainText('controvalore delle quote');

  await page.waitForTimeout(1200);

  // 7. Il gradino c'è, ed è uno solo: il primo carico è l'origine della serie,
  //    non un salto — prima di esso la posizione non esisteva
  await expect(grafico).toHaveAttribute('data-gradini', '1');
  const gradino = page.getByTestId('gradino-carico-0');
  await expect(gradino).toBeAttached();
  await expect(gradino).toHaveAttribute('data-quote-aggiunte', String(CARICHI[1].quantita));

  // I suoi due capi stanno sullo **stesso** istante e valgono 80 e 200 quote al
  // prezzo del giorno: è la quantità detenuta a quella data, non quella di oggi
  const capoBasso = page.locator('[data-capo="ante"]');
  const capoAlto = page.locator('[data-capo="post"]');
  await expect(capoBasso).toHaveAttribute('data-quantita', String(CARICHI[0].quantita));
  await expect(capoAlto).toHaveAttribute(
    'data-quantita',
    String(CARICHI[0].quantita + CARICHI[1].quantita),
  );
  await expect(capoBasso).toHaveAttribute('data-valore', String(VALORE_ANTE_CARICO));
  await expect(capoAlto).toHaveAttribute('data-valore', String(VALORE_POST_CARICO));
  expect(await capoBasso.getAttribute('data-istante')).toBe(
    await capoAlto.getAttribute('data-istante'),
  );

  await page.waitForTimeout(1200);

  // 8. Il criterio che regge la spec: la cifra dichiarata sotto il tracciato è
  //    *capitale versato*, e coincide con prezzo di carico × quantità del
  //    secondo carico — gli stessi due numeri letti sopra dalla tabella
  const dichiarazione = page.getByTestId('dichiarazione-gradino-0');
  await dichiarazione.scrollIntoViewIfNeeded();
  await expect(dichiarazione).toBeVisible();
  await expect(page.getByTestId('capitale-versato-0')).toHaveText(CAPITALE_VERSATO);
  expect(CAPITALE_VERSATO).toBe(`€ ${importoScritto(CARICHI[1].prezzo * CARICHI[1].quantita)}`);

  // E la lettura da non fare è nominata, non lasciata dedurre
  await expect(dichiarazione).toContainText('denaro che hai versato');
  await expect(dichiarazione).toContainText('non è rendimento');
  await expect(dichiarazione).toContainText(importoScritto(VALORE_ANTE_CARICO));
  await expect(dichiarazione).toContainText(importoScritto(VALORE_POST_CARICO));

  await page.waitForTimeout(1500);

  // 9. Criterio 5: la riga d'ottone non è nascosta, è dichiarata assente — e la
  //    legenda tiene il suo posto con la ragione
  await expect(page.getByTestId('linea-prezzo-medio')).toHaveCount(0);
  const legendaSoppressa = page.getByTestId('legenda-prezzo-medio-soppressa');
  await legendaSoppressa.scrollIntoViewIfNeeded();
  await expect(legendaSoppressa).toContainText('assente per scelta in questa vista');
  await expect(legendaSoppressa).toContainText('per quota');

  // La fascia sotto l'asse mostra il secondo fattore del prodotto: 80 quote fino
  // al carico, 200 da allora
  await expect(page.getByTestId('fascia-quantita-0')).toHaveAttribute(
    'data-quantita',
    String(CARICHI[0].quantita),
  );
  await expect(page.getByTestId('fascia-quantita-1')).toHaveAttribute(
    'data-quantita',
    String(CARICHI[0].quantita + CARICHI[1].quantita),
  );

  // Pausa finale: il gradino resta nel fotogramma registrato, invece di essere
  // spazzato via dal teardown un istante dopo l'ultima asserzione.
  await page.waitForTimeout(1500);
});
