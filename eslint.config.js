import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.astro/**', '**/node_modules/**', '.netlify/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: [
      'netlify/**/*.ts',
      'scripts/**/*.{js,mjs,ts}',
      'shared/**/*.ts',
      '**/*.config.{js,ts,mjs}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['admin/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['site/**/*.{ts,astro}'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
