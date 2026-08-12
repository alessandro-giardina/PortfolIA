/**
 * US-036: le varianti del grafico dell'andamento del prezzo del titolo.
 *
 * Vivono in un file separato dallo scenario demo perché `launchOptions` (slowMo)
 * non è scopabile in un `describe`: Playwright lo consente solo a livello di file.
 * Qui i test girano a velocità piena e non producono video — sono i casi limite,
 * che nel filmato della spec sarebbero soltanto rumore.
 *
 * Tre premesse, ognuna un criterio di accettazione:
 *  - un solo carico e nessuna rilevazione mostrano comunque il grafico con quel
 *    punto, dichiarando che un andamento non esiste ancora invece di lasciare
 *    un'area vuota ambigua (criterio 6);
 *  - la linea di riferimento è la media **ponderata** delle quantità, non
 *    l'aritmetica dei prezzi, e coincide con il prezzo medio che il piede di
 *    «Carichi registrati» già dichiara (criterio 4);
 *  - la costruzione del grafico non genera alcuna richiesta alla fonte
 *    (criterio 7).
 *
 * Le asserzioni guardano gli attributi che il componente espone e non la
 * geometria in pixel: le coordinate della tela cambiano a ogni ritocco di stile
 * senza che il comportamento cambi.
 *
 * Titolo seminato: TITOLO_US_036_VARIANTI, riservato a questo file. Ogni scenario
 * si costruisce la propria premessa da capo — `seminaTitolo` riscrive la riga di
 * cache e `rimuoviOsservazioni`/`seminaOsservazioni` sostituiscono lo storico —
 * così il conteggio dei punti è garantito e non ereditato dal backfill d'avvio.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_036_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_036_VARIANTI.isin;

/** Apre la scheda del titolo dal riepilogo del portafoglio e la restituisce. */
async function apriSchedaTitolo(page: Page, portfolioId: number) {
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();
  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });
  return scheda;
}

/** Prezzo unitario a quattro decimali, come lo scrive la scheda titolo. */
function prezzoScheda(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

test('un solo carico e nessuna rilevazione mostrano il grafico con quel punto, dichiarando che un andamento non esiste ancora', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Grafico Punto Unico');
  archivio.seminaTitolo(ISIN, TITOLO_US_036_VARIANTI.campi);

  const CARICO = { data: '2026-05-12', prezzo: 58.9, quantita: 30 };
  await archivio.aggiungiPosizione(portfolioId, ISIN, CARICO.data, CARICO.prezzo, CARICO.quantita);

  // La premessa «nessuna rilevazione» è asserita, non ereditata: senza questa
  // rimozione una riga lasciata dal backfill all'avvio del server porterebbe il
  // grafico a due punti, e il test passerebbe (o cadrebbe) per caso.
  archivio.rimuoviOsservazioni(ISIN);
  expect(archivio.leggiOsservazioni(ISIN)).toHaveLength(0);

  await apriSchedaTitolo(page, portfolioId);

  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toBeVisible();

  // Il grafico c'è, e ha esattamente il punto disponibile
  await expect(grafico).toHaveAttribute('data-punti', '1');
  const punto = page.getByTestId('punto-serie-0');
  await expect(punto).toHaveAttribute('data-origine', 'carico');
  await expect(punto).toHaveAttribute('data-prezzo', String(CARICO.prezzo));
  await expect(punto).toHaveAttribute('data-istante', String(Date.parse(`${CARICO.data}T00:00:00Z`)));
  await expect(page.getByTestId('punto-serie-1')).toHaveCount(0);

  // La linea di riferimento è tracciata anche con un punto solo: con un carico
  // unico la media ponderata è il suo stesso prezzo.
  const lineaMedia = grafico.getByTestId('linea-prezzo-medio');
  await expect(lineaMedia).toHaveCount(1);
  await expect(lineaMedia).toHaveAttribute('data-prezzo', String(CARICO.prezzo));

  // Non un'area vuota ambigua: il disegno *dichiara* perché non c'è andamento…
  await expect(grafico.locator('svg.tracciato')).toBeVisible();
  await expect(grafico.locator('.dichiarazione-forte')).toContainText('NESSUNA RILEVAZIONE');
  // …e non è il degrado a serie vuota, che vale solo senza alcun punto
  await expect(page.getByTestId('grafico-titolo-vuoto')).toHaveCount(0);

  // L'avviso porta la variante «senza andamento» e ne spiega la ragione
  const avviso = page.getByTestId('avviso-grafico-titolo');
  await expect(avviso).toBeVisible();
  await expect(avviso).toHaveClass(/senza-andamento/);
  await expect(avviso).toContainText('almeno due punti');
});

test('la linea di riferimento è la media ponderata delle quantità e coincide con il prezzo medio del piede di «Carichi registrati»', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Grafico Media Ponderata');
  archivio.seminaTitolo(ISIN, TITOLO_US_036_VARIANTI.campi);

  // Quantità molto diverse a prezzi diversi: è ciò che rende la media ponderata
  // distinguibile dall'aritmetica. Con quantità uguali le due coinciderebbero e
  // lo scenario non proverebbe nulla.
  const CARICHI = [
    { data: '2026-01-19', prezzo: 55, quantita: 90 },
    { data: '2026-06-08', prezzo: 70, quantita: 10 },
  ];
  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(portfolioId, ISIN, carico.data, carico.prezzo, carico.quantita);
  }
  archivio.rimuoviOsservazioni(ISIN);

  // Le due medie, calcolate qui con la stessa formula e nello stesso ordine del
  // server: la ponderata è l'attesa, l'aritmetica è il valore sbagliato da cui
  // deve distinguersi.
  const quantitaTotale = CARICHI.reduce((somma, c) => somma + c.quantita, 0);
  const sommaPonderata = CARICHI.reduce((somma, c) => somma + c.prezzo * c.quantita, 0);
  const mediaPonderata = sommaPonderata / quantitaTotale;
  const mediaAritmetica = CARICHI.reduce((somma, c) => somma + c.prezzo, 0) / CARICHI.length;
  // Premessa dello scenario, asserita invece che assunta: se un domani i numeri
  // qui sopra venissero cambiati fino a far coincidere le due medie, il test
  // direbbe subito di aver perso il suo oggetto.
  expect(mediaPonderata).not.toBeCloseTo(mediaAritmetica, 4);

  await apriSchedaTitolo(page, portfolioId);

  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toBeVisible();
  await expect(grafico).toHaveAttribute('data-punti', '2');

  const lineaMedia = grafico.getByTestId('linea-prezzo-medio');
  await expect(lineaMedia).toHaveCount(1);
  await expect(lineaMedia).toHaveAttribute('data-prezzo', String(mediaPonderata));
  // Il punto del criterio: non l'aritmetica dei prezzi
  await expect(lineaMedia).not.toHaveAttribute('data-prezzo', String(mediaAritmetica));

  // Due letture dello stesso fatto non devono divergere: il valore della linea è
  // quello che il piede di «Carichi registrati» già dichiara. Il piede non ha un
  // testid proprio: si raggiunge dalla tabella, la cui terza colonna è il prezzo
  // medio (Data · Quantità · Prezzo · Controvalore).
  const prezzoMedioDelPiede = page
    .getByTestId('tabella-carichi-titolo')
    .locator('tfoot td')
    .nth(2);
  // `toContainText` e non `toHaveText`: il simbolo di valuta è un `::before` di
  // `.euro`, quindi non appartiene al testo dell'elemento.
  await expect(prezzoMedioDelPiede).toContainText(prezzoScheda(mediaPonderata));

  // …e lo stesso valore lo dichiara anche la legenda, che nomina la riga d'ottone
  await expect(page.getByTestId('legenda-grafico')).toContainText(prezzoScheda(mediaPonderata));
});

test('la costruzione del grafico non genera alcuna richiesta verso la fonte', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Grafico Senza Fonte');

  // Il titolo è già in cache e rilevato adesso (il default di `seminaTitolo`):
  // è la sola premessa sotto cui zero chiamate a `/api/securities/` significano
  // «il grafico si disegna con i dati che la pagina ha già» e non «la cache era
  // fredda e la guardia ha risposto no».
  archivio.seminaTitolo(ISIN, TITOLO_US_036_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-03-24', 59.7, 25);

  const rilevazione = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    {
      // La più recente resta sul prezzo che la scheda dichiara come attuale: una
      // divergenza fra cima dello storico e cartellino non farebbe fallire nulla
      // e mostrerebbe comunque un dato falso.
      price: TITOLO_US_036_VARIANTI.campi.price!,
      observed_at: rilevazione,
      data_source: 'borsaitaliana',
    },
  ]);

  // Si *osservano* le richieste, non si intercettano: `route` le devierebbe, e il
  // test proverebbe soltanto che una rotta stubbata non viene percorsa. `request`
  // lascia la pagina lavorare com'è e conta ciò che parte davvero.
  const richiesteAllaFonte: string[] = [];
  let richiesteDiDettaglio = 0;
  page.on('request', (richiesta) => {
    const url = richiesta.url();
    if (url.includes('/api/securities/')) richiesteAllaFonte.push(url);
    if (url.includes('/detail')) richiesteDiDettaglio += 1;
  });

  await apriSchedaTitolo(page, portfolioId);

  // Il grafico si è davvero disegnato: senza questa asserzione «zero richieste»
  // sarebbe soddisfatto anche da una pagina che non ha caricato nulla.
  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toBeVisible();
  await expect(grafico).toHaveAttribute('data-punti', '2');
  await expect(page.getByTestId('punto-serie-0')).toHaveAttribute('data-origine', 'carico');
  await expect(page.getByTestId('punto-serie-1')).toHaveAttribute('data-origine', 'rilevazione');
  await expect(grafico.getByTestId('linea-prezzo-medio')).toHaveCount(1);
  await expect(page.getByTestId('nota-grafico-titolo')).toBeVisible();

  // La scheda ha letto il proprio dettaglio dall'archivio — è da lì che i punti
  // arrivano — e nulla è stato chiesto alla fonte.
  expect(richiesteDiDettaglio).toBeGreaterThan(0);
  expect(richiesteAllaFonte).toEqual([]);
});

/**
 * Le date che il grafico *scrive*, lette da un fuso a ovest di Greenwich.
 *
 * Tenere il fuso fuori dal dominio non basta: `PuntoSerie.at` fonde una data
 * civile (il carico, ancorato a mezzanotte UTC) e un istante reale (la
 * rilevazione), e renderle con la stessa regola ne sbaglia per forza una. A New
 * York la mezzanotte UTC del 12 maggio è ancora la sera dell'11: con una
 * lettura locale il grafico direbbe «11.V.2026» mentre la tabella «Carichi
 * registrati», che formatta `loadDate` così com'è, dice «12.V.2026» — due
 * letture dello stesso fatto, sulla stessa scheda, che si contraddicono.
 *
 * `timezoneId` è un'opzione di contesto (non di `launchOptions`), quindi è
 * scopabile in un `describe` senza forzare un worker nuovo.
 */
test.describe('con il lettore a ovest di Greenwich', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('la data del carico non scivola al giorno prima, e la rilevazione resta nel giorno del lettore', async ({
    page,
    archivio,
  }) => {
    const { id: portfolioId } = await archivio.creaPortafoglio('Grafico Fuso Occidentale');
    archivio.seminaTitolo(ISIN, TITOLO_US_036_VARIANTI.campi);

    const CARICO = { data: '2026-05-12', prezzo: 58.9, quantita: 30 };
    await archivio.aggiungiPosizione(portfolioId, ISIN, CARICO.data, CARICO.prezzo, CARICO.quantita);

    // Le 02:30Z del 10 giugno sono ancora il 9 giugno a New York: la rilevazione
    // è un istante reale, e va scritta nel giorno di chi legge — lo stesso che
    // la tabella «Storico prezzi» mostra da US-009.
    const RILEVAZIONE = { istante: '2026-06-10T02:30:00Z', prezzo: 61.2 };
    archivio.seminaOsservazioni(ISIN, [
      {
        price: RILEVAZIONE.prezzo,
        observed_at: Date.parse(RILEVAZIONE.istante) / 1000,
        data_source: 'borsaitaliana',
      },
    ]);

    await apriSchedaTitolo(page, portfolioId);

    const grafico = page.getByTestId('grafico-titolo');
    await expect(grafico).toHaveAttribute('data-punti', '2');

    // Premessa dello scenario: il browser sta davvero a ovest, altrimenti le due
    // asserzioni sotto passerebbero senza aver verificato nulla.
    const scarto = await page.evaluate(() => new Date('2026-05-12T00:00:00Z').getDate());
    expect(scarto).toBe(11);

    // Il carico: stessa data nel grafico e nella tabella dei carichi
    const dataCaricoInTabella = page
      .getByTestId('tabella-carichi-titolo')
      .locator('tbody tr')
      .first()
      .locator('td')
      .first();
    await expect(dataCaricoInTabella).toContainText('12.V.2026');

    const titoloCarico = await page.getByTestId('punto-serie-0').locator('title').textContent();
    expect(titoloCarico).toContain('12.V.2026');
    expect(titoloCarico).not.toContain('11.V.2026');
    await expect(grafico.locator('.estremi-tracciato')).toContainText('12.V.2026');

    // La rilevazione: stesso giorno *locale* nel grafico e nello storico prezzi
    await expect(page.getByTestId('osservazione-0')).toContainText('09.VI.2026');

    const titoloRilevazione = await page
      .getByTestId('punto-serie-1')
      .locator('title')
      .textContent();
    expect(titoloRilevazione).toContain('09.VI.2026');
    expect(titoloRilevazione).not.toContain('10.VI.2026');
  });
});
