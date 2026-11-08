import type { OrderStatus } from '../../shared/src/orders';

/**
 * ולידציה לפעולות מערכת הניהול (שלב 4). טהור, בלי DB, נבדק ביחידה.
 * כל קלט מהדפדפן עובר כאן לפני שנוגע במסד.
 */

export type Role = 'owner' | 'staff';
export { canTransition, TRANSITIONS, type OrderStatus } from '../../shared/src/orders';

export interface ShippingSetting {
  mode: 'per_unit' | 'flat' | 'free';
  amount: number;
  freeOverSubtotal?: number;
  label: string;
}

export interface StoreSetting {
  name: string;
  legal_name: string;
  business_id: string;
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
  currency: 'ILS';
}

export interface ProductPatch {
  name: string;
  description: string | null;
  price_ils: number;
  compare_at_price: number | null;
  stock: number | null;
  active: boolean;
  sort: number;
}

export interface CouponInput {
  id?: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  min_total: number;
  usage_limit: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export type Action =
  | { action: 'order.status'; orderId: string; status: OrderStatus; trackingNumber?: string | null }
  | { action: 'order.tracking'; orderId: string; trackingNumber: string | null }
  | { action: 'order.note'; orderId: string; note: string }
  | { action: 'abandoned.contacted'; id: string; contacted: boolean }
  | { action: 'product.update'; id: string; patch: ProductPatch }
  | { action: 'coupon.upsert'; coupon: CouponInput }
  | { action: 'coupon.delete'; id: string }
  | { action: 'settings.shipping'; value: ShippingSetting }
  | { action: 'settings.store'; value: StoreSetting };

/** מי רשאי לבצע כל פעולה. צוות: תפעול שוטף. בעלים: גם מחירים, קופונים והגדרות. */
export const ROLE_FOR: Record<Action['action'], Role> = {
  'order.status': 'staff',
  'order.tracking': 'staff',
  'order.note': 'staff',
  'abandoned.contacted': 'staff',
  'product.update': 'owner',
  'coupon.upsert': 'owner',
  'coupon.delete': 'owner',
  'settings.shipping': 'owner',
  'settings.store': 'owner',
};

export function allowed(role: Role, action: Action['action']): boolean {
  return role === 'owner' || ROLE_FOR[action] === 'staff';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

type Err = { error: string };
const err = (error: string): Err => ({ error });
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** מחרוזת: חותך רווחים, מחזיר null לריק. undefined אם לא חוקי (ארוך מדי / לא מחרוזת). */
function text(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex -- מסננים תווי בקרה בכוונה
  const t = v.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (t.length > max) return undefined;
  return t || null;
}

/** סכום כסף: מספר או מחרוזת מספרית, עד 2 ספרות אחרי הנקודה. */
function money(v: unknown, max = 100_000): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return undefined;
  if (Math.round(n * 100) !== Math.round(n * 100 * 1000) / 1000) return undefined;
  return Math.round(n * 100) / 100;
}

function int(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

function date(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function tracking(v: unknown): string | null | undefined {
  const t = text(v, 60);
  if (t === undefined) return undefined;
  if (t !== null && !/^[\p{L}\p{N} ._/-]+$/u.test(t)) return undefined;
  return t;
}

function parseProduct(p: unknown): ProductPatch | Err {
  if (!isObj(p)) return err('נתוני מוצר חסרים');
  const name = text(p.name, 80);
  if (!name) return err('שם המוצר חסר או ארוך מדי');
  const description = text(p.description, 400);
  if (description === undefined) return err('התיאור ארוך מדי');
  const price = money(p.price_ils, 10_000);
  if (price === undefined) return err('מחיר לא תקין');
  const compare =
    p.compare_at_price === null || p.compare_at_price === undefined || p.compare_at_price === ''
      ? null
      : money(p.compare_at_price, 10_000);
  if (compare === undefined) return err('מחיר לפני הנחה לא תקין');
  if (compare !== null && compare <= price) return err('מחיר לפני הנחה חייב להיות גבוה מהמחיר');
  const stock =
    p.stock === null || p.stock === undefined || p.stock === '' ? null : int(p.stock, 0, 1_000_000);
  if (stock === undefined) return err('מלאי לא תקין');
  const sort = int(p.sort ?? 0, 0, 10_000);
  if (sort === undefined) return err('סדר לא תקין');
  if (typeof p.active !== 'boolean') return err('סטטוס פעיל לא תקין');
  return {
    name,
    description,
    price_ils: price,
    compare_at_price: compare,
    stock,
    active: p.active,
    sort,
  };
}

function parseCoupon(c: unknown): CouponInput | Err {
  if (!isObj(c)) return err('נתוני קופון חסרים');
  if (c.id !== undefined && c.id !== null && !uuid(c.id)) return err('קופון לא תקין');
  const code = typeof c.code === 'string' ? c.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{2,40}$/.test(code))
    return err('קוד קופון: 2-40 תווים, אותיות באנגלית, ספרות, - או _');
  if (c.type !== 'percent' && c.type !== 'fixed') return err('סוג הנחה לא תקין');
  const value = money(c.value, c.type === 'percent' ? 100 : 10_000);
  if (!value) return err(c.type === 'percent' ? 'אחוז הנחה בין 1 ל-100' : 'סכום הנחה לא תקין');
  const min = money(c.min_total === '' || c.min_total == null ? 0 : c.min_total);
  if (min === undefined) return err('מינימום הזמנה לא תקין');
  const limit =
    c.usage_limit === null || c.usage_limit === undefined || c.usage_limit === ''
      ? null
      : int(c.usage_limit, 1, 1_000_000);
  if (limit === undefined) return err('מגבלת שימושים לא תקינה');
  const starts = date(c.starts_at);
  const ends = date(c.ends_at);
  if (starts === undefined || ends === undefined) return err('תאריך לא תקין');
  if (starts && ends && ends <= starts) return err('תאריך הסיום חייב להיות אחרי תאריך ההתחלה');
  if (typeof c.active !== 'boolean') return err('סטטוס פעיל לא תקין');
  return {
    ...(c.id ? { id: c.id as string } : {}),
    code,
    type: c.type,
    value,
    min_total: min,
    usage_limit: limit,
    starts_at: starts,
    ends_at: ends,
    active: c.active,
  };
}

function parseShipping(v: unknown): ShippingSetting | Err {
  if (!isObj(v)) return err('הגדרות משלוח חסרות');
  if (v.mode !== 'per_unit' && v.mode !== 'flat' && v.mode !== 'free')
    return err('שיטת משלוח לא תקינה');
  const amount = v.mode === 'free' ? 0 : money(v.amount, 1_000);
  if (amount === undefined) return err('מחיר משלוח לא תקין');
  const label = text(v.label, 60) ?? 'משלוח עד הבית';
  if (label === undefined) return err('הכיתוב ארוך מדי');
  const out: ShippingSetting = { mode: v.mode, amount, label };
  if (
    v.mode === 'flat' &&
    v.freeOverSubtotal !== undefined &&
    v.freeOverSubtotal !== null &&
    v.freeOverSubtotal !== ''
  ) {
    const free = money(v.freeOverSubtotal);
    if (free === undefined) return err('סכום למשלוח חינם לא תקין');
    out.freeOverSubtotal = free;
  }
  return out;
}

function parseStore(v: unknown): StoreSetting | Err {
  if (!isObj(v)) return err('פרטי עסק חסרים');
  const f = (k: string, max: number) => text(v[k], max);
  const name = f('name', 80);
  if (!name) return err('שם החנות חסר');
  const fields = {
    legal_name: f('legal_name', 120),
    business_id: f('business_id', 20),
    address: f('address', 200),
    phone: f('phone', 30),
    email: f('email', 120),
    whatsapp: f('whatsapp', 20),
  };
  for (const [k, val] of Object.entries(fields))
    if (val === undefined) return err(`השדה ${k} ארוך מדי`);
  if (fields.business_id && !/^\d{8,9}$/.test(fields.business_id))
    return err('ח.פ / עוסק: 8-9 ספרות');
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email))
    return err('מייל לא תקין');
  const wa = fields.whatsapp?.replace(/[^\d]/g, '').replace(/^0/, '972') ?? '';
  if (wa && !/^972\d{8,9}$/.test(wa)) return err('מספר וואטסאפ לא תקין');
  return {
    name,
    legal_name: fields.legal_name ?? '',
    business_id: fields.business_id ?? '',
    address: fields.address ?? '',
    phone: fields.phone ?? '',
    email: fields.email ?? '',
    whatsapp: wa,
    currency: 'ILS',
  };
}

export function parseAdminAction(raw: unknown): Action | Err {
  if (!isObj(raw) || typeof raw.action !== 'string') return err('בקשה לא תקינה');
  const b = raw;
  switch (raw.action) {
    case 'order.status': {
      if (!uuid(b.orderId)) return err('הזמנה לא תקינה');
      if (!STATUSES.includes(b.status as OrderStatus)) return err('סטטוס לא תקין');
      const t = tracking(b.trackingNumber);
      if (t === undefined) return err('מספר מעקב לא תקין');
      return {
        action: 'order.status',
        orderId: b.orderId,
        status: b.status as OrderStatus,
        trackingNumber: t,
      };
    }
    case 'order.tracking': {
      if (!uuid(b.orderId)) return err('הזמנה לא תקינה');
      const t = tracking(b.trackingNumber);
      if (t === undefined) return err('מספר מעקב לא תקין');
      return { action: 'order.tracking', orderId: b.orderId, trackingNumber: t };
    }
    case 'order.note': {
      if (!uuid(b.orderId)) return err('הזמנה לא תקינה');
      const note = text(b.note, 1000);
      if (!note) return err('ההערה ריקה או ארוכה מדי');
      return { action: 'order.note', orderId: b.orderId, note };
    }
    case 'abandoned.contacted': {
      if (!uuid(b.id)) return err('רשומה לא תקינה');
      return { action: 'abandoned.contacted', id: b.id, contacted: b.contacted !== false };
    }
    case 'product.update': {
      if (!uuid(b.id)) return err('מוצר לא תקין');
      const patch = parseProduct(b.patch);
      return 'error' in patch ? patch : { action: 'product.update', id: b.id, patch };
    }
    case 'coupon.upsert': {
      const coupon = parseCoupon(b.coupon);
      return 'error' in coupon ? coupon : { action: 'coupon.upsert', coupon };
    }
    case 'coupon.delete':
      return uuid(b.id) ? { action: 'coupon.delete', id: b.id } : err('קופון לא תקין');
    case 'settings.shipping': {
      const value = parseShipping(b.value);
      return 'error' in value ? value : { action: 'settings.shipping', value };
    }
    case 'settings.store': {
      const value = parseStore(b.value);
      return 'error' in value ? value : { action: 'settings.store', value };
    }
    default:
      return err('פעולה לא מוכרת');
  }
}

/** שדות התאריך שמתעדכנים יחד עם הסטטוס. */
export function statusTimestamps(to: OrderStatus, now: string): Record<string, string | null> {
  if (to === 'shipped') return { shipped_at: now };
  if (to === 'cancelled') return { cancelled_at: now };
  if (to === 'paid' || to === 'packed') return { shipped_at: null };
  return {};
}
