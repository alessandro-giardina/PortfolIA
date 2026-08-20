/**
 * US-054/TASK-08: quadro strumenti — iscrizione carichi, scenario dimostrativo.
 *
 * Prova diretta del «Dimostra» della spec: dalla scheda «Carico titoli» nel
 * design predefinito («mastro»), l'utente commuta su «Quadro strumenti» senza
 * ricaricare la pagina, compila ISIN, data, prezzo e quantità nella veste nuova,
 * invia, e vede il banner di conferma e la riga nuova comparire nel registro.
 *
 * Il video è registrato solo qui e salvato in `docs/test-results/US-054/`.
 * `launchOptions` (slowMo) non è scopabile in un `describe` — Playwright lo
 * consente solo a livello di file — quindi questo scenario vive da solo,
 * separato dagli scenari funzionali di `US-054__quadro-carico-scarico.spec.ts`.
 *
 * Il titolo è seminato in cache con un recupero «appena avvenuto»: la scheda
 * risponde dall'archivio e non contatta la fonte reale, che a freddo costerebbe
 * 8-12 secondi non deterministici.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_054_DEMO } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di `test.use()` (vive solo a livello di
// progetto/config), quindi il video va salvato a mano. `saveAs` attende la fine
// della registrazione, che avviene alla chiusura della pagina.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-054/demo-quadro-carico-titoli.webm');
});

const ISIN = TITOLO_US_054_DEMO.isin;

/** La data civile di `giorni` fa, in `YYYY-MM-DD` UTC. */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

test('demo: commuta su «Quadro strumenti» e iscrive un carico nel registro', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054_DEMO.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-Demo');

  // 1. La scheda «Carico titoli» nel design predefinito, «mastro»
  await page.goto(`/portfolio/${portafoglio.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');

  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // Lo stato di partenza che rende visibile l'incremento: registro vuoto
  await expect(page.getByTestId('tabella-registro-carichi')).toContainText(
    'Nessuna iscrizione registrata',
  );

  await page.waitForTimeout(1000);

  // 2. Commutazione al «Quadro strumenti», senza ricaricare la pagina
  await page.getByRole('button', { name: /quadro strumenti/i }).click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });

  // Le due tabelle vuote nella veste nuova: il placeholder invece di
  // un'intestazione senza righe
  await expect(page.getByTestId('tabella-registro-vuota')).toBeVisible();
  await expect(page.getByTestId('tabella-posizioni-vuota')).toBeVisible();

  await page.waitForTimeout(1200);

  // 3. Il modulo di carico, un campo alla volta
  await page.getByTestId('input-isin').fill(ISIN);
  await page.waitForTimeout(400);

  await page.getByTestId('input-data').fill(dataCivileIndietro(120));
  await page.waitForTimeout(400);

  await page.getByTestId('input-prezzo').fill('24.15');
  await page.waitForTimeout(400);

  await page.getByTestId('input-quantita').fill('12,5');
  await page.waitForTimeout(600);

  // 4. Iscrizione
  await page.getByTestId('btn-iscrive').click();

  // 5. L'incremento visibile: il banner di conferma e la riga nuova a registro
  const conferma = page.getByTestId('avviso-successo');
  await expect(conferma).toBeVisible({ timeout: 8000 });
  await expect(conferma).toContainText('Carico iscritto nel registro');

  const registro = page.getByTestId('tabella-registro-carichi');
  await registro.scrollIntoViewIfNeeded();
  await expect(registro).toBeVisible();
  await expect(registro.locator('tr.riga-nuova')).toContainText(ISIN);
  await expect(registro.locator('tr.riga-nuova .marca-iscrizione.carico')).toHaveText('Carico');
  await expect(registro.locator('tr.riga-nuova')).toContainText('12,5');

  // Anche la tabella aggregata ha ora una riga
  await expect(page.getByTestId(`summary-${ISIN}`)).toContainText(
    TITOLO_US_054_DEMO.campi.name!,
  );

  // Pausa finale: il registro con la riga nuova resta visibile nel video, non un
  // flash di teardown
  await page.waitForTimeout(1800);
});
