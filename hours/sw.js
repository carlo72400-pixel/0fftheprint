/* MY HOURS offline worker (11/5): the page, its core, icons and manifest are cached on install so the clock opens with no
   signal. Bump BUILD (and core.js?v= in index.html) when the page changes. Only hours-* caches are ever dropped here, so the
   other pages' offline copies on this domain (the Kit, the SNW planner, the Crypt, the AD) live through an update.
   Pages and core go network first so a new build lands, then fall back to the cache. The Google fonts are cached the
   first time they load. The punches themselves are in the phone's storage, never in a cache. */
const BUILD = 'hours-20261105a';
const FILES = ['./', './index.html', './core.js?v=2', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(BUILD).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hours-') && k !== BUILD).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (!u.pathname.startsWith('/hours/')) return;
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(BUILD).then(k => k.put(r.mode === 'navigate' ? './' : r, c)); }
      return res;
    }).catch(() => caches.match(r).then(hit => hit || (r.mode === 'navigate' ? caches.match('./') : caches.match(r, { ignoreSearch: true })))));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(BUILD).then(k => k.put(r, c)); }
      return res;
    })));
  }
});
