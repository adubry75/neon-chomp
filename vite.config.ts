import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2023', assetsInlineLimit: 100000000, cssCodeSplit: false, modulePreload: false },
  test: { globals: true, environment: 'node' },
});
