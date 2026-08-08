/**
 * US-030: Aggiornare i dati di un titolo dalla sua scheda — scenario demo.
 *
 * Il flusso che la spec promette: la scheda di un titolo rilevato in una
 * sessione di mercato precedente offre un comando nella riga di provenienza;
 * premendolo, prezzo, fonte e istante di rilevazione si rinnovano. Premendolo di
 * nuovo subito dopo scatta la guardia di buona cittadinanza, che è la stessa
 * della Ricerca titoli: cercando lo stesso ISIN da lì, l'avviso compare anche
 * là, con l'istante dell'aggiornamento appena fatto dalla scheda.
 *
 * **Come lo scenario resta deterministico senza inventare nulla.** Il primo
 * aggiornamento è servito da `route.fulfill({ times: 1 })`: la risposta della
 * fonte è finta, ma la riga d'archivio è ri-seminata davvero, quindi il
 * dettaglio che la scheda rilegge viene dal server e dai dati veri. Dal secondo
 * click in poi lo stub è esaurito e la richiesta arriva al server: la guardia
 * che vediamo scattare è quella di produzione, non una sua imitazione.
 *
 * Titolo seminato: TITOLO_US_030, riservato a questo file (regola
 * un-ISIN-per-file in e2e/support/titoli.ts).
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_030 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

const TITOLO_DEMO =
  'demo: dalla riga di provenienza l’utente aggiorna i dati del titolo e ritrova la stessa guardia nella Ricerca titoli';

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi
// il video va salvato a mano. `saveAs` attende la fine della registrazione, che
// avviene alla chiusura della pagina: va chiamato dopo `page.close()`.
test.afterEach(async ({ page }, testInfo) => {
  await page.close();
  if (testInfo.title === TITOLO_DEMO) {
    await page.video()?.saveAs('docs/test-results/US-030/demo-aggiorna-dati-titolo.webm');
  }
});

/** Dieci giorni: abbastanza perché fra la rilevazione e ora sia passata una sessione di borsa. */
const DIECI_GIORNI_FA = Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60;

/** Il prezzo che la fonte di backup restituisce: diverso da quello in archivio. */
const PREZZO_NUOVO = 129.72;

/** I due carichi dello scenario: 150 quote per 16.845,00 € di controvalore. */
const CARICHI = [
  { data: '2024-05-10', prezzo: 108.3, quantita: 90 }, //  9.747,00
  { data: '2025-11-04', prezzo: 118.3, quantita: 60 }, //  7.098,00
];

/** "HH:MM" nel fuso di Roma, che è quello con cui il server formatta la guardia. */
function oraDiRoma(istante: number): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(istante * 1000));
}

test(TITOLO_DEMO, async ({ page, archivio }) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Aggiorna Dati');

  // Archivio di partenza: anagrafica completa, fonte primaria, rilevazione di
  // dieci giorni fa. È il titolo "vecchio" che l'utente vuole rinfrescare.
  archivio.seminaTitolo(TITOLO_US_030.isin, {
    ...TITOLO_US_030.campi,
    fetched_at: DIECI_GIORNI_FA,
  });

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portfolioId,
      TITOLO_US_030.isin,
      carico.data,
      carico.prezzo,
      carico.quantita,
    );
  }

  // ─── 1. Dal riepilogo alla scheda del titolo ───────────────────────────────
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${TITOLO_US_030.isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  await riga.click();

  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });

  // ─── 2. La riga di provenienza dichiara il dato vecchio e offre il comando ──
  const fonte = page.getByTestId('fonte-dato');
  await expect(fonte.locator('.timbro-fonte')).toHaveText('Fonte primaria');
  await expect(fonte).toContainText('Borsa Italiana');

  const istanteVecchio = await page.getByTestId('istante-rilevazione').textContent();

  const comando = page.getByTestId('btn-aggiorna-dati');
  await expect(comando).toBeVisible();
  await expect(comando).toHaveText(/Aggiorna dati/);

  // 118,42 × 150 = 17.763,00 — il valore attuale prima dell'aggiornamento
  await expect(page.getByTestId('dettaglio-valore-attuale')).toHaveText('€ 17.763,00');

  // Battuta di lettura: si vede da dove si parte
  await page.waitForTimeout(1200);

  // ─── 3. L'aggiornamento: la fonte di backup risponde ───────────────────────
  // La riga d'archivio è riscritta come farebbe il server dopo un recupero da
  // MorningStar; la sola risposta finta è quella del lookup, e vale una volta.
  const istanteAggiornamento = Math.floor(Date.now() / 1000);
  archivio.seminaTitolo(TITOLO_US_030.isin, {
    ...TITOLO_US_030.campi,
    price: PREZZO_NUOVO,
    data_source: 'morningstar',
    fetched_at: istanteAggiornamento,
  });

  await page.route(
    '**/api/securities/**',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          security: {
            isin: TITOLO_US_030.isin,
            name: TITOLO_US_030.campi.name,
            price: PREZZO_NUOVO,
            ticker: TITOLO_US_030.campi.ticker,
            instrumentType: TITOLO_US_030.campi.instrument_type,
            totalAnnualFees: TITOLO_US_030.campi.total_annual_fees,
            currency: TITOLO_US_030.campi.currency,
            issuer: TITOLO_US_030.campi.issuer,
            segment: TITOLO_US_030.campi.segment,
            dividendPolicy: TITOLO_US_030.campi.dividend_policy,
          },
          fromCache: false,
          lastFetchedAt: istanteAggiornamento,
          dataSource: 'morningstar',
        }),
      });
    },
    { times: 1 },
  );

  await comando.click();

  // ─── 4. Esito dichiarato: la fonte che ha risposto, non quella tentata ─────
  const esito = page.getByTestId('esito-aggiornamento');
  await expect(esito).toBeVisible();
  await expect(esito).toContainText('Dati aggiornati');
  await expect(esito).toContainText('MorningStar');

  // Il timbro segue la fonte che ha risposto
  await expect(fonte.locator('.timbro-fonte')).toHaveText('Fonte di backup');
  await expect(fonte).toContainText('MorningStar (backup)');

  // Prezzo, valore attuale e differenza sono quelli nuovi: 129,72 × 150 =
  // 19.458,00, contro 16.845,00 di carico → +2.613,00 (+15,51 %).
  await expect(page.getByTestId('dettaglio-valore-attuale')).toHaveText('€ 19.458,00');
  await expect(page.getByTestId('dettaglio-differenza')).toHaveText('+€ 2613,00');

  // E l'istante di rilevazione non è più quello di dieci giorni fa
  const istanteNuovo = page.getByTestId('istante-rilevazione');
  await expect(istanteNuovo).not.toHaveText(istanteVecchio ?? '');
  await expect(istanteNuovo).toContainText(oraDiRoma(istanteAggiornamento));

  await page.waitForTimeout(1500);

  // ─── 5. Secondo click: la guardia di buona cittadinanza, quella vera ───────
  // Lo stub è esaurito: la richiesta arriva al server, che legge la rilevazione
  // appena scritta e chiede conferma invece di ricontattare la fonte.
  await comando.click();

  const avviso = page.getByTestId('avviso-conferma-aggiornamento');
  await expect(avviso).toBeVisible({ timeout: 8000 });
  await expect(avviso).toContainText('recupero informazioni di questo titolo');
  await expect(avviso.getByRole('button', { name: 'Procedi comunque' })).toBeVisible();

  await page.waitForTimeout(1200);

  // Si annulla: procedere contatterebbe la fonte reale, che questo test non
  // deve raggiungere.
  await avviso.getByRole('button', { name: 'Annulla' }).click();
  await expect(avviso).toHaveCount(0);

  // ─── 6. Stessa guardia dalla Ricerca titoli: un archivio solo ──────────────
  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill(TITOLO_US_030.isin);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  const avvisoRicerca = page.locator('.avviso-conferma');
  await expect(avvisoRicerca).toBeVisible({ timeout: 8000 });
  // L'istante è quello dell'aggiornamento fatto dalla scheda: la guardia legge
  // la stessa riga d'archivio che la scheda ha riscritto.
  await expect(avvisoRicerca).toContainText(oraDiRoma(istanteAggiornamento));

  // Pausa finale: l'avviso resta leggibile nel video
  await page.waitForTimeout(2000);
});
