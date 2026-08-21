/**
 * US-065: il conteggio dei rilevamenti e la coda di aggiornamento contano solo
 * le posizioni aperte — scenario demo.
 *
 * Riproduce il campo `Dimostra` della spec, parola per parola: «Dopo
 * l'implementazione di questa spec, in un portafoglio con 4 posizioni aperte
 * (tutte allineate) e 2 posizioni chiuse mai più rilevate dopo la vendita, il
 * riepilogo dichiara "tutti i titoli sono allineati" su un totale di 4 e il
 * pulsante è inattivo; avviando comunque un aggiornamento in un portafoglio
 * con posizioni aperte obsolete, i 2 ISIN venduti non vengono mai interrogati
 * alla fonte.»
 *
 * Due portafogli, per lo stesso motivo di `US-035__aggiorna-obsoleti.spec.ts`:
 * il primo mostra il conteggio a riposo, il secondo la corsa di aggiornamento
 * davvero avviata. Gli stessi due ISIN venduti compaiono in entrambi — chiusi
 * da una vendita totale in ciascuno — perché è la loro *assenza* dalla coda
 * (nel primo portafoglio) e dalle richieste alla fonte (nel secondo) a essere
 * il fatto sotto dimostrazione.
 *
 * **Come si resta fuori dalla rete reale.** `**\/api\/securities\/**` è
 * intercettata con `route.fulfill()`: il server non contatta né Borsa Italiana
 * né MorningStar. Il gestore di rotta semina in archivio il prezzo aggiornato
 * un istante prima di rispondere — il pattern già collaudato in
 * `US-035__aggiorna-obsoleti.spec.ts`.
 *
 * Titoli seminati: `TITOLI_US_065_DEMO_APERTI`, `TITOLI_US_065_DEMO_CHIUSI` e
 * `TITOLI_US_065_DEMO_OBSOLETI`, riservati a questo file (regola
 * un-ISIN-per-file in `e2e/support/titoli.ts`).
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-065/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi il file resta un unico scenario,
 * come già fanno `US-034__rilevamento-obsoleto.spec.ts` e
 * `US-035__aggiorna-obsoleti.spec.ts`.
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import {
  TITOLI_US_065_DEMO_APERTI,
  TITOLI_US_065_DEMO_CHIUSI,
  TITOLI_US_065_DEMO_OBSOLETI,
} from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

/**
 * Il budget predefinito è 30s e qui non basta: slowMo, la corsa di
 * aggiornamento con ritardo simulato e le pause che rendono leggibile il
 * video lo consumano — stesso motivo per cui
 * `US-035__aggiorna-obsoleti.spec.ts` alza il proprio.
 */
test.setTimeout(120_000);

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`, non dentro il test.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-065/demo-conteggio-solo-posizioni-aperte.webm');
});

const ISIN_APERTI = TITOLI_US_065_DEMO_APERTI.map((t) => t.isin);
const ISIN_CHIUSI = TITOLI_US_065_DEMO_CHIUSI.map((t) => t.isin);
const ISIN_OBSOLETI = TITOLI_US_065_DEMO_OBSOLETI.map((t) => t.isin);

/**
 * Quattordici giorni indietro **da adesso**: contengono sempre almeno una
 * sessione di borsa conclusa, a qualunque ora e in qualunque giorno la suite
 * giri (stesso argomento di `RILEVATO_IL` in `US-034__rilevamento-obsoleto.spec.ts`
 * e `US-035__aggiorna-obsoleti.spec.ts`).
 */
const RILEVATO_IL = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);

/** Quantità a carico dei quattro titoli aperti del primo portafoglio. */
const QUANTITA_APERTI: Record<string, number> = {
  [ISIN_APERTI[0]]: 12,
  [ISIN_APERTI[1]]: 8,
  [ISIN_APERTI[2]]: 20,
  [ISIN_APERTI[3]]: 15,
};

/** Quantità caricata e poi interamente venduta, per ciascuno dei due ISIN chiusi. */
const QUANTITA_CHIUSI: Record<string, number> = {
  [ISIN_CHIUSI[0]]: 25,
  [ISIN_CHIUSI[1]]: 30,
};

/** Quantità a carico dei due titoli aperti e obsoleti del secondo portafoglio. */
const QUANTITA_OBSOLETI: Record<string, number> = {
  [ISIN_OBSOLETI[0]]: 18,
  [ISIN_OBSOLETI[1]]: 22,
};

/** Il prezzo che la fonte «restituisce» a ciascun titolo obsoleto aggiornato. */
const PREZZO_NUOVO: Record<string, number> = {
  [ISIN_OBSOLETI[0]]: 6.9,
  [ISIN_OBSOLETI[1]]: 121.5,
};

/** Il ritardo simulato della fonte: abbastanza da rendere osservabile ogni passo. */
const RITARDO_FONTE_MS = 900;

test('demo: il conteggio e la coda di aggiornamento ignorano le posizioni chiuse', async ({
  page,
  archivio,
}) => {
  // ─── Premessa del primo portafoglio: 4 aperte allineate, 2 chiuse ─────────
  const primoConto = await archivio.creaPortafoglio('Demo Conteggio Solo Aperte');

  for (const titolo of TITOLI_US_065_DEMO_APERTI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi });
  }
  for (const titolo of TITOLI_US_065_DEMO_CHIUSI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi, fetched_at: RILEVATO_IL });
  }

  for (const [isin, quantita] of Object.entries(QUANTITA_APERTI)) {
    await archivio.aggiungiPosizione(primoConto.id, isin, '2026-01-15', 20.0, quantita);
  }
  for (const [isin, quantita] of Object.entries(QUANTITA_CHIUSI)) {
    await archivio.aggiungiPosizione(primoConto.id, isin, '2025-05-01', 15.0, quantita);
    await registraVendita(primoConto.id, isin, '2026-02-20', 18.0, quantita);
  }

  // ─── 1. Il portafoglio si apre sulla scheda Riepilogo ─────────────────────
  await page.goto(`/portfolio/${primoConto.id}`);
  await expect(page.getByRole('heading', { name: primoConto.name })).toBeVisible({ timeout: 8000 });

  const tabella = page.getByTestId('tabella-riepilogo');
  await expect(tabella).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1000);

  // ─── 2. Il riquadro dichiara «tutti allineati» sul totale delle sole
  //         quattro posizioni aperte — mai sei ─────────────────────────────
  const conteggio = page.getByTestId('conteggio-da-aggiornare');
  await expect(conteggio).toBeVisible();
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    'Tutti i 4 titoli sono allineati all’ultima sessione di borsa.',
  );

  await page.waitForTimeout(1000);

  // ─── 3. Il comando è inattivo, con la ragione scritta accanto ─────────────
  const comando = page.getByTestId('btn-aggiorna-obsoleti');
  await expect(comando).toHaveText(/Aggiorna i titoli obsoleti \(0\)/);
  await expect(comando).toBeDisabled();
  await expect(page.getByTestId('motivo-comando-inattivo')).toBeVisible();

  await page.waitForTimeout(800);

  // ─── 4. I due ISIN venduti non compaiono più nella tabella dei posseduti,
  //         ma restano consultabili in «Posizioni chiuse» ───────────────────
  for (const isin of ISIN_CHIUSI) {
    await expect(page.getByTestId(`riepilogo-${isin}`)).toHaveCount(0);
  }
  const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
  await tabellaChiuse.scrollIntoViewIfNeeded();
  await expect(tabellaChiuse).toBeVisible();
  for (const isin of ISIN_CHIUSI) {
    await expect(page.getByTestId(`posizione-chiusa-${isin}`)).toBeVisible();
  }

  await page.waitForTimeout(1200);

  // ─── Premessa del secondo portafoglio: le stesse 2 chiuse, più 2 aperte
  //      obsolete su cui la corsa di aggiornamento viene davvero avviata ────
  const secondoConto = await archivio.creaPortafoglio('Demo Conteggio Coda Aggiornamento');

  for (const titolo of TITOLI_US_065_DEMO_OBSOLETI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi, fetched_at: RILEVATO_IL });
  }
  // Le stesse due chiavi, chiuse anche in questo secondo conto: è la loro
  // assenza dalle richieste alla fonte — non la loro assenza dal portafoglio —
  // il fatto che questa seconda parte della demo mette alla prova.
  for (const titolo of TITOLI_US_065_DEMO_CHIUSI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi, fetched_at: RILEVATO_IL });
  }

  for (const [isin, quantita] of Object.entries(QUANTITA_OBSOLETI)) {
    await archivio.aggiungiPosizione(secondoConto.id, isin, '2026-01-15', 20.0, quantita);
  }
  for (const [isin, quantita] of Object.entries(QUANTITA_CHIUSI)) {
    await archivio.aggiungiPosizione(secondoConto.id, isin, '2025-05-01', 15.0, quantita);
    await registraVendita(secondoConto.id, isin, '2026-02-20', 18.0, quantita);
  }

  // ─── 5. Navigazione dentro l'applicazione fino al secondo conto ───────────
  await page.getByRole('link', { name: /Portafogli/ }).first().click();
  await page.locator('tr.cliccabile', { hasText: secondoConto.name }).click();
  await expect(page.getByRole('heading', { name: secondoConto.name })).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    '2 titoli su 2 con rilevamento obsoleto.',
  );

  await page.waitForTimeout(1000);

  // ─── 6. Lo stub: nessuna fonte reale, e si registra ogni ISIN richiesto ───
  const isinRichiesti: string[] = [];
  await page.route('**/api/securities/**', async (route) => {
    const isin = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    isinRichiesti.push(isin);
    await new Promise((risolvi) => setTimeout(risolvi, RITARDO_FONTE_MS));

    const titolo = TITOLI_US_065_DEMO_OBSOLETI.find((t) => t.isin === isin)!;
    const istante = Math.floor(Date.now() / 1000);
    archivio.seminaTitolo(isin, {
      ...titolo.campi,
      price: PREZZO_NUOVO[isin],
      data_source: 'borsaitaliana',
      fetched_at: istante,
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        security: { isin, name: titolo.campi.name, price: PREZZO_NUOVO[isin] },
        fromCache: false,
        lastFetchedAt: istante,
        dataSource: 'borsaitaliana',
      }),
    });
  });

  // ─── 7. Il lavoro parte: due soli titoli in coda, mai gli ISIN chiusi ─────
  const comandoSecondo = page.getByTestId('btn-aggiorna-obsoleti');
  await expect(comandoSecondo).toHaveText(/Aggiorna i titoli obsoleti \(2\)/);
  await comandoSecondo.click();

  const riga = page.getByTestId('riga-lavoro');
  await expect(riga).toBeVisible();
  await expect(page.getByTestId('avanzamento-lavoro')).toContainText('1 di 2');

  await page.waitForTimeout(1000);

  // ─── 8. Il consuntivo: entrambi aggiornati, e mai un ISIN chiuso chiesto ──
  const consuntivo = page.getByTestId('consuntivo-aggiornamento');
  await expect(consuntivo).toBeVisible({ timeout: 15_000 });
  await expect(consuntivo).toContainText('Lavoro concluso');
  await expect(consuntivo).toContainText('Aggiornati 2 titoli su 2.');

  expect(isinRichiesti.sort()).toEqual([...ISIN_OBSOLETI].sort());
  expect(isinRichiesti).not.toContain(ISIN_CHIUSI[0]);
  expect(isinRichiesti).not.toContain(ISIN_CHIUSI[1]);

  await page.waitForTimeout(1000);

  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    'Tutti i 2 titoli sono allineati all’ultima sessione di borsa.',
  );

  // Pausa finale: il consuntivo resta visibile nel video.
  await page.waitForTimeout(1500);
});
