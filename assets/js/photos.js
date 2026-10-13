/* THE PHOTOS TAB (10/11). His picks off the brainstorm: find yourself by room or date, the pack game, the craft,
 * housekeeping, the wildcards.
 *
 *   FIND YOURSELF   pick a room, a month or one of the last nights, and THE SET LIST shows those packs. Every night
 *                   is a pack tile with where this phone stands on it (the binder: sealed, opened n of N, hit found,
 *                   complete). Tap = the night's gallery. The binder line counts the lot. The last line goes to
 *                   events/, every night in one list (Wave 2: Home's Drops rail is gone, this is the way there).
 *   ARTIST PACKS    packs made by the house and its artists (packs_list, migration 037): the shelf, Make a pack.
 *   THE LOOKS       nights printed more than one way (content/looks.json, looks.py): one frame, two prints, a handle
 *                   to drag between them, chips for the other prints. Credits under each.
 *   THE TAPE        pills over the rail: all, or one source at a time (video.json `from`).
 *   THE MAP         every room we shot, pinned (content/rooms.json), nights in the popup. Leaflet, loaded only when
 *                   the map scrolls near. Homes and private spaces sit on the city, never an address.
 *   TAKE IT DOWN    anyone in a frame asks for it to come down: opens mail, nothing stored here.
 *
 * Everything fails quiet. ⛔ Run stamp.py after editing. ⛔ No em dashes in copy. ⛔ No arch shapes.
 */
(function (w, d) {
  'use strict';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tight(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function ymd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function head(sec, title, accent, sub) { sec.appendChild(el('div', 'section-head', '<h2>' + esc(title) + (accent ? ' <span class="accent">' + esc(accent) + '</span>' : '') + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : ''))); }
  function member() { return d.documentElement.getAttribute('data-door') === 'in'; }
  function slugOk(s) { return /^[a-z0-9][a-z0-9-]{0,80}$/.test(String(s || '')); }
  var NIGHTS = [];

  /* ================= FIND YOURSELF + THE SET LIST ================= */
  function setList() {
    var sec = d.getElementById('find'); if (!sec) return;
    if (!NIGHTS.length) { sec.remove(); return; }
    head(sec, 'Find Yourself', 'by room or by date', 'every night we shot is a sealed pack · pick yours · tear it open');
    var bar = el('div', 'ph-bar');
    var rooms = [], months = [], seenR = {}, seenM = {};
    NIGHTS.forEach(function (n) {
      String(n.venue || '').split('·').map(function (v) { return v.trim(); }).filter(Boolean).forEach(function (v) { if (!seenR[tight(v)]) { seenR[tight(v)] = 1; rooms.push(v); } });
      var dt = ymd(n.date); if (dt) { var k = dt.getFullYear() + '-' + dt.getMonth(); if (!seenM[k]) { seenM[k] = 1; months.push({ k: k, l: MONTHS[dt.getMonth()] + ' ' + dt.getFullYear() }); } }
    });
    rooms.sort(function (a, b) { return a.localeCompare(b); });
    bar.innerHTML = '<label>Room<select data-k="room"><option value="">Every room</option>' + rooms.map(function (r) { return '<option value="' + esc(tight(r)) + '">' + esc(r) + '</option>'; }).join('') + '</select></label>' +
      '<label>Month<select data-k="month"><option value="">Every month</option>' + months.map(function (m) { return '<option value="' + esc(m.k) + '">' + esc(m.l) + '</option>'; }).join('') + '</select></label>' +
      '<div class="ph-chips">' + NIGHTS.slice(0, 5).map(function (n) { var dt = ymd(n.date); return '<button type="button" class="ph-chip" data-slug="' + esc(n.slug) + '">' + esc(n.title) + '<span>' + (dt ? MON[dt.getMonth()] + ' ' + dt.getDate() : '') + '</span></button>'; }).join('') + '</div>';
    sec.appendChild(bar);
    var line = el('p', 'ph-binder'); sec.appendChild(line);
    var grid = el('div', 'ph-set'); sec.appendChild(grid);
    var none = el('p', 'ph-none', 'Nothing shot there that month. Yet.'); none.hidden = true; sec.appendChild(none);
    // the last line (Wave 2, call 4): the Drops rail came off Home, so this is the way to the whole list of nights
    sec.appendChild(el('div', 'ph-all', '<a class="drops-more" href="events/">Every night, one list &rarr;</a>'));
    var state = { room: '', month: '', slug: '' };
    function stateOf(slug) { try { return (w.OTPBinder && w.OTPBinder.night) ? w.OTPBinder.night(slug) : null; } catch (e) { return null; } }
    function tile(n) {
      var dt = ymd(n.date), st = stateOf(n.slug) || {};
      var a = el('a', 'ph-pack' + (st.done ? ' done' : st.hit ? ' hit' : st.opened ? ' open' : ' sealed'));
      a.href = 'events/' + encodeURIComponent(n.slug) + '/'; a.dataset.slug = n.slug;
      var badge = st.done ? 'Complete' : st.hit ? 'Hit found · ' + st.have + ' / ' + st.total : st.opened ? 'Opened · ' + st.have + ' / ' + st.total : 'Sealed';
      a.innerHTML = '<span class="ph-pack-img"><img src="events/' + esc(n.slug) + '/pack.webp" alt="" width="520" height="878" loading="lazy" decoding="async"><span class="ph-badge">' + esc(badge) + '</span></span>' +
        '<b>' + esc(n.title) + '</b><span>' + esc(n.venue || '') + (dt ? ' · ' + MON[dt.getMonth()] + ' ' + dt.getDate() : '') + ' · ' + (n.count | 0) + ' frames</span>';
      return a;
    }
    function paint() {
      grid.innerHTML = '';
      var list = NIGHTS.filter(function (n) {
        if (state.slug) return n.slug === state.slug;
        if (state.room && !String(n.venue || '').split('·').some(function (v) { return tight(v) === state.room; })) return false;
        if (state.month) { var dt = ymd(n.date); if (!dt || (dt.getFullYear() + '-' + dt.getMonth()) !== state.month) return false; }
        return true;
      });
      list.forEach(function (n) { grid.appendChild(tile(n)); });
      none.hidden = list.length > 0;
      bar.querySelectorAll('.ph-chip').forEach(function (c) { c.classList.toggle('on', c.dataset.slug === state.slug); });
      var t = null; try { t = w.OTPBinder && w.OTPBinder.totals ? w.OTPBinder.totals() : null; } catch (e) {}
      line.innerHTML = t && t.frames ? 'Your binder: <b>' + t.frames + '</b> frames · <b>' + t.hits + '</b> ' + (t.hits === 1 ? 'hit' : 'hits') + ' · <b>' + t.opened + '</b> of ' + NIGHTS.length + ' packs opened' + (t.done ? ' · <b>' + t.done + '</b> complete' : '') + ' <button type="button" class="ph-link" data-binder>Open the binder</button>'
        : 'Your binder is empty. Tear a pack open and what you pull is yours to keep, on this phone.';
    }
    bar.addEventListener('change', function (ev) { var s = ev.target.closest('select'); if (!s) return; state[s.dataset.k] = s.value; state.slug = ''; paint(); });
    bar.addEventListener('click', function (ev) { var c = ev.target.closest('.ph-chip'); if (!c) return; state.slug = state.slug === c.dataset.slug ? '' : c.dataset.slug; paint(); });
    line.addEventListener('click', function (ev) { if (ev.target.closest('[data-binder]')) { try { w.OTPBinder && w.OTPBinder.open && w.OTPBinder.open(); } catch (e) {} } });
    paint();
    try { if (w.OTPBinder && w.OTPBinder.on) w.OTPBinder.on(paint); } catch (e) {}
    // binder.js can land after this file
    var t0 = Date.now(); (function later() { if (w.OTPBinder) { paint(); try { w.OTPBinder.on(paint); } catch (e) {} return; } if (Date.now() - t0 < 6000) setTimeout(later, 200); })();
  }

  /* ================= ARTIST PACKS ================= */
  function artPacks() {
    var sec = d.getElementById('artpacks'); if (!sec) return;
    head(sec, 'Packs', 'by the house and its artists', 'photo packs with their own rarities · tear one open · keep what you like');
    var rail = el('div', 'ph-packs'); sec.appendChild(rail);
    var foot = el('div', 'ph-packs-foot'); sec.appendChild(foot);
    function paintFoot() {
      // signed in with no Instagram yet ("Almost in") gets the one step: join/ sends anybody signed in straight on,
      // so a Log in link only bounced them back to the timeline
      var st = d.documentElement.getAttribute('data-door');
      // a closed account paints 'wait' too, with its key on Your account (door.js); banned stays the quiet step
      var key = d.getElementById('nav-key'), closed = st === 'wait' && !!key && /(^|\/)my\/#account$/.test(key.getAttribute('href') || '');
      foot.innerHTML = (member() ? '<a class="ph-btn" href="packs/#new">&#43; Make a pack</a>'
        : closed ? '<span class="ph-note">Members make packs. This account is closed. <a href="my/#account">Your account &rarr;</a></span>'
        : st === 'wait' ? '<span class="ph-note">Members make packs. <a href="wall/">One more step at the Crypt</a> and you are in.</span>'
        : '<span class="ph-note">Members make packs. <a href="join/?next=home">Log in</a> or <a href="wall/">join the Crypt</a>.</span>') +
        '<a class="drops-more" href="packs/">every pack &rarr;</a>';
    }
    paintFoot();
    try { new MutationObserver(paintFoot).observe(d.documentElement, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
    if (!(w.OTP && OTP.configured && OTP.sb)) { rail.appendChild(el('p', 'ph-note', 'The shelf is resting with the backend.')); return; }
    var pub = function (key) { try { return OTP.packPhotoUrl ? OTP.packPhotoUrl(key) : ''; } catch (e) { return ''; } };
    Promise.resolve(OTP.sb().rpc('packs_list')).then(function (r) {
      var list = (r && !r.error && Array.isArray(r.data)) ? r.data.filter(function (p) { return p.published; }) : [];
      if (!list.length) { rail.appendChild(el('p', 'ph-note', 'No packs out yet. The first one is waiting to be made.')); return; }
      list.slice(0, 12).forEach(function (p) {
        var a = el('a', 'ph-apack' + (p.has_hit ? ' has-hit' : ''));
        a.href = 'packs/?p=' + encodeURIComponent(p.slug);
        a.innerHTML = '<span class="ph-apack-img">' + (p.cover ? '<img src="' + esc(pub(p.cover)) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
          '<b>' + esc(p.title) + '</b><span>' + esc(p.author) + ' · ' + p.cards + ' cards' + (p.has_hit ? ' · one hit' : '') + (p.faves ? ' · ' + p.faves + ' ♥' : '') + '</span>';
        rail.appendChild(a);
      });
    }).catch(function () { rail.appendChild(el('p', 'ph-note', 'The shelf did not load. Try again in a minute.')); });
  }

  /* ================= THE LOOKS ================= */
  function looks() {
    var sec = d.getElementById('looks'); if (!sec) return;
    getJSON('content/looks.json').then(function (L) {
      var nights = (L && L.nights) || [];
      nights = nights.filter(function (n) { return n.frames && n.frames.length && n.frames.some(function (f) { return f.prints && f.prints.length >= 2; }); });
      if (!nights.length) { sec.remove(); return; }
      head(sec, 'The Looks', 'same frame, every print', nights.length + ' nights were printed more than one way · drag the handle');
      var wrap = el('div', 'ph-looks');
      nights.forEach(function (n) {
        var f = n.frames.find(function (x) { return x.prints.length >= 2; }) || n.frames[0];
        if (n.frames.length >= 2 && n.frames[1].prints.length >= 2) f = n.frames[1];   // the middle of the night, not the first frame
        var card = el('div', 'ph-look');
        var a = 0, b = 1;
        var dt = ymd(n.date);
        card.innerHTML = '<div class="ph-look-h"><b>' + esc(n.title) + '</b><span>' + esc(n.venue || '') + (dt ? ' · ' + MON[dt.getMonth()] + ' ' + dt.getDate() : '') + '</span></div>' +
          '<div class="ph-cmp" style="aspect-ratio:' + (f.w && f.h ? (f.w / f.h).toFixed(4) : '0.75') + '"><img class="ph-cmp-a" alt=""><img class="ph-cmp-b" alt=""><input type="range" min="0" max="100" value="50" aria-label="Drag between the two prints"><span class="ph-cmp-l l">' + esc(f.prints[0].name) + '</span><span class="ph-cmp-l r">' + esc(f.prints[1].name) + '</span><i class="ph-cmp-h"></i></div>' +
          '<div class="ph-look-c">' + f.prints.map(function (p, i) { return '<button type="button" class="ph-pill' + (i === 1 ? ' on' : '') + '" data-i="' + i + '">' + esc(p.name) + '</button>'; }).join('') + '</div>' +
          '<p class="ph-credit">' + esc(n.looks.length + ' prints') + ' · ' + esc(n.count + ' frames') + ' · shot by the house · <a href="events/' + esc(n.slug) + '/#f' + ((f.i | 0) + 1) + '">this frame in the gallery</a></p>';
        var cmp = card.querySelector('.ph-cmp'), ia = cmp.querySelector('.ph-cmp-a'), ib = cmp.querySelector('.ph-cmp-b'), rg = cmp.querySelector('input'), hd = cmp.querySelector('.ph-cmp-h');
        var la = cmp.querySelector('.ph-cmp-l.l'), lb = cmp.querySelector('.ph-cmp-l.r');
        function setPos(v) { cmp.style.setProperty('--x', v + '%'); }
        function load() { if (ia.src) return; ia.src = f.prints[a].src; ib.src = f.prints[b].src; }
        function pick(i) { if (i === a) return; b = i; a = i === 0 ? 1 : 0; if (i !== 0) { a = 0; } ia.src = f.prints[a].src; ib.src = f.prints[b].src; la.textContent = f.prints[a].name; lb.textContent = f.prints[b].name;
          card.querySelectorAll('.ph-pill').forEach(function (p) { p.classList.toggle('on', +p.dataset.i === b); }); }
        rg.addEventListener('input', function () { setPos(rg.value); });
        card.querySelector('.ph-look-c').addEventListener('click', function (ev) { var p = ev.target.closest('.ph-pill'); if (p) pick(+p.dataset.i); });
        setPos(50);
        try { new IntersectionObserver(function (es, o) { es.forEach(function (e) { if (e.isIntersecting) { load(); o.disconnect(); } }); }, { rootMargin: '300px' }).observe(cmp); } catch (e) { load(); }
        wrap.appendChild(card);
      });
      sec.appendChild(wrap);
    });
  }

  /* ================= THE TAPE: pills ================= */
  function tapePills() {
    var sec = d.getElementById('tape'), rail = d.getElementById('tape-rail'); if (!sec || !rail) return;
    getJSON('content/video.json').then(function (V) {
      var cuts = ((V && V.items) || []).filter(function (v) { return v && v.src && v.poster; });
      var from = [], seen = {}; cuts.forEach(function (v) { var k = String(v.from || '').trim(); if (k && !seen[k]) { seen[k] = 1; from.push(k); } });
      if (from.length < 2) return;
      var bar = el('div', 'ph-pills', '<button type="button" class="ph-pill on" data-from="">All</button>' + from.map(function (k) { return '<button type="button" class="ph-pill" data-from="' + esc(k) + '">' + esc(k) + '</button>'; }).join(''));
      var first = '';
      var t0 = Date.now(); (function arm() {
        if (rail.children.length) { first = rail.innerHTML; rail.parentNode.insertBefore(bar, rail); return; }
        if (Date.now() - t0 < 8000) setTimeout(arm, 150);
      })();
      bar.addEventListener('click', function (ev) {
        var p = ev.target.closest('.ph-pill'); if (!p) return;
        bar.querySelectorAll('.ph-pill').forEach(function (x) { x.classList.toggle('on', x === p); });
        var k = p.dataset.from;
        if (!k) { rail.innerHTML = first; return; }
        rail.innerHTML = cuts.filter(function (v) { return String(v.from || '').trim() === k; }).slice(0, 12).map(function (v) {
          var href = /^[a-z0-9][a-z0-9-]{0,90}$/.test(v.slug || '') ? 'video/#' + v.slug : 'video/';
          var cover = String(v.poster).startsWith('../') ? String(v.poster).slice(3) : 'video/' + v.poster;
          return '<a class="drop" href="' + esc(href) + '"><span class="shot' + ((v.w | 0) > (v.h | 0) ? ' wide' : '') + '"><img src="' + esc(cover) + '" alt="" width="' + ((v.w | 0) || 520) + '" height="' + ((v.h | 0) || 924) + '" loading="lazy"><span class="n">' + esc(v.dur || 'clip') + '</span></span>' +
            '<span class="cap"><span class="v">' + esc(v.title || v.from || '') + '</span><span class="t">' + esc(v.line || '') + '</span><span class="d">watch &rarr;</span></span></a>';
        }).join('');
      });
    });
  }

  /* ================= THE MAP ================= */
  function map() {
    var sec = d.getElementById('map'); if (!sec) return;
    getJSON('content/rooms.json').then(function (R) {
      var rooms = ((R && R.rooms) || []).filter(function (r) { return typeof r.lat === 'number' && typeof r.lng === 'number'; });
      if (!rooms.length) { sec.remove(); return; }
      head(sec, 'The Map', 'every room we shot', 'tap a pin for the nights there · homes and private spaces sit on the city, not an address');
      var box = el('div', 'ph-map'); box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Map of the rooms');
      sec.appendChild(box);
      var legend = el('p', 'ph-credit', rooms.length + ' rooms · ' + NIGHTS.length + ' nights · map by OpenStreetMap');
      sec.appendChild(legend);
      var nightsAt = function (room) {
        var keys = [room.key].concat(room.aliases || []).map(tight);
        return NIGHTS.filter(function (n) { return String(n.venue || '').split('·').some(function (v) { return keys.indexOf(tight(v)) >= 0; }); });
      };
      // one room's lines: its name, where it is (a private space says the city only), its nights
      var roomHtml = function (r) {
        var ns = nightsAt(r);
        return '<div class="ph-pop-r"><b>' + esc(r.name) + '</b><span>' + esc(r.city_only ? r.city + ' · a private space' : (r.address || r.city)) + '</span>' +
          (ns.length ? '<ul>' + ns.map(function (n) { var dt = ymd(n.date); return '<li><a href="events/' + esc(n.slug) + '/">' + esc(n.title) + '</a> <em>' + (dt ? MON[dt.getMonth()] + ' ' + dt.getDate() : '') + ' · ' + (n.count | 0) + ' frames</em></li>'; }).join('') + '</ul>' : '<i>coming up</i>') + '</div>';
      };
      // ⛔ ONE PIN PER SPOT. Two private spaces in one city sit on the same city point (no addresses), so a pin each
      //    stacked them and only the top one could be tapped (21st Street hid New Guild, and Brainrot with it).
      var spots = [], at = {};
      rooms.forEach(function (r) {
        var k = r.lat.toFixed(5) + ',' + r.lng.toFixed(5);
        if (!at[k]) { at[k] = { lat: r.lat, lng: r.lng, rooms: [] }; spots.push(at[k]); }
        at[k].rooms.push(r);
      });
      var started = false;
      function start() {
        if (started) return; started = true;
        var css = d.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; d.head.appendChild(css);
        var sc = d.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        sc.onload = function () {
          var L = w.L; if (!L) return;
          var m = L.map(box, { scrollWheelZoom: false, attributionControl: true });
          // OpenStreetMap's own tiles, turned dark in CSS (.ph-dark-tiles). CARTO's dark rasters want an API key now.
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, className: 'ph-dark-tiles', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
          var pts = [];
          spots.forEach(function (sp) {
            var shot = sp.rooms.some(function (r) { return nightsAt(r).length > 0; });
            var mk = L.circleMarker([sp.lat, sp.lng], { radius: shot ? 9 : 6, color: '#ff79c6', weight: 2, fillColor: shot ? '#ff79c6' : '#0a0a0d', fillOpacity: shot ? .85 : .9 }).addTo(m);
            mk.bindPopup('<div class="ph-pop">' + sp.rooms.map(roomHtml).join('') + '</div>');
            pts.push([sp.lat, sp.lng]);
          });
          if (pts.length > 1) m.fitBounds(pts, { padding: [30, 30], maxZoom: 13 }); else m.setView(pts[0] || [29.4241, -98.4936], 12);
        };
        // the rooms right here, not "in the sidebar": a phone hides the sidebar on every tab but More
        sc.onerror = function () { box.classList.add('ph-map-off'); box.innerHTML = '<p class="ph-note">The map did not load. Every room we shot, and its nights:</p><div class="ph-pop ph-rooms">' + rooms.map(roomHtml).join('') + '</div>'; };
        d.head.appendChild(sc);
      }
      try { new IntersectionObserver(function (es, o) { es.forEach(function (e) { if (e.isIntersecting) { start(); o.disconnect(); } }); }, { rootMargin: '400px' }).observe(box); } catch (e) { start(); }
    });
  }

  /* ================= TAKE IT DOWN ================= */
  function takeDown() {
    var sec = d.getElementById('takedown'); if (!sec) return;
    head(sec, 'Take It Down', 'your face, your call', 'in one of our frames and you want it gone? say which one');
    var f = el('form', 'ph-td'); f.setAttribute('novalidate', '');
    f.innerHTML = '<label>The night<select name="night"><option value="">Pick the night</option>' + NIGHTS.map(function (n) { var dt = ymd(n.date); return '<option value="' + esc(n.slug) + '">' + esc(n.title) + (dt ? ' · ' + MON[dt.getMonth()] + ' ' + dt.getDate() : '') + '</option>'; }).join('') + '</select></label>' +
      '<label>Frame number<input name="frame" inputmode="numeric" maxlength="4" placeholder="the number under the photo"></label>' +
      '<label>How we reach you<input name="reach" maxlength="80" placeholder="Instagram or email"></label>' +
      '<label class="wide">Anything else<textarea name="note" rows="2" maxlength="500" placeholder="which person, or anything we should know"></textarea></label>' +
      '<div class="ph-td-row"><small>It opens your email app. The desk takes it down and tells you when it is gone.</small><button type="submit" class="ph-btn">Ask for it</button></div><p class="ph-td-msg" role="status"></p>';
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = function (k) { return String((f.elements[k] && f.elements[k].value) || '').trim(); }, msg = f.querySelector('.ph-td-msg');
      if (!v('night')) { msg.textContent = 'Pick the night.'; f.elements.night.focus(); return; }
      if (!/^\d{1,4}$/.test(v('frame'))) { msg.textContent = 'Put the frame number, it is under the photo.'; f.elements.frame.focus(); return; }
      if (!v('reach')) { msg.textContent = 'Leave a way to reach you, so we can say when it is down.'; f.elements.reach.focus(); return; }
      msg.textContent = '';
      var n = NIGHTS.find(function (x) { return x.slug === v('night'); }) || { title: v('night') };
      var body = 'TAKE IT DOWN\n\nNight: ' + n.title + ' (' + v('night') + ')\nFrame: ' + v('frame') + '\nLink: https://0fftheprint.com/events/' + v('night') + '/#f' + v('frame') + '\nReach me: ' + v('reach') + '\n\n' + (v('note') || '') + '\n\n(sent from 0fftheprint.com, Photos tab)';
      w.location.href = 'mailto:offtheprintcollective@gmail.com?subject=' + encodeURIComponent('TAKE IT DOWN · ' + n.title + ' · frame ' + v('frame')) + '&body=' + encodeURIComponent(body.slice(0, 1800));
    });
    sec.appendChild(f);
  }

  function go() {
    getJSON('events/events.json').then(function (E) {
      NIGHTS = ((E && E.items) || []).filter(function (n) { return n && slugOk(n.slug) && n.date; });
      [setList, artPacks, looks, tapePills, map, takeDown].forEach(function (fn) { try { fn(); } catch (e) { try { console.warn('photos:', fn.name, e.message); } catch (x) {} } });
      d.documentElement.setAttribute('data-photos', 'ready');
    });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', go); else go();
})(window, document);
