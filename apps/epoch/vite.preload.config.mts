import { defineConfig } from 'vite';


export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['es'],
      fileName: 'preload',
    },
    rollupOptions: {
      external: ["electron", "@verichron/contracts", "@verichron/db-reader", "pg", /^node:.+/],
    },
  }
});

