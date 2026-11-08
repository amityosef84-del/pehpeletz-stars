/**
 * חישוב סכום הזמנה. רץ רק בשרת (create-order), על נתונים מה-DB.
 * הדפדפן שולח רק מזהי מוצרים, כמויות וקוד קופון (SPEC §7, §10).
 *
 * כל החישוב באגורות (שלמים) כדי למנוע שגיאות נקודה צפה, והתוצאה מוחזרת בש"ח.
 */

export interface PricingProduct {
  id: string;
  slug: string;
  name: string;
  /** כמה ערכות פיזיות בחבילה. */
  units: number;
  price_ils: number | string;
  active: boolean;
  /** null = מלאי לא מנוהל. */
  stock: number | null;
}

export type ShippingRule =
  | { mode: 'per_unit'; amount: number }
  | { mode: 'flat'; amount: number; freeOverSubtotal?: number }
  | { mode: 'free' };

export interface PricingCoupon {
  code: string;
  type: 'percent' | 'fixed';
  value: number | string;
  min_total: number | string;
  usage_limit: number | null;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export interface CartLine {
  productId: string;
  qty: number;
}

export interface PricedLine {
  productId: string;
  slug: string;
  name: string;
  units: number;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  /** סך הערכות הפיזיות בהזמנה. */
  units: number;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  couponCode: string | null;
}

export type PricingErrorCode =
  | 'EMPTY_CART'
  | 'TOO_MANY_LINES'
  | 'INVALID_QTY'
  | 'UNKNOWN_PRODUCT'
  | 'INACTIVE_PRODUCT'
  | 'OUT_OF_STOCK'
  | 'COUPON_INVALID'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_USED_UP'
  | 'COUPON_MIN_TOTAL';

export class PricingError extends Error {
  constructor(
    public readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

export const MAX_LINES = 10;
export const MAX_QTY_PER_LINE = 10;

/** ש"ח → אגורות. מקבל גם מחרוזת (Postgres numeric מגיע כמחרוזת). */
export function toAgorot(ils: number | string): number {
  const n = typeof ils === 'string' ? Number(ils) : ils;
  if (!Number.isFinite(n)) throw new TypeError(`Invalid amount: ${ils}`);
  return Math.round(n * 100);
}

export function toIls(agorot: number): number {
  return agorot / 100;
}

export function shippingAgorot(rule: ShippingRule, units: number, subtotalAgorot: number): number {
  switch (rule.mode) {
    case 'per_unit':
      return toAgorot(rule.amount) * units;
    case 'flat':
      if (
        rule.freeOverSubtotal !== undefined &&
        subtotalAgorot >= toAgorot(rule.freeOverSubtotal)
      ) {
        return 0;
      }
      return toAgorot(rule.amount);
    case 'free':
      return 0;
  }
}

export interface PriceOrderInput {
  lines: CartLine[];
  products: PricingProduct[];
  shipping: ShippingRule;
  coupon?: PricingCoupon | null;
  now?: Date;
}

export function priceOrder({
  lines,
  products,
  shipping,
  coupon = null,
  now = new Date(),
}: PriceOrderInput): PricedOrder {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PricingError('EMPTY_CART', 'העגלה ריקה');
  }

  // איחוד שורות כפולות של אותו מוצר
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY_PER_LINE) {
      throw new PricingError('INVALID_QTY', 'כמות לא תקינה');
    }
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.qty);
  }
  if (merged.size > MAX_LINES) {
    throw new PricingError('TOO_MANY_LINES', 'יותר מדי פריטים בעגלה');
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const priced: PricedLine[] = [];
  let subtotal = 0;
  let units = 0;

  for (const [productId, qty] of merged) {
    if (qty > MAX_QTY_PER_LINE) throw new PricingError('INVALID_QTY', 'כמות לא תקינה');
    const product = byId.get(productId);
    if (!product) throw new PricingError('UNKNOWN_PRODUCT', 'מוצר לא קיים');
    if (!product.active) throw new PricingError('INACTIVE_PRODUCT', 'המוצר אינו זמין כרגע');
    const unitsForLine = product.units * qty;
    if (product.stock !== null && product.stock < qty) {
      throw new PricingError('OUT_OF_STOCK', 'אין מספיק מלאי');
    }
    const unitPrice = toAgorot(product.price_ils);
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    units += unitsForLine;
    priced.push({
      productId,
      slug: product.slug,
      name: product.name,
      units: product.units,
      unitPrice: toIls(unitPrice),
      qty,
      lineTotal: toIls(lineTotal),
    });
  }

  const ship = shippingAgorot(shipping, units, subtotal);
  const beforeDiscount = subtotal + ship;

  let discount = 0;
  let couponCode: string | null = null;
  if (coupon) {
    discount = couponDiscountAgorot(coupon, beforeDiscount, now);
    couponCode = coupon.code.toUpperCase();
  }

  const total = beforeDiscount - discount;
  return {
    lines: priced,
    units,
    subtotal: toIls(subtotal),
    shipping: toIls(ship),
    discount: toIls(discount),
    total: toIls(total),
    couponCode,
  };
}

/**
 * הנחת קופון באגורות. הבסיס הוא מוצרים + משלוח, כי במבצע הנוכחי המוצר עצמו ב-0
 * וכל הסכום הוא משלוח. אחרת קופון אחוזים לא היה נותן כלום.
 */
export function couponDiscountAgorot(
  coupon: PricingCoupon,
  baseAgorot: number,
  now: Date = new Date(),
): number {
  if (!coupon.active) throw new PricingError('COUPON_INVALID', 'הקופון אינו בתוקף');
  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    throw new PricingError('COUPON_NOT_STARTED', 'הקופון עדיין לא פעיל');
  }
  if (coupon.ends_at && new Date(coupon.ends_at) <= now) {
    throw new PricingError('COUPON_EXPIRED', 'תוקף הקופון פג');
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    throw new PricingError('COUPON_USED_UP', 'הקופון נוצל במלואו');
  }
  if (baseAgorot < toAgorot(coupon.min_total)) {
    throw new PricingError('COUPON_MIN_TOTAL', 'הסכום נמוך מהמינימום לקופון');
  }
  const value = Number(coupon.value);
  const raw = coupon.type === 'percent' ? Math.round((baseAgorot * value) / 100) : toAgorot(value);
  return Math.min(raw, baseAgorot);
}
