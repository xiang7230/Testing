import { defineConfig } from 'vite';
// better-sqlite3 is a native .node addon. Never bundle it into main.cjs.
export default defineConfig({
  build: { rollupOptions: { external: ['better-sqlite3'] } },
});
