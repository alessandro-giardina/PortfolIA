import { chromium, type Browser } from 'playwright';
import type {
  MorningStarBundle,
  MorningStarRenderer,
  MorningStarSalData,
} from './morningStarTypes.js';

/**
 * Renderer reale verso MorningStar tramite browser headless (US-024).
 *
 * È l'unico modo per superare il muro anti-bot (Akamai) della fonte: una `fetch`
 * server-side riceve solo challenge a body vuoto. Il browser, con flag
 * anti-automazione e una navigazione di warm-up sulla home, ottiene il cookie
 * Akamai e può eseguire la SPA, che a sua volta chiama le API JSON `sal-service`
 * da cui intercettiamo i dati strutturati.
 *
 * Buona cittadinanza: un solo browser condiviso (singleton lazy), un context
 * effimero per ricerca, al più due navigazioni (ricerca + scheda). Solo host
 * `www.morningstar.com` (il sito `.it`/global blocca anche il browser headless).
 */

const SEARCH_BASE = 'https://www.morningstar.com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let browserPromise: Promise<Browser> | null = null;

/** Avvia (una sola volta) il browser headless condiviso. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    // Se l'avvio fallisce, azzera la cache così un lookup successivo può ritentare
    // invece di restare bloccato su una promise rifiutata.
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

/** Chiude il browser condiviso (da invocare allo shutdown del processo). */
export async function closeMorningStarBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    if (browser) await browser.close().catch(() => undefined);
  }
}

/** Deduce il tipo strumento dal segmento di percorso dell'URL della scheda. */
function instrumentTypeFromUrl(href: string): string | null {
  if (/\/funds\//i.test(href)) return 'Fund';
  if (/\/etfs\//i.test(href)) return 'ETF';
  if (/\/stocks\//i.test(href)) return 'Stock';
  return null;
}

/** Estrae i campi utili da un payload JSON `sal-service`, tollerante alla forma. */
function mergeSalPayload(into: MorningStarSalData, payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const p = payload as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
  into.baseCurrency ??= str(p.baseCurrency);
  into.categoryName ??= str(p.categoryName);
  into.domicileCountryId ??= str(p.domicileCountryId);
  into.asOfDate ??= str(p.asOfDate);
}

/**
 * Renderer di produzione iniettabile nell'adapter MorningStar.
 * Ritorna il bundle grezzo della scheda, `null` se nessuno strumento è risolto,
 * e lancia su blocco/timeout/errore (mappati a `error` dall'adapter).
 */
export const renderMorningStar: MorningStarRenderer = async (isin, { timeoutMs }) => {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
  });
  // Maschera il flag di automazione più ovvio.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const sal: MorningStarSalData = {};
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    // Intercetta i payload JSON delle API sal-service per i dati strutturati.
    page.on('response', (response) => {
      const url = response.url();
      if (!/sal-service\/fund\/performance\//i.test(url)) return;
      response
        .json()
        .then((json) => mergeSalPayload(sal, json))
        .catch(() => undefined);
    });

    // Warm-up: acquisisce il cookie anti-bot navigando la home.
    await page.goto(SEARCH_BASE + '/', { waitUntil: 'domcontentloaded' });

    // Ricerca per ISIN e risoluzione del link alla scheda strumento.
    await page.goto(`${SEARCH_BASE}/search?query=${encodeURIComponent(isin)}`, {
      waitUntil: 'domcontentloaded',
    });
    const href = await page
      .$$eval('a[href]', (as) =>
        as
          .map((a) => a.getAttribute('href'))
          .find((h) => !!h && /(funds|etfs|stocks)\/_\//i.test(h)),
      )
      .catch(() => null);
    if (!href) return null;

    const instrumentUrl = new URL(href, SEARCH_BASE).toString();
    await page.goto(instrumentUrl, { waitUntil: 'domcontentloaded' });
    // Lascia partire le chiamate XHR sal-service della SPA.
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const h1 = await page.$eval('h1', (el) => el.textContent?.trim() ?? null).catch(() => null);
    const priceText = await extractPriceText(page);
    const content = await page.content();
    const isinPresent = content.toUpperCase().includes(isin.toUpperCase());

    const bundle: MorningStarBundle = {
      instrumentUrl,
      instrumentType: instrumentTypeFromUrl(instrumentUrl),
      h1,
      priceText,
      isinPresent,
      sal,
    };
    return bundle;
  } finally {
    await context.close().catch(() => undefined);
  }
};

/** Best-effort: cerca il testo del prezzo/NAV tra alcuni selettori plausibili. */
async function extractPriceText(page: import('playwright').Page): Promise<string | null> {
  const selectors = [
    '[data-testid*="last-price"]',
    '[class*="last-price"]',
    '[class*="lastPrice"]',
    '.mdc-security-header__last-price',
  ];
  for (const sel of selectors) {
    const text = await page
      .$eval(sel, (el) => el.textContent?.trim() ?? null)
      .catch(() => null);
    if (text && /\d/.test(text)) return text;
  }
  return null;
}
