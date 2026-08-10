/**
 * US-009: le varianti dello storico dei prezzi osservati.
 *
 * Vivono in un file separato dallo scenario demo perché `launchOptions` (slowMo)
 * non è scopabile in un `describe`: Playwright lo consente solo a livello di file.
 * Qui i test girano a velocità piena e non producono video — sono i casi limite,
 * che nel filmato della spec sarebbero soltanto rumore.
 *
 * Quattro premesse, ognuna un criterio di accettazione:
 *  - una sola osservazione mostra comunque la tabella, con quella riga;
 *  - due prezzi diversi nello stesso giorno restano due osservazioni distinte;
 *  - una fonte non registrata è dichiarata tale, non attribuita alla primaria;
 *  - nessuna osservazione produce un vuoto dichiarato, non una tabella rotta.
 *
 * Titolo seminato: TITOLO_US_009_VARIANTI, riservato a questo file. Ogni scenario
 * ne semina lo storico da capo — `seminaOsservazioni` sostituisce quanto risulta —
 * così il conteggio asserito è una premessa garantita e non un'eredità.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_009_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_009_VARIANTI.isin;

/**
 * Due istanti dello stesso giorno civile di Roma, fissi e non relativi a "adesso":
 * un run a cavallo della mezzanotte locale li farebbe cadere in giorni diversi, e
 * lo scenario che li vuole nello stesso giorno perderebbe la sua premessa.
 */
const MATTINA = Math.floor(new Date('2026-08-05T09:31:00+02:00').getTime() / 1000);
const POMERIGGIO = Math.floor(new Date('2026-08-05T16:02:00+02:00').getTime() / 1000);

/** Apre la scheda del titolo dal riepilogo del portafoglio e la restituisce. */
async function apriSchedaTitolo(page: import('@playwright/test').Page, portfolioId: number) {
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();
  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });
  return scheda;
}

test('una sola osservazione mostra comunque la tabella, con quella riga marcata «unica»', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Storico Osservazione Unica');
  archivio.seminaTitolo(ISIN, TITOLO_US_009_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-06-03', 104.2, 60);

  archivio.seminaOsservazioni(ISIN, [
    { price: 118.42, observed_at: MATTINA, data_source: 'borsaitaliana' },
  ]);

  await apriSchedaTitolo(page, portfolioId);

  const storico = page.getByTestId('tabella-storico-prezzi');
  await expect(storico).toBeVisible();

  const righe = storico.locator('tbody tr');
  await expect(righe).toHaveCount(1);
  await expect(page.getByTestId('osservazione-prezzo-0')).toHaveText('€ 118,4200');
  // «unica» e non «ultima»: con una riga sola non c'è una penultima da cui
  // distinguerla, e la parola dice all'utente che lo storico parte da qui.
  await expect(righe.nth(0).locator('.postilla-ultima')).toHaveText('unica');

  // L'avviso spiega la radità invece di lasciar credere a un difetto della scheda
  await expect(page.getByTestId('avviso-storico-rado')).toContainText('parte da qui');
});

test('due prezzi diversi nello stesso giorno restano due osservazioni distinte', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Storico Stesso Giorno');
  archivio.seminaTitolo(ISIN, TITOLO_US_009_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-06-03', 104.2, 60);

  archivio.seminaOsservazioni(ISIN, [
    { price: 125.88, observed_at: MATTINA, data_source: 'morningstar' },
    { price: 127.31, observed_at: POMERIGGIO, data_source: 'borsaitaliana' },
  ]);

  await apriSchedaTitolo(page, portfolioId);

  const storico = page.getByTestId('tabella-storico-prezzi');
  await expect(storico.locator('tbody tr')).toHaveCount(2);

  // Ordine decrescente: il pomeriggio prima della mattina, pur nello stesso giorno
  await expect(page.getByTestId('osservazione-prezzo-0')).toHaveText('€ 127,3100');
  await expect(page.getByTestId('osservazione-prezzo-1')).toHaveText('€ 125,8800');

  // Ognuna dichiara la fonte che l'ha rilevata, e sono due fonti diverse
  await expect(storico.locator('tbody tr').nth(0).locator('.timbro-riga')).toHaveText('Borsa Italiana');
  const timbroBackup = storico.locator('tbody tr').nth(1).locator('.timbro-riga');
  await expect(timbroBackup).toHaveText('MorningStar (backup)');
  await expect(timbroBackup).toHaveClass(/di-backup/);
});

test('una osservazione senza fonte registrata è dichiarata tale, non attribuita alla primaria', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Storico Fonte Ignota');
  archivio.seminaTitolo(ISIN, TITOLO_US_009_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-06-03', 104.2, 60);

  archivio.seminaOsservazioni(ISIN, [
    { price: 122.4, observed_at: MATTINA, data_source: null },
  ]);

  await apriSchedaTitolo(page, portfolioId);

  const timbro = page.getByTestId('tabella-storico-prezzi').locator('tbody tr').nth(0).locator('.timbro-riga');
  await expect(timbro).toHaveText('Fonte non registrata');
  await expect(timbro).toHaveClass(/ignota/);
  // Il punto del criterio: assenza di fonte ≠ Borsa Italiana
  await expect(timbro).not.toHaveText('Borsa Italiana');
});

test('nessuna osservazione mostra la sezione con un vuoto dichiarato', async ({ page, archivio }) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Storico Vuoto');
  archivio.seminaTitolo(ISIN, TITOLO_US_009_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-06-03', 104.2, 60);

  // La premessa è asserita, non ereditata: senza questa rimozione una riga
  // lasciata dal backfill all'avvio del server farebbe passare il test per caso.
  archivio.rimuoviOsservazioni(ISIN);

  await apriSchedaTitolo(page, portfolioId);

  // La sezione c'è comunque: una tabella assente sarebbe indistinguibile da una
  // funzionalità che non ha caricato.
  const storico = page.getByTestId('tabella-storico-prezzi');
  await expect(storico).toBeVisible();
  await expect(page.getByTestId('storico-prezzi-vuoto')).toBeVisible();
  await expect(storico.locator('.timbro-riga')).toHaveCount(0);
  await expect(page.getByTestId('avviso-storico-rado')).toContainText('nessun prezzo risulta ancora rilevato');
});
