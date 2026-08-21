/**
 * US-056: quadro strumenti — gestione di un conto senza titoli.
 *
 * Prima di questa correzione, `RiepilogoQuadro` usciva con un `return`
 * anticipato per il caricamento e per l'elenco vuoto: né il collegamento
 * «Torna all'elenco portafogli» né il pannello «Gestione del conto» (rinomina
 * e zona pericolo) venivano mai resi in quei due casi, perché vivevano fuori
 * dal ramo condizionale ma dopo il `return` che lo precedeva. Un conto appena
 * creato — il caso in cui rinomina ed eliminazione servono più — non poteva
 * quindi raggiungerle senza passare dal «Libro Mastro».
 *
 * Copre, contro il solo design «quadro» (il «mastro» non ha mai avuto questo
 * problema — le due sezioni vivono già fuori dal ramo condizionale in
 * `RiepilogoMastro.tsx`):
 *  1. su un conto vuoto, placeholder, collegamento e pannello di gestione
 *     compaiono insieme;
 *  2. durante il caricamento transitorio delle posizioni, collegamento e
 *     pannello sono già presenti, non nascosti in attesa;
 *  3. rinomina ed eliminazione di un conto vuoto funzionano restando nel
 *     quadro dall'inizio alla fine;
 *  4. la parità fra le due rese: commutando design sullo stesso conto vuoto,
 *     le stesse possibilità di gestione restano disponibili in entrambe.
 *
 * Nessuna chiave ISIN: gli scenari non iscrivono alcun titolo, quindi non
 * toccano il registro `support/titoli.ts`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';

/**
 * Apre il portafoglio nel design «quadro», impostando la preferenza prima del
 * boot di React — come `apriInQuadro` di `US-051__quadro-riepilogo.spec.ts` —
 * cosicché il guscio quadro sia già montato al primo render, senza passare
 * dal commutatore.
 */
async function apriInQuadro(page: Page, id: number): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto(`/portfolio/${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
}

test('placeholder, collegamento e pannello di gestione compaiono insieme su un conto vuoto', async ({
  page,
  archivio,
}) => {
  const { id } = await archivio.creaPortafoglio('Quadro Conto Vuoto');

  await apriInQuadro(page, id);

  const vuoto = page.getByTestId('riepilogo-vuoto');
  await expect(vuoto).toBeVisible({ timeout: 8000 });
  await expect(vuoto).toContainText('Nessun titolo iscritto');

  await expect(page.getByRole('link', { name: /torna all.elenco portafogli/i })).toBeVisible();
  await expect(page.getByLabel('Rinomina conto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elimina portafoglio' })).toBeVisible();
});

test('durante il caricamento transitorio, collegamento e pannello di gestione sono già presenti', async ({
  page,
  archivio,
}) => {
  const { id } = await archivio.creaPortafoglio('Quadro Conto Caricamento');

  await page.route(`**/api/portfolios/${id}/positions/enriched`, async (route) => {
    await new Promise((risolvi) => setTimeout(risolvi, 1500));
    await route.continue();
  });

  await apriInQuadro(page, id);

  // Il messaggio d'attesa resta visibile mentre la richiesta è ritardata:
  // qui la scheda deve già mostrare collegamento e gestione, non solo dopo.
  await expect(page.getByText('Caricamento titoli…')).toBeVisible();
  await expect(page.getByRole('link', { name: /torna all.elenco portafogli/i })).toBeVisible();
  await expect(page.getByLabel('Rinomina conto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elimina portafoglio' })).toBeVisible();

  // La richiesta ritardata si conclude e la scheda passa al placeholder vuoto.
  await expect(page.getByTestId('riepilogo-vuoto')).toBeVisible({ timeout: 8000 });
});

test('rinomina ed eliminazione di un conto vuoto funzionano restando nel quadro dall\'inizio alla fine', async ({
  page,
  archivio,
}) => {
  const { id, name: nomeOriginale } = await archivio.creaPortafoglio('Quadro Conto Gestione');
  const nuovoNome = `${nomeOriginale}-Rinominato`;

  await apriInQuadro(page, id);

  // L'intestazione del guscio quadro (le briciole, non l'`h1` di
  // `RiepilogoQuadro` — quello resta legato alla presenza di posizioni, che
  // qui non ci sono) è l'effetto osservabile della rinomina.
  await expect(page.locator('.briciole b')).toHaveText(`Conto ${nomeOriginale}`, { timeout: 8000 });

  const input = page.getByLabel('Rinomina conto');
  await input.fill(nuovoNome);
  await page.getByRole('button', { name: 'Salva' }).click();

  await expect(page.locator('.briciole b')).toHaveText(`Conto ${nuovoNome}`, { timeout: 8000 });
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');

  // Eliminazione, con la stessa guardia `window.confirm` del mastro (US-006).
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Elimina portafoglio' }).click();

  // Il redirect riporta alla dashboard restando nel design quadro: nessuna
  // ricarica di pagina attraversa il commutatore.
  await expect(page).toHaveURL('/', { timeout: 8000 });
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByText(nuovoNome)).not.toBeVisible();
});

test('parità quadro/mastro: le stesse possibilità di gestione restano disponibili commutando design sullo stesso conto vuoto', async ({
  page,
  archivio,
}) => {
  const { id } = await archivio.creaPortafoglio('Quadro Mastro Parità');

  await apriInQuadro(page, id);
  await expect(page.getByLabel('Rinomina conto')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Elimina portafoglio' })).toBeVisible();

  await page.getByRole('button', { name: /libro mastro/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');

  await expect(page.getByLabel('Rinomina conto')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Elimina portafoglio' })).toBeVisible();
});
