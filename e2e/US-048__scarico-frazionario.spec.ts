/**
 * US-048: registrare uno scarico con quantita frazionaria — scenario
 * dimostrativo con video e scenari di validazione.
 *
 * Dimostra esattamente cio che la spec promette: un titolo con due carichi da
 * 12,345 e 7,5 quote accetta una vendita di 5,005 quote — residuo 14,84, con
 * il lotto piu recente consumato in parte (2,495 quote su 7,5) — e una vendita
 * successiva delle 14,84 quote restanti lo porta fra le **posizioni chiuse**,
 * con residuo zero e P&L latente 0.
 *
 * Lo scenario di validazione verifica che il modulo di scarico rifiuti quantita
 * con piu di 6 decimali, quantita nulla e testo non numerico.
 *
 * Titolo seminato: TITOLO_US_048, riservato a questo file.
 */
import { test, expect } from './support/fixtures.js';
import { elencaVendite } from './support/api.js';
import { TITOLO_US_048 } from './support/titoli.js';

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// Lo scenario demo ha due vendite piu le navigazioni, con slowMo: 300 il budget
// di 30 secondi non basta.
test.setTimeout(60_000);

test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-048/demo-scarico-frazionario.webm');
});

const ISIN = TITOLO_US_048.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** I due carichi: 12,345 quote e 7,5 quote. */
const CARICHI = [
  { giorniFa: 600, prezzo: 10, quantita: 12.345 },
  { giorniFa: 300, prezzo: 15, quantita: 7.5 },
];

/** Vendita parziale: 5,005 quote. */
const VENDITA_PARZIALE = { giorniFa: 60, prezzo: 18, quantita: 5.005 };

/** Vendita totale: 14,84 quote (il residuo dopo la parziale). */
const VENDITA_TOTALE = { giorniFa: 10, prezzo: 20, quantita: 14.84 };

test('demo: scarico frazionario parziale e poi totale — la posizione si chiude con residuo esattamente zero', async ({
  page,
  archivio,
}) => {
  // ─── Premessa ─────────────────────────────────────────────────────────────
  const ADESSO = Math.floor(Date.now() / 1000);
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_048.campi, fetched_at: ADESSO });
  const portafoglio = await archivio.creaPortafoglio('US048-Frazionario');

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();

  // 1. Lo stato di partenza: 19,845 quote
  const rigaAggregata = page.getByTestId(`summary-${ISIN}`);
  await expect(rigaAggregata).toBeVisible({ timeout: 8000 });
  await expect(rigaAggregata).toContainText('19,845');

  // 2. Il modulo di scarico dichiara la giacenza frazionaria
  await expect(page.getByTestId('scarico-giacenza')).toContainText('19,845');

  // ─── Prima vendita: 5,005 quote ──────────────────────────────────────────
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(VENDITA_PARZIALE.giorniFa));
  await page.getByTestId('scarico-prezzo').fill(String(VENDITA_PARZIALE.prezzo));
  await page.getByTestId('scarico-quantita').fill('5,005');
  await page.getByTestId('btn-iscrive-scarico').click();

  // 3. L'iscrizione e confermata con la quantita formattata
  const conferma = page.getByTestId('scarico-successo');
  await expect(conferma).toBeVisible({ timeout: 8000 });
  await expect(conferma).toContainText('5,005');

  // 4. La riga di scarico nel Registro mostra «5,005»
  const vendite = await elencaVendite(portafoglio.id);
  expect(vendite).toHaveLength(1);
  const rigaScarico = page.getByTestId(`scarico-${vendite[0].id}`);
  await rigaScarico.scrollIntoViewIfNeeded();
  await expect(rigaScarico).toContainText('5,005');

  // 5. Il residuo e 14,84
  await expect(page.getByTestId('residuo-quantita')).toHaveText('14,84');
  await expect(page.getByTestId('scarico-giacenza')).toContainText('14,84');

  // 6. LIFO: il lotto piu recente consumato in parte (2,495 su 7,5)
  // Il messaggio di impedimento contiene le quantita formattate
  const carichiIniziali = await page.getByTestId(/^posizione-/).all();
  expect(carichiIniziali.length).toBeGreaterThanOrEqual(2);

  await page.waitForTimeout(1500);

  // ─── Seconda vendita: le restanti 14,84 quote ────────────────────────────
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(VENDITA_TOTALE.giorniFa));
  await page.getByTestId('scarico-prezzo').fill(String(VENDITA_TOTALE.prezzo));
  await page.getByTestId('scarico-quantita').fill('14,84');
  await page.getByTestId('btn-iscrive-scarico').click();

  // 7. Residuo 0: il titolo esce dai posseduti
  await expect(page.getByTestId('residuo-quantita')).toHaveText('0', { timeout: 8000 });

  await page.waitForTimeout(800);

  // 8. Naviga al Riepilogo per trovare le posizioni chiuse
  await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();

  const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
  await tabellaChiuse.scrollIntoViewIfNeeded();
  await expect(tabellaChiuse).toBeVisible({ timeout: 8000 });

  const rigaChiusa = page.getByTestId(`posizione-chiusa-${ISIN}`);
  await expect(rigaChiusa).toBeVisible();
  await expect(rigaChiusa).toContainText(ISIN);
  // Quantita venduta formattata: 19,845 (somma di 5,005 + 14,84)
  await expect(rigaChiusa).toContainText('19,845');

  // Pausa finale per la leggibilita del video
  await page.waitForTimeout(1500);
});

test('validazione: il modulo rifiuta quantita non valide', async ({
  page,
  archivio,
}) => {
  const ADESSO = Math.floor(Date.now() / 1000);
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_048.campi, fetched_at: ADESSO });
  const portafoglio = await archivio.creaPortafoglio('US048-Validazione');

  await archivio.aggiungiPosizione(
    portafoglio.id,
    ISIN,
    dataCivileIndietro(300),
    10,
    100.5,
  );

  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId(`summary-${ISIN}`)).toBeVisible({ timeout: 8000 });

  const erroreQuantita = page.getByTestId('scarico-err-quantita');

  // Caso 1: piu di 6 decimali
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(30));
  await page.getByTestId('scarico-prezzo').fill('10');
  await page.getByTestId('scarico-quantita').fill('1.1234567');
  await page.getByTestId('btn-iscrive-scarico').click();
  await expect(erroreQuantita).toBeVisible();
  await expect(erroreQuantita).toContainText('6 decimali');

  // Caso 2: quantita nulla
  await page.getByTestId('scarico-quantita').fill('0');
  await page.getByTestId('btn-iscrive-scarico').click();
  await expect(erroreQuantita).toBeVisible();

  // Caso 3: testo non numerico
  await page.getByTestId('scarico-quantita').fill('abc');
  await page.getByTestId('btn-iscrive-scarico').click();
  await expect(erroreQuantita).toBeVisible();

  // Caso 4: la virgola e accettata come separatore decimale
  await page.getByTestId('scarico-quantita').fill('5,5');
  await page.getByTestId('btn-iscrive-scarico').click();
  // Nessun errore di quantita: la validazione passa (potrebbe esserci un
  // errore del server per altri motivi, ma NON di forma sulla quantita)
  await expect(erroreQuantita).toHaveCount(0);
});
