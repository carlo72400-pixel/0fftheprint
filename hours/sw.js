/* Offline shell for Gio's personal punch clock. This cache is not the shop clock. */
var CACHE = 'gio-punch-shell-2';
var FILES = [
  './',
  './index.html',
  './punch.js',
  './manifest.webmanifest',
  './favicon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(FILES);
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key !== CACHE;
    }).map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkThenCache(req));
});

function networkThenCache(req) {
  return caches.open(CACHE).then(function (cache) {
    return fetch(req).then(function (fresh) {
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    }).catch(function () {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('./index.html');
        return Promise.reject(new Error('offline'));
      });
    });
  });
}
