# PortfolIA — Developer Guide

## Prerequisites

- **Node.js 20 LTS** (`node --version` should show `v20.x`)
- `npm` 10+ (bundled with Node 20)
- **Chromium per Playwright** (`npx playwright install chromium`): la fonte di backup MorningStar è raggiungibile solo via browser headless (US-024). Installa il binario una volta dopo `npm install`.

## Fonte di backup MorningStar (US-024)

Quando Borsa Italiana non trova un ISIN, l'app interroga MorningStar come backup tramite un **browser headless** (Playwright/Chromium) — è l'unico modo per superare il muro anti-bot (Akamai) della fonte. Costi noti da tenere presenti in esercizio:

- **Dipendenza runtime:** `playwright` è una dipendenza del server (non più solo per gli E2E) e richiede il binario Chromium (~300MB) installato sull'host.
- **Latenza:** ~8-12s per una ricerca di backup "a freddo" (warm-up + navigazione + render della SPA). Il percorso primario (Borsa Italiana) resta veloce; il browser parte solo quando serve il fallback.
- **Affidabilità best-effort:** il challenge anti-bot può comunque fallire a intermittenza; in quel caso l'adapter degrada in modo trasparente (`not-found`/`error`), senza dati inventati.

Smoke test live a mano (fuori dalla suite CI, contatta la rete reale):

```bash
npx tsx server/scripts/morningstar-smoke.ts IE00BJRHVJ28
```

## Starting the app

```bash
npm run dev
```

Starts both the Fastify backend (port 3200) and the Vite frontend (port 5173) concurrently.

## Running unit tests

```bash
npm run test
```

Runs the Vitest suite in `server/tests/` (unit + integration).

## Running E2E tests

```bash
npx playwright test
```

Runs the Playwright tests in `e2e/`. Requires no running server — the webServer config starts it automatically.

### Test data: use the `archivio` fixture, never `try/finally`

The suite shares a dev database with the running server, so every test must leave the archive exactly as it found it. `e2e/support/` exists for that, and it is the only sanctioned way to touch test data:

| Module | What it gives you |
|---|---|
| `support/api.ts` | The HTTP helpers (`creaPortafoglio`, `aggiungiPosizione`, `eliminaPortafoglio`, `elencaPortafogli`, …), defined once. Do **not** re-declare them in a spec file. |
| `support/archivio.ts` | Direct primitives on the `securities` price cache (`seminaTitolo`, `rimuoviTitolo`, `ripristinaTitoli`). Test-only, never imported by the server. |
| `support/nomi.ts` | `nomeUnico(prefisso)` — unique per worker and per run. |
| `support/fixtures.ts` | The extended `test` carrying the `archivio` fixture. Import `test`/`expect` from here, not from `@playwright/test`. |

Three rules follow, and each one exists because its absence caused a real defect:

- **Clean up in the fixture, not in a `finally` block.** Playwright runs fixture teardown even when a test times out or an assertion throws; a `finally` block in those cases is never reached. That difference is how the archive silently accumulated 57 orphan portfolios. Use `await archivio.creaPortafoglio('Prefisso')` and let teardown remove it. When the *UI* creates the portfolio and the test has no id, reserve the name with `archivio.nomeUnico('Prefisso')` — teardown then finds it by name (matching by substring, so a renamed portfolio is still collected).
- **Never hard-code a resource name.** A fixed name (`'Conto Unico'`) exists on the second run, so the test silently starts exercising a different path than the one it claims to. `nomeUnico()` removes that failure class by construction.
- **Never assume what is in the price cache.** Assert the premise instead of inheriting it: `archivio.rimuoviTitolo(isin)` for a guaranteed cache miss, `archivio.seminaTitolo(isin, { price })` for a known expected value. The fixture restores the prior state either way. See `e2e/US-014__valore-totale-portafoglio.spec.ts`, where both directions were previously true only by accident.
- **One seeded ISIN per spec file — never share a key across files.** Playwright runs *files* in parallel across workers (`fullyParallel: false` only serialises within a file), and seed-then-restore is an undo stack: if two files seed the same ISIN and interleave, the last one to restore rolls back to the *other* file's seed rather than to the original, leaving residue no conditional check can undo. `e2e/support/titoli.ts` therefore assigns each file its own constant. Seeding the same ISIN repeatedly *inside* one file is safe.

Seeding also has a second effect worth knowing: `seminaTitolo` stamps `fetched_at` to now. A stale timestamp makes the server classify the cache as expired and re-contact the real source — Borsa Italiana, then headless MorningStar, 8-12 seconds — which is both slow and non-deterministic. Any test that merely passes *through* the ISIN search on its way somewhere else should seed the security first.

`playwright.config.ts` also registers `globalSetup: './e2e/support/bonifica.ts'`, which removes suite-generated residue before the run. It is the safety net for a run killed with SIGKILL, when not even teardown can execute — not a substitute for the fixture.

### Test artifacts

Everything under `docs/test-results/` is **not versioned** — the whole directory is gitignored. Artifacts are regenerated on every run, so to review a spec's demo video just run the suite and open the file locally.

Two distinct destinations, and the distinction matters:

| Path | Content | Lifetime |
|---|---|---|
| `docs/test-results/_run/` | Transient run artifacts: traces, error context, videos of failing tests. Set by `outputDir` in `playwright.config.ts`. | **Wiped by Playwright at the start of every run.** |
| `docs/test-results/<US-CODE>/` | The curated demo video of a spec. | Survives across runs. |

Two rules follow from this:

- **Never point `outputDir` at a spec folder.** Earlier specs each moved it to their own folder (`US-001` → `US-003` → … → `US-008`); whichever spec held the pointer collected every other spec's artifacts and had them deleted on the next run. It now points at `_run/` and should stay there.
- **A demo test saves its video explicitly.** `outputDir` is *not* a valid `test.use()` option (it is project/config-level only and gets silently ignored), so use `page.video().saveAs('docs/test-results/<US-CODE>/<name>.webm')` in an `afterEach` — after `page.close()`, since `saveAs` waits for the recording to finish. See `e2e/US-026__apre-scheda-riepilogo.spec.ts`.

Note also that `launchOptions` (e.g. `slowMo`) cannot be scoped to a `describe` block — Playwright rejects it because it forces a new worker. To record only the demo scenario, keep it in its own file with a top-level `test.use()`, and put the remaining scenarios in a sibling file (see the `US-026__*` pair).

## Full verification

```bash
npm run check
```

Runs lint → typecheck → unit tests in sequence. All three must pass for CI to be green.

## Project structure

```
portfolIA/
├── client/          # React + Vite frontend
│   └── src/
├── server/          # Fastify backend
│   ├── src/
│   │   └── db/      # Drizzle ORM schema + migrations
│   └── tests/       # Vitest unit/integration tests
├── shared/          # Shared TypeScript types
├── e2e/             # Playwright E2E tests
├── docs/
│   ├── mockups/     # UI mockups (design references)
│   └── test-results/# E2E artifacts (video, traces)
├── eslint.config.js # ESLint 9 flat config
├── playwright.config.ts
└── package.json     # Root workspace (lint / test / check scripts)
```

## Key commands

| Command | What it does |
|---|---|
| `npm run dev` | Start app (backend + frontend) |
| `npm run lint` | ESLint on all TS sources |
| `npm run typecheck` | TypeScript project references build |
| `npm run test` | Vitest unit/integration tests |
| `npm run check` | lint + typecheck + test |
| `npx playwright test` | Playwright E2E smoke test |
