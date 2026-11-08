import { canTransition, type OrderStatus } from '@pehpeletz/shared';
import type { Abandoned, AuditEntry, Coupon, Customer, Order, Product, Settings } from './store';

/** נתוני דוגמה (?demo) לכל מסכי הניהול. נשמרים בזיכרון בלבד ומתאפסים ברענון. */

interface DemoDb {
  orders: Order[];
  customers: Customer[];
  products: Product[];
  coupons: Coupon[];
  abandoned: Abandoned[];
  audit: (AuditEntry & { entity_id: string })[];
  settings: Settings;
}

const NAMES = [
  'נועה כהן',
  'יוסי לוי',
  'מיכל אברהם',
  'דניאל פרץ',
  'שירה מזרחי',
  'אורי ביטון',
  'רותם דהן',
  'טל אזולאי',
  'הילה גבאי',
  'עומר שושן',
  'ליאת חדד',
  'אביב פרידמן',
];
const CITIES = [
  'תל אביב',
  'חיפה',
  'ירושלים',
  'באר שבע',
  'ראשון לציון',
  'פתח תקווה',
  'נתניה',
  'אשדוד',
];
const KITS = [
  { name: 'כוח הצחצוח', units: 1 },
  { name: 'כוח על זוגי', units: 2 },
  { name: 'כוח על לגיבורים אמיתיים', units: 3 },
  { name: 'כוח צחצוח משפחתי', units: 4 },
];
const uid = (n: number, p = 'a') => `${p.repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;

let db: DemoDb | null = null;

function build(): DemoDb {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

  const customers: Customer[] = NAMES.map((name, i) => ({
    id: uid(i + 1, 'c'),
    name,
    email: `demo${i + 1}@example.com`,
    phone: `05${(i % 9) + 1}${String(1234567 + i * 7919).slice(0, 7)}`,
    marketing_consent: i % 3 !== 0,
    created_at: hoursAgo(400 - i * 20),
    orders: [],
  }));

  const statuses: OrderStatus[] = [
    'paid',
    'paid',
    'paid',
    'packed',
    'packed',
    'shipped',
    'shipped',
    'shipped',
    'delivered',
    'delivered',
    'delivered',
    'delivered',
    'cancelled',
    'pending',
  ];
  const orders: Order[] = Array.from({ length: 26 }, (_, i) => {
    const c = customers[i % customers.length]!;
    const kit = KITS[[1, 0, 1, 2, 1, 3, 0, 1][i % 8]!]!;
    const status =
      i < 4 ? (['paid', 'paid', 'packed', 'pending'] as OrderStatus[])[i]! : pick(statuses);
    const created = hoursAgo(i * 13 + 1 + rnd() * 6);
    const shipping = kit.units * 50;
    const discount = i % 7 === 3 ? 20 : 0;
    const paid = status !== 'pending';
    return {
      id: uid(i + 1, 'e'),
      order_number: 1026 - i,
      status,
      payment_status:
        status === 'pending' ? 'pending' : status === 'cancelled' ? 'refunded' : 'paid',
      subtotal: 0,
      discount,
      shipping,
      total: shipping - discount,
      refunded_amount: status === 'cancelled' ? shipping - discount : 0,
      coupon_code: discount ? 'WELCOME20' : null,
      shipping_address: {
        city: pick(CITIES),
        street: pick(['הרצל', 'ויצמן', 'הנביאים', 'רוטשילד', 'בן גוריון']),
        house: String(1 + Math.floor(rnd() * 80)),
        apartment: rnd() > 0.5 ? String(1 + Math.floor(rnd() * 20)) : '',
        zip: '',
      },
      notes: i % 5 === 1 ? 'להשאיר ליד הדלת בבקשה' : null,
      tracking_number: ['shipped', 'delivered'].includes(status) ? `RR${48210 + i}IL` : null,
      utm: { source: pick(['facebook', 'instagram', 'tiktok']), campaign: 'launch' },
      sumit_document_url: paid ? 'https://example.com/invoice-demo.pdf' : null,
      created_at: created,
      paid_at: paid ? created : null,
      shipped_at: ['shipped', 'delivered'].includes(status) ? hoursAgo(i * 13 - 20) : null,
      cancelled_at: status === 'cancelled' ? created : null,
      customer: { id: c.id, name: c.name, email: c.email, phone: c.phone },
      items: [{ name_snapshot: kit.name, units_snapshot: kit.units, unit_price: 0, qty: 1 }],
    };
  });
  for (const o of orders) {
    customers
      .find((c) => c.id === o.customer!.id)!
      .orders.push({
        id: o.id,
        order_number: o.order_number,
        total: o.total,
        refunded_amount: o.refunded_amount,
        payment_status: o.payment_status,
        status: o.status,
        created_at: o.created_at,
      });
  }

  const products: Product[] = KITS.map((k, i) => ({
    id: uid(i + 1, 'f'),
    slug: `kit-${i + 1}`,
    name: k.name,
    description: null,
    units: k.units,
    price_ils: 0,
    compare_at_price: null,
    stock: null,
    active: true,
    sort: (i + 1) * 10,
  }));

  const coupons: Coupon[] = [
    {
      id: uid(1, 'b'),
      code: 'WELCOME20',
      type: 'fixed',
      value: 20,
      min_total: 100,
      usage_limit: 200,
      used_count: 3,
      starts_at: null,
      ends_at: null,
      active: true,
    },
    {
      id: uid(2, 'b'),
      code: 'FAMILY10',
      type: 'percent',
      value: 10,
      min_total: 0,
      usage_limit: null,
      used_count: 0,
      starts_at: null,
      ends_at: hoursAgo(-24 * 14),
      active: false,
    },
  ];

  const abandoned: Abandoned[] = Array.from({ length: 9 }, (_, i) => ({
    id: uid(i + 1, 'd'),
    name: i === 6 ? null : NAMES[(i + 5) % NAMES.length]!,
    email: i % 3 === 0 ? `cart${i}@example.com` : null,
    phone: `054${String(7000000 + i * 104729).slice(0, 7)}`,
    cart: [{ productId: `kit-${(i % 4) + 1}`, qty: 1 }],
    recovered: i === 4,
    contacted_at: i === 2 || i === 4 ? hoursAgo(i * 5) : null,
    created_at: hoursAgo(i * 9 + 2),
    updated_at: hoursAgo(i * 9 + 1),
  }));

  const audit: DemoDb['audit'] = [
    {
      id: 1,
      entity_id: uid(3, 'e'),
      actor_email: 'owner@example.com',
      action: 'status_change',
      before: { status: 'paid' },
      after: { status: 'packed' },
      note: null,
      created_at: hoursAgo(20),
    },
    {
      id: 2,
      entity_id: uid(3, 'e'),
      actor_email: 'owner@example.com',
      action: 'note',
      before: null,
      after: null,
      note: 'הלקוחה ביקשה שליחה אחרי יום רביעי',
      created_at: hoursAgo(22),
    },
  ];

  return {
    orders,
    customers,
    products,
    coupons,
    abandoned,
    audit,
    settings: {
      shipping: { mode: 'per_unit', amount: 50, label: 'משלוח עד הבית' },
      store: { name: 'הכוכבים של פהפלצת', whatsapp: '972506705556' },
    },
  };
}

export function demoDb(): DemoDb {
  return (db ??= build());
}

/** מחקה את /api/admin-action על נתוני הדוגמה, כדי שאפשר לנסות את כל המסכים. */
export async function demoAct(b: Record<string, unknown>): Promise<Record<string, unknown>> {
  const d = demoDb();
  const log = (entity_id: string, action: string, extra: Partial<AuditEntry> = {}) =>
    d.audit.unshift({
      id: d.audit.length + 1,
      entity_id,
      actor_email: 'owner@example.com',
      action,
      before: null,
      after: null,
      note: null,
      created_at: new Date().toISOString(),
      ...extra,
    });
  await new Promise((r) => setTimeout(r, 250));
  switch (b.action) {
    case 'order.status': {
      const o = d.orders.find((x) => x.id === b.orderId);
      const to = b.status as OrderStatus;
      if (!o) throw new Error('ההזמנה לא נמצאה');
      if (!canTransition(o.status, to)) throw new Error('אי אפשר לעבור לסטטוס הזה');
      log(o.id, 'status_change', { before: { status: o.status }, after: { status: to } });
      o.status = to;
      if (to === 'shipped') o.shipped_at = new Date().toISOString();
      if (to === 'cancelled') o.cancelled_at = new Date().toISOString();
      if (b.trackingNumber) o.tracking_number = String(b.trackingNumber);
      return {};
    }
    case 'order.tracking': {
      const o = d.orders.find((x) => x.id === b.orderId)!;
      o.tracking_number = (b.trackingNumber as string) || null;
      log(o.id, 'tracking', { after: { tracking_number: o.tracking_number } });
      return {};
    }
    case 'order.note':
      log(String(b.orderId), 'note', { note: String(b.note) });
      return {};
    case 'abandoned.contacted': {
      const a = d.abandoned.find((x) => x.id === b.id)!;
      a.contacted_at = b.contacted === false ? null : new Date().toISOString();
      return {};
    }
    case 'product.update': {
      const p = d.products.find((x) => x.id === b.id)!;
      Object.assign(p, b.patch);
      return { rebuild: 'started' };
    }
    case 'coupon.upsert': {
      const c = b.coupon as Coupon;
      const code = c.code.toUpperCase();
      if (d.coupons.some((x) => x.code === code && x.id !== c.id))
        throw new Error('כבר קיים קופון עם הקוד הזה');
      const existing = d.coupons.find((x) => x.id === c.id);
      if (existing) Object.assign(existing, { ...c, code });
      else d.coupons.unshift({ ...c, code, id: crypto.randomUUID(), used_count: 0 });
      return {};
    }
    case 'coupon.delete':
      d.coupons = d.coupons.filter((x) => x.id !== b.id);
      return {};
    case 'settings.shipping':
      d.settings.shipping = b.value as Settings['shipping'];
      return { rebuild: 'started' };
    case 'settings.store':
      d.settings.store = b.value as Settings['store'];
      return { rebuild: 'started' };
  }
  throw new Error('פעולה לא מוכרת');
}
