import { defineConfig } from 'vite';

// base relativa: il sito funziona sia su GitHub Pages (/make-and-code-lab/) sia in locale
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
} as any);
