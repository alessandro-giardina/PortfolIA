/**
 * US-052: quadro strumenti — scheda titolo.
 *
 * Copre, contro il nuovo design «quadro» (US-050/US-051/US-052) e non contro
 * il libro mastro:
 *  1. il grafico del titolo (`GraficoTitolo`, invariato) mostra, alla stessa
 *     apertura e sullo stesso titolo, le stesse letture (`data-punti`,
 *     `data-copertura`) che il mastro mostra — la prova che il componente
 *     riceve gli stessi dati, non una copia ridipinta;
 *  2. le due viste (prezzo unitario / valore della posizione) e le quattro
 *     scale temporali funzionano nel quadro esattamente come nel mastro,
 *     perché è lo stesso componente;
 *  3. anagrafica ufficiale, carichi registrati e storico prezzi mostrano i
 *     dati seminati, secondo il mockup;
 *  4. l'aggiornamento dei dati (US-030) con i suoi tre esiti e la guardia di
 *     conferma, con lo stesso testo del mastro;
 *  5. il ritorno al riepilogo dalla barra laterale, col guscio quadro che
 *     resta montato.
 *
 * Un solo titolo, riservato a questo file (`TITOLO_US_052`, regola
 * un-ISIN-per-file): due carichi a prezzi e quantità diverse — perché il
 * prezzo medio ponderato deve dimostrare la ponderazione — e quattro
 * rilevazioni distribuite da oltre cinque anni a oggi, per differenziare le
 * scale (US-037) e le due viste (US-039). Gli scenari sull'aggiornamento
 * riseminano lo stesso ISIN con `fetched_at` diversi, sullo stesso modello di
 * `US-030__aggiorna-dati-titolo-varianti.spec.ts`: girano in serie dentro il
 * file (`fullyParallel: false`), quindi lo stack di semina-e-ripristino resta
 * consistente.
 */
import { test, expect } from './support/fixtures.js';
import type { GestoreArchivio } from './support/fixtures.js';
import { TITOLO_US_052 } from './support/titoli.js';
import type { Page } from '@playwright/test';

const ISIN = TITOLO_US_052.isin;
const GIORNO = 24 * 60 * 60;

const CARICHI = [
  { giorniFa: 700, prezzo: 71.3, quantita: 50 },
  { giorniFa: 300, prezzo: 79.95, quantita: 40 },
];

/** Quattro rilevazioni: oltre 5 anni, oltre 1 anno, oltre 1 mese, adesso. */
const RILEVAZIONI = [
  { giorniFa: 2000, prezzo: 68.5 },
  { giorniFa: 500, prezzo: 74.2 },
  { giorniFa: 45, prezzo: 88.9 },
  { giorniFa: 0, prezzo: TITOLO_US_052.campi.price! },
];

/**
 * Il totale dei punti che `GraficoTitolo` traccia nella vista «prezzo» a scala
 * «tutto»/«dieci-anni»: ogni carico E ogni rilevazione contribuisce un punto
 * alla serie (`componiSerieTitolo`), non solo le rilevazioni — sei punti,
 * non quattro.
 */
const TOTALE_PUNTI = RILEVAZIONI.length + CARICHI.length;

/** La data civile UTC di `giorni` fa da adesso — non una data fissa, per non invecchiare. */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Crea il portafoglio di prova con il titolo, i due carichi e le quattro rilevazioni. */
async function creaPortafoglioDiProva(archivio: GestoreArchivio) {
  const { id, name } = await archivio.creaPortafoglio('Quadro Scheda Titolo');

  archivio.seminaTitolo(ISIN, TITOLO_US_052.campi);

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(id, ISIN, dataCivileIndietro(carico.giorniFa), carico.prezzo, carico.quantita);
  }

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(
    ISIN,
    RILEVAZIONI.map((rilevazione) => ({
      price: rilevazione.prezzo,
      observed_at: adesso - rilevazione.giorniFa * GIORNO,
      data_source: 'borsaitaliana' as const,
    })),
  );

  return { id, name };
}

/** Apre il portafoglio nel design «quadro» — stessa premessa di US-051. */
async function apriInQuadro(page: Page, id: number) {
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto(`/portfolio/${id}`);
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
}

/** Apre la scheda titolo dalla riga del riepilogo, in qualunque design. */
async function apriSchedaTitolo(page: Page) {
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });
}

test('il grafico in quadro mostra, alla stessa apertura, le stesse letture del mastro sullo stesso titolo', async ({
  page,
  archivio,
}) => {
  const { id } = await creaPortafoglioDiProva(archivio);

  // 1. Apertura nel design predefinito, «mastro»
  await page.goto(`/portfolio/${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');
  await apriSchedaTitolo(page);

  const graficoMastro = page.getByTestId('grafico-titolo');
  await expect(graficoMastro).toBeVisible({ timeout: 8000 });
  const puntiMastro = await graficoMastro.getAttribute('data-punti');
  const coperturaMastro = await graficoMastro.getAttribute('data-copertura');
  const scalaMastro = await graficoMastro.getAttribute('data-scala');
  const vistaMastro = await graficoMastro.getAttribute('data-vista');

  expect(puntiMastro).toBe(String(TOTALE_PUNTI));
  expect(scalaMastro).toBe('tutto');
  expect(vistaMastro).toBe('prezzo');

  // 2. Commutazione a «quadro»: il ternario di PortfolioDetailPage rimonta la
  //    scheda titolo con SchedaTitoloQuadro — un componente diverso, quindi lo
  //    stato locale del grafico (scala/vista scelte) NON deve sopravvivere, ma
  //    i dati sì: la stessa apertura deve produrre le stesse letture.
  await page.getByRole('button', { name: /quadro strumenti/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  const graficoQuadro = page.getByTestId('grafico-titolo');
  await expect(graficoQuadro).toBeVisible({ timeout: 8000 });
  await expect(graficoQuadro).toHaveAttribute('data-punti', puntiMastro ?? '');
  await expect(graficoQuadro).toHaveAttribute('data-copertura', coperturaMastro ?? '');
  await expect(graficoQuadro).toHaveAttribute('data-scala', scalaMastro ?? '');
  await expect(graficoQuadro).toHaveAttribute('data-vista', vistaMastro ?? '');
});

test('nel quadro le due viste e le quattro scale funzionano come nel mastro', async ({ page, archivio }) => {
  const { id } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id);
  await apriSchedaTitolo(page);

  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(grafico).toHaveAttribute('data-punti', String(TOTALE_PUNTI));

  // Le quattro scale diverse dalla predefinita ritagliano punti diversi — ogni
  // carico E ogni rilevazione contano come punto della serie «prezzo».
  await page.getByTestId('scala-mese').click();
  await expect(grafico).toHaveAttribute('data-scala', 'mese');
  await expect(grafico).toHaveAttribute('data-punti', '1'); // solo la rilevazione di oggi

  await page.getByTestId('scala-anno').click();
  await expect(grafico).toHaveAttribute('data-scala', 'anno');
  await expect(grafico).toHaveAttribute('data-punti', '3'); // rilevazione 45gg, carico 300gg, rilevazione oggi

  await page.getByTestId('scala-cinque-anni').click();
  await expect(grafico).toHaveAttribute('data-scala', 'cinque-anni');
  await expect(grafico).toHaveAttribute('data-punti', '5'); // tutto tranne la rilevazione a 2000gg

  await page.getByTestId('scala-dieci-anni').click();
  await expect(grafico).toHaveAttribute('data-scala', 'dieci-anni');
  await expect(grafico).toHaveAttribute('data-punti', String(TOTALE_PUNTI));

  // Il commutatore di vista (US-039): la scala scelta sopravvive al cambio di
  // vista (criterio 1), e l'ordinata dichiara di portare il controvalore.
  await expect(page.getByTestId('vista-prezzo')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('vista-valore').click();
  await expect(grafico).toHaveAttribute('data-vista', 'valore');
  await expect(grafico).toHaveAttribute('data-scala', 'dieci-anni');
  await expect(page.getByTestId('didascalia-ordinata')).toHaveText(/CONTROVALORE/);

  await page.getByTestId('vista-prezzo').click();
  await expect(grafico).toHaveAttribute('data-vista', 'prezzo');
  await expect(page.getByTestId('didascalia-ordinata')).toHaveText(/PER QUOTA/);
});

test('anagrafica ufficiale, carichi registrati e storico prezzi mostrano i dati seminati', async ({
  page,
  archivio,
}) => {
  const { id } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id);
  await apriSchedaTitolo(page);

  // Anagrafica ufficiale
  const anagrafica = page.getByTestId('anagrafica-titolo');
  await anagrafica.scrollIntoViewIfNeeded();
  await expect(anagrafica).toContainText(TITOLO_US_052.campi.name!);
  await expect(anagrafica).toContainText(ISIN);
  await expect(anagrafica).toContainText(TITOLO_US_052.campi.ticker!);
  await expect(anagrafica).toContainText(TITOLO_US_052.campi.instrument_type!);
  await expect(anagrafica).toContainText(TITOLO_US_052.campi.issuer!);

  // Carichi registrati: due righe, con quantità e prezzo di ciascun carico.
  const tabellaCarichi = page.getByTestId('tabella-carichi-titolo');
  await tabellaCarichi.scrollIntoViewIfNeeded();
  await expect(tabellaCarichi.locator('tbody tr')).toHaveCount(CARICHI.length);
  for (const carico of CARICHI) {
    await expect(tabellaCarichi).toContainText(String(carico.quantita));
  }
  // Totale a piè di tabella: 50 + 40 = 90 quote, prezzo medio ponderato 75,1444.
  await expect(tabellaCarichi).toContainText('90');
  await expect(tabellaCarichi).toContainText('75,1444');

  // Storico prezzi: quattro rilevazioni, l'ultima marcata come tale.
  const tabellaStorico = page.getByTestId('tabella-storico-prezzi');
  await tabellaStorico.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('osservazione-0')).toBeVisible();
  await expect(page.getByTestId('osservazione-3')).toBeVisible();
  await expect(tabellaStorico).toContainText('ultima');
  // US-063: la colonna «Prezzo rilevato» è in formato gg/mm/aaaa hh:mm, non più a numeri romani.
  await expect(page.getByTestId('osservazione-0')).toHaveText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  await expect(page.getByTestId('osservazione-3')).toHaveText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  await expect(page.getByTestId('storico-prezzi-vuoto')).toHaveCount(0);
});

test('quando nessuna fonte risponde, la scheda quadro dichiara l’esito negativo e l’archivio resta invariato', async ({
  page,
  archivio,
}) => {
  const { id } = await creaPortafoglioDiProva(archivio);
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_052.campi, fetched_at: Math.floor(Date.now() / 1000) - 10 * GIORNO });

  await apriInQuadro(page, id);
  await apriSchedaTitolo(page);

  const fonte = page.getByTestId('fonte-dato');
  const istantePrecedente = await page.getByTestId('istante-rilevazione').textContent();

  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Impossibile contattare la fonte ufficiale al momento.' }),
    });
  });

  await page.getByTestId('btn-aggiorna-dati').click();

  const esito = page.getByTestId('esito-aggiornamento');
  await expect(esito).toBeVisible();
  await expect(esito).toContainText('Aggiornamento non riuscito');

  await expect(fonte).toContainText('Fonte primaria');
  await expect(page.getByTestId('istante-rilevazione')).toHaveText(istantePrecedente ?? '');
});

test('quando la fonte risponde, la scheda quadro dichiara «dati aggiornati» e riscrive il valore attuale', async ({
  page,
  archivio,
}) => {
  const { id } = await creaPortafoglioDiProva(archivio);
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_052.campi, fetched_at: Math.floor(Date.now() / 1000) - 10 * GIORNO });

  await apriInQuadro(page, id);
  await apriSchedaTitolo(page);

  const nuovoPrezzo = 99.9;
  const istante = Math.floor(Date.now() / 1000);

  await page.route(
    '**/api/securities/**',
    async (route) => {
      archivio.seminaTitolo(ISIN, { ...TITOLO_US_052.campi, price: nuovoPrezzo, fetched_at: istante });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          security: {
            isin: ISIN,
            name: TITOLO_US_052.campi.name,
            price: nuovoPrezzo,
            ticker: TITOLO_US_052.campi.ticker,
            instrumentType: TITOLO_US_052.campi.instrument_type,
            totalAnnualFees: TITOLO_US_052.campi.total_annual_fees,
            currency: TITOLO_US_052.campi.currency,
            issuer: TITOLO_US_052.campi.issuer,
            segment: TITOLO_US_052.campi.segment,
            dividendPolicy: TITOLO_US_052.campi.dividend_policy,
          },
          fromCache: false,
          lastFetchedAt: istante,
          dataSource: 'borsaitaliana',
        }),
      });
    },
    { times: 1 },
  );

  await page.getByTestId('btn-aggiorna-dati').click();

  await expect(page.getByTestId('esito-aggiornamento')).toContainText('Dati aggiornati');
  await expect(page.getByTestId('fonte-dato')).toContainText('Fonte primaria');
  const istanteRilevazione = page.getByTestId('istante-rilevazione');
  await expect(istanteRilevazione).toBeVisible();
  // US-063: formato gg/mm/aaaa hh:mm, non più a numeri romani.
  await expect(istanteRilevazione).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  // 90 quote × € 99,90 = € 8991,00
  await expect(page.getByTestId('dettaglio-valore-attuale')).toHaveText('€ 8991,00');
});

test('una rilevazione appena registrata fa scattare la guardia, e «Annulla» lascia la scheda quadro invariata', async ({
  page,
  archivio,
}) => {
  const { id } = await creaPortafoglioDiProva(archivio);
  // Nessun reseeding con fetched_at vecchio: TITOLO_US_052 è già "adesso".
  await apriInQuadro(page, id);
  await apriSchedaTitolo(page);

  await page.getByTestId('btn-aggiorna-dati').click();

  const avviso = page.getByTestId('avviso-conferma-aggiornamento');
  await expect(avviso).toBeVisible({ timeout: 8000 });
  await expect(avviso.getByRole('button', { name: 'Procedi comunque' })).toBeVisible();

  await avviso.getByRole('button', { name: 'Annulla' }).click();
  await expect(avviso).toHaveCount(0);
  await expect(page.getByTestId('esito-aggiornamento')).toHaveCount(0);
});

test('la barra laterale riporta al riepilogo, e il guscio quadro resta montato', async ({ page, archivio }) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id);
  await apriSchedaTitolo(page);

  await page.getByTestId('barra-laterale').locator('a', { hasText: 'Riepilogo' }).click();

  await expect(page.locator('.titolo-pagina h1')).toHaveText(name, { timeout: 8000 });
  await expect(page.getByTestId('scheda-titolo')).toHaveCount(0);
  await expect(page.getByTestId('barra-laterale')).toBeVisible();

  // E dal bottone dedicato, di nuovo dentro la scheda titolo.
  await apriSchedaTitolo(page);
  await page.getByTestId('btn-torna-riepilogo').click();
  await expect(page.locator('.titolo-pagina h1')).toHaveText(name, { timeout: 8000 });
  await expect(page.getByTestId('barra-laterale')).toBeVisible();
});
