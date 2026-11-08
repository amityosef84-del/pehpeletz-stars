import { createHash } from 'node:crypto';
import { env } from './env';

/** תשובת JSON עם כותרות CORS לפי ה-origin המורשה */
export function json(body: unknown, status = 200, origin?: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...cors(origin),
    },
  });
}

export function empty(status = 204, origin?: string | null): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', ...cors(origin) } });
}

/** origins מורשים: ALLOWED_ORIGINS, SITE_URL, או כתובות ה-deploy של Netlify (URL/DEPLOY_PRIME_URL) */
export function allowedOrigins(): string[] {
  const list = [
    env('ALLOWED_ORIGINS'),
    env('SITE_URL'),
    env('URL'),
    env('DEPLOY_PRIME_URL'),
    env('DEPLOY_URL'),
  ]
    .filter(Boolean)
    .flatMap((v) => v!.split(','))
    .map((v) => v.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set(list)];
}

/** בקשה מאותו אתר: Origin חסר (sendBeacon ישן) או ברשימה המורשית, או זהה ל-host של הבקשה */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = new URL(req.url).origin;
  return origin === host || allowedOrigins().includes(origin);
}

function cors(origin?: string | null): Record<string, string> {
  if (!origin) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

/** מזהה לא הפיך ל-rate limit: hash של IP + יום + מלח. ה-IP עצמו לא נשמר. */
export function anonKey(ip: string | undefined, scope: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const salt = env('RATE_LIMIT_SALT') ?? 'pehpeletz';
  return `${scope}:${createHash('sha256')
    .update(`${salt}|${day}|${ip ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32)}`;
}

const BOT_RE =
  /bot|crawler|spider|crawling|headless|lighthouse|pagespeed|preview|facebookexternalhit|slurp|bingpreview|python-requests|curl|wget|httpclient|axios|node-fetch/i;

export function isBot(ua: string | null): boolean {
  return !ua || BOT_RE.test(ua);
}

export async function readJson<T>(req: Request, maxBytes: number): Promise<T | null> {
  const text = await req.text();
  if (!text || text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
