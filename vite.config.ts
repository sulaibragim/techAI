import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Regex keys (leading ^) so the proxy only matches real API routes and
          // never swallows frontend source modules like /apiClient.ts. The trailing
          // slash means "/api/jobs" is proxied but "/apiClient.ts" is served by Vite.
          '^/api/': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '^/openphone/': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      // NOTE: The Gemini API key is intentionally NOT injected into the client bundle.
      // It lives only on the server (Railway env GEMINI_API_KEY); the browser talks to the
      // backend AI proxy (/api/ai) and uses ephemeral tokens for voice. Never set a
      // VITE_GEMINI_API_KEY in the build env, or it will be exposed in the public JS.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
