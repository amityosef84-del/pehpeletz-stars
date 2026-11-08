// בדיקת זרימה לעמוד התשלום: node scripts/qa/checkout-flow.mjs <baseUrl>
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const step = (msg) => console.log('✓', msg);
const text = (sel) => page.locator(sel).first().innerText();

// 1. החבילה מה-URL נבחרת והסיכום מתעדכן
await page.goto(`${base}/checkout?pkg=kit-3`, { waitUntil: 'networkidle' });
assert.equal(await page.locator('input[name=package][value=kit-3]').isChecked(), true);
assert.match(await text('[data-sum-total]'), /150/);
assert.match(await text('[data-sum-shipping]'), /150/);
step('pkg=kit-3 preselected, total 150 ₪');

// 2. החלפת חבילה מעדכנת סיכום וכתובת
await page.locator('label.pkg-opt', { hasText: 'כוח הצחצוח' }).click();
assert.match(await text('[data-sum-total]'), /50/);
assert.match(page.url(), /pkg=kit-1/);
step('switching to kit-1 updates total to 50 ₪ and the URL');

// 3. שליחה ריקה: הודעות שגיאה בעברית, פוקוס לשדה הראשון
await page.locator('[data-pay]').click();
assert.equal(await page.locator('.checkout__errors').isVisible(), true);
assert.match(await text('.checkout__errors'), /שדות שצריך לתקן/);
assert.equal(await page.evaluate(() => document.activeElement?.id), 'f-name');
assert.equal(await page.locator('#f-name').getAttribute('aria-invalid'), 'true');
assert.match(await text('#f-terms-err'), /התקנון/);
step('empty submit shows Hebrew errors and focuses the first invalid field');

// 4. ולידציה של טלפון ושם
await page.fill('#f-name', 'דנה');
await page.fill('#f-phone', '12345');
await page.locator('#f-email').focus();
assert.match(await text('#f-phone-err'), /נייד תקין/);
await page.locator('#f-name').focus();
await page.locator('#f-city').focus();
assert.match(await text('#f-name-err'), /שם משפחה/);
step('invalid phone and single-word name are rejected');

// 5. מילוי תקין → בלי create-order (שלב 2) מוצג פאנל וואטסאפ עם פרטי ההזמנה
await page.fill('#f-name', 'דנה כהן');
await page.fill('#f-phone', '+972 50-123-4567');
await page.fill('#f-email', 'dana@example.com');
await page.fill('#f-city', 'חיפה');
await page.fill('#f-street', 'הרצל');
await page.fill('#f-house', '12');
await page.check('#f-terms');
await page.locator('[data-pay]').click();
await page.locator('[data-soon]').waitFor({ state: 'visible' });
const href = decodeURIComponent(
  (await page.locator('[data-soon-link]').getAttribute('href')) ?? '',
);
assert.match(href, /^https:\/\/wa\.me\/972506705556\?text=/);
assert.match(href, /כוח הצחצוח/);
assert.match(href, /0501234567/);
assert.match(href, /הרצל 12, חיפה/);
step('valid form shows the WhatsApp fallback with normalized phone and address');

// 6. טיוטה נשמרת ומשוחזרת
await page.waitForTimeout(500);
await page.goto(`${base}/checkout`, { waitUntil: 'networkidle' });
assert.equal(await page.inputValue('#f-city'), 'חיפה');
assert.equal(await page.locator('#f-terms').isChecked(), false);
step('draft restored after reload, consent checkbox is not');

// 7. honeypot מוסתר
const hp = await page.locator('.hp').boundingBox();
assert.ok(hp && hp.width <= 1 && hp.height <= 1, 'honeypot container must be clipped to 1px');
assert.equal(await page.locator('.hp').getAttribute('aria-hidden'), 'true');
assert.equal(await page.locator('#f-company').getAttribute('tabindex'), '-1');
step('honeypot is clipped, hidden from screen readers and out of tab order');

assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
step('no JS errors');
await browser.close();
