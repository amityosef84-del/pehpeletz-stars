import type { Config } from '@netlify/functions';
import { requireAdmin } from '../lib/auth';
import { json } from '../lib/http';
import { pushConfigured, sendPush } from '../lib/push';

/** POST /api/push-test: התראת בדיקה למכשירים של המנהל המחובר. */
export default async (req: Request): Promise<Response> => {
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: 'unauthorized' }, 401);
  if (!pushConfigured()) return json({ error: 'push_not_configured' }, 503);
  const r = await sendPush(
    {
      title: '💰 הזמנה #1234 · 100\u00A0₪',
      body: 'בדיקה: ככה תיראה התראה על רכישה, גם כשהאפליקציה סגורה',
      url: '/admin/',
      tag: 'test',
      sound: true,
    },
    admin.id,
  );
  return json(r);
};

export const config: Config = { path: '/api/push-test', method: 'POST' };
