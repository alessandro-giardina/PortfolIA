/**
 * Smoke test LIVE della fonte di backup MorningStar (US-024).
 *
 * NON fa parte della suite CI: avvia un browser reale e contatta la rete, quindi
 * è soggetto a latenza (~8-12s) e all'affidabilità best-effort del challenge
 * anti-bot. Serve a dimostrare a mano il `Demonstrates` della spec.
 *
 * Uso:
 *   npx tsx server/scripts/morningstar-smoke.ts [ISIN]
 * (default ISIN: IE00BJRHVJ28 — presente solo su MorningStar, non su Borsa Italiana)
 */
import { fetchSecurityByIsin } from '../src/market/morningStarAdapter.js';
import { closeMorningStarBrowser } from '../src/market/morningStarBrowser.js';

const isin = process.argv[2] ?? 'IE00BJRHVJ28';

console.log(`[smoke] interrogo MorningStar (browser) per ${isin}…`);
const started = Date.now();
const result = await fetchSecurityByIsin(isin);
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`[smoke] esito in ${elapsed}s:`, JSON.stringify(result, null, 2));
await closeMorningStarBrowser();

if (result.status !== 'found') {
  console.error(`[smoke] ATTESO 'found' per ${isin}, ottenuto '${result.status}'.`);
  process.exit(1);
}
console.log('[smoke] OK — fonte di backup MorningStar funzionante.');
