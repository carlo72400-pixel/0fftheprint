/* THE KIT offline worker (10/15): the page, its icons and the house art it uses are cached on install, so the kit opens with no
   signal. Bump BUILD when the page changes; the old cache is dropped on activate. Same-origin only; fonts just fall back. */
const BUILD = 'kit-20261021b';
const FILES = ['./', './index.html', './qr-shot.png', '../assets/cathedral/shot/putty_sign.webp', '../assets/cathedral/shot/ask_p.webp?v=3', '../assets/cathedral/shot/ask_l.webp?v=4', '../assets/cathedral/shot/ask_wall_p.webp?v=3', '../assets/cathedral/shot/ask_wall_l.webp?v=3', '../assets/cathedral/shot/qp_heart.webp', '../assets/cathedral/shot/qp_star.webp', '../assets/cathedral/shot/qp_cam.webp', '../assets/cathedral/shot/qp_print.webp', '../assets/cathedral/shot/qp_film.webp', '../assets/cathedral/shot/qp_bat.webp', '../assets/cathedral/shot/t_flash.webp', '../assets/cathedral/shot/qr_wall.webp', '../assets/fonts/saira-condensed-700.woff2', '../assets/fonts/saira-condensed-900.woff2', '../assets/fonts/inter-400.woff2', '../assets/fonts/inter-500.woff2', '../assets/fonts/inter-600.woff2', '../assets/fonts/inter-700.woff2', '../assets/fonts/inter-800.woff2', '../assets/fonts/jetbrains-mono-400.woff2', '../assets/fonts/jetbrains-mono-500.woff2', '../assets/fonts/jetbrains-mono-700.woff2', '../assets/fonts/gloria-hallelujah-400.woff2', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  '../assets/cathedral/mark.webp', '../assets/cathedral/w/stage.webp', '../assets/cathedral/w/screen.webp', '../assets/cathedral/w/film.webp',
  '../assets/cathedral/w/all.webp', '../assets/cathedral/w/going.webp', '../assets/cathedral/w/tonight.webp', '../assets/cathedral/w/pin.webp',
  '../assets/cathedral/w/deal.webp', '../assets/cathedral/w/lock.webp', '../assets/cathedral/w/fest.webp', '../assets/cathedral/a/coming.webp', '../assets/cathedral/w/ad.webp'];
self.addEventListener('install', e => { e.waitUntil(caches.open(BUILD).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== BUILD).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // the page itself: network first so a new build lands, cache when there is no signal
  if (u.pathname.endsWith('/kit/') || u.pathname.endsWith('/kit/index.html')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(BUILD).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok && (u.pathname.includes('/assets/cathedral/') || u.pathname.includes('/kit/'))) { const c = res.clone(); caches.open(BUILD).then(k => k.put(e.request, c)); } return res; })));
});
