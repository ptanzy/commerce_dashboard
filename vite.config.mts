import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-test/**', '**/*.node.cjs'],
  },
});
