/* THE AD offline worker (10/21): the page, the core, the icons and the house fonts are cached on install, so it opens
   on set with no signal. Bump BUILD when anything here changes (and the core.js ?v= in the page and below). */
const BUILD = 'ad-20261021-8fc5895f';
const FILES = ['./', './index.html', './core.js?v=8fc5895f', './manifest.webmanifest', './icon-192.png', './icon-512.png', './art/icon.webp',
  '../assets/fonts/mochiy-pop-one-400.woff2', '../assets/fonts/silkscreen-400.woff2', '../assets/fonts/silkscreen-700.woff2',
  '../assets/fonts/inter-400.woff2', '../assets/fonts/inter-500.woff2', '../assets/fonts/inter-600.woff2', '../assets/fonts/inter-700.woff2', '../assets/fonts/inter-800.woff2'];
// one file that will not load never blocks the rest from going offline
self.addEventListener('install', e => { e.waitUntil(caches.open(BUILD).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ad-') && k !== BUILD).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // the page: network first so a new build lands, the cache when there is no signal
  if (u.pathname.endsWith('/ad/') || u.pathname.endsWith('/ad/index.html')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(BUILD).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok && (u.pathname.includes('/ad/') || u.pathname.includes('/assets/fonts/'))) { const c = res.clone(); caches.open(BUILD).then(k => k.put(e.request, c)); } return res; })));
});
