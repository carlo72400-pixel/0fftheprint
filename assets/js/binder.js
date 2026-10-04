/* 0FF THE PRINT — THE BINDER (10/4).
 *
 * What you pull, you keep. Every frame a pack deals, the one hit hiding in each
 * night and every roster card out of the house pack lands in a binder that lives
 * on the visitor's own phone. No login and no database: it is localStorage.
 *
 * WHY IT EXISTS. The packs were the best toy on the site and nothing stuck. You
 * tore one, saw five frames, left, and the site forgot you were ever there. A
 * count that only goes up, a hit you have not found yet and a night sitting at
 * 38 of 45 are three reasons to rip again tonight, and one to come back when the
 * next night drops.
 *
 * WHERE IT SHOWS.
 *   - the chip in the nav (home), or in the house bar this file puts on every other page that loads it
 *   - the sheet the chip opens: where you stand, every night, the roster
 *   - under every pack tile (home Drops rail, /events/ shelf): how far in you are, NEW on a fresh one
 *   - on a night's own page: sealed.js deals what you have NOT pulled first and says where you stand
 *   - under a night: the packs on either side of it, so a night is never a dead end
 *
 * ⛔ IT FAILS QUIET. Private mode, storage full, this file 404s: the packs still tear and the
 *    pages still read. Nothing waits on the binder.
 * ⛔ THE BINDER IS THIS PHONE. Nothing here claims an account, a sync or a leaderboard.
 * ⛔ NO innerHTML WITH DATA. Titles and venues come out of events.json as textContent, and a
 *    slug only becomes a URL after it matches the shape newevent.py writes.
 */
(function (w, d) {
  'use strict';
  if (w.OTPBinder) return;

  var KEY = 'otp-binder', VER = 1, MAXN = 4000, FRESH_DAYS = 14;
  var SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
  var THUMB = /^media\/[A-Za-z0-9_.-]{1,60}$/;
  var COVER = /^[a-z0-9][a-z0-9-]{0,80}\/media\/[A-Za-z0-9_.-]{1,60}$/;

  // the site root, read off this file's own address, so the same script works at /, /events/ and /events/<night>/
  var BASE = '/';
  try { BASE = new URL('../../', d.currentScript.src).href; } catch (e) {}

  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function tight(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40); }

  /* ---------- the store ----------
     { v, n: { <slug>: { f: [frame index...], c: frames in the night, h: the hit's thumb once pulled } },
       r: { <roster key>: times pulled }, rips } */
  function blank() { return { v: VER, n: {}, r: {}, rips: 0 }; }
  function load() {
    try {
      var j = JSON.parse(w.localStorage.getItem(KEY) || 'null');
      if (j && j.v === VER && j.n && typeof j.n === 'object') { if (!j.r || typeof j.r !== 'object') j.r = {}; return j; }
    } catch (e) {}
    return blank();
  }
  var S = load(), subs = [];
  function save() { try { w.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function tell(what) { subs.slice().forEach(function (f) { try { f(what); } catch (e) {} }); }
  // another tab ripped a pack: this one catches up
  w.addEventListener('storage', function (e) { if (e.key === KEY) { S = load(); tell('sync'); } });

  function rec(slug) { var r = S.n[slug]; return (r && Array.isArray(r.f)) ? r : null; }
  function night(slug) {
    var r = rec(slug);
    if (!r) return { opened: false, have: 0, total: 0, hit: false, hitThumb: '', done: false };
    var total = r.c | 0, have = Math.min(r.f.length, total || r.f.length);
    return { opened: true, have: have, total: total, hit: !!r.h, hitThumb: THUMB.test(r.h || '') ? r.h : '', done: total > 0 && have >= total };
  }
  function has(slug, i) { var r = rec(slug); return !!r && r.f.indexOf(i | 0) >= 0; }
  /* one frame into the binder. Returns true when it is new to this phone. */
  function add(slug, i, o) {
    if (!SLUG.test(slug || '')) return false;
    o = o || {}; i = i | 0;
    var total = o.total | 0;
    if (i < 0 || total < 1 || total > MAXN || i >= total) return false;
    var r = rec(slug);
    if (!r) r = S.n[slug] = { f: [], c: total };
    if (r.c !== total) { r.c = total; r.f = r.f.filter(function (x) { return x < total; }); }   // the night was re-cut
    if (r.f.indexOf(i) >= 0) return false;
    r.f.push(i);
    if (o.hit) r.h = THUMB.test(o.thumb || '') ? o.thumb : '1';
    save(); tell('add');
    return true;
  }
  function rip() { S.rips = (S.rips | 0) + 1; save(); }
  /* a roster card out of the house pack */
  function card(name) {
    var k = tight(name); if (!k) return false;
    var isNew = !S.r[k];
    S.r[k] = Math.min(9999, (S.r[k] | 0) + 1);
    save(); tell('card');
    return isNew;
  }
  function totals() {
    var frames = 0, hits = 0, opened = 0, done = 0;
    Object.keys(S.n).forEach(function (k) {
      var st = night(k); if (!st.opened) return;
      opened++; frames += st.have; if (st.hit) hits++; if (st.done) done++;
    });
    return { frames: frames, hits: hits, opened: opened, done: done, cards: Object.keys(S.r).length, rips: S.rips | 0 };
  }

  /* ---------- what the site has: the nights and the roster, asked for once ---------- */
  var evP = null, roP = null;
  function events() {
    if (!evP) evP = fetch(BASE + 'events/events.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        return ((j && j.items) || []).filter(function (e) { return e && SLUG.test(e.slug || '') && (e.count | 0) > 0; })
          .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      }).catch(function () { evP = null; return []; });
    return evP;
  }
  function roster() {
    if (!roP) roP = fetch(BASE + 'content/roster.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return ((j && j.items) || []).filter(function (c) { return c && tight(c.name); }); })
      .catch(function () { roP = null; return []; });
    return roP;
  }
  // a night's slug opens with its date. Fresh = shot in the last two weeks.
  function fresh(slug) {
    var m = /^(\d{4})-(\d{2})-(\d{2})-/.exec(slug); if (!m) return false;
    var t = new Date(+m[1], +m[2] - 1, +m[3], 12).getTime();
    var days = (Date.now() - t) / 864e5;
    return days > -1 && days <= FRESH_DAYS;
  }

  /* ---------- the chip ---------- */
  var chips = [];
  function chipEl() {
    var b = el('button', 'bn-chip'); b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog');
    var im = el('img'); im.alt = ''; im.width = 44; im.height = 44; im.decoding = 'async'; im.src = BASE + 'assets/cathedral/a/pack.webp';
    b.appendChild(im); b.appendChild(el('span', 'bn-n')); b.appendChild(el('span', 'bn-h'));
    b.addEventListener('click', openSheet);
    chips.push(b); paintChip(b);
    return b;
  }
  function paintChip(b, bump) {
    var t = totals();
    b.querySelector('.bn-n').textContent = t.frames ? String(t.frames) : 'Binder';
    b.querySelector('.bn-h').textContent = t.hits ? String(t.hits) : '';
    b.classList.toggle('has', t.frames > 0);
    b.classList.toggle('hit', t.hits > 0);
    b.setAttribute('aria-label', t.frames ? 'Your binder: ' + t.frames + ' frames, ' + t.hits + (t.hits === 1 ? ' hit' : ' hits') : 'Your binder');
    if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }

  /* ---------- the house bar: every page that is not the homepage gets a way back in ---------- */
  function bar() {
    if (d.querySelector('nav.site') || d.querySelector('.bn-bar') || !d.body) return;
    // the wordmark's face. These pages never loaded it, and one weight is 15 KB.
    var f = el('link'); f.rel = 'stylesheet'; f.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@800&display=swap'; d.head.appendChild(f);
    var n = el('nav', 'bn-bar'); n.setAttribute('aria-label', '0FF THE PRINT');
    var home = el('a', 'bn-wm'); home.href = BASE; home.setAttribute('aria-label', '0FF THE PRINT, home');
    var mk = el('img'); mk.alt = ''; mk.width = 240; mk.height = 228; mk.decoding = 'async'; mk.src = BASE + 'assets/cathedral/mark.webp';
    home.appendChild(mk); home.appendChild(el('span', '', 'FF THE PRINT'));
    n.appendChild(home);
    var links = el('span', 'bn-links');
    [['Home', ''], ['Nights', 'events/'], ['Stories', '#stories'], ['People', '#people']].forEach(function (x) {
      var a = el('a', '', x[0]); a.href = BASE + x[1];
      try { if (new URL(a.href).pathname === location.pathname) a.setAttribute('aria-current', 'page'); } catch (e) {}
      links.appendChild(a);
    });
    n.appendChild(links);
    n.appendChild(chipEl());
    d.body.insertBefore(n, d.body.firstChild);
    d.documentElement.classList.add('bn-has-bar');
  }

  /* ---------- pack tiles: how far in you are ----------
     Works on the home Drops rail (a.drop.party), the /events/ shelf (a.pk) and this file's own next-pack tiles. */
  var NIGHT_PATH = /\/events\/([a-z0-9][a-z0-9-]{0,80})\/$/;
  function slugOf(a) { try { var m = NIGHT_PATH.exec(new URL(a.getAttribute('href'), d.baseURI).pathname); return m ? m[1] : ''; } catch (e) { return ''; } }
  function paintPack(a) {
    var slug = slugOf(a), pp = a.querySelector('.pp'); if (!slug || !pp) return;
    var st = night(slug), box = a.querySelector('.bn-prog'), tag = pp.querySelector('.bn-tag');
    if (!st.opened) {
      if (box) box.remove();
      a.classList.remove('bn-open', 'bn-done', 'bn-hit');
      if (fresh(slug)) { if (!tag) pp.appendChild(el('span', 'bn-tag', 'New')); } else if (tag) tag.remove();
      return;
    }
    if (tag) tag.remove();
    // inside the caption, right under the venue: the home rail's caption is an inline box, and anything
    // hung after it lands a blank line lower than it should
    if (!box) { box = el('span', 'bn-prog'); box.appendChild(el('i')); box.appendChild(el('b')); (a.querySelector('.cap') || a).appendChild(box); }
    box.firstChild.style.setProperty('--p', (st.total ? Math.min(100, Math.round(100 * st.have / st.total)) : 0) + '%');
    box.lastChild.textContent = st.done ? 'night complete' : st.have + ' / ' + st.total + (st.hit ? ' · hit found' : '');
    a.classList.add('bn-open'); a.classList.toggle('bn-done', st.done); a.classList.toggle('bn-hit', st.hit);
  }
  function paintPacks(root) {
    Array.prototype.forEach.call((root || d).querySelectorAll('a.pk, a.drop.party, a.bn-pk'), function (a) { try { paintPack(a); } catch (e) {} });
  }
  function watch(node) {
    if (!node) return;
    paintPacks(node);
    try { new MutationObserver(function () { paintPacks(node); }).observe(node, { childList: true }); } catch (e) {}
  }

  /* one pack tile, the same markup the shelf uses (assets/css/pack.css) */
  function packTile(e, cls) {
    var title = String(e.title || '');
    var a = el('a', cls); a.href = BASE + 'events/' + e.slug + '/';
    var pp = el('span', 'pp');
    var wimg = el('img', 'pp-w'); wimg.alt = ''; wimg.width = 520; wimg.height = 878; wimg.loading = 'lazy'; wimg.decoding = 'async';
    wimg.addEventListener('error', function () { wimg.src = BASE + 'assets/cathedral/pack-house.webp'; }, { once: true });
    wimg.src = BASE + 'events/' + e.slug + '/pack.webp';
    pp.appendChild(wimg);
    pp.appendChild(el('span', 'pp-t' + (title.length <= 7 ? ' short' : title.length > 16 ? ' long' : ''), title));
    pp.appendChild(el('span', 'pp-d', e.date_short || ''));
    a.appendChild(pp);
    var cap = el('span', 'cap');
    cap.appendChild(el('b', '', e.venue || title));
    cap.appendChild(el('i', '', (e.count | 0) + ' frames · sealed'));
    a.appendChild(cap);
    return a;
  }

  /* ---------- under a night: the packs on either side of it ---------- */
  function nextPacks() {
    var N = w.OTPNight; if (!N || !SLUG.test(N.slug || '')) return;
    var wrap = d.querySelector('.wrap'); if (!wrap || wrap.querySelector('.bn-next')) return;
    events().then(function (list) {
      var at = -1;
      list.forEach(function (e, i) { if (e.slug === N.slug) at = i; });
      if (at < 0 || list.length < 2) return;
      // nearest in time first, newer before older; a night this phone has not opened jumps the line
      var others = list.map(function (e, i) { return { e: e, far: Math.abs(i - at) - (i < at ? .5 : 0) - (night(e.slug).opened ? 0 : 1.5) }; })
        .filter(function (x) { return x.e.slug !== N.slug; })
        .sort(function (a, b) { return a.far - b.far; }).slice(0, 4).map(function (x) { return x.e; });
      if (!others.length) return;
      var sec = el('section', 'bn-next');
      var h = el('div', 'bn-next-h'); h.appendChild(el('h2', '', 'Keep ripping')); h.appendChild(el('span', '', 'the nights on either side of this one'));
      var rail = el('div', 'bn-rail');
      others.forEach(function (e) { rail.appendChild(packTile(e, 'bn-pk')); });
      var all = el('a', 'bn-all', 'every night →'); all.href = BASE + 'events/';
      sec.appendChild(h); sec.appendChild(rail); sec.appendChild(all);
      var foot = wrap.querySelector('.foot');
      if (foot && foot.parentNode === wrap) wrap.insertBefore(sec, foot); else wrap.appendChild(sec);
      paintPacks(sec);
    });
  }

  /* ---------- the sheet ---------- */
  var sheet = null, lastFocus = null;
  function stat(n, of, label) {
    var s = el('div', 'bn-stat');
    var b = el('b', '', String(n)); if (of != null) b.appendChild(el('i', '', ' / ' + of));
    s.appendChild(b); s.appendChild(el('span', '', label));
    return s;
  }
  function drawSheet() {
    if (!sheet) return;
    var body = sheet.querySelector('.bn-body'); if (!body) return;
    Promise.all([events(), roster()]).then(function (got) {
      var list = got[0], cards = got[1], t = totals();
      var frames = list.reduce(function (a, e) { return a + (e.count | 0); }, 0);
      body.textContent = '';

      var stats = el('div', 'bn-stats');
      stats.appendChild(stat(t.frames, frames || null, 'frames pulled'));
      stats.appendChild(stat(t.hits, list.length || null, 'hits found'));
      stats.appendChild(stat(t.cards, cards.length || null, 'roster cards'));
      body.appendChild(stats);

      // the next thing to do: the newest night this phone has not finished
      var next = null;
      list.forEach(function (e) { if (!next && !night(e.slug).done) next = e; });
      if (next) {
        var st0 = night(next.slug);
        var go = el('a', 'bn-go'); go.href = BASE + 'events/' + next.slug + '/#rip';
        go.appendChild(el('b', '', (st0.opened ? 'Rip another: ' : 'Tear this one: ') + (next.title || 'the newest night')));
        go.appendChild(el('span', '', st0.opened ? st0.have + ' of ' + st0.total + ' pulled' + (st0.hit ? '' : ', the hit is still in there')
                                                 : (next.count | 0) + ' frames, one hit, sealed'));
        body.appendChild(go);
      }

      var hn = el('h3', '', 'The nights'); hn.appendChild(el('small', '', t.opened + ' of ' + list.length + ' opened'));
      body.appendChild(hn);
      var ol = el('div', 'bn-nights');
      list.forEach(function (e) {
        var st = night(e.slug);
        var a = el('a', 'bn-night' + (st.opened ? ' open' : '') + (st.hit ? ' hit' : '') + (st.done ? ' done' : ''));
        a.href = BASE + 'events/' + e.slug + '/';
        var pic = el('span', 'bn-pic');
        var src = st.hitThumb ? e.slug + '/' + st.hitThumb : (COVER.test(e.cover || '') ? e.cover : '');
        if (src) { var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 54; im.height = 54; im.src = BASE + 'events/' + src; pic.appendChild(im); }
        a.appendChild(pic);
        var tx = el('span', 'bn-tx');
        tx.appendChild(el('b', '', e.title || e.slug));
        tx.appendChild(el('span', '', [e.venue, e.date_short].filter(Boolean).join(' · ')));
        var meter = el('span', 'bn-meter'); var fill = el('i');
        fill.style.setProperty('--p', (st.total ? Math.min(100, Math.round(100 * st.have / st.total)) : 0) + '%');
        meter.appendChild(fill); tx.appendChild(meter);
        a.appendChild(tx);
        a.appendChild(el('em', '', st.done ? 'complete' : st.opened ? st.have + ' / ' + (e.count | 0) : 'sealed'));
        ol.appendChild(a);
      });
      body.appendChild(ol);

      if (cards.length) {
        var hr = el('h3', '', 'The roster'); hr.appendChild(el('small', '', t.cards + ' of ' + cards.length + ' pulled'));
        body.appendChild(hr);
        var row = el('div', 'bn-roster');
        cards.forEach(function (c) {
          var k = tight(c.name), got1 = !!S.r[k];
          var s = el('span', 'bn-face' + (got1 ? ' got' : ''));
          var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 54; im.height = 54;
          im.addEventListener('error', function () { im.remove(); }, { once: true });
          im.src = BASE + 'assets/cathedral/av/' + k + '.jpg';
          s.appendChild(im);
          s.appendChild(el('span', '', got1 ? String(c.name) : '?'));
          row.appendChild(s);
        });
        body.appendChild(row);
        var op = el('a', 'bn-link', 'Open the house pack →'); op.href = BASE + '#open';
        op.addEventListener('click', closeSheet);
        body.appendChild(op);
      }
      body.appendChild(el('p', 'bn-fine', 'Your binder lives on this phone. Nothing to log in to. Clear your browser and it starts over.'));
    });
  }
  function buildSheet() {
    sheet = el('div', 'bn-sheet'); sheet.hidden = true;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Your binder');
    var cardEl = el('div', 'bn-card');
    var head = el('div', 'bn-head');
    head.appendChild(el('h2', '', 'Your binder'));
    var x = el('button', 'bn-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeSheet);
    head.appendChild(x);
    cardEl.appendChild(head);
    cardEl.appendChild(el('div', 'bn-body'));
    sheet.appendChild(cardEl);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    d.addEventListener('keydown', function (e) {
      if (!sheet || sheet.hidden) return;
      if (e.key === 'Escape') { closeSheet(); return; }
      if (e.key !== 'Tab') return;
      // Tab stays inside the sheet while it is open
      var f = sheet.querySelectorAll('a[href], button:not([disabled])'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!sheet.contains(d.activeElement)) { e.preventDefault(); first.focus(); }
    });
    d.body.appendChild(sheet);
  }
  function openSheet() {
    if (!sheet) buildSheet();
    lastFocus = d.activeElement;
    sheet.hidden = false; d.documentElement.classList.add('bn-open-sheet');
    drawSheet();
    var x = sheet.querySelector('.bn-x'); if (x) { try { x.focus({ preventScroll: true }); } catch (e) {} }
  }
  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true; d.documentElement.classList.remove('bn-open-sheet');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- keep every surface in step ---------- */
  subs.push(function (what) {
    chips.forEach(function (b) { paintChip(b, what === 'add' || what === 'card'); });
    paintPacks(d);
    if (sheet && !sheet.hidden) drawSheet();
  });

  w.OTPBinder = {
    base: BASE, night: night, has: has, add: add, rip: rip, card: card, totals: totals, events: events,
    open: openSheet, paintPacks: paintPacks, packTile: packTile, fresh: fresh,
    on: function (f) { if (typeof f === 'function') subs.push(f); }
  };

  function boot() {
    var slot = d.getElementById('nav-binder');
    if (slot) { var c = chipEl(); c.id = 'nav-binder'; slot.parentNode.replaceChild(c, slot); }
    else bar();
    watch(d.getElementById('drops-rail'));     // home
    watch(d.getElementById('list'));           // /events/
    nextPacks();                               // a night's own page
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);
