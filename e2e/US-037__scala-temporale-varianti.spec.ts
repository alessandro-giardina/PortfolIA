/**
 * US-037: le varianti della scala temporale del grafico del titolo.
 *
 * Vivono in un file separato dallo scenario dimostrativo perché `launchOptions`
 * (slowMo) non è scopabile in un `describe`: Playwright lo consente solo a
 * livello di file. Qui i test girano a velocità piena e non producono video —
 * sono i casi limite, che nel filmato della spec sarebbero soltanto rumore.
 *
 * Tre premesse, ognuna un criterio di accettazione:
 *  - una finestra priva di dati dichiara «dato non disponibile» invece di
 *    mostrare un grafico vuoto, e nessun prezzo viene trascinato dentro
 *    (criterio 4 · ADR-003);
 *  - «tutto lo storico» è la scala attiva a ogni apertura di scheda, anche dopo
 *    averla cambiata su un altro titolo (criterio 2);
 *  - cambiare scala non chiede nulla al server: il ritaglio avviene sui dati che
 *    la pagina ha già (criterio 3).
 *
 * Titoli seminati: TITOLO_US_037_VARIANTI e TITOLO_US_037_SECONDO, entrambi
 * riservati a questo file. Il seme porta `fetched_at` di **adesso** (il default
 * di `seminaTitolo`), e nel primo scenario non è una comodità ma una premessa:
 * un recupero reale registrerebbe un'osservazione a oggi, che da sola
 * riempirebbe la finestra «ultimo mese» e smonterebbe in silenzio proprio il
 * caso che il criterio 4 mette alla prova.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_037_SECONDO, TITOLO_US_037_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_037_VARIANTI.isin;
const ISIN_SECONDO = TITOLO_US_037_SECONDO.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**: `Position.loadDate` è
 * una data civile che il grafico àncora a mezzanotte UTC, e comporla dai campi
 * locali la farebbe scivolare di un giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Apre la scheda di un titolo dal riepilogo del portafoglio. */
async function apriSchedaTitolo(page: Page, portfolioId: number, isin: string) {
  const riga = page.getByTestId(`riepilogo-${isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('grafico-titolo')).toBeVisible({ timeout: 8000 });
}

test('una finestra senza dati dichiara «dato non disponibile» invece di mostrare un grafico vuoto', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Finestra Vuota');
  archivio.seminaTitolo(ISIN, TITOLO_US_037_VARIANTI.campi);

  // Tutto l'archivio di questo titolo è anteriore all'ultimo mese: un carico di
  // 200 giorni fa e due rilevazioni fra i 150 e i 100. Il margine è largo perché
  // il confine non deve cadere vicino a un estremo.
  const CARICO = { giorniFa: 200, prezzo: 39.4, quantita: 60 };
  const RILEVAZIONI = [
    { giorniFa: 150, prezzo: 40.2 },
    { giorniFa: 100, prezzo: TITOLO_US_037_VARIANTI.campi.price! },
  ];

  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN,
    dataCivileIndietro(CARICO.giorniFa),
    CARICO.prezzo,
    CARICO.quantita,
  );

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(
    ISIN,
    RILEVAZIONI.map((rilevazione) => ({
      price: rilevazione.prezzo,
      observed_at: adesso - rilevazione.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    })),
  );

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, portfolioId, ISIN);

  const grafico = page.getByTestId('grafico-titolo');

  // Premessa dello scenario: su tutto lo storico i tre punti ci sono. Senza
  // questa asserzione, «zero punti nell'ultimo mese» sarebbe soddisfatto anche
  // da un archivio vuoto, e il test non proverebbe il ritaglio.
  await expect(grafico).toHaveAttribute('data-punti', '3');

  await page.getByTestId('scala-mese').click();

  // La finestra è vuota, e la pagina lo dichiara al posto del grafico
  await expect(grafico).toHaveAttribute('data-scala', 'mese');
  await expect(grafico).toHaveAttribute('data-copertura', 'assente');
  await expect(grafico).toHaveAttribute('data-punti', '0');

  const dichiarazione = page.getByTestId('dato-non-disponibile');
  await expect(dichiarazione).toBeVisible();
  await expect(dichiarazione).toContainText('Dato non disponibile');

  // Nomina l'intervallo richiesto…
  await expect(page.getByTestId('intervallo-richiesto')).toContainText('ultimo mese');
  await expect(page.getByTestId('intervallo-richiesto')).toContainText('giorni civili');

  // …e dice dove il dato esiste davvero: il punto d'archivio più recente, che
  // resta fuori dalla finestra
  const doveEsiste = page.getByTestId('dove-esiste');
  await expect(doveEsiste).toContainText('fuori da questa finestra');
  await expect(doveEsiste).toContainText(String(RILEVAZIONI[1].prezzo).replace('.', ','));

  // Nessun riquadro vuoto: né il tracciato né la sola riga del prezzo medio, che
  // dentro una cornice si leggerebbe comunque come un grafico
  await expect(grafico.locator('svg.tracciato')).toHaveCount(0);
  await expect(grafico.getByTestId('linea-prezzo-medio')).toHaveCount(0);
  await expect(page.getByTestId('punto-serie-0')).toHaveCount(0);

  // E il divieto di trascinamento è dichiarato, non solo rispettato
  await expect(page.getByTestId('avviso-grafico-titolo')).toContainText(
    'non lo ripete come ultimo valore noto',
  );

  // Tornando a una scala più ampia il tracciato ricompare: la finestra vuota era
  // un ritaglio, non un guasto
  await page.getByTestId('scala-tutto').click();
  await expect(grafico).toHaveAttribute('data-punti', '3');
  await expect(grafico.locator('svg.tracciato')).toBeVisible();
});

test('«tutto lo storico» è la scala attiva a ogni apertura di scheda, anche dopo averla cambiata', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Predefinita');
  archivio.seminaTitolo(ISIN, TITOLO_US_037_VARIANTI.campi);
  archivio.seminaTitolo(ISIN_SECONDO, TITOLO_US_037_SECONDO.campi);

  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(120), 38.9, 30);
  await archivio.aggiungiPosizione(portfolioId, ISIN_SECONDO, dataCivileIndietro(60), 128.3, 12);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    {
      price: TITOLO_US_037_VARIANTI.campi.price!,
      observed_at: adesso,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, portfolioId, ISIN);

  // Prima apertura: la scala predefinita è «tutto lo storico»
  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(page.getByTestId('scala-tutto')).toHaveAttribute('aria-pressed', 'true');

  // L'utente cambia scala su questo titolo
  await page.getByTestId('scala-anno').click();
  await expect(grafico).toHaveAttribute('data-scala', 'anno');
  await expect(page.getByTestId('scala-anno')).toHaveAttribute('aria-pressed', 'true');

  // Chiude la scheda e apre quella di un *altro* titolo: la scelta precedente non
  // lo segue. La scheda non si rimonta cambiando titolo, quindi senza un
  // azzeramento esplicito la scala scelta qui sopravvivrebbe all'apertura
  // successiva.
  await page.getByTestId('btn-torna-riepilogo').click();
  await apriSchedaTitolo(page, portfolioId, ISIN_SECONDO);

  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(page.getByTestId('scala-tutto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scala-anno')).toHaveAttribute('aria-pressed', 'false');
});

test('cambiare scala non genera alcuna richiesta al server', async ({ page, archivio }) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Senza Richieste');

  // Il titolo è già in cache e rilevato adesso (il default di `seminaTitolo`): è
  // la sola premessa sotto cui zero chiamate significano «il ritaglio avviene sui
  // dati che la pagina ha già» e non «la guardia ha risposto no».
  archivio.seminaTitolo(ISIN, TITOLO_US_037_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(300), 37.5, 45);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    {
      price: 39.1,
      observed_at: adesso - 120 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      price: TITOLO_US_037_VARIANTI.campi.price!,
      observed_at: adesso,
      data_source: 'borsaitaliana',
    },
  ]);

  // Si *osservano* le richieste, non si intercettano: `route` le devierebbe, e il
  // test proverebbe soltanto che una rotta stubbata non viene percorsa. `request`
  // lascia la pagina lavorare com'è e conta ciò che parte davvero.
  const richiesteApi: string[] = [];
  page.on('request', (richiesta) => {
    if (richiesta.url().includes('/api/')) richiesteApi.push(richiesta.url());
  });

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, portfolioId, ISIN);

  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toHaveAttribute('data-punti', '3');

  // La scheda ha davvero parlato col server per caricarsi: il conteggio da cui si
  // parte non è zero per caso.
  const dopoIlCaricamento = richiesteApi.length;
  expect(dopoIlCaricamento).toBeGreaterThan(0);

  // Tutte e cinque le scale, una dopo l'altra
  for (const scala of ['mese', 'anno', 'cinque-anni', 'dieci-anni', 'tutto'] as const) {
    await page.getByTestId(`scala-${scala}`).click();
    await expect(grafico).toHaveAttribute('data-scala', scala);
  }

  // Un respiro perché un'eventuale richiesta tardiva faccia in tempo a partire:
  // senza, «zero richieste» proverebbe soltanto che nessuna è arrivata *ancora*.
  await page.waitForTimeout(500);

  expect(richiesteApi.slice(dopoIlCaricamento)).toEqual([]);
});
