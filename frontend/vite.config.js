import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: proxy /api to the Flask backend. Prod: same origin (served by Flask).
export default defineConfig({
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
