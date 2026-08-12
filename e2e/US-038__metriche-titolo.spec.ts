/**
 * US-038: le due metriche sotto il grafico del titolo — scenario dimostrativo.
 *
 * Dimostra ciò che la spec promette: sotto il tracciato compare una **bilancia a
 * due piatti** — a sinistra il P&L da carico, a destra la variazione di periodo —
 * e i due piatti misurano cose diverse. Il P&L ripete, cifra per cifra, la
 * «Differenza» che *Posizione a conto* mostra in cima alla scheda; la variazione
 * cambia capi e valore appena si cambia scala temporale, mentre il P&L non si
 * muove di un centesimo.
 *
 * Le due asserzioni che portano il peso dello scenario sono confronti fra
 * **stringhe**, non fra numeri equivalenti:
 *
 *  - il P&L e la «Differenza» si confrontano leggendo il `textContent` dei due
 *    riquadri. Due cifre «equivalenti» scritte in due modi — un separatore di
 *    migliaia in più, un meno tipografico al posto del trattino — sono per chi
 *    guarda una divergenza, e un confronto numerico la lascerebbe passare;
 *  - l'immobilità del P&L al cambio di scala si prova catturando la stringa prima
 *    e riconfrontandola dopo, invece di riasserire lo stesso valore atteso due
 *    volte: così il test non può passare perché *entrambe* le letture sono
 *    sbagliate allo stesso modo.
 *
 * Le premesse sono in **giorni indietro da adesso** e non in date fisse: una data
 * scritta a mano invecchia, e fra sei mesi «ultimo anno» smetterebbe di contenere
 * ciò che il test crede di averci messo.
 *
 * Titolo seminato: TITOLO_US_038, riservato a questo file. Il seme porta
 * `fetched_at` di adesso (il default di `seminaTitolo`) ed è la guardia che
 * impedisce un recupero reale dalla fonte: un recupero registrerebbe
 * un'osservazione a oggi e cambierebbe il conteggio delle rilevazioni comprese
 * sotto i piedi del test.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_038 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi
// il video va salvato a mano. `saveAs` attende la fine della registrazione, che
// avviene alla chiusura della pagina: va chiamato dopo `page.close()`.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-038/demo-metriche-titolo.webm');
});

const ISIN = TITOLO_US_038.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC non è un dettaglio: `Position.loadDate` è una data civile che il grafico
 * àncora a mezzanotte UTC, e comporla dai campi locali la farebbe scivolare di un
 * giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/**
 * Due carichi a **prezzi e quantità diversi**: è la premessa che rende il P&L
 * una misura ponderata e non una media dei due prezzi d'acquisto. A quantità
 * uguali le due medie coincidono, e lo scenario non dimostrerebbe nulla.
 *
 * Entrambi cadono **fuori** dall'ultimo anno, così cambiando scala il piatto
 * della variazione perde capi mentre quello del P&L non ha nulla da perdere: il
 * P&L guarda alla posizione intera, non alla finestra.
 */
const CARICHI = [
  { giorniFa: 900, prezzo: 68.3, quantita: 120 },
  { giorniFa: 500, prezzo: 82.1, quantita: 40 },
];

/**
 * Cinque rilevazioni: due anteriori all'ultimo anno e tre dentro. Il margine è
 * largo — 420 giorni contro dodici mesi civili — perché il confine non deve
 * cadere vicino a un estremo: un test che passa per un giorno di scarto è un
 * test che fallirà da solo.
 *
 * La più recente sta sul prezzo che la scheda dichiara come attuale: una
 * divergenza fra cima dello storico e cartellino non farebbe fallire nulla, e
 * mostrerebbe comunque un dato falso proprio nel filmato della spec.
 */
const RILEVAZIONI = [
  { giorniFa: 800, prezzo: 74.5 },
  { giorniFa: 420, prezzo: 96.2 },
  { giorniFa: 300, prezzo: 110.4 },
  { giorniFa: 120, prezzo: 119.8 },
  { giorniFa: 0, prezzo: TITOLO_US_038.campi.price! },
];

/**
 * Le due letture attese della variazione, scritte per esteso.
 *
 * Sono valori attesi e non un calcolo ripetuto nel test: rifare qui la formula
 * del componente significherebbe verificare che due copie della stessa
 * aritmetica concordino, che è vero anche quando entrambe sbagliano.
 *
 *  - tutto lo storico: dalla rilevazione di 800 giorni fa (74,5000) a quella di
 *    oggi (128,4600) → 128,46 − 74,50 = +53,9600, cioè +72,43 %;
 *  - ultimo anno: il capo di partenza diventa la rilevazione di 300 giorni fa
 *    (110,4000) → 128,46 − 110,40 = +18,0600, cioè +16,36 %.
 */
const VARIAZIONE_TUTTO = { valore: '+€ 53,9600', percentuale: '+72,43 %' };
const VARIAZIONE_ANNO = { valore: '+€ 18,0600', percentuale: '+16,36 %' };

/** Il prezzo unitario come la scheda lo scrive: quattro decimali all'italiana. */
function prezzoScritto(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

test('demo: sotto il grafico il P&L ripete la «Differenza» della posizione, e cambiando scala si muove solo la variazione di periodo', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Metriche Titolo');

  // ─── Premesse possedute dal test, non ereditate ─────────────────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_038.campi);

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portfolioId,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  // L'istante del recupero in cache è anche quello della rilevazione più recente:
  // così «Rilevato il» in cima alla scheda, la prima riga dello storico e il capo
  // destro della variazione dichiarano tutti lo stesso momento.
  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il conteggio
  // delle rilevazioni comprese è una premessa garantita e non un'eredità del
  // backfill d'avvio.
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

  // 3. In cima alla scheda, la casella «Differenza» di *Posizione a conto*: è la
  //    lettura che il riquadro sotto il grafico dovrà ripetere
  const differenzaInCima = page.getByTestId('dettaglio-differenza');
  await expect(differenzaInCima).toBeVisible();
  const testoDifferenza = await differenzaInCima.textContent();
  expect(testoDifferenza).toContain('€');

  await page.waitForTimeout(1000);

  // 4. In fondo alla scheda, «Andamento del prezzo» e sotto il tracciato la
  //    bilancia a due piatti (criterio 1)
  const sezione = page.getByTestId('sezione-grafico-titolo');
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();

  const metriche = page.getByTestId('metriche-titolo');
  await metriche.scrollIntoViewIfNeeded();
  await expect(metriche).toBeVisible();

  const pnl = page.getByTestId('pnl-da-carico');
  const variazione = page.getByTestId('variazione-periodo');
  await expect(pnl).toContainText('P&L da carico');
  await expect(variazione).toContainText('Variazione di periodo');

  // Ciascun piatto dichiara se dipende dalla scala: è la differenza fra le due
  // misure, scritta in pagina invece che lasciata dedurre
  await expect(page.getByTestId('orizzonte-pnl')).toContainText('non dipende dalla scala');
  await expect(page.getByTestId('orizzonte-variazione')).toContainText('cambia con la scala');

  await page.waitForTimeout(1200);

  // 5. All'apertura la scala è «Tutto lo storico»: entrambi i piatti sono
  //    valorizzati, e la variazione dichiara di aver compreso tutte e cinque le
  //    rilevazioni d'archivio
  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(metriche).toHaveAttribute('data-scala', 'tutto');
  await expect(pnl).toHaveAttribute('data-stato', 'disponibile');
  await expect(variazione).toHaveAttribute('data-stato', 'disponibile');
  await expect(variazione).toHaveAttribute('data-rilevazioni', String(RILEVAZIONI.length));

  // 6. Il criterio che regge la spec: la **stessa stringa**, non due cifre
  //    equivalenti. Il confronto è sul testo reso, perché è quello che l'utente
  //    legge in due punti della stessa scheda.
  const valorePnl = page.getByTestId('pnl-da-carico-valore');
  await expect(valorePnl).toBeVisible();
  const testoPnlIniziale = await valorePnl.textContent();
  expect(testoPnlIniziale).toBe(testoDifferenza);

  // Il rimando è dichiarato in pagina, non solo rispettato in silenzio
  await expect(page.getByTestId('rimando-differenza')).toContainText(
    'Stessa cifra della «Differenza»',
  );
  await expect(page.getByTestId('segna-rimando-differenza')).toContainText('ripresa sotto il grafico');

  const percentualePnl = page.getByTestId('pnl-da-carico-percentuale');
  const testoPercentualePnl = await percentualePnl.textContent();

  await page.waitForTimeout(1200);

  // 7. La variazione su tutto lo storico: i capi sono la prima e l'ultima
  //    rilevazione d'archivio, e il piatto dichiara entrambi
  await expect(page.getByTestId('variazione-periodo-valore')).toHaveText(VARIAZIONE_TUTTO.valore);
  await expect(page.getByTestId('variazione-periodo-percentuale')).toHaveText(
    VARIAZIONE_TUTTO.percentuale,
  );
  await expect(variazione).toContainText(prezzoScritto(RILEVAZIONI[0].prezzo));
  await expect(variazione).toContainText(prezzoScritto(RILEVAZIONI[RILEVAZIONI.length - 1].prezzo));

  await page.waitForTimeout(1200);

  // 8. «Ultimo anno»: la finestra si stringe, e con lei i capi della variazione.
  //    Le due rilevazioni anteriori all'anno escono dal conto.
  await page.getByTestId('scala-anno').click();
  await expect(grafico).toHaveAttribute('data-scala', 'anno');
  await expect(metriche).toHaveAttribute('data-scala', 'anno');
  await expect(variazione).toHaveAttribute('data-rilevazioni', '3');

  await expect(page.getByTestId('variazione-periodo-valore')).toHaveText(VARIAZIONE_ANNO.valore);
  await expect(page.getByTestId('variazione-periodo-percentuale')).toHaveText(
    VARIAZIONE_ANNO.percentuale,
  );

  // Il capo di partenza è cambiato davvero: quello vecchio non compare più nel
  // piatto, quello nuovo sì
  await expect(variazione).toContainText(prezzoScritto(RILEVAZIONI[2].prezzo));
  await expect(variazione).not.toContainText(prezzoScritto(RILEVAZIONI[0].prezzo));

  await page.waitForTimeout(1200);

  // 9. E il P&L non si è mosso di un centesimo: stessa stringa di prima, e
  //    ancora identica alla «Differenza» in cima alla scheda
  await expect(valorePnl).toHaveText(testoPnlIniziale!);
  await expect(percentualePnl).toHaveText(testoPercentualePnl!);
  expect(await valorePnl.textContent()).toBe(await differenzaInCima.textContent());
  await expect(pnl).toHaveAttribute('data-stato', 'disponibile');

  // La postilla chiude il ragionamento: le due cifre non si sommano e non si
  // confrontano
  const postilla = page.getByTestId('postilla-metriche');
  await postilla.scrollIntoViewIfNeeded();
  await expect(postilla).toContainText('non si sommano e non si confrontano');

  // Pausa finale: la bilancia resta nel fotogramma registrato, invece di essere
  // spazzata via dal teardown un istante dopo l'ultima asserzione.
  await page.waitForTimeout(1500);
});
