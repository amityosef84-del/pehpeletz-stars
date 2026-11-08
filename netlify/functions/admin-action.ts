import type { Config } from '@netlify/functions';
import {
  allowed,
  canTransition,
  parseAdminAction,
  statusTimestamps,
  type Action,
  type OrderStatus,
} from '../lib/adminActions';
import { requireAdmin } from '../lib/auth';
import { env } from '../lib/env';
import { json, readJson } from '../lib/http';
import { serviceClient } from '../lib/supabase';

/**
 * /api/admin-action: כל שינוי ממערכת הניהול עובר כאן.
 * מאמת מנהל + הרשאה לפי תפקיד, מאמת קלט, כותב ל-DB עם service role ומתעד ב-audit_log.
 * שינוי במחירים / משלוח מפעיל build hook כדי שהאתר הציבורי יתעדכן.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const me = await requireAdmin(req);
  if (!me) return json({ error: 'unauthorized' }, 401);
  const a = parseAdminAction(await readJson<unknown>(req, 8_000));
  if ('error' in a) return json({ error: a.error }, 400);
  if (!allowed(me.role, a.action)) return json({ error: 'הפעולה הזו מותרת רק לבעלים' }, 403);

  const db = serviceClient();
  const audit = (
    entity: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
    note?: string,
  ) =>
    db.from('audit_log').insert({
      actor_id: me.id,
      actor_email: me.email,
      entity,
      entity_id: entityId,
      action,
      before: before ?? null,
      after: after ?? null,
      note: note ?? null,
    });

  try {
    const result = await apply(a);
    return json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('admin-action', a.action, e);
    return json({ error: e instanceof HttpError ? e.message : 'שגיאת שרת, נסו שוב' }, status);
  }

  async function apply(a: Action): Promise<Record<string, unknown>> {
    switch (a.action) {
      case 'order.status': {
        const { data: o } = await db
          .from('orders')
          .select('id, status, tracking_number')
          .eq('id', a.orderId)
          .maybeSingle();
        if (!o) throw new HttpError(404, 'ההזמנה לא נמצאה');
        const from = o.status as OrderStatus;
        if (from === a.status) return { order: o };
        if (!canTransition(from, a.status))
          throw new HttpError(409, 'אי אפשר לעבור לסטטוס הזה מהסטטוס הנוכחי');
        const patch: Record<string, unknown> = {
          status: a.status,
          ...statusTimestamps(a.status, new Date().toISOString()),
        };
        if (a.trackingNumber) patch.tracking_number = a.trackingNumber;
        // .eq('status', from): אם מישהו אחר שינה בינתיים, לא דורסים
        const { data, error } = await db
          .from('orders')
          .update(patch)
          .eq('id', a.orderId)
          .eq('status', from)
          .select('id, status, tracking_number, shipped_at, cancelled_at')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new HttpError(409, 'ההזמנה עודכנה בינתיים. רעננו ונסו שוב');
        await audit('order', a.orderId, 'status_change', { status: from }, patch);
        return { order: data };
      }
      case 'order.tracking': {
        const { data: o } = await db
          .from('orders')
          .select('tracking_number')
          .eq('id', a.orderId)
          .maybeSingle();
        if (!o) throw new HttpError(404, 'ההזמנה לא נמצאה');
        const { error } = await db
          .from('orders')
          .update({ tracking_number: a.trackingNumber })
          .eq('id', a.orderId);
        if (error) throw error;
        await audit('order', a.orderId, 'tracking', o, { tracking_number: a.trackingNumber });
        return {};
      }
      case 'order.note': {
        const { count } = await db
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('id', a.orderId);
        if (!count) throw new HttpError(404, 'ההזמנה לא נמצאה');
        const { error } = await audit('order', a.orderId, 'note', null, null, a.note);
        if (error) throw error;
        return {};
      }
      case 'abandoned.contacted': {
        const value = a.contacted ? new Date().toISOString() : null;
        const { data, error } = await db
          .from('abandoned_checkouts')
          .update({ contacted_at: value })
          .eq('id', a.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new HttpError(404, 'הרשומה לא נמצאה');
        await audit('abandoned', a.id, a.contacted ? 'contacted' : 'uncontacted', null, {
          contacted_at: value,
        });
        return {};
      }
      case 'product.update': {
        const { data: before } = await db
          .from('products')
          .select('name, description, price_ils, compare_at_price, stock, active, sort')
          .eq('id', a.id)
          .maybeSingle();
        if (!before) throw new HttpError(404, 'המוצר לא נמצא');
        const { error } = await db.from('products').update(a.patch).eq('id', a.id);
        if (error) throw error;
        await audit('product', a.id, 'update', before, a.patch);
        return { rebuild: await rebuildSite() };
      }
      case 'coupon.upsert': {
        const { id, ...c } = a.coupon;
        const { data: clash } = await db
          .from('coupons')
          .select('id')
          .ilike('code', c.code.replace(/[_%\\]/g, '\\$&'))
          .maybeSingle();
        if (clash && clash.id !== id) throw new HttpError(409, 'כבר קיים קופון עם הקוד הזה');
        if (id) {
          const { data: before } = await db.from('coupons').select('*').eq('id', id).maybeSingle();
          if (!before) throw new HttpError(404, 'הקופון לא נמצא');
          const { error } = await db.from('coupons').update(c).eq('id', id);
          if (error) throw error;
          await audit('coupon', id, 'update', before, c);
          return { id };
        }
        const { data, error } = await db.from('coupons').insert(c).select('id').single();
        if (error) throw error;
        await audit('coupon', data.id, 'create', null, c);
        return { id: data.id };
      }
      case 'coupon.delete': {
        const { data: before } = await db.from('coupons').select('*').eq('id', a.id).maybeSingle();
        if (!before) throw new HttpError(404, 'הקופון לא נמצא');
        // קופון שכבר שימש נשאר לתיעוד ומושבת; קופון שלא שימש נמחק
        if (before.used_count > 0) {
          await db.from('coupons').update({ active: false }).eq('id', a.id);
          await audit('coupon', a.id, 'deactivate', before, { active: false });
          return { deactivated: true };
        }
        const { error } = await db.from('coupons').delete().eq('id', a.id);
        if (error) throw error;
        await audit('coupon', a.id, 'delete', before, null);
        return {};
      }
      case 'settings.shipping':
      case 'settings.store': {
        const key = a.action === 'settings.shipping' ? 'shipping' : 'store';
        const { data: before } = await db
          .from('settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();
        const { error } = await db.from('settings').upsert({ key, value: a.value });
        if (error) throw error;
        await audit('settings', key, 'update', before?.value, a.value);
        return { rebuild: await rebuildSite() };
      }
    }
  }
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** בונה מחדש את האתר הציבורי (מחירים ומשלוח נקראים מה-DB בזמן build). */
async function rebuildSite(): Promise<'started' | 'not-configured' | 'failed'> {
  const hook = env('NETLIFY_BUILD_HOOK_URL');
  if (!hook) return 'not-configured';
  try {
    const res = await fetch(`${hook}?trigger_title=${encodeURIComponent('עדכון ממערכת הניהול')}`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok ? 'started' : 'failed';
  } catch {
    return 'failed';
  }
}

export const config: Config = { path: '/api/admin-action' };
