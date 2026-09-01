// Flat config (ESLint 9+ format). Replaces the old .eslintrc.json, which
// ESLint 10 -- already the installed version here -- can no longer read at
// all (flat config has been the only supported format since v9).
//
// Rule coverage is intentionally unchanged from the old config: the same
// five rule sets it extended (eslint:recommended,
// @typescript-eslint/eslint-recommended + recommended, import/recommended +
// electron + typescript), just expressed as the packages that actually ship
// flat-config versions of them today (eslint-plugin-import-x is the
// maintained, flat-config-ready fork of eslint-plugin-import).
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { flatConfigs as importXFlatConfigs } from 'eslint-plugin-import-x';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  importXFlatConfigs.recommended,
  importXFlatConfigs.electron,
  importXFlatConfigs.typescript,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: ['dist/**', '.vite/**', 'node_modules/**'],
  },
];
