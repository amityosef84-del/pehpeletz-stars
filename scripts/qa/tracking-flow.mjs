// בדיקת המעקב בדפדפן: node scripts/qa/tracking-flow.mjs <baseUrl>
// מיירט את /api/track ו-/api/checkout-draft ובודק מה נשלח, בלי שרת אמיתי.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
const page = await ctx.newPage();
const batches = [];
const drafts = [];
await page.route('**/api/track', async (route) => {
  batches.push(JSON.parse(route.request().postData() ?? '{}'));
  await route.fulfill({ status: 204 });
});
await page.route('**/api/checkout-draft', async (route) => {
  drafts.push(JSON.parse(route.request().postData() ?? '{}'));
  await route.fulfill({ status: 204 });
});
const events = () =>
  batches.flatMap((b) =>
    b.events.map((e) => ({ ...e, session: b.session_id, visitor: b.visitor_id })),
  );
const names = () => events().map((e) => e.name);
const step = (m) => console.log('✓', m);
async function waitFor(cond, label, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`timeout waiting for ${label}; got: ${names().join(', ')}`);
}

// 1. כניסה מקמפיין
await page.goto(
  `${base}/?utm_source=facebook&utm_medium=paid&utm_campaign=launch&utm_content=video1&fbclid=XYZ`,
  {
    waitUntil: 'networkidle',
  },
);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.waitForTimeout(300);
await page.locator('#pricing').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.locator('details[data-faq="0"] summary').click();
await waitFor(
  () => ['page_view', 'scroll_50', 'view_pricing', 'faq_open'].every((n) => names().includes(n)),
  'landing events',
);
const b0 = batches[0];
assert.ok(b0, 'no batch sent');
assert.match(b0.visitor_id, /^[0-9a-f-]{36}$/);
assert.equal(b0.session.utm_source, 'facebook');
assert.equal(b0.session.utm_content, 'video1');
assert.equal(b0.session.fbclid, 'XYZ');
assert.equal(b0.session.device, 'mobile');
for (const n of ['page_view', 'scroll_25', 'scroll_50', 'view_pricing', 'faq_open'])
  assert.ok(names().includes(n), `missing ${n}`);
step('landing: page_view, scroll, view_pricing, faq_open with campaign attribution');

// 2. לחיצה על חבילה → cta_click + select_package, ומעבר לתשלום באותו ביקור
await page.locator('[data-cta="pricing-kit-3"]').click();
await page.waitForURL('**/checkout?pkg=kit-3');
await page.waitForLoadState('networkidle');
await page.fill('#f-name', 'דנה כהן');
await page.fill('#f-phone', '0501234567');
await page.locator('#f-email').focus();
await page.fill('#f-email', 'dana@example.com');
await page.locator('#f-city').focus();
await waitFor(
  () =>
    names().includes('select_package') &&
    names().includes('begin_checkout') &&
    events().filter((e) => e.name === 'checkout_field_filled').length >= 3 &&
    drafts.length > 0,
  'checkout events',
);
const all = events();
if (process.env.DEBUG)
  console.log(all.map((e) => e.name + ':' + JSON.stringify(e.props)).join('\n'));
const sel = all.find((e) => e.name === 'select_package');
assert.equal(sel?.props.package, 'kit-3');
assert.ok(all.some((e) => e.name === 'cta_click' && e.props.location === 'pricing-kit-3'));
const bc = all.find((e) => e.name === 'begin_checkout');
assert.equal(bc?.props.package, 'kit-3');
assert.equal(bc?.props.value, 150);
const fields = all.filter((e) => e.name === 'checkout_field_filled').map((e) => e.props.field);
assert.deepEqual(fields.sort(), ['email', 'name', 'phone']);
assert.ok(!JSON.stringify(batches).includes('dana@example.com'), 'PII leaked into events');
assert.ok(!JSON.stringify(batches).includes('0501234567'), 'phone leaked into events');
assert.equal(new Set(batches.map((b) => b.session_id)).size, 1, 'session changed between pages');
step(
  'checkout: select_package, begin_checkout (value 150), field names only, same session, no PII',
);

// 3. עגלה נטושה נשמרת עם טלפון ומייל
const d = drafts.at(-1);
assert.equal(d?.phone, '0501234567');
assert.equal(d?.email, 'dana@example.com');
assert.equal(d?.package_slug, 'kit-3');
assert.equal(d?.session_id, batches[0].session_id);
step('abandoned checkout draft sent with phone, email and package');

// 4. אין פיקסלים ואין באנר כשלא הוגדרו מזהים
assert.equal(await page.locator('[data-consent]').count(), 0);
const third = await page.evaluate(() =>
  [...document.scripts].map((s) => s.src).filter((s) => s && !s.startsWith(location.origin)),
);
assert.deepEqual(third, []);
step('no third-party scripts and no consent banner without pixel IDs');

await browser.close();
