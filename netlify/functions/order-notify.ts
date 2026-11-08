import type { Config } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env';
import { json, readJson } from '../lib/http';
import { ils, sendPush } from '../lib/push';

/**
 * POST /api/order-notify: נקרא מה-DB (trigger + pg_net) כשהזמנה הופכת ל-paid.
 * מאומת בסוד משותף (ORDER_WEBHOOK_SECRET) ושולח Push לכל המנהלים.
 */
interface Body {
  order_id?: string;
  order_number?: number;
  total?: number;
  items?: string;
}

function secretOk(given: string | null): boolean {
  const expected = env('ORDER_WEBHOOK_SECRET');
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req: Request): Promise<Response> => {
  if (!secretOk(req.headers.get('x-webhook-secret'))) return json({ error: 'unauthorized' }, 401);
  const b = await readJson<Body>(req, 4_000);
  if (!b?.order_number) return json({ error: 'bad_request' }, 400);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const amount = b.total !== undefined && b.total !== null ? ils(Number(b.total)) : '';
  const r = await sendPush({
    // מספר ההזמנה והסכום בכותרת: נראים גם בהתראה מקופלת על מסך הנעילה
    title: `💰 הזמנה #${b.order_number}${amount ? ` · ${amount}` : ''}`,
    body: b.items ? `${b.items} · לחצו לפרטי ההזמנה` : 'לחצו לפרטי ההזמנה',
    url: b.order_id && UUID.test(b.order_id) ? `/admin/#orders/${b.order_id}` : '/admin/#orders',
    tag: `order-${b.order_number}`,
    sound: true,
  });
  return json(r);
};

export const config: Config = { path: '/api/order-notify', method: 'POST' };
