import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

// Forge serves Custom UI from a nested path, so every asset URL must be relative.
export default defineConfig({
  root: here,
  base: './',
  publicDir: fileURLToPath(new URL('../ledger/public', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../shared/src', import.meta.url)),
      '@core': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  build: { outDir: 'build', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5174, host: '127.0.0.1' },
});
