/**
 * US-015: le varianti della scomposizione della variazione del portafoglio.
 *
 * File sorello dello scenario dimostrativo (`US-015__metriche-portafoglio.spec.ts`,
 * con video), senza registrazione: i due casi limite vivono qui e girano a
 * velocità piena — nel filmato della spec sarebbero solo rumore.
 *
 * Due premesse, ognuna un criterio:
 *
 *  - **criterio 5**: una finestra con meno di due punti dichiara «dato non
 *    disponibile» con un timbro, e **nessuna** delle tre cifre si scrive —
 *    nemmeno zero, nemmeno il solo capitale netto versato, che pure sarebbe
 *    calcolabile con un punto solo;
 *  - **criterio 6**: un titolo detenuto e mai rilevato rende la scomposizione
 *    parziale, nomina il titolo escluso nel riquadro del perimetro, e tiene
 *    il suo carico fuori dai versamenti — se vi comparisse, il movimento di
 *    mercato ne assorbirebbe l'importo col segno rovesciato.
 *
 * Titoli: `TITOLO_US_015_VARIANTI`, riservato a questo file — una sola chiave
 * basta perché i due scenari girano in serie (`fullyParallel: false`) e
 * ciascuno si ricostruisce la premessa con `seminaOsservazioni`, che
 * *sostituisce* lo storico — e `ISIN_MAI_RILEVATO_US_015`, che il secondo
 * scenario tiene fuori dalla cache: finché una riga di `securities` esiste, il
 * backfill d'avvio ne genererebbe un'osservazione e il titolo non sarebbe più
 * «mai rilevato».
 *
 * Le premesse sono in giorni indietro da adesso e non in date fisse, con
 * margini larghi rispetto ai confini delle finestre — la stessa disciplina
 * del file dimostrativo.
 */
import { test, expect } from './support/fixtures.js';
import { RILEVAZIONI_MINIME_VARIAZIONE } from '@portfolia/shared';
import { ISIN_MAI_RILEVATO_US_015, TITOLO_US_015_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_015_VARIANTI.isin;
const ISIN_MAI_RILEVATO = ISIN_MAI_RILEVATO_US_015.isin;
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

// ---------------------------------------------------------------------------
// Scenario 1 — una scala con un solo punto: timbro, nessun numero (criterio 5)
// ---------------------------------------------------------------------------

test('una finestra con un solo punto porta il timbro «Dato non disponibile», mai una cifra', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Metriche Portafoglio Un Punto');
  archivio.seminaTitolo(ISIN, TITOLO_US_015_VARIANTI.campi);

  // Una rilevazione precede il carico di dieci giorni — non lo stesso
  // «giorniFa» del carico stesso: un carico è ancorato alla mezzanotte UTC
  // della sua data civile, una rilevazione all'istante grezzo «adesso meno N
  // giorni», e i due non coincidono affatto se il test gira nel pomeriggio.
  // Senza una rilevazione precedente il carico risulterebbe mai valorizzato
  // al proprio stesso punto, e l'intero titolo uscirebbe dal perimetro.
  // La seconda rilevazione, 150 giorni fa, resta anch'essa fuori dall'ultimo
  // mese. Solo la terza, 10 giorni fa, cade dentro «ultimo mese»: è l'unico
  // punto di quella finestra.
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(200), 40, 30);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 40, observed_at: adesso - 210 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    { price: 42, observed_at: adesso - 150 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_015_VARIANTI.campi.price!,
      observed_at: adesso - 10 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });

  const metriche = page.getByTestId('metriche-portafoglio');
  await expect(metriche).toBeVisible();

  // Premessa: su tutto lo storico la scomposizione è disponibile, coi quattro
  // punti d'archivio (la rilevazione precedente, il carico, e le altre due
  // rilevazioni). Senza questa asserzione «un solo punto nell'ultimo mese»
  // sarebbe soddisfatto anche da un archivio vuoto, e il test non
  // proverebbe il ritaglio.
  await expect(grafico).toHaveAttribute('data-punti', '4');
  await expect(metriche).toHaveAttribute('data-stato', 'disponibile');

  await page.getByTestId('scala-mese').click();

  await expect(grafico).toHaveAttribute('data-scala', 'mese');
  await expect(metriche).toHaveAttribute('data-scala', 'mese');
  await expect(metriche).toHaveAttribute('data-stato', 'non-disponibile');

  // Il timbro, e nessun'altra cornice al suo posto
  const timbro = page.getByTestId('scomposizione-non-disponibile');
  await expect(timbro).toBeVisible();
  await expect(timbro).toHaveText('Dato non disponibile');

  // Nessuna delle tre cifre compare — né variazione, né versato, né mercato —
  // e nemmeno il solo capitale netto versato, che pure sarebbe calcolabile
  // con un punto solo (criterio 5, ultimo capoverso)
  await expect(page.getByTestId('variazione-valore')).toHaveCount(0);
  await expect(page.getByTestId('capitale-netto')).toHaveCount(0);
  await expect(page.getByTestId('movimento-mercato-valore')).toHaveCount(0);
  await expect(page.getByTestId('regolo-scomposizione')).toHaveCount(0);

  // La spiegazione dichiara quanti punti servono, letta dalla stessa costante
  // del titolo singolo (US-038) e non riscritta con lo stesso numero
  const spiegazione = page.getByTestId('metriche-portafoglio').locator('.perche-assente-scomposizione');
  await expect(spiegazione).toContainText('Punti compresi nella finestra: 1');
  await expect(spiegazione).toContainText(`Ne servono almeno ${RILEVAZIONI_MINIME_VARIAZIONE}`);
  await expect(spiegazione).toContainText('nemmeno zero');

  // Tornando a una scala più ampia le cifre ricompaiono: l'assenza era un
  // ritaglio, non un guasto
  await page.getByTestId('scala-tutto').click();
  await expect(metriche).toHaveAttribute('data-stato', 'disponibile');
  await expect(page.getByTestId('variazione-valore')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — un titolo mai rilevato: perimetro parziale (criterio 6)
// ---------------------------------------------------------------------------

test('un titolo detenuto e mai rilevato rende la scomposizione parziale, lo nomina, e tiene il suo carico fuori dai versamenti', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Metriche Portafoglio Perimetro Parziale');

  // Il titolo «mai rilevato» non deve avere alcuna riga in cache: finché ce
  // n'è una, il backfill d'avvio ne genera un'osservazione dal prezzo in
  // cache e il titolo risulterebbe valorizzato.
  archivio.rimuoviTitolo(ISIN_MAI_RILEVATO);
  archivio.seminaTitolo(ISIN, TITOLO_US_015_VARIANTI.campi);

  // Il titolo mai rilevato: caricato 90 giorni fa, 40 quote a 100 — se il suo
  // carico (4.000 euro) comparisse fra i versamenti, il movimento di mercato
  // ne assorbirebbe l'importo col segno rovesciato.
  await archivio.aggiungiPosizione(portfolioId, ISIN_MAI_RILEVATO, dataCivileIndietro(90), 100, 40);

  // Il titolo regolarmente rilevato: caricato 80 giorni fa, con una
  // rilevazione cinque giorni prima — non lo stesso «giorniFa» del carico,
  // che è ancorato alla mezzanotte UTC della sua data civile mentre la
  // rilevazione lo è al solo istante grezzo «adesso meno N giorni» — così è
  // valorizzato fin dal primo punto in cui risulta detenuto, e resta nel
  // perimetro per intero.
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(80), 50, 20);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 50, observed_at: adesso - 85 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_015_VARIANTI.campi.price!, // 45.6
      observed_at: adesso - 10 * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });
  await expect(grafico).toHaveAttribute('data-titoli', '2');

  const metriche = page.getByTestId('metriche-portafoglio');
  await expect(metriche).toBeVisible();
  await expect(metriche).toHaveAttribute('data-stato', 'disponibile');

  // Le tre cifre sono scritte — a differenza del caso della soglia — ma
  // dichiarate parziali
  await expect(metriche).toContainText('parziale');

  // Il carico del titolo mai rilevato (4.000 euro) resta fuori: il capitale
  // netto versato è esattamente quello del solo titolo compreso (20 × 50 =
  // 1.000), non 5.000. Se il bug esistesse — il carico escluso contato
  // comunque — questa cifra lo tradirebbe.
  // `toLocaleString('it-IT')` in questo ambiente non raggruppa le migliaia
  // sotto le cinque cifre: "1000,00", non "1.000,00" — la stessa resa già
  // asserita da `US-039__vista-valore-varianti.spec.ts` ('€ 3000,00').
  await expect(page.getByTestId('capitale-netto')).toHaveText('€+1000,00');

  // Il riquadro del perimetro nomina il titolo escluso — per ISIN, non
  // avendo mai un'anagrafica in cache — e conta correttamente 1 di 2
  const perimetro = page.getByTestId('perimetro-scomposizione');
  await expect(perimetro).toBeVisible();
  await expect(perimetro).toContainText('Escluso');
  await expect(perimetro).toContainText(ISIN_MAI_RILEVATO);
  await expect(perimetro).toContainText('1');
  await expect(perimetro).toContainText('2');

  // Il P&L complessivo del quadro del risultato ha un perimetro suo,
  // indipendente da quello della scomposizione: il sigillo resta scritto
  await expect(page.getByTestId('rimando-quadro-risultato')).toBeVisible();
});
