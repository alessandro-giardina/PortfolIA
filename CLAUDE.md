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
