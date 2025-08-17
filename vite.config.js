import { defineConfig } from 'vite';

// This simplified config lets Vite handle environment variables automatically.
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});