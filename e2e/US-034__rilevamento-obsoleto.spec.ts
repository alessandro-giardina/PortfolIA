/**
 * US-034: il riepilogo dichiara quali titoli hanno un rilevamento obsoleto e
 * quanti sono — scenario demo.
 *
 * Due titoli rilevati in momenti diversi: uno in una sessione di borsa ormai
 * chiusa, l'altro adesso. Sopra la tabella compare il conteggio; sulla riga
 * vecchia, dentro la cella «Ultimo rilevamento», la postilla «da aggiornare».
 * Nessuna cifra cambia: il valore totale è quello di sempre.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-034/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi le varianti (portafoglio tutto
 * allineato, titolo mai rilevato) vivono in
 * US-034__rilevamento-obsoleto-varianti.spec.ts, senza video.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_034_FRESCO, TITOLO_US_034_OBSOLETO } from './support/titoli.js';

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
  await page.video()?.saveAs('docs/test-results/US-034/demo-rilevamento-obsoleto.webm');
});

const ISIN_OBSOLETO = TITOLO_US_034_OBSOLETO.isin;
const ISIN_FRESCO = TITOLO_US_034_FRESCO.isin;

const QUANTITA_OBSOLETO = 20;
const QUANTITA_FRESCO = 35;

/**
 * L'istante del rilevamento vecchio è calcolato *all'indietro da adesso*, non
 * fissato a una data di calendario: quattordici giorni contengono sempre almeno
 * una sessione di borsa conclusa, a qualunque ora e in qualunque giorno la suite
 * giri. Una data assoluta sarebbe altrettanto obsoleta oggi, ma legherebbe il
 * test al momento in cui è stato scritto.
 *
 * Simmetricamente il titolo «fresco» si semina *omettendo* `fetched_at`: il
 * default di `seminaTitolo` è adesso, e `classifyRefetch(now, now)` non può
 * restituire `none` — è `intra-session` a mercato aperto e `no-session`
 * altrimenti, e il server mappa entrambi su «non obsoleto».
 */
const RILEVATO_IL = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);

/**
 * Ricostruisce la stringa attesa dal timestamp seminato, invece di scriverla a
 * mano: l'istante si muove con l'esecuzione, l'atteso lo segue senza ritocchi.
 */
function rilevamentoAtteso(fetchedAt: number): string {
  const d = new Date(fetchedAt * 1000);
  const due = (n: number) => String(n).padStart(2, '0');
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

test('demo: il riepilogo segnala il titolo con rilevamento obsoleto e li conta', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId, name: portfolioName } =
    await archivio.creaPortafoglio('Demo Rilevamento Obsoleto');

  // La premessa dello scenario va garantita, non ereditata: un titolo rilevato
  // in una sessione ormai chiusa, l'altro rilevato adesso.
  archivio.seminaTitolo(ISIN_OBSOLETO, { ...TITOLO_US_034_OBSOLETO.campi, fetched_at: RILEVATO_IL });
  archivio.seminaTitolo(ISIN_FRESCO, { ...TITOLO_US_034_FRESCO.campi });

  await archivio.aggiungiPosizione(portfolioId, ISIN_OBSOLETO, '2026-02-10', 110.0, QUANTITA_OBSOLETO);
  await archivio.aggiungiPosizione(portfolioId, ISIN_FRESCO, '2026-03-04', 88.0, QUANTITA_FRESCO);

  // 1. Il portafoglio si apre sulla scheda Riepilogo
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

  const tabella = page.getByTestId('tabella-riepilogo');
  await expect(tabella).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1200);

  // 2. Sopra la tabella, il conteggio dei titoli da aggiornare
  const conteggio = page.getByTestId('conteggio-da-aggiornare');
  await expect(conteggio).toBeVisible();
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    '1 titolo su 2 con rilevamento obsoleto.',
  );

  await page.waitForTimeout(1200);

  // 3. La riga vecchia porta la postilla, e la porta come TESTO: è il criterio
  //    di accessibilità reso eseguibile — nessuna asserzione sul colore.
  const marca = page.getByTestId(`marca-rilevamento-${ISIN_OBSOLETO}`);
  await expect(marca).toBeVisible();
  await expect(marca).toHaveText('da aggiornare');

  // 4. L'istante non è stato sostituito dalla postilla: resta al suo posto,
  //    perché è l'unico dato che dice *quanto* è vecchio il rilevamento.
  await expect(page.getByTestId(`rilevamento-${ISIN_OBSOLETO}`)).toHaveText(
    rilevamentoAtteso(RILEVATO_IL),
  );

  await page.waitForTimeout(1200);

  // 5. La riga rilevata adesso non porta alcuna marcatura
  await expect(page.getByTestId(`marca-rilevamento-${ISIN_FRESCO}`)).toHaveCount(0);

  // 6. Nessuna cifra cambia per effetto di questa spec: il valore totale è la
  //    somma dei due controvalori, marcatura o non marcatura.
  const atteso =
    TITOLO_US_034_OBSOLETO.campi.price! * QUANTITA_OBSOLETO +
    TITOLO_US_034_FRESCO.campi.price! * QUANTITA_FRESCO;
  await expect(page.getByTestId('valore-totale-portafoglio')).toContainText(
    atteso.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );

  // Pausa finale: il riepilogo marcato resta visibile nel video
  await page.waitForTimeout(2000);
});
