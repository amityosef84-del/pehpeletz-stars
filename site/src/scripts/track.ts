/**
 * מעקב first-party (SPEC §9). שומר מזהה מבקר קבוע ומזהה ביקור (30 דקות חוסר פעילות),
 * מקור הגעה (UTM, מזהי קליק, referrer, מכשיר) ואירועים. נשלח ב-sendBeacon ל-/api/track
 * בקבוצות, בלי לחסום את הדף. כל אירוע מקבל event_id שמשמש גם את הפיקסלים (דה-דופליקציה).
 */

// הפיקסלים חייבים להאזין לפני שנשלח ה-page_view הראשון, בכל עמוד ובכל סדר טעינה
import './pixels';

const ENDPOINT = '/api/track';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const FLUSH_DELAY_MS = 3000;

type Props = Record<string, string | number | boolean>;
interface QueuedEvent {
  id: string;
  name: string;
  props: Props;
  path: string;
  ts: number;
}
export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  referrer?: string;
  landing_path?: string;
  device?: string;
}

const memory: Record<string, string> = {};
function store(kind: 'local' | 'session') {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__pp';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
const local = store('local');
const get = (k: string) => (local ? local.getItem(k) : (memory[k] ?? null));
const set = (k: string, v: string) => {
  if (local) {
    try {
      local.setItem(k, v);
    } catch {
      memory[k] = v;
    }
  } else memory[k] = v;
};

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function device(): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua) || window.matchMedia('(max-width: 640px)').matches)
    return 'mobile';
  return 'desktop';
}

function readAttribution(): Attribution {
  const q = new URLSearchParams(location.search);
  const a: Attribution = {};
  for (const k of [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'fbclid',
    'gclid',
    'ttclid',
  ] as const) {
    const v = q.get(k);
    if (v) a[k] = v.slice(0, 300);
  }
  if (document.referrer) a.referrer = document.referrer;
  a.landing_path = location.pathname + location.search;
  a.device = device();
  return a;
}

/** מזהים: visitor קבוע, session חדש אחרי 30 דקות שקט או כשמגיעים מקמפיין חדש */
function ids(): { visitorId: string; sessionId: string; attribution: Attribution } {
  let visitorId = get('pp_vid');
  if (!visitorId) {
    visitorId = uuid();
    set('pp_vid', visitorId);
  }
  const now = Date.now();
  let sess: { id: string; last: number; a: Attribution } | null;
  try {
    sess = JSON.parse(get('pp_sess') ?? 'null');
  } catch {
    sess = null;
  }
  const incoming = new URLSearchParams(location.search).get('utm_campaign');
  const expired = !sess || now - sess.last > SESSION_TIMEOUT_MS;
  const newCampaign = !!incoming && sess?.a?.utm_campaign !== incoming;
  if (!sess || expired || newCampaign) sess = { id: uuid(), last: now, a: readAttribution() };
  sess.last = now;
  set('pp_sess', JSON.stringify(sess));
  return { visitorId, sessionId: sess.id, attribution: sess.a };
}

const state = ids();
export const visitorId = state.visitorId;
export const sessionId = state.sessionId;
export const attribution = state.attribution;

export function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const queue: QueuedEvent[] = [];
let timer = 0;

function flush() {
  clearTimeout(timer);
  timer = 0;
  if (!queue.length) return;
  const events = queue.splice(0, 50);
  const body = JSON.stringify({
    visitor_id: visitorId,
    session_id: sessionId,
    session: { ...attribution, fbp: readCookie('_fbp') ?? undefined },
    events,
  });
  let sent: boolean;
  try {
    sent =
      navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' })) ?? false;
  } catch {
    sent = false;
  }
  if (!sent) {
    fetch(ENDPOINT, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'content-type': 'application/json' },
    }).catch(() => {});
  }
  if (queue.length) flush();
}

/** רושם אירוע. מחזיר את ה-event_id (לשימוש הפיקסלים). */
export function track(name: string, props: Props = {}): string {
  const id = uuid();
  queue.push({ id, name, props, path: location.pathname + location.search, ts: Date.now() });
  if (!timer) timer = window.setTimeout(flush, FLUSH_DELAY_MS);
  window.dispatchEvent(new CustomEvent('pp:track', { detail: { id, name, props } }));
  // מרענן את חלון הביקור
  try {
    const s = JSON.parse(get('pp_sess') ?? 'null');
    if (s) set('pp_sess', JSON.stringify({ ...s, last: Date.now() }));
  } catch {
    /* מתעלמים */
  }
  return id;
}

// ביציאה מהעמוד: שולחים ב-beacon וגם שומרים עותק מקומי שיישלח שוב בעמוד הבא.
// השרת מתעלם מ-event_id שכבר נקלט, כך שאין כפילויות.
const RETRY_KEY = 'pp_q';
function persistAndFlush() {
  if (queue.length) {
    try {
      const prev = JSON.parse(sessionStorage.getItem(RETRY_KEY) ?? '[]') as QueuedEvent[];
      sessionStorage.setItem(RETRY_KEY, JSON.stringify([...prev, ...queue].slice(-50)));
    } catch {
      /* מתעלמים */
    }
  }
  flush();
}
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistAndFlush();
});
addEventListener('pagehide', persistAndFlush);
try {
  const retry = JSON.parse(sessionStorage.getItem(RETRY_KEY) ?? '[]') as QueuedEvent[];
  sessionStorage.removeItem(RETRY_KEY);
  if (retry.length) {
    queue.push(...retry.filter((e) => Date.now() - e.ts < 60 * 60 * 1000));
    timer = window.setTimeout(flush, FLUSH_DELAY_MS);
  }
} catch {
  /* מתעלמים */
}

// ---------- אירועים אוטומטיים ----------
track('page_view', { title: document.title.slice(0, 80) });

// עומק גלילה
const marks = [25, 50, 75, 100];
const hit = new Set<number>();
let ticking = false;
addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max <= 0) return;
      const pct = (scrollY / max) * 100;
      for (const m of marks) {
        if (pct >= m - 1 && !hit.has(m)) {
          hit.add(m);
          track(`scroll_${m}`);
        }
      }
    });
  },
  { passive: true },
);

// לחיצות: CTA, בחירת חבילה, וואטסאפ
document.addEventListener(
  'click',
  (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-cta],[data-whatsapp]');
    if (!el) return;
    if (el.dataset.whatsapp) {
      track('whatsapp_click', { location: el.dataset.whatsapp });
      return;
    }
    const loc = el.dataset.cta ?? '';
    track('cta_click', { location: loc });
    const pkg = loc.match(/^pricing-(kit-\d)$/)?.[1];
    if (pkg) track('select_package', { package: pkg, location: 'pricing' });
  },
  { capture: true },
);

// פתיחת שאלה
document.querySelectorAll<HTMLDetailsElement>('details[data-faq]').forEach((d) => {
  d.addEventListener('toggle', () => {
    if (d.open)
      track('faq_open', {
        index: Number(d.dataset.faq),
        question: d.querySelector('summary')?.textContent?.trim().slice(0, 80) ?? '',
      });
  });
});

// צפייה בחבילות (פעם אחת לעמוד)
const pricing = document.getElementById('pricing');
if (pricing && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((x) => x.isIntersecting)) {
        track('view_pricing');
        io.disconnect();
      }
    },
    { threshold: 0.35 },
  );
  io.observe(pricing);
}

// וידאו (כשיתווסף)
document
  .querySelectorAll('video')
  .forEach((v) =>
    v.addEventListener(
      'play',
      () => track('video_play', { src: (v.currentSrc || '').split('/').pop() ?? '' }),
      { once: true },
    ),
  );
