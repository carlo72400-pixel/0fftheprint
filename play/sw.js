/* GET THE SHOT came down 11/11 (his call). This replaces the game's offline worker so a phone that cached the game lets go:
   it deletes the gts-* caches (only those, the other pages' offline copies stay), unregisters itself and sends any open
   /play/ tab home. Keep this file here a few months so every phone that ever opened the game picks it up. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k.startsWith('gts-')).map(k => caches.delete(k)));
    await self.clients.claim();
    await self.registration.unregister();
    const home = new URL('../', self.location).href;
    const cs = await self.clients.matchAll({ type: 'window' });
    await Promise.all(cs.map(c => c.navigate(home).catch(() => {})));
  })());
});
