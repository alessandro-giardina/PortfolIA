/**
 * US-030 — le varianti dell'aggiornamento dalla scheda titolo.
 *
 * Il file fratello `US-030__aggiorna-dati-titolo.spec.ts` registra il video del
 * percorso principale; qui vivono i rami che un video renderebbe solo confuso:
 * l'esito negativo, la fonte non registrata e la guardia condivisa con la
 * Ricerca titoli. Nessuno di questi test registra artefatti.
 *
 * Tutti gli scenari condividono TITOLO_US_030_VARIANTI, l'ISIN riservato a
 * questo file: girano in serie dentro lo stesso file (`fullyParallel: false`
 * serializza dentro il file), quindi lo stack di semina-e-ripristino resta
 * consistente.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_030_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_030_VARIANTI.isin;

/** Dieci giorni: fra la rilevazione e ora è passata almeno una sessione di borsa. */
const DIECI_GIORNI_FA = Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60;

test('quando nessuna fonte risponde, la scheda dichiara l’esito negativo e l’archivio resta invariato', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Aggiorna Esito Negativo');
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_030_VARIANTI.campi, fetched_at: DIECI_GIORNI_FA });
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2025-04-18', 25.0, 100);

  const primaDellAggiornamento = archivio.leggiTitolo(ISIN);

  await page.goto(`/portfolio/${portfolioId}`);
  await page.getByTestId(`riepilogo-${ISIN}`).click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  const fonte = page.getByTestId('fonte-dato');
  const istantePrecedente = await page.getByTestId('istante-rilevazione').textContent();

  // Nessuna delle due fonti risponde: il server risponderebbe 502, e lo stub lo
  // riproduce senza contattare la rete.
  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Impossibile contattare la fonte ufficiale al momento.' }),
    });
  });

  await page.getByTestId('btn-aggiorna-dati').click();

  const esito = page.getByTestId('esito-aggiornamento');
  await expect(esito).toBeVisible();
  await expect(esito).toContainText('Aggiornamento non riuscito');

  // Fonte e istante sono ancora i precedenti: l'archivio non è stato riscritto,
  // e la scheda non finge il contrario.
  await expect(fonte.locator('.timbro-fonte')).toHaveText('Fonte primaria');
  await expect(page.getByTestId('istante-rilevazione')).toHaveText(istantePrecedente ?? '');

  // E l'archivio lo conferma riga per riga.
  expect(archivio.leggiTitolo(ISIN)).toEqual(primaDellAggiornamento);
});

test('senza fonte registrata la scheda offre comunque il comando, e dopo il recupero dichiara la fonte primaria', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Aggiorna Fonte Ignota');
  // Cache miss garantito: nessuna anagrafica, nessuna provenienza.
  archivio.rimuoviTitolo(ISIN);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2025-04-18', 25.0, 100);

  await page.goto(`/portfolio/${portfolioId}`);
  await page.getByTestId(`riepilogo-${ISIN}`).click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  const fonte = page.getByTestId('fonte-dato');
  await expect(fonte.locator('.timbro-fonte')).toHaveText('Fonte non registrata');

  // Il comando c'è lo stesso, ma cambia verbo: non c'è nulla da rinfrescare.
  const comando = page.getByTestId('btn-aggiorna-dati');
  await expect(comando).toHaveText(/Recupera dati/);

  // Il recupero riesce sulla fonte primaria, e la riga d'archivio viene scritta
  // come il server farebbe: solo la risposta del lookup è servita dallo stub.
  const istante = Math.floor(Date.now() / 1000);
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_030_VARIANTI.campi, fetched_at: istante });

  await page.route(
    '**/api/securities/**',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          security: {
            isin: ISIN,
            name: TITOLO_US_030_VARIANTI.campi.name,
            price: TITOLO_US_030_VARIANTI.campi.price,
            ticker: TITOLO_US_030_VARIANTI.campi.ticker,
            instrumentType: TITOLO_US_030_VARIANTI.campi.instrument_type,
            totalAnnualFees: TITOLO_US_030_VARIANTI.campi.total_annual_fees,
            currency: TITOLO_US_030_VARIANTI.campi.currency,
            issuer: TITOLO_US_030_VARIANTI.campi.issuer,
            segment: TITOLO_US_030_VARIANTI.campi.segment,
            dividendPolicy: TITOLO_US_030_VARIANTI.campi.dividend_policy,
          },
          fromCache: false,
          lastFetchedAt: istante,
          dataSource: 'borsaitaliana',
        }),
      });
    },
    { times: 1 },
  );

  await comando.click();

  await expect(page.getByTestId('esito-aggiornamento')).toContainText('Dati aggiornati');
  await expect(fonte.locator('.timbro-fonte')).toHaveText('Fonte primaria');
  await expect(fonte).toContainText('Borsa Italiana');
  await expect(page.getByTestId('istante-rilevazione')).toBeVisible();
  // 27,86 × 100 = 2.786,00 — l'anagrafica appena compilata valorizza la posizione
  await expect(page.getByTestId('dettaglio-valore-attuale')).toHaveText('€ 2786,00');
});

test('una rilevazione appena registrata fa scattare la guardia al primo click sulla scheda', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Aggiorna Guardia');
  // Rilevazione di adesso: è ciò che lascia in archivio una ricerca appena
  // fatta dalla Ricerca titoli. La scheda legge la stessa riga.
  archivio.seminaTitolo(ISIN, TITOLO_US_030_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2025-04-18', 25.0, 100);

  await page.goto(`/portfolio/${portfolioId}`);
  await page.getByTestId(`riepilogo-${ISIN}`).click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  // Nessuno stub: la guardia che risponde è quella del server.
  await page.getByTestId('btn-aggiorna-dati').click();

  const avviso = page.getByTestId('avviso-conferma-aggiornamento');
  await expect(avviso).toBeVisible({ timeout: 8000 });
  await expect(avviso).toContainText('recupero informazioni di questo titolo');
  await expect(avviso.getByRole('button', { name: 'Procedi comunque' })).toBeVisible();

  // Annulla, e la scheda torna com'era. Procedere contatterebbe la fonte reale.
  await avviso.getByRole('button', { name: 'Annulla' }).click();
  await expect(avviso).toHaveCount(0);
  await expect(page.getByTestId('esito-aggiornamento')).toHaveCount(0);
});
