import { describe, expect, it } from 'vitest';
import {
  PricingError,
  priceOrder,
  type PricingCoupon,
  type PricingProduct,
  type ShippingRule,
} from '../src/pricing';

// כמו ב-seed: הערכה במתנה, 50 ש"ח משלוח לכל ערכה.
const products: PricingProduct[] = [1, 2, 3, 4].map((n) => ({
  id: `p${n}`,
  slug: `kit-${n}`,
  name: `חבילה ${n}`,
  units: n,
  price_ils: '0.00',
  active: true,
  stock: null,
}));
const shipping: ShippingRule = { mode: 'per_unit', amount: 50 };
const now = new Date('2026-11-08T12:00:00Z');

const coupon = (over: Partial<PricingCoupon> = {}): PricingCoupon => ({
  code: 'launch10',
  type: 'percent',
  value: '10',
  min_total: '0',
  usage_limit: null,
  used_count: 0,
  starts_at: null,
  ends_at: null,
  active: true,
  ...over,
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof PricingError ? e.code : 'OTHER';
  }
  return 'NO_ERROR';
};

describe('priceOrder: מבצע "ערכה במתנה + 50 ש"ח משלוח לערכה"', () => {
  it.each([
    ['p1', 50],
    ['p2', 100],
    ['p3', 150],
    ['p4', 200],
  ])('חבילה %s עולה %d ש"ח כולל משלוח', (id, expected) => {
    const r = priceOrder({ lines: [{ productId: id, qty: 1 }], products, shipping, now });
    expect(r.subtotal).toBe(0);
    expect(r.shipping).toBe(expected);
    expect(r.total).toBe(expected);
  });

  it('סופר ערכות לפי units × qty ומאחד שורות כפולות', () => {
    const r = priceOrder({
      lines: [
        { productId: 'p2', qty: 1 },
        { productId: 'p1', qty: 1 },
        { productId: 'p2', qty: 1 },
      ],
      products,
      shipping,
      now,
    });
    expect(r.units).toBe(5);
    expect(r.lines).toHaveLength(2);
    expect(r.total).toBe(250);
  });
});

describe('priceOrder: מחירים מה-DB בלבד', () => {
  it('מחשב נכון מחירים עשרוניים בלי שגיאת נקודה צפה', () => {
    const paid = products.map((p) => ({ ...p, price_ils: '69.90' }));
    const r = priceOrder({
      lines: [{ productId: 'p1', qty: 3 }],
      products: paid,
      shipping: { mode: 'free' },
      now,
    });
    expect(r.subtotal).toBe(209.7);
    expect(r.total).toBe(209.7);
  });

  it('flat shipping עם סף משלוח חינם', () => {
    const paid = products.map((p) => ({ ...p, price_ils: 100 }));
    const rule: ShippingRule = { mode: 'flat', amount: 30, freeOverSubtotal: 200 };
    expect(
      priceOrder({ lines: [{ productId: 'p1', qty: 1 }], products: paid, shipping: rule, now })
        .shipping,
    ).toBe(30);
    expect(
      priceOrder({ lines: [{ productId: 'p1', qty: 2 }], products: paid, shipping: rule, now })
        .shipping,
    ).toBe(0);
  });
});

describe('priceOrder: קופונים', () => {
  it('אחוז הנחה מחושב על מוצרים + משלוח', () => {
    const r = priceOrder({
      lines: [{ productId: 'p2', qty: 1 }],
      products,
      shipping,
      coupon: coupon(),
      now,
    });
    expect(r.discount).toBe(10);
    expect(r.total).toBe(90);
    expect(r.couponCode).toBe('LAUNCH10');
  });

  it('הנחה קבועה לא יורדת מתחת ל-0', () => {
    const r = priceOrder({
      lines: [{ productId: 'p1', qty: 1 }],
      products,
      shipping,
      coupon: coupon({ type: 'fixed', value: '80' }),
      now,
    });
    expect(r.discount).toBe(50);
    expect(r.total).toBe(0);
  });

  it.each<[string, Partial<PricingCoupon>, string]>([
    ['לא פעיל', { active: false }, 'COUPON_INVALID'],
    ['עוד לא התחיל', { starts_at: '2026-12-01T00:00:00Z' }, 'COUPON_NOT_STARTED'],
    ['פג תוקף', { ends_at: '2026-11-01T00:00:00Z' }, 'COUPON_EXPIRED'],
    ['נוצל', { usage_limit: 5, used_count: 5 }, 'COUPON_USED_UP'],
    ['מתחת למינימום', { min_total: '150' }, 'COUPON_MIN_TOTAL'],
  ])('קופון %s נדחה', (_label, over, expected) => {
    expect(
      code(() =>
        priceOrder({
          lines: [{ productId: 'p2', qty: 1 }],
          products,
          shipping,
          coupon: coupon(over),
          now,
        }),
      ),
    ).toBe(expected);
  });
});

describe('priceOrder: קלט לא תקין', () => {
  it.each<[string, Parameters<typeof priceOrder>[0], string]>([
    ['עגלה ריקה', { lines: [], products, shipping }, 'EMPTY_CART'],
    ['כמות 0', { lines: [{ productId: 'p1', qty: 0 }], products, shipping }, 'INVALID_QTY'],
    ['כמות שלילית', { lines: [{ productId: 'p1', qty: -2 }], products, shipping }, 'INVALID_QTY'],
    ['כמות לא שלמה', { lines: [{ productId: 'p1', qty: 1.5 }], products, shipping }, 'INVALID_QTY'],
    [
      'כמות מעל המקסימום אחרי איחוד',
      {
        lines: [
          { productId: 'p1', qty: 6 },
          { productId: 'p1', qty: 6 },
        ],
        products,
        shipping,
      },
      'INVALID_QTY',
    ],
    [
      'מוצר לא קיים',
      { lines: [{ productId: 'nope', qty: 1 }], products, shipping },
      'UNKNOWN_PRODUCT',
    ],
    [
      'מוצר כבוי',
      {
        lines: [{ productId: 'p1', qty: 1 }],
        products: products.map((p) => ({ ...p, active: false })),
        shipping,
      },
      'INACTIVE_PRODUCT',
    ],
    [
      'אין מלאי',
      {
        lines: [{ productId: 'p1', qty: 2 }],
        products: products.map((p) => ({ ...p, stock: 1 })),
        shipping,
      },
      'OUT_OF_STOCK',
    ],
  ])('%s', (_label, input, expected) => {
    expect(code(() => priceOrder(input))).toBe(expected);
  });

  it('מתעלם משדות מחיר שהדפדפן מנסה להעביר', () => {
    const tampered = [{ productId: 'p2', qty: 1, price: 0.01, total: 0.01 }] as unknown as {
      productId: string;
      qty: number;
    }[];
    expect(priceOrder({ lines: tampered, products, shipping, now }).total).toBe(100);
  });
});
