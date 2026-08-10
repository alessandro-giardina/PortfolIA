/**
 * US-033: le sotto-etichette del modulo di carico su riga propria — scenario demo.
 *
 * Dove oggi si legge «QUANTITÀNUMERO INTERO DI QUOTE» — etichetta e nota fuse in
 * un'unica riga maiuscola — si deve leggere «QUANTITÀ» e, sotto, «numero intero
 * di quote» in minuscolo. Il test lo prova **misurando**, non guardando: per
 * ciascuna delle cinque righe confronta il rettangolo del nodo di testo
 * dell'etichetta con quello dello span della nota. Sullo stato precedente alla
 * spec i due erano affiancati sulla stessa banda verticale, quindi
 * `nota.top >= etichetta.bottom` falliva: è il criterio «un test che fallirebbe
 * oggi».
 *
 * Perché il percorso lungo. La riga «Nome titolo» esiste solo quando la pagina
 * riceve `prefill.name` dallo state del router, e quello state arriva unicamente
 * da /ricerca → «Aggiungi a portafoglio» → scelta del conto. Entrando diretti su
 * /portfolio/:id le righe sono quattro: per verificarne cinque, come chiede il
 * criterio, il percorso di precompilazione va percorso davvero.
 *
 * Nessun ISIN seminato: l'anagrafica è servita da `route.fulfill()`, quindi la
 * cache non viene toccata e non serve riservare una costante in support/titoli.ts.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-033/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi le varianti (clic per il fuoco, altri
 * moduli, soglie responsive) vivono in US-033__sotto-etichette-varianti.spec.ts,
 * senza video.
 */
import { test, expect } from './support/fixtures.js';
import { misuraRigheCarico } from './support/etichette.js';

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
  await page.video()?.saveAs('docs/test-results/US-033/demo-sotto-etichette.webm');
});

/**
 * ISIN valido (cifra di controllo compresa: il client rifiuta gli altri prima
 * ancora di chiamare il server) e mai seminato in cache da nessun file della
 * suite. L'anagrafica qui sotto è servita in rete, non scritta in archivio.
 */
const ISIN = 'IE00BKX55T58';

const ANAGRAFICA = {
  isin: ISIN,
  name: 'Vanguard Ftse Developed World Ucits Etf Usd Acc',
  price: 118.42,
  ticker: 'VHVG',
  instrumentType: 'ETF ARMONIZZATI',
  totalAnnualFees: '0,12%',
  currency: 'EUR',
  issuer: 'VANGUARD FUNDS PLC',
  segment: 'ETF Indicizzati',
  dividendPolicy: 'ad accumulazione',
};

/** Le cinque righe del modulo, nell'ordine in cui il form le rende. */
const RIGHE_ATTESE = [
  { campo: 'carico-nome', etichetta: 'Nome titolo', nota: 'da ricerca — sola lettura' },
  { campo: 'carico-isin', etichetta: 'ISIN', nota: '12 caratteri alfanumerici' },
  { campo: 'carico-data', etichetta: 'Data di carico', nota: 'data di acquisto' },
  { campo: 'carico-prezzo', etichetta: 'Prezzo di acquisto', nota: 'per singola quota, in euro' },
  { campo: 'carico-quantita', etichetta: 'Quantità', nota: 'numero intero di quote' },
];

test('demo: ogni nota del modulo di carico si legge su riga propria sotto la sua etichetta', async ({
  page,
  archivio,
}) => {
  // L'anagrafica arriva dalla rete intercettata: nessuna scrittura in cache,
  // nessuna attesa della fonte reale.
  await page.route(`**/api/securities/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        security: ANAGRAFICA,
        fromCache: true,
        lastFetchedAt: Math.floor(Date.now() / 1000),
      }),
    });
  });

  const { id: portfolioId } = await archivio.creaPortafoglio('Sotto Etichette');

  // 1. L'utente cerca il titolo
  await page.goto('/ricerca');
  await page.fill('#isin', ISIN);
  await page.click('button[type="submit"]');

  // 2. …e lo manda a uno dei propri conti
  await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 15000 });
  await page.click('[data-testid="btn-aggiungi-portafoglio"]');

  await page.waitForSelector('[role="dialog"]');
  await page.click(`[data-testid="portafoglio-option-${portfolioId}"]`);
  await page.click('[data-testid="btn-conferma-dialog"]');

  // 3. Atterra sul dettaglio con il modulo di carico precompilato: è l'unico
  //    percorso che rende anche la riga «Nome titolo».
  await page.waitForURL(`**/portfolio/${portfolioId}`);
  await expect(page.getByTestId('input-isin')).toHaveValue(ISIN);
  await expect(page.getByTestId('input-nome-titolo')).toHaveValue(ANAGRAFICA.name);

  await page.waitForTimeout(1200);

  // 4. Le cinque righe, misurate una per una
  const righe = await misuraRigheCarico(page);
  expect(righe).toHaveLength(RIGHE_ATTESE.length);

  for (const [indice, atteso] of RIGHE_ATTESE.entries()) {
    const riga = righe[indice];

    // Le note sono quelle giuste, e stanno sulla riga giusta
    expect(riga.campo, `riga ${atteso.etichetta}: campo associato`).toBe(atteso.campo);
    expect(riga.etichetta, `riga ${atteso.etichetta}: testo dell'etichetta`).toBe(atteso.etichetta);
    expect(riga.nota, `riga ${atteso.etichetta}: testo della nota`).toBe(atteso.nota);

    // Geometria: la nota comincia dove l'etichetta ha finito, non accanto a lei.
    // È l'asserzione che falliva prima della spec, quando i due nodi erano flex
    // item affiancati sulla stessa banda verticale.
    expect(
      riga.rettNota.top,
      `riga ${atteso.etichetta}: la nota deve stare sotto l'etichetta`,
    ).toBeGreaterThanOrEqual(riga.rettEtichetta.bottom);

    // …e incolonnata a sinistra come l'etichetta, non rientrata
    expect(
      Math.abs(riga.rettNota.left - riga.rettEtichetta.left),
      `riga ${atteso.etichetta}: stessa incolonnatura a sinistra`,
    ).toBeLessThan(1);

    // Tipografia: minuscolo, corpo minore, colore attenuato — i tre segnali che
    // distinguono la nota dall'etichetta a colpo d'occhio.
    expect(riga.stile.textTransformNota, `riga ${atteso.etichetta}: minuscolo`).toBe('none');
    // `letter-spacing: 0` risolve in `0px`, `normal` resta `normal`: entrambi
    // valgono, purché la spaziatura ereditata (.08em) non sia più in vigore.
    expect(
      ['normal', '0px'],
      `riga ${atteso.etichetta}: spaziatura ereditata annullata`,
    ).toContain(riga.stile.letterSpacingNota);
    expect(riga.stile.corpoNota, `riga ${atteso.etichetta}: corpo minore`).toBeLessThan(
      riga.stile.corpoEtichetta,
    );
    expect(riga.stile.coloreNota, `riga ${atteso.etichetta}: colore attenuato`).not.toBe(
      riga.stile.coloreEtichetta,
    );
  }

  // Nota sull'associazione etichetta↔campo (terzo criterio): `riga.campo` è
  // letto da `label.control`, quindi il ciclo qui sopra ha già verificato il
  // legame strutturale di tutte e cinque le righe — inclusa «Nome titolo», che
  // essendo disabilitata non può riceverne la prova per via del fuoco. Il clic
  // reale sulle quattro righe abilitate è verificato nel file fratello.

  // Pausa finale: il modulo a due righe resta visibile nel video
  await page.waitForTimeout(2000);
});
