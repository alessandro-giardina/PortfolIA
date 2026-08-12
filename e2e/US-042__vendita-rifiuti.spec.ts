/**
 * US-042: i rifiuti della vendita, il carico consumato e il residuo nel riepilogo
 * — le varianti dello scenario dimostrativo, senza video.
 *
 * Quattro cose, e nessuna implica le altre.
 *
 * **I due rifiuti sono due** (criteri 4 e 5). «Operazione non consentita» sarebbe
 * corretto in entrambi i casi e inutile in entrambi: la correzione è la *quantità*
 * quando le quote non ci sono affatto, e la *data* quando ci sono ma sono state
 * caricate dopo. L'asserzione che tiene distinti i due messaggi non è che ciascuno
 * contenga una parola: è che i due testi **non coincidano**, confrontati fra loro.
 * Due `toContainText('non è possibile')` passerebbero anche su un messaggio solo.
 *
 * **Il rifiuto non lascia tracce.** Un rifiuto che iscrivesse comunque la riga, o
 * che ne iscrivesse una parziale, produrrebbe un banner rosso e un archivio
 * sbagliato — cioè il caso peggiore, perché l'utente ha appena letto che non è
 * stato registrato nulla. L'elenco delle vendite va quindi riletto dopo ogni
 * rifiuto.
 *
 * **Il carico consumato è impedito da entrambi i lati.** Nella pagina i due
 * comandi sono inerti; via API la stessa richiesta risponde **409**. Provare solo
 * il primo lascerebbe scoperto chi chiama l'API, e provare solo il secondo
 * lascerebbe un bottone che sembra funzionare. E il lotto **intatto** deve restare
 * rimovibile: una guardia scritta per ISIN invece che per lotto passerebbe i primi
 * tre casi e romperebbe FR-009 senza rompere nulla di visibile.
 *
 * **Il valore attuale si misura sulle quote residue.** È il difetto più insidioso
 * della spec: calcolarlo sulle quote *caricate* darebbe un totale plausibile e
 * troppo alto, e nessuna cifra a schermo lo dichiarerebbe. Peggio ancora sarebbe
 * sommarci l'incasso della vendita: PortfolIA tiene i titoli, non la cassa
 * (ADR-009). Lo scenario pinna quindi il totale al valore esatto delle sole quote
 * residue, che è anche il modo di verificare che l'incasso **non** vi compaia.
 *
 * Titolo seminato: TITOLO_US_042_RIFIUTI, riservato a questo file — non condiviso
 * con lo scenario dimostrativo, che pretende un registro in cui le vendite
 * riescono, mentre qui i primi due casi pretendono un registro in cui nessuna
 * vendita è ancora andata a buon fine.
 */
import { test, expect } from './support/fixtures.js';
import {
  elencaPosizioni,
  elencaVendite,
  registraVendita,
  tentaRimozionePosizione,
  tentaVendita,
} from './support/api.js';
import { TITOLO_US_042_RIFIUTI } from './support/titoli.js';

const ISIN = TITOLO_US_042_RIFIUTI.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/** La data civile di `giorni` fa in `YYYY-MM-DD` UTC (stessa ragione di US-039). */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/**
 * I due carichi: 600 quote a € 9,8000 il più antico, 400 a € 11,5000 il più
 * recente. La distanza fra i due giorni è ciò che rende scrivibile il criterio 5 —
 * serve una data *in mezzo*, dove una parte delle quote non era ancora stata
 * caricata.
 */
const CARICHI = [
  { giorniFa: 1200, prezzo: 9.8, quantita: 600 },
  { giorniFa: 500, prezzo: 11.5, quantita: 400 },
];
const QUANTITA_TOTALE = CARICHI[0].quantita + CARICHI[1].quantita; // 1.000

/** Una data compresa fra i due carichi: là risultano detenute solo 600 quote. */
const DATA_FRA_I_CARICHI = dataCivileIndietro(800);
/** Una data successiva a entrambi i carichi. */
const DATA_DOPO_I_CARICHI = dataCivileIndietro(60);

/**
 * Il prezzo seminato in cache, dichiarato qui invece di essere riletto dal seme.
 *
 * `campi.price` è `number | null` — un titolo senza prezzo è un caso legittimo di
 * quel tipo — e lo scenario del valore attuale non è scrivibile senza un prezzo:
 * fissarlo come costante rende la premessa esplicita e verificata dall'asserzione
 * qui sotto, invece di affidarla a un'asserzione di non-nullità.
 */
const PREZZO_SEMINATO = 108.2;

// ---------------------------------------------------------------------------
// I due rifiuti, dalla pagina
// ---------------------------------------------------------------------------

test('rifiuta la vendita di una quantità superiore alla disponibile, nominando la disponibile e senza iscrivere nulla', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_042_RIFIUTI.campi);
  const portafoglio = await archivio.creaPortafoglio('US042-Rifiuto-Quantita');
  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('scarico-titolo')).toBeVisible({ timeout: 8000 });

  await page.getByTestId('scarico-data').fill(DATA_DOPO_I_CARICHI);
  await page.getByTestId('scarico-prezzo').fill('12.5');
  await page.getByTestId('scarico-quantita').fill(String(QUANTITA_TOTALE + 200));
  await page.getByTestId('btn-iscrive-scarico').click();

  const banner = page.getByTestId('scarico-errore');
  await expect(banner).toBeVisible({ timeout: 8000 });
  // Il messaggio nomina la quantità disponibile: chi legge deve sapere a quale
  // cifra correggere, non solo che la sua è sbagliata.
  await expect(banner).toContainText(String(QUANTITA_TOTALE));
  await expect(banner).toContainText(String(QUANTITA_TOTALE + 200));

  // Nessuna iscrizione, e la quantità residua è ancora quella dei carichi.
  expect(await elencaVendite(portafoglio.id)).toEqual([]);
  await expect(page.getByTestId(`summary-${ISIN}`)).toContainText(String(QUANTITA_TOTALE));
});

test('rifiuta la vendita anteriore al carico che dovrebbe consumare, con un messaggio distinto da quello della quantità', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_042_RIFIUTI.campi);
  const portafoglio = await archivio.creaPortafoglio('US042-Rifiuto-Data');
  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  // 800 quote su 1.000 caricate: la giacenza complessiva basterebbe. Alla data
  // scelta però il secondo carico non era ancora avvenuto, e ne risultano 600.
  const anteriore = await tentaVendita(portafoglio.id, ISIN, DATA_FRA_I_CARICHI, 10.5, 800);
  expect(anteriore.stato).toBe(400);
  expect(anteriore.errore).toContain(String(CARICHI[0].quantita));
  expect(anteriore.errore).toContain('data');

  // L'altro rifiuto, sullo stesso registro: i due testi devono differire, ed è la
  // sola asserzione che li tiene distinti.
  const eccedente = await tentaVendita(portafoglio.id, ISIN, DATA_DOPO_I_CARICHI, 12.5, 1200);
  expect(eccedente.stato).toBe(400);
  expect(eccedente.errore).not.toBe(anteriore.errore);

  // Nessuno dei due ha lasciato traccia.
  expect(await elencaVendite(portafoglio.id)).toEqual([]);

  // E la pagina mostra il rifiuto della data così com'è, senza riassumerlo.
  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('scarico-titolo')).toBeVisible({ timeout: 8000 });
  await page.getByTestId('scarico-data').fill(DATA_FRA_I_CARICHI);
  await page.getByTestId('scarico-prezzo').fill('10.5');
  await page.getByTestId('scarico-quantita').fill('800');
  await page.getByTestId('btn-iscrive-scarico').click();
  await expect(page.getByTestId('scarico-errore')).toContainText('data', { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Il carico consumato: inerte nella pagina, 409 via API
// ---------------------------------------------------------------------------

test('impedisce di rimuovere un carico consumato — comandi inerti e 409 via API — lasciando rimovibile il lotto intatto', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_042_RIFIUTI.campi);
  const portafoglio = await archivio.creaPortafoglio('US042-Carico-Consumato');
  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  // Una vendita che consuma per intero il lotto più recente e lascia intatto
  // l'altro: la coppia che rende osservabili entrambi gli esiti nello stesso
  // registro.
  await registraVendita(portafoglio.id, ISIN, DATA_DOPO_I_CARICHI, 12.5, CARICHI[1].quantita);

  const carichi = (await elencaPosizioni(portafoglio.id)).sort((a, b) =>
    a.loadDate < b.loadDate ? -1 : 1,
  );
  const [intatto, consumato] = carichi;

  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();

  // Nella pagina: i due comandi restano visibili e inerti, con la ragione sotto.
  const modifica = page.getByTestId(`btn-modifica-${consumato.id}`);
  const rimuovi = page.getByTestId(`btn-rimuovi-${consumato.id}`);
  await expect(modifica).toBeVisible({ timeout: 8000 });
  await expect(modifica).toBeDisabled();
  await expect(rimuovi).toBeVisible();
  await expect(rimuovi).toBeDisabled();
  await expect(rimuovi).toHaveClass(/impedito/);
  await expect(page.getByTestId(`perche-impedito-${consumato.id}`)).toContainText('vendita');

  // Il lotto intatto non è stato toccato dalla guardia.
  await expect(page.getByTestId(`btn-rimuovi-${intatto.id}`)).toBeEnabled();

  // Via API la stessa richiesta risponde 409, e il messaggio distingue la
  // correzione di un'iscrizione errata dalla vendita.
  const impedita = await tentaRimozionePosizione(portafoglio.id, consumato.id);
  expect(impedita.stato).toBe(409);
  expect(impedita.errore).toContain('errata');
  expect(impedita.errore).toContain('vendita');

  // Il carico è ancora là: il 409 non ha rimosso nulla.
  expect((await elencaPosizioni(portafoglio.id)).map((p) => p.id)).toContain(consumato.id);

  // E il lotto intatto resta rimovibile: FR-009 non è stato sospeso.
  const consentita = await tentaRimozionePosizione(portafoglio.id, intatto.id);
  expect(consentita.stato).toBe(204);
});

// ---------------------------------------------------------------------------
// Il residuo nel riepilogo
// ---------------------------------------------------------------------------

test('misura il valore attuale sulle quote residue, e l\'incasso della vendita non compare in alcun totale', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_042_RIFIUTI.campi);
  // La premessa asserita e non ereditata: il valore attuale è calcolabile solo
  // se il prezzo in cache è quello che questo scenario crede di averci messo.
  expect(archivio.leggiTitolo(ISIN)?.price).toBe(PREZZO_SEMINATO);
  const portafoglio = await archivio.creaPortafoglio('US042-Residuo-Riepilogo');
  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  const quantitaVenduta = CARICHI[1].quantita; // 400
  const prezzoVendita = 12.5;
  await registraVendita(portafoglio.id, ISIN, DATA_DOPO_I_CARICHI, prezzoVendita, quantitaVenduta);
  const residuo = QUANTITA_TOTALE - quantitaVenduta; // 600

  // Il valore atteso: prezzo in cache × quote **residue**. Calcolarlo sulle quote
  // caricate darebbe una cifra più alta e plausibile, e nulla a schermo la
  // smentirebbe.
  const valoreAtteso = (PREZZO_SEMINATO * residuo).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const valoreSuQuoteCaricate = (PREZZO_SEMINATO * QUANTITA_TOTALE).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const incasso = (prezzoVendita * quantitaVenduta).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();

  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await expect(riga).toContainText(String(residuo));
  await expect(riga).toContainText(valoreAtteso);

  const totale = page.getByTestId('valore-totale-portafoglio');
  await expect(totale).toContainText(valoreAtteso);
  // Le due cifre che non devono comparire: il valore sulle quote caricate e
  // l'incasso della vendita, che PortfolIA non trattiene come liquidità.
  await expect(totale).not.toContainText(valoreSuQuoteCaricate);
  await expect(totale).not.toContainText(incasso);
});
