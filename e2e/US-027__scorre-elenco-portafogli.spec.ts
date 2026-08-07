/**
 * US-027: Scorrere l'elenco portafogli nel dialog di scelta — scenario demo.
 *
 * Con più portafogli di quanti ne stiano in finestra, il dialog "Scegli un
 * Portafoglio" mostra l'elenco in un'area scorrevole: i bottoni restano ancorati
 * in fondo, l'ultima riga è raggiungibile e la conferma porta al portafoglio giusto.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-027/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo consente
 * solo a livello di file — quindi gli altri scenari di US-027 vivono in
 * US-027__dialog-elenco-portafogli.spec.ts, senza video e senza rallentamento.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_027 } from './support/titoli.js';

/** Quanti portafogli servono perché l'elenco superi l'altezza della finestra. */
const QUANTI_PORTAFOGLI = 14;

const VIEWPORT = { width: 1280, height: 720 };

/** Padding dell'overlay: il riquadro non può superare la finestra meno questo, due volte. */
const RESPIRO_OVERLAY = 24;

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va dichiarata
  // esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: VIEWPORT },
  launchOptions: { slowMo: 300 },
  viewport: VIEWPORT,
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi il
// video va salvato a mano nella cartella della spec. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo `page.close()`,
// non dentro il test.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-027/demo-scorre-elenco-portafogli.webm');
});

test('demo: con molti portafogli il dialog scorre e l\'ultimo resta selezionabile', async ({
  page,
  archivio,
}) => {
  // Il titolo è seminato in cache con un recupero "appena avvenuto": la ricerca
  // risponde dall'archivio e non contatta la fonte reale. Qui la ricerca è solo il
  // mezzo per arrivare al dialog, non l'oggetto della prova.
  archivio.seminaTitolo(TITOLO_US_027.isin, TITOLO_US_027.campi);

  // In serie e non in parallelo: è la sequenzialità a garantire che gli id crescano
  // nell'ordine di creazione, e quindi che l'ultimo creato sia l'ultimo dell'elenco.
  const idCreati: number[] = [];
  for (let i = 1; i <= QUANTI_PORTAFOGLI; i += 1) {
    const { id } = await archivio.creaPortafoglio(`Portafoglio ${String(i).padStart(2, '0')}`);
    idCreati.push(id);
  }
  const ultimoIdCreato = idCreati.at(-1);
  if (ultimoIdCreato === undefined) throw new Error('Nessun portafoglio creato dal test.');

  // 1. L'utente cerca il titolo da iscrivere
  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill(TITOLO_US_027.isin);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // 2. Dalla scheda del titolo apre il dialog di scelta portafoglio
  const bottoneAggiungi = page.getByTestId('btn-aggiungi-portafoglio');
  await expect(bottoneAggiungi).toBeVisible({ timeout: 30000 });
  await bottoneAggiungi.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  // 3. Il riquadro sta dentro la finestra: l'elenco non lo fa più crescere oltre
  const riquadro = await dialog.boundingBox();
  expect(riquadro).not.toBeNull();
  expect(riquadro!.height).toBeLessThanOrEqual(VIEWPORT.height - 2 * RESPIRO_OVERLAY);
  // Lo sforamento originale era simmetrico — il centraggio flex tagliava anche in
  // alto — quindi non basta guardare l'altezza.
  expect(riquadro!.y).toBeGreaterThanOrEqual(0);

  // 4. …ed è l'area lista a scorrere
  const corpo = page.getByTestId('dialog-corpo');
  await expect
    .poll(() => corpo.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(0);

  // 5. I bottoni restano ancorati in fondo, sempre raggiungibili
  await expect(page.getByTestId('btn-annulla-dialog')).toBeInViewport();
  await expect(page.getByTestId('btn-conferma-dialog')).toBeInViewport();

  // 6. Scorrendo si arriva all'ultima riga dell'elenco: nulla resta fuori portata
  const opzioni = page.locator('[data-testid^="portafoglio-option-"]');
  const ultimaRiga = opzioni.last();
  await ultimaRiga.scrollIntoViewIfNeeded();
  await expect(ultimaRiga).toBeInViewport();
  await expect(page.getByTestId('btn-conferma-dialog')).toBeInViewport();

  // 7. Selezione dell'ultimo portafoglio creato da questo test.
  //    Perché per id e non con `opzioni.last()`: i file spec girano in parallelo su
  //    worker distinti, quindi l'elenco reale può contenere anche portafogli di altri
  //    test, che il loro teardown rimuove da un momento all'altro. Nell'ordine
  //    restituito dall'API è comunque l'ultima riga (o la penultima, se un altro
  //    worker ne ha appena creato uno).
  const ultimoPortafoglio = page.getByTestId(`portafoglio-option-${ultimoIdCreato}`);
  await ultimoPortafoglio.scrollIntoViewIfNeeded();
  await ultimoPortafoglio.click();
  await expect(ultimoPortafoglio).toHaveAttribute('aria-selected', 'true');

  // 8. La conferma porta al dettaglio di quel portafoglio, con il modulo pre-compilato
  await page.getByTestId('btn-conferma-dialog').click();
  await expect(page).toHaveURL(`/portfolio/${ultimoIdCreato}`);
  await expect(page.getByTestId('input-isin')).toHaveValue(TITOLO_US_027.isin);
  await expect(page.getByTestId('input-prezzo')).not.toHaveValue('');

  // Pausa finale: il modulo di carico pre-compilato resta visibile nel video
  await page.waitForTimeout(2000);
});
