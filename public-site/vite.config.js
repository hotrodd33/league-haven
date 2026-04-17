import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/site/',
  build: {
    outDir: '../dist/site',
    emptyOutDir: true,
  },
  server: {
    port: 3002,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
