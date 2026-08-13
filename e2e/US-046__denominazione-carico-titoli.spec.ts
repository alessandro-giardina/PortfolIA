/**
 * US-046: la denominazione del titolo nelle tabelle di «Carico titoli» — scenario
 * dimostrativo.
 *
 * Il flusso che la spec promette (vedi `Dimostra` in `.archetipo/specs/US-046.yaml`):
 * un portafoglio con un titolo la cui anagrafica è in archivio mostra la sua
 * denominazione sia in «Titoli iscritti a conto» sia su **ogni** riga del
 * «Registro delle iscrizioni», con l'ISIN sotto.
 *
 * Lo scenario porta due carichi e uno scarico sullo stesso ISIN, perché è la sola
 * disposizione che rende visibile ciò che la spec chiede davvero: la riga
 * aggregata è una, le iscrizioni sono tre, e la denominazione deve comparire su
 * tutte — carichi e scarichi indistintamente, senza raggruppare per ISIN. Le
 * iscrizioni si registrano via API e non dai moduli in pagina: quei due flussi
 * sono già il soggetto dei video di US-011 e US-042, e ripeterli qui allungherebbe
 * il filmato senza mostrare nulla di questa spec.
 *
 * Titolo seminato: TITOLO_US_046, riservato a questo file (regola un-ISIN-per-file
 * in e2e/support/titoli.ts).
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLO_US_046 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-046/demo-denominazione-carico-titoli.webm');
});

const ISIN = TITOLO_US_046.isin;
const DENOMINAZIONE = TITOLO_US_046.campi.name as string;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC e non i campi locali: `load_date` e `sale_date` sono date civili
 * confrontate fra loro come stringhe, e comporle dal fuso locale le farebbe
 * scivolare di un giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** I due carichi: prezzi diversi, così la riga aggregata ha un medio non banale. */
const CARICHI = [
  { giorniFa: 500, prezzo: 95.0, quantita: 120 },
  { giorniFa: 200, prezzo: 110.0, quantita: 80 },
];
/** Lo scarico: parziale, così il titolo resta a conto e la riga aggregata esiste. */
const SCARICO = { giorniFa: 40, prezzo: 118.4, quantita: 50 };

test('demo: le due tabelle di Carico titoli mostrano la denominazione sopra l\'ISIN, su ogni riga', async ({
  page,
  archivio,
}) => {
  // ─── Premessa: l'anagrafica in cache, due carichi e uno scarico ────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_046.campi);

  const portafoglio = await archivio.creaPortafoglio('US046-Denominazione');

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }
  await registraVendita(
    portafoglio.id,
    ISIN,
    dataCivileIndietro(SCARICO.giorniFa),
    SCARICO.prezzo,
    SCARICO.quantita,
  );

  // ─── 1. Il portafoglio si apre sul Riepilogo, dove il nome già si legge ────
  await page.goto(`/portfolio/${portafoglio.id}`);

  const rigaRiepilogo = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(rigaRiepilogo).toBeVisible({ timeout: 8000 });
  await expect(rigaRiepilogo.locator('strong')).toHaveText(DENOMINAZIONE);

  await page.waitForTimeout(600);

  // ─── 2. Si passa a «Carico titoli» ────────────────────────────────────────
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();

  const tabellaPosizioni = page.getByTestId('tabella-posizioni');
  await expect(tabellaPosizioni).toBeVisible();
  await tabellaPosizioni.scrollIntoViewIfNeeded();

  // ─── 3. «Titoli iscritti a conto»: intestazione e cella allineate al Riepilogo ─
  await expect(tabellaPosizioni.locator('thead th').first()).toHaveText('Denominazione · ISIN');

  const rigaAggregata = page.getByTestId(`summary-${ISIN}`);
  await expect(rigaAggregata).toBeVisible();
  await expect(rigaAggregata.locator('strong')).toHaveText(DENOMINAZIONE);
  await expect(rigaAggregata.locator('small')).toHaveText(ISIN);
  // Il residuo dei due carichi meno lo scarico: la riga resta a conto.
  await expect(rigaAggregata).toContainText(
    String(CARICHI[0].quantita + CARICHI[1].quantita - SCARICO.quantita),
  );

  await page.waitForTimeout(900);

  // ─── 4. «Registro delle iscrizioni»: stessa cella su tutte e tre le righe ──
  const registro = page.getByTestId('tabella-registro-carichi');
  await registro.scrollIntoViewIfNeeded();
  await expect(registro).toBeVisible();

  await expect(registro.locator('thead th').nth(1)).toHaveText('Denominazione · ISIN');

  const righe = registro.locator('tbody tr');
  await expect(righe).toHaveCount(CARICHI.length + 1);

  // Ogni iscrizione — i due carichi e lo scarico — porta la propria cella
  // completa: nessun raggruppamento per ISIN, nessuna riga muta.
  await expect(righe.locator('strong', { hasText: DENOMINAZIONE })).toHaveCount(CARICHI.length + 1);
  await expect(righe.locator('small', { hasText: ISIN })).toHaveCount(CARICHI.length + 1);

  // E l'ordine cronologico resta quello del registro: i due carichi, poi lo scarico.
  await expect(righe.nth(0)).toContainText('Carico');
  await expect(righe.nth(1)).toContainText('Carico');
  await expect(righe.nth(2)).toContainText('Scarico');

  // Pausa finale: il registro con le tre iscrizioni denominate resta nel
  // fotogramma registrato, invece di essere spazzato via dal teardown.
  await page.waitForTimeout(1500);
});
