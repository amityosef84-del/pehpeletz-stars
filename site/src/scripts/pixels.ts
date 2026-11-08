/**
 * פיקסלים שיווקיים (Meta, GA4, TikTok) — נטענים רק אחרי הסכמה בבאנר העוגיות.
 * מאזינים לאירועי pp:track ומתרגמים אותם לאירועים הסטנדרטיים של כל פלטפורמה,
 * עם אותו event_id שנשמר אצלנו (דה-דופליקציה מול השליחה מהשרת).
 */

const META = import.meta.env.PUBLIC_META_PIXEL_ID as string | undefined;
const GA4 = import.meta.env.PUBLIC_GA4_ID as string | undefined;
const TIKTOK = import.meta.env.PUBLIC_TIKTOK_PIXEL_ID as string | undefined;
export const pixelsConfigured = Boolean(META || GA4 || TIKTOK);

const KEY = 'pp_consent';
type Consent = 'granted' | 'denied';

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(v: Consent) {
  try {
    localStorage.setItem(KEY, v);
    localStorage.setItem(`${KEY}_at`, new Date().toISOString());
  } catch {
    /* מתעלמים */
  }
  window.dispatchEvent(new CustomEvent('pp:consent', { detail: v }));
}

interface TrackDetail {
  id: string;
  name: string;
  props: Record<string, string | number | boolean>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ttq?: any;
  }
}

function loadScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function initMeta(id: string) {
  if (window.fbq) return;
  const q: any = function (...args: unknown[]) {
    if (q.callMethod) q.callMethod(...args);
    else q.queue.push(args);
  };
  q.push = q;
  q.loaded = true;
  q.version = '2.0';
  q.queue = [];
  window.fbq = window._fbq = q;
  loadScript('https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', id);
}

function initGa(id: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    // gtag מצפה לאובייקט arguments
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
    void args;
  };
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  window.gtag('js', new Date());
  window.gtag('consent', 'default', {
    ad_storage: 'granted',
    analytics_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  });
  window.gtag('config', id, { send_page_view: false });
}

function initTikTok(id: string) {
  if (window.ttq) return;
  const methods = [
    'page',
    'track',
    'identify',
    'instances',
    'debug',
    'on',
    'off',
    'once',
    'ready',
    'alias',
    'group',
    'enableCookie',
    'disableCookie',
  ];
  const ttq: any = [];
  ttq.methods = methods;
  ttq.setAndDefer = (t: any, e: string) => {
    t[e] = (...args: unknown[]) => t.push([e, ...args]);
  };
  for (const m of methods) ttq.setAndDefer(ttq, m);
  window.ttq = ttq;
  loadScript(
    `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`,
  );
}

const META_MAP: Record<string, string> = {
  page_view: 'PageView',
  view_pricing: 'ViewContent',
  select_package: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
};
const GA_MAP: Record<string, string> = {
  page_view: 'page_view',
  view_pricing: 'view_item_list',
  select_package: 'add_to_cart',
  begin_checkout: 'begin_checkout',
  add_payment_info: 'add_payment_info',
  purchase: 'purchase',
};
const TT_MAP: Record<string, string> = {
  view_pricing: 'ViewContent',
  select_package: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'CompletePayment',
};

function commerce(p: TrackDetail['props']) {
  const value = typeof p.value === 'number' ? p.value : undefined;
  return {
    currency: 'ILS',
    ...(value !== undefined ? { value } : {}),
    ...(p.package ? { content_ids: [String(p.package)] } : {}),
  };
}

function forward({ id, name, props }: TrackDetail) {
  if (META && window.fbq && META_MAP[name])
    window.fbq('track', META_MAP[name], commerce(props), { eventID: id });
  if (GA4 && window.gtag && GA_MAP[name]) {
    const p: Record<string, unknown> = { event_id: id };
    if (name !== 'page_view')
      Object.assign(p, {
        currency: 'ILS',
        value: props.value,
        items: props.package ? [{ item_id: props.package }] : undefined,
      });
    if (name === 'purchase') p.transaction_id = props.order;
    window.gtag('event', GA_MAP[name], p);
  }
  if (TIKTOK && window.ttq) {
    if (name === 'page_view') window.ttq.page();
    else if (TT_MAP[name])
      window.ttq.track(
        TT_MAP[name],
        { ...commerce(props), content_type: 'product' },
        { event_id: id },
      );
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// אירועים שקרו בעמוד לפני ההסכמה נשמרים בזיכרון ומשוחזרים אחריה (רק בעמוד הנוכחי)
const pending: TrackDetail[] = [];
let active = false;

function activate() {
  if (active || !pixelsConfigured) return;
  active = true;
  if (META) initMeta(META);
  if (GA4) initGa(GA4);
  if (TIKTOK) initTikTok(TIKTOK);
  pending.splice(0).forEach(forward);
}

if (pixelsConfigured) {
  window.addEventListener('pp:track', (e) => {
    const d = (e as CustomEvent<TrackDetail>).detail;
    if (active) forward(d);
    else if (pending.length < 30) pending.push(d);
  });
  window.addEventListener('pp:consent', (e) => {
    if ((e as CustomEvent<Consent>).detail === 'granted') activate();
  });
  if (getConsent() === 'granted') activate();
}
