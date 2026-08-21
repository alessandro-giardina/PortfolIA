/**
 * US-065 — il conteggio e la coda di aggiornamento contano solo le posizioni
 * aperte.
 *
 * Il bug: «Stato dei rilevamenti» e il comando «Aggiorna i titoli obsoleti» di
 * `AggiornaObsoleti.tsx` leggevano `enrichedPositions` — ogni posizione mai
 * iscritta, comprese quelle chiuse per intero (`totalQuantity === 0`) — invece
 * di `posizioniAperte`. Un ISIN venduto per intero con un rilevamento ormai
 * vecchio entrava comunque nel conteggio e nella coda di un portafoglio che
 * non lo possiede più.
 *
 * Cinque scenari, nessun video (il file demo vive a parte):
 *  (a) posizioni aperte allineate + posizione chiusa obsoleta: il riquadro
 *      conta solo le aperte, il comando resta inattivo;
 *  (b) posizioni aperte obsolete + posizione chiusa obsoleta: la corsa di
 *      aggiornamento non interroga mai l'ISIN chiuso;
 *  (c) solo posizioni chiuse, nessuna aperta: zero titoli da aggiornare;
 *  (d) ripete (a) contro il design «quadro» invece che «mastro»;
 *  (e) «Posizioni chiuse» continua a elencare tutte le posizioni chiuse,
 *      invariata dal fix.
 *
 * Titoli seminati: `TITOLI_US_065_APERTI` e `TITOLI_US_065_CHIUSI`, riservati
 * a questo file (regola un-ISIN-per-file in `e2e/support/titoli.ts`). Lo
 * stesso ISIN aperto è riseminato con `fetched_at` diverso da uno scenario
 * all'altro — è sicuro, perché gli scenari di un file girano in serie
 * (`fullyParallel: false`).
 */
import { test, expect, type GestoreArchivio } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLI_US_065_APERTI, TITOLI_US_065_CHIUSI } from './support/titoli.js';

const ISIN_APERTI = TITOLI_US_065_APERTI.map((t) => t.isin);
const ISIN_CHIUSI = TITOLI_US_065_CHIUSI.map((t) => t.isin);

/**
 * Quattordici giorni indietro **da adesso**, non una data di calendario:
 * contengono sempre almeno una sessione di borsa conclusa, a qualunque ora e
 * in qualunque giorno la suite giri (stesso argomento di `RILEVATO_IL` in
 * `US-034__rilevamento-obsoleto.spec.ts` e `US-035__aggiorna-obsoleti.spec.ts`).
 */
const RILEVATO_IL = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);

/** Semina i due titoli aperti con `fetched_at` di adesso: sempre allineati. */
function seminaApertiAllineati(archivio: GestoreArchivio): void {
  for (const titolo of TITOLI_US_065_APERTI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi });
  }
}

/** Semina i due titoli aperti con `fetched_at` vecchio: sempre obsoleti. */
function seminaApertiObsoleti(archivio: GestoreArchivio): void {
  for (const titolo of TITOLI_US_065_APERTI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi, fetched_at: RILEVATO_IL });
  }
}

/** Semina i due titoli chiusi con `fetched_at` vecchio: il prezzo mai più rilevato dopo la vendita. */
function seminaChiusi(archivio: GestoreArchivio): void {
  for (const titolo of TITOLI_US_065_CHIUSI) {
    archivio.seminaTitolo(titolo.isin, { ...titolo.campi, fetched_at: RILEVATO_IL });
  }
}

/** Iscrive un carico e lo chiude per intero con una vendita che ne esaurisce l'intero residuo. */
async function chiudiPosizione(portfolioId: number, isin: string, quantita: number): Promise<void> {
  await registraVendita(portfolioId, isin, '2026-04-15', 50.0, quantita);
}

test.describe('conteggio e coda di aggiornamento: solo le posizioni aperte', () => {
  test('(a) posizioni aperte allineate e posizione chiusa obsoleta: il riquadro conta solo le aperte e il comando resta inattivo', async ({
    page,
    archivio,
  }) => {
    const { id: portfolioId } = await archivio.creaPortafoglio('Conteggio Solo Aperte');

    seminaApertiAllineati(archivio);
    seminaChiusi(archivio);

    for (const isin of ISIN_APERTI) {
      await archivio.aggiungiPosizione(portfolioId, isin, '2026-01-10', 60.0, 10);
    }
    // Il primo titolo chiuso: carico e poi vendita totale dell'intero residuo.
    await archivio.aggiungiPosizione(portfolioId, ISIN_CHIUSI[0], '2025-06-01', 40.0, 20);
    await chiudiPosizione(portfolioId, ISIN_CHIUSI[0], 20);

    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

    // Due sole posizioni aperte, entrambe allineate: la frase conta N = 2, non
    // N = 3 (che includerebbe la posizione chiusa e obsoleta).
    await expect(page.getByTestId('frase-conteggio')).toHaveText(
      'Tutti i 2 titoli sono allineati all’ultima sessione di borsa.',
    );

    // Il comando resta a schermo, spento, con la ragione scritta accanto: un
    // comando spento senza spiegazione sarebbe indistinguibile da un guasto.
    const comando = page.getByTestId('btn-aggiorna-obsoleti');
    await expect(comando).toBeDisabled();
    await expect(page.getByTestId('motivo-comando-inattivo')).toBeVisible();

    // Nessuna riga marcata: né le due aperte (allineate), né — per la stessa
    // ragione — l'ISIN chiuso, che non compare più in questa tabella.
    await expect(page.locator('[data-testid^="marca-rilevamento-"]')).toHaveCount(0);
    await expect(page.getByTestId(`riepilogo-${ISIN_CHIUSI[0]}`)).toHaveCount(0);
  });

  test('(b) posizioni aperte obsolete e posizione chiusa obsoleta: la corsa non interroga mai l’ISIN chiuso', async ({
    page,
    archivio,
  }) => {
    const { id: portfolioId } = await archivio.creaPortafoglio('Conteggio Coda Aggiornamento');

    seminaApertiObsoleti(archivio);
    seminaChiusi(archivio);

    for (const isin of ISIN_APERTI) {
      await archivio.aggiungiPosizione(portfolioId, isin, '2026-01-10', 60.0, 10);
    }
    await archivio.aggiungiPosizione(portfolioId, ISIN_CHIUSI[0], '2025-06-01', 40.0, 20);
    await chiudiPosizione(portfolioId, ISIN_CHIUSI[0], 20);
    await archivio.aggiungiPosizione(portfolioId, ISIN_CHIUSI[1], '2025-06-01', 40.0, 15);
    await chiudiPosizione(portfolioId, ISIN_CHIUSI[1], 15);

    const isinRichiesti: string[] = [];
    await page.route('**/api/securities/**', async (route) => {
      const isin = new URL(route.request().url()).pathname.split('/').pop() ?? '';
      isinRichiesti.push(isin);
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Titolo non trovato.' }),
      });
    });

    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('frase-conteggio')).toHaveText(
      '2 titoli su 2 con rilevamento obsoleto.',
    );

    const comando = page.getByTestId('btn-aggiorna-obsoleti');
    await expect(comando).toHaveText(/Aggiorna i titoli obsoleti \(2\)/);
    await comando.click();

    const consuntivo = page.getByTestId('consuntivo-aggiornamento');
    await expect(consuntivo).toBeVisible({ timeout: 15_000 });
    await expect(consuntivo).toContainText('Aggiornati 0 titoli su 2.');

    // Le due sole aperte sono state interrogate, mai gli ISIN chiusi — anche
    // se il loro rilevamento in cache è tanto vecchio quanto quello delle
    // aperte: sono stati esclusi per essere chiusi, non per essere freschi.
    expect(isinRichiesti.sort()).toEqual([...ISIN_APERTI].sort());
    expect(isinRichiesti).not.toContain(ISIN_CHIUSI[0]);
    expect(isinRichiesti).not.toContain(ISIN_CHIUSI[1]);
  });

  test('(c) solo posizioni chiuse, nessuna aperta: zero titoli da aggiornare', async ({
    page,
    archivio,
  }) => {
    const { id: portfolioId } = await archivio.creaPortafoglio('Conteggio Solo Chiuse');

    seminaChiusi(archivio);
    for (const isin of ISIN_CHIUSI) {
      await archivio.aggiungiPosizione(portfolioId, isin, '2025-06-01', 40.0, 12);
      await chiudiPosizione(portfolioId, isin, 12);
    }

    const isinRichiesti: string[] = [];
    await page.route('**/api/securities/**', async (route) => {
      isinRichiesti.push(new URL(route.request().url()).pathname.split('/').pop() ?? '');
      await route.fulfill({ status: 502, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('riepilogo-tutte-chiuse')).toBeVisible({ timeout: 8000 });

    // Il riquadro resta a schermo — uno spazio vuoto sarebbe indistinguibile da
    // una funzionalità che non ha caricato — ma dichiara zero titoli, e il
    // comando è inattivo con la ragione scritta accanto.
    const conteggio = page.getByTestId('conteggio-da-aggiornare');
    await expect(conteggio).toBeVisible();
    const comando = page.getByTestId('btn-aggiorna-obsoleti');
    await expect(comando).toHaveText(/Aggiorna i titoli obsoleti \(0\)/);
    await expect(comando).toBeDisabled();
    await expect(page.getByTestId('motivo-comando-inattivo')).toBeVisible();

    // Premerlo comunque non avvia nulla: il `disabled` è la difesa visibile, e
    // nessuna richiesta parte per gli ISIN chiusi.
    await comando.click({ force: true });
    await page.waitForTimeout(800);
    await expect(page.getByTestId('riga-lavoro')).toHaveCount(0);
    expect(isinRichiesti).toEqual([]);
  });

  test('(d) design «quadro»: lo stesso conteggio-solo-aperte vale anche fuori dal libro mastro', async ({
    page,
    archivio,
  }) => {
    const { id: portfolioId } = await archivio.creaPortafoglio('Conteggio Solo Aperte Quadro');

    seminaApertiAllineati(archivio);
    seminaChiusi(archivio);

    for (const isin of ISIN_APERTI) {
      await archivio.aggiungiPosizione(portfolioId, isin, '2026-01-10', 60.0, 10);
    }
    await archivio.aggiungiPosizione(portfolioId, ISIN_CHIUSI[0], '2025-06-01', 40.0, 20);
    await chiudiPosizione(portfolioId, ISIN_CHIUSI[0], 20);

    // La preferenza va impostata in `localStorage` prima della navigazione,
    // così lo script di bootstrap la applica prima ancora che React monti
    // (stesso pattern di `apriInQuadro` in `US-051__quadro-riepilogo.spec.ts`).
    await page.addInitScript(() => {
      localStorage.setItem('portfolia-design', 'quadro');
    });
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

    await expect(page.getByTestId('frase-conteggio')).toHaveText(
      'Tutti i 2 titoli sono allineati all’ultima sessione di borsa.',
    );
    const comando = page.getByTestId('btn-aggiorna-obsoleti');
    await expect(comando).toBeDisabled();
    await expect(page.getByTestId('motivo-comando-inattivo')).toBeVisible();
  });

  test('(e) «Posizioni chiuse» continua a elencare tutte le posizioni chiuse, invariata dal fix', async ({
    page,
    archivio,
  }) => {
    const { id: portfolioId } = await archivio.creaPortafoglio('Conteggio Tabella Chiuse Invariata');

    seminaApertiAllineati(archivio);
    seminaChiusi(archivio);

    await archivio.aggiungiPosizione(portfolioId, ISIN_APERTI[0], '2026-01-10', 60.0, 10);
    for (const isin of ISIN_CHIUSI) {
      await archivio.aggiungiPosizione(portfolioId, isin, '2025-06-01', 40.0, 18);
      await chiudiPosizione(portfolioId, isin, 18);
    }

    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

    // La tabella «Posizioni chiuse» elenca entrambi gli ISIN venduti per
    // intero: il fix tocca solo il riquadro e la coda di aggiornamento, mai
    // questa tabella.
    const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
    await expect(tabellaChiuse).toBeVisible();
    for (const isin of ISIN_CHIUSI) {
      await expect(page.getByTestId(`posizione-chiusa-${isin}`)).toBeVisible();
    }

    // E il conteggio in cima, per contrasto, riguarda la sola posizione aperta.
    await expect(page.getByTestId('frase-conteggio')).toHaveText(
      'L’unico titolo è allineato all’ultima sessione di borsa.',
    );
  });
});
