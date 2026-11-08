import * as webpush from 'web-push';
import { env } from './env';
import { serviceClient } from './supabase';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  sound?: boolean;
}

export function pushConfigured(): boolean {
  return Boolean(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY'));
}

function setup() {
  webpush.setVapidDetails(
    env('VAPID_SUBJECT') ?? env('SITE_URL') ?? env('URL') ?? 'https://pehpeletz-stars.netlify.app',
    env('VAPID_PUBLIC_KEY')!,
    env('VAPID_PRIVATE_KEY')!,
  );
}

/** שולח התראה לכל המנויים (או למשתמש אחד). מנויים שפג תוקפם נמחקים. */
export async function sendPush(
  payload: PushPayload,
  userId?: string,
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  setup();
  const db = serviceClient();
  let q = db.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (userId) q = q.eq('user_id', userId);
  const { data: subs, error } = await q;
  if (error || !subs) {
    console.error('push: load subscriptions failed', error?.message);
    return { sent: 0, removed: 0 };
  }
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: 'high' },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
        else console.error('push: send failed', code, (err as Error).message);
      }
    }),
  );
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);
  if (sent) {
    await db
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in(
        'id',
        subs.filter((s) => !dead.includes(s.id)).map((s) => s.id),
      );
  }
  return { sent, removed: dead.length };
}

export const ils = (n: number) =>
  `${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })}\u00A0₪`;
