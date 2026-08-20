import fs from 'node:fs';
import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

/** Replace __BUILD__ in dist/sw.js so each deploy gets a fresh CACHE_NAME. */
function stampServiceWorkerCache(): Plugin {
  return {
    name: 'stamp-sw-cache',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve('dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const buildId = Date.now().toString(36);
      const src = fs.readFileSync(swPath, 'utf8');
      fs.writeFileSync(swPath, src.replaceAll('__BUILD__', buildId));
    },
  };
}

export default defineConfig({
  plugins: [svelte(), stampServiceWorkerCache()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
