/**
 * US-018: Visualizzare il dettaglio completo di un titolo — scenario demo.
 *
 * Dalla tabella di riepilogo del portafoglio, il clic su una riga apre la scheda
 * titolo: posizione a conto, anagrafica ufficiale, provenienza del dato (FR-021)
 * e carichi individuali che compongono la posizione.
 *
 * Il video è registrato solo per lo scenario demo e salvato in
 * docs/test-results/US-018/. `launchOptions` (slowMo) non è scopabile in un
 * describe — Playwright lo consente solo a livello di file — quindi lo scenario
 * di apertura da tastiera vive qui accanto, condividendo il rallentamento ma
 * senza produrre un artefatto: il salvataggio è condizionato al titolo del test,
 * così la cartella della spec conserva un solo video, quello che dimostra la spec.
 *
 * Titolo seminato: TITOLO_US_018, riservato a questo file (regola un-ISIN-per-file
 * in e2e/support/titoli.ts). È l'unico della suite con `data_source` esplicito:
 * senza fissarla, il timbro di provenienza dipenderebbe da quale fonte ha popolato
 * la cache per ultima.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_018 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

const TITOLO_DEMO =
  'demo: il clic su un titolo della tabella apre la scheda con anagrafica, provenienza e carichi';

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi
// il video va salvato a mano. `saveAs` attende la fine della registrazione, che
// avviene alla chiusura della pagina: va chiamato dopo `page.close()`.
test.afterEach(async ({ page }, testInfo) => {
  await page.close();
  if (testInfo.title === TITOLO_DEMO) {
    await page.video()?.saveAs('docs/test-results/US-018/demo-dettaglio-titolo.webm');
  }
});

/**
 * I tre carichi dello scenario. Insieme fanno 220 quote per 15.026,00 € di
 * controvalore, cioè un prezzo medio ponderato di 68,3000 €.
 */
const CARICHI = [
  { data: '2021-09-19', prezzo: 61.40, quantita: 80 },
  { data: '2023-03-07', prezzo: 70.10, quantita: 90 },
  { data: '2025-02-14', prezzo: 76.10, quantita: 50 },
];

test(TITOLO_DEMO, async ({ page, archivio }) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Scheda Titolo');

  // Anagrafica completa in archivio, con la fonte dichiarata: è ciò che la
  // scheda deve saper mostrare, provenienza compresa.
  archivio.seminaTitolo(TITOLO_US_018.isin, TITOLO_US_018.campi);

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portfolioId,
      TITOLO_US_018.isin,
      carico.data,
      carico.prezzo,
      carico.quantita,
    );
  }

  // 1. Il portafoglio si apre sulla scheda Riepilogo, con la tabella dei titoli
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${TITOLO_US_018.isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  // La linguetta "Scheda titolo" è ancora disabilitata: nessun titolo scelto
  const linguettaTitolo = page.locator('nav.linguette a', { hasText: 'Scheda titolo' });
  await expect(linguettaTitolo).toHaveClass(/disabilitata/);

  // Battuta di lettura: il riepilogo è il punto di partenza del flusso
  await page.waitForTimeout(1200);

  // 2. Clic sulla riga del titolo
  await riga.click();

  // 3. La scheda titolo si apre e la linguetta risulta attiva
  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });
  await expect(linguettaTitolo).toHaveClass(/attiva/);

  // 4. Posizione a conto — i quattro valori calcolati dai carichi e dal prezzo
  await expect(page.getByTestId('dettaglio-quantita')).toHaveText('220');
  await expect(page.getByTestId('dettaglio-prezzo-medio')).toHaveText('€ 68,3000');
  // 112,74 × 220 = 24.802,80
  await expect(page.getByTestId('dettaglio-valore-attuale')).toHaveText('€ 24.802,80');
  // 24.802,80 − 15.026,00 = +9.776,80 (+65,07 %). Senza separatore di migliaia:
  // la convenzione italiana non lo usa sui numeri a quattro cifre.
  await expect(page.getByTestId('dettaglio-differenza')).toHaveText('+€ 9776,80');
  await expect(scheda.locator('.orizzonte .perc.guadagno')).toHaveText('+65,07 %');

  await page.waitForTimeout(800);

  // 5. Anagrafica ufficiale — tutti i campi richiesti dai criteri di accettazione
  const anagrafica = page.getByTestId('anagrafica-titolo');
  await expect(anagrafica).toBeVisible();

  const voce = (etichetta: string) => anagrafica.locator('.voce-def', { hasText: etichetta }).locator('.dato');
  await expect(voce('Denominazione')).toHaveText(TITOLO_US_018.campi.name!);
  await expect(voce('Ticker')).toHaveText(TITOLO_US_018.campi.ticker!);
  await expect(voce('Tipo strumento')).toHaveText(TITOLO_US_018.campi.instrument_type!);
  await expect(voce('Commissioni annue')).toHaveText(TITOLO_US_018.campi.total_annual_fees!);
  await expect(voce('Valuta')).toHaveText(TITOLO_US_018.campi.currency!);
  await expect(voce('Emittente')).toHaveText(TITOLO_US_018.campi.issuer!);
  await expect(voce('Segmento')).toHaveText(TITOLO_US_018.campi.segment!);
  await expect(voce('Politica dividendi')).toHaveText(TITOLO_US_018.campi.dividend_policy!);

  // Nessun campo è dichiarato assente: l'anagrafica è completa
  await expect(anagrafica.locator('.dato.assente')).toHaveCount(0);

  await page.waitForTimeout(800);

  // 6. Provenienza del dato (FR-021): dichiarata, non presunta
  const fonte = page.getByTestId('fonte-dato');
  await expect(fonte).toBeVisible();
  await expect(fonte.locator('.timbro-fonte')).toHaveText('Fonte primaria');
  await expect(fonte).toContainText('Borsa Italiana');
  await expect(fonte).toContainText('Rilevato il');

  // 7. I tre carichi individuali sono elencati, in ordine cronologico
  const carichi = page.getByTestId('tabella-carichi-titolo').locator('tbody tr');
  await expect(carichi).toHaveCount(3);
  await expect(carichi.nth(0)).toContainText('19.IX.2021');
  await expect(carichi.nth(1)).toContainText('07.III.2023');
  await expect(carichi.nth(2)).toContainText('14.II.2025');

  // Pausa finale: la scheda completa resta visibile nel video
  await page.waitForTimeout(2000);
});

test('la scheda titolo si apre da tastiera con Enter sulla riga di riepilogo', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scheda Titolo Tastiera');
  archivio.seminaTitolo(TITOLO_US_018.isin, TITOLO_US_018.campi);
  await archivio.aggiungiPosizione(portfolioId, TITOLO_US_018.isin, '2026-01-15', 100.00, 12);

  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${TITOLO_US_018.isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  // La riga è raggiungibile da tastiera e si annuncia come attivabile
  await expect(riga).toHaveAttribute('role', 'button');
  await riga.focus();
  await expect(riga).toBeFocused();

  await page.keyboard.press('Enter');

  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('nav.linguette a', { hasText: 'Scheda titolo' })).toHaveClass(/attiva/);
  await expect(page.getByTestId('dettaglio-quantita')).toHaveText('12');
});
