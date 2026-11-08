// בדיקת נגישות אוטומטית (axe-core, WCAG 2.0/2.1 A+AA) לכל העמודים.
// node scripts/qa/a11y.mjs <baseUrl> [path...]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const [base = 'http://127.0.0.1:4321', ...rest] = process.argv.slice(2);
const paths = rest.length
  ? rest
  : [
      '/',
      '/checkout',
      '/thank-you',
      '/privacy',
      '/returns',
      '/terms',
      '/accessibility',
      '/contact',
      '/404',
      '/admin/',
      '/admin/?demo',
      '/admin/?demo#orders',
      '/admin/?demo#orders/eeeeeeee-0000-4000-8000-000000000001',
      '/admin/?demo#customers',
      '/admin/?demo#abandoned',
      '/admin/?demo#products',
      '/admin/?demo#coupons',
      '/admin/?demo#settings',
      '/admin/?demo#admins',
    ];

const browser = await chromium.launch();
let failures = 0;
for (const [label, opts] of [
  ['mobile', devices['iPhone 13']],
  ['desktop', { viewport: { width: 1280, height: 860 } }],
]) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: axeSource });
    const res = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }),
    );
    const serious = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    const other = res.violations.filter((v) => !['serious', 'critical'].includes(v.impact ?? ''));
    failures += serious.length;
    console.log(`${label} ${p}: ${serious.length} serious/critical, ${other.length} minor`);
    for (const v of res.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
      for (const n of v.nodes.slice(0, 3)) console.log(`     ${n.target.join(' ')}`);
    }
  }
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
