// צילומי מסך לבדיקה: node scripts/qa/shots.mjs <baseUrl> <outDir> [path...]
import { createRequire } from 'node:module';
// Playwright מותקן גלובלית בסביבת הענן; ב-CI מתקינים אותו בנפרד.
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const [base = 'http://127.0.0.1:4321', out = 'qa-shots', ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ['/'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const configs = [
  {
    name: 'm360',
    viewport: { width: 360, height: 780 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  },
  { name: 'm390', ...devices['iPhone 13'] },
  { name: 't768', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 },
  { name: 'd1280', viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 },
];
for (const cfg of configs) {
  const { name, ...opts } = cfg;
  const ctx = await browser.newContext({ ...opts, locale: 'he-IL', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    const slug = p === '/' ? 'home' : p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    await page.screenshot({ path: `${out}/${slug}-${name}.png`, fullPage: true });
    console.log(`${slug}-${name}`, 'horizontal overflow px:', overflow);
  }
  await ctx.close();
}
await browser.close();
