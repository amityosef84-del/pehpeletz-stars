/**
 * ולידציה וניקוי של אירועי מעקב שמגיעים מהדפדפן. טהור (בלי I/O) כדי שיהיה קל לבדוק.
 */

export const EVENT_NAMES = [
  'page_view',
  'scroll_25',
  'scroll_50',
  'scroll_75',
  'scroll_100',
  'cta_click',
  'view_pricing',
  'select_package',
  'begin_checkout',
  'checkout_field_filled',
  'add_payment_info',
  'purchase',
  'purchase_failed',
  'coupon_applied',
  'faq_open',
  'whatsapp_click',
  'video_play',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** אירועים שהדפדפן לא רשאי לשלוח: רכישה נרשמת רק בשרת אחרי אימות תשלום */
const SERVER_ONLY = new Set<string>(['purchase']);

export const MAX_EVENTS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RawPayload {
  visitor_id?: unknown;
  session_id?: unknown;
  session?: Record<string, unknown>;
  events?: unknown;
}

export interface CleanSession {
  id: string;
  visitor_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  device: string | null;
  landing_path: string | null;
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
  fbp: string | null;
  country: string | null;
  is_bot: boolean;
}

export interface CleanEvent {
  id: string;
  name: EventName;
  props: Record<string, string | number | boolean>;
  path: string | null;
  ts: string;
}

const str = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

function cleanPath(v: unknown): string | null {
  const s = str(v, 300);
  if (!s || !s.startsWith('/')) return null;
  return s.split('#')[0] ?? null;
}

/** referrer: רק דומיין חיצוני, בלי נתיב ופרמטרים (פרטיות) */
function cleanReferrer(v: unknown, siteHost?: string): string | null {
  const s = str(v, 500);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (siteHost && u.host === siteHost) return null;
    return u.host;
  } catch {
    return null;
  }
}

function cleanProps(v: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v).slice(0, 15)) {
    if (!/^[a-z0-9_]{1,40}$/i.test(k)) continue;
    if (typeof val === 'string') out[k] = val.slice(0, 120);
    else if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    else if (typeof val === 'boolean') out[k] = val;
  }
  return out;
}

export function cleanPayload(
  raw: RawPayload,
  ctx: { country?: string | null; isBot: boolean; siteHost?: string; now?: Date },
): { session: CleanSession; events: CleanEvent[] } | null {
  if (!raw || !isUuid(raw.visitor_id) || !isUuid(raw.session_id) || !Array.isArray(raw.events))
    return null;
  const s = raw.session ?? {};
  const now = ctx.now ?? new Date();
  const device = str(s.device, 20);
  const session: CleanSession = {
    id: raw.session_id,
    visitor_id: raw.visitor_id,
    utm_source: str(s.utm_source, 100),
    utm_medium: str(s.utm_medium, 100),
    utm_campaign: str(s.utm_campaign, 150),
    utm_content: str(s.utm_content, 150),
    utm_term: str(s.utm_term, 150),
    referrer: cleanReferrer(s.referrer, ctx.siteHost),
    device: device && ['mobile', 'tablet', 'desktop'].includes(device) ? device : null,
    landing_path: cleanPath(s.landing_path),
    fbclid: str(s.fbclid, 300),
    gclid: str(s.gclid, 300),
    ttclid: str(s.ttclid, 300),
    fbp: str(s.fbp, 100),
    country: str(ctx.country, 2),
    is_bot: ctx.isBot,
  };

  const events: CleanEvent[] = [];
  for (const e of raw.events.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== 'object') continue;
    const ev = e as Record<string, unknown>;
    const name = ev.name;
    if (typeof name !== 'string' || !(EVENT_NAMES as readonly string[]).includes(name)) continue;
    if (SERVER_ONLY.has(name)) continue;
    if (!isUuid(ev.id)) continue;
    const ts = typeof ev.ts === 'number' && Number.isFinite(ev.ts) ? new Date(ev.ts) : now;
    events.push({
      id: ev.id,
      name: name as EventName,
      props: cleanProps(ev.props),
      path: cleanPath(ev.path),
      ts: (Math.abs(ts.getTime() - now.getTime()) > 3600_000 ? now : ts).toISOString(),
    });
  }
  return { session, events };
}
