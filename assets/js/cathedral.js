/* 0FF THE PRINT — THE CATHEDRAL, the moving parts (10/3).
 *
 * The lounge up top, the last night it points at, the friend space, the tip box,
 * which house pack is on the shelf today, and the six tab icons turning in 3D on
 * a wide screen.
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
  var THUMB = /^[a-z0-9][a-z0-9-]{0,80}\/media\/[A-Za-z0-9_.-]{1,60}$/;
  var MEDIA = /^media\/[A-Za-z0-9_.-]{1,60}$/;
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function idle(fn) { (w.requestIdleCallback || function (f) { return setTimeout(f, 600); })(fn, { timeout: 2500 }); }

  /* ---------- the last night: the beacon by the window, and the strip over the timeline ---------- */
  function lastNight() {
    var beacon = d.getElementById('hero-beacon'), blast = d.getElementById('night-blast');
    var seen = d.getElementById('bc-seen');
    if (!beacon && !blast && !seen) return;
    fetch('events/events.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var items = ((j && j.items) || []).filter(function (e) { return e && SLUG.test(e.slug || '') && (e.count | 0) > 0; });
        items.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        var e = items[0]; if (!e) return;
        var href = 'events/' + e.slug + '/';
        var where = [e.venue, e.date_short].filter(Boolean).join(' · ');
        if (seen) {
          seen.textContent = '';
          var sa = el('a', '', (e.title || 'last night') + (e.venue ? ' · ' + e.venue : ''));
          sa.href = href; seen.appendChild(sa);
        }
        if (beacon) {
          beacon.href = href;
          var t = d.getElementById('hb-title'), m = d.getElementById('hb-meta');
          if (t) t.textContent = e.title || '';
          if (m) m.textContent = where + ' · ' + (e.count | 0) + ' frames';
          beacon.hidden = false;
        }
        if (blast) {
          blast.textContent = '';
          blast.href = href;
          var h = el('span', 'nb-h'); h.appendChild(el('span', '', 'NEW NIGHT IS UP')); h.appendChild(el('span', '', e.date_short || ''));
          var ph = el('span', 'nb-ph');
          var tx = el('span', 'nb-tx');
          tx.appendChild(el('b', '', (e.title || '') + (e.venue ? ' @ ' + e.venue : '')));
          tx.appendChild(el('span', '', (e.count | 0) + ' frames went up. Were you there? Who did you see?'));
          tx.appendChild(el('em', '', 'tear the pack →'));
          blast.appendChild(h); blast.appendChild(ph); blast.appendChild(tx);
          function addPic(src) {
            var im = d.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 74; im.height = 74;
            im.addEventListener('error', function () { im.remove(); if (!ph.children.length) ph.remove(); });
            im.src = src; ph.appendChild(im);
          }
          if (THUMB.test(e.cover || '')) addPic('events/' + e.cover);
          blast.hidden = false;
          // two more frames off the night's own list, when the browser has a quiet moment
          idle(function () {
            fetch('events/' + e.slug + '/data.json')
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (dj) {
                var media = ((dj && dj.media) || []).filter(function (x) { return x && MEDIA.test(x.thumb || ''); });
                var n = media.length; if (n < 3) return;
                var cover = String(e.cover || '').split('/').pop();
                [Math.floor(n / 3), Math.floor((2 * n) / 3)].forEach(function (i) {
                  var th = media[i].thumb;
                  if (th.split('/').pop() === cover) th = media[(i + 1) % n].thumb;
                  if (ph.parentNode && ph.children.length < 3) addPic('events/' + e.slug + '/' + th);
                });
              }).catch(function () {});
          });
        }
      }).catch(function () {});
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

  /* ---------- the tip box: it opens their own mail app, nothing is sent from here ---------- */
  function tipbox() {
    var ta = d.getElementById('tip-text'), btn = d.getElementById('tip-send');
    if (!ta || !btn) return;
    btn.addEventListener('click', function () {
      var v = String(ta.value || '').trim();
      if (!v) { ta.focus(); return; }
      w.location.href = 'mailto:offtheprintcollective@gmail.com?subject=' + encodeURIComponent('Tip for the desk') +
        '&body=' + encodeURIComponent(v.slice(0, 1800));
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
    housePack(); lastNight(); friends(); tipbox();
    if (d.readyState === 'complete') idle(threeD); else w.addEventListener('load', function () { idle(threeD); }, { once: true });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);
