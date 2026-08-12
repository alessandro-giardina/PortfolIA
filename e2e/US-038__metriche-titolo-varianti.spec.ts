/**
 * US-038: le varianti della bilancia sotto il grafico del titolo.
 *
 * Vivono in un file separato dallo scenario dimostrativo perché `launchOptions`
 * (slowMo) non è scopabile in un `describe`: Playwright lo consente solo a
 * livello di file. Qui i test girano a velocità piena e non producono video —
 * sono i casi limite, che nel filmato della spec sarebbero soltanto rumore.
 *
 * Tre premesse, tutte intorno al confine fra «zero misurato» e «dato assente»:
 *  - una finestra con **una sola** rilevazione non porta alcuna cifra: il piatto
 *    dichiara l'assenza, e il P&L accanto resta valorizzato e immobile
 *    (criterio 4 · ADR-003);
 *  - due rilevazioni **allo stesso prezzo** danno uno zero *misurato*, che è un
 *    dato a tutti gli effetti e non va confuso con il timbro d'assenza;
 *  - una finestra con **più carichi** e una sola rilevazione resta senza cifra: i
 *    prezzi di carico non sono capi del conto, né qui né altrove.
 *
 * Titolo seminato: TITOLO_US_038_VARIANTI, riservato a questo file. Ogni scenario
 * si costruisce la propria premessa con `seminaOsservazioni`, che *sostituisce*
 * lo storico. Il seme con `fetched_at` di **adesso** (il default di
 * `seminaTitolo`) non è qui una comodità ma una premessa: un recupero reale
 * registrerebbe un'osservazione a oggi, che da sola porterebbe a due le
 * rilevazioni comprese nell'ultimo mese e smonterebbe in silenzio proprio il caso
 * che il criterio 4 mette alla prova.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_038_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_038_VARIANTI.isin;
const PREZZO_ATTUALE = TITOLO_US_038_VARIANTI.campi.price!;
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
async function apriSchedaTitolo(page: Page, isin: string) {
  const riga = page.getByTestId(`riepilogo-${isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('metriche-titolo')).toBeVisible({ timeout: 8000 });
}

test('una finestra con una sola rilevazione non porta alcuna cifra, e il P&L accanto resta quello di prima', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Metriche Rilevazione Unica');
  archivio.seminaTitolo(ISIN, TITOLO_US_038_VARIANTI.campi);

  // Un carico anteriore all'ultimo mese e tre rilevazioni di cui **una sola**
  // dentro la finestra. I margini sono larghi — 90 giorni contro un mese civile —
  // perché il confine non deve cadere vicino a un estremo.
  const CARICO = { giorniFa: 200, prezzo: 44.5, quantita: 80 };
  const RILEVAZIONI = [
    { giorniFa: 150, prezzo: 47.3 },
    { giorniFa: 90, prezzo: 49.1 },
    { giorniFa: 8, prezzo: PREZZO_ATTUALE },
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
  await apriSchedaTitolo(page, ISIN);

  const variazione = page.getByTestId('variazione-periodo');
  const pnl = page.getByTestId('pnl-da-carico');
  const valorePnl = page.getByTestId('pnl-da-carico-valore');

  // Premessa dello scenario: su tutto lo storico la variazione è misurabile.
  // Senza questa lettura, «nessuna cifra nell'ultimo mese» sarebbe soddisfatto
  // anche da un piatto rotto, che non mostra mai nulla.
  await expect(variazione).toHaveAttribute('data-stato', 'disponibile');
  await expect(variazione).toHaveAttribute('data-rilevazioni', String(RILEVAZIONI.length));
  const pnlSuTuttoLoStorico = await valorePnl.textContent();
  expect(pnlSuTuttoLoStorico).toContain('€');

  await page.getByTestId('scala-mese').click();

  // Nella finestra cade una sola rilevazione: il piatto dichiara l'assenza
  await expect(variazione).toHaveAttribute('data-stato', 'non-disponibile');
  await expect(variazione).toHaveAttribute('data-rilevazioni', '1');
  await expect(page.getByTestId('variazione-non-disponibile')).toContainText(
    'Dato non disponibile',
  );
  await expect(page.getByTestId('conteggio-rilevazioni')).toContainText('Rilevazioni comprese');
  await expect(page.getByTestId('conteggio-rilevazioni')).toContainText('Ne servono almeno');

  // E **nessuna cifra**: né il valore né la percentuale esistono in pagina, e in
  // particolare non c'è lo zero, che affermerebbe un prezzo immobile invece di
  // dichiarare un dato mancante (ADR-003).
  await expect(page.getByTestId('variazione-periodo-valore')).toHaveCount(0);
  await expect(page.getByTestId('variazione-periodo-percentuale')).toHaveCount(0);
  await expect(variazione).not.toContainText('0,00 %');

  // La finestra non è vuota — il punto c'è, ed è proprio la rilevazione unica:
  // questo non è il caso «finestra senza dati» di US-037, ma quello di una
  // finestra con dati *insufficienti* a misurare un movimento.
  await expect(page.getByTestId('grafico-titolo')).toHaveAttribute('data-punti', '1');
  await expect(page.getByTestId('dato-non-disponibile')).toHaveCount(0);

  // Il P&L, accanto, non ha perso nulla: stessa stringa della scala più ampia
  await expect(pnl).toHaveAttribute('data-stato', 'disponibile');
  await expect(valorePnl).toHaveText(pnlSuTuttoLoStorico!);
  expect(await valorePnl.textContent()).toBe(
    await page.getByTestId('dettaglio-differenza').textContent(),
  );
});

test('due rilevazioni allo stesso prezzo misurano uno zero, che il piatto scrive come dato e non come assenza', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Metriche Zero Misurato');
  archivio.seminaTitolo(ISIN, TITOLO_US_038_VARIANTI.campi);

  // Due rilevazioni dentro l'ultimo mese **allo stesso prezzo**: giorni civili
  // diversi, quindi due righe distinte in archivio e non una deduplicata.
  const CARICO = { giorniFa: 200, prezzo: 44.5, quantita: 80 };
  const RILEVAZIONE_LONTANA = { giorniFa: 150, prezzo: 47.3 };
  const RILEVAZIONI_IN_FINESTRA = [
    { giorniFa: 20, prezzo: PREZZO_ATTUALE },
    { giorniFa: 5, prezzo: PREZZO_ATTUALE },
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
    [RILEVAZIONE_LONTANA, ...RILEVAZIONI_IN_FINESTRA].map((rilevazione) => ({
      price: rilevazione.prezzo,
      observed_at: adesso - rilevazione.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    })),
  );

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaTitolo(page, ISIN);

  await page.getByTestId('scala-mese').click();

  const variazione = page.getByTestId('variazione-periodo');
  await expect(variazione).toHaveAttribute('data-stato', 'disponibile');
  await expect(variazione).toHaveAttribute('data-rilevazioni', '2');

  // Lo zero c'è, ed è una **misura**: due capi esistono, e fra loro il prezzo non
  // si è mosso. Il segno è quello del guadagno per convenzione (`+`), a quattro
  // decimali come ogni prezzo unitario della scheda.
  await expect(page.getByTestId('variazione-periodo-valore')).toHaveText('+€ 0,0000');
  await expect(page.getByTestId('variazione-periodo-percentuale')).toHaveText('+0,00 %');

  // E si distingue dal timbro d'assenza, che qui non deve comparire: è il confine
  // che il criterio 4 tiene: «0,00 %» significa *non si è mosso*, non *non lo so*.
  await expect(page.getByTestId('variazione-non-disponibile')).toHaveCount(0);
  await expect(page.getByTestId('conteggio-rilevazioni')).toHaveCount(0);
  await expect(variazione).not.toContainText('Dato non disponibile');
});

test('più carichi in finestra e una sola rilevazione: i prezzi di carico non fanno da capo al conto', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Metriche Carichi Non Contano');
  archivio.seminaTitolo(ISIN, TITOLO_US_038_VARIANTI.campi);

  // Tre carichi dentro l'ultimo mese, a prezzi diversi fra loro: bastano e
  // avanzano a formare due capi, se i prezzi di carico contassero. Le rilevazioni
  // comprese restano una sola.
  const CARICHI = [
    { giorniFa: 25, prezzo: 48.2, quantita: 30 },
    { giorniFa: 15, prezzo: 49.9, quantita: 20 },
    { giorniFa: 6, prezzo: 50.4, quantita: 25 },
  ];
  const RILEVAZIONI = [
    { giorniFa: 150, prezzo: 46.1 },
    { giorniFa: 10, prezzo: PREZZO_ATTUALE },
  ];

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portfolioId,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

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
  await apriSchedaTitolo(page, ISIN);

  await page.getByTestId('scala-mese').click();

  // Premessa dello scenario: la finestra è tutt'altro che povera di punti — ne
  // contiene quattro, tre di carico e uno di rilevazione. Senza questa lettura
  // «dato non disponibile» proverebbe soltanto che la finestra è vuota.
  await expect(page.getByTestId('grafico-titolo')).toHaveAttribute('data-punti', '4');

  const variazione = page.getByTestId('variazione-periodo');
  await expect(variazione).toHaveAttribute('data-stato', 'non-disponibile');
  await expect(variazione).toHaveAttribute('data-rilevazioni', '1');
  await expect(page.getByTestId('variazione-non-disponibile')).toContainText(
    'Dato non disponibile',
  );

  // Nessuna cifra, nemmeno ricavata dai carichi: i tre prezzi d'acquisto sono lì,
  // e restano fuori dal conto
  await expect(page.getByTestId('variazione-periodo-valore')).toHaveCount(0);
  await expect(page.getByTestId('variazione-periodo-percentuale')).toHaveCount(0);
  await expect(variazione).not.toContainText('0,00 %');

  // E il piatto lo dice, invece di lasciarlo dedurre: quanti carichi cadono nella
  // finestra e perché non entrano nella formula
  await expect(variazione).toContainText('3 prezzi di carico compresi nella finestra');
  await expect(variazione).toContainText('non entrano nel conto');
  await expect(variazione).toContainText('non a quanto il mercato scambiava il titolo');

  // Il P&L resta invece valorizzato: i carichi sono esattamente ciò che *quella*
  // misura guarda
  await expect(page.getByTestId('pnl-da-carico')).toHaveAttribute('data-stato', 'disponibile');
  expect(await page.getByTestId('pnl-da-carico-valore').textContent()).toBe(
    await page.getByTestId('dettaglio-differenza').textContent(),
  );
});
