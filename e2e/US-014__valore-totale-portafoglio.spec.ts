/**
 * US-014: Calcolare il valore attuale totale del portafoglio
 *
 * Entrambi gli scenari governano la cache `securities` con la fixture `archivio`
 * invece di sperare nel suo contenuto (US-029). Prima di quella spec, il primo
 * dava per scontato che ENEL *non* fosse in cache — ma c'era, con prezzo 9.972,
 * lasciato da una ricerca precedente — e il secondo dava per scontato il contrario
 * per un altro ISIN. Entrambe le premesse erano residui di run passati, non fatti.
 *
 * Scenario demo (con video):
 *   semina IE00BJRHVJ28 a 13,60, crea portafoglio con 200 quote, apre la scheda
 *   Riepilogo e verifica il totale atteso — 200 × 13,60 = EUR 2.720,00.
 *
 * Scenario dati mancanti (senza video):
 *   rimuove IT0003128367 dalla cache, così il cache miss è garantito, e verifica
 *   che il riquadro mostri "EUR –" con la nota esplicativa, mai un numero inventato.
 *
 * La rimozione dalla cache non innesca alcuna chiamata di rete: la vista arricchita
 * legge i prezzi con una LEFT JOIN sulla cache e non tenta il recupero live.
 */
import { test, expect } from './support/fixtures.js';

/** ISIN con prezzo seminato: Wellington Euro High Yield Bond. */
const ISIN_CON_PREZZO = 'IE00BJRHVJ28';
/** ISIN senza prezzo: ENEL — reale e valido, ma tenuto fuori dalla cache. */
const ISIN_SENZA_PREZZO = 'IT0003128367';

/**
 * Prezzo seminato e quantità danno un totale atteso noto: 200 × 13,60 = 2720.
 *
 * Attenzione al formato: la pagina usa `toLocaleString('it-IT')`, e in italiano
 * CLDR dichiara `minimumGroupingDigits = 2`, quindi il separatore delle migliaia
 * compare solo da cinque cifre in su. "2720,00" senza punto è corretto — non è un
 * refuso da "correggere" in "2.720,00".
 */
const PREZZO_SEMINATO = 13.6;
const QUANTITA = 200;
const TOTALE_ATTESO = '2720,00';

// ---------------------------------------------------------------------------
// Scenario demo (con video)
// ---------------------------------------------------------------------------

const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: apre scheda Riepilogo e vede il valore attuale totale del portafoglio in EUR',
  async ({ page, archivio }) => {
    // Prezzo noto in cache: il totale atteso è verificabile anche su archivio vergine.
    archivio.seminaTitolo(ISIN_CON_PREZZO, {
      name: 'Wellington Euro High Yield Bond Fund EUR D Ac',
      price: PREZZO_SEMINATO,
      currency: 'EUR',
    });

    const { id: portfolioId, name: portfolioName } =
      await archivio.creaPortafoglio('Demo Valore Totale');
    await archivio.aggiungiPosizione(portfolioId, ISIN_CON_PREZZO, '2026-01-10', 13.0, QUANTITA);

    // Naviga al portafoglio
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

    // Clicca sulla scheda Riepilogo
    await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();

    // Il riquadro valore totale deve essere visibile
    const riquadro = page.getByTestId('valore-totale-portafoglio');
    await expect(riquadro).toBeVisible({ timeout: 10000 });

    // Deve contenere il testo "EUR"
    await expect(riquadro).toContainText('EUR');

    // Il testo dell'etichetta deve essere visibile
    await expect(riquadro).toContainText('Valore attuale totale');

    // Il valore non deve essere il trattino (–), perché l'ISIN ha prezzo in cache…
    const cifra = riquadro.locator('.cifra-totale');
    await expect(cifra).not.toContainText('–');

    // …ed essendo il prezzo seminato da noi, il totale è un numero atteso, non un caso.
    await expect(cifra).toContainText(TOTALE_ATTESO);

    // Pausa finale per rendere lo stato visibile nel video
    await page.waitForTimeout(1500);
  },
);

// ---------------------------------------------------------------------------
// Scenario dati mancanti (senza video)
// ---------------------------------------------------------------------------

test('dati mancanti: ISIN senza prezzo in cache mostra EUR – senza numero inventato', async ({
  page,
  archivio,
}) => {
  // Cache miss garantito: senza questa rimozione lo scenario dipende da cosa hanno
  // lasciato in archivio le ricerche precedenti. La fixture ripristina lo stato.
  archivio.rimuoviTitolo(ISIN_SENZA_PREZZO);

  const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio('Missing Price');

  // Aggiunge posizione per ISIN non presente in archivio (nessun prezzo)
  await archivio.aggiungiPosizione(portfolioId, ISIN_SENZA_PREZZO, '2026-01-10', 6.5, 100);

  // Naviga al portafoglio → scheda Riepilogo
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

  await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();

  // Il riquadro deve essere visibile
  const riquadro = page.getByTestId('valore-totale-portafoglio');
  await expect(riquadro).toBeVisible({ timeout: 10000 });

  // Con nessun prezzo disponibile, il blocco cifra deve mostrare il trattino
  const cifra = riquadro.locator('.cifra-totale');
  await expect(cifra).toContainText('–');

  // La nota mancante deve essere visibile con testo esplicativo
  const notaMancante = riquadro.locator('.nota-mancante');
  await expect(notaMancante).toBeVisible();

  // Non deve contenere un numero EUR positivo (il valore 650 in questo caso)
  await expect(cifra).not.toContainText('650');
  await expect(cifra).not.toContainText('6.5');
});
