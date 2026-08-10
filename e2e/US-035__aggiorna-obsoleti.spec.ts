/**
 * US-035: un solo comando aggiorna tutti i titoli con rilevamento obsoleto —
 * scenario demo.
 *
 * Quattro titoli, tre dei quali rilevati in una sessione di borsa ormai chiusa.
 * Un clic su «Aggiorna i titoli obsoleti (3)» avvia il lavoro: la riga di stato
 * dichiara quale ISIN è in corso e a che punto è, la tabella e il valore totale
 * si riscrivono man mano, il titolo che nessuna fonte trova non ferma la corsa,
 * e al termine il consuntivo dice quanti sono stati aggiornati e quale no, con
 * la ragione. Il quarto titolo — rilevato adesso — non viene mai chiesto.
 *
 * **Come si resta fuori dalla rete reale.** `**\/api\/securities\/**` è
 * intercettata con `route.fulfill()`: il server non contatta né Borsa Italiana
 * né MorningStar. Perché il ricalcolo mostri davvero un prezzo nuovo, il gestore
 * di rotta **semina in archivio** il valore aggiornato un istante prima di
 * servire la risposta — è il pattern già collaudato in
 * `US-030__aggiorna-dati-titolo-varianti.spec.ts`: lo stub serve il lookup, la
 * semina scrive la riga che il server avrebbe scritto.
 *
 * **Come si misura la sequenzialità.** Il gestore tiene un contatore delle
 * richieste in volo e ne registra il massimo: a fine corsa deve essere 1. È il
 * criterio «in nessun istante due richieste alla stessa fonte sono in volo
 * insieme» reso eseguibile, senza ispezionare lo stato interno del componente.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-035/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi le varianti (interruzioni, N = 0,
 * guardia, doppio avvio) vivono in US-035__aggiorna-obsoleti-varianti.spec.ts,
 * senza video.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLI_US_035_OBSOLETI, TITOLO_US_035_FRESCO } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

/**
 * Il budget predefinito è 30s e qui non basta: slowMo, tre titoli con ritardo
 * simulato e le pause che rendono leggibile il video lo consumano. Il tetto si
 * alza nel solo file demo — nella configurazione condivisa allenterebbe la rete
 * di tutti gli altri scenari.
 */
test.setTimeout(120_000);

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano nella cartella della spec. `saveAs` attende
// la fine della registrazione, che avviene alla chiusura della pagina: va
// chiamato dopo `page.close()`, non dentro il test.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-035/demo-aggiorna-obsoleti.webm');
});

const ISIN_FRESCO = TITOLO_US_035_FRESCO.isin;
const ISIN_OBSOLETI = TITOLI_US_035_OBSOLETI.map((t) => t.isin);

/**
 * Quattordici giorni indietro **da adesso**: contengono sempre almeno una
 * sessione di borsa conclusa, a qualunque ora e in qualunque giorno la suite
 * giri. Una data assoluta sarebbe altrettanto obsoleta oggi, ma legherebbe il
 * test al momento in cui è stato scritto.
 */
const RILEVATO_IL = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);

/** Quantità a carico, una per ISIN: rendono distinguibile il contributo di ciascuno. */
const QUANTITA: Record<string, number> = {
  [ISIN_OBSOLETI[0]]: 40,
  [ISIN_OBSOLETI[1]]: 15,
  [ISIN_OBSOLETI[2]]: 60,
  [ISIN_FRESCO]: 25,
};

/** Il prezzo che la fonte «restituisce» al titolo aggiornato. */
const PREZZO_NUOVO: Record<string, number> = {
  [ISIN_OBSOLETI[0]]: 33.9,
  [ISIN_OBSOLETI[1]]: 149.2,
  [ISIN_OBSOLETI[2]]: 91.75,
};

/** Il ritardo simulato della fonte: abbastanza da rendere osservabile ogni passo. */
const RITARDO_FONTE_MS = 900;

/** Cifra con due decimali all'italiana, come la scrive il riquadro del totale. */
function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

test('demo: un comando aggiorna i titoli obsoleti, uno alla volta, e ne rende conto', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId, name: portfolioName } =
    await archivio.creaPortafoglio('Demo Aggiorna Obsoleti');

  // La premessa dello scenario va garantita, non ereditata: tre titoli rilevati
  // in una sessione ormai chiusa, uno rilevato adesso.
  for (const titolo of TITOLI_US_035_OBSOLETI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi, fetched_at: RILEVATO_IL });
  }
  archivio.seminaTitolo(ISIN_FRESCO, { ...TITOLO_US_035_FRESCO.campi });

  for (const [isin, quantita] of Object.entries(QUANTITA)) {
    await archivio.aggiungiPosizione(portfolioId, isin, '2026-02-10', 20.0, quantita);
  }

  // ─── 1. Il portafoglio si apre sulla scheda Riepilogo ─────────────────────
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

  const tabella = page.getByTestId('tabella-riepilogo');
  await expect(tabella).toBeVisible({ timeout: 8000 });

  // ─── 2. Il riquadro conta i titoli obsoleti e offre il comando ────────────
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    '3 titoli su 4 con rilevamento obsoleto.',
  );
  const comando = page.getByTestId('btn-aggiorna-obsoleti');
  await expect(comando).toHaveText(/Aggiorna i titoli obsoleti \(3\)/);
  await expect(comando).toBeEnabled();

  await page.waitForTimeout(1200);

  const prezzoIniziale = new Map(
    TITOLI_US_035_OBSOLETI.map((t) => [t.isin, t.campi.price!] as const),
  );
  const totaleIniziale =
    [...prezzoIniziale].reduce((s, [isin, p]) => s + p * QUANTITA[isin], 0) +
    TITOLO_US_035_FRESCO.campi.price! * QUANTITA[ISIN_FRESCO];
  await expect(page.getByTestId('valore-totale-portafoglio')).toContainText(importo(totaleIniziale));

  // ─── 3. L'ordine di lavoro si legge dalla tabella, non si presume ─────────
  // La lista che il ciclo congela al clic è quella delle posizioni in vista:
  // leggerne l'ordine dal DOM lascia le asserzioni esatte senza legarle a come
  // il server ordina le righe.
  const ordineInTabella = await page
    .locator('[data-testid^="riepilogo-"]')
    .evaluateAll((righe) =>
      righe.map((riga) => riga.getAttribute('data-testid')!.replace('riepilogo-', '')),
    );
  const ordineLavoro = ordineInTabella.filter((isin) => ISIN_OBSOLETI.includes(isin));
  expect(ordineLavoro).toHaveLength(3);

  /** Il titolo che nessuna fonte trova è il secondo: la corsa deve proseguire. */
  const isinNonTrovato = ordineLavoro[1];

  // ─── 4. Lo stub: nessuna fonte reale, un titolo alla volta, e si misura ───
  let inVolo = 0;
  let massimoInVolo = 0;
  const isinRichiesti: string[] = [];

  await page.route('**/api/securities/**', async (route) => {
    const isin = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    isinRichiesti.push(isin);
    inVolo += 1;
    massimoInVolo = Math.max(massimoInVolo, inVolo);

    await new Promise((risolvi) => setTimeout(risolvi, RITARDO_FONTE_MS));

    if (isin === isinNonTrovato) {
      inVolo -= 1;
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Titolo non trovato su nessuna fonte.' }),
      });
      return;
    }

    // La riga che il server avrebbe scritto: il prezzo nuovo e un rilevamento
    // di adesso. Senza, il ricalcolo che segue rileggerebbe il vecchio valore.
    const titolo = TITOLI_US_035_OBSOLETI.find((t) => t.isin === isin)!;
    const istante = Math.floor(Date.now() / 1000);
    archivio.seminaTitolo(isin, {
      ...titolo.campi,
      price: PREZZO_NUOVO[isin],
      data_source: 'borsaitaliana',
      fetched_at: istante,
    });

    inVolo -= 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        security: {
          isin,
          name: titolo.campi.name,
          price: PREZZO_NUOVO[isin],
          ticker: titolo.campi.ticker,
          instrumentType: titolo.campi.instrument_type,
          totalAnnualFees: titolo.campi.total_annual_fees,
          currency: titolo.campi.currency,
          issuer: titolo.campi.issuer,
          segment: titolo.campi.segment,
          dividendPolicy: titolo.campi.dividend_policy,
        },
        fromCache: false,
        lastFetchedAt: istante,
        dataSource: 'borsaitaliana',
      }),
    });
  });

  // ─── 5. Il lavoro parte: chi è in corso, a che punto siamo, quanto durerà ─
  await comando.click();

  const riga = page.getByTestId('riga-lavoro');
  await expect(riga).toBeVisible();
  const avanzamento = page.getByTestId('avanzamento-lavoro');
  await expect(avanzamento).toContainText(`Rilevamento di ${ordineLavoro[0]}`);
  await expect(avanzamento).toContainText('1 di 3');
  await expect(riga).toContainText('una decina di secondi');

  // Il comando non è avviabile due volte: dal primo clic in poi è spento.
  await expect(comando).toBeDisabled();

  // La riga interrogata in questo istante porta la terza variante della postilla.
  await expect(page.getByTestId(`marca-rilevamento-${ordineLavoro[0]}`)).toHaveText(
    'in aggiornamento',
  );

  // La tabella non è sparita sotto un «Caricamento titoli…»: il ricalcolo dopo
  // ogni titolo è silenzioso, e il criterio chiede che i valori si aggiornino,
  // non che scompaiano.
  await expect(tabella).toBeVisible();
  await expect(page.getByText('Caricamento titoli…')).toHaveCount(0);

  // ─── 6. Dopo il primo titolo la tabella e il totale sono già cambiati ─────
  await expect(avanzamento).toContainText('2 di 3', { timeout: 15_000 });
  await expect(page.getByTestId(`prezzo-attuale-${ordineLavoro[0]}`)).toHaveText(
    PREZZO_NUOVO[ordineLavoro[0]].toFixed(4),
  );
  const totaleDopoIlPrimo =
    totaleIniziale +
    (PREZZO_NUOVO[ordineLavoro[0]] - prezzoIniziale.get(ordineLavoro[0])!) * QUANTITA[ordineLavoro[0]];
  await expect(page.getByTestId('valore-totale-portafoglio')).toContainText(
    importo(totaleDopoIlPrimo),
  );
  await expect(tabella).toBeVisible();

  // ─── 7. Il titolo non trovato non interrompe il lavoro ────────────────────
  await expect(avanzamento).toContainText('3 di 3', { timeout: 15_000 });
  await expect(avanzamento).toContainText(`Rilevamento di ${ordineLavoro[2]}`);

  // ─── 8. Il consuntivo: quanti aggiornati, quali no, con la ragione ────────
  const consuntivo = page.getByTestId('consuntivo-aggiornamento');
  await expect(consuntivo).toBeVisible({ timeout: 15_000 });
  await expect(consuntivo).toContainText('Lavoro concluso');
  await expect(consuntivo).toContainText('Aggiornati 2 titoli su 3.');

  const nonAggiornato = page.getByTestId(`esito-${isinNonTrovato}`);
  await expect(nonAggiornato).toBeVisible();
  await expect(nonAggiornato).toContainText('nessuna fonte ha trovato il titolo');

  await page.waitForTimeout(1200);

  // ─── 9. Il conteggio è sceso, e le postille sono sparite dalle sole righe
  //        davvero rilevate: quella non trovata è ancora obsoleta ────────────
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    '1 titolo su 4 con rilevamento obsoleto.',
  );
  await expect(page.getByTestId(`marca-rilevamento-${ordineLavoro[0]}`)).toHaveCount(0);
  await expect(page.getByTestId(`marca-rilevamento-${ordineLavoro[2]}`)).toHaveCount(0);
  await expect(page.getByTestId(`marca-rilevamento-${isinNonTrovato}`)).toHaveText('da aggiornare');

  // ─── 10. Le cifre finali, riga per riga e in totale ───────────────────────
  await expect(page.getByTestId(`prezzo-attuale-${ordineLavoro[2]}`)).toHaveText(
    PREZZO_NUOVO[ordineLavoro[2]].toFixed(4),
  );
  const totaleFinale =
    totaleDopoIlPrimo +
    (PREZZO_NUOVO[ordineLavoro[2]] - prezzoIniziale.get(ordineLavoro[2])!) * QUANTITA[ordineLavoro[2]];
  await expect(page.getByTestId('valore-totale-portafoglio')).toContainText(importo(totaleFinale));

  // ─── 11. Ciò che non è mai accaduto conta quanto ciò che è accaduto ───────
  // Nessuna richiesta per il titolo rilevato nella sessione corrente, nessuna
  // richiesta forzata, e mai due richieste in volo insieme.
  expect(isinRichiesti).toEqual(ordineLavoro);
  expect(isinRichiesti).not.toContain(ISIN_FRESCO);
  expect(massimoInVolo).toBe(1);

  // Pausa finale: il consuntivo resta visibile nel video.
  await page.waitForTimeout(2000);
});
