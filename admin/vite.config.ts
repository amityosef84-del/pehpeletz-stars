import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// האדמין נבנה לתוך site/dist/admin כדי ש-Netlify יגיש את שניהם מאותו publish dir.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  // כתובת Supabase והמפתח הציבורי (anon) מגיעים ממשתני הסביבה של Netlify בזמן build.
  // ה-anon key ציבורי לפי תכנון: RLS מגן על הנתונים. מפתח service_role לעולם לא נכנס לכאן.
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL ?? ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ''),
  },
  build: {
    outDir: fileURLToPath(new URL('../site/dist/admin', import.meta.url)),
    emptyOutDir: true,
  },
  server: { port: 5174 },
});
