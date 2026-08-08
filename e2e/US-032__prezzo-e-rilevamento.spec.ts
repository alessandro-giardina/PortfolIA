/**
 * US-032: prezzo unitario e data di rilevamento nella tabella del riepilogo —
 * scenario demo.
 *
 * La tabella del riepilogo mostra sette colonne anziché cinque: «Prezzo attuale»
 * e «Ultimo rilevamento» si inseriscono fra «Pr. medio carico» e «Valore
 * attuale», così il valore di ogni posizione è leggibile senza aprire la scheda
 * titolo per titolo.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-032/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi le varianti (dato mancante, riga di
 * totale, attivazione da tastiera) vivono in
 * US-032__prezzo-e-rilevamento-varianti.spec.ts, senza video.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_032 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi
// il video va salvato a mano nella cartella della spec. `saveAs` attende la fine
// della registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`, non dentro il test.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-032/demo-prezzo-e-rilevamento.webm');
});

const ISIN = TITOLO_US_032.isin;

/**
 * Istante di rilevamento seminato: una data fissa, costruita in ora locale
 * perché la colonna la rende nel fuso del browser. Un istante nel passato è
 * innocuo per questo flusso — la vista di riepilogo legge solo la cache e non
 * contatta mai la fonte esterna.
 */
const RILEVATO_IL = Math.floor(new Date(2026, 6, 21, 14, 32).getTime() / 1000);

/**
 * Ricostruisce la stringa attesa dal timestamp seminato, invece di scriverla a
 * mano: se un giorno cambiasse l'istante, l'atteso lo segue senza ritocchi.
 */
function rilevamentoAtteso(fetchedAt: number): string {
  const d = new Date(fetchedAt * 1000);
  const due = (n: number) => String(n).padStart(2, '0');
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

test('demo: il riepilogo mostra prezzo unitario e istante di rilevamento di ogni titolo', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId, name: portfolioName } =
    await archivio.creaPortafoglio('Demo Prezzo e Rilevamento');

  // Il titolo è in archivio con un prezzo e un istante di rilevamento noti: è
  // ciò che le due nuove colonne devono riportare.
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_032.campi, fetched_at: RILEVATO_IL });
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-02-10', 121.5, 30);

  // 1. Il portafoglio si apre sulla scheda Riepilogo
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

  const tabella = page.getByTestId('tabella-riepilogo');
  await expect(tabella).toBeVisible({ timeout: 8000 });

  // 2. Le due nuove intestazioni, in quarta e quinta posizione
  const intestazioni = tabella.locator('thead th');
  await expect(intestazioni).toHaveText([
    'Denominazione · ISIN',
    'Quantità',
    'Pr. medio carico',
    'Prezzo attuale',
    'Ultimo rilevamento',
    'Valore attuale',
    'Differenza',
  ]);

  await page.waitForTimeout(1200);

  // 3. Il prezzo unitario, nello stesso formato del prezzo medio di carico
  const prezzoAttuale = page.getByTestId(`prezzo-attuale-${ISIN}`);
  await expect(prezzoAttuale).toBeVisible();
  await expect(prezzoAttuale).toHaveText(TITOLO_US_032.campi.price!.toFixed(4));

  // 4. E l'istante in cui quel prezzo è stato rilevato, in gg/mm/aaaa hh:mm
  const rilevamento = page.getByTestId(`rilevamento-${ISIN}`);
  await expect(rilevamento).toBeVisible();
  await expect(rilevamento).toHaveText(rilevamentoAtteso(RILEVATO_IL));

  await page.waitForTimeout(1200);

  // 5. La riga resta cliccabile: apre la scheda del titolo come prima
  await page.getByTestId(`riepilogo-${ISIN}`).click();
  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });
  await expect(scheda).toHaveAttribute('data-isin', ISIN);

  // Pausa finale: la scheda titolo resta visibile nel video
  await page.waitForTimeout(2000);
});
