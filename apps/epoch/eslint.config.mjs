// Flat config (ESLint 9+ format). Replaces the old .eslintrc.json, which
// ESLint 10 -- already the installed version here -- can no longer read at
// all (flat config has been the only supported format since v9).
//
// Rule coverage from the old config is carried over unchanged: the same
// five rule sets it extended (eslint:recommended,
// @typescript-eslint/eslint-recommended + recommended, import/recommended +
// electron + typescript), just expressed as the packages that actually ship
// flat-config versions of them today (eslint-plugin-import-x is the
// maintained, flat-config-ready fork of eslint-plugin-import).
//
// eslint-plugin-react-hooks is new here, not carried over -- src had an
// `eslint-disable-next-line react-hooks/exhaustive-deps` comment with no
// rule behind it (the plugin was never installed), which is exactly the
// kind of thing lint being broken let slide unnoticed.
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { flatConfigs as importXFlatConfigs } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  importXFlatConfigs.recommended,
  importXFlatConfigs.electron,
  importXFlatConfigs.typescript,
  reactHooks.configs.flat.recommended,
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
