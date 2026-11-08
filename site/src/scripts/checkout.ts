/**
 * עמוד התשלום: בחירת חבילה, ולידציה בעברית, שמירת טיוטה מקומית ושליחה.
 * הסכומים כאן לתצוגה בלבד. השרת (create-order, שלב 2) מחשב הכל מחדש מה-DB.
 */
import { burst } from './fx';

type Rule = (v: string, form: HTMLFormElement) => string | null;

const nis = (n: number) =>
  `${n.toLocaleString('he-IL', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}\u00A0₪`;

/** נייד ישראלי: 05X-XXXXXXX, עם או בלי +972, רווחים ומקפים */
export function normalizeIlMobile(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+972')) d = '0' + d.slice(4);
  else if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^05\d{8}$/.test(d) ? d : null;
}

const RULES: Record<string, Rule> = {
  name: (v) =>
    v.trim().length < 2
      ? 'נא להזין שם מלא'
      : v.trim().split(/\s+/).length < 2
        ? 'נא להזין שם פרטי ושם משפחה'
        : null,
  phone: (v) =>
    !v.trim()
      ? 'נא להזין מספר טלפון נייד'
      : normalizeIlMobile(v)
        ? null
        : 'נא להזין מספר נייד תקין, למשל 050-1234567',
  email: (v) =>
    !v.trim()
      ? 'נא להזין כתובת אימייל'
      : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
        ? null
        : 'נא להזין כתובת אימייל תקינה, למשל name@example.com',
  city: (v) => (v.trim().length < 2 ? 'נא להזין עיר או יישוב' : null),
  street: (v) => (v.trim().length < 2 ? 'נא להזין שם רחוב' : null),
  house: (v) =>
    !v.trim()
      ? 'נא להזין מספר בית'
      : /^\d{1,4}\s*[א-תa-zA-Z]?$/.test(v.trim())
        ? null
        : 'מספר בית לא תקין',
  zip: (v) => (!v.trim() || /^\d{5}(\d{2})?$/.test(v.trim()) ? null : 'מיקוד בן 5 או 7 ספרות'),
  terms: (_v, f) =>
    (f.elements.namedItem('terms') as HTMLInputElement).checked
      ? null
      : 'יש לאשר את התקנון ואת מדיניות הביטול',
};

const DRAFT_KEY = 'pp-checkout-draft';
const DRAFT_FIELDS = [
  'name',
  'phone',
  'email',
  'city',
  'street',
  'house',
  'apartment',
  'zip',
  'notes',
];

function init(form: HTMLFormElement) {
  const $ = <T extends Element>(sel: string) => form.querySelector<T>(sel);
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
  const errorsBox = $<HTMLElement>('.checkout__errors')!;
  const payBtn = $<HTMLButtonElement>('[data-pay]')!;
  const soon = $<HTMLElement>('[data-soon]')!;

  // ---------- חבילה ----------
  const params = new URLSearchParams(location.search);
  const requested = params.get('pkg');
  const radios = [...form.querySelectorAll<HTMLInputElement>('input[name="package"]')];
  const pre = radios.find((r) => r.value === requested);
  if (pre) pre.checked = true;

  function selected() {
    return radios.find((r) => r.checked) ?? radios[0]!;
  }
  function renderSummary() {
    const r = selected();
    const units = r.dataset.units ?? '1';
    const total = Number(r.dataset.total);
    const shipping = Number(r.dataset.shipping);
    form
      .querySelectorAll('[data-sum-units],[data-sum-units2]')
      .forEach((el) => (el.textContent = units));
    form.querySelector('[data-sum-name]')!.textContent = r.dataset.name ?? '';
    form.querySelector('[data-sum-shipping]')!.textContent = nis(shipping);
    form
      .querySelectorAll('[data-sum-total],[data-sum-total2]')
      .forEach((el) => (el.textContent = nis(total)));
  }
  radios.forEach((r) =>
    r.addEventListener('change', () => {
      renderSummary();
      const u = new URL(location.href);
      u.searchParams.set('pkg', r.value);
      history.replaceState(null, '', u);
      const box = form.querySelector('.summary__img');
      if (box) {
        const rc = box.getBoundingClientRect();
        burst(rc.left + rc.width / 2, rc.top + rc.height / 2, 10);
      }
    }),
  );
  renderSummary();

  // ---------- טיוטה מקומית (נוחות בלבד; אף פעם לא אמצעי תשלום) ----------
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Record<string, string>;
    for (const k of DRAFT_FIELDS) {
      const el = field(k);
      if (el && saved[k] && !el.value) el.value = saved[k];
    }
  } catch {
    /* אחסון חסום: מתעלמים */
  }
  let saveT = 0;
  form.addEventListener('input', () => {
    clearTimeout(saveT);
    saveT = window.setTimeout(() => {
      try {
        const data: Record<string, string> = {};
        for (const k of DRAFT_FIELDS) data[k] = field(k)?.value ?? '';
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      } catch {
        /* מתעלמים */
      }
    }, 400);
  });

  // ---------- ולידציה ----------
  function validate(name: string): boolean {
    const rule = RULES[name];
    const el = field(name);
    if (!rule || !el) return true;
    const msg = rule(el.value, form);
    const err = document.getElementById(`${el.id}-err`);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg ?? '';
    return !msg;
  }
  for (const name of Object.keys(RULES)) {
    const el = field(name);
    if (!el) continue;
    el.addEventListener('blur', () => {
      if (el.value || el.getAttribute('aria-invalid')) validate(name);
    });
    el.addEventListener('input', () => {
      if (el.getAttribute('aria-invalid') === 'true') validate(name);
    });
    if (el.type === 'checkbox') el.addEventListener('change', () => validate(name));
  }

  // ---------- שליחה ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const names = Object.keys(RULES);
    const bad = names.filter((n) => !validate(n));
    if (bad.length) {
      errorsBox.hidden = false;
      errorsBox.textContent =
        bad.length === 1 ? 'יש שדה אחד שצריך לתקן' : `יש ${bad.length} שדות שצריך לתקן`;
      field(bad[0]!)?.focus();
      return;
    }
    errorsBox.hidden = true;

    const fd = new FormData(form);
    if (String(fd.get('company') ?? '')) return; // בוט

    const payload = {
      items: [{ productId: selected().value, qty: 1 }],
      coupon: String(fd.get('coupon') ?? '').trim() || null,
      customer: {
        name: String(fd.get('name')).trim(),
        phone: normalizeIlMobile(String(fd.get('phone'))),
        email: String(fd.get('email')).trim(),
        marketingConsent: fd.get('marketing') === 'on',
      },
      address: {
        city: String(fd.get('city')).trim(),
        street: String(fd.get('street')).trim(),
        house: String(fd.get('house')).trim(),
        apartment: String(fd.get('apartment') ?? '').trim(),
        zip: String(fd.get('zip') ?? '').trim(),
        notes: String(fd.get('notes') ?? '').trim(),
      },
      termsAccepted: true,
    };

    if (form.dataset.enabled !== 'true') {
      showSoon(payload);
      return;
    }

    payBtn.setAttribute('aria-busy', 'true');
    payBtn.disabled = true;
    try {
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) throw new Error(data.error || 'שגיאה ביצירת ההזמנה');
      location.assign(data.redirectUrl);
    } catch (err) {
      errorsBox.hidden = false;
      errorsBox.textContent = `${(err as Error).message}. נסו שוב או כתבו לנו בוואטסאפ.`;
      payBtn.removeAttribute('aria-busy');
      payBtn.disabled = false;
    }
  });

  function showSoon(p: {
    items: { productId: string }[];
    customer: { name: string; phone: string | null };
    address: { city: string; street: string; house: string };
  }) {
    const r = selected();
    const msg = [
      'היי, אני רוצה להזמין את ערכת הכוכבים של פהפלצת 🚀',
      `חבילה: ${r.dataset.name} (${r.dataset.units} ערכות), סה"כ ${nis(Number(r.dataset.total))}`,
      `שם: ${p.customer.name}`,
      `טלפון: ${p.customer.phone ?? ''}`,
      `כתובת: ${p.address.street} ${p.address.house}, ${p.address.city}`,
    ].join('\n');
    const link = soon.querySelector<HTMLAnchorElement>('[data-soon-link]')!;
    link.href = `https://wa.me/${form.dataset.whatsapp}?text=${encodeURIComponent(msg)}`;
    soon.hidden = false;
    soon.focus();
  }
}

// מאתחלים בסוף הקובץ, אחרי שכל הקבועים והפונקציות כבר מוגדרים
const form = document.getElementById('checkout-form') as HTMLFormElement | null;
if (form) init(form);
