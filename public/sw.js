/* منصة إتقان: عامل الخدمة
 * - يجعل الموقع قابلاً للتثبيت كتطبيق، ويفتح الواجهة بسرعة (ملفات الموقع ذات الأسماء المشفّرة تُحفظ).
 * - الصفحة نفسها تُجلب من الشبكة أولاً (حتى تصل التحديثات فوراً)، والنسخة المحفوظة عند انقطاع الإنترنت فقط.
 * - لا يحفظ أي بيانات من الخادم (Supabase).
 * - يعرض إشعارات الجوال (Web Push) ويفتح الصفحة المرتبطة عند الضغط عليها.
 */
const CACHE = 'itqan-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ملفات الموقع (أسماؤها تتغير مع كل إصدار): من الذاكرة أولاً
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // الصفحات: الشبكة أولاً، والنسخة المحفوظة عند انقطاع الإنترنت
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put('/index.html', res.clone());
        return res;
      } catch {
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data && event.data.text() }; }
  const title = data.title || 'منصة إتقان';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || undefined,
    dir: 'auto',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ('navigate' in w) return w.navigate(target);
        return;
      }
    }
    return self.clients.openWindow(target);
  })());
});
