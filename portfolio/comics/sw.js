// School of Comics pitch: network first, fall back to the saved copy when there is no signal.
var C = 'soc-pitch-v1';
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(function (c) { return c.add('./'); }).catch(function () {}));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (r) {
      if (r && r.ok) { var k = r.clone(); caches.open(C).then(function (c) { c.put(e.request, k); }); }
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('./'); });
    })
  );
});
