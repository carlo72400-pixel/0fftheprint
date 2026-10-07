/* THE LOUNGE WAKES UP (10/7). His picks off the list: "Wake up the lounge", "Live photo wall", "Lounge jukebox".
 *
 *   1. THE LOUNGE: the five girls on the couches can be tapped. Each says one line in her own voice
 *      (the RELIQUARY bible's Speech lines where one is locked: Kuro, Putty, Cinder; Lena and Nyx stay
 *      inside their Read until he locks theirs) and opens a door to something live on the site.
 *      Phones in their hands and the candle stands glow; after dark on the visitor's clock the room breathes.
 *   2. THE CONTACT SHEET (#frames): real frames from every night, dealt at random, one swapping every few
 *      seconds. Tap one and it comes up big and goes into the binder; "See the whole night" lands on that
 *      frame (sealed.js reads #f<N>). The data is content/frames.json (framewall.py), hit frames left out.
 *   3. THE JUKEBOX: a record in the corner of the lounge. Tap it and the rotation plays in a bar that stays
 *      on screen across the tabs (Spotify's embed: previews when logged out, full tracks when logged in).
 *
 * Everything here fails quiet: no script, no data or no Spotify, and the page is what it was before.
 * ⛔ The OC tap boxes are percentages of the two lounge plates (hero.webp 2400x1339, hero-m.webp 1080x1935).
 *    Redraw a plate and the boxes have to move with it. ⛔ Run stamp.py after editing this file.
 */
(function (w, d) {
  'use strict';
  var hero = d.getElementById('hero');
  var REDUCED = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var cache = {};
  function getJSON(url) {
    if (!cache[url]) cache[url] = fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return cache[url];
  }
  function store(k, v) { try { if (v === undefined) return w.localStorage.getItem(k); w.localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ================= 1. THE LOUNGE ================= */
  // boxes and heads in percent of each plate: [x0, y0, x1, y1] and [x, y]
  var PLATES = {
    wide: { w: 2400, h: 1339,
      oc: { lena: [30.6, 66, 37.2, 99], kuro: [37.2, 66, 42.6, 99], nyx: [42.6, 77, 59.5, 91.5], putty: [56.5, 79, 67.4, 99.5], cinder: [64.6, 66, 75.6, 97] },
      head: { lena: [34.6, 69.5], kuro: [39.6, 69], nyx: [45.2, 80], putty: [63.6, 82.5], cinder: [68.8, 70] },
      glow: [[36.9, 75.8, 'ph', 16], [48.2, 80.9, 'ph', 16], [21.7, 80.6, 'cn', 30], [79.4, 80.6, 'cn', 30]] },
    tall: { w: 1080, h: 1935,
      oc: { lena: [14, 63.5, 25.5, 85], kuro: [25.5, 63, 34.8, 85], nyx: [35.5, 68.5, 55.5, 77.5], putty: [57, 72, 83, 86], cinder: [80.5, 61.5, 97.5, 80] },
      head: { lena: [21.5, 66], kuro: [28.3, 65], nyx: [41, 71.2], putty: [75, 75], cinder: [87.5, 64.5] },
      glow: [[25.3, 69.6, 'ph', 14], [47.1, 72.6, 'ph', 14], [8.2, 70.2, 'cn', 24]] }
  };
  var CAST = [
    { k: 'lena', name: 'Lena', lines: [['Every frame in here is real. I checked.', 'night'], ['{n} frames from {night}. Not one fake.', 'night'], ['I know a fake from across the room. Find yourself in these.', 'sheet']] },
    { k: 'kuro', name: 'Kuro', lines: [['Next one. Be outside.', 'next'], ['You coming or what.', 'next']] },
    { k: 'nyx', name: 'Nyx', lines: [['I cut the tape already. You are welcome.', 'tape'], ['Smile. I am always recording.', 'sheet']] },
    { k: 'putty', name: 'Putty', lines: [['Gimme a T. Gimme an E. Gimme an A. New story. Yay.', 'story'], ['Two, four, six, eight. Who did we spot. Read it. Go team.', 'story']] },
    { k: 'cinder', name: 'Cinder', lines: [['Put on a record, child. The night is bussin.', 'radio'], ['Speak. What did you see. It stays between us.', 'tip']] }
  ];
  var LIVE = { night: null, story: null };
  function live() {
    if (live.p) return live.p;
    live.p = Promise.all([getJSON('events/events.json'), getJSON('content/desk.json')]).then(function (r) {
      var ev = r[0] && Array.isArray(r[0].items) && r[0].items[0];
      if (ev && /^[a-z0-9-]{4,80}$/.test(ev.slug || '')) LIVE.night = { slug: ev.slug, title: String(ev.title || 'the last night'), n: ev.count | 0 };
      var st = r[1] && Array.isArray(r[1].items) && r[1].items.filter(function (x) { return /^word\/[a-z0-9-]+\/$/.test(x.link || ''); })[0];
      if (st) LIVE.story = { href: st.link, title: String(st.title || 'the new story') };
    });
    return live.p;
  }
  function door(kind) {
    var n = LIVE.night, s = LIVE.story;
    if (kind === 'night' && n) return { href: 'events/' + n.slug + '/#rip', label: 'Tear open ' + n.title + ' →' };
    if (kind === 'night') return { href: 'events/', label: 'Every night we shot →' };
    if (kind === 'story' && s) return { href: s.href, label: 'Read ' + s.title + ' →' };
    if (kind === 'story') return { href: '#stories', label: 'Read the stories →' };
    if (kind === 'next') {
      var a = d.getElementById('do-next'), h = a && a.getAttribute('href');
      return { href: h && h !== '#' ? h : 'wall/#cal', label: 'See the date →' };
    }
    if (kind === 'tape') return { href: 'video/', label: 'Watch the tape →' };
    if (kind === 'sheet') return { act: 'sheet', label: 'Find yourself ↓' };
    if (kind === 'radio') return { act: 'radio', label: 'Put a record on' };
    return { href: '#take', label: 'Tell the desk →' };
  }
  function fill(line) {
    var n = LIVE.night;
    return line.replace('{n}', n && n.n ? String(n.n) : 'All these').replace('{night}', n ? n.title : 'the last night');
  }

  var layer, say, boxes = {}, glows = [], turn = {}, current = null;
  function geometry() {
    var cs = w.getComputedStyle(hero), tall = /hero-m\.webp/.test(cs.backgroundImage || ''), P = tall ? PLATES.tall : PLATES.wide;
    var W = hero.clientWidth, H = hero.clientHeight, sz = cs.backgroundSize || 'cover';
    var scale = /^100%/.test(sz) ? W / P.w : Math.max(W / P.w, H / P.h);
    var dw = P.w * scale, dh = P.h * scale;
    var pos = (cs.backgroundPosition || '50% 50%').split(/\s+/);
    var px = (parseFloat(pos[0]) || 50) / 100, py = (parseFloat(pos[1]) || 50) / 100;
    var ox = (W - dw) * px, oy = (H - dh) * py;
    return { P: P, W: W, H: H, at: function (x, y) { return [ox + dw * x / 100, oy + dh * y / 100]; } };
  }
  function place() {
    if (!layer || !hero.offsetWidth) return;
    var g = geometry();
    CAST.forEach(function (c) {
      var b = boxes[c.k], r = g.P.oc[c.k]; if (!b || !r) return;
      var a = g.at(r[0], r[1]), z = g.at(r[2], r[3]);
      var x0 = Math.max(0, a[0]), y0 = Math.max(0, a[1]), x1 = Math.min(g.W, z[0]), y1 = Math.min(g.H, z[1]);
      var off = x1 - x0 < 12 || y1 - y0 < 12;
      b.hidden = off;
      b.style.left = x0 + 'px'; b.style.top = y0 + 'px'; b.style.width = (x1 - x0) + 'px'; b.style.height = (y1 - y0) + 'px';
      var hd = g.at(g.P.head[c.k][0], g.P.head[c.k][1]);
      b._head = hd;
      b.firstChild.style.left = (hd[0] - x0) + 'px'; b.firstChild.style.top = Math.max(-2, hd[1] - y0 - 26) + 'px'; b.firstChild.style.marginLeft = '-4.5px';
    });
    glows.forEach(function (gl) { gl.remove(); }); glows = [];
    g.P.glow.forEach(function (q) {
      var p = g.at(q[0], q[1]); if (p[0] < 0 || p[1] < 0 || p[0] > g.W || p[1] > g.H) return;
      var s = el('i', 'lg-glow' + (q[2] === 'cn' ? ' cn' : ''));
      s.style.left = p[0] + 'px'; s.style.top = p[1] + 'px'; s.style.setProperty('--s', Math.round(q[3] * Math.max(.75, Math.min(1.6, g.W / 1200))) + 'px');
      layer.appendChild(s); glows.push(s);
    });
    if (current && !say.hidden) aim(current);
  }
  function aim(c) {
    var b = boxes[c.k]; if (!b || !b._head) return;
    var W = hero.clientWidth, H = hero.clientHeight, bw = say.offsetWidth || 280, bh = say.offsetHeight || 120, hd = b._head;
    var left = Math.max(10, Math.min(W - bw - 10, hd[0] - bw / 2)), top = hd[1] - bh - 30, below = false;
    if (top < 8) { top = Math.min(H - bh - 8, hd[1] + 20); below = true; }
    say.style.left = left + 'px'; say.style.top = Math.max(8, top) + 'px';
    say.style.setProperty('--tail', Math.max(14, Math.min(bw - 14, hd[0] - left)) + 'px');
    say.classList.toggle('below', below);
  }
  function speak(c) {
    live().then(function () {
      var i = (turn[c.k] | 0) % c.lines.length; turn[c.k] = i + 1;
      var line = c.lines[i], go = door(line[1]);
      say.textContent = '';
      say.appendChild(el('b', '', c.name));
      say.appendChild(el('q', '', fill(line[0])));
      var act;
      if (go.href) { act = el('a', '', go.label); act.href = go.href; }
      else { act = el('button', 'go', go.label); act.type = 'button'; act.dataset.act = go.act; }
      say.appendChild(act);
      var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); say.appendChild(x);
      say.hidden = false; current = c;
      Object.keys(boxes).forEach(function (k) { boxes[k].classList.toggle('on', k === c.k); });
      aim(c);
      setTimeout(function () { say.classList.add('open'); }, 20);
      clearTimeout(speak.t); speak.t = setTimeout(hush, 12000);
      if (!hero.classList.contains('lg-met')) { hero.classList.add('lg-met'); store('otp-lounge-met', '1'); }
    });
  }
  function hush() {
    if (!say || say.hidden) return;
    say.classList.remove('open'); current = null;
    Object.keys(boxes).forEach(function (k) { boxes[k].classList.remove('on'); });
    setTimeout(function () { if (!say.classList.contains('open')) say.hidden = true; }, 220);
  }
  function lounge() {
    if (!hero || !d.documentElement.classList.contains('cath')) return;
    layer = el('div', 'lg-layer');
    CAST.forEach(function (c) {
      var b = el('button', 'lg-oc'); b.type = 'button'; b.setAttribute('aria-label', 'Talk to ' + c.name);
      b.appendChild(el('i'));
      b.addEventListener('click', function (e) { e.stopPropagation(); if (current === c && !say.hidden) { speak(c); return; } speak(c); });
      boxes[c.k] = b; layer.appendChild(b);
    });
    hero.appendChild(layer);
    say = el('div', 'lg-say'); say.hidden = true; say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite');
    say.addEventListener('click', function (e) {
      var t = e.target;
      if (t.classList.contains('x')) { hush(); return; }
      if (t.dataset && t.dataset.act === 'radio') { hush(); radio(); return; }
      if (t.dataset && t.dataset.act === 'sheet') { hush(); var s = d.getElementById('frames'); if (s && !s.hidden) s.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); return; }
      if (t.tagName === 'A') hush();
    });
    hero.appendChild(say);
    d.addEventListener('click', function (e) { if (say && !say.hidden && !say.contains(e.target) && !e.target.closest('.lg-oc')) hush(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') hush(); });
    if (store('otp-lounge-met') === '1') hero.classList.add('lg-met');
    // after dark on the visitor's own clock
    function clock() { var h = new Date().getHours(); hero.classList.toggle('lg-dark', h >= 19 || h < 6); }
    clock(); setInterval(clock, 300000);
    place();
    var rt; w.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(place, 120); });
    try { new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(place, 120); }).observe(hero); } catch (e) {}
    // the deck sits in the lounge too
    var deck = el('button', 'lg-deck'); deck.type = 'button'; deck.setAttribute('aria-label', 'Play the lounge radio');
    deck.appendChild(el('i', 'lg-vinyl')); deck.appendChild(el('span', '', 'Lounge radio'));
    deck.addEventListener('click', function (e) { e.stopPropagation(); radio(); });
    hero.appendChild(deck); JB.deck = deck;
    live();
  }

  /* ================= 2. THE CONTACT SHEET ================= */
  var FR = { data: null, flat: [], tiles: [], box: null, cur: null, timer: 0, seen: false };
  function frameOf(k) { var a = FR.flat[k]; return { nt: FR.data.nights[a[0]], f: FR.data.nights[a[0]].f[a[1]], k: k }; }
  function thumbOf(x) { return 'events/' + x.nt.s + '/media/' + x.f[1] + '_t.jpg'; }
  function bigOf(x) { return x.f[4] || (x.nt.b + x.f[1] + '.jpg'); }
  function shownSet() { var s = {}; FR.tiles.forEach(function (t) { s[t._k] = 1; }); return s; }
  function pick(avoid) {
    for (var tries = 0; tries < 40; tries++) { var k = Math.floor(Math.random() * FR.flat.length); if (!avoid[k]) return k; }
    return Math.floor(Math.random() * FR.flat.length);
  }
  function haveMark(t) {
    var B = w.OTPBinder, x = frameOf(t._k);
    try { t.classList.toggle('have', !!(B && B.has(x.nt.s, x.f[0]))); } catch (e) {}
  }
  function setTile(t, k, deal, i) {
    t._k = k; var x = frameOf(k);
    var im = t.querySelector('img');
    var nim = el('img'); nim.alt = 'A frame from ' + x.nt.t; nim.decoding = 'async'; nim.loading = 'lazy'; nim.src = thumbOf(x);
    if (deal) { t.classList.remove('deal'); void t.offsetWidth; t.style.setProperty('--dl', (i * 0.045) + 's'); t.classList.add('deal'); }
    if (im && !deal && !REDUCED) {
      nim.className = 'out'; t.appendChild(nim);
      nim.addEventListener('load', function () { nim.classList.remove('out'); setTimeout(function () { if (im.parentNode) im.remove(); }, 650); }, { once: true });
    } else { if (im) im.remove(); t.appendChild(nim); }
    t.setAttribute('aria-label', x.nt.t + ', frame ' + (x.f[0] + 1));
    haveMark(t);
  }
  function deal() {
    var avoid = {};
    FR.tiles.forEach(function (t, i) { var k = pick(avoid); avoid[k] = 1; setTile(t, k, true, i); });
  }
  function count() { return w.matchMedia && w.matchMedia('(max-width: 820px)').matches ? 8 : 12; }
  function sheet() {
    var sec = d.getElementById('frames'), grid = d.getElementById('fr-grid');
    if (!sec || !grid) return;
    function boot() {
      getJSON('content/frames.json').then(function (data) {
        if (!data || !Array.isArray(data.nights) || !data.nights.length) return;
        FR.data = data;
        data.nights.forEach(function (nt, ni) { (nt.f || []).forEach(function (f, fi) { FR.flat.push([ni, fi]); }); });
        if (FR.flat.length < 12) return;
        for (var i = 0; i < count(); i++) {
          var t = el('button', 'fr-t'); t.type = 'button'; FR.tiles.push(t); grid.appendChild(t);
        }
        deal();
        var foot = d.getElementById('fr-foot');
        if (foot) { foot.textContent = ''; foot.appendChild(el('b', '', String(data.total || FR.flat.length))); foot.appendChild(d.createTextNode(' frames from ')); foot.appendChild(el('b', '', String(data.nights.length))); foot.appendChild(d.createTextNode(' nights · tap one, it goes in your binder')); }
        sec.hidden = false;
        grid.addEventListener('click', function (e) { var t = e.target.closest('.fr-t'); if (t) show(t._k); });
        var dl = d.getElementById('fr-deal'); if (dl) dl.addEventListener('click', deal);
        // alive: one tile turns over every few seconds, only while you can see it
        var io;
        try { io = new IntersectionObserver(function (es) { FR.seen = es[0].isIntersecting; }, { threshold: 0.2 }); io.observe(grid); } catch (e) { FR.seen = true; }
        if (!REDUCED) FR.timer = setInterval(function () {
          if (!FR.seen || d.hidden || (FR.box && !FR.box.hidden)) return;
          var t = FR.tiles[Math.floor(Math.random() * FR.tiles.length)];
          setTile(t, pick(shownSet()), false, 0);
        }, 3200);
        try { w.OTPBinder && w.OTPBinder.on && w.OTPBinder.on(function () { FR.tiles.forEach(haveMark); }); } catch (e) {}
      });
    }
    // after the page has settled: the index is ~5 KB, and the thumbs are lazy so only the ones on screen load
    var idle = w.requestIdleCallback || function (f) { return setTimeout(f, 700); };
    if (d.readyState === 'complete') idle(boot); else w.addEventListener('load', function () { idle(boot); }, { once: true });
  }
  function show(k) {
    var x = frameOf(k), B = w.OTPBinder;
    if (!FR.box) {
      var box = el('div', 'fr-box'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'A frame');
      box.innerHTML = '<div class="fr-card"><button type="button" class="fr-x" aria-label="Close">×</button><div class="fr-pic"><img alt=""></div>' +
        '<div class="fr-cap"><b></b><small></small><em hidden></em><div class="fr-acts"><a href="#">See the whole night →</a><button type="button" class="fr-again">Another one</button></div></div></div>';
      box.addEventListener('click', function (e) {
        if (e.target === box || e.target.classList.contains('fr-x')) hide();
        else if (e.target.classList.contains('fr-again')) show(pick(shownSet()));
      });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && FR.box && !FR.box.hidden) hide(); });
      d.body.appendChild(box); FR.box = box;
    }
    var bx = FR.box, img = bx.querySelector('.fr-pic img');
    img.src = thumbOf(x); img.alt = 'A frame from ' + x.nt.t;
    var big = new Image(); big.onload = function () { if (FR.cur === k) img.src = big.src; }; big.src = bigOf(x);
    FR.cur = k;
    bx.querySelector('.fr-cap b').textContent = x.nt.t;
    bx.querySelector('.fr-cap small').textContent = [x.nt.v, x.nt.d, 'frame ' + (x.f[0] + 1) + ' of ' + x.nt.n].filter(Boolean).join(' · ');
    bx.querySelector('.fr-acts a').href = 'events/' + x.nt.s + '/#f' + (x.f[0] + 1);
    var tag = bx.querySelector('.fr-cap em'), isNew = false;
    try { isNew = !!(B && B.add(x.nt.s, x.f[0], { total: x.nt.n })); } catch (e) {}
    if (B) {
      var st = {}; try { st = B.night(x.nt.s) || {}; } catch (e) {}
      tag.hidden = false; tag.className = isNew ? '' : 'old';
      tag.textContent = (isNew ? 'New in your binder' : 'Already in your binder') + (st.total ? ' · ' + st.have + ' of ' + st.total : '');
    } else tag.hidden = true;
    bx.hidden = false; d.documentElement.style.overflow = 'hidden';
    setTimeout(function () { bx.classList.add('open'); }, 20);
    var x0 = bx.querySelector('.fr-x'); try { x0.focus({ preventScroll: true }); } catch (e) {}
  }
  function hide() {
    var bx = FR.box; if (!bx) return;
    bx.classList.remove('open'); d.documentElement.style.overflow = ''; FR.cur = null;
    setTimeout(function () { bx.hidden = true; }, 200);
    FR.tiles.forEach(haveMark);
  }

  /* ================= 3. THE JUKEBOX ================= */
  var JB = { tracks: null, i: 0, ctrl: null, bar: null, deck: null, playing: false, adv: false };
  function trackId(link) { var m = /track\/([A-Za-z0-9]{22})/.exec(link || ''); return m ? m[1] : null; }
  function spotify() {
    // the homepage's own loader when it is up (it owns window.onSpotifyIframeApiReady); our own when nobody loaded it yet
    return new Promise(function (resolve) {
      if (w.OTPSpotifyApi) { w.OTPSpotifyApi().then(resolve); return; }
      if (d.querySelector('script[src*="open.spotify.com/embed/iframe-api"]')) {
        var t0 = Date.now(), iv = setInterval(function () {
          if (w.OTPSpotifyApi) { clearInterval(iv); w.OTPSpotifyApi().then(resolve); }
          else if (Date.now() - t0 > 8000) { clearInterval(iv); resolve(null); }
        }, 150);
        return;
      }
      var done = false, fin = function (v) { if (!done) { done = true; resolve(v); } };
      w.onSpotifyIframeApiReady = function (API) { fin(API); };
      var sc = d.createElement('script'); sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.onerror = function () { fin(null); };
      d.head.appendChild(sc); setTimeout(function () { fin(null); }, 8000);
    });
  }
  function spin(on) {
    JB.playing = on;
    var vs = d.querySelectorAll('.lg-vinyl');
    for (var i = 0; i < vs.length; i++) vs[i].classList.toggle('spin', on);
    if (JB.deck) JB.deck.classList.toggle('on', on);
  }
  function label() {
    var t = JB.tracks[JB.i], b = JB.bar && JB.bar.querySelector('.lg-now b');
    if (b) b.textContent = 'Lounge radio · ' + (JB.i + 1) + ' of ' + JB.tracks.length + (t && t.artist ? ' · ' + t.artist : '');
  }
  function load(i, play) {
    JB.i = (i + JB.tracks.length) % JB.tracks.length; JB.adv = false; label();
    var id = JB.tracks[JB.i].id;
    if (JB.ctrl) { try { JB.ctrl.loadUri('spotify:track:' + id); if (play) JB.ctrl.play(); } catch (e) {} return; }
    var host = JB.bar.querySelector('.lg-embed');
    host.innerHTML = '<iframe src="https://open.spotify.com/embed/track/' + id + '?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media" loading="lazy" title="Lounge radio"></iframe>';
  }
  function bar() {
    if (JB.bar) return JB.bar;
    var b = el('div', 'lg-bar'); b.hidden = true; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Lounge radio');
    b.innerHTML = '<i class="lg-vinyl"></i><div class="lg-now"><b>Lounge radio</b><div class="lg-embed"><div></div></div></div>' +
      '<div class="lg-btns"><button type="button" class="nx" aria-label="Next record">⏭</button><button type="button" class="cl" aria-label="Turn the radio off">×</button></div>';
    b.querySelector('.nx').addEventListener('click', function () { load(JB.i + 1, true); });
    b.querySelector('.cl').addEventListener('click', function () {
      try { JB.ctrl && JB.ctrl.pause(); } catch (e) {}
      spin(false); b.classList.remove('open'); setTimeout(function () { b.hidden = true; }, 220);
    });
    d.body.appendChild(b); JB.bar = b;
    return b;
  }
  function radio() {
    getJSON('content/rotation.json').then(function (r) {
      var items = (r && (Array.isArray(r) ? r : r.items)) || [];
      if (!JB.tracks) JB.tracks = items.map(function (t) { return { id: trackId(t.link), title: t.title, artist: t.artist }; }).filter(function (t) { return t.id; });
      if (!JB.tracks.length) return;
      var b = bar();
      b.hidden = false; setTimeout(function () { b.classList.add('open'); }, 20);
      if (JB.ctrl) { try { JB.ctrl.play(); } catch (e) {} return; }
      if (b._booting) return; b._booting = true;
      if (JB.i === 0) JB.i = Math.floor(Math.random() * JB.tracks.length);
      label();
      spotify().then(function (API) {
        if (!API) { load(JB.i, false); return; }
        var host = b.querySelector('.lg-embed > div');
        API.createController(host, { uri: 'spotify:track:' + JB.tracks[JB.i].id, width: '100%', height: 80 }, function (ctrl) {
          JB.ctrl = ctrl;
          var played = false, go = function () { if (played) return; played = true; try { ctrl.play(); } catch (e) {} };
          try { ctrl.addListener('ready', go); } catch (e) {}
          setTimeout(go, 1200);
          ctrl.addListener('playback_update', function (e) {
            var x = e && e.data; if (!x) return;
            spin(x.isPaused === false);
            // the end of a record: the next one drops on its own
            if (!x.isPaused && x.duration && x.position >= x.duration - 700 && !JB.adv) { JB.adv = true; setTimeout(function () { load(JB.i + 1, true); }, 400); }
          });
        });
      });
    });
  }

  function start() { try { lounge(); } catch (e) {} try { sheet(); } catch (e) {} }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
  w.OTPLounge = { radio: radio };
})(window, document);
