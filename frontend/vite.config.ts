import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Tests must not depend on a developer's local .env (src/lib/env.ts validates on import).
    env: {
      VITE_API_URL: 'http://localhost:8000',
      VITE_USE_MOCKS: 'false',
      VITE_AUTH_DISABLED: 'false',
      VITE_DEMO_MODE: 'false',
    },
  },
});
