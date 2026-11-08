import { priceOrder, type PricingProduct, type ShippingRule } from '@pehpeletz/shared';

/**
 * החבילות בדף. משקף את ה-seed ב-supabase/migrations (slug, units, price_ils).
 * בשלב 2 הנתונים ייקראו מה-DB בזמן build. החישוב כאן משמש לתצוגה בלבד:
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
}

/** סדר החבילות והתגיות נשלטים מכאן (מוכן ל-A/B). */
export const packages: PackageDisplay[] = [
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

export const DEFAULT_PACKAGE = 'kit-2';

export const shippingRule: ShippingRule = { mode: 'per_unit', amount: 50 };

/** אותם נתונים כמו ב-DB, כדי לחשב עם אותה פונקציה שהשרת משתמש בה. */
export const pricingProducts: PricingProduct[] = packages.map((p) => ({
  id: p.slug,
  slug: p.slug,
  name: p.name,
  units: p.units,
  price_ils: 0,
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
