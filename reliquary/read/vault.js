/* RELIQUARY vault, for the desk's eyes only (11/12, his call: "when I log into my account ... on 0ff the print, I should be
   able to see it"). Source: Drive reliquary/manhwa/_release/site/read/ (release.py copies it here on every sync; edit it there).
   The comics not out yet sit in /reliquary/vault/ ENCRYPTED (AES-256-GCM, made by _release/vault.mjs). This file asks the
   database for the key (vault_key, migration 051: the desk gets it, anybody else gets null) ONLY when a saved login is on the
   phone, then:
     data-mode="shelf"  (the /reliquary/ page): adds the locked comics to the manhwa shelf, marked OFF THE SITE + their Friday
     data-mode="read"   (/reliquary/read/?c=<slug>): opens that comic exactly as its page will look on its Friday
   Strangers never load the database scripts, and the files are ciphertext to anybody without the key. */
(function (w, d) {
  'use strict';
  var me = d.currentScript;
  var MODE = (me && me.getAttribute('data-mode')) || 'shelf';
  var ROOT = (me && me.getAttribute('data-root')) || './';          // the path to /reliquary/ from this page
  var VAULT = ROOT + 'vault/';
  // ⛔ PINNED with SRI, the same file and hash as every page on the site (sealed.js, newstory.py, stamp.py's PIN step)
  var SB_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
  var SB_SRI = 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok';
  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  function hasLogin() {
    try { for (var i = 0; i < w.localStorage.length; i++) if (/^sb-.*-auth-token/.test(w.localStorage.key(i) || '')) return true; } catch (e) {}
    return false;
  }
  function load(src, sri) {
    return new Promise(function (ok, no) {
      var s = d.createElement('script');
      if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; }
      s.src = src; s.onload = ok; s.onerror = no; d.head.appendChild(s);
    });
  }
  function getKey() {
    if (!hasLogin() || !(w.crypto && w.crypto.subtle && w.fetch && w.Promise)) return Promise.resolve(null);
    return (w.OTP_SUPABASE ? Promise.resolve() : load(ROOT + '../supabase-config.js'))
      .then(function () { return (w.supabase && w.supabase.createClient) ? null : load(SB_JS, SB_SRI); })
      .then(function () {
        var C = w.OTP_SUPABASE;
        if (!C || !w.supabase || !w.supabase.createClient) return null;
        return w.supabase.createClient(C.url, C.anonKey).rpc('vault_key', { p_name: 'reliquary' });
      })
      .then(function (r) {
        if (!r || r.error || typeof r.data !== 'string' || !r.data) return null;
        var raw = atob(r.data), u = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
        return w.crypto.subtle.importKey('raw', u, 'AES-GCM', false, ['decrypt']);
      })
      .catch(function () { return null; });
  }
  function open(k, id) {
    return w.fetch(VAULT + id + '.bin', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('vault ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) { return w.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, k, new Uint8Array(buf, 12)); });
  }
  function asText(buf) { return new TextDecoder().decode(buf); }
  function asImage(buf) { return URL.createObjectURL(new Blob([buf], { type: 'image/webp' })); }
  function day(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s;
    return DAYS[new Date(+m[1], +m[2] - 1, +m[3], 12).getDay()] + ' ' + (+m[2]) + '/' + (+m[3]);
  }
  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  // a few at a time, in order, so the top of a page fills first
  function each(list, n, fn) {
    var i = 0;
    function next() { if (i >= list.length) return Promise.resolve(); var j = i++; return Promise.resolve().then(function () { return fn(list[j]); }).catch(function () {}).then(next); }
    var runs = [];
    for (var k = 0; k < Math.min(n, list.length); k++) runs.push(next());
    return Promise.all(runs);
  }

  // the /reliquary/ page: the locked comics join the shelf
  function shelf(k, man) {
    var sec = d.getElementById('manhwa');
    if (!sec) {
      var hero = d.querySelector('header.hero');
      if (!hero || !hero.parentNode) return;
      sec = el('section', 'wrap shelf'); sec.id = 'manhwa';
      sec.appendChild(el('h2', 'band', 'Read the manhwa'));
      sec.appendChild(el('p', 'shelf-intro', 'New chapters on Fridays.'));
      hero.parentNode.insertBefore(sec, hero.nextSibling);
    }
    var intro = sec.querySelector('.shelf-intro');
    var note = el('p', 'vault-note', 'You’re logged in as the desk: the ones marked OFF THE SITE are on your screen only.');
    sec.insertBefore(note, intro ? intro.nextSibling : null);
    var order = man.shelves.map(function (s) { return s[0]; }), covers = [];
    man.shelves.forEach(function (sh) {
      var mine = man.comics.filter(function (c) { return c.shelf === sh[0]; });
      if (!mine.length) return;
      var grp = sec.querySelector('.group[data-shelf="' + sh[0] + '"]');
      if (!grp) {
        grp = el('div', 'group'); grp.setAttribute('data-shelf', sh[0]);
        grp.appendChild(el('h3', null, sh[1]));
        grp.appendChild(el('div', 'cards'));
        var before = null, groups = sec.querySelectorAll('.group[data-shelf]');
        for (var i = 0; i < groups.length; i++) {
          if (order.indexOf(groups[i].getAttribute('data-shelf')) > order.indexOf(sh[0])) { before = groups[i]; break; }
        }
        sec.insertBefore(grp, before);
      }
      var cards = grp.querySelector('.cards');
      mine.forEach(function (c) {
        var a = el('a', 'card vault');
        a.href = ROOT + 'read/?c=' + encodeURIComponent(c.slug);
        a.style.setProperty('--acc', c.acc || '#ffd23f');
        var img = el('img', 'cov'); img.width = 720; img.height = 960; img.alt = c.alt || ''; img.decoding = 'async';
        a.appendChild(img);
        var kk = el('span', 'k');
        if (c.start) { kk.appendChild(el('b', 'start', 'START HERE')); kk.appendChild(d.createTextNode(' ')); }
        kk.appendChild(d.createTextNode(c.kicker));
        a.appendChild(kk);
        a.appendChild(el('span', 't', c.title));
        var m = el('span', 'm');
        m.appendChild(el('b', 'offsite', 'OFF THE SITE'));
        m.appendChild(d.createTextNode(' out ' + day(c.date) + ', noon'));
        a.appendChild(m);
        cards.appendChild(a);
        covers.push([img, c.cover]);
      });
    });
    return each(covers, 3, function (p) { return open(k, p[1]).then(function (b) { p[0].src = asImage(b); }); });
  }

  // /reliquary/read/?c=<slug>: the comic's own page, opened from the vault
  function say(msg) { var p = d.getElementById('vault-msg'); if (p) p.textContent = msg; }
  function read(k, man) {
    var slug = (new URLSearchParams(w.location.search).get('c') || '').toLowerCase();
    var c = man && man.comics.filter(function (x) { return x.slug === slug; })[0];
    if (!c) {   // not in the vault: it's out already (go to its page) or it isn't a comic
      if (man && /^[a-z0-9-]{1,40}$/.test(slug)) { w.location.replace(ROOT + slug + '/'); return; }
      say('This one isn’t out yet. New chapters on Fridays.'); return;
    }
    return open(k, c.page).then(function (buf) {
      var doc = new DOMParser().parseFromString(asText(buf), 'text/html');
      var locked = {};
      man.comics.forEach(function (x) { locked[x.slug] = 1; });
      [].forEach.call(doc.querySelectorAll('a[href]'), function (a) {   // a link to another locked comic stays in the vault
        var m = /^\.\.\/([a-z0-9-]+)\/$/.exec(a.getAttribute('href') || '');
        if (m && locked[m[1]]) a.setAttribute('href', '?c=' + m[1]);
      });
      var imgs = [].slice.call(doc.querySelectorAll('img[src]')).map(function (img) {
        var name = img.getAttribute('src'); img.removeAttribute('src'); return [img, c.files[name]];
      });
      var bar = doc.createElement('div');
      bar.setAttribute('style', 'position:sticky;top:0;z-index:50;padding:9px 14px;padding-top:calc(9px + env(safe-area-inset-top));' +
        'background:#f0030b;color:#fff;font:800 12px/1.3 system-ui,sans-serif;letter-spacing:.12em;text-align:center;border-bottom:3px solid #000');
      bar.textContent = 'ONLY YOU CAN SEE THIS · OFF THE SITE TILL ' + day(c.date) + ', NOON';
      doc.body.insertBefore(bar, doc.body.firstChild);
      d.title = doc.title;
      var shell = d.getElementById('vault-shell');
      if (shell) shell.parentNode.removeChild(shell);
      [].forEach.call(doc.head.querySelectorAll('style, meta[name="theme-color"]'), function (s) { d.head.appendChild(d.importNode(s, true)); });
      d.documentElement.lang = doc.documentElement.lang || 'en';
      d.body.parentNode.replaceChild(d.adoptNode(doc.body), d.body);
      w.scrollTo(0, 0);
      return each(imgs, 3, function (p) { if (!p[1]) return; return open(k, p[1]).then(function (b) { p[0].src = asImage(b); }); });
    });
  }

  function start() {
    getKey().then(function (k) {
      if (!k) { if (MODE === 'read') say('This one isn’t out yet. New chapters on Fridays.'); return; }
      return open(k, 'index').then(function (buf) {
        var man = JSON.parse(asText(buf));
        return MODE === 'read' ? read(k, man) : shelf(k, man);
      }, function () {   // no vault on the site (every comic is out): the reader sends a comic to its own page
        if (MODE === 'read') read(k, { comics: [], shelves: [] });
      });
    }).catch(function () { if (MODE === 'read') say('That didn’t open. Try again in a second.'); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})(window, document);
