import type { Config } from '@netlify/functions';
import { requireAdmin } from '../lib/auth';
import { json, readJson } from '../lib/http';
import { serviceClient } from '../lib/supabase';

interface Body {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  remove?: boolean;
}

/** POST /api/push-subscribe: מנהל מחובר רושם (או מסיר) מכשיר לקבלת התראות. */
export default async (req: Request): Promise<Response> => {
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: 'unauthorized' }, 401);
  const b = await readJson<Body>(req, 4_000);
  if (!b?.endpoint || !/^https:\/\//.test(b.endpoint) || b.endpoint.length > 1000) {
    return json({ error: 'bad_request' }, 400);
  }
  const db = serviceClient();
  if (b.remove) {
    await db.from('push_subscriptions').delete().eq('endpoint', b.endpoint).eq('user_id', admin.id);
    return json({ ok: true });
  }
  if (!b.keys?.p256dh || !b.keys?.auth) return json({ error: 'bad_request' }, 400);
  const { error } = await db.from('push_subscriptions').upsert(
    {
      user_id: admin.id,
      endpoint: b.endpoint,
      p256dh: b.keys.p256dh.slice(0, 200),
      auth: b.keys.auth.slice(0, 100),
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    console.error('push-subscribe failed', error.message);
    return json({ error: 'server' }, 500);
  }
  return json({ ok: true });
};

export const config: Config = { path: '/api/push-subscribe', method: 'POST' };
