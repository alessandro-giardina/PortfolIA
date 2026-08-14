import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/src/**/*.ts', 'client/src/**/*.ts', 'shared/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  {
    // Script di utilità eseguiti direttamente da Node: `no-undef` resta acceso
    // (typescript-eslint lo spegne solo per i .ts), quindi vanno dichiarate le
    // globali di Node che usano.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.archetipo/**',
      '**/src/db/migrations/**',
      'docs/**',
    ],
  },
);
