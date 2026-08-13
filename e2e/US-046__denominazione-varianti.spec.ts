/**
 * US-046: la denominazione del titolo nelle tabelle di «Carico titoli» — casi limite.
 *
 * Due premesse che il video dimostrativo non può mostrare, e che sono
 * esattamente i due criteri meno ovvi della spec:
 *
 * - **senza anagrafica la cella non si scusa.** Mostra il solo ISIN: nessuna
 *   etichetta sostitutiva, nessun trattino. Il trattino, altrove nelle stesse
 *   tabelle, significa «questa misura non esiste» — qui affermerebbe il falso,
 *   perché l'ISIN esiste eccome;
 * - **la denominazione non costa una richiesta.** È letta da `positions/enriched`,
 *   che la scheda carica già all'apertura del portafoglio: passare a «Carico
 *   titoli» non deve interrogare né `/api/securities/` né rileggere la vista
 *   arricchita.
 *
 * Chiavi riservate a questo file (regola un-ISIN-per-file in
 * e2e/support/titoli.ts): `ISIN_SENZA_ANAGRAFICA_US_046`, che il primo scenario
 * *rimuove* dalla cache, e `TITOLO_US_046_VARIANTI`, che il secondo semina.
 */
import { test, expect } from './support/fixtures.js';
import { ISIN_SENZA_ANAGRAFICA_US_046, TITOLO_US_046_VARIANTI } from './support/titoli.js';

const ISIN_IGNOTO = ISIN_SENZA_ANAGRAFICA_US_046.isin;
const ISIN_NOTO = TITOLO_US_046_VARIANTI.isin;
const DENOMINAZIONE = TITOLO_US_046_VARIANTI.campi.name as string;

/** Un carico qualsiasi: serve solo a far esistere le due righe in tabella. */
const CARICO = { data: '2025-03-14', prezzo: 20.5, quantita: 300 };

test('senza anagrafica in archivio le due tabelle mostrano il solo ISIN, senza etichette sostitutive', async ({
  page,
  archivio,
}) => {
  // La premessa è costruita, non ereditata: `rimuoviTitolo` garantisce l'assenza
  // di anagrafica che lo scenario deve dimostrare, e la fixture ripristina la
  // riga precedente in teardown.
  archivio.rimuoviTitolo(ISIN_IGNOTO);

  const portafoglio = await archivio.creaPortafoglio('US046-Senza-Anagrafica');
  await archivio.aggiungiPosizione(
    portafoglio.id,
    ISIN_IGNOTO,
    CARICO.data,
    CARICO.prezzo,
    CARICO.quantita,
  );

  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();

  // ─── «Titoli iscritti a conto» ────────────────────────────────────────────
  const rigaAggregata = page.getByTestId(`summary-${ISIN_IGNOTO}`);
  await expect(rigaAggregata).toBeVisible({ timeout: 8000 });

  const cellaAggregata = rigaAggregata.locator('td').first();
  await expect(cellaAggregata).toHaveText(ISIN_IGNOTO);
  // Nessuna denominazione in grassetto: non c'è nulla da mettere in evidenza.
  await expect(cellaAggregata.locator('strong')).toHaveCount(0);

  // ─── «Registro delle iscrizioni» ──────────────────────────────────────────
  const registro = page.getByTestId('tabella-registro-carichi');
  await expect(registro).toBeVisible();

  const cellaRegistro = registro.locator('tbody tr').first().locator('td').nth(1);
  await expect(cellaRegistro).toHaveText(ISIN_IGNOTO);
  await expect(cellaRegistro.locator('strong')).toHaveCount(0);
});

test('la denominazione in Carico titoli non genera alcuna richiesta in più', async ({
  page,
  archivio,
}) => {
  // `seminaTitolo` timbra `fetched_at` ad adesso: senza, la riga risulterebbe
  // scaduta e la scheda ricontatterebbe la fonte reale — il conteggio
  // misurerebbe quella, non ciò che questo scenario vuole dimostrare.
  archivio.seminaTitolo(ISIN_NOTO, TITOLO_US_046_VARIANTI.campi);

  const portafoglio = await archivio.creaPortafoglio('US046-Nessuna-Richiesta');
  await archivio.aggiungiPosizione(
    portafoglio.id,
    ISIN_NOTO,
    CARICO.data,
    CARICO.prezzo,
    CARICO.quantita,
  );

  let chiamateAnagrafica = 0;
  let lettureArricchite = 0;
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/securities/')) chiamateAnagrafica += 1;
    if (url.includes('/positions/enriched')) lettureArricchite += 1;
  });

  await page.goto(`/portfolio/${portafoglio.id}`);

  // Si attende che il Riepilogo abbia finito di caricare: solo allora il conteggio
  // di partenza è stabile, e ciò che si misura dopo è davvero l'effetto del
  // passaggio di scheda e non una lettura d'apertura ancora in volo.
  const rigaRiepilogo = page.getByTestId(`riepilogo-${ISIN_NOTO}`);
  await expect(rigaRiepilogo).toBeVisible({ timeout: 8000 });
  await expect(rigaRiepilogo.locator('strong')).toHaveText(DENOMINAZIONE);
  await page.waitForLoadState('networkidle');

  const lettureAllApertura = lettureArricchite;

  // ─── Il passaggio a «Carico titoli»: nessuna richiesta nuova ──────────────
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();

  const rigaAggregata = page.getByTestId(`summary-${ISIN_NOTO}`);
  await expect(rigaAggregata).toBeVisible();
  await expect(rigaAggregata.locator('strong')).toHaveText(DENOMINAZIONE);
  await expect(
    page.getByTestId('tabella-registro-carichi').locator('tbody tr').first().locator('strong'),
  ).toHaveText(DENOMINAZIONE);
  await page.waitForLoadState('networkidle');

  expect(lettureArricchite).toBe(lettureAllApertura);
  // L'anagrafica non è mai interrogata per titolo: né all'apertura né qui. Le due
  // tabelle leggono il nome dalla vista arricchita, che il server risolve con una
  // sola join.
  expect(chiamateAnagrafica).toBe(0);
});
