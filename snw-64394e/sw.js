/* sw.js : lets the Sick New World planner open with no signal, after one visit with signal.
   Scope = this folder only. On install it caches the page and everything the page names (scripts, images, the
   supabase-js file from the CDN, the Google Fonts stylesheet and its latin font files), so nothing here needs updating
   when ?v= stamps change: the page's own HTML is the list. The page itself is network-first with a short timeout (fresh
   when the signal works, the saved copy within a few seconds when it doesn't); files are cache-first. Requests to the
   database never touch this worker: the engine already queues edits made offline. Only caches named snw-sw-* are ever
   deleted here; other pages on this domain keep theirs. Bump VERSION to force a fresh copy on every phone. */
const VERSION = 'snw-sw-20261020';
const PAGE = new URL('./', self.location).href;
const PAGE_PATH = new URL(PAGE).pathname;
const NET_TIMEOUT = 3500;
const FILE_RE = /\.(js|css|svg|png|jpe?g|webp|gif|woff2?)$/i;
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const unescape = (s) => s.replace(/&amp;/g, '&');
const cors = (url) => new Request(url, { mode: 'cors', credentials: 'omit' });

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const res = await fetch(PAGE, { cache: 'no-cache' });
    const html = await res.clone().text();
    await cache.put(PAGE, res);

    // same-origin files the page names in src= / href=, plus image paths inside its inline config
    const local = new Set();
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const u = new URL(unescape(m[1]), PAGE);
      if (u.origin === self.location.origin && FILE_RE.test(u.pathname)) local.add(u.href);
    }
    for (const m of html.matchAll(/["'(](img\/[^"')\s]+)/g)) local.add(new URL(m[1], PAGE).href);
    await Promise.all([...local].map((u) => cache.add(u).catch(() => {})));

    // scripts from the CDN (the page checks their SRI hash; the cached bytes are the same bytes)
    for (const m of html.matchAll(/src="(https:\/\/cdn\.jsdelivr\.net\/[^"]+)"/g)) {
      await cache.add(cors(unescape(m[1]))).catch(() => {});
    }

    // Google Fonts: the stylesheet the page links, then the latin files it names
    for (const m of html.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/g)) {
      try {
        const cssUrl = unescape(m[1]);
        const css = await fetch(cors(cssUrl));
        if (!css.ok) continue;
        const text = await css.clone().text();
        await cache.put(cssUrl, css);
        const files = [];
        for (const block of text.split('@font-face').slice(1)) {
          if (!/U\+0000-00FF/i.test(block)) continue;
          const f = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(block);
          if (f) files.push(f[1]);
        }
        await Promise.all(files.map((f) => cache.add(cors(f)).catch(() => {})));
      } catch (err) { /* fonts get cached the next time they load */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('snw-sw-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function pageNetworkFirst(req) {
  const cache = await caches.open(VERSION);
  const net = fetch(req).then((res) => {
    if (res && res.ok) cache.put(PAGE, res.clone());
    return res;
  });
  net.catch(() => {});
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), NET_TIMEOUT))]);
  } catch (err) {
    const saved = await cache.match(PAGE);
    if (saved) return saved;
    return net;
  }
}

async function fileCacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const older = await cache.match(req, { ignoreSearch: true });
    if (older) return older;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mine = url.origin === self.location.origin;
  if (req.mode === 'navigate') {
    if (mine && url.pathname.startsWith(PAGE_PATH)) event.respondWith(pageNetworkFirst(req));
    return;
  }
  if (mine ? FILE_RE.test(url.pathname) : CDN_HOSTS.includes(url.hostname)) event.respondWith(fileCacheFirst(req));
});
