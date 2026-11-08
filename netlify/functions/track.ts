import type { Config, Context } from '@netlify/functions';
import { env } from '../lib/env';
import { anonKey, empty, isAllowedOrigin, isBot, json, readJson } from '../lib/http';
import { serviceClient } from '../lib/supabase';
import { cleanPayload, type RawPayload } from '../lib/tracking';

/**
 * POST /api/track: קליטת אירועי first-party מהדפדפן (navigator.sendBeacon).
 * לא חוסם את הדף: תמיד מחזיר מהר, גם כשה-DB לא מוגדר.
 */
export default async (req: Request, context: Context): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return empty(204, origin);
  if (!isAllowedOrigin(req)) return json({ error: 'origin' }, 403);

  const raw = await readJson<RawPayload>(req, 32_000);
  if (!raw) return json({ error: 'bad_request' }, 400, origin);

  const ua = req.headers.get('user-agent');
  const clean = cleanPayload(raw, {
    country: context.geo?.country?.code ?? null,
    isBot: isBot(ua),
    siteHost: new URL(req.url).host,
  });
  if (!clean) return json({ error: 'bad_request' }, 400, origin);
  if (!clean.events.length) return empty(204, origin);

  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return empty(202, origin);

  const db = serviceClient();
  const { data: allowed, error: rlError } = await db.rpc('rate_limit_hit', {
    p_key: anonKey(context.ip, 'track'),
    p_window_seconds: 60,
    p_max: 120,
  });
  if (rlError) console.error('track: rate limit', rlError.message);
  if (allowed === false) return json({ error: 'rate_limited' }, 429, origin);

  const { error } = await db.rpc('ingest_events', {
    p_session: clean.session,
    p_events: clean.events,
  });
  if (error) {
    console.error('track: ingest failed', error.message);
    return json({ error: 'server' }, 500, origin);
  }
  return empty(204, origin);
};

export const config: Config = { path: '/api/track', method: ['POST', 'OPTIONS'] };
