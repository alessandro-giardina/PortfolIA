/**
 * US-035 — le varianti dell'aggiornamento in blocco.
 *
 * Il file fratello `US-035__aggiorna-obsoleti.spec.ts` registra il video della
 * corsa completa; qui vivono i rami che un video renderebbe solo confuso: le due
 * interruzioni, il comando inattivo a N = 0, la guardia che risponde
 * dall'archivio e il doppio avvio. Nessuno di questi test registra artefatti.
 *
 * Tutti gli scenari condividono gli ISIN riservati a questo file e girano in
 * serie dentro di esso (`fullyParallel: false` serializza dentro il file),
 * quindi la pila di semina-e-ripristino resta consistente.
 *
 * Nessuno scenario contatta la rete reale: quattro intercettano
 * `**\/api\/securities\/**` con `route.fulfill()`, e il quinto — quello della
 * guardia — la lascia passare proprio perché la guardia risponde dall'archivio
 * senza interrogare alcuna fonte.
 */
import type { Page } from '@playwright/test';
import { test, expect, type GestoreArchivio } from './support/fixtures.js';
import type { Portafoglio } from './support/api.js';
import {
  ISIN_GUARDIA_US_035,
  TITOLI_US_035_VARIANTI,
  TITOLO_US_035_VARIANTI_FRESCO,
} from './support/titoli.js';

const ISIN_OBSOLETI = TITOLI_US_035_VARIANTI.map((t) => t.isin);
const ISIN_FRESCO = TITOLO_US_035_VARIANTI_FRESCO.isin;

/** Quattordici giorni indietro da adesso: contengono sempre una sessione conclusa. */
const RILEVATO_IL = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);

/** Quantità a carico, una per ISIN. */
const QUANTITA: Record<string, number> = {
  [ISIN_OBSOLETI[0]]: 10,
  [ISIN_OBSOLETI[1]]: 20,
  [ISIN_OBSOLETI[2]]: 30,
};

/**
 * L'ordine in cui il ciclo interrogherà i titoli, letto dalla tabella invece che
 * presunto: la lista congelata al clic è quella delle posizioni in vista, e
 * leggerne l'ordine dal DOM tiene le asserzioni esatte senza legarle a come il
 * server ordina le righe.
 */
async function ordineDiLavoro(page: Page): Promise<string[]> {
  const inTabella = await page
    .locator('[data-testid^="riepilogo-"]')
    .evaluateAll((righe) =>
      righe.map((riga) => riga.getAttribute('data-testid')!.replace('riepilogo-', '')),
    );
  return inTabella.filter((isin) => ISIN_OBSOLETI.includes(isin));
}

/** Prepara un portafoglio con i tre titoli obsoleti già iscritti. */
async function portafoglioConObsoleti(
  archivio: GestoreArchivio,
  prefisso: string,
): Promise<Portafoglio> {
  const portafoglio = await archivio.creaPortafoglio(prefisso);
  for (const titolo of TITOLI_US_035_VARIANTI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi, fetched_at: RILEVATO_IL });
  }
  for (const isin of ISIN_OBSOLETI) {
    await archivio.aggiungiPosizione(portafoglio.id, isin, '2026-02-10', 20.0, QUANTITA[isin]);
  }
  return portafoglio;
}

test('lasciando il portafoglio il lavoro si ferma, e nessuna risposta scrive sulla vista del nuovo conto', async ({
  page,
  archivio,
}) => {
  const conto = await portafoglioConObsoleti(archivio, 'Aggiorna Cambio Conto');
  const altroConto = await archivio.creaPortafoglio('Aggiorna Altro Conto');
  archivio.seminaTitolo(ISIN_FRESCO, { ...TITOLO_US_035_VARIANTI_FRESCO.campi });
  await archivio.aggiungiPosizione(altroConto.id, ISIN_FRESCO, '2026-03-01', 40.0, 12);

  await page.goto(`/portfolio/${conto.id}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });
  const ordine = await ordineDiLavoro(page);
  expect(ordine).toHaveLength(3);

  const isinRichiesti: string[] = [];
  const PREZZO_NUOVO = 99.99;

  await page.route('**/api/securities/**', async (route) => {
    const isin = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    isinRichiesti.push(isin);
    await new Promise((risolvi) => setTimeout(risolvi, 1200));

    // Solo il primo titolo viene davvero rilevato: gli altri non riscrivono
    // l'archivio, così ciò che resta obsoleto al rientro è esattamente ciò che
    // il lavoro non ha concluso.
    if (isin !== ordine[0]) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Titolo non trovato.' }),
      });
      return;
    }
    const titolo = TITOLI_US_035_VARIANTI.find((t) => t.isin === isin)!;
    archivio.seminaTitolo(isin, {
      ...titolo.campi,
      price: PREZZO_NUOVO,
      fetched_at: Math.floor(Date.now() / 1000),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        security: { isin, name: titolo.campi.name, price: PREZZO_NUOVO },
        fromCache: false,
        lastFetchedAt: Math.floor(Date.now() / 1000),
        dataSource: 'borsaitaliana',
      }),
    });
  });

  await page.getByTestId('btn-aggiorna-obsoleti').click();
  // Il primo titolo è concluso: la corsa è al secondo, la cui richiesta è in volo.
  await expect(page.getByTestId('avanzamento-lavoro')).toContainText('2 di 3', { timeout: 15_000 });

  // Navigazione dentro l'applicazione, non un ricaricamento: il contesto
  // JavaScript sopravvive, ed è lì che il presidio deve reggere.
  await page.getByRole('link', { name: /Portafogli/ }).first().click();
  await page.locator('tr.cliccabile', { hasText: altroConto.name }).click();
  await expect(page.getByRole('heading', { name: altroConto.name })).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  // Il tempo perché una terza richiesta sarebbe partita, se il lavoro fosse
  // proseguito, e perché la risposta del secondo titolo sia arrivata.
  await page.waitForTimeout(3000);

  // Nessun residuo del lavoro abbandonato sulla vista del nuovo conto: né la
  // riga di avanzamento, né il consuntivo, né la marcatura «in aggiornamento»
  // su una riga di tabella — che due conti contengano lo stesso titolo è la
  // norma, non l'eccezione.
  await expect(page.getByTestId('riga-lavoro')).toHaveCount(0);
  await expect(page.getByTestId('consuntivo-aggiornamento')).toHaveCount(0);
  await expect(page.locator('.marca-rilevamento.in-lavorazione')).toHaveCount(0);
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    'L’unico titolo è allineato all’ultima sessione di borsa.',
  );

  // Il terzo titolo non è mai stato chiesto: il lavoro si è fermato.
  expect(isinRichiesti).toEqual([ordine[0], ordine[1]]);

  // Rientrando nel primo conto: il titolo rilevato conserva il valore appena
  // letto, e il conteggio dice quanto resta — senza confrontare le date a mano.
  await page.getByRole('link', { name: /Portafogli/ }).first().click();
  await page.locator('tr.cliccabile', { hasText: conto.name }).click();
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId(`prezzo-attuale-${ordine[0]}`)).toHaveText(PREZZO_NUOVO.toFixed(4));
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    '2 titoli su 3 con rilevamento obsoleto.',
  );
});

test('l’interruzione richiesta si dichiara subito, conclude il titolo in corso e distingue i non interrogati', async ({
  page,
  archivio,
}) => {
  const conto = await portafoglioConObsoleti(archivio, 'Aggiorna Interruzione');

  await page.goto(`/portfolio/${conto.id}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });
  const ordine = await ordineDiLavoro(page);

  const isinRichiesti: string[] = [];
  await page.route('**/api/securities/**', async (route) => {
    const isin = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    isinRichiesti.push(isin);
    await new Promise((risolvi) => setTimeout(risolvi, 1500));
    const titolo = TITOLI_US_035_VARIANTI.find((t) => t.isin === isin)!;
    archivio.seminaTitolo(isin, { ...titolo.campi, fetched_at: Math.floor(Date.now() / 1000) });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        security: { isin, name: titolo.campi.name, price: titolo.campi.price },
        fromCache: false,
        lastFetchedAt: Math.floor(Date.now() / 1000),
        dataSource: 'borsaitaliana',
      }),
    });
  });

  await page.getByTestId('btn-aggiorna-obsoleti').click();
  const riga = page.getByTestId('riga-lavoro');
  await expect(riga).toContainText('1 di 3');

  const interrompi = page.getByTestId('btn-interrompi-aggiornamento');
  await interrompi.click();

  // L'interruzione è dichiarata subito, prima che la risposta in volo arrivi:
  // l'attesa non deve sembrare un comando ignorato.
  await expect(riga).toContainText('Interruzione richiesta');
  await expect(riga).toContainText(`Attendo la risposta di ${ordine[0]}`);
  await expect(interrompi).toBeDisabled();

  // Il titolo in corso arriva a conclusione e il suo esito viene registrato.
  const consuntivo = page.getByTestId('consuntivo-aggiornamento');
  await expect(consuntivo).toBeVisible({ timeout: 15_000 });
  await expect(consuntivo).toContainText('Lavoro interrotto');
  await expect(consuntivo).toContainText('Aggiornati 1 titolo su 3.');
  await expect(consuntivo).toContainText('2 non sono stati interrogati.');

  for (const isin of [ordine[1], ordine[2]]) {
    await expect(page.getByTestId(`esito-${isin}`)).toContainText(
      'non interrogato: il lavoro è stato interrotto prima del suo turno',
    );
  }

  // Una sola fonte è stata interrogata: i titoli mai chiesti non hanno consumato
  // un tentativo, ed è esattamente la distinzione che il consuntivo dichiara.
  expect(isinRichiesti).toEqual([ordine[0]]);

  // Il conteggio riflette quanto è stato completato.
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    '2 titoli su 3 con rilevamento obsoleto.',
  );
});

test('a N = 0 il comando resta a schermo, inattivo, e ne dichiara la ragione', async ({
  page,
  archivio,
}) => {
  const conto = await archivio.creaPortafoglio('Aggiorna Nulla Da Fare');
  archivio.seminaTitolo(ISIN_FRESCO, { ...TITOLO_US_035_VARIANTI_FRESCO.campi });
  await archivio.aggiungiPosizione(conto.id, ISIN_FRESCO, '2026-03-01', 40.0, 12);

  const isinRichiesti: string[] = [];
  await page.route('**/api/securities/**', async (route) => {
    isinRichiesti.push(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    await route.fulfill({ status: 502, contentType: 'application/json', body: '{}' });
  });

  await page.goto(`/portfolio/${conto.id}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  const comando = page.getByTestId('btn-aggiorna-obsoleti');
  await expect(comando).toBeVisible();
  await expect(comando).toHaveText(/Aggiorna i titoli obsoleti \(0\)/);
  await expect(comando).toBeDisabled();
  await expect(page.getByTestId('motivo-comando-inattivo')).toHaveText(
    'Nessun titolo da aggiornare: ogni rilevamento è già allineato all’ultima sessione di borsa.',
  );

  // Premerlo non avvia nulla: il `disabled` è la difesa visibile, e nessuna
  // richiesta parte comunque.
  await comando.click({ force: true });
  await page.waitForTimeout(800);
  await expect(page.getByTestId('riga-lavoro')).toHaveCount(0);
  expect(isinRichiesti).toEqual([]);
});

test('quando la guardia risponde dall’archivio il titolo è registrato come non aggiornato, senza forzare il recupero', async ({
  page,
  archivio,
}) => {
  const conto = await archivio.creaPortafoglio('Aggiorna Guardia Blocco');
  // La crepa dichiarata: riga in cache recentissima e prezzo nullo. Il riepilogo
  // la classifica «mai rilevato» e la mette in lista; la guardia, che guarda solo
  // `fetched_at`, risponde dall'archivio senza contattare la fonte.
  archivio.seminaTitolo(ISIN_GUARDIA_US_035.isin, {
    name: 'Ishares Msci Europe Sri Ucits Etf',
    price: null,
    fetched_at: Math.floor(Date.now() / 1000),
  });
  await archivio.aggiungiPosizione(conto.id, ISIN_GUARDIA_US_035.isin, '2026-03-01', 30.0, 10);

  // Passaggio in chiaro, non intercettazione: la guardia che risponde è quella
  // del server. Serve solo a registrare che cosa è stato chiesto.
  const urlRichiesti: string[] = [];
  await page.route('**/api/securities/**', async (route) => {
    urlRichiesti.push(route.request().url());
    await route.continue();
  });

  await page.goto(`/portfolio/${conto.id}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('frase-conteggio')).toHaveText('1 titolo su 1 mai rilevato.');

  await page.getByTestId('btn-aggiorna-obsoleti').click();

  const consuntivo = page.getByTestId('consuntivo-aggiornamento');
  await expect(consuntivo).toBeVisible({ timeout: 15_000 });
  await expect(consuntivo).toContainText('Nessun titolo aggiornato');
  await expect(consuntivo).toContainText('Aggiornati 0 titoli su 1.');
  await expect(page.getByTestId(`esito-${ISIN_GUARDIA_US_035.isin}`)).toContainText(
    'l’archivio ha risposto senza contattare la fonte',
  );

  // Il criterio vieta di forzare il recupero oltre la guardia: nessuna richiesta
  // porta `force=true`, e una sola richiesta è partita.
  expect(urlRichiesti).toHaveLength(1);
  expect(urlRichiesti.some((url) => url.includes('force'))).toBe(false);

  // L'archivio è rimasto com'era: il prezzo non è stato inventato.
  expect(archivio.leggiTitolo(ISIN_GUARDIA_US_035.isin)?.price).toBeNull();
});

test('due clic ravvicinati non avviano due corse: nessun titolo è chiesto due volte', async ({
  page,
  archivio,
}) => {
  const conto = await portafoglioConObsoleti(archivio, 'Aggiorna Doppio Avvio');

  await page.goto(`/portfolio/${conto.id}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });
  const ordine = await ordineDiLavoro(page);

  const isinRichiesti: string[] = [];
  await page.route('**/api/securities/**', async (route) => {
    isinRichiesti.push(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    await new Promise((risolvi) => setTimeout(risolvi, 400));
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Titolo non trovato.' }),
    });
  });

  const comando = page.getByTestId('btn-aggiorna-obsoleti');
  // `force` salta il controllo di attivabilità: il secondo clic deve poter
  // arrivare *prima* che React abbia disegnato il bottone spento, che è
  // esattamente la corsa che la guardia su `useRef` presidia.
  await comando.dblclick({ force: true });
  await expect(comando).toBeDisabled();

  const consuntivo = page.getByTestId('consuntivo-aggiornamento');
  await expect(consuntivo).toBeVisible({ timeout: 20_000 });
  await expect(consuntivo).toContainText('Aggiornati 0 titoli su 3.');

  // Una corsa sola: ogni titolo chiesto una volta, nell'ordine della lista.
  expect(isinRichiesti).toEqual(ordine);
});
