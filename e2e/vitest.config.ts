import { defineConfig } from 'vitest/config';

/**
 * Runner dei test unitari dello strato di supporto E2E.
 *
 * `e2e/` è un progetto a sé, fuori dalle project references della root: i suoi
 * moduli non sono importabili dai test del workspace `server` senza rompere il
 * confine che `e2e/tsconfig.json` tiene apposta separato. Da qui un runner
 * proprio, invocato da `npm run test:e2e-support`.
 *
 * L'`include` esplicito non è una rifinitura: il default di Vitest raccoglie
 * anche `*.spec.ts`, cioè i test di Playwright, che qui girerebbero fuori dal
 * loro runner e fallirebbero tutti. Solo `support/**\/*.test.ts`.
 */
export default defineConfig({
  test: {
    include: ['support/**/*.test.ts'],
  },
});
