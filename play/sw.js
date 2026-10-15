/* GET THE SHOT offline worker (10/15): the page, the engine, every sprite, room and UI piece cached on install so the
   game plays with no signal. Bump BUILD when anything changes; old caches go on activate. */
const BUILD = 'gts-20261015c';
const OCS = ['rin', 'lena', 'nyx', 'kuro', 'mars', 'cinder', 'bala', 'putty'], ROOMS = ['pit', 'booth', 'lot', 'dark', 'roof', 'lounge'];
const FILES = ['./', './index.html', './game.js?v=20261015b', './manifest.webmanifest', './icon-192.png', './icon-512.png', './art/meta.json', '../assets/cathedral/mark.webp',
  './art/ui/shutter.webp', './art/ui/life.webp', './art/ui/frame.webp']
  .concat(OCS.flatMap(k => ['./art/oc/' + k + '_idle.webp', './art/oc/' + k + '_peak.webp'])).concat(ROOMS.map(k => './art/room/' + k + '.webp'));
self.addEventListener('install', e => { e.waitUntil(caches.open(BUILD).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== BUILD).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (u.origin !== location.origin || e.request.method !== 'GET') return;
  if (u.pathname.endsWith('/play/') || u.pathname.endsWith('/play/index.html') || u.pathname.endsWith('/play/game.js')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(BUILD).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request).then(res => { if (res.ok && (u.pathname.includes('/play/') || u.pathname.includes('/assets/cathedral/'))) { const c = res.clone(); caches.open(BUILD).then(k => k.put(e.request, c)); } return res; })));
});
