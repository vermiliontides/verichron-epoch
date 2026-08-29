import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';


export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Force Vite to listen on standard IPv4 localhost
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});

