/* THE WALL, offline worker (0fftheprint.com/wall/sw.js). Written by flyer-sweep/wall_build.py; never hand-edit.
   Build 20261021174925.
   - The page itself: the SAVED copy first, at once, and a fresh one downloads behind it for next time (10/13, "flyers open fast
     from a link": a link used to wait up to six seconds on the network). The page checks wall/build.txt itself: when a newer
     build has the flyer it was sent to, it asks again with ?b=<build>, and that one request goes to the network first. A saved
     copy older than three days also goes network first (four seconds, then the saved copy). No saved copy: the network.
     The data inside it stays sealed; a member's phone already holds the key, so it opens offline too.
   - Scripts, styles and fonts: served from the phone, refreshed in the background.
   - Flyers: kept after the first view (and the next few nights are warmed while the phone is idle), capped.
   - Supabase (logins, the key): never cached, always live. */
const BUILD = '20261021174925';
const SHELL = 'wall-shell-' + BUILD;
const IMGS = 'wall-img-v1';
const PRECACHE = ["./", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js", "../supabase-config.js?v=f1348482", "../assets/js/desk.js?v=12f3e9e0"];
const IMG_CAP = 450;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u =>
    fetch(u, {cache: 'reload', mode: u.startsWith('http') ? 'cors' : 'same-origin'}).then(r => r.ok && (u === './' ? keep(c, r) : c.put(u, r))).catch(() => {})))));   // the page slot carries its saved-at stamp
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

/* Only a real page goes in the page slot (anything else under /wall/ used to be able to land there). Saved first (10/13): the
   saved page answers at once and the fresh one downloads into the slot behind it, stamped with when it was saved. The page swaps
   itself when it needs to (build.txt, above). ?b= or a stale slot: the network first, the saved copy if it is slow or gone. */
const hold = (e, p) => { try { e.waitUntil(Promise.resolve(p).catch(() => {})); } catch (err) {} };
const STALE = 3 * 864e5, SLOW = 4000;
async function keep(c, r){
  // the saved-at stamp rides on the saved copy's headers; the body is the page exactly as it came
  const h = new Headers(r.headers); h.delete('content-length'); h.delete('content-encoding'); h.set('x-wall-saved', String(Date.now()));
  await c.put('./', new Response(await r.blob(), {status: r.status, statusText: r.statusText, headers: h}));
}
async function pageFirst(e){
  const c = await caches.open(SHELL);
  const fresh = () => fetch(e.request).then(r => {
    if (r.ok && /text\/html/i.test(r.headers.get('content-type') || '')) hold(e, keep(c, r.clone()));
    return r;
  });
  const saved = await c.match('./');
  const asked = new URL(e.request.url).searchParams.has('b');            // the page asked for a newer build on purpose
  const age = saved ? Date.now() - (+saved.headers.get('x-wall-saved') || 0) : Infinity;
  if (saved && !asked && age < STALE) { hold(e, fresh().catch(() => null)); return saved; }
  const net = fresh();
  if (!saved) { try { return await net; } catch (err) { return Response.error(); } }
  try {
    const r = await Promise.race([net, new Promise(ok => setTimeout(ok, SLOW, null))]);
    if (r && r.ok) return r;
    hold(e, net.catch(() => null));
    return saved;
  } catch (err) {
    return saved;
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
      || (url.origin === location.origin && /\.(js|css|png|svg|webp|webmanifest)$/.test(url.pathname))
      || (url.origin === location.origin && url.pathname.startsWith('/wall/') && /\.json$/.test(url.pathname))) { e.respondWith(staleWhileRevalidate(e)); return; }
  // webp = the cathedral art (frames, icons, banner), so the page keeps its face offline. json: only the Crypt's own search list
  // (wall/search.json?v=<build>, a new ?v= every build). The site's other .json (content/roster.json, creators.json, the events'
  // data.json) stays live: the page asks for those fresh on purpose (10/14 review).
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
