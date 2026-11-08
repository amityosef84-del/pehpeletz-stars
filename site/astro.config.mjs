// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // כתובת האתר מגיעה מ-Netlify (URL) או מ-SITE_URL. משמשת ל-canonical ו-sitemap.
  site: process.env.SITE_URL || process.env.URL || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  devToolbar: { enabled: false },
});
