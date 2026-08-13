/**
 * US-020: le varianti della scala temporale del grafico del portafoglio.
 *
 * File sorello dello scenario dimostrativo (`US-020__scala-portafoglio.spec.ts`,
 * con video), senza registrazione: `launchOptions.slowMo` non è scopabile a un
 * solo `describe` — Playwright lo consente solo a livello di file — quindi i
 * casi limite vivono qui e girano a velocità piena. Nel filmato della spec
 * sarebbero soltanto rumore.
 *
 * Cinque premesse, ognuna un criterio:
 *
 *  - una finestra priva di punti dichiara «dato non disponibile» invece di
 *    mostrare una cornice vuota, e il **secondo** regolo dice «non misurabile»,
 *    non «parziale» (criteri 4 e 6 · ADR-003);
 *  - le cinque etichette sono quelle di `SCALE_TEMPORALI`, cioè la definizione
 *    condivisa di US-037, e non una seconda copia con le stesse parole
 *    (criterio 1);
 *  - «tutto lo storico» è la scala attiva a ogni rientro sul Riepilogo, anche
 *    dopo averla cambiata (criterio 2);
 *  - cambiare scala non interroga la fonte: il ritaglio avviene sui dati che la
 *    pagina ha già (criterio 3);
 *  - tempo pieno e perimetro parziale nello stesso istante, coi due denominatori
 *    scritti entrambi e distinti (criterio 6).
 *
 * Titoli: `TITOLO_US_020_VARIANTI`, riservato a questo file — una sola chiave
 * basta perché gli scenari girano in serie (`fullyParallel: false`) e ciascuno
 * si ricostruisce la premessa con `seminaOsservazioni`, che *sostituisce* lo
 * storico — e `ISIN_MAI_RILEVATO_US_020`, che l'ultimo scenario *rimuove* dalla
 * cache: finché una riga di `securities` esiste, il backfill d'avvio ne
 * genererebbe un'osservazione e il titolo non sarebbe più «mai rilevato».
 *
 * Le premesse sono in giorni indietro da adesso e non in date fisse: qui il
 * contenuto degli scenari è il rapporto d'ordine fra la storia disponibile e
 * l'orizzonte chiesto, e una data scritta a mano smetterebbe di reggerlo.
 */
import { SCALA_PREDEFINITA, SCALE_TEMPORALI } from '@portfolia/shared';
import { test, expect } from './support/fixtures.js';
import { ISIN_MAI_RILEVATO_US_020, TITOLO_US_020_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_020_VARIANTI.isin;
const ISIN_MAI_RILEVATO = ISIN_MAI_RILEVATO_US_020.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**: `Position.loadDate` è
 * una data civile che il dominio àncora a mezzanotte UTC, e comporla dai campi
 * locali la farebbe scivolare di un giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

// ---------------------------------------------------------------------------
// Scenario 1 — una finestra senza punti dichiara «dato non disponibile», e il
// secondo regolo è «non misurabile», non «parziale»
// ---------------------------------------------------------------------------

test('una finestra senza punti dichiara «dato non disponibile», e il regolo del perimetro resta non misurabile', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Portafoglio Vuota');
  archivio.seminaTitolo(ISIN, TITOLO_US_020_VARIANTI.campi);

  // Tutto l'archivio di questo conto è anteriore all'ultimo mese: un carico di
  // 200 giorni fa e due rilevazioni fra i 150 e i 100. Il margine è largo perché
  // il confine non deve cadere vicino a un estremo.
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(200), 5.1, 300);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 5.4, observed_at: adesso - 150 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_020_VARIANTI.campi.price!,
      observed_at: adesso - 100 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });

  // Premessa dello scenario: su tutto lo storico i tre punti ci sono. Senza
  // questa asserzione «zero punti nell'ultimo mese» sarebbe soddisfatto anche da
  // un archivio vuoto, e il test non proverebbe il ritaglio.
  await expect(grafico).toHaveAttribute('data-punti', '3');

  await page.getByTestId('scala-mese').click();

  await expect(grafico).toHaveAttribute('data-scala', 'mese');
  await expect(grafico).toHaveAttribute('data-copertura', 'assente');
  await expect(grafico).toHaveAttribute('data-punti', '0');

  // Al posto della cornice, la dichiarazione
  const dichiarazione = page.getByTestId('finestra-portafoglio-vuota');
  await expect(dichiarazione).toBeVisible();
  await expect(dichiarazione.locator('.timbro-grande')).toHaveText('Dato non disponibile');
  await expect(page.getByTestId('intervallo-richiesto')).toContainText('ultimo mese');
  await expect(page.getByTestId('intervallo-richiesto')).toContainText('giorni civili');

  // …e dove il dato esiste davvero: il punto più recente, fuori dalla finestra
  await expect(page.getByTestId('dove-esiste-portafoglio')).toContainText(
    'fuori da questa finestra',
  );

  // Il rimedio, non la ripetizione del problema: la scala più stretta che
  // comprenda almeno un punto d'archivio
  await expect(dichiarazione.locator('.invito-scala')).toContainText('Ultimo anno');

  // Nessuna cornice vuota: né il tracciato né una retta a zero
  await expect(grafico.locator('svg.tracciato')).toHaveCount(0);
  await expect(page.getByTestId('punto-portafoglio-0')).toHaveCount(0);

  // Il divieto di trascinamento è dichiarato, non solo rispettato
  await expect(page.getByTestId('avviso-grafico-portafoglio')).toContainText(
    'non lo ripete come ultimo valore noto',
  );

  // IL PUNTO DI QUESTA SPEC: con zero punti in finestra la seconda dimensione
  // non è «parziale» né «piena» — è senza oggetto. Dichiararla piena sarebbe
  // vero solo vacuamente, e a schermo si leggerebbe come una rassicurazione
  // sopra un riquadro che non mostra nulla.
  await expect(page.getByTestId('regolo-tempo')).toHaveAttribute('data-verdetto', 'assente');
  const regoloPerimetro = page.getByTestId('regolo-perimetro');
  await expect(regoloPerimetro).toHaveAttribute('data-verdetto', 'senza-oggetto');
  await expect(regoloPerimetro).toContainText('non misurabile');
  await expect(regoloPerimetro).not.toContainText('perimetro completo dal');

  // Nessun bottone viene disabilitato: un bottone spento non spiegherebbe
  // perché è spento, e da lì si rimedia.
  for (const scala of SCALE_TEMPORALI) {
    await expect(page.getByTestId(`scala-${scala.id}`)).toBeEnabled();
  }

  // Tornando a una scala più ampia il tracciato ricompare: la finestra vuota era
  // un ritaglio, non un guasto
  await page.getByTestId('scala-tutto').click();
  await expect(grafico).toHaveAttribute('data-punti', '3');
  await expect(grafico.locator('svg.tracciato')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — le cinque etichette sono quelle della definizione condivisa
// ---------------------------------------------------------------------------

test('le cinque scale sono quelle della definizione condivisa, non una seconda copia', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Portafoglio Etichette');
  archivio.seminaTitolo(ISIN, TITOLO_US_020_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(90), 5.2, 120);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    {
      price: TITOLO_US_020_VARIANTI.campi.price!,
      observed_at: adesso - 20 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('grafico-portafoglio')).toBeVisible({ timeout: 8000 });

  const traversa = page.getByTestId('scala-temporale');

  // Le etichette attese arrivano da `SCALE_TEMPORALI` e non sono riscritte qui:
  // un test che le ricopiasse continuerebbe a passare anche dopo che la
  // definizione condivisa fosse cambiata, cioè smetterebbe di provare il riuso.
  await expect(traversa.locator('button')).toHaveCount(SCALE_TEMPORALI.length);
  for (const scala of SCALE_TEMPORALI) {
    await expect(page.getByTestId(`scala-${scala.id}`)).toContainText(scala.etichetta);
  }

  // La postilla sta sulla scala predefinita, e su quella sola
  await expect(page.getByTestId(`scala-${SCALA_PREDEFINITA}`)).toContainText('predefinita');
  await expect(traversa.locator('.postilla-predefinita')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// Scenario 3 — «tutto lo storico» è la scala di ogni rientro sul Riepilogo
// ---------------------------------------------------------------------------

test('«tutto lo storico» è la scala attiva a ogni rientro sul Riepilogo, anche dopo averla cambiata', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Portafoglio Predefinita');
  archivio.seminaTitolo(ISIN, TITOLO_US_020_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(120), 5, 200);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    {
      price: TITOLO_US_020_VARIANTI.campi.price!,
      observed_at: adesso - 10 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');

  // L'utente cambia scala
  await page.getByTestId('scala-anno').click();
  await expect(grafico).toHaveAttribute('data-scala', 'anno');
  await expect(page.getByTestId('scala-anno')).toHaveAttribute('aria-pressed', 'true');

  // Esce dal Riepilogo e vi rientra: la scelta precedente non lo segue
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('grafico-portafoglio')).toHaveCount(0);

  await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();
  await expect(grafico).toBeVisible({ timeout: 8000 });

  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(page.getByTestId('scala-tutto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scala-anno')).toHaveAttribute('aria-pressed', 'false');
});

// ---------------------------------------------------------------------------
// Scenario 4 — cambiare scala non interroga la fonte
// ---------------------------------------------------------------------------

test('cambiare scala non genera alcuna richiesta alla fonte', async ({ page, archivio }) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Portafoglio Senza Fonte');

  // Il titolo è già in cache e rilevato adesso (il default di `seminaTitolo`): è
  // la sola premessa sotto cui zero chiamate significano «il ritaglio avviene
  // sui dati che la pagina ha già» e non «la guardia ha risposto no».
  archivio.seminaTitolo(ISIN, TITOLO_US_020_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(300), 4.8, 150);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 5.05, observed_at: adesso - 120 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_020_VARIANTI.campi.price!,
      observed_at: adesso - 5 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  // La fonte è murata: qualunque richiesta a `/api/securities/**` fallisce. Se
  // la traversa ne generasse una, il fallimento sarebbe visibile — non un
  // conteggio da interpretare.
  const tentativi: string[] = [];
  await page.route('**/api/securities/**', async (route) => {
    tentativi.push(route.request().url());
    await route.abort('failed');
  });

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });
  await expect(grafico).toHaveAttribute('data-punti', '3');

  // Tutte e cinque le scale, una dopo l'altra: il tracciato si ricompone ogni
  // volta dai punti già in memoria
  for (const scala of SCALE_TEMPORALI) {
    await page.getByTestId(`scala-${scala.id}`).click();
    await expect(grafico).toHaveAttribute('data-scala', scala.id);
  }

  // Un respiro perché un'eventuale richiesta tardiva faccia in tempo a partire:
  // senza, «zero richieste» proverebbe soltanto che nessuna è arrivata *ancora*.
  await page.waitForTimeout(500);

  expect(tentativi).toEqual([]);

  // E il grafico è ancora quello: nessun ramo d'errore, nessuna cornice vuota
  await page.getByTestId('scala-tutto').click();
  await expect(grafico).toHaveAttribute('data-punti', '3');
  await expect(grafico.locator('svg.tracciato')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 5 — tempo pieno e perimetro parziale nello stesso istante
// ---------------------------------------------------------------------------

test('tempo pieno e perimetro parziale convivono, coi due denominatori scritti entrambi', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scala Portafoglio Due Dimensioni');

  // Il titolo «mai rilevato» non deve avere alcuna riga in cache: finché ce
  // n'è una, il backfill d'avvio ne genera un'osservazione e il perimetro
  // risulterebbe completo.
  archivio.rimuoviTitolo(ISIN_MAI_RILEVATO);
  archivio.seminaTitolo(ISIN, TITOLO_US_020_VARIANTI.campi);

  await archivio.aggiungiPosizione(portfolioId, ISIN_MAI_RILEVATO, dataCivileIndietro(90), 10, 40);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(80), 5.3, 25);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    {
      price: TITOLO_US_020_VARIANTI.campi.price!,
      observed_at: adesso - 10 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });
  await expect(grafico).toHaveAttribute('data-titoli', '2');
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');

  // DIMENSIONE I — piena: su «tutto lo storico» la finestra coincide con la
  // storia, quindi non c'è un solo giorno fuori dall'archivio.
  const regoloTempo = page.getByTestId('regolo-tempo');
  await expect(regoloTempo).toHaveAttribute('data-verdetto', 'piena');
  await expect(regoloTempo).toContainText('l’archivio copre l’intera finestra');
  await expect(grafico.getByTestId('zona-fuori-archivio')).toHaveCount(0);

  // DIMENSIONE II — parziale nello stesso istante: un titolo detenuto e mai
  // rilevato tiene il perimetro incompleto a ogni data. I due verdetti sono
  // diversi, e nessuno dei due si deduce dall'altro.
  const regoloPerimetro = page.getByTestId('regolo-perimetro');
  await expect(regoloPerimetro).toHaveAttribute('data-verdetto', 'parziale');
  await expect(regoloPerimetro).toContainText('nessuna data a perimetro completo');

  // I due denominatori sono scritti entrambi, ciascuno col proprio significato:
  // la finestra chiesta per il primo, i giorni coperti dall'archivio per il
  // secondo. Una media dei due non corrisponderebbe ad alcun fatto.
  await expect(page.getByTestId('denominatore-tempo')).toContainText(
    'giorni della finestra chiesta',
  );
  await expect(page.getByTestId('denominatore-perimetro')).toContainText(
    'giorni coperti dall’archivio',
  );

  // Il sigillo dichiara perché i regoli sono due e i rimedi opposti
  await expect(page.getByTestId('sigillo-due-dimensioni')).toContainText('scala più stretta');
  await expect(page.getByTestId('sigillo-due-dimensioni')).toContainText('aggiornando i prezzi');
});
