import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // @verichron/db-reader is a CJS workspace package (compiled via
      // tsc, not Vite/Rollup) whose re-exports use TypeScript's
      // Object.defineProperty getter pattern. Rollup can't statically
      // analyze that as ESM named exports, so bundling it fails with
      // "X is not exported by ...". The main process runs in Node and
      // can require() workspace packages natively at runtime, so treat
      // it as external instead of trying to bundle it.
      //
      // pg is a Node-native DB driver with its own internal dynamic
      // require() calls (e.g. for optional native bindings). Rollup's
      // CJS-to-ESM interop wraps it in a self-referencing "augmented
      // namespace" object, which throws "Cannot access 'pg' before
      // initialization" at runtime — a circular-binding TDZ error, not
      // a real code bug. Like db-reader, this is meant to be
      // require()'d natively by the main process, not bundled.
      // @verichron/contracts is built the same way (tsc, same getter
      // re-export pattern) and hits the identical Rollup limitation --
      // same fix, same reason.
      external: ['@verichron/db-reader', '@verichron/contracts', 'pg'],
    },
  },
});