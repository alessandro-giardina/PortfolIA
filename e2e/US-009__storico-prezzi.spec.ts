/**
 * US-009: Lo storico dei prezzi osservati nella scheda titolo — scenario demo.
 *
 * Dimostra ciò che la spec promette: un titolo il cui prezzo è stato rilevato due
 * volte, in giorni diversi e a quotazione diversa, mostra in fondo alla scheda —
 * sotto «Carichi registrati» — una tabella «Storico prezzi» con due righe in
 * ordine temporale decrescente, ciascuna con prezzo, data di rilevamento e fonte.
 *
 * Le due rilevazioni sono **seminate**, non provocate. Provocarle davvero
 * richiederebbe due sessioni di borsa distinte e due risposte diverse dalla fonte
 * reale: 8-12 secondi per volta, esito dipendente dall'ora del run, e nessun modo
 * di far cadere le due rilevazioni in giorni civili diversi. Intercettare la rotta
 * con `route.fulfill()` non è un'alternativa: la richiesta non arriverebbe al
 * server, quindi nessuna osservazione verrebbe registrata e il test proverebbe
 * soltanto che il client sa disegnare una tabella. La registrazione lungo i rami
 * dell'endpoint è verificata dove può esserlo in modo deterministico, con
 * l'orologio iniettato, in `server/tests/api.securities.storico.test.ts`.
 *
 * L'istante della rilevazione più recente è **letto dalla riga di cache** appena
 * seminata: così «Rilevato il» in cima alla scheda e la prima riga dello storico
 * dichiarano lo stesso momento. Due date diverse per lo stesso fatto sarebbero,
 * per chi guarda il video, un dato falso.
 *
 * Titolo seminato: TITOLO_US_009, riservato a questo file (regola un-ISIN-per-file
 * in e2e/support/titoli.ts).
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_009 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

const TITOLO_DEMO =
  'demo: due rilevazioni in giorni e a prezzi diversi compaiono nello storico in ordine decrescente';

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi
// il video va salvato a mano. `saveAs` attende la fine della registrazione, che
// avviene alla chiusura della pagina: va chiamato dopo `page.close()`.
test.afterEach(async ({ page }, testInfo) => {
  await page.close();
  if (testInfo.title === TITOLO_DEMO) {
    await page.video()?.saveAs('docs/test-results/US-009/demo-storico-prezzi.webm');
  }
});

/** Il prezzo della rilevazione più vecchia: diverso da quello in cache, di tre giorni prima. */
const PREZZO_PRECEDENTE = 126.9;
const TRE_GIORNI_IN_SECONDI = 3 * 24 * 60 * 60;

test(TITOLO_DEMO, async ({ page, archivio }) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Storico Prezzi');

  archivio.seminaTitolo(TITOLO_US_009.isin, TITOLO_US_009.campi);
  await archivio.aggiungiPosizione(portfolioId, TITOLO_US_009.isin, '2026-06-03', 104.2, 60);

  // L'istante del recupero in cache è anche quello della rilevazione più recente.
  const rilevazioneRecente = archivio.leggiTitolo(TITOLO_US_009.isin)!.fetched_at;

  archivio.seminaOsservazioni(TITOLO_US_009.isin, [
    {
      price: PREZZO_PRECEDENTE,
      observed_at: rilevazioneRecente - TRE_GIORNI_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      price: TITOLO_US_009.campi.price!,
      observed_at: rilevazioneRecente,
      data_source: 'borsaitaliana',
    },
  ]);

  // 1. Il portafoglio si apre sul riepilogo, con il titolo in tabella
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${TITOLO_US_009.isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1200);

  // 2. Il clic sulla riga apre la scheda titolo
  await riga.click();
  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });

  // 3. I carichi registrati restano dove erano: lo storico è la sezione *dopo*
  await expect(page.getByTestId('tabella-carichi-titolo')).toBeVisible();

  // 4. In fondo alla scheda, la nuova sezione «Storico prezzi»
  const storico = page.getByTestId('tabella-storico-prezzi');
  await storico.scrollIntoViewIfNeeded();
  await expect(storico).toBeVisible();
  await expect(scheda.locator('.sezione-titolo', { hasText: 'Storico prezzi' })).toBeVisible();

  await page.waitForTimeout(800);

  // 5. Due righe, in ordine temporale decrescente: la rilevazione più recente in
  //    cima, marcata come ultima
  const righe = storico.locator('tbody tr');
  await expect(righe).toHaveCount(2);
  await expect(righe.nth(0)).toHaveClass(/rilevazione-ultima/);
  await expect(righe.nth(0).locator('.postilla-ultima')).toHaveText('ultima');
  await expect(righe.nth(1)).not.toHaveClass(/rilevazione-ultima/);

  // 6. Ogni riga porta prezzo, data di rilevamento e fonte
  await expect(page.getByTestId('osservazione-prezzo-0')).toHaveText('€ 128,4600');
  await expect(page.getByTestId('osservazione-prezzo-1')).toHaveText('€ 126,9000');

  // Il prezzo in cima allo storico è quello che la scheda dichiara come attuale:
  // se divergessero, una delle due cifre sarebbe falsa.
  await expect(scheda.locator('.orizzonte .perc', { hasText: '/quota' })).toContainText('128,4600');

  const giornoRecente = new Date(rilevazioneRecente * 1000).getDate();
  const giornoPrecedente = new Date((rilevazioneRecente - TRE_GIORNI_IN_SECONDI) * 1000).getDate();
  await expect(righe.nth(0)).toContainText(`${String(giornoRecente).padStart(2, '0')}.`);
  await expect(righe.nth(1)).toContainText(`${String(giornoPrecedente).padStart(2, '0')}.`);

  await expect(righe.nth(0).locator('.timbro-riga')).toHaveText('Borsa Italiana');
  await expect(righe.nth(1).locator('.timbro-riga')).toHaveText('Borsa Italiana');

  await page.waitForTimeout(800);

  // 7. L'avviso di radità dichiara che i giorni non osservati restano vuoti
  const avviso = page.getByTestId('avviso-storico-rado');
  await expect(avviso).toBeVisible();
  await expect(avviso).toContainText('non li stima e non li interpola');

  // Pausa finale: lo storico completo resta visibile nel video
  await page.waitForTimeout(2000);
});
