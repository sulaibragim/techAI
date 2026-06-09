import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Server mounts routes under /api/* — forward as-is (do NOT strip /api).
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/openphone': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      // NOTE: The Gemini API key is intentionally NOT injected into the client bundle.
      // Enter it at runtime in Settings → AI Configuration (kept in localStorage only).
      // Do not set VITE_GEMINI_API_KEY in the build env, or it will be exposed in the public JS.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
