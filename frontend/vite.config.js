import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Embed the app version from package.json so the About screen can show it.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

// Dev: proxy /api to the Flask backend. Prod: same origin (served by Flask).
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    // Build stamp shown in Settings so the running (possibly cached) build is identifiable.
    // GIT_SHA is passed in by docker compose; the timestamp is the build moment.
    'import.meta.env.VITE_BUILD_HASH': JSON.stringify(process.env.GIT_SHA || 'local'),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
  },
});
