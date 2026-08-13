/**
 * US-020 — selezionare la scala temporale del grafico del portafoglio: scenario
 * dimostrativo (TASK-09).
 *
 * Riproduce `docs/mockups/US-020/index.html`: un portafoglio la cui storia
 * comincia meno di un anno fa, guardato sulla scala «ultimi 10 anni». È il caso
 * in cui la spec guadagna qualcosa che US-037 non aveva già dato, perché per un
 * **aggregato** la copertura ha due dimensioni indipendenti:
 *
 *  - **I, il tempo**: l'orizzonte chiesto è più lungo della storia disponibile,
 *    e il grafico dichiara *da quando i dati esistono* invece di lasciar credere
 *    che dieci anni di asse siano dieci anni di dati (criterio 5);
 *  - **II, il perimetro**: dentro i giorni che l'archivio copre, per un tratto
 *    non ogni titolo detenuto ha un prezzo noto, e la data da cui il perimetro
 *    è completo è **un'altra** (criterio 6).
 *
 * Le due date sono diverse per costruzione, ed è questo che il video deve far
 * vedere: due regoli, due denominatori scritti, nessuna media fra i due.
 *
 * Le premesse sono in **giorni indietro da adesso** e non in date assolute, per
 * la stessa ragione registrata in `US-019__grafico-portafoglio-varianti.spec.ts`:
 * qui l'intero contenuto dello scenario è il rapporto d'ordine fra «meno di un
 * anno di storia» e «dieci anni chiesti», e una data scritta a mano invecchia
 * fino a non reggerlo più.
 *
 * Titoli seminati: `TITOLO_US_020` e `TITOLO_US_020_SECONDO`, riservati a questo
 * file. Il seme porta `fetched_at` di **adesso** (il default di `seminaTitolo`):
 * una riga scaduta farebbe ricontattare la fonte reale — 8-12 secondi e un esito
 * non deterministico — proprio mentre gira la registrazione.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_020, TITOLO_US_020_SECONDO } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 350 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di `test.use()` (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-020/demo-scala-portafoglio.webm');
});

const ISIN_1 = TITOLO_US_020.isin;
const ISIN_2 = TITOLO_US_020_SECONDO.isin;
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

const MESI_ROMANI = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
];

/**
 * Una data civile `YYYY-MM-DD` nel formato del registro (`19.IX.2025`).
 *
 * Rispecchia deliberatamente `dataCarico` di `client/src/components/Foglio.tsx`
 * senza importarla: le premesse di questo scenario sono relative a «adesso»,
 * quindi la data attesa va calcolata e non può essere scritta a mano come nei
 * file demo a date assolute. Spezza la stringa invece di costruire una `Date`,
 * per la ragione già documentata su `dataCarico`: passare da una `Date` la
 * riporterebbe in un fuso e la stessa data cadrebbe al giorno prima a ogni
 * offset negativo.
 */
function dataRegistroCivile(dataCivile: string): string {
  const [anno, mese, giorno] = dataCivile.split('-').map(Number);
  return `${String(giorno).padStart(2, '0')}.${MESI_ROMANI[mese - 1]}.${anno}`;
}

/**
 * Un istante reale (unix secondi) nel formato del registro, letto in fuso
 * **locale** — è così che il grafico rende la data di una rilevazione
 * (`dataIstante` → `dataRegistro`).
 */
function dataRegistroIstante(unixSecondi: number): string {
  const d = new Date(unixSecondi * 1000);
  return `${String(d.getDate()).padStart(2, '0')}.${MESI_ROMANI[d.getMonth()]}.${d.getFullYear()}`;
}

// ─── Lo scenario di docs/mockups/US-020/index.html ──────────────────────────
// Una storia di 300 giorni — meno di un anno — dentro una finestra di dieci
// anni. Il secondo titolo entra a registro 100 giorni dopo il primo e resta
// senza prezzo noto fino alla sua unica rilevazione: da lì, e non prima, il
// perimetro è completo.

const CARICO_1 = { giorniFa: 300, prezzo: 7.5, quantita: 80 };
const CARICO_2 = { giorniFa: 200, prezzo: 60, quantita: 40 };

const RILEVAZIONE_1A = { giorniFa: 120, prezzo: 8.1 };
const RILEVAZIONE_2 = { giorniFa: 60, prezzo: TITOLO_US_020_SECONDO.campi.price! };
const RILEVAZIONE_1B = { giorniFa: 3, prezzo: TITOLO_US_020.campi.price! };

test('demo: su una scala più lunga della storia disponibile il grafico dichiara da quando i dati esistono, e separatamente da quando il perimetro è completo', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Scala Portafoglio');

  // ─── Premesse possedute dal test, non ereditate ───────────────────────────
  archivio.seminaTitolo(ISIN_1, TITOLO_US_020.campi);
  archivio.seminaTitolo(ISIN_2, TITOLO_US_020_SECONDO.campi);

  const dataCarico1 = dataCivileIndietro(CARICO_1.giorniFa);
  await archivio.aggiungiPosizione(portfolioId, ISIN_1, dataCarico1, CARICO_1.prezzo, CARICO_1.quantita);
  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN_2,
    dataCivileIndietro(CARICO_2.giorniFa),
    CARICO_2.prezzo,
    CARICO_2.quantita,
  );

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il numero dei
  // punti e le date di copertura sono premesse garantite, non un'eredità del
  // backfill d'avvio o di un run precedente.
  const adesso = archivio.leggiTitolo(ISIN_1)!.fetched_at;
  const istanteRilevazione2 = adesso - RILEVAZIONE_2.giorniFa * GIORNO_IN_SECONDI;

  archivio.seminaOsservazioni(ISIN_1, [
    {
      price: RILEVAZIONE_1A.prezzo,
      observed_at: adesso - RILEVAZIONE_1A.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      price: RILEVAZIONE_1B.prezzo,
      observed_at: adesso - RILEVAZIONE_1B.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
  ]);
  archivio.seminaOsservazioni(ISIN_2, [
    { price: RILEVAZIONE_2.prezzo, observed_at: istanteRilevazione2, data_source: 'borsaitaliana' },
  ]);

  // 1. Il portafoglio si apre già sulla scheda Riepilogo
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  const sezione = page.locator('.sezione-titolo').filter({ hasText: 'Andamento del portafoglio' });
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();

  // 2. All'apertura la scala è «tutto lo storico» (criterio 2): la sola che non
  //    ritagli nulla, quindi l'unica che non possa nascondere un punto senza dirlo
  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible();
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(page.getByTestId('scala-tutto')).toHaveAttribute('aria-pressed', 'true');
  await expect(grafico.locator('.cartellino-finestra')).toContainText('tutto lo storico');

  // Cinque date d'evento: due carichi e tre rilevazioni
  await expect(grafico).toHaveAttribute('data-titoli', '2');
  await expect(grafico).toHaveAttribute('data-punti', '5');

  await page.waitForTimeout(900);

  // 3. Su «tutto lo storico» la prima dimensione è piena: l'archivio copre
  //    l'intera finestra, perché la finestra *è* la storia. È la premessa che
  //    rende non banale ciò che succede al passo successivo.
  const regoloTempo = page.getByTestId('regolo-tempo');
  await regoloTempo.scrollIntoViewIfNeeded();
  await expect(regoloTempo).toHaveAttribute('data-verdetto', 'piena');

  await page.waitForTimeout(900);

  // 4. L'utente sceglie «Ultimi 10 anni»: un orizzonte molto più lungo della
  //    storia disponibile
  const bottoneDieciAnni = page.getByTestId('scala-dieci-anni');
  await bottoneDieciAnni.scrollIntoViewIfNeeded();
  await bottoneDieciAnni.click();

  await expect(grafico).toHaveAttribute('data-scala', 'dieci-anni');
  await expect(bottoneDieciAnni).toHaveAttribute('aria-pressed', 'true');
  await expect(grafico.locator('.cartellino-finestra')).toContainText('ultimi 10 anni');

  // Nessun punto è andato perduto: la finestra si è allargata, non ristretta —
  // ciò che cambia è quanta parte dell'asse l'archivio *non* copre.
  await expect(grafico).toHaveAttribute('data-punti', '5');

  await page.waitForTimeout(900);

  // 5. DIMENSIONE I — il tempo. Il grafico dichiara da quando i dati esistono,
  //    invece di suggerire dieci anni di copertura
  await expect(regoloTempo).toHaveAttribute('data-verdetto', 'parziale');
  await expect(regoloTempo).toContainText(`i dati cominciano il ${dataRegistroCivile(dataCarico1)}`);
  await expect(regoloTempo).toContainText('giorni civili scoperti su');

  // La zona fuori archivio è campita dentro la cornice, non solo dichiarata a
  // parole: l'asse resta lungo dieci anni e il tratto scoperto si vede.
  await expect(grafico.getByTestId('zona-fuori-archivio')).toBeVisible();

  await page.waitForTimeout(1000);

  // 6. DIMENSIONE II — il perimetro. Un verdetto separato, con la propria data:
  //    quella da cui *entrambi* i titoli detenuti hanno un prezzo noto
  const regoloPerimetro = page.getByTestId('regolo-perimetro');
  await regoloPerimetro.scrollIntoViewIfNeeded();
  await expect(regoloPerimetro).toHaveAttribute('data-verdetto', 'parziale');
  await expect(regoloPerimetro).toContainText(
    `perimetro completo dal ${dataRegistroIstante(istanteRilevazione2)}`,
  );

  // Le due date sono diverse, ed è il punto della spec: sapere da quando ci
  // sono dati non dice affatto da quando il perimetro è completo.
  expect(dataRegistroIstante(istanteRilevazione2)).not.toBe(dataRegistroCivile(dataCarico1));

  await page.waitForTimeout(1000);

  // 7. I due denominatori sono scritti entrambi, e sono diversi: la seconda
  //    domanda si misura *dentro* la prima, quindi i due numeri non si mediano
  await expect(page.getByTestId('denominatore-tempo')).toContainText(
    'giorni della finestra chiesta',
  );
  await expect(page.getByTestId('denominatore-perimetro')).toContainText(
    'giorni coperti dall’archivio',
  );

  const sigillo = page.getByTestId('sigillo-due-dimensioni');
  await sigillo.scrollIntoViewIfNeeded();
  await expect(sigillo).toContainText('non si deducono l’uno dall’altro');

  // Pausa finale: lo stato resta nel fotogramma registrato, invece di essere
  // spazzato via dal teardown un istante dopo l'ultima asserzione.
  await page.waitForTimeout(1500);
});
