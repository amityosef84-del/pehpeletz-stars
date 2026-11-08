import type { Config, Context } from '@netlify/functions';
import { env } from '../lib/env';
import { anonKey, empty, isAllowedOrigin, json, readJson } from '../lib/http';
import { serviceClient } from '../lib/supabase';

/**
 * POST /api/checkout-draft: שמירת עגלה נטושה (שם/טלפון/מייל + חבילה) כשהלקוח מילא פרטי קשר
 * בעמוד התשלום. משמש לחזרה ללקוחות שלא השלימו הזמנה. מפורט במדיניות הפרטיות.
 */
interface Draft {
  visitor_id?: string;
  session_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  package_slug?: string;
  total?: number;
  company?: string; // honeypot
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const s = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export default async (req: Request, context: Context): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return empty(204, origin);
  if (!isAllowedOrigin(req)) return json({ error: 'origin' }, 403);
  const d = await readJson<Draft>(req, 4_000);
  if (!d || !UUID_RE.test(d.session_id ?? '') || !UUID_RE.test(d.visitor_id ?? '')) {
    return json({ error: 'bad_request' }, 400, origin);
  }
  if (d.company) return empty(204, origin); // בוט

  const email = s(d.email, 120);
  const phone = s(d.phone, 20);
  if (!email && !phone) return empty(204, origin);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return json({ error: 'email' }, 400, origin);
  if (phone && !/^05\d{8}$/.test(phone)) return json({ error: 'phone' }, 400, origin);
  const slug = s(d.package_slug, 20);
  if (slug && !/^kit-[1-9]$/.test(slug)) return json({ error: 'package' }, 400, origin);

  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return empty(202, origin);
  const db = serviceClient();
  const { data: allowed } = await db.rpc('rate_limit_hit', {
    p_key: anonKey(context.ip, 'draft'),
    p_window_seconds: 60,
    p_max: 20,
  });
  if (allowed === false) return json({ error: 'rate_limited' }, 429, origin);

  const { error } = await db.rpc('upsert_abandoned_checkout', {
    p: {
      session_id: d.session_id,
      visitor_id: d.visitor_id,
      name: s(d.name, 80),
      email,
      phone,
      package_slug: slug,
      total: typeof d.total === 'number' && d.total >= 0 && d.total < 100_000 ? d.total : null,
      cart: slug ? [{ productId: slug, qty: 1 }] : [],
    },
  });
  if (error) {
    console.error('checkout-draft: failed', error.message);
    return json({ error: 'server' }, 500, origin);
  }
  return empty(204, origin);
};

export const config: Config = { path: '/api/checkout-draft', method: ['POST', 'OPTIONS'] };
