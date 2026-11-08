import { describe, expect, it } from 'vitest';
import { allowed, canTransition, parseAdminAction, statusTimestamps } from '../lib/adminActions';

const ID = '11111111-2222-4333-8444-555555555555';
const product = {
  name: ' כוח הצחצוח ',
  description: '',
  price_ils: '0',
  compare_at_price: null,
  stock: '',
  active: true,
  sort: 10,
};

describe('admin actions: הרשאות', () => {
  it('צוות מטפל בהזמנות ובעגלות נטושות', () => {
    for (const a of [
      'order.status',
      'order.tracking',
      'order.note',
      'abandoned.contacted',
    ] as const)
      expect(allowed('staff', a)).toBe(true);
  });
  it('צוות לא משנה מחירים, קופונים או הגדרות', () => {
    for (const a of [
      'product.update',
      'coupon.upsert',
      'coupon.delete',
      'settings.shipping',
      'settings.store',
    ] as const)
      expect(allowed('staff', a)).toBe(false);
  });
  it('בעלים רשאים הכל', () => {
    expect(allowed('owner', 'settings.store')).toBe(true);
  });
});

describe('admin actions: מעברי סטטוס', () => {
  it.each([
    ['paid', 'packed'],
    ['packed', 'shipped'],
    ['shipped', 'delivered'],
    ['paid', 'cancelled'],
    ['shipped', 'packed'],
  ] as const)('%s → %s מותר', (f, t) => expect(canTransition(f, t)).toBe(true));
  it.each([
    ['pending', 'paid'],
    ['paid', 'refunded'],
    ['cancelled', 'paid'],
    ['delivered', 'cancelled'],
    ['refunded', 'shipped'],
  ] as const)('%s → %s חסום', (f, t) => expect(canTransition(f, t)).toBe(false));
  it('shipped קובע תאריך משלוח, חזרה לאריזה מנקה אותו', () => {
    expect(statusTimestamps('shipped', 'T')).toEqual({ shipped_at: 'T' });
    expect(statusTimestamps('packed', 'T')).toEqual({ shipped_at: null });
    expect(statusTimestamps('cancelled', 'T')).toEqual({ cancelled_at: 'T' });
  });
});

describe('admin actions: ולידציה', () => {
  it('דוחה פעולה לא מוכרת ומזהה לא תקין', () => {
    expect(parseAdminAction({ action: 'drop.table' })).toHaveProperty('error');
    expect(parseAdminAction({ action: 'order.note', orderId: '1', note: 'x' })).toHaveProperty(
      'error',
    );
    expect(parseAdminAction(null)).toHaveProperty('error');
  });
  it('order.status: מספר מעקב עם תווים מסוכנים נדחה', () => {
    expect(
      parseAdminAction({
        action: 'order.status',
        orderId: ID,
        status: 'shipped',
        trackingNumber: '<script>',
      }),
    ).toHaveProperty('error');
    expect(
      parseAdminAction({
        action: 'order.status',
        orderId: ID,
        status: 'shipped',
        trackingNumber: ' RR123 IL ',
      }),
    ).toEqual({
      action: 'order.status',
      orderId: ID,
      status: 'shipped',
      trackingNumber: 'RR123 IL',
    });
  });
  it('order.note: הערה ריקה נדחית', () => {
    expect(parseAdminAction({ action: 'order.note', orderId: ID, note: '   ' })).toHaveProperty(
      'error',
    );
  });
  it('product.update: מנרמל מחרוזות ומספרים', () => {
    expect(parseAdminAction({ action: 'product.update', id: ID, patch: product })).toEqual({
      action: 'product.update',
      id: ID,
      patch: { ...product, name: 'כוח הצחצוח', description: null, price_ils: 0, stock: null },
    });
  });
  it.each([
    [{ price_ils: -1 }],
    [{ price_ils: 'abc' }],
    [{ price_ils: 10.555 }],
    [{ price_ils: 50, compare_at_price: 40 }],
    [{ stock: 1.5 }],
    [{ name: '' }],
    [{ active: 'yes' }],
  ])('product.update: דוחה %j', (bad) => {
    expect(
      parseAdminAction({ action: 'product.update', id: ID, patch: { ...product, ...bad } }),
    ).toHaveProperty('error');
  });
  it('coupon.upsert: קוד באותיות גדולות, תאריכים ל-ISO', () => {
    const r = parseAdminAction({
      action: 'coupon.upsert',
      coupon: {
        code: 'welcome10',
        type: 'percent',
        value: 10,
        min_total: '',
        usage_limit: '',
        starts_at: '2026-11-10',
        ends_at: null,
        active: true,
      },
    });
    expect(r).toMatchObject({
      coupon: {
        code: 'WELCOME10',
        min_total: 0,
        usage_limit: null,
        starts_at: '2026-11-10T00:00:00.000Z',
      },
    });
  });
  it.each([
    [{ code: 'א' }],
    [{ type: 'percent', value: 150 }],
    [{ type: 'bogus' }],
    [{ value: 0 }],
    [{ starts_at: '2026-12-01', ends_at: '2026-11-01' }],
  ])('coupon.upsert: דוחה %j', (bad) => {
    const base = {
      code: 'SAVE',
      type: 'fixed',
      value: 20,
      min_total: 0,
      usage_limit: null,
      starts_at: null,
      ends_at: null,
      active: true,
    };
    expect(
      parseAdminAction({ action: 'coupon.upsert', coupon: { ...base, ...bad } }),
    ).toHaveProperty('error');
  });
  it('settings.shipping: משלוח חינם מאפס סכום', () => {
    expect(
      parseAdminAction({ action: 'settings.shipping', value: { mode: 'free', amount: 50 } }),
    ).toEqual({
      action: 'settings.shipping',
      value: { mode: 'free', amount: 0, label: 'משלוח עד הבית' },
    });
    expect(
      parseAdminAction({ action: 'settings.shipping', value: { mode: 'per_unit', amount: -5 } }),
    ).toHaveProperty('error');
  });
  it('settings.store: מנרמל וואטסאפ ובודק ח.פ', () => {
    const r = parseAdminAction({
      action: 'settings.store',
      value: { name: 'פהפלצת', whatsapp: '050-670-5556', business_id: '' },
    });
    expect(r).toMatchObject({ value: { whatsapp: '972506705556', business_id: '' } });
    expect(
      parseAdminAction({ action: 'settings.store', value: { name: 'x', business_id: '12' } }),
    ).toHaveProperty('error');
  });
});
