import { createHash } from 'node:crypto';
import { env } from './env';

/**
 * שליחת אירועי המרה מהשרת לפלטפורמות הפרסום:
 *  - Meta Conversions API
 *  - GA4 Measurement Protocol
 *  - TikTok Events API
 * כל פלטפורמה פעילה רק אם משתני הסביבה שלה מוגדרים. נשלח רק בהסכמה לעוגיות שיווקיות.
 * event_id זהה לזה שהדפדפן שולח לפיקסל, כדי שהפלטפורמה תוריד כפילויות.
 */

export interface ConversionItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface PurchaseEvent {
  eventId: string;
  orderNumber: string;
  value: number;
  currency: string;
  items: ConversionItem[];
  email?: string | null;
  phone?: string | null;
  visitorId?: string | null;
  sourceUrl: string;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbclid?: string | null;
  gaClientId?: string | null;
  ttclid?: string | null;
  eventTime?: Date;
  /** הסכמה לעוגיות שיווקיות. בלי הסכמה לא נשלח כלום. */
  consent: boolean;
}

export type Platform = 'meta' | 'ga4' | 'tiktok';
export interface SendResult {
  platform: Platform;
  ok: boolean;
  status?: number;
  skipped?: string;
}

type Fetch = typeof fetch;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const normEmail = (e: string) => e.trim().toLowerCase();
/** טלפון ישראלי בפורמט E.164 בלי "+" (כפי ש-Meta ו-TikTok מצפים לפני hash) */
export function normPhone(p: string): string | null {
  const d = p.replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) return `972${d.slice(1)}`;
  if (/^9725\d{8}$/.test(d)) return d;
  return null;
}

/** fbc לפי הפורמט של Meta: fb.1.<timestamp>.<fbclid> */
export const fbcFromClid = (fbclid: string, t: Date) => `fb.1.${t.getTime()}.${fbclid}`;

/** client_id של GA מתוך עוגיית _ga (GA1.1.123.456 → 123.456) */
export function gaClientIdFromCookie(cookie: string | null | undefined): string | null {
  const m = cookie?.match(/(?:^|;\s*)_ga=GA\d\.\d\.(\d+\.\d+)/);
  return m?.[1] ?? null;
}

export function metaPayload(e: PurchaseEvent) {
  const t = e.eventTime ?? new Date();
  const user: Record<string, unknown> = {};
  if (e.email) user.em = [sha256(normEmail(e.email))];
  const ph = e.phone ? normPhone(e.phone) : null;
  if (ph) user.ph = [sha256(ph)];
  if (e.visitorId) user.external_id = [sha256(e.visitorId)];
  if (e.fbp) user.fbp = e.fbp;
  if (e.fbclid) user.fbc = fbcFromClid(e.fbclid, t);
  if (e.clientIp) user.client_ip_address = e.clientIp;
  if (e.userAgent) user.client_user_agent = e.userAgent;
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(t.getTime() / 1000),
        event_id: e.eventId,
        action_source: 'website',
        event_source_url: e.sourceUrl,
        user_data: user,
        custom_data: {
          currency: e.currency,
          value: e.value,
          order_id: e.orderNumber,
          content_type: 'product',
          content_ids: e.items.map((i) => i.id),
          num_items: e.items.reduce((n, i) => n + i.quantity, 0),
        },
      },
    ],
  };
  const test = env('META_TEST_EVENT_CODE');
  if (test) body.test_event_code = test;
  return body;
}

export function ga4Payload(e: PurchaseEvent) {
  return {
    client_id: e.gaClientId ?? e.visitorId ?? e.eventId,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: e.orderNumber,
          value: e.value,
          currency: e.currency,
          items: e.items.map((i) => ({
            item_id: i.id,
            item_name: i.name,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
    ],
  };
}

export function tiktokPayload(e: PurchaseEvent, pixelCode: string) {
  const t = e.eventTime ?? new Date();
  const user: Record<string, unknown> = {};
  if (e.email) user.email = sha256(normEmail(e.email));
  const ph = e.phone ? normPhone(e.phone) : null;
  if (ph) user.phone = sha256(`+${ph}`);
  if (e.visitorId) user.external_id = sha256(e.visitorId);
  if (e.ttclid) user.ttclid = e.ttclid;
  if (e.clientIp) user.ip = e.clientIp;
  if (e.userAgent) user.user_agent = e.userAgent;
  return {
    event_source: 'web',
    event_source_id: pixelCode,
    data: [
      {
        event: 'CompletePayment',
        event_time: Math.floor(t.getTime() / 1000),
        event_id: e.eventId,
        user,
        page: { url: e.sourceUrl },
        properties: {
          currency: e.currency,
          value: e.value,
          order_id: e.orderNumber,
          content_type: 'product',
          contents: e.items.map((i) => ({
            content_id: i.id,
            content_name: i.name,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
    ],
  };
}

async function post(f: Fetch, url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return res.status;
}

/** שולח Purchase לכל הפלטפורמות המוגדרות. לא זורק: מחזיר תוצאה לכל פלטפורמה. */
export async function sendPurchase(e: PurchaseEvent, f: Fetch = fetch): Promise<SendResult[]> {
  if (!e.consent) {
    return (['meta', 'ga4', 'tiktok'] as const).map((platform) => ({
      platform,
      ok: false,
      skipped: 'no_consent',
    }));
  }
  const tasks: Promise<SendResult>[] = [];

  const metaPixel = env('PUBLIC_META_PIXEL_ID');
  const metaToken = env('META_CAPI_TOKEN');
  if (metaPixel && metaToken) {
    const v = env('META_GRAPH_VERSION') ?? 'v21.0';
    const url = `https://graph.facebook.com/${v}/${metaPixel}/events?access_token=${encodeURIComponent(metaToken)}`;
    tasks.push(wrap('meta', () => post(f, url, metaPayload(e))));
  } else tasks.push(Promise.resolve({ platform: 'meta', ok: false, skipped: 'not_configured' }));

  const gaId = env('PUBLIC_GA4_ID');
  const gaSecret = env('GA4_API_SECRET');
  if (gaId && gaSecret) {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(gaId)}&api_secret=${encodeURIComponent(gaSecret)}`;
    tasks.push(wrap('ga4', () => post(f, url, ga4Payload(e))));
  } else tasks.push(Promise.resolve({ platform: 'ga4', ok: false, skipped: 'not_configured' }));

  const ttPixel = env('PUBLIC_TIKTOK_PIXEL_ID');
  const ttToken = env('TIKTOK_EVENTS_TOKEN');
  if (ttPixel && ttToken) {
    const url = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
    tasks.push(
      wrap('tiktok', () => post(f, url, tiktokPayload(e, ttPixel), { 'Access-Token': ttToken })),
    );
  } else tasks.push(Promise.resolve({ platform: 'tiktok', ok: false, skipped: 'not_configured' }));

  return Promise.all(tasks);
}

async function wrap(platform: Platform, fn: () => Promise<number>): Promise<SendResult> {
  try {
    const status = await fn();
    if (status >= 300) console.error(`conversions: ${platform} responded ${status}`);
    return { platform, ok: status < 300, status };
  } catch (err) {
    console.error(`conversions: ${platform} failed`, (err as Error).message);
    return { platform, ok: false };
  }
}
