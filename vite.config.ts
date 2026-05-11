import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // When VITE_BACKEND=real, /api and /ws proxy to a running uvicorn on :8000.
    // When unset (the default), MSW intercepts on the client side.
    // WebSocket proxying needs `ws: true`; awareness presence (Phase 4-A)
    // connects to /ws/awareness/<projectId>.
    proxy:
      process.env.VITE_BACKEND === 'real'
        ? {
            '/api': {
              target: 'http://localhost:8000',
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/api/, ''),
            },
            '/ws': {
              target: 'ws://localhost:8000',
              ws: true,
              changeOrigin: true,
            },
          }
        : undefined,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    setupFiles: ['./tests/setup.ts'],
    // Exclude e2e/ — Playwright runs those, not vitest.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    css: false,
  },
});
