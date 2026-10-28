/* 0FF THE PRINT — THE CATHEDRAL, the moving parts (10/3).
 *
 * The lounge up top, the last night it points at, the friend space, the tip box,
 * which house pack is on the shelf today, and the six tab icons turning in 3D on
 * a wide screen.
 *
 * 10/4, THE FRONT DOOR. A stranger gets something to do before anything asks for a
 * login: the newest night as a pack on the dock, the next date on a tile, a tip line
 * where the lock used to be, and the house's own news (nights, stories) sitting in
 * the timeline between the posts, so the room never reads as empty.
 *
 * ⛔ ADDITIVE, AND IT FAILS QUIET. Nothing on the page waits on this file. If it
 *    404s or throws, the hero is still a picture, the tab cards are still links
 *    (the inline tab router owns them), and the timeline never notices.
 * ⛔ NO innerHTML WITH DATA. Every value that comes out of a JSON file goes in
 *    through textContent or a checked URL, the same rule the rest of the page keeps.
 * ⛔ 3D IS A WIDE-SCREEN TREAT. A phone has the tab bar under the thumb and no
 *    hero cards, so it never downloads the viewer or the models at all.
 */
(function (w, d) {
  'use strict';
  var root = d.documentElement;
  if (!root.classList.contains('cath')) return;

  var SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function idle(fn) { (w.requestIdleCallback || function (f) { return setTimeout(f, 600); })(fn, { timeout: 2500 }); }

  /* ---------- what the house has: asked for once, shared by everything below ---------- */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var nightsP = null, storiesP = null, eventsP = null;
  function events() {
    if (!eventsP) eventsP = fetch('events/events.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return ((j && j.items) || []).filter(function (e) { return e && SLUG.test(e.slug || '') && (e.count | 0) > 0; }); })
      .catch(function () { return []; });
    return eventsP;
  }
  function nights() {
    if (!nightsP) nightsP = events().then(function (all) {
      // a MINI PACK (10/16, events.json `mini`) is not a night: off the counter, the picker and the new-night card.
      // It still sits on the shelf (/events/, the Photos set list), tagged MINI, and (10/21) gets its own timeline card.
      var items = all.filter(function (e) { return !e.mini; });
      items.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      return items;
    });
    return nightsP;
  }
  function minis() { return events().then(function (all) { return all.filter(function (e) { return e.mini; }); }); }
  // a story's page, or (Wave 2) a live one the reader serves before the bake: word/live/?s=<slug>
  var STORY = /^word\/(?:[a-z0-9][a-z0-9-]{0,90}\/|live\/\?s=[a-z0-9][a-z0-9-]{0,90})$/, STHUMB = /^word\/[a-z0-9][a-z0-9-]{0,90}\/thumb\.jpg$/;
  // Wave 2: wait for something the page sets (window[flag] stops being undefined, or it fires ev), 2 s at most.
  function settled(flag, ev, ms) {
    return new Promise(function (ok) {
      if (w[flag] !== undefined) { ok(); return; }
      var done = false, fin = function () { if (!done) { done = true; w.removeEventListener(ev, fin); ok(); } };
      w.addEventListener(ev, fin);
      setTimeout(fin, ms);
    });
  }
  // The house's stories for the timeline: desk.json, with the desk's hand on it from the board (call 12). The page
  // hands over its overlay rows ('otp:overrides') and the house's own live stories ('otp:houselive'); a 'desk' row
  // keyed by the story's link pulls it (hidden) or retitles it (title, dek, kicker), the same as the shelves.
  function stories() {
    if (!storiesP) storiesP = Promise.all([
      fetch('content/desk.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.items) || []; })
        .catch(function () { return []; }),
      settled('__OTP_OVERRIDES', 'otp:overrides', 2000),
      settled('__OTP_HOUSE_LIVE', 'otp:houselive', 2000)
    ]).then(function (got) {
      var rows = ((w.__OTP_OVERRIDES || {}).desk) || [], by = {};
      if (Array.isArray(rows)) rows.forEach(function (r) { if (r && typeof r.item_key === 'string') by[r.item_key] = r; });
      var list = got[0].filter(function (x) { var r = x && by[x.link]; return !(r && r.hidden); }).map(function (x) {
        var r = x && by[x.link], p = r && r.patch && typeof r.patch === 'object' ? r.patch : null;
        if (!p) return x;
        var y = {}; for (var k in x) y[k] = x[k];
        ['title', 'dek', 'kicker'].forEach(function (k) { if (typeof p[k] === 'string' && p[k].trim()) y[k] = p[k]; });
        return y;
      });
      var live = Array.isArray(w.__OTP_HOUSE_LIVE) ? w.__OTP_HOUSE_LIVE : [];
      return list.concat(live).filter(function (x) { return x && STORY.test(x.link || '') && x.title; });
    }).catch(function () { return []; });
    return storiesP;
  }
  // ⛔ Y-M-D by hand, never new Date('2026-09-15'): that is UTC midnight, the evening BEFORE in San Antonio.
  function ymd(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
  // THE TAPE for the timeline (10/21, his ask: "all the new shit should show up on the timeline"): content/video.json CUTS.
  // A cut that rides with a story (`link`) already reaches the timeline as that story, and a night's clips as the night,
  // so only the cuts that went up on their own come back here. `up` = the day it went up (else its `date`).
  var tapeP = null, POSTER = /^[a-z0-9][a-z0-9\/._-]{0,160}\.(?:jpe?g|webp|png)$/i;
  function tape() {
    if (!tapeP) tapeP = fetch('content/video.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        return ((j && j.items) || []).filter(function (v) {
          return v && SLUG.test(v.slug || '') && (v.kind || 'CUT') === 'CUT' && !v.link && v.title && ymd(v.up || v.date);
        });
      }).catch(function () { return []; });
    return tapeP;
  }
  // PORTFOLIO-ONLY work for the timeline (10/21): content/portfolio.json, one row per thing that went up on /portfolio/ and
  // nowhere else (a cut that is also on The Tape, or a night that is also a pack, already has its card). nightsblock.py
  // writes a row when its config carries "timeline"; a hand-kept block adds its row by hand.
  var folioP = null, FOLIO = /^portfolio\/(?:[a-z0-9-]+\/)?(?:#[a-z0-9-]+)?$/, FTHUMB = /^portfolio\/assets\/[a-z0-9\/._-]{1,160}\.(?:jpe?g|webp|png)$/i;
  function folio() {
    if (!folioP) folioP = fetch('content/portfolio.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return ((j && j.items) || []).filter(function (x) { return x && x.title && FOLIO.test(x.link || '') && ymd(x.up); }); })
      .catch(function () { return []; });
    return folioP;
  }
  // THE CRYPT for the timeline (10/21): the weekly flyer build stamps wall/build.txt (yyyymmddhhmmss). Members only, like
  // its nav link (his call 10/2): the card is built for everyone and cathedral.css shows it only on html[data-door="in"].
  var cryptP = null;
  function crypt() {
    if (!cryptP) cryptP = fetch('wall/build.txt', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(String(t || '').trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null; })
      .catch(function () { return null; });
    return cryptP;
  }
  // THE PACKS members and the house make (migration 037 packs_list, anon reads the shelf): the published ones, by the day made.
  var apacksP = null;
  function apacks() {
    if (!apacksP) apacksP = (w.OTP && w.OTP.configured && w.OTP.sb ? Promise.resolve(w.OTP.sb().rpc('packs_list')) : Promise.resolve(null))
      .then(function (r) { return (r && !r.error && Array.isArray(r.data)) ? r.data.filter(function (p) { return p && p.published && SLUG.test(p.slug || '') && p.title && !isNaN(Date.parse(p.created_at || '')); }) : []; })
      .catch(function () { return []; });
    return apacksP;
  }
  function packCover(key) {
    try {
      var u = w.OTP && w.OTP.packPhotoUrl ? w.OTP.packPhotoUrl(key) : ''; if (!u) return '';
      var x = new URL(u, d.baseURI), host = new URL((w.OTP_SUPABASE || {}).url || '').host;
      return x.protocol === 'https:' && host && x.host === host && /^\/storage\/v1\/object\/public\//.test(x.pathname) ? x.href : '';
    } catch (e) { return ''; }
  }
  function mdy(v) { var m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(String(v || '')); return m ? new Date(2000 + (+m[3]), +m[1] - 1, +m[2], 12) : null; }
  function binder() { return w.OTPBinder || null; }

  /* ---------- the last night: the beacon by the window, and the dock under the lounge ---------- */
  function lastNight() {
    var beacon = d.getElementById('hero-beacon'), pick = d.getElementById('night-pick');
    var seen = d.getElementById('bc-seen'), count = d.getElementById('bc-count');
    if (!beacon && !pick && !seen && !count) return;
    nights().then(function (items) {
        var e = items[0]; if (!e) return;
        var href = 'events/' + e.slug + '/';
        var where = [e.venue, e.date_short].filter(Boolean).join(' · ');
        if (count) {
          // what is actually on the shelf, counted, where a made-up "online now" used to blink
          var frames = items.reduce(function (a, x) { return a + (x.count | 0); }, 0);
          count.textContent = '● ' + items.length + ' nights · ' + frames + ' frames';
        }
        if (seen) {
          seen.textContent = '';
          var sa = el('a', '', (e.title || 'last night') + (e.venue ? ' · ' + e.venue : ''));
          sa.href = href; seen.appendChild(sa);
        }
        if (beacon) {
          beacon.href = href + '#rip';
          var t = d.getElementById('hb-title'), m = d.getElementById('hb-meta');
          if (t) t.textContent = e.title || '';
          if (m) m.textContent = where + ' · ' + (e.count | 0) + ' frames';
          beacon.hidden = false;
        }
        if (pick) {
          /* THE NIGHT PICKER (10/14): the last three nights as packs, newest first, then the shelf.
             The dock (one night) lived here before. Same data, same tear (#rip on the night's page). */
          var rail = d.getElementById('pk-rail'); if (!rail) return;
          var top = items.slice(0, 3);
          var tiles = top.map(function (n) {
            var h = 'events/' + n.slug + '/', tt = String(n.title || '');
            var a = el('a', 'pk'); a.href = h + '#rip';
            var pp = el('span', 'pp');
            var im = el('img', 'pp-w'); im.alt = ''; im.width = 520; im.height = 878; im.decoding = 'async';
            im.addEventListener('error', function () { im.src = 'assets/cathedral/pack-house.webp'; }, { once: true });
            if (window.OTPLazy) { im.dataset.src = h + 'pack.webp'; window.OTPLazy.watch(im); } else im.src = h + 'pack.webp';   // 10/22: the three covers wait for the scroll
            var t = el('span', 'pp-t' + (tt.length <= 7 ? ' short' : tt.length > 16 ? ' long' : ''), tt);
            var dd = el('span', 'pp-d', n.date_short || '');
            pp.appendChild(im); pp.appendChild(t); pp.appendChild(dd);
            a.appendChild(pp);
            a.appendChild(el('b', '', tt));
            a.appendChild(el('span', '', [n.venue, n.date_short].filter(Boolean).join(' · ')));
            var line = el('em', '', (n.count | 0) + ' frames, sealed'); a.appendChild(line);
            var meter = el('span', 'pk-meter'); var bar = el('i'); meter.appendChild(bar); a.appendChild(meter);
            a._paint = function () {
              var B = binder(), st = null; try { st = B ? B.night(n.slug) : null; } catch (err) {}
              var c = n.count | 0;
              if (st && st.opened && st.done) { line.textContent = 'All ' + c + ' in your binder'; a.href = h; bar.style.width = '100%'; }
              else if (st && st.opened) { line.textContent = st.have + ' of ' + c + ' pulled' + (st.hit ? ', hit found' : ''); a.href = h + '#rip'; bar.style.width = (c ? Math.round(100 * st.have / c) : 0) + '%'; }
              else { line.textContent = c + ' frames, sealed. Tear it open'; a.href = h + '#rip'; bar.style.width = '0'; }
            };
            return a;
          });
          var all = el('a', 'pk all'); all.href = '#find'; all.setAttribute('data-tab-link', 'photos');
          all.appendChild(el('b', '', 'Every night'));
          var frames = items.reduce(function (acc, x) { return acc + (x.count | 0); }, 0);
          all.appendChild(el('span', '', items.length + ' nights · ' + frames + ' frames'));
          all.appendChild(el('em', '', 'Not up there? Find it by date'));
          tiles.push(all);
          rail.textContent = '';
          tiles.forEach(function (t) { rail.appendChild(t); });
          var paintAll = function () { tiles.forEach(function (t) { if (t._paint) t._paint(); }); };
          paintAll();
          try { if (binder()) binder().on(paintAll); } catch (err) {}
          var kick = d.getElementById('pk-k'), dt = ymd(e.date);
          var days = dt ? Math.floor((Date.now() - dt.getTime()) / 864e5) : 99;
          if (kick && days <= 1) kick.textContent = 'Last night is up';
          pick.hidden = false;
        }
      }).catch(function () {});
  }

  /* ---------- the next date, on the What's coming tile ----------
     The run block in the page hands over its next few rows (window.__OTP_RUN, then the otp:run event). */
  function nextUp() {
    var tile = d.getElementById('do-next'); if (!tile) return;
    function paint() {
      var run = w.__OTP_RUN; if (!Array.isArray(run) || !run.length || !tile.parentNode) return;
      var r = run[0], dt = ymd(r.on_date); if (!dt || !r.title) return;
      var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
      var off = Math.round((dt.getTime() - today.getTime()) / 864e5);
      var when = off === 0 ? 'Tonight' : off === 1 ? 'Tomorrow' : DOW[dt.getDay()] + ' ' + MON[dt.getMonth()] + ' ' + dt.getDate();
      var b = tile.querySelector('b'), sp = tile.querySelector('span');
      if (b) b.textContent = 'Next: ' + when;
      if (sp) sp.textContent = String(r.title).slice(0, 34) + (String(r.title).length > 34 ? '…' : '');
      tile.classList.add('live');
    }
    paint();
    w.addEventListener('otp:run', paint);
  }

  /* ---------- who is at the door: out, wait or in ----------
     door.js owns the answer and paints #nav-key with it. This only copies it onto <html>, so the
     stylesheet can show a stranger the tip line and a member the composer. */
  function door() {
    var key = d.getElementById('nav-key'); if (!key) return;
    var has = false;
    try { for (var i = 0; i < w.localStorage.length; i++) { if (/^sb-.*-auth-token/.test(w.localStorage.key(i) || '')) { has = true; break; } } } catch (e) {}
    // door.js names the state (data-st, 035). The old reading stays for a cached door.js that does not.
    function read() {
      var st = key.getAttribute('data-st');
      if (st === 'in' || st === 'wait' || st === 'out') return st;
      return key.classList.contains('on') ? 'in' : /pending|almost/i.test(key.textContent || '') ? 'wait' : 'out';
    }
    // ⛔ READ THE KEY FIRST. door.js can paint before this file runs, and a change that already
    //    happened never reaches the observer below: a member would be shown the stranger's tip line.
    // Key still says "Log in" and there is no saved session at all: nobody is signed in, say so now.
    // Key says "Log in" but a session is saved: door.js has not spoken yet, wait for it.
    var now = read();
    if (now !== 'out' || !has) root.setAttribute('data-door', now);
    try {
      new MutationObserver(function () { root.setAttribute('data-door', read()); })
        .observe(key, { attributes: true, attributeFilter: ['class', 'href', 'data-st'], childList: true, characterData: true, subtree: true });
    } catch (e) {}
    // door.js may have painted before this file ran
    if (has) setTimeout(function () { if (!root.hasAttribute('data-door')) root.setAttribute('data-door', read()); }, 2500);
  }

  /* ---------- the phone tab bar swipes (10/15): keep the current tab in view, fade the edge that still has tabs ---------- */
  function tabSwipe() {
    var bar = d.getElementById('tabbar'); if (!bar) return;
    function edge() { bar.classList.toggle('at-end', bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 4); }
    function follow() { var cur = bar.querySelector('a[aria-current="page"]'); if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { cur.scrollIntoView(); } } setTimeout(edge, 400); }
    bar.addEventListener('scroll', edge, { passive: true }); edge(); follow();
    try { new MutationObserver(follow).observe(bar, { attributes: true, attributeFilter: ['aria-current'], subtree: true }); } catch (e) {}
  }

  /* ---------- the house strip (10/15): what a member sees first, what a stranger sees first ----------
     door.js names the door and this file copies it onto <html data-door>. The strip follows that attribute:
     'in' or 'wait' = the member's keys with live counts, 'out' = the three steps and what the house gives you.
     Counts come from the same calls the Crypt makes; every one is optional, a quiet zero on any trouble. */
  function house() {
    var IN = d.getElementById('house-in'), OUT = d.getElementById('house-out'); if (!IN || !OUT) return;
    var filled = false;
    function name() { try { var c = JSON.parse(w.localStorage.getItem('otp_door') || 'null'); return (c && c.name) || ''; } catch (e) { return ''; } }
    function badge(id, n) { var el = d.getElementById(id); if (!el) return; n = n | 0; el.textContent = n > 99 ? '99+' : String(n); el.hidden = !n; var k = el.closest('.hk'); if (k) k.classList.toggle('live', !!n); }
    function txt(id, t) { var el = d.getElementById(id); if (el) el.textContent = t; }
    function packs() { try { var B = w.OTPBinder, t = B && B.totals(); if (!t) return; txt('hk-packs-s', t.opened ? t.opened + (t.opened === 1 ? ' night' : ' nights') + ' \u00b7 ' + t.frames + ' frames' : 'nothing pulled yet'); } catch (e) {} }
    function fill(st) {
      var nm = name(); txt('hs-name', nm || 'you');
      if (st === 'wait') txt('hs-sub', 'one more step: your Instagram at the Crypt');
      // the binder: this phone's packs (no login needed, so a member on a new phone sees zero until they pull)
      packs(); try { if (w.OTPBinder && !fill.sub) { fill.sub = 1; w.OTPBinder.on(packs); } } catch (e) {}
      // Get the Shot banks pulls in localStorage; a sealed night in the Crypt spends them
      try { var p = parseInt(w.localStorage.getItem('otp-play-pulls') || '0', 10) || 0; badge('hk-pulls', p); txt('hk-play-s', p ? p + (p === 1 ? ' pull' : ' pulls') + ' to spend' : 'shoot for pulls'); } catch (e) {}
      if (filled || !w.OTP || !w.OTP.configured || st !== 'in') return; filled = true;
      var c; try { c = w.OTP.sb(); } catch (e) { c = null; } if (!c) return;
      // Messages unread, Kin asks, nights going (from today): three independent asks, none waits on another
      try { c.rpc('dm_inbox').then(function (r) { if (r && !r.error && Array.isArray(r.data)) { var n = r.data.reduce(function (a, x) { return a + (+x.unread || 0); }, 0); badge('hk-dm-n', n); txt('hk-dm-s', n ? n + ' unread' : r.data.length ? r.data.length + (r.data.length === 1 ? ' conversation' : ' conversations') : 'members talk'); } }).catch(function () {}); } catch (e) {}
      try { c.rpc('friend_asks').then(function (r) { if (r && !r.error && Array.isArray(r.data)) { badge('hk-kin-n', r.data.length); txt('hk-kin-s', r.data.length ? r.data.length + (r.data.length === 1 ? ' ask waiting' : ' asks waiting') : 'your people'); } }).catch(function () {}); } catch (e) {}
      try { var dt = new Date(), day = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
        c.from('wall_going').select('event_id,day').gte('day', day).then(function (r) { if (r && !r.error && Array.isArray(r.data)) { var n = r.data.length; badge('hk-going', n); txt('hk-tonight-s', n ? 'going to ' + n : 'the Crypt'); } }).catch(function () {}); } catch (e) {}
    }
    function show() {
      var st = root.getAttribute('data-door');
      if (!st) { IN.hidden = true; OUT.hidden = true; return; }
      var inside = st === 'in' || st === 'wait';
      IN.hidden = !inside; OUT.hidden = inside;
      if (inside) fill(st);
      // the plain line under the house line speaks to whoever is at the door
      var hp = d.getElementById('hero-plain'); if (hp && inside && !hp.dataset.member) { hp.dataset.member = '1'; hp.textContent = 'Welcome back. Tonight\u2019s flyers, your people and your packs are one tap down.'; }
    }
    show();
    try { new MutationObserver(show).observe(root, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
  }

  /* ---------- the house's own news, in the timeline ----------
     Nights, stories and (10/21, his rule: "all the new shit should show up on the timeline") the cuts on The Tape, mini packs,
     portfolio-only work, the Crypt's weekly flyers (members only) and the packs on the shelf, dated, slotted between the posts. A media house that shot 18 nights
     and wrote 28 stories should not have a timeline that reads as one person talking to himself.
     ⛔ These are links, not posts: no reactions, no author, never mistaken for something a member said. */
  var HOUSE_CAP = 8;   // the newest eight, across nights, mini packs, stories, cuts, the portfolio, the Crypt and the packs (10/21: 6 -> 8)
  function houseFeed() {
    var mount = d.getElementById('take-mount'); if (!mount) return;
    var placed = false;
    function shortDate(dt) { return MON[dt.getMonth()] + ' ' + dt.getDate(); }
    function avatar() {
      var av = el('span', 'hx-av'); var mk = el('img'); mk.alt = ''; mk.width = 240; mk.height = 228; mk.decoding = 'async'; mk.src = 'assets/cathedral/mark.webp';
      av.appendChild(mk); return av;
    }
    function label(what, dt) {
      var i = el('span', 'hx-who'); i.appendChild(el('b', '', 'The House')); i.appendChild(el('span', 'seat', what)); i.appendChild(el('span', 'when', '· ' + shortDate(dt)));
      return i;
    }
    function nightCard(e, dt) {
      var a = el('a', 'hx night' + (e.mini ? ' mini' : '')); a.href = 'events/' + e.slug + '/';
      a.appendChild(avatar());
      var main = el('span', 'hx-main'); main.appendChild(label(e.mini ? 'new mini pack' : 'new night', dt));
      var row = el('span', 'hx-row');
      var pk = el('span', 'hx-pk'); var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 520; im.height = 878;
      im.addEventListener('error', function () { im.src = 'assets/cathedral/pack-house.webp'; }, { once: true });
      im.src = 'events/' + e.slug + '/pack.webp'; pk.appendChild(im); row.appendChild(pk);
      var tx = el('span', 'hx-tx');
      tx.appendChild(el('b', '', (e.title || '') + (e.venue ? ' @ ' + e.venue : '')));
      var line = el('span', '', e.mini ? (e.count | 0) + ' frames, one rip deals them all.' : (e.count | 0) + ' frames went up. Were you there?'), go = el('em', '', 'tear the pack →');
      var B = binder(), st = null; try { st = B ? B.night(e.slug) : null; } catch (err) {}
      if (st && st.opened) { line.textContent = st.done ? 'All ' + (e.count | 0) + ' frames are in your binder.' : st.have + ' of ' + (e.count | 0) + ' in your binder.'; go.textContent = st.done ? 'see the night →' : 'rip another →'; }
      tx.appendChild(line); tx.appendChild(go); row.appendChild(tx);
      main.appendChild(row); a.appendChild(main);
      return a;
    }
    // TEAR-OUTS (10/15): a story on the timeline is a page torn out of the magazine, at a tilt: the cover, the
    // kicker as a sticker, the dek as the hook, the number, a NEW stamp for its first three days.
    var TEAR_NEW_MS = 3 * 864e5;
    function storyCard(list, dt) {
      var box = el('div', 'hx stories');
      box.appendChild(avatar());
      var main = el('div', 'hx-main'); main.appendChild(label(list.length === 1 ? 'new story' : list.length + ' new stories', dt));
      var fresh = (Date.now() - dt.getTime()) < TEAR_NEW_MS;
      list.slice(0, 3).forEach(function (x, i) {
        var a = el('a', 'tear' + (i % 2 ? ' r' : '')); a.href = x.link;
        var pic = el('span', 'tear-pic');
        if (STHUMB.test(x.thumb || '')) { var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 120; im.height = 150;
          im.addEventListener('error', function () { im.remove(); }, { once: true }); im.src = x.thumb; pic.appendChild(im); }
        a.appendChild(pic);
        var tx = el('span', 'tear-tx');
        if (x.kicker) tx.appendChild(el('i', 'tear-k', String(x.kicker).slice(0, 24)));
        tx.appendChild(el('b', '', x.title));
        if (x.dek) tx.appendChild(el('span', 'tear-dek', String(x.dek).slice(0, 150) + (String(x.dek).length > 150 ? '…' : '')));
        var meta = el('small', 'tear-m', [x.num ? String(x.num).slice(0, 12) : '', 'read it →'].filter(Boolean).join(' · '));
        tx.appendChild(meta); a.appendChild(tx);
        if (fresh) a.appendChild(el('em', 'tear-new', 'NEW'));
        main.appendChild(a);
      });
      box.appendChild(main);
      return box;
    }
    // THE TAPE (10/21): a day's new cuts as one card, their posters in a strip, straight into the first one on /video/
    var TAPE_SHOW = 4;
    function tapeCard(g, dt) {
      var a = el('a', 'hx tape'); a.href = 'video/#' + g.list[0].slug;
      a.appendChild(avatar());
      var main = el('span', 'hx-main'); main.appendChild(label(g.list.length === 1 ? 'new cut' : g.list.length + ' new cuts', dt));
      var tx = el('span', 'hx-tx');
      tx.appendChild(el('b', '', g.from || 'The Tape'));
      tx.appendChild(el('span', '', g.list.length === 1 ? g.list[0].title + ' went up on The Tape.' : g.list.length + ' cuts went up on The Tape.'));
      var strip = el('span', 'hx-strip');
      g.list.slice(0, TAPE_SHOW).forEach(function (v) {
        var p = String(v.poster || ''); p = p.indexOf('../') === 0 ? p.slice(3) : 'video/' + p;
        if (!POSTER.test(p)) return;
        var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 520; im.height = 924;
        im.addEventListener('error', function () { im.remove(); }, { once: true }); im.src = p; strip.appendChild(im);
      });
      if (g.list.length > TAPE_SHOW) strip.appendChild(el('span', 'more', '+' + (g.list.length - TAPE_SHOW)));
      tx.appendChild(strip);
      tx.appendChild(el('em', '', g.list.length === 1 ? 'watch it \u2192' : 'watch them \u2192'));
      main.appendChild(tx); a.appendChild(main);
      return a;
    }
    // the wide row (10/21): a 16:9 picture beside the words, for the portfolio and the Crypt
    function wideCard(cls, href, what, dt, pic, title, line, go) {
      var a = el('a', 'hx ' + cls); a.href = href;
      a.appendChild(avatar());
      var main = el('span', 'hx-main'); main.appendChild(label(what, dt));
      var row = el('span', 'hx-row hx-wide');
      var pk = el('span', 'hx-wpic'); var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 1200; im.height = 675;
      im.addEventListener('error', function () { pk.remove(); }, { once: true }); im.src = pic; pk.appendChild(im); row.appendChild(pk);
      var tx = el('span', 'hx-tx'); tx.appendChild(el('b', '', title)); tx.appendChild(el('span', '', line)); tx.appendChild(el('em', '', go));
      row.appendChild(tx); main.appendChild(row); a.appendChild(main);
      return a;
    }
    function folioCard(x, dt) {
      var pic = FTHUMB.test(x.thumb || '') ? x.thumb : 'portfolio/assets/preview.jpg';
      return wideCard('folio', x.link, 'new on the portfolio', dt, pic, x.title, String(x.line || '').slice(0, 160), 'see it \u2192');
    }
    function cryptCard(dt) {
      return wideCard('crypt', 'wall/', 'new flyers', dt, 'wall/preview.jpg', 'This week in the Crypt', 'The week\u2019s flyers are up. See who\u2019s going.', 'open the Crypt \u2192');
    }
    function apackCard(g, dt) {
      var one = g.list.length === 1, p0 = g.list[0];
      var a = el('a', 'hx apack'); a.href = one ? 'packs/?p=' + encodeURIComponent(p0.slug) : 'packs/';
      a.appendChild(avatar());
      var main = el('span', 'hx-main'); main.appendChild(label(one ? 'new pack' : g.list.length + ' new packs', dt));
      var tx = el('span', 'hx-tx');
      tx.appendChild(el('b', '', one ? p0.title : g.list.map(function (p) { return p.title; }).slice(0, 2).join(' + ') + (g.list.length > 2 ? ' + more' : '')));
      tx.appendChild(el('span', '', one ? 'by ' + (p0.author || 'Member') + ' \u00b7 ' + (p0.cards | 0) + ' cards' + (p0.has_hit ? ' \u00b7 one hit' : '') : g.list.length + ' packs went on the shelf.'));
      var strip = el('span', 'hx-strip sq');
      g.list.slice(0, TAPE_SHOW).forEach(function (p) { var u = packCover(p.cover); if (!u) return; var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
        im.width = 400; im.height = 500; im.addEventListener('error', function () { im.remove(); }, { once: true }); im.src = u; strip.appendChild(im); });
      if (strip.childNodes.length) tx.appendChild(strip);
      tx.appendChild(el('em', '', one ? 'tear it open \u2192' : 'see the shelf \u2192'));
      main.appendChild(tx); a.appendChild(main);
      return a;
    }
    var built = null, placing = false, seenPosts = 0;
    function place(ns, st, tp, mi, fo, cr, ap) {
      // built once, placed again whenever the timeline grows (Show older posts), so the order stays true
      if (built) { slot(); return; }
      var items = [];
      // the newest night is on the dock already
      // a night lands by the day it went up (`up`, newevent.py since 10/21), else its own date; the card still says its date
      ns.slice(1).forEach(function (e) { var dt = ymd(e.date), at = ymd(e.up || e.date); if (dt && at) items.push({ t: at.getTime() + 9 * 36e5, kind: 'n', e: e, dt: dt }); });
      (mi || []).forEach(function (e) { var dt = ymd(e.date), at = ymd(e.up || e.date); if (dt && at) items.push({ t: at.getTime() + 9 * 36e5, kind: 'n', e: e, dt: dt }); });
      var by = {};
      st.forEach(function (x) { var dt = mdy(x.date); if (!dt) return; var k = dt.getTime(); (by[k] = by[k] || { t: k, kind: 's', list: [], dt: dt }).list.push(x); });
      Object.keys(by).forEach(function (k) { items.push(by[k]); });
      var tb = {};
      (tp || []).forEach(function (v) { var dt = ymd(v.up || v.date); if (!dt) return; var k = dt.getTime() + '|' + (v.from || '');
        (tb[k] = tb[k] || { t: dt.getTime() + 10 * 36e5, kind: 't', list: [], dt: dt, from: v.from || '' }).list.push(v); });
      Object.keys(tb).forEach(function (k) { items.push(tb[k]); });
      (fo || []).forEach(function (x) { var dt = ymd(x.up); if (dt) items.push({ t: dt.getTime() + 11 * 36e5, kind: 'f', x: x, dt: dt }); });
      if (cr) items.push({ t: cr.getTime(), kind: 'c', dt: cr });
      var pb = {};
      (ap || []).forEach(function (p) { var c = new Date(Date.parse(p.created_at)), dt = new Date(c.getFullYear(), c.getMonth(), c.getDate(), 12), k = dt.getTime();
        (pb[k] = pb[k] || { t: c.getTime(), kind: 'a', list: [], dt: dt }).list.push(p); });
      Object.keys(pb).forEach(function (k) { items.push(pb[k]); });
      items.sort(function (a, b) { return b.t - a.t; });
      var CARD = { n: function (it) { return nightCard(it.e, it.dt); }, t: function (it) { return tapeCard(it, it.dt); }, s: function (it) { return storyCard(it.list, it.dt); },
                   f: function (it) { return folioCard(it.x, it.dt); }, c: function (it) { return cryptCard(it.dt); }, a: function (it) { return apackCard(it, it.dt); } };
      built = items.slice(0, HOUSE_CAP).map(function (it) { return { t: it.t, node: CARD[it.kind](it) }; });
      slot();
      // a member's binder moves: the night cards say so
      try { if (binder()) binder().on(function () { Array.prototype.forEach.call(mount.querySelectorAll('.hx.night'), function (a) {
        var m = /events\/([a-z0-9-]+)\/$/.exec(a.getAttribute('href') || ''), B = binder(); if (!m || !B) return;
        var s2 = B.night(m[1]), line = a.querySelector('.hx-tx > span'), go = a.querySelector('em'); if (!s2.opened || !line || !go) return;
        line.textContent = s2.done ? 'All ' + s2.total + ' frames are in your binder.' : s2.have + ' of ' + s2.total + ' in your binder.';
        go.textContent = s2.done ? 'see the night →' : 'rip another →';
      }); }); } catch (err) {}
    }
    function slot() {
      if (!built) return;
      placing = true;
      try {
        built.forEach(function (it) { if (it.node.parentNode) it.node.parentNode.removeChild(it.node); });
        var posts = Array.prototype.filter.call(mount.querySelectorAll('.post-t'), function (p) { return !p.classList.contains('pinned'); });
        seenPosts = mount.querySelectorAll('.post-t').length;
        built.forEach(function (it) {
          var before = null;
          for (var i = 0; i < posts.length; i++) {
            var ts = Date.parse(posts[i].getAttribute('data-ts') || '');
            if (!isNaN(ts) && ts < it.t) { before = posts[i]; break; }
          }
          if (before) mount.insertBefore(it.node, before); else mount.appendChild(it.node);
        });
      } catch (e) {}
      // the observer hears these moves a tick later; it must not answer them
      setTimeout(function () { placing = false; }, 0);
    }
    function pinFold() {
      // the pinned post is the house rules: a screen of text as the first thing on the timeline.
      // Folded to its first lines; one tap opens it.
      var body = mount.querySelector('.post-t.pinned .post-body'); if (!body || body.getAttribute('data-fold')) return;
      body.setAttribute('data-fold', '1');
      if ((body.textContent || '').length < 160) return;
      body.classList.add('fold');
      var b = el('button', 'fold-more', 'read the rest'); b.type = 'button';
      b.addEventListener('click', function () { var open = body.classList.toggle('fold') === false; b.textContent = open ? 'fold it back' : 'read the rest'; });
      body.parentNode.insertBefore(b, body.nextSibling);
    }
    function go() {
      if (placing || !mount.querySelector('.post-t')) return;
      pinFold();
      if (placed) { if (built && mount.querySelectorAll('.post-t').length !== seenPosts) slot(); return; }
      placed = true;
      Promise.all([nights(), stories(), tape(), minis(), folio(), crypt(), apacks()]).then(function (got) { try { place(got[0], got[1], got[2], got[3], got[4], got[5], got[6]); } catch (e) {} });
    }
    go();
    try { new MutationObserver(go).observe(mount, { childList: true }); } catch (e) {}
  }

  /* ---------- the friend space: the roster's own card art, cut small ----------
     Wave 2 (call 13): the page adds card holders with no hand-typed row once the card list answers, each with
     its card photo in data-photo, and says so ('otp:spotlight'). A house face (FACES) still wins; a photo off
     data-photo is used only from this site or the database's own file store. */
  var FACES = { 'kav-man': 'kavman', 'virgosgateway': 'virgosgateway', 'wrathfol': 'wrathfol', 'theink': 'theink',
                'wunmor': 'wunmor', 'kurlytop': 'kurlytop', 'josh-fuego': 'joshfuego', 'vamppsych': 'vamppsych' };
  function okPhoto(u) {
    u = String(u || '');
    if (!u || u.length > 600 || /["'()\\\s<>]/.test(u)) return '';
    if (/^assets\/[a-z0-9\/._-]+\.(?:jpe?g|png|webp)$/i.test(u)) return u;
    var x, host = '';
    try { x = new URL(u, d.baseURI); } catch (e) { return ''; }
    try { host = new URL((w.OTP_SUPABASE || {}).url || '').host; } catch (e) {}
    if (x.protocol === 'https:' && host && x.host === host && /^\/storage\/v1\/object\/public\/(?:cards|spaces)\//.test(x.pathname)) return x.href;
    if (x.origin === w.location.origin && /\.(?:jpe?g|png|webp)$/i.test(x.pathname)) return x.href;
    return '';
  }
  function friends() {
    var list = d.querySelectorAll('.friends .creator');
    Array.prototype.forEach.call(list, function (a) {
      var pic = a.querySelector('.creator-pic'); if (!pic || pic.classList.contains('has')) return;
      var m = /^c\/([a-z0-9-]+)\/$/.exec(a.getAttribute('href') || '');
      var f = m && FACES[m[1]];
      var src = f ? 'assets/cathedral/av/' + f + '.jpg' : okPhoto(pic.getAttribute('data-photo'));
      if (!src) return;
      var probe = new Image();
      probe.onload = function () {
        // the markup sets `background:` inline (the gradient), which resets size and position, so all three go on together
        pic.style.backgroundImage = 'url("' + src + '")'; pic.style.backgroundSize = 'cover'; pic.style.backgroundPosition = '50% 20%';
        pic.classList.add('has');
      };
      probe.src = src;
    });
  }

  /* ---------- the tip box: it opens their own mail app, nothing is sent from here ----------
     Two of them since 10/4: the box in the side column, and the tip line a stranger gets on the timeline. */
  function tipbox() {
    [['tip-text', 'tip-send'], ['tip2-text', 'tip2-send']].forEach(function (ids) {
      var ta = d.getElementById(ids[0]), btn = d.getElementById(ids[1]);
      if (!ta || !btn) return;
      btn.addEventListener('click', function () {
        var v = String(ta.value || '').trim();
        if (!v) { ta.focus(); return; }
        w.location.href = 'mailto:offtheprintcollective@gmail.com?subject=' + encodeURIComponent('Tip for the desk') +
          '&body=' + encodeURIComponent(v.slice(0, 1800));
      });
    });
  }

  /* ---------- the house pack: five full-art packs, one per girl in the lounge, a different one each visit ----------
     The file name comes off a fixed count, never off data. With this script off, the CSS falls back to pack-house.webp. */
  var HOUSE_PACKS = 5;
  function housePack() {
    var n = 1 + Math.floor(Math.random() * HOUSE_PACKS);
    // ⛔ ABSOLUTE. A relative url() inside a custom property is resolved against the STYLESHEET that uses it
    //    (assets/css/), not this page, so "assets/cathedral/..." became assets/css/assets/cathedral/... and 404ed.
    var u; try { u = new URL('assets/cathedral/pack-house-' + n + '.webp', d.baseURI).href; } catch (e) { return; }
    root.style.setProperty('--house-pack', 'url("' + u + '")');
  }

  /* ---------- the six icons, turning. Wide screens only, and only once the page is settled. ----------
     10/28, ONE TURN THEN REST (WCAG 2.2.2: motion that starts by itself and runs past 5 s needs a stop key, and the
     old slow turn never ended). Once they have landed the six turn once, 4.2 s each (eased up, the old hover pace,
     eased down), rippling down the hand 80 ms apart, and rest facing front (REST). A mouse on a card, or the keyboard
     on it, spins it for as long as it stays; let go and it finishes the turn and rests. A tap, or a card that becomes
     the current tab, gets one turn. Nothing turns under reduced motion, even when it is switched on mid-visit.
     ⛔ SELF-HOSTED (10/28): model-viewer 4.4.0 (jsDelivr, sha256-GLLnEQNapHBe4oFTClXcIzj/Be7T1wrhbVQQUoKnXtU=) and the
        Draco 1.5.6 decoder it used to side-load from gstatic. The version is in the folder name: a new version is a
        new folder, never a file swapped in place under the same URL. */
  var MV = 'assets/vendor/model-viewer-4.4.0/model-viewer.min.js', DRACO = 'assets/vendor/draco-1.5.6/';
  var CRUISE = 100 / 360, ACC = CRUISE / 0.6;   // turns a second (100 deg/s, hover was 95) and how fast it gets there (0.6 s)
  var UPRIGHT = { home: '0deg 90deg 0deg', stories: '0deg 90deg 0deg' };   // these two meshes came out lying on their backs
  // where each one rests: facing front, turned 15 deg off dead-on, like its flat icon. The old start angles (i * 55)
  // only worked while they never stopped: at rest they left the key edge-on and the vinyl and the cap backwards.
  // The book sits the other way round after UPRIGHT, so its front is at 150.
  var REST = { stories: 150 };
  function threeD() {
    var cards = d.querySelectorAll('#hero-hand .hcard');
    if (!cards.length) return;
    if (!w.matchMedia || !w.matchMedia('(min-width:821px)').matches) return;
    var still = w.matchMedia('(prefers-reduced-motion:reduce)');
    if (still.matches) return;
    if (navigator.connection && navigator.connection.saveData) return;
    var probe = d.createElement('canvas');
    if (!(probe.getContext && (probe.getContext('webgl2') || probe.getContext('webgl')))) return;
    // ⛔ BEFORE the first <model-viewer> exists: each one reads this as it is made, or the decoder comes off Google again
    w.ModelViewerElement = w.ModelViewerElement || {};
    try { w.ModelViewerElement.dracoDecoderLocation = new URL(DRACO, d.baseURI).href; } catch (e) {}
    var s = d.createElement('script');
    s.type = 'module';
    s.src = MV;
    s.onerror = function () {};
    d.head.appendChild(s);
    // one clock for all six, running only while one of them moves
    var all = [], raf = 0, last = 0;
    function frame(now) {
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60, more = false; last = now;
      all.forEach(function (t) { if (t.step(dt)) more = true; });
      if (more) raf = w.requestAnimationFrame(frame); else raf = last = 0;
    }
    function wake() { if (!raf) raf = w.requestAnimationFrame(frame); }
    // one icon: pos in turns (a whole number is its own angle, so it always rests there), vel in turns a second
    function turner(mv) {
      var pos = 0, vel = 0, goal = 0, held = false, ready = false, brake = null;
      function rest() { pos = vel = goal = 0; brake = null; mv.resetTurntableRotation(0); }
      return {
        ready: function () { ready = true; },
        once: function () { if (!ready) return; goal = Math.max(goal, Math.floor(pos) + 1); wake(); },
        hold: function (on) {
          if (!ready || on === held) return;
          held = on;
          if (on) brake = null; else goal = Math.max(goal, Math.ceil(pos + vel * vel / (2 * ACC) - 1e-6));
          wake();
        },
        step: function (dt) {
          if (still.matches) { if (pos || vel) rest(); return false; }
          if (brake) {
            var t = brake.t = Math.min(brake.T, brake.t + dt);
            if (t >= brake.T) { rest(); return false; }
            pos = brake.p + brake.v * t - brake.a * t * t / 2; vel = brake.v - brake.a * t;
          } else if (held || pos < goal) {
            vel = Math.min(CRUISE, vel + ACC * dt); pos += vel * dt;
            // near the goal: plan the stop so it lands exactly on the whole turn
            var left = goal - pos;
            if (!held && left <= vel * vel / (2 * ACC)) {
              if (left <= 0) { rest(); return false; }
              brake = { p: pos, v: vel, a: vel * vel / (2 * left), t: 0, T: 2 * left / vel };
            }
          } else return false;
          mv.resetTurntableRotation(pos * 2 * Math.PI);
          return true;
        }
      };
    }
    // the first turn waits for all six (3 s at most after the first lands) and ripples down the hand 80 ms apart:
    // 4.2 s + 5 x 80 ms, so the whole hand has moved once and stopped inside 5 s
    var landed = 0, dealt = false;
    function deal() { if (dealt) return; dealt = true; all.forEach(function (t, j) { setTimeout(t.once, j * 80); }); }
    Array.prototype.forEach.call(cards, function (a) {
      var k = a.getAttribute('data-tab-link'); if (!/^[a-z]+$/.test(k || '')) return;
      var mv = d.createElement('model-viewer'), t = turner(mv), hov = false, foc = false;
      mv.setAttribute('src', 'assets/cathedral/i-' + k + '.glb');
      mv.setAttribute('interaction-prompt', 'none');
      mv.setAttribute('camera-orbit', (k in REST ? REST[k] : 15) + 'deg 76deg 100%'); mv.setAttribute('field-of-view', '20deg');
      mv.setAttribute('exposure', '1.15'); mv.setAttribute('shadow-intensity', '0'); mv.setAttribute('aria-hidden', 'true');
      mv.setAttribute('inert', '');   // ⛔ 10/28: the viewer is a Tab stop of its own; without this, Tab lands inside each hidden icon
      if (UPRIGHT[k]) mv.setAttribute('orientation', UPRIGHT[k]);
      all.push(t);
      function feel() { t.hold(hov || foc); }
      mv.addEventListener('load', function () {
        a.classList.add('m3'); t.ready(); feel();
        if (++landed === all.length) deal(); else if (landed === 1) setTimeout(deal, 3000);
      });
      // a mouse holds the spin; a finger or a pen gets one turn (a tapped card on an iPad would otherwise spin until the next tap)
      a.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { hov = true; feel(); } else t.once(); });
      a.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hov = false; feel(); } });
      // keyboard focus only: a mouse click leaves focus on the card in Chrome, and that card would spin until the next click
      a.addEventListener('focus', function () { try { foc = a.matches(':focus-visible'); } catch (e) { foc = true; } feel(); });
      a.addEventListener('blur', function () { foc = false; feel(); });
      try { new MutationObserver(function () { if (a.getAttribute('aria-current') === 'page') t.once(); }).observe(a, { attributes: true, attributeFilter: ['aria-current'] }); } catch (e) {}
      a.appendChild(mv);
    });
  }

  function boot() {
    housePack(); door(); house(); tabSwipe(); lastNight(); nextUp(); friends(); tipbox(); houseFeed();
    w.addEventListener('otp:spotlight', friends);
    if (d.readyState === 'complete') idle(threeD); else w.addEventListener('load', function () { idle(threeD); }, { once: true });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);
