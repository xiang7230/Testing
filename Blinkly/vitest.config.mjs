import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/ui/**/*.test.jsx','tests/settings/**/*.test.jsx',],
    setupFiles: ['tests/ui/setup.mjs'],
  },
});
