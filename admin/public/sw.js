/* Service Worker של מערכת הניהול: התראות Push והתקנה כאפליקציה.
   לא שומר נתונים עסקיים במטמון — רק את מעטפת האפליקציה לפתיחה מהירה. */
const SHELL = 'pp-admin-shell-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/admin/', '/admin/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ניווט: רשת קודם, ואם אין חיבור — המעטפת מהמטמון
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode === 'navigate' && new URL(req.url).pathname.startsWith('/admin')) {
    e.respondWith(fetch(req).catch(() => caches.match('/admin/')));
  }
});

self.addEventListener('push', (e) => {
  let data;
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'פהפלצת', body: e.data ? e.data.text() : '' };
  }
  const title = data.title || '💰 הזמנה חדשה';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'order',
      renotify: true,
      silent: false,
      requireInteraction: data.tag !== 'test',
      timestamp: Date.now(),
      dir: 'rtl',
      lang: 'he',
      icon: '/admin/icons/icon-192.png',
      badge: '/admin/icons/icon-192.png',
      vibrate: [80, 40, 80, 40, 200],
      data: { url: data.url || '/admin/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('/admin') && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
