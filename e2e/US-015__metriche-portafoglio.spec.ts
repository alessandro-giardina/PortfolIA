/**
 * US-015: la scomposizione della variazione del portafoglio — scenario
 * dimostrativo.
 *
 * Riproduce lo scenario del campo *Dimostra*: sulla finestra «ultimo anno» il
 * valore complessivo passa da 20.000 a 26.000 euro, e dentro la finestra cade
 * un carico da 5.000 euro. Sotto il grafico compaiono le tre cifre —
 * variazione, capitale netto versato, movimento di mercato — con il regolo che
 * ne divide la barra e la base della percentuale scritta per esteso coi suoi
 * addendi (criteri 1, 2, 3). Cambiando scala («tutto lo storico») le tre
 * cifre si aggiornano, mentre le stringhe del quadro del risultato —
 * realizzato, latente, totale — restano identiche: è il criterio 4, e la
 * prova è un confronto di **stringhe** catturate prima e dopo, non due
 * asserzioni identiche scritte a mano.
 *
 * Le premesse sono in **giorni indietro da adesso** e non in date fisse, con
 * margini larghi rispetto al confine dei dodici mesi di «ultimo anno» — la
 * stessa disciplina di `US-038__metriche-titolo.spec.ts`.
 *
 * Titolo seminato: TITOLO_US_015, riservato a questo file. Il seme porta
 * `fetched_at` di adesso (il default di `seminaTitolo`), la guardia che
 * impedisce un recupero reale dalla fonte durante la registrazione.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_015 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di `test.use()` (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-015/demo-metriche-portafoglio.webm');
});

const ISIN = TITOLO_US_015.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**: `Position.loadDate`
 * è una data civile che il dominio àncora a mezzanotte UTC, e comporla dai
 * campi locali la farebbe scivolare di un giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

// ─── Lo scenario del campo Dimostra ──────────────────────────────────────────
// Il carico originario (800 giorni fa) resta fuori dalla finestra «ultimo
// anno» — il margine è largo rispetto al confine dei dodici mesi, per la
// stessa ragione già registrata in US-038 e US-020: il confine non deve
// cadere vicino a un estremo.
//
// La rilevazione più antica precede il carico originario di un margine di
// venti giorni e non dello stesso «giorniFa»: un carico è ancorato alla
// mezzanotte UTC della sua data civile, una rilevazione all'istante grezzo
// «adesso meno N giorni» — i due non coincidono affatto se il test gira nel
// pomeriggio, e un margine di un solo giorno lascerebbe la premessa a
// dipendere dall'ora di esecuzione. Senza una rilevazione precedente il
// carico originario risulterebbe *mai valorizzato* al proprio stesso punto, e
// l'intero titolo uscirebbe dal perimetro su «tutto lo storico».
//
// Ne segue una conseguenza che il mockup della spec già dimostra sul secondo
// caso del trittico: su «tutto lo storico» il portafoglio *parte da zero* —
// prima di quella rilevazione il titolo non è ancora detenuto — quindi il
// capitale netto versato è tutto il capitale investito, e il movimento di
// mercato coincide con il P&L complessivo del quadro del risultato.
const RILEVAZIONE_ORIGINARIA = { giorniFa: 820, prezzo: 100 };
const CARICO_ORIGINARIO = { giorniFa: 800, prezzo: 100, quantita: 160 };
const RILEVAZIONE_PRIMA_ANNO = { giorniFa: 300, prezzo: 125 }; // prima capo di «ultimo anno»: 160 × 125 = 20.000
const CARICO_IN_FINESTRA = { giorniFa: 150, prezzo: 125, quantita: 40 }; // dentro la finestra: +5.000
const RILEVAZIONE_ULTIMA = { giorniFa: 3, prezzo: TITOLO_US_015.campi.price! }; // ultimo capo: 200 × 130 = 26.000

test('demo: sotto il grafico la variazione del portafoglio si scompone in capitale versato e movimento di mercato, e il P&L complessivo del quadro non si muove al cambiare della scala', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Metriche Portafoglio');

  // ─── Premesse possedute dal test, non ereditate ─────────────────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_015.campi);

  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN,
    dataCivileIndietro(CARICO_ORIGINARIO.giorniFa),
    CARICO_ORIGINARIO.prezzo,
    CARICO_ORIGINARIO.quantita,
  );
  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN,
    dataCivileIndietro(CARICO_IN_FINESTRA.giorniFa),
    CARICO_IN_FINESTRA.prezzo,
    CARICO_IN_FINESTRA.quantita,
  );

  // L'istante del recupero in cache è anche quello della rilevazione più
  // recente: così il cartellino del prezzo attuale e il capo destro della
  // finestra dichiarano lo stesso momento.
  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il numero
  // dei punti e i valori ai due capi sono premesse garantite, non un'eredità
  // del backfill d'avvio.
  archivio.seminaOsservazioni(ISIN, [
    {
      price: RILEVAZIONE_ORIGINARIA.prezzo,
      observed_at: adesso - RILEVAZIONE_ORIGINARIA.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      price: RILEVAZIONE_PRIMA_ANNO.prezzo,
      observed_at: adesso - RILEVAZIONE_PRIMA_ANNO.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      price: RILEVAZIONE_ULTIMA.prezzo,
      observed_at: adesso - RILEVAZIONE_ULTIMA.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  // 1. Il portafoglio si apre sul Riepilogo
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  // 2. Il quadro del risultato, in cima: le tre stringhe che il criterio 4
  //    dovrà ritrovare identiche più avanti
  const quadro = page.getByTestId('quadro-risultato');
  await quadro.scrollIntoViewIfNeeded();
  await expect(quadro).toBeVisible();
  const testoRealizzatoIniziale = await page.getByTestId('pnl-realizzato').textContent();
  const testoLatenteIniziale = await page.getByTestId('pnl-latente').textContent();
  const testoTotaleIniziale = await page.getByTestId('pnl-totale').textContent();

  await page.waitForTimeout(1000);

  // 3. Sotto il grafico del portafoglio: la stanga a tre pesi
  const grafico = page.getByTestId('grafico-portafoglio');
  await grafico.scrollIntoViewIfNeeded();
  await expect(grafico).toBeVisible();

  const metriche = page.getByTestId('metriche-portafoglio');
  await metriche.scrollIntoViewIfNeeded();
  await expect(metriche).toBeVisible();
  await expect(metriche).toHaveAttribute('data-scala', 'tutto');

  await page.waitForTimeout(1000);

  // 4. L'utente sceglie «Ultimo anno»: lo scenario del campo Dimostra
  await page.getByTestId('scala-anno').click();
  await expect(grafico).toHaveAttribute('data-scala', 'anno');
  await expect(metriche).toHaveAttribute('data-scala', 'anno');
  await expect(metriche).toHaveAttribute('data-stato', 'disponibile');

  await page.waitForTimeout(1000);

  // 5. Le tre cifre, etichettate distintamente (criterio 1): +6.000 = +5.000 +
  //    1.000, la scomposizione esatta del campo Dimostra.
  //
  //    `toLocaleString('it-IT')` in questo ambiente non raggruppa le
  //    migliaia sotto le cinque cifre (`Intl.NumberFormat` con
  //    `useGrouping: 'auto'`, il valore di `importo()`): "5000,00" e non
  //    "5.000,00". Non è un dettaglio di questo test — è la stessa resa già
  //    asserita da `US-030__aggiorna-dati-titolo-varianti.spec.ts`
  //    ('€ 2786,00') e da `US-039__vista-valore-*.spec.ts` ('€ 3000,00',
  //    '€ 8544,00'): sotto le cinquemila unità niente punto, da diecimila in
  //    su sì.
  await expect(page.getByTestId('variazione-valore')).toHaveText('€+6000,00');
  await expect(page.getByTestId('capitale-netto')).toHaveText('€+5000,00');
  await expect(page.getByTestId('movimento-mercato-valore')).toHaveText('€+1000,00');
  await expect(page.getByTestId('movimento-mercato-percentuale')).toHaveText('+4,00 %');

  await page.waitForTimeout(900);

  // 6. Il regolo divide la barra 83 % versato / 17 % mercato: cinquemila dei
  //    seimila sono un bonifico, non un guadagno
  const regolo = page.getByTestId('regolo-scomposizione');
  await regolo.scrollIntoViewIfNeeded();
  await expect(regolo).toBeVisible();
  await expect(regolo).toContainText('83');
  await expect(regolo).toContainText('17');
  await expect(regolo.locator('.quota.versato')).toContainText('5000,00');
  await expect(regolo.locator('.quota.mercato')).toContainText('1000,00');

  await page.waitForTimeout(900);

  // 7. La base della percentuale, scritta per esteso coi suoi addendi
  //    (criterio 3): non una cifra sola da prendere sulla parola
  const base = page.getByTestId('base-rapporto');
  await base.scrollIntoViewIfNeeded();
  await expect(base).toContainText('25.000,00');
  await expect(base).toContainText('20.000,00');
  await expect(base).toContainText('5000,00');

  await page.waitForTimeout(900);

  // 8. Il sigillo: il P&L complessivo di US-043 citato, mai ricalcolato qui
  const sigillo = page.getByTestId('rimando-quadro-risultato');
  await sigillo.scrollIntoViewIfNeeded();
  await expect(sigillo).toBeVisible();

  await page.waitForTimeout(1000);

  // 9. IL CRITERIO 4: cambiando scala le tre cifre si aggiornano…
  await page.getByTestId('scala-tutto').click();
  await expect(metriche).toHaveAttribute('data-scala', 'tutto');

  await expect(page.getByTestId('variazione-valore')).toHaveText('€+26.000,00');
  await expect(page.getByTestId('capitale-netto')).toHaveText('€+21.000,00');
  await expect(page.getByTestId('movimento-mercato-valore')).toHaveText('€+5000,00');

  await page.waitForTimeout(900);

  // 10. …mentre le stringhe del quadro del risultato restano esattamente le
  //     stesse: non un valore equivalente ricalcolato, la stessa lettura.
  await expect(page.getByTestId('pnl-realizzato')).toHaveText(testoRealizzatoIniziale!);
  await expect(page.getByTestId('pnl-latente')).toHaveText(testoLatenteIniziale!);
  await expect(page.getByTestId('pnl-totale')).toHaveText(testoTotaleIniziale!);
  expect(await page.getByTestId('pnl-totale').textContent()).toBe(testoTotaleIniziale);

  // Su «tutto lo storico» il movimento di mercato coincide — qui, e solo qui —
  // col P&L complessivo: la finestra contiene l'intera vita del conto.
  await expect(sigillo).toContainText('+€ 5000,00');

  await page.waitForTimeout(1500);
});
