// نوتة بلال: بيخلي التطبيق يفتح لو النت ضعيف، وبيجيب آخر نسخة لما النت يبقى موجود
const CACHE = 'nota-v8';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'app.js', 'company.js', 'comps.js', 'config.js', 'db.js', 'goals.js', 'insights.js', 'misc.js', 'money.js', 'more.js', 'projects.js', 'review.js', 'team.js', 'today.js', 'ui.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // مكتبة Supabase والخطوط: من الموبايل على طول، وبتتحدث في الخلفية
  if (CDN.includes(u.hostname)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (u.origin !== location.origin) return;   // بيانات Supabase دايمًا من النت
  // ملفات التطبيق: بتفتح من الموبايل على طول (حتى من غير نت)، وبتتحدث في الخلفية للمرة الجاية
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit || c.match('index.html'));
    return hit || net;
  })));
});
// الإشعارات: بيعرض اللي بيبعته Cloudflare Worker
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'نوتة بلال', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './#/today' }, lang: 'ar', dir: 'rtl' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data.url || './#/today', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
