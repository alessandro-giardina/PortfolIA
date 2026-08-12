/**
 * US-039: le varianti della commutazione fra prezzo unitario e valore della
 * posizione.
 *
 * Vivono in un file separato dallo scenario dimostrativo perché `launchOptions`
 * (slowMo) non è scopabile in un `describe`: Playwright lo consente solo a
 * livello di file. Qui i test girano a velocità piena e non producono video —
 * sono i casi limite, che nel filmato della spec sarebbero soltanto rumore.
 *
 * Quattro premesse, ognuna un criterio di accettazione:
 *  - la quantità applicata a ciascuna data è quella **detenuta a quella data**:
 *    il punto immediatamente precedente al secondo carico porta le sole quote del
 *    primo, e non `totalQuantity` (criterio 3);
 *  - commutare la vista non muove la scala scelta né le due cifre della bilancia
 *    di US-038, che misurano un prezzo unitario e non un controvalore
 *    (criteri 1 e 5);
 *  - il prezzo unitario è la vista di ogni apertura di scheda, anche dopo averla
 *    cambiata su un altro titolo, e tornandovi ricompare la riga d'ottone
 *    (criteri 2 e 5);
 *  - le rilevazioni anteriori al primo carico sono **escluse e dichiarate**, non
 *    portate a zero: una posizione che non esisteva non è una posizione che
 *    valeva niente (criterio 3).
 *
 * Che cosa questo file deliberatamente **non** copre: il titolo *senza alcun
 * carico*. `componiSerieValore` lo gestisce — serie vuota con ragione
 * `senza-carichi`, e la vista lo dichiara a parole invece di tracciare una retta
 * piatta a zero — ma non è raggiungibile dall'interfaccia: nel modello di dati un
 * carico **è** una posizione, e la scheda titolo si apre solo dal riepilogo di un
 * portafoglio che quella posizione la contiene. Quel ramo è verificato dove il
 * caso esiste davvero, cioè nei test unitari del dominio
 * (`server/tests/serieValore.test.ts`). Scrivere qui uno scenario che non può
 * accadere significherebbe fabbricare una premessa impossibile per farla
 * verificare.
 *
 * Titoli seminati: TITOLO_US_039_VARIANTI e TITOLO_US_039_SECONDO, entrambi
 * riservati a questo file. Il seme porta `fetched_at` di **adesso** (il default
 * di `seminaTitolo`): un recupero reale registrerebbe un'osservazione a oggi che
 * aggiungerebbe un punto alla curva del valore sotto i piedi del test.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_039_SECONDO, TITOLO_US_039_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_039_VARIANTI.isin;
const ISIN_SECONDO = TITOLO_US_039_SECONDO.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**: `Position.loadDate` è
 * una data civile che il grafico àncora a mezzanotte UTC, ed è con la stessa
 * regola che `quantitaDetenutaA` decide da che lato del proprio giorno cada un
 * carico. Comporla dai campi locali la farebbe scivolare di un giorno a ogni
 * offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Apre la scheda di un titolo dal riepilogo del portafoglio. */
async function apriSchedaTitolo(page: Page, isin: string) {
  const riga = page.getByTestId(`riepilogo-${isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('grafico-titolo')).toBeVisible({ timeout: 8000 });
}

test('i carichi successivi non retroagiscono: il punto precedente al secondo carico porta le sole quote del primo', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Valore Non Retroattivo');
  archivio.seminaTitolo(ISIN, TITOLO_US_039_VARIANTI.campi);

  // Due carichi a quantità diverse e, in mezzo, una rilevazione: è quel punto
  // intermedio a distinguere una serie onesta da una moltiplicata all'indietro
  // per la quantità di oggi. Con 40 e 60 quote la somma è 100, e un difetto di
  // retroattività si leggerebbe subito nella cifra.
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(1000), 30, 40);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(400), 50, 60);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 35, observed_at: adesso - 700 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_039_VARIANTI.campi.price!,
      observed_at: adesso,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, ISIN);

  const grafico = page.getByTestId('grafico-titolo');
  await page.getByTestId('vista-valore').click();
  await expect(grafico).toHaveAttribute('data-vista', 'valore');

  // Ordine dei punti nella finestra piena: carico1, rilevazione intermedia,
  // capo ante del gradino, capo post, rilevazione di oggi.
  const rilevazioneIntermedia = page.getByTestId('punto-serie-1');
  await expect(rilevazioneIntermedia).toHaveAttribute('data-origine', 'rilevazione');

  // Il fatto del criterio 3: 40 quote, non 100. E il valore è il prodotto per
  // *quella* quantità — 35 × 40 = 1.400, non 35 × 100 = 3.500.
  await expect(rilevazioneIntermedia).toHaveAttribute('data-quantita', '40');
  await expect(rilevazioneIntermedia).toHaveAttribute('data-valore', '1400');

  // Dopo il gradino la quantità è piena, e la rilevazione di oggi la porta
  const capoAlto = page.locator('[data-capo="post"]');
  await expect(capoAlto).toHaveAttribute('data-quantita', '100');
  await expect(page.getByTestId('punto-serie-4')).toHaveAttribute('data-quantita', '100');

  // La fascia sotto l'asse dichiara le due quantità, nell'ordine
  await expect(page.getByTestId('fascia-quantita-0')).toHaveAttribute('data-quantita', '40');
  await expect(page.getByTestId('fascia-quantita-1')).toHaveAttribute('data-quantita', '100');

  // E il gradino vale esattamente il capitale versato dal secondo carico:
  // 50 × 60 = 3.000
  await expect(page.getByTestId('gradino-carico-0')).toHaveAttribute(
    'data-capitale-versato',
    '3000',
  );
  // Senza separatore di migliaia: l'italiano non raggruppa le cifre a quattro
  // posizioni (`minimumGroupingDigits` vale 2), e la stringa attesa è quella che
  // l'utente legge davvero — non quella che sembrerebbe giusta a scriverla a mano.
  await expect(page.getByTestId('capitale-versato-0')).toHaveText('€ 3000,00');
});

test('commutare la vista non muove la scala scelta né le due cifre della bilancia', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Valore Invarianti');
  archivio.seminaTitolo(ISIN, TITOLO_US_039_VARIANTI.campi);

  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(1000), 30, 40);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(400), 50, 60);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 35, observed_at: adesso - 700 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    { price: 41.2, observed_at: adesso - 200 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_039_VARIANTI.campi.price!,
      observed_at: adesso,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, ISIN);

  const grafico = page.getByTestId('grafico-titolo');

  // Una scala che non è la predefinita: se il commutatore la reimpostasse, si
  // vedrebbe
  await page.getByTestId('scala-anno').click();
  await expect(grafico).toHaveAttribute('data-scala', 'anno');

  // Le due cifre si catturano come **stringhe**: due valori «equivalenti»
  // scritti in due modi sono per chi guarda una divergenza, e un confronto
  // numerico la lascerebbe passare.
  const valorePnl = page.getByTestId('pnl-da-carico-valore');
  const valoreVariazione = page.getByTestId('variazione-periodo-valore');
  const pnlPrima = await valorePnl.textContent();
  const variazionePrima = await valoreVariazione.textContent();
  expect(pnlPrima).toBeTruthy();
  expect(variazionePrima).toBeTruthy();

  // Andata
  await page.getByTestId('vista-valore').click();
  await expect(grafico).toHaveAttribute('data-vista', 'valore');
  await expect(grafico).toHaveAttribute('data-scala', 'anno');
  await expect(page.getByTestId('scala-anno')).toHaveAttribute('aria-pressed', 'true');
  await expect(valorePnl).toHaveText(pnlPrima!);
  await expect(valoreVariazione).toHaveText(variazionePrima!);

  // La variazione continua a dichiararsi misura del prezzo unitario: è la
  // ragione per cui la render prop riceve il ritaglio della serie del prezzo in
  // entrambe le viste
  await expect(page.getByTestId('variazione-periodo')).toContainText('prezzo unitario');

  // Ritorno
  await page.getByTestId('vista-prezzo').click();
  await expect(grafico).toHaveAttribute('data-vista', 'prezzo');
  await expect(grafico).toHaveAttribute('data-scala', 'anno');
  await expect(page.getByTestId('scala-anno')).toHaveAttribute('aria-pressed', 'true');
  await expect(valorePnl).toHaveText(pnlPrima!);
  await expect(valoreVariazione).toHaveText(variazionePrima!);

  // E cambiare scala non riporta la curva al prezzo: l'indipendenza vale nei due
  // versi
  await page.getByTestId('vista-valore').click();
  await page.getByTestId('scala-tutto').click();
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(grafico).toHaveAttribute('data-vista', 'valore');
});

test('il prezzo unitario è la vista di ogni apertura di scheda, e tornandovi ricompare la riga del prezzo medio', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Vista Predefinita');
  archivio.seminaTitolo(ISIN, TITOLO_US_039_VARIANTI.campi);
  archivio.seminaTitolo(ISIN_SECONDO, TITOLO_US_039_SECONDO.campi);

  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(300), 38.9, 30);
  await archivio.aggiungiPosizione(portfolioId, ISIN_SECONDO, dataCivileIndietro(60), 25.3, 12);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 40.1, observed_at: adesso - 100 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_039_VARIANTI.campi.price!,
      observed_at: adesso,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, ISIN);

  const grafico = page.getByTestId('grafico-titolo');

  // Criterio 2, prima apertura
  await expect(grafico).toHaveAttribute('data-vista', 'prezzo');
  await expect(page.getByTestId('vista-prezzo')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('linea-prezzo-medio')).toBeAttached();
  await expect(page.getByTestId('legenda-prezzo-medio')).toBeAttached();

  // L'utente commuta su questo titolo: la riga d'ottone sparisce, e la legenda
  // ne dichiara l'assenza invece di tacerla (criterio 5)
  await page.getByTestId('vista-valore').click();
  await expect(page.getByTestId('linea-prezzo-medio')).toHaveCount(0);
  await expect(page.getByTestId('legenda-prezzo-medio-soppressa')).toContainText(
    'assente per scelta in questa vista',
  );

  // Chiude la scheda e apre quella di un *altro* titolo: la scelta precedente non
  // lo segue. La scheda non si rimonta cambiando titolo, quindi senza
  // l'azzeramento la vista scelta qui sopravvivrebbe all'apertura successiva.
  await page.getByTestId('btn-torna-riepilogo').click();
  await apriSchedaTitolo(page, ISIN_SECONDO);

  await expect(grafico).toHaveAttribute('data-vista', 'prezzo');
  await expect(page.getByTestId('vista-prezzo')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('vista-valore')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('didascalia-ordinata')).toHaveText(/PER QUOTA/);
  await expect(page.getByTestId('linea-prezzo-medio')).toBeAttached();
});

test('le rilevazioni anteriori al primo carico sono escluse e dichiarate, non portate a zero', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Valore Punti Esclusi');
  archivio.seminaTitolo(ISIN, TITOLO_US_039_VARIANTI.campi);

  // Un solo carico, e tre rilevazioni **anteriori**: lo storico dei prezzi è per
  // ISIN e non per posizione, quindi può cominciare prima di te — registrato
  // mentre il titolo stava in un altro portafoglio, o creato dal backfill di
  // US-009 dalla riga di cache.
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(400), 39.5, 50);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 30.1, observed_at: adesso - 800 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    { price: 32.4, observed_at: adesso - 700 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    { price: 34.8, observed_at: adesso - 600 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    { price: 41.9, observed_at: adesso - 100 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_039_VARIANTI.campi.price!,
      observed_at: adesso,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, ISIN);

  const grafico = page.getByTestId('grafico-titolo');

  // Nella vista del prezzo i punti ci sono tutti: il prezzo di una quota esiste
  // anche prima che tu la compri
  await expect(grafico).toHaveAttribute('data-punti', '6');
  await expect(grafico).toHaveAttribute('data-esclusi', '0');

  await page.getByTestId('vista-valore').click();
  await expect(grafico).toHaveAttribute('data-vista', 'valore');

  // Tre punti in meno, e il loro numero è dichiarato invece di essere taciuto
  await expect(grafico).toHaveAttribute('data-punti', '3');
  await expect(grafico).toHaveAttribute('data-esclusi', '3');

  const dichiarazione = page.getByTestId('punti-esclusi');
  await dichiarazione.scrollIntoViewIfNeeded();
  await expect(dichiarazione).toBeVisible();
  await expect(dichiarazione).toContainText('anteriori');
  await expect(dichiarazione).toContainText('non possedevi nulla');

  // E nessun punto compare a valore zero: l'esclusione è un'assenza, non
  // un'affermazione
  await expect(page.locator('[data-valore="0"]')).toHaveCount(0);

  // Il tratto scoperto a sinistra porta la ragione **giusta**: qui l'archivio non
  // tace affatto — i suoi prezzi sono quelli appena contati fra gli esclusi — e
  // attribuire il vuoto a un archivio muto contraddirebbe in pagina la
  // dichiarazione qui sopra. Le due caselle devono raccontare la stessa storia.
  const copertura = page.getByTestId('dichiarazione-copertura');
  await copertura.scrollIntoViewIfNeeded();
  await expect(copertura).toContainText('la posizione esiste dal');
  await expect(copertura).toContainText('non possedevi alcuna quota');
  await expect(copertura).not.toContainText('l’archivio è muto');

  // Il primo punto della vista è il carico stesso, con la quantità intera: è
  // l'origine della serie, non un gradino — prima di esso la posizione non
  // esisteva
  await expect(grafico).toHaveAttribute('data-gradini', '0');
  await expect(page.getByTestId('punto-serie-0')).toHaveAttribute('data-origine', 'carico');
  await expect(page.getByTestId('punto-serie-0')).toHaveAttribute('data-quantita', '50');
});
