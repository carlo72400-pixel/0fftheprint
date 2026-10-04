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
  var nightsP = null, storiesP = null;
  function nights() {
    if (!nightsP) nightsP = fetch('events/events.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var items = ((j && j.items) || []).filter(function (e) { return e && SLUG.test(e.slug || '') && (e.count | 0) > 0; });
        items.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        return items;
      }).catch(function () { return []; });
    return nightsP;
  }
  var STORY = /^word\/[a-z0-9][a-z0-9-]{0,90}\/$/, STHUMB = /^word\/[a-z0-9][a-z0-9-]{0,90}\/thumb\.jpg$/;
  function stories() {
    if (!storiesP) storiesP = fetch('content/desk.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return ((j && j.items) || []).filter(function (x) { return x && STORY.test(x.link || '') && x.title; }); })
      .catch(function () { return []; });
    return storiesP;
  }
  // ⛔ Y-M-D by hand, never new Date('2026-09-15'): that is UTC midnight, the evening BEFORE in San Antonio.
  function ymd(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
  function mdy(v) { var m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(String(v || '')); return m ? new Date(2000 + (+m[3]), +m[1] - 1, +m[2], 12) : null; }
  function binder() { return w.OTPBinder || null; }

  /* ---------- the last night: the beacon by the window, and the dock under the lounge ---------- */
  function lastNight() {
    var beacon = d.getElementById('hero-beacon'), dock = d.getElementById('night-dock');
    var seen = d.getElementById('bc-seen'), count = d.getElementById('bc-count');
    if (!beacon && !dock && !seen && !count) return;
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
        if (dock) {
          var title = String(e.title || '');
          var pw = d.getElementById('dk-w'), pt = d.getElementById('dk-t'), pd = d.getElementById('dk-d');
          if (pw) {
            pw.addEventListener('error', function () { pw.src = 'assets/cathedral/pack-house.webp'; }, { once: true });
            pw.src = href + 'pack.webp';
          }
          if (pt) { pt.textContent = title; pt.className = 'pp-t' + (title.length <= 7 ? ' short' : title.length > 16 ? ' long' : ''); }
          if (pd) pd.textContent = e.date_short || '';
          var dt = ymd(e.date), kick = d.getElementById('dk-k');
          var days = dt ? Math.floor((Date.now() - dt.getTime()) / 864e5) : 99;
          if (kick) kick.textContent = (days <= 1 ? 'Last night is up' : 'New night is up') + (dt ? ' · ' + MON[dt.getMonth()] + ' ' + dt.getDate() : '');
          var tt = d.getElementById('dk-title'); if (tt) tt.textContent = title + (e.venue ? ' @ ' + e.venue : '');
          // where this phone stands on it, when there is a binder; a stranger gets the plain pitch
          var paintDock = function () {
            var line = d.getElementById('dk-line'), go = d.getElementById('dk-go'), B = binder(), st = null;
            try { st = B ? B.night(e.slug) : null; } catch (err) {}
            var n = e.count | 0;
            if (st && st.opened && st.done) {
              if (line) line.textContent = 'All ' + n + ' frames are in your binder.';
              if (go) go.textContent = 'See the night'; dock.href = href;
            } else if (st && st.opened) {
              if (line) line.textContent = st.have + ' of ' + n + ' pulled. ' + (st.hit ? 'You found the hit.' : 'The hit is still in there.');
              if (go) go.textContent = 'Rip another'; dock.href = href + '#rip';
            } else {
              if (line) line.textContent = n + ' frames, sealed. Were you there? Who did you see?';
              if (go) go.textContent = 'Tear it open'; dock.href = href + '#rip';
            }
          };
          paintDock();
          try { if (binder()) binder().on(paintDock); } catch (err) {}
          dock.hidden = false;
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
    function read() { return key.classList.contains('on') ? 'in' : /pending/i.test(key.textContent || '') ? 'wait' : 'out'; }
    // ⛔ READ THE KEY FIRST. door.js can paint before this file runs, and a change that already
    //    happened never reaches the observer below: a member would be shown the stranger's tip line.
    // Key still says "Log in" and there is no saved session at all: nobody is signed in, say so now.
    // Key says "Log in" but a session is saved: door.js has not spoken yet, wait for it.
    var now = read();
    if (now !== 'out' || !has) root.setAttribute('data-door', now);
    try {
      new MutationObserver(function () { root.setAttribute('data-door', read()); })
        .observe(key, { attributes: true, attributeFilter: ['class', 'href'], childList: true, characterData: true, subtree: true });
    } catch (e) {}
    // door.js may have painted before this file ran
    if (has) setTimeout(function () { if (!root.hasAttribute('data-door')) root.setAttribute('data-door', read()); }, 2500);
  }

  /* ---------- the house's own news, in the timeline ----------
     Nights and stories, dated, slotted between the posts in order. A media house that shot 18 nights
     and wrote 28 stories should not have a timeline that reads as one person talking to himself.
     ⛔ These are links, not posts: no reactions, no author, never mistaken for something a member said. */
  var HOUSE_CAP = 6;
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
      var a = el('a', 'hx night'); a.href = 'events/' + e.slug + '/';
      a.appendChild(avatar());
      var main = el('span', 'hx-main'); main.appendChild(label('new night', dt));
      var row = el('span', 'hx-row');
      var pk = el('span', 'hx-pk'); var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 520; im.height = 878;
      im.addEventListener('error', function () { im.src = 'assets/cathedral/pack-house.webp'; }, { once: true });
      im.src = 'events/' + e.slug + '/pack.webp'; pk.appendChild(im); row.appendChild(pk);
      var tx = el('span', 'hx-tx');
      tx.appendChild(el('b', '', (e.title || '') + (e.venue ? ' @ ' + e.venue : '')));
      var line = el('span', '', (e.count | 0) + ' frames went up. Were you there?'), go = el('em', '', 'tear the pack →');
      var B = binder(), st = null; try { st = B ? B.night(e.slug) : null; } catch (err) {}
      if (st && st.opened) { line.textContent = st.done ? 'All ' + (e.count | 0) + ' frames are in your binder.' : st.have + ' of ' + (e.count | 0) + ' in your binder.'; go.textContent = st.done ? 'see the night →' : 'rip another →'; }
      tx.appendChild(line); tx.appendChild(go); row.appendChild(tx);
      main.appendChild(row); a.appendChild(main);
      return a;
    }
    function storyCard(list, dt) {
      var box = el('div', 'hx stories');
      box.appendChild(avatar());
      var main = el('div', 'hx-main'); main.appendChild(label(list.length === 1 ? 'new story' : list.length + ' new stories', dt));
      list.slice(0, 3).forEach(function (x) {
        var a = el('a', 'hx-st'); a.href = x.link;
        if (STHUMB.test(x.thumb || '')) { var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 64; im.height = 64;
          im.addEventListener('error', function () { im.remove(); }, { once: true }); im.src = x.thumb; a.appendChild(im); }
        var t = el('span'); t.appendChild(el('b', '', x.title)); if (x.num) t.appendChild(el('small', '', String(x.num).slice(0, 12) + (x.kicker ? ' · ' + String(x.kicker).slice(0, 24) : '')));
        a.appendChild(t); main.appendChild(a);
      });
      box.appendChild(main);
      return box;
    }
    var built = null, placing = false, seenPosts = 0;
    function place(ns, st) {
      // built once, placed again whenever the timeline grows (Show older posts), so the order stays true
      if (built) { slot(); return; }
      var items = [];
      // the newest night is on the dock already
      ns.slice(1).forEach(function (e) { var dt = ymd(e.date); if (dt) items.push({ t: dt.getTime() + 9 * 36e5, kind: 'n', e: e, dt: dt }); });
      var by = {};
      st.forEach(function (x) { var dt = mdy(x.date); if (!dt) return; var k = dt.getTime(); (by[k] = by[k] || { t: k, kind: 's', list: [], dt: dt }).list.push(x); });
      Object.keys(by).forEach(function (k) { items.push(by[k]); });
      items.sort(function (a, b) { return b.t - a.t; });
      built = items.slice(0, HOUSE_CAP).map(function (it) { return { t: it.t, node: it.kind === 'n' ? nightCard(it.e, it.dt) : storyCard(it.list, it.dt) }; });
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
      Promise.all([nights(), stories()]).then(function (got) { try { place(got[0], got[1]); } catch (e) {} });
    }
    go();
    try { new MutationObserver(go).observe(mount, { childList: true }); } catch (e) {}
  }

  /* ---------- the friend space: the roster's own card art, cut small ---------- */
  var FACES = { 'kav-man': 'kavman', 'virgosgateway': 'virgosgateway', 'sinik': 'sinik', 'wrathfol': 'wrathfol', 'theink': 'theink',
                'wunmor': 'wunmor', 'haze-dt': 'hazedt', 'kurlytop': 'kurlytop', 'josh-fuego': 'joshfuego', 'vamppsych': 'vamppsych' };
  function friends() {
    var list = d.querySelectorAll('.friends .creator');
    Array.prototype.forEach.call(list, function (a) {
      var m = /^c\/([a-z0-9-]+)\/$/.exec(a.getAttribute('href') || '');
      var f = m && FACES[m[1]]; if (!f) return;
      var pic = a.querySelector('.creator-pic'); if (!pic) return;
      var probe = new Image();
      probe.onload = function () {
        // the markup sets `background:` inline (the gradient), which resets size and position, so all three go on together
        pic.style.backgroundImage = 'url("assets/cathedral/av/' + f + '.jpg")'; pic.style.backgroundSize = 'cover'; pic.style.backgroundPosition = '50% 20%';
        pic.classList.add('has');
      };
      probe.src = 'assets/cathedral/av/' + f + '.jpg';
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

  /* ---------- the six icons, turning. Wide screens only, and only once the page is settled. ---------- */
  var SLOW = '28deg', FAST = '95deg';
  var UPRIGHT = { home: '0deg 90deg 0deg', stories: '0deg 90deg 0deg' };   // these two meshes came out lying on their backs
  function threeD() {
    var cards = d.querySelectorAll('#hero-hand .hcard');
    if (!cards.length) return;
    if (!w.matchMedia || !w.matchMedia('(min-width:821px)').matches) return;
    if (w.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    if (navigator.connection && navigator.connection.saveData) return;
    var probe = d.createElement('canvas');
    if (!(probe.getContext && (probe.getContext('webgl2') || probe.getContext('webgl')))) return;
    var s = d.createElement('script');
    s.type = 'module';
    s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js';
    s.onerror = function () {};
    d.head.appendChild(s);
    Array.prototype.forEach.call(cards, function (a, i) {
      var k = a.getAttribute('data-tab-link'); if (!/^[a-z]+$/.test(k || '')) return;
      var mv = d.createElement('model-viewer');
      mv.setAttribute('src', 'assets/cathedral/i-' + k + '.glb');
      mv.setAttribute('auto-rotate', ''); mv.setAttribute('auto-rotate-delay', '0'); mv.setAttribute('interaction-prompt', 'none');
      mv.setAttribute('camera-orbit', (i * 55) + 'deg 76deg 100%'); mv.setAttribute('field-of-view', '20deg');
      mv.setAttribute('exposure', '1.15'); mv.setAttribute('shadow-intensity', '0'); mv.setAttribute('aria-hidden', 'true');
      if (UPRIGHT[k]) mv.setAttribute('orientation', UPRIGHT[k]);
      var pace = function () { mv.setAttribute('rotation-per-second', (a.getAttribute('aria-current') === 'page' || a.matches(':hover')) ? FAST : SLOW); };
      mv.addEventListener('load', function () { a.classList.add('m3'); });
      a.addEventListener('mouseenter', pace); a.addEventListener('mouseleave', pace);
      try { new MutationObserver(pace).observe(a, { attributes: true, attributeFilter: ['aria-current'] }); } catch (e) {}
      pace();
      a.appendChild(mv);
    });
  }

  function boot() {
    housePack(); door(); lastNight(); nextUp(); friends(); tipbox(); houseFeed();
    if (d.readyState === 'complete') idle(threeD); else w.addEventListener('load', function () { idle(threeD); }, { once: true });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);
