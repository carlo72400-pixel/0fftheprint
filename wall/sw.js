/* THE WALL, offline worker (0fftheprint.com/wall/sw.js). Written by flyer-sweep/wall_build.py; never hand-edit.
   Build 20261004214837.
   - The page itself: network first (a fresh week whenever there is signal), the saved copy when there is none.
     The data inside it stays sealed; a member's phone already holds the key, so it opens offline too.
   - Scripts, styles and fonts: served from the phone, refreshed in the background.
   - Flyers: kept after the first view (and the next few nights are warmed while the phone is idle), capped.
   - Supabase (logins, the key): never cached, always live. */
const BUILD = '20261004214837';
const SHELL = 'wall-shell-' + BUILD;
const IMGS = 'wall-img-v1';
const PRECACHE = ["./", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js", "../supabase-config.js?v=f1348482", "../assets/js/desk.js?v=15d61348"];
const IMG_CAP = 450;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u =>
    fetch(u, {cache: 'reload', mode: u.startsWith('http') ? 'cors' : 'same-origin'}).then(r => r.ok && c.put(u, r)).catch(() => {})))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('wall-shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trim(){
  const c = await caches.open(IMGS); const keys = await c.keys();
  for (let i = 0; i < keys.length - IMG_CAP; i++) await c.delete(keys[i]);   // oldest first
}

/* Only a real page goes in the page slot (anything else under /wall/ used to be able to land there),
   and a slow network no longer throws the fresh copy away: after six seconds the saved page opens,
   and the fresh one still finishes downloading into the slot for next time. */
const hold = (e, p) => { try { e.waitUntil(Promise.resolve(p).catch(() => {})); } catch (err) {} };
async function pageFirst(e){
  const c = await caches.open(SHELL);
  const net = fetch(e.request).then(r => {
    if (r.ok && /text\/html/i.test(r.headers.get('content-type') || '')) hold(e, c.put('./', r.clone()));
    return r;
  });
  const slow = new Promise(ok => setTimeout(ok, 6000, null));
  try {
    const r = await Promise.race([net, slow]);
    if (r) return r;
    const saved = await c.match('./');
    if (saved) { hold(e, net); return saved; }
    return await net;
  } catch (err) {
    return (await c.match('./')) || Response.error();
  }
}

async function imageFirst(e){
  const req = e.request;
  const c = await caches.open(IMGS);
  const hit = await c.match(req.url);
  if (hit) return hit;
  try {
    const r = await fetch(req.url, {mode: 'cors'});
    if (r.ok) hold(e, c.put(req.url, r.clone()).then(() => Math.random() < .05 ? trim() : null));   // held open so the phone does not kill it mid-write
    return r;
  } catch (err) { return Response.error(); }
}

async function staleWhileRevalidate(e){
  const req = e.request;
  const c = await caches.open(SHELL);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') hold(e, c.put(req, r.clone())); return r; }).catch(() => null);
  if (hit) { hold(e, net); return hit; }
  return (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/supabase\.co$/.test(url.hostname)) return;                                  // logins and the key: always live
  if (url.origin === location.origin && url.pathname === '/wall/cal.ics') { e.respondWith(calendar(url)); return; }
  if (req.mode === 'navigate' && url.origin === location.origin && (url.pathname === '/wall/' || url.pathname === '/wall/index.html')) { e.respondWith(pageFirst(e)); return; }
  if (url.hostname === 'carlo72400-pixel.github.io' && url.pathname.startsWith('/0tp-wall/')) { e.respondWith(imageFirst(e)); return; }
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
      || (url.origin === location.origin && /\.(js|css|png|svg|webp|webmanifest)$/.test(url.pathname))) { e.respondWith(staleWhileRevalidate(e)); return; }   // webp = the cathedral art (frames, icons, banner), so the page keeps its face offline
});

/* "Add to calendar": the page puts the event text in the URL and this answers it on the phone, nothing goes out.
   text/calendar from a real URL is what makes iPhone open its own Add to Calendar sheet, also from the home screen. */
function calendar(url){
  try {
    const b = (url.searchParams.get('d') || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '==='.slice((b.length + 3) % 4));
    const text = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    if (!/^BEGIN:VCALENDAR/.test(text)) throw new Error('not a calendar');
    return new Response(text, {headers: {'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="the-wall.ics"', 'Cache-Control': 'no-store'}});
  } catch (err) {
    return new Response('That calendar link is broken. Go back and tap Add to calendar again.', {status: 400, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  }
}

/* the page asks the worker to warm the next few nights' thumbnails while the phone is idle */
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'warm' || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(IMGS);
    for (const u of d.urls.slice(0, 160)) {
      if (await c.match(u)) continue;
      try { const r = await fetch(u, {mode: 'cors'}); if (r.ok) await c.put(u, r); } catch (err) {}
    }
    await trim();
  })());
});
