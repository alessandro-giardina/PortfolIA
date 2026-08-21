/**
 * US-056: quadro strumenti — gestione di un conto senza titoli, scenario demo.
 *
 * Prova diretta del campo «Dimostra» della spec: nel design «quadro» si crea
 * un portafoglio, lo si apre e — pur non avendo alcun titolo — si vedono
 * insieme il segnaposto «Nessun titolo iscritto», il collegamento «Torna
 * all'elenco portafogli» e il pannello «Gestione del conto»; da lì il conto
 * si rinomina e si elimina senza mai commutare design.
 *
 * La parità con il «Libro Mastro» (seconda frase del campo «Dimostra») resta
 * fuori da questo video: è una verifica funzionale, coperta senza registrare
 * nulla dallo scenario di parità in
 * `US-056__quadro-conto-senza-titoli.spec.ts`, per non appesantire un video
 * pensato per mostrare un solo percorso pulito.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-056/.
 * `launchOptions` (slowMo) non è scopabile in un `describe` — Playwright lo
 * consente solo a livello di file — quindi questo scenario vive da solo,
 * separato dagli scenari funzionali.
 *
 * Il portafoglio nasce dalla UI, non dalla fixture: il nome è prenotato con
 * `archivio.nomeUnico()`, che registra la pulizia per nome (US-029) perché il
 * test non ne conosce l'id finché il modulo non risponde.
 */
import { test, expect } from './support/fixtures.js';

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-056/demo-quadro-conto-senza-titoli.webm');
});

test('demo: crea un conto senza titoli nel quadro, lo rinomina e lo elimina senza commutare design', async ({
  page,
  archivio,
}) => {
  const nome = archivio.nomeUnico('Quadro Demo Conto Vuoto');

  // 1. Dashboard nel design «quadro», già impostato prima del boot di React.
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto('/');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(800);

  // 2. Crea il portafoglio dal pannello «Nuovo portafoglio» del quadro.
  const campo = page.getByTestId('input-nuovo-portafoglio');
  await expect(campo).toBeVisible();
  await campo.fill(nome);

  await page.waitForTimeout(500);

  await page.getByTestId('btn-crea-portafoglio-quadro').click();

  const riga = page.getByText(nome, { exact: true });
  await expect(riga).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(800);

  // 3. Apre il conto appena creato — senza alcun titolo iscritto.
  await riga.click();

  const vuoto = page.getByTestId('riepilogo-vuoto');
  await expect(vuoto).toBeVisible({ timeout: 8000 });
  await expect(vuoto).toContainText('Nessun titolo iscritto');
  await expect(page.getByRole('link', { name: /torna all.elenco portafogli/i })).toBeVisible();
  await expect(page.getByLabel('Rinomina conto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elimina portafoglio' })).toBeVisible();

  await page.waitForTimeout(1200);

  // 4. Rinomina il conto dal pannello di gestione.
  const nuovoNome = `${nome}-Rinominato`;
  const input = page.getByLabel('Rinomina conto');
  await input.fill(nuovoNome);

  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Salva' }).click();

  await expect(page.locator('.briciole b')).toHaveText(`Conto ${nuovoNome}`, { timeout: 8000 });

  await page.waitForTimeout(1200);

  // 5. Elimina il conto, con la stessa guardia `window.confirm` del mastro.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Elimina portafoglio' }).click();

  // 6. Il redirect riporta alla dashboard, ancora nel design quadro: nessuna
  // ricarica di pagina attraversa il commutatore.
  await expect(page).toHaveURL('/', { timeout: 8000 });
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByText(nuovoNome)).not.toBeVisible();

  // Pausa finale: la dashboard resta visibile nel video, non un flash di teardown.
  await page.waitForTimeout(1800);
});
