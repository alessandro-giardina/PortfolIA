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
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.archetipo/**',
      '**/src/db/migrations/**',
      'docs/**',
    ],
  },
);
