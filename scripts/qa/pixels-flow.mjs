// בדיקת באנר ההסכמה והפיקסלים. דורש build עם מזהים פיקטיביים:
// PUBLIC_META_PIXEL_ID=111 PUBLIC_GA4_ID=G-TEST PUBLIC_TIKTOK_PIXEL_ID=TT1 npm run build
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
const page = await ctx.newPage();
const external = [];
// לא יוצאים לרשת: הסקריפטים של הפלטפורמות מוחלפים בקובץ ריק
await page.route(
  /connect\.facebook\.net|googletagmanager\.com|analytics\.tiktok\.com/,
  async (route) => {
    external.push(new URL(route.request().url()).host);
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  },
);
const tracked = [];
await page.route('**/api/track', async (route) => {
  tracked.push(...JSON.parse(route.request().postData() ?? '{}').events);
  await route.fulfill({ status: 204 });
});
const step = (m) => console.log('✓', m);

await page.goto(`${base}/`, { waitUntil: 'networkidle' });
assert.equal(await page.locator('[data-consent]').isVisible(), true, 'banner should show');
assert.deepEqual(external, [], 'pixels loaded before consent');
assert.equal(await page.evaluate(() => typeof window.fbq), 'undefined');
step('banner shown, nothing loaded before consent');

await page.locator('[data-consent-choice="granted"]').click();
await page.waitForTimeout(500);
assert.equal(await page.locator('[data-consent]').isVisible(), false);
assert.deepEqual([...new Set(external)].sort(), [
  'analytics.tiktok.com',
  'connect.facebook.net',
  'www.googletagmanager.com',
]);
const fbQueue = await page.evaluate(() =>
  window.fbq.queue.map((a) => [a[0], a[1], a[3]?.eventID ?? null]),
);
assert.deepEqual(fbQueue[0], ['init', '111', null]);
const pv = fbQueue.find((a) => a[1] === 'PageView');
assert.ok(pv?.[2], 'PageView without eventID');
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await page.waitForTimeout(500);
const ourPv = tracked.find((e) => e.name === 'page_view');
assert.equal(pv[2], ourPv?.id, 'Meta eventID must equal our event id');
step('after consent: Meta/GA4/TikTok load; PageView replayed with the same event_id as ours');

await page.reload({ waitUntil: 'networkidle' });
assert.equal(await page.locator('[data-consent]').isVisible(), false, 'choice remembered');
assert.equal(
  await page.locator('[data-consent-open]').isVisible(),
  true,
  'footer settings link visible',
);
step('choice remembered; "הגדרות עוגיות" link available');

const p2 = await ctx.newPage();
await p2.evaluate(() => 0);
await browser.close();
