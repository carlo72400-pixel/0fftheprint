/* GET THE SHOT offline worker (10/15, v2): the page, the engine, the backdrop, every flat and cutout cached on install so
   the game plays with no signal. Bump BUILD when anything changes; old caches go on activate. */
const BUILD = 'gts-20261015h';
const FLATS = ['backdrop_booth', 'backdrop_coop', 'backdrop_lot', 'proscenium', 'f_ball', 'f_lights', 'f_speaker', 'f_booth', 'f_bar', 'f_wedge', 'f_table', 'f_arch', 'c_drums', 'c_amps', 'c_lamp', 'c_couch', 'c_keg', 'c_merch', 'c_fan', 'c_door', 'l_pole', 'l_truck', 'l_fence', 'l_car', 'l_dumpster', 'l_cones', 'l_chairs', 'l_cart'], CAST = ['mars', 'rin', 'lena', 'nyx', 'kuro', 'cinder', 'bala', 'putty'];
const FILES = ['./', './index.html', './game.js?v=20261015h', './manifest.webmanifest', './icon-192.png', './icon-512.png', '../assets/cathedral/mark.webp', './art/ui/shutter.webp']
  .concat(FLATS.map(k => './art/v2/flat/' + k + '.webp')).concat(['./art/v2/oc/meta.json']).concat(CAST.flatMap(k => ['idle', 'peak', 'drink', 'selfie'].map(p => './art/v2/oc/' + k + '_' + p + '.webp')));
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
