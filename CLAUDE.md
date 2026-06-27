# PortfolIA — Developer Guide

## Prerequisites

- **Node.js 20 LTS** (`node --version` should show `v20.x`)
- `npm` 10+ (bundled with Node 20)

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

Runs the Playwright tests in `e2e/`. Requires no running server — the webServer config starts it automatically. Artifacts (video) are saved to `docs/test-results/US-004/`.

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
