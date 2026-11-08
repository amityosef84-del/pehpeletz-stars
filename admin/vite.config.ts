import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// האדמין נבנה לתוך site/dist/admin כדי ש-Netlify יגיש את שניהם מאותו publish dir.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../site/dist/admin', import.meta.url)),
    emptyOutDir: true,
  },
  server: { port: 5174 },
});
