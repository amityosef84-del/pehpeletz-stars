import { supabase } from './supabase';

/** רישום Service Worker (גם להתקנה כאפליקציה) */
export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
  } catch {
    return null;
  }
}

const b64ToUint8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/admin/');
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  const reg = await registerSw();
  if (!reg || !('PushManager' in window)) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const cfg = (await fetch('/api/push-config').then((r) => r.json())) as {
    publicKey: string | null;
  };
  if (!cfg.publicKey) throw new Error('ההתראות עוד לא הוגדרו בשרת');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(cfg.publicKey),
    }));
  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error('לא הצלחנו לרשום את המכשיר');
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/admin/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ endpoint: sub.endpoint, remove: true }),
    });
    await sub.unsubscribe();
  }
  return 'off';
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const res = await fetch('/api/push-test', { method: 'POST', headers: await authHeader() });
  if (!res.ok) throw new Error('שליחת התראת הבדיקה נכשלה');
  return res.json();
}
