/**
 * הקטלוג (חבילות, משלוח, פרטי עסק) נקרא מ-Supabase בזמן build, כך ששינוי במערכת הניהול
 * מתעדכן באתר אחרי בנייה מחדש (build hook). אם אין חיבור, נשארים עם ערכי ברירת המחדל
 * שבקוד, כדי שהבנייה לעולם לא תיכשל בגלל המסד.
 * רץ רק בזמן build (Node). לא לייבא מסקריפטים של הדפדפן.
 */
export interface CatalogProduct {
  slug: string;
  name: string;
  description: string | null;
  units: number;
  price_ils: number;
  compare_at_price: number | null;
  sold_out: boolean;
}
export interface CatalogShipping {
  mode: 'per_unit' | 'flat' | 'free';
  amount: number;
  freeOverSubtotal?: number;
  label?: string;
}
export interface CatalogStore {
  name?: string;
  legal_name?: string;
  business_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
}
export interface Catalog {
  source: 'db' | 'fallback';
  products: CatalogProduct[] | null;
  shipping: CatalogShipping | null;
  store: CatalogStore | null;
}

async function load(): Promise<Catalog> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const none: Catalog = { source: 'fallback', products: null, shipping: null, store: null };
  if (!url || !key || process.env.CATALOG_OFFLINE === '1') return none;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/public_catalog`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const c = (await res.json()) as Omit<Catalog, 'source'>;
    const products = (c.products ?? []).map((p) => ({
      ...p,
      price_ils: Number(p.price_ils),
      compare_at_price: p.compare_at_price === null ? null : Number(p.compare_at_price),
    }));
    const shipping = c.shipping ? { ...c.shipping, amount: Number(c.shipping.amount) } : null;
    console.info(`[catalog] ${products.length} חבילות מהמסד`);
    return { source: 'db', products, shipping, store: c.store ?? null };
  } catch (e) {
    console.warn(`[catalog] משתמשים בברירת מחדל: ${(e as Error).message}`);
    return none;
  }
}

export const catalog: Catalog = await load();
