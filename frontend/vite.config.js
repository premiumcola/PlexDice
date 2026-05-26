import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Embed the app version from package.json so the About screen can show it.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

// Dev: proxy /api to the Flask backend. Prod: same origin (served by Flask).
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
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
