/* THE MUSIC TAB (10/11). His call on the music brainstorm: "Apply all of them".
 *
 *   THE COVER        one pick on top with a desk note. site.music_cover (the overlay) pins it,
 *                    else content/music.json cover, else the first track on rotation.
 *   0TP RADIO        plays every track on this tab front to back through the lounge radio bar
 *                    (lounge.js), shuffle on a tap. After 7pm on the visitor's clock, "Play all"
 *                    plays the night room (music.json night) instead: the lounge goes dark at 7 too.
 *   ROWS             On Rotation (index.html draws it), Card Holders' Picks, From Our Nights,
 *                    Card Holders, The Texas Shelf. Each rail ends on a next-up card.
 *   ROTATION BATTLE  two tracks, members vote for the ISO week in the battle id (migration 036),
 *                    the winner joins On Rotation once the week closes.
 *   WHO PLAYED       every night we shot, every act on the bill, a play button each.
 *   THE LINEAGE · THE LINEUP · DROPS · THE ROOMS · PUT US ON   (music.json, committed)
 *
 * index.html hands over what it already computed (rotation after the desk's overlay, the live
 * member picks, the roster with the members' own songs, site.json after the overlay, and its
 * tile builder) as window.__OTP_MUSIC, then fires otp:music. Everything fails quiet.
 * ⛔ Run stamp.py after editing this file. ⛔ No em dashes in any copy here.
 */
(function (w, d) {
  'use strict';
  var root = d.documentElement;
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var P = null, M = null;

  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return P.esc(s); }
  function safe(u) { return P.safeUrl(u); }
  function trackId(v) { var m = /(?:track[\/:])([A-Za-z0-9]{22})/.exec(String(v || '')); return m ? m[1] : (/^[A-Za-z0-9]{22}$/.test(String(v || '')) ? String(v) : null); }
  function spLink(id) { return 'https://open.spotify.com/track/' + id; }
  // Y-M-D at local noon. ⛔ never new Date('2026-10-12'): that is UTC midnight, the evening before here.
  function ymd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); }
  function days(a, b) { return Math.round((b.getTime() - a.getTime()) / 864e5); }
  function when(dt) { return DOW3[dt.getDay()] + ' ' + MON3[dt.getMonth()] + ' ' + dt.getDate(); }
  function isMember() { return root.getAttribute('data-door') === 'in'; }
  function night() { var h = new Date().getHours(); return h >= 19 || h < 6; }
  function head(sec, title, accent, sub) {
    var h = el('div', 'section-head', '<h2>' + esc(title) + (accent ? ' <span class="accent">' + esc(accent) + '</span>' : '') + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : ''));
    sec.appendChild(h); return h;
  }
  function shelf(host, key, title, sub, n) {
    var box = el('div', 'shelf mx-shelf');
    box.dataset.shelf = key;
    box.innerHTML = '<div class="shelf-head"><h3>' + esc(title) + '</h3>' + (n != null ? '<span class="n">' + n + '</span>' : '') +
      (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</div>';
    var rail = el('div', 'shelf-rail');
    box.appendChild(rail); host.appendChild(box);
    return rail;
  }
  function nextCard(icon, k, t, l, go, href) {
    var a = el('a', 'shelf-next');
    a.href = href;
    if (/^https?:\/\//.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    a.innerHTML = '<img class="nx-i" src="assets/cathedral/a/' + icon + '.webp" alt="" width="120" height="120" loading="lazy" decoding="async">' +
      '<span class="nx-k">' + esc(k) + '</span><span class="nx-t">' + esc(t) + '</span>' +
      (l ? '<span class="nx-l">' + esc(l) + '</span>' : '') + '<span class="nx-go">' + esc(go) + ' &rarr;</span>';
    return a;
  }
  function noteFor(id, entry) { return (entry && entry.note) || (M.notes && M.notes[id]) || ''; }

  /* ---------- the queue: every track on this tab, in the order you see them ---------- */
  function tabTracks() {
    var seen = {}, out = [];
    var tiles = d.querySelectorAll('main.feed > section[data-tab="music"] [data-sp]');
    Array.prototype.forEach.call(tiles, function (t) {
      var id = t.dataset.sp; if (!id || seen[id]) return; seen[id] = 1;
      out.push({ id: id, title: t.dataset.t || '', artist: t.dataset.a || '' });
    });
    return out;
  }
  function shuffled(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  var SHUFFLE = false;
  function nightTracks() { return ((M.night && M.night.tracks) || []).filter(function (t) { return trackId(t.id); }); }
  // what "Play all" plays: the night room after 7, the tab the rest of the day
  function queue() {
    var nt = nightTracks();
    if (night() && nt.length) return { tracks: shuffled(nt), name: '0TP Radio · night shift' };
    var tr = tabTracks();
    return { tracks: SHUFFLE ? shuffled(tr) : tr, name: '0TP Radio' };
  }
  function playFrom(id) {
    if (!w.OTPLounge || !w.OTPLounge.radio) return false;
    var tr = tabTracks(), i = -1;
    for (var k = 0; k < tr.length; k++) if (tr[k].id === id) { i = k; break; }
    if (i < 0) { tr.unshift({ id: id, title: '', artist: '' }); i = 0; }
    w.OTPLounge.radio({ tracks: tr, start: i, name: '0TP Radio' });
    return true;
  }
  function playAll() { var q = queue(); if (q.tracks.length && w.OTPLounge && w.OTPLounge.radio) w.OTPLounge.radio({ tracks: q.tracks, start: 0, name: q.name }); }

  /* ---------- a tile: index.html's own builder, so every play button means the same thing ---------- */
  function tile(e) {
    var t = P.tile(e);
    if (e.track) { t.dataset.t = e.title || ''; t.dataset.a = e.artist || ''; }
    return t;
  }

  /* ================= THE COVER ================= */
  function cover() {
    var host = d.getElementById('mx-cover'); if (!host) return;
    var pin = (P.site && P.site.music_cover && trackId(P.site.music_cover.track)) ? P.site.music_cover : null;
    var c = pin || ((M.cover && trackId(M.cover.track)) ? M.cover : null);
    var pool = [].concat(P.rotation || [], P.live || [], M.texas || []);
    var id = c ? trackId(c.track) : (P.rotation[0] ? trackId(P.rotation[0].track || P.rotation[0].link) : null);
    if (!id) { host.remove(); return; }
    var hit = null;
    pool.forEach(function (e) { if (!hit && trackId(e.track || e.link || e.id) === id) hit = e; });
    var t = { title: (c && c.title) || (hit && hit.title) || '', artist: (c && c.artist) || (hit && hit.artist) || '', art: (c && c.art) || (hit && hit.art) || '' };
    var note = (c && c.note) || noteFor(id, hit);
    host.dataset.sp = id; host.dataset.t = t.title; host.dataset.a = t.artist;
    host.dataset.cover = pin ? 'pin' : 'auto';
    host.href = spLink(id); host.target = '_blank'; host.rel = 'noopener';
    host.innerHTML = '<span class="mx-cv-art"></span><span class="mx-cv-txt"><span class="mx-k">The cover &middot; the desk&rsquo;s pick</span>' +
      '<b class="mx-cv-t">' + esc(t.title) + '</b><span class="mx-cv-a">' + esc(t.artist) + '</span>' +
      (note ? '<span class="mx-cv-n">' + esc(note) + '</span>' : '') +
      '<span class="mx-cv-go"><button type="button" class="mx-btn">&#9654; Play it</button><span class="mx-cv-sp">Open in Spotify &rarr;</span></span></span>';
    var art = safe(t.art);
    if (art) host.querySelector('.mx-cv-art').style.backgroundImage = 'url("' + P.sized(art, 'card') + '")';
    host.querySelector('.mx-btn').addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); if (!playFrom(id)) w.open(spLink(id), '_blank', 'noopener'); });
    if (!t.title) fill(id, function (m) {
      host.querySelector('.mx-cv-t').textContent = m.title; host.dataset.t = m.title;
      if (!art && m.thumb) host.querySelector('.mx-cv-art').style.backgroundImage = 'url("' + m.thumb + '")';
    });
  }

  // Spotify's oEmbed: title + cover, no key, no artist. Cached for the visit.
  // Two cards can carry the same song (VAMPPSYCH and VIRGOSGATEWAY both open on 2 HI): one fetch, every waiter answered.
  var META = {};
  function fill(id, cb) {
    // titles saved at build time (music.json `titles`) first: Spotify throttles a burst of oEmbed calls
    var saved = M.titles && M.titles[id];
    if (saved && saved.title) { cb(saved); return; }
    var m = META[id];
    if (m && m.title) { cb(m); return; }
    if (m) { m.wait.push(cb); return; }
    m = META[id] = { wait: [cb] };
    fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(spLink(id)))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.title) return;
        m.title = String(j.title).replace(/\u2014/g, '-').slice(0, 60); m.thumb = j.thumbnail_url || '';
        m.wait.splice(0).forEach(function (f) { try { f(m); } catch (e) {} });
      })
      .catch(function () {});
  }

  /* ================= 0TP RADIO ================= */
  function radio() {
    var host = d.getElementById('mx-radio'); if (!host) return;
    var n = tabTracks().length, nt = nightTracks().length, late = night() && nt;
    host.innerHTML = '<i class="mx-vinyl" aria-hidden="true"></i><span class="mx-r-txt"><b>0TP Radio</b>' +
      '<span>' + (late ? 'Night shift: after 7 it plays ' + esc((M.night && M.night.name) || 'the night room') + '.' : 'Plays this whole tab, ' + n + ' tracks, front to back.') + '</span>' +
      '<small>Not logged into Spotify? You get 30 seconds a track. That is Spotify&rsquo;s rule.</small></span>' +
      '<span class="mx-r-btns"><button type="button" class="mx-btn mx-play">&#9654; Play all</button>' +
      '<button type="button" class="mx-btn ghost mx-shuf" aria-pressed="false">Shuffle</button></span>';
    host.querySelector('.mx-play').addEventListener('click', playAll);
    var sh = host.querySelector('.mx-shuf');
    if (late) sh.hidden = true;
    sh.addEventListener('click', function () { SHUFFLE = !SHUFFLE; sh.setAttribute('aria-pressed', SHUFFLE ? 'true' : 'false'); sh.classList.toggle('on', SHUFFLE); if (SHUFFLE) playAll(); });
  }

  /* ================= ROWS ================= */
  // On Rotation is drawn by index.html; its rail ends here, on the battle when there is one
  function rotationEnd() {
    var rail = d.getElementById('rotation-mount'); if (!rail || rail.querySelector('.shelf-next')) return;
    var B = M.battle;
    rail.appendChild(B && B.a && B.b
      ? nextCard('music', 'Next up', 'Rotation Battle', 'Two tracks fight for a spot. Members vote, the winner stays.', 'Vote', '#battle')
      : nextCard('music', 'Next up', 'Your pick here', 'Card holders can put a song on rotation.', 'Put one on', 'compose/#rot'));
  }
  function picks() {
    var host = d.getElementById('mx-picks'); if (!host) return;
    var live = P.live || [];
    var rail = shelf(host, 'picks', 'Card Holders’ Picks', 'put on by people with cards', live.length || null);
    live.forEach(function (e) { var id = trackId(e.track || e.link); if (!id) return; rail.appendChild(tile({ platform: 'spotify', title: e.title, artist: e.artist, art: e.art, link: spLink(id), track: id, by: e.by, note: noteFor(id, e) })); });
    rail.appendChild(nextCard('music', 'Next up', live.length ? 'Add yours' : 'Be the first', 'Card holders can put a song on rotation. The desk okays it first.', 'Put one on', 'compose/#rot'));
  }

  function played() {
    var sec = d.getElementById('played'); if (!sec) return;
    var nights = (M.nights || []).filter(function (n) { return n.acts && n.acts.length; });
    if (!nights.length) { sec.remove(); return; }
    head(sec, 'From Our Nights', 'shot by the house', 'the acts on the bills we shot');
    // one tile per act on the rail: an act we shot twice (KAV-MAN) shows once, on the night we have a frame of
    var acts = [], seen = {};
    nights.forEach(function (n) { n.acts.forEach(function (a) {
      var id = a.spotify && trackId(a.spotify.track); if (!id) return;
      if (seen[id]) { if (!seen[id].a.frame && a.frame) { seen[id].n = n; seen[id].a = a; } return; }
      seen[id] = { n: n, a: a }; acts.push(seen[id]);
    }); });
    var rail = shelf(sec, 'nights', 'On Our Stages', 'our own frame where we got one', acts.length);
    acts.forEach(function (x) {
      var id = trackId(x.a.spotify.track), fr = x.a.frame;
      var t = tile({ platform: 'spotify', title: x.a.name, artist: x.a.spotify.title || '', art: (fr && fr.thumb) || x.a.spotify.art || '', link: spLink(id), track: id,
        sub: 'played ' + x.n.title + ' · ' + (x.n.date_short || ''), shot: !!(fr && fr.thumb) });
      t.dataset.t = x.a.spotify.title || x.a.name; t.dataset.a = x.a.name;
      rail.appendChild(t);
    });
    rail.appendChild(nextCard('photos', 'Next up', 'Every night', 'The full galleries, every frame, free to download.', 'See the nights', 'events/'));

    // WHO PLAYED: the ledger, newest night first
    var led = el('div', 'mx-who');
    led.innerHTML = '<div class="mx-sub-h"><h3>Who Played</h3><span>every night we shot, every act on the bill</span></div>';
    nights.forEach(function (n) {
      var dt = ymd(n.date);
      var row = el('div', 'mx-who-row');
      row.innerHTML = '<a class="mx-who-n" href="events/' + esc(n.slug) + '/"><b>' + esc(n.title) + '</b><span>' + esc(n.venue || '') + (dt ? ' · ' + esc(when(dt)) : '') + '</span></a><span class="mx-who-acts"></span>';
      var box = row.querySelector('.mx-who-acts');
      n.acts.forEach(function (a) {
        var id = a.spotify && trackId(a.spotify.track);
        var link = id ? spLink(id) : safe(a.alt_link);
        var chip = el(link ? 'a' : 'span', 'mx-act' + (id ? ' sp' : ''));
        if (link) { chip.href = link; chip.target = '_blank'; chip.rel = 'noopener'; }
        chip.innerHTML = (id ? '<i aria-hidden="true">&#9654;</i>' : '') + esc(a.name);
        if (id) chip.addEventListener('click', function (ev) { if (playFrom(id)) ev.preventDefault(); });
        box.appendChild(chip);
      });
      led.appendChild(row);
    });
    sec.appendChild(led);
  }

  function holders() {
    var sec = d.getElementById('holders'); if (!sec) return;
    var cards = (P.roster || []).filter(function (r) { return trackId(r.theme_song); });
    if (!cards.length) { sec.remove(); return; }
    head(sec, 'Card Holders', 'theme songs', 'every card plays a song when you open it');
    var rail = shelf(sec, 'holders', 'Their Songs', 'picked by the people on the cards', cards.length);
    cards.forEach(function (r) {
      var id = trackId(r.theme_song), st = parseInt(r.theme_start, 10) || 0;
      var mm = st ? Math.floor(st / 60) + ':' + ('0' + (st % 60)).slice(-2) : '';
      var t = tile({ platform: 'spotify', title: 'Theme song', artist: r.name + '’s theme', art: r.photo || '', link: spLink(id) + (st ? '?t=' + st : ''), track: id,
        sub: mm ? 'opens at ' + mm : '', card: true });
      t.dataset.a = r.name;
      rail.appendChild(t);
      fill(id, function (m) { var ti = t.querySelector('.track-title'); if (ti) ti.textContent = m.title; t.dataset.t = m.title; });
    });
    rail.appendChild(nextCard('join', 'Next up', 'Get a card', 'Card holders pick their own song. It plays when somebody opens the card.', 'Get in', 'join/'));
  }

  function texas() {
    var sec = d.getElementById('texas'); if (!sec) return;
    var list = (M.texas || []).filter(function (x) { return trackId(x.id); });
    if (!list.length) { sec.remove(); return; }
    head(sec, 'The Texas Shelf', 'Houston first', 'the city that slowed it down, and who came after');
    var rail = shelf(sec, 'texas', 'Southside', 'the desk’s own Texas picks', list.length);
    list.forEach(function (x) {
      var id = trackId(x.id);
      rail.appendChild(tile({ platform: 'spotify', title: x.title, artist: x.artist, art: x.art, link: spLink(id), track: id,
        sub: [x.city, x.year].filter(Boolean).join(' · '), note: x.fact || '' }));
    });
    rail.appendChild(nextCard('coming', 'Next up', 'Texas shows', 'Who is playing Texas next, with tickets.', 'The lineup', '#lineup'));
  }

  /* ================= ROTATION BATTLE ================= */
  function isoMonday(id) {
    var m = /^(\d{4})-w(\d{2})$/.exec(String(id || '')); if (!m) return null;
    var j4 = new Date(+m[1], 0, 4, 12), mon1 = new Date(j4.getTime() - ((j4.getDay() + 6) % 7) * 864e5);
    return new Date(mon1.getTime() + (+m[2] - 1) * 7 * 864e5);
  }
  function battle() {
    var sec = d.getElementById('battle'), B = M.battle;
    if (!sec) return;
    var mon = B && isoMonday(B.id), A = B && B.a, Bb = B && B.b;
    if (!mon || !A || !Bb || !trackId(A.track) || !trackId(Bb.track)) { sec.remove(); return; }
    var sun = new Date(mon.getTime() + 6 * 864e5), now = today();
    var state = days(now, mon) > 0 ? 'soon' : days(sun, now) > 0 ? 'done' : 'open';
    head(sec, 'Rotation Battle', 'week of ' + MON3[mon.getMonth()] + ' ' + mon.getDate(), 'two tracks · members vote · the winner stays on rotation');
    var box = el('div', 'mx-bt');
    box.dataset.state = state;
    [['a', A], ['b', Bb]].forEach(function (p, i) {
      var id = trackId(p[1].track);
      var side = el('div', 'mx-bt-side'); side.dataset.pick = p[0];
      side.appendChild(tile({ platform: 'spotify', title: p[1].title, artist: p[1].artist, art: p[1].art, link: spLink(id), track: id, note: p[1].note || noteFor(id) }));
      side.appendChild(el('div', 'mx-bt-bar', '<i></i><span class="mx-bt-n"></span>'));
      var b = el('button', 'mx-btn mx-bt-vote', 'Vote ' + esc(p[1].title));
      b.type = 'button'; b.dataset.pick = p[0];
      side.appendChild(b);
      box.appendChild(side);
      if (!i) box.appendChild(el('div', 'mx-bt-vs', 'VS'));
    });
    var line = el('p', 'mx-bt-state');
    sec.appendChild(box); sec.appendChild(line);
    var T = null;
    function paint(msg) {
      var a = T ? T.a : 0, b = T ? T.b : 0, n = a + b;
      Array.prototype.forEach.call(box.querySelectorAll('.mx-bt-side'), function (s) {
        var k = s.dataset.pick, v = k === 'a' ? a : b, pc = n ? Math.round(v * 100 / n) : 0;
        s.querySelector('.mx-bt-bar').hidden = !T;   // no counts yet (week not open, or 036 not run): no empty bar
        s.querySelector('.mx-bt-bar i').style.width = (T ? pc : 0) + '%';
        s.querySelector('.mx-bt-n').textContent = T ? (v + (v === 1 ? ' vote' : ' votes') + (n ? ' · ' + pc + '%' : '')) : '';
        s.classList.toggle('mine', !!(T && T.mine === k));
        s.classList.toggle('won', state === 'done' && !!T && n > 0 && v > (k === 'a' ? b : a));
        var btn = s.querySelector('.mx-bt-vote');
        btn.hidden = !(state === 'open' && isMember() && T);
        btn.textContent = T && T.mine === k ? 'Your vote' : 'Vote this';
      });
      var who = state === 'open' ? (isMember() ? (T ? 'Tap one. You can change it till Sunday.' : 'Votes open soon.') : 'Members vote. ')
        : state === 'soon' ? 'Voting opens ' + when(mon) + '.' : '';
      var tail = state === 'done' ? (T && n ? (a === b ? 'Closed. Dead even, both stay on rotation.' : 'Closed. ' + (a > b ? A.title : Bb.title) + ' won the week and stays on rotation.') : 'Closed.')
        : state === 'open' ? ' Closes ' + when(sun) + '.' : '';
      line.innerHTML = esc(msg || (who + tail)) + (state === 'open' && !isMember() && !msg ? ' <a href="join/">Get in &rarr;</a>' : '');
    }
    function load() {
      if (state === 'soon' || !(w.OTP && OTP.configured && OTP.sb)) { paint(); return; }
      Promise.resolve(OTP.sb().rpc('battle_tally', { p_battle: B.id })).then(function (r) {
        if (r && !r.error && r.data && r.data[0]) { T = r.data[0]; T.a = +T.a || 0; T.b = +T.b || 0; }
        paint(); stays();
      }).catch(function () { paint(); });
    }
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('.mx-bt-vote'); if (!b) return;
      ev.preventDefault();
      b.disabled = true;
      Promise.resolve(OTP.sb().rpc('battle_vote', { p_battle: B.id, p_pick: b.dataset.pick })).then(function (r) {
        b.disabled = false;
        if (r && r.error) { paint(String(r.error.message || 'That did not go through.')); return; }
        load();
      }).catch(function () { b.disabled = false; paint('That did not go through. Try again.'); });
    });
    // the door can answer after this runs: repaint when it does
    try { new MutationObserver(function () { paint(); }).observe(root, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
    // the winner stays: once the week is over it joins On Rotation, first in line
    function stays() {
      if (state !== 'done' || !T || !(T.a + T.b)) return;
      var rail = d.getElementById('rotation-mount'); if (!rail || rail.querySelector('.won')) return;
      var win = T.a === T.b ? [A, Bb] : [T.a > T.b ? A : Bb];
      win.slice().reverse().forEach(function (x) {
        var id = trackId(x.track);
        var t = tile({ platform: 'spotify', title: x.title, artist: x.artist, art: x.art, link: spLink(id), track: id, sub: T.a === T.b ? 'tied the battle' : 'won the battle', note: x.note || noteFor(id) });
        t.classList.add('won');
        rail.insertBefore(t, rail.firstChild);
      });
    }
    paint(); load();
  }

  /* ================= THE LINEAGE ================= */
  function lineage() {
    var sec = d.getElementById('lineage'); if (!sec) return;
    var list = (M.lineage || []).filter(function (p) { return p.root && p.new && trackId(p.root.id) && trackId(p.new.id); });
    if (!list.length) { sec.remove(); return; }
    head(sec, 'The Lineage', 'where it came from', 'the new one on the right, the root on the left');
    var wrap = el('div', 'mx-lin');
    list.forEach(function (p) {
      var row = el('div', 'mx-lin-row');
      [p.root, p.new].forEach(function (x, i) {
        var id = trackId(x.id);
        row.appendChild(tile({ platform: 'spotify', title: x.title, artist: x.artist, art: x.art, link: spLink(id), track: id, sub: String(x.year || '') }));
        if (!i) row.appendChild(el('span', 'mx-lin-arrow', '&rarr;'));
      });
      var src = safe(p.source);
      row.appendChild(el('p', 'mx-lin-line', esc(p.link) + (src ? ' <a href="' + esc(src) + '" target="_blank" rel="noopener">source</a>' : '')));
      wrap.appendChild(row);
    });
    sec.appendChild(wrap);
  }

  /* ================= THE LINEUP ================= */
  function lineup() {
    var sec = d.getElementById('lineup'); if (!sec) return;
    var now = today();
    var shows = (M.lineup || []).filter(function (s) { var dt = ymd(s.date); return dt && days(now, dt) >= 0; })
      .sort(function (a, b) { return ymd(a.date) - ymd(b.date); });
    if (!shows.length) { sec.remove(); return; }
    head(sec, 'The Lineup', 'Texas', 'shows coming up, with tickets');
    var list = el('div', 'mx-lu');
    sec.appendChild(list);
    var more = el('p', 'mx-lu-more');
    sec.appendChild(more);
    function paint() {
      var all = isMember(), cut = all ? shows : shows.slice(0, 3);
      list.innerHTML = '';
      cut.forEach(function (s) {
        var dt = ymd(s.date), off = days(now, dt);
        var t = safe(s.ticket) || safe(s.source);
        var row = el(t ? 'a' : 'div', 'mx-lu-row');
        if (t) { row.href = t; row.target = '_blank'; row.rel = 'noopener'; }
        row.innerHTML = '<span class="mx-lu-d"><b>' + DOW3[dt.getDay()] + '</b>' + MON3[dt.getMonth()] + ' ' + dt.getDate() + '</span>' +
          '<span class="mx-lu-m"><b>' + esc(s.artist) + '</b>' + (s.bill ? '<span>' + esc(s.bill) + '</span>' : '') +
          '<em>' + esc([s.venue, s.city].filter(Boolean).join(' · ')) + '</em></span>' +
          '<span class="mx-lu-go">' + (off === 0 ? 'Tonight' : off === 1 ? 'Tomorrow' : 'In ' + off + ' days') + (t ? '<i>Tickets &rarr;</i>' : '') + '</span>';
        list.appendChild(row);
      });
      var rest = shows.length - cut.length;
      more.innerHTML = rest > 0 ? rest + ' more ' + (rest === 1 ? 'date' : 'dates') + ' for members, in the Crypt. <a href="wall/#cal">Open the Crypt &rarr;</a>' : '';
      more.hidden = rest <= 0;
    }
    paint();
    try { new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
  }

  /* ================= DROPS ================= */
  function drops() {
    var sec = d.getElementById('releases'); if (!sec) return;   // ⛔ not #drops: that id is the Photos tab's
    var now = today();
    var list = (M.drops || []).filter(function (x) { var dt = ymd(x.date); return dt && days(dt, now) <= 7; })
      .sort(function (a, b) { return ymd(a.date) - ymd(b.date); });
    if (!list.length) { sec.remove(); return; }
    head(sec, 'Drops', 'the countdown', 'release dates the artists put on the record');
    var rail = el('div', 'mx-dr');
    list.forEach(function (x) {
      var dt = ymd(x.date), left = days(now, dt);
      var link = safe(x.spotify) || safe(x.source);
      var c = el(link ? 'a' : 'div', 'mx-dr-card' + (left <= 0 ? ' out' : ''));
      if (link) { c.href = link; c.target = '_blank'; c.rel = 'noopener'; }
      c.innerHTML = '<span class="mx-dr-n">' + (left > 1 ? left + '<i>days</i>' : left === 1 ? '1<i>day</i>' : left === 0 ? 'Out<i>today</i>' : 'Out<i>now</i>') + '</span>' +
        '<span class="mx-dr-a">' + esc(x.artist) + '</span><b class="mx-dr-t">' + esc(x.title) + '</b>' +
        '<span class="mx-dr-m">' + esc([x.type, when(dt)].filter(Boolean).join(' · ')) + '</span>' +
        (x.fact ? '<span class="mx-dr-f">' + esc(x.fact) + '</span>' : '');
      rail.appendChild(c);
    });
    sec.appendChild(rail);
  }

  /* ================= THE ROOMS ================= */
  // The house's rooms come from music.json. Since 038 members put up their own (a Spotify playlist, a name,
  // a label, a line): a member's room waits for the desk, the desk's own go live on save, five each.
  function rooms() {
    var sec = d.getElementById('rooms'); if (!sec) return;
    var house = (M.rooms || []).filter(function (r) { return /^[A-Za-z0-9]{22}$/.test(String(r.id || '')); })
      .map(function (r) { return { playlist: r.id, name: r.name, label: r.label || 'The house', line: r.line || '', house: true }; });
    head(sec, 'The Rooms', 'theirs and ours', 'the house sound, then the rooms members put up · open one, it plays here');
    var wrap = el('div', 'mx-rooms'); sec.appendChild(wrap);
    var mineBox = el('div', 'mx-rooms-mine'); sec.appendChild(mineBox);
    var foot = el('div', 'mx-rooms-foot'); sec.appendChild(foot);
    var api = (w.OTP && OTP.configured && OTP.sb) ? OTP.sb() : null;
    function rpc(name, args) { if (!api) return Promise.resolve({ error: { message: 'asleep' } }); return Promise.resolve(api.rpc(name, args || {})).catch(function (e) { return { error: e }; }); }
    function card(r) {
      var c = el('div', 'mx-room' + (r.house ? ' house' : '') + (r.mine && !r.published ? ' wait' : ''));
      var by = r.house ? '' : (r.card_slug ? 'c/' + encodeURIComponent(r.card_slug) + '/' : (r.sid ? 'wall/#s-' + r.sid : ''));
      c.innerHTML = '<span class="mx-room-k">' + esc(r.label || (r.house ? 'The house' : (r.author || 'A member') + '’s room')) + '</span><b>' + esc(r.name) + '</b>' +
        (r.line ? '<span class="mx-room-l">' + esc(r.line) + '</span>' : '') +
        (!r.house ? '<span class="mx-room-by">put up by ' + (by ? '<a href="' + esc(by) + '">' + esc(r.author) + '</a>' : esc(r.author)) + (r.mine && !r.published ? ' · <em>on the desk, not public yet</em>' : '') + '</span>' : '') +
        '<span class="mx-room-go"><button type="button" class="mx-btn">Open the room</button>' +
        '<a href="https://open.spotify.com/playlist/' + esc(r.playlist) + '" target="_blank" rel="noopener">In Spotify &rarr;</a>' +
        (r.mine ? '<button type="button" class="mx-link mx-room-del">Take it down</button>' : '') + '</span><span class="mx-room-embed"></span>';
      c.querySelector('.mx-btn').addEventListener('click', function () {
        var host = c.querySelector('.mx-room-embed');
        if (host.firstChild) { host.innerHTML = ''; this.textContent = 'Open the room'; return; }
        host.innerHTML = '<iframe src="https://open.spotify.com/embed/playlist/' + esc(r.playlist) + '?utm_source=generator&theme=0" height="380" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="' + esc(r.name) + '"></iframe>';
        this.textContent = 'Close the room';
      });
      var del = c.querySelector('.mx-room-del');
      if (del) del.addEventListener('click', function () {
        if (!confirm('Take this room down?')) return;
        rpc('room_delete', { p_id: r.id }).then(function (q) { if (q && q.error) { alert(q.error.message || 'That did not go through.'); return; } c.remove(); });
      });
      return c;
    }
    house.forEach(function (r) { wrap.appendChild(card(r)); });
    function paintFoot() {
      if (!isMember()) { foot.innerHTML = '<p class="mx-note">Members put up rooms. <a href="join/?next=home">Log in</a> or <a href="wall/">join the Crypt</a>.</p>'; return; }
      if (foot.querySelector('form')) return;
      foot.innerHTML = '<form class="mx-room-add" novalidate><label>Your playlist<input name="link" maxlength="300" inputmode="url" placeholder="a Spotify playlist link"></label>' +
        '<label>Name it<input name="name" maxlength="60" placeholder="what the room is called"></label>' +
        '<label>Label<input name="label" maxlength="40" placeholder="late drives, pre-show, the pit"></label>' +
        '<label class="wide">A line<input name="line" maxlength="200" placeholder="one line on what plays in there"></label>' +
        '<div class="mx-room-row"><small>Five rooms each. The desk okays it, then it is out.</small><span class="mx-room-msg" role="status"></span><button type="submit" class="mx-btn">Put it up</button></div></form>';
      var f = foot.querySelector('form'), msg = f.querySelector('.mx-room-msg');
      f.elements.link.addEventListener('change', function () {
        var m = /playlist[\/:]([A-Za-z0-9]{22})/.exec(f.elements.link.value) || /^([A-Za-z0-9]{22})$/.exec(f.elements.link.value.trim());
        if (!m || f.elements.name.value.trim()) return;
        fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/playlist/' + m[1])).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (j && j.title && !f.elements.name.value.trim()) f.elements.name.value = String(j.title).slice(0, 60); }).catch(function () {});
      });
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var m = /playlist[\/:]([A-Za-z0-9]{22})/.exec(f.elements.link.value) || /^([A-Za-z0-9]{22})$/.exec(f.elements.link.value.trim());
        if (!m) { msg.textContent = 'Paste a Spotify playlist link.'; f.elements.link.focus(); return; }
        if (!f.elements.name.value.trim()) { msg.textContent = 'Name the room.'; f.elements.name.focus(); return; }
        var btn = f.querySelector('button[type=submit]'); btn.disabled = true; msg.textContent = 'Saving…';
        rpc('room_save', { p: { playlist: m[1], name: f.elements.name.value.trim(), label: f.elements.label.value.trim(), line: f.elements.line.value.trim() } }).then(function (q) {
          btn.disabled = false;
          if (q && q.error) { msg.textContent = q.error.message || 'That did not go through.'; return; }
          msg.textContent = 'Up. It shows once the desk okays it.';
          setTimeout(function () { location.replace(location.pathname + '?r=' + Date.now() + '#rooms'); }, 700);
        });
      });
    }
    paintFoot();
    try { new MutationObserver(paintFoot).observe(root, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
    if (!api) return;
    rpc('rooms_list').then(function (q) {
      var rows = (q && !q.error && Array.isArray(q.data)) ? q.data : [];
      rows.filter(function (r) { return r.published; }).forEach(function (r) { wrap.appendChild(card(r)); });
      var mine = rows.filter(function (r) { return r.mine && !r.published; });
      if (mine.length) { mineBox.innerHTML = '<div class="rl-wk-h"><b>Yours, on the desk</b><span>' + mine.length + (mine.length === 1 ? ' room' : ' rooms') + ' waiting</span></div>'; mine.forEach(function (r) { mineBox.appendChild(card(r)); }); }
      // the desk: everything not out yet, with the switch
      var waiting = rows.filter(function (r) { return !r.published && !r.mine; });
      if (waiting.length && w.OTP && OTP.me) OTP.me().then(function (me) {
        if (!(me && me.profile && me.profile.is_admin)) return;
        var q2 = el('div', 'mx-rooms-queue'); q2.innerHTML = '<div class="rl-wk-h"><b>The desk</b><span>' + waiting.length + ' waiting</span></div>';
        waiting.forEach(function (r) {
          var row = el('div', 'mx-room-q', '<b>' + esc(r.name) + '</b><span>' + esc(r.author) + ' · ' + esc(r.label || '') + '</span><a href="https://open.spotify.com/playlist/' + esc(r.playlist) + '" target="_blank" rel="noopener">hear it</a><button type="button" class="mx-btn">Publish</button>');
          row.querySelector('button').addEventListener('click', function () { this.disabled = true; rpc('room_publish', { p_id: r.id, p_on: true }).then(function (x) { if (x && x.error) { alert(x.error.message || 'That did not go through.'); return; } location.reload(); }); });
          q2.appendChild(row);
        });
        sec.insertBefore(q2, wrap);
      }).catch(function () {});
    });
  }

  /* ================= PUT US ON ================= */
  // Same road as the tip box: it opens their own mail app, nothing is sent or stored from this page.
  function putUsOn() {
    var sec = d.getElementById('putuson'); if (!sec) return;
    head(sec, 'Put Us On', 'local artists', 'send the desk your music');
    var f = el('form', 'mx-pu');
    f.setAttribute('novalidate', '');
    f.innerHTML =
      '<label>Who are you<input name="who" maxlength="60" autocomplete="off" placeholder="Artist or band name"></label>' +
      '<label>Your music<input name="link" maxlength="300" inputmode="url" placeholder="Spotify, SoundCloud, YouTube, Bandcamp"></label>' +
      '<label>Where you play<input name="city" maxlength="60" placeholder="San Antonio, Austin, Houston"></label>' +
      '<label class="wide">Anything else<textarea name="note" rows="2" maxlength="600" placeholder="Next show, who you came up with, what to play first"></textarea></label>' +
      '<div class="mx-pu-row"><small>It opens your email app. Nothing is sent from this page.</small><button type="submit" class="mx-btn">Send it</button></div>' +
      '<p class="mx-pu-msg" role="status"></p>';
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = function (k) { return String((f.elements[k] && f.elements[k].value) || '').trim(); };
      var msg = f.querySelector('.mx-pu-msg');
      if (!v('who')) { msg.textContent = 'Who are you? Put your artist name.'; f.elements.who.focus(); return; }
      if (!/^https?:\/\/\S+\.\S+/.test(v('link'))) { msg.textContent = 'Paste a link to your music, starting with https://'; f.elements.link.focus(); return; }
      msg.textContent = '';
      var body = 'PUT US ON\n\nArtist: ' + v('who') + '\nMusic: ' + v('link') + '\nPlays in: ' + (v('city') || '-') + '\n\n' + (v('note') || '') + '\n\n(sent from 0fftheprint.com, Music tab)';
      w.location.href = 'mailto:offtheprintcollective@gmail.com?subject=' + encodeURIComponent('PUT US ON · ' + v('who').slice(0, 60)) + '&body=' + encodeURIComponent(body.slice(0, 1800));
    });
    sec.appendChild(f);
  }

  /* ================= THE JUMP BAR ================= */
  function jump() {
    var host = d.getElementById('mx-jump'); if (!host) return;
    var L = [['battle', 'Battle'], ['played', 'Our nights'], ['holders', 'Card holders'], ['texas', 'Texas'], ['lineage', 'Lineage'], ['lineup', 'Lineup'], ['releases', 'Drops'], ['rooms', 'Rooms'], ['putuson', 'Put us on']];
    host.innerHTML = L.filter(function (x) { return d.getElementById(x[0]); }).map(function (x) { return '<a href="#' + x[0] + '">' + esc(x[1]) + '</a>'; }).join('');
    if (!host.firstChild) host.remove();
  }

  function render() {
    if (!w.__OTP_MUSIC || P) return;
    P = w.__OTP_MUSIC; M = P.music || {};
    [cover, rotationEnd, picks, battle, played, holders, texas, lineage, lineup, drops, rooms, putUsOn, jump, radio].forEach(function (f) {
      try { f(); } catch (e) { try { console.warn('music:', f.name, e.message); } catch (x) {} }
    });
    root.setAttribute('data-music', 'ready');
  }
  w.OTPMusic = { queue: function () { return P ? queue() : null; }, playFrom: playFrom };
  if (w.__OTP_MUSIC) render(); else w.addEventListener('otp:music', render);
})(window, document);
