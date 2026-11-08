import { priceOrder, type PricingProduct, type ShippingRule } from '@pehpeletz/shared';
import { catalog } from './catalog';

/**
 * החבילות בדף. שם, מחיר, זמינות ומשלוח נקראים מהמסד בזמן build (catalog.ts);
 * קהל היעד, תגית וסדר התצוגה נשלטים מכאן. החישוב כאן משמש לתצוגה בלבד:
 * הסכום לחיוב מחושב תמיד מחדש בשרת (create-order).
 */
export interface PackageDisplay {
  slug: string;
  name: string;
  audience: string;
  units: number;
  badge?: string;
  /** הבולט בדף (מסגרת מודגשת) */
  featured?: boolean;
  price_ils: number;
  soldOut?: boolean;
}

/** סדר החבילות והתגיות נשלטים מכאן (מוכן ל-A/B). */
const base: Omit<PackageDisplay, 'price_ils'>[] = [
  { slug: 'kit-1', name: 'כוח הצחצוח', audience: 'לילד יחיד', units: 1 },
  {
    slug: 'kit-2',
    name: 'כוח על זוגי',
    audience: 'לשני אחים',
    units: 2,
    badge: 'הכי פופולרי',
    featured: true,
  },
  { slug: 'kit-3', name: 'כוח על לגיבורים אמיתיים', audience: 'לשלושה אחים', units: 3 },
  { slug: 'kit-4', name: 'כוח צחצוח משפחתי', audience: 'לארבעה אחים', units: 4 },
];

const db = catalog.products ? new Map(catalog.products.map((p) => [p.slug, p])) : null;

/** חבילה שהושבתה במערכת הניהול לא מוצגת. */
export const packages: PackageDisplay[] = base.flatMap((p) => {
  if (!db) return [{ ...p, price_ils: 0 }];
  const row = db.get(p.slug);
  if (!row) return [];
  return [
    { ...p, name: row.name, units: row.units, price_ils: row.price_ils, soldOut: row.sold_out },
  ];
});

export const DEFAULT_PACKAGE =
  packages.find((p) => p.featured && !p.soldOut)?.slug ?? packages[0]?.slug ?? 'kit-2';

const s = catalog.shipping;
export const shippingRule: ShippingRule =
  s?.mode === 'free'
    ? { mode: 'free' }
    : s?.mode === 'flat'
      ? { mode: 'flat', amount: s.amount, freeOverSubtotal: s.freeOverSubtotal }
      : { mode: 'per_unit', amount: s?.amount ?? 50 };

/** מחיר משלוח לערכה, לטקסטים בדף. */
export const SHIP_PER_KIT = shippingRule.mode === 'per_unit' ? shippingRule.amount : 0;

/** אותם נתונים כמו ב-DB, כדי לחשב עם אותה פונקציה שהשרת משתמש בה. */
export const pricingProducts: PricingProduct[] = packages.map((p) => ({
  id: p.slug,
  slug: p.slug,
  name: p.name,
  units: p.units,
  price_ils: p.price_ils,
  active: true,
  stock: null,
}));

export function quote(slug: string) {
  return priceOrder({
    lines: [{ productId: slug, qty: 1 }],
    products: pricingProducts,
    shipping: shippingRule,
  });
}

export const formatIls = (n: number) =>
  `${n.toLocaleString('he-IL', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}\u00A0₪`;
