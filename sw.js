// نوتة بلال: بيخلي التطبيق يفتح لو النت ضعيف، وبيجيب آخر نسخة لما النت يبقى موجود
const CACHE = 'nota-v2';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'app.js', 'company.js', 'comps.js', 'config.js', 'db.js', 'goals.js', 'misc.js', 'money.js', 'projects.js', 'team.js', 'today.js', 'ui.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // بيانات Supabase دايمًا من النت
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
// الإشعارات (المرحلة الجاية): بيعرض اللي بيبعته Cloudflare Worker
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'نوتة بلال', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './#/today' }, lang: 'ar', dir: 'rtl' }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data.url)); });
