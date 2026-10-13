/* THE MUSIC TAB (10/11). His call on the music brainstorm: "Apply all of them".
 *
 *   THE COVER        one pick on top with a desk note. site.music_cover (the overlay) pins it,
 *                    else content/music.json cover, else the first track on rotation.
 *   0TP RADIO        plays every track on this tab front to back through the lounge radio bar
 *                    (lounge.js), shuffle on a tap. After 7pm on the visitor's clock, "Play all"
 *                    plays the night room (music.json night) instead: the lounge goes dark at 7 too.
 *   ROWS             On Rotation (index.html draws it), Card Holders' Picks, From Our Nights,
 *                    Card Holders, The Texas Shelf. Each rail ends on a next-up card.
 *   ROTATION BATTLE  two tracks, members vote for the ISO week in the battle id (migration 036).
 *                    Wave 2 (call 11): the winner is real. `_build/music/build_music.py close` reads
 *                    the tally, writes the winner first into content/rotation.json (won: {week, mon, tie})
 *                    and into music.json `winners`. Between the week closing and that run, stays() draws
 *                    the winner first on On Rotation (a .won tile, the gap); once it is a seed it only
 *                    moves the seed to the front. Past Winners lists the newest four.
 *   WHO PLAYED       every night we shot, every act on the bill, a play button each.
 *   THE LINEUP       music.json's shows plus the Run's (call 6: OTP.upcoming, shows and festivals), one
 *                    row for a night on both. A card holder's night links their card.
 *   THE LINEAGE · DROPS · THE ROOMS · PUT US ON   (music.json, committed; the rooms also from 038)
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
  // door.js paints a closed account (closed by them or by the desk) as 'wait' too, with the key on Your account.
  // The Crypt step is not theirs to take, so say what the door says. A banned login stays "Almost in" (door.js 023).
  function closedDoor() {
    var k = d.getElementById('nav-key');
    return root.getAttribute('data-door') === 'wait' && !!k && /(^|\/)my\/#account$/.test(k.getAttribute('href') || '');
  }
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
  // On Rotation is drawn by index.html; its rail ends here, on the battle when there is one.
  // The card says what the battle box will say: no "Vote" before it opens or after it closes.
  function rotationEnd() {
    var rail = d.getElementById('rotation-mount'); if (!rail || rail.querySelector('.shelf-next')) return;
    var wk = battleWeek();
    rail.appendChild(wk
      ? nextCard('music', 'Next up', 'Rotation Battle', 'Two tracks fight for a spot. Members vote, the winner stays.',
          wk.state === 'soon' ? 'Opens ' + when(wk.mon) : wk.state === 'done' ? 'See who won' : 'Vote', '#battle')
      : nextCard('music', 'Next up', 'Your pick here', 'Card holders can put a song on rotation.', 'Put one on', 'compose/#rot'));
  }
  // the rotation view credits a pick by card_slug ('kav-man', 'theink'): print the card's own name.
  // ⛔ a slug is not always slugify(name) (The Ink holds `theink`), so match letters and digits only
  // Wave 2 (call 2): the roster arrives merged with the cards (OTP.peopleMerge), so a seat carries its card_slug
  // and the holder's display_name. The slug is asked first, then the old letters-only match.
  function tight(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function seatOf(slug) {
    var s = String(slug || '').toLowerCase(), k = tight(slug), hit = null;
    if (!k) return null;
    (P.roster || []).forEach(function (r) { if (!hit && r && r.card_slug && String(r.card_slug).toLowerCase() === s) hit = r; });
    (P.roster || []).forEach(function (r) { if (!hit && r && r.name && tight(r.name) === k) hit = r; });
    return hit;
  }
  function nameFor(slug) { var r = seatOf(slug); return (r && (r.display_name || r.name)) || slug; }
  function picks() {
    var host = d.getElementById('mx-picks'); if (!host) return;
    var live = P.live || [];
    var rail = shelf(host, 'picks', 'Card Holders’ Picks', 'put on by people with cards', live.length || null);
    live.forEach(function (e) { var id = trackId(e.track || e.link); if (!id) return; rail.appendChild(tile({ platform: 'spotify', title: e.title, artist: e.artist, art: e.art, link: spLink(id), track: id, by: nameFor(e.by), note: noteFor(id, e) })); });
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
      // the holder's own name (call 2: the card row's display_name, else the seat's)
      var nm = r.display_name || r.name;
      var t = tile({ platform: 'spotify', title: 'Theme song', artist: nm + '’s theme', art: r.photo || '', link: spLink(id) + (st ? '?t=' + st : ''), track: id,
        sub: mm ? 'opens at ' + mm : '', card: true });
      t.dataset.a = nm;
      rail.appendChild(t);
      fill(id, function (m) { var ti = t.querySelector('.track-title'); if (ti) ti.textContent = m.title; t.dataset.t = m.title; });
    });
    // call 5, one door: a card is asked for under Kin in the Crypt, never on /join/ (log in only now)
    rail.appendChild(nextCard('join', 'Next up', 'Get a card', 'Join the Crypt, then ask under Kin.', 'Get in', 'wall/'));
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
    // ⛔ lineup() runs after this and takes #lineup off the page when no show is still ahead: no dead link then.
    // The Run answers later (call 6): when its shows fill an empty lineup, lineup() swaps this card with texasNext(true).
    TEXAS_RAIL = rail;
    texasNext(upcoming().length > 0);
  }
  var TEXAS_RAIL = null;
  function texasNext(has) {
    var rail = TEXAS_RAIL; if (!rail || !rail.isConnected) return;
    var old = rail.querySelector(':scope > .shelf-next');
    if (old && (old.getAttribute('href') === '#lineup') === has) return;
    var card = has
      ? nextCard('coming', 'Next up', 'Texas shows', 'Who is playing Texas next, with tickets.', 'The lineup', '#lineup')
      : nextCard('music', 'Next up', 'Put Us On', 'Making music in Texas? Send the desk your music.', 'Send it', '#putuson');
    if (old) rail.replaceChild(card, old); else rail.appendChild(card);
  }

  /* ================= ROTATION BATTLE ================= */
  function isoMonday(id) {
    var m = /^(\d{4})-w(\d{2})$/.exec(String(id || '')); if (!m) return null;
    var j4 = new Date(+m[1], 0, 4, 12), mon1 = new Date(j4.getTime() - ((j4.getDay() + 6) % 7) * 864e5);
    return new Date(mon1.getTime() + (+m[2] - 1) * 7 * 864e5);
  }
  // the battle's week and where it stands (soon / open / done), or null when music.json has no usable battle.
  // One answer for both the battle box and On Rotation's next-up card.
  function battleWeek() {
    var B = M.battle, mon = B && isoMonday(B.id);
    if (!mon || !B.a || !B.b || !trackId(B.a.track) || !trackId(B.b.track)) return null;
    var sun = new Date(mon.getTime() + 6 * 864e5), now = today();
    return { mon: mon, sun: sun, state: days(now, mon) > 0 ? 'soon' : days(sun, now) > 0 ? 'done' : 'open' };
  }
  function battle() {
    var sec = d.getElementById('battle'), B = M.battle;
    if (!sec) return;
    var wk = battleWeek();
    if (!wk) {
      // no battle set: the winners still have their list
      if (!pastList().length) { sec.remove(); return; }
      head(sec, 'Rotation Battle', 'past winners', 'every winner stays on rotation');
      pastWinners(sec);
      return;
    }
    var mon = wk.mon, sun = wk.sun, state = wk.state, A = B.a, Bb = B.b;
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
    pastWinners(sec);
    // a closed week build_music.py already recorded (music.json winners): its counts stand in until the
    // live tally answers, and stay when it cannot (no counts on a phone with no signal is still a result)
    var rec = (M.winners || []).filter(function (x) { return x && x.battle === B.id && Array.isArray(x.votes); })[0];
    var T = state === 'done' && rec ? { a: +rec.votes[0] || 0, b: +rec.votes[1] || 0, mine: null } : null;
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
      var who = state === 'open' ? (isMember() ? (T ? 'Tap one. You can change it till Sunday.' : 'Votes open soon.') : 'Members vote.')
        : state === 'soon' ? 'Voting opens ' + when(mon) + '.' : '';
      var tail = state === 'done' ? (T && n ? (a === b ? 'Closed. Dead even. Both stay on rotation.' : 'Closed. ' + (a > b ? A.title : Bb.title) + ' won the week. It stays on rotation.') : 'Closed.')
        : state === 'open' ? ' Closes ' + when(sun) + '.' : '';
      // call 5, one door: a stranger gets in at the Crypt, never /join/ (log in only now)
      line.innerHTML = esc(msg || (who + tail)) + (state === 'open' && !isMember() && !msg && !closedDoor() ? ' <a href="wall/">Get in at the Crypt &rarr;</a>' : '');
    }
    function load() {
      if (state === 'soon' || !(w.OTP && OTP.configured && OTP.sb)) { paint(); stays(); return; }
      Promise.resolve(OTP.sb().rpc('battle_tally', { p_battle: B.id })).then(function (r) {
        if (r && !r.error && r.data && r.data[0]) { T = r.data[0]; T.a = +T.a || 0; T.b = +T.b || 0; }
        paint(); stays();
      }).catch(function () { paint(); stays(); });
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
    // Once the week is over the winner (both, on a tie, a before b) sits first on On Rotation.
    // build_music.py close makes it a seed (rotation.json, won: {...}), and index.html already printed
    // "won the week of" on it: then this only moves that tile to the front, so it keeps the desk's pencil
    // (edit.js skips .won). Before close runs (the gap), the winner is drawn here as a .won tile.
    // Runs again after every load(): a tile it finds by data-sp is moved, never drawn twice.
    // ⛔ Once close has run (music.json winners names this week) the rail is rotation.json plus the desk's
    //    overlay. A winner the desk took off or swapped stays off: no .won tile, which has no pencil.
    var closed = (M.winners || []).some(function (x) { return x && x.battle === B.id; });
    function stays() {
      if (state !== 'done' || !T || !(T.a + T.b)) return;
      var rail = d.getElementById('rotation-mount'); if (!rail) return;
      var tie = T.a === T.b, win = tie ? [A, Bb] : [T.a > T.b ? A : Bb];
      var sub = (tie ? 'tied' : 'won') + ' the week of ' + MON3[mon.getMonth()] + ' ' + mon.getDate();
      win.slice().reverse().forEach(function (x) {
        var id = trackId(x.track); if (!id) return;
        var have = rail.querySelector('.track[data-sp="' + id + '"]');      // id is 22 letters and digits: safe in a selector
        if (have) {
          var sb = have.querySelector('.track-sub');
          if (!sb || /^(won|tied) the (week|battle)/.test(sb.textContent)) {
            if (!sb) {
              var info = have.querySelector('.track-info'), after = info && (info.querySelector('.track-artist') || info.querySelector('.track-title'));
              sb = el('span', 'track-sub');
              if (after) after.insertAdjacentElement('afterend', sb); else if (info) info.appendChild(sb);
            }
            sb.textContent = sub;
          }
          if (rail.firstChild !== have) rail.insertBefore(have, rail.firstChild);
          return;
        }
        if (closed) return;                                                  // not on the rail after close: the desk's call
        var t = tile({ platform: 'spotify', title: x.title, artist: x.artist, art: x.art, link: spLink(id), track: id, sub: sub, note: x.note || noteFor(id) });
        t.classList.add('won');
        rail.insertBefore(t, rail.firstChild);
      });
    }
    paint(); load();
  }
  // PAST WINNERS: music.json winners (build_music.py close), newest first, the last four. A tie is two rows.
  function pastList() {
    return (M.winners || []).filter(function (x) { return x && trackId(x.track) && x.title; }).slice(0, 4);
  }
  function weekLabel(x) {
    var dt = ymd(x.mon);
    if (dt) return MON3[dt.getMonth()] + ' ' + dt.getDate();
    return /^[A-Z][a-z]{2} \d{1,2}$/.test(String(x.week || '')) ? String(x.week) : '';
  }
  function pastWinners(sec) {
    var list = pastList(); if (!list.length) return;
    var box = el('div', 'mx-pw');
    box.innerHTML = '<div class="mx-sub-h"><h3>Past Winners</h3><span>each one stays on rotation</span></div>';
    var ol = el('ol', 'mx-pw-list');
    list.forEach(function (x) {
      var id = trackId(x.track), wl = weekLabel(x);
      var li = el('li');
      var a = el('a', 'mx-pw-row');
      a.href = spLink(id); a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<span class="mx-pw-art" aria-hidden="true"></span><span class="mx-pw-t">' +
        esc([x.title, x.artist].filter(Boolean).join(', ') + (wl ? ' · week of ' + wl : '')) + '</span><i aria-hidden="true">&#9654;</i>';
      var art = safe(x.art);
      if (art) a.querySelector('.mx-pw-art').style.backgroundImage = 'url("' + P.sized(art, 'thumb') + '")';
      a.addEventListener('click', function (ev) { if (playFrom(id)) ev.preventDefault(); });
      li.appendChild(a); ol.appendChild(li);
    });
    box.appendChild(ol);
    sec.appendChild(box);
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
  // the shows still ahead (today counts), soonest first. The Texas Shelf asks too, before this section draws.
  function upcoming() {
    var now = today();
    return (M.lineup || []).filter(function (s) { var dt = ymd(s.date); return dt && days(now, dt) >= 0; })
      .sort(function (a, b) { return ymd(a.date) - ymd(b.date); });
  }
  // THE RUN (call 6): the house calendar is the one place for dates. Its shows and festivals from today on
  // (OTP.upcoming, one calendar read per page) join music.json's lineup. A night on both shows once: same date,
  // and the same room (the first 6 letters of the venue) or a word of 4+ letters both names share, stop words
  // out. The Run's row stays and borrows the json's ticket. Two json rows that fit equally (Paper Tiger runs two
  // stages a night) take no twin: then all of them show.
  var LU_STOP = { tour: 1, with: 1, night: 1, live: 1, presents: 1, fest: 1, festival: 1, show: 1, party: 1, after: 1, weekend: 1,
    official: 1, tickets: 1, free: 1, ages: 1, guests: 1, special: 1, release: 1, halloween: 1, band: 1, music: 1 };
  function luKey(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function luRoom(v) { var k = luKey(v).slice(0, 6); return k.length >= 4 ? k : ''; }
  function luWords(v) { var o = {}; (String(v || '').toLowerCase().match(/[a-z0-9$]{4,}/g) || []).forEach(function (x) { if (!LU_STOP[x]) o[x] = 1; }); return o; }
  function luShare(a, b) { for (var k in a) if (b[k]) return true; return false; }
  function fromRun(r) {
    return { date: r.on_date, artist: String(r.title || '').trim(), bill: String(r.note || '').trim(), venue: r.venue || '', city: r.city || '',
      ticket: r.link || '', who: r.credit || r.by || '', whoName: (r.credit ? r.credit_name : r.by_name) || '', run: true };
  }
  function merged(json, rows) {
    var now = today(), out = json.slice(), taken = {}, extra = [];
    (rows || []).forEach(function (r) {
      if (!r || (r.kind !== 'show' && r.kind !== 'festival')) return;
      var dt = ymd(r.on_date); if (!dt || days(now, dt) < 0 || !String(r.title || '').trim()) return;
      var s = fromRun(r), room = luRoom(s.venue), words = luWords(s.artist), city = luKey(s.city), best = 0, hits = [];
      json.forEach(function (j, i) {
        if (taken[i] || String(j.date || '').slice(0, 10) !== String(r.on_date).slice(0, 10)) return;
        var jc = luKey(j.city), same = !!room && room === luRoom(j.venue), shared = luShare(words, luWords(j.artist));
        // a shared name alone holds only in the same city (an act on two stages of two cities that night is two nights)
        if (!same && !(shared && (!city || !jc || city === jc))) return;
        var sc = (same ? 4 : 0) + (shared ? 2 : 0) + (city && city === jc ? 1 : 0);
        if (sc > best) { best = sc; hits = [i]; } else if (sc === best) hits.push(i);
      });
      if (hits.length !== 1) { extra.push(s); return; }
      var j = json[hits[0]]; taken[hits[0]] = 1;
      out[hits[0]] = Object.assign({}, s, { ticket: safe(j.ticket) ? j.ticket : s.ticket, source: j.source || '', bill: s.bill || j.bill || '', twin: true });
    });
    return out.concat(extra).sort(function (a, b) { return ymd(a.date) - ymd(b.date); });
  }
  // a Run row's card holder (credit, else whoever put it up), when the house is not the one and the seat is
  // on show: a banned, closed or demoted holder's seat is off the merged roster, so their name stays plain
  var SLUG_OK = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;
  function holderOf(s) {
    var slug = String(s.who || '').toLowerCase(), house = (w.OTP && OTP.HOUSE_SLUG) || 'vamppsych';
    if (!s.run || !SLUG_OK.test(slug) || slug === house) return null;
    var seat = (P.roster || []).filter(function (r) { return r && String(r.card_slug || '').toLowerCase() === slug; })[0];
    return seat ? { slug: slug, name: s.whoName || seat.display_name || seat.name || slug } : null;
  }
  function lineup() {
    var sec = d.getElementById('lineup'); if (!sec) return;
    var now = today();
    var shows = upcoming(), list = null, more = null;
    function draw() {
      if (list) return;
      head(sec, 'The Lineup', 'Texas', 'shows coming up, with tickets');
      list = el('div', 'mx-lu');
      sec.appendChild(list);
      more = el('p', 'mx-lu-more');
      sec.appendChild(more);
      try { new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
    }
    function paint() {
      var all = isMember(), cut = all ? shows : shows.slice(0, 3);
      list.innerHTML = '';
      cut.forEach(function (s) {
        var dt = ymd(s.date), off = days(now, dt);
        var t = safe(s.ticket) || safe(s.source), who = holderOf(s);
        // a row with a name link is not one big link (no link inside a link): the ticket side stretches over it instead
        var row = el(t && !who ? 'a' : 'div', 'mx-lu-row' + (s.run ? ' run' : '') + (who ? ' has-who' : '') + (who && t ? ' tix' : ''));
        row.dataset.src = s.run ? 'run' : 'json';
        if (s.twin) row.dataset.twin = '1';
        if (t && !who) { row.href = t; row.target = '_blank'; row.rel = 'noopener'; }
        var go = (off === 0 ? 'Tonight' : off === 1 ? 'Tomorrow' : 'In ' + off + ' days') + (t ? '<i>Tickets &rarr;</i>' : '');
        row.innerHTML = '<span class="mx-lu-d"><b>' + DOW3[dt.getDay()] + '</b>' + MON3[dt.getMonth()] + ' ' + dt.getDate() + '</span>' +
          '<span class="mx-lu-m"><b>' + esc(s.artist) + '</b>' + (s.bill ? '<span>' + esc(s.bill) + '</span>' : '') +
          (who ? '<span class="mx-lu-who"><a href="c/' + encodeURIComponent(who.slug) + '/">' + esc(who.name) + '</a>’s night</span>' : '') +
          '<em>' + esc([s.venue, s.city].filter(Boolean).join(' · ')) + '</em></span>' +
          (who && t ? '<a class="mx-lu-go mx-lu-hit" href="' + esc(t) + '" target="_blank" rel="noopener">' + go + '</a>' : '<span class="mx-lu-go">' + go + '</span>');
        list.appendChild(row);
      });
      var rest = shows.length - cut.length;
      // ⛔ never say these dates are "in the Crypt": most are not on its calendar. Members see them all right here.
      more.innerHTML = rest > 0 ? rest + ' more ' + (rest === 1 ? 'date' : 'dates') + ' for members. ' + (rest === 1 ? 'It shows' : 'They show') +
        ' right here once you are in the Crypt.' + (closedDoor() ? '' : ' <a href="wall/">Get in &rarr;</a>') : '';
      more.hidden = rest <= 0;
    }
    // the committed list draws at once; the Run joins when it answers. No answer, an error or no library: json only.
    if (shows.length) { draw(); paint(); }
    var run = (w.OTP && OTP.configured && OTP.upcoming) ? Promise.resolve().then(function () { return OTP.upcoming(60); }) : Promise.resolve([]);
    run.then(function (rows) { return Array.isArray(rows) ? rows : []; }, function () { return []; }).then(function (rows) {
      var all = merged(shows, rows);
      // the empty check runs after the merge: a Run show can fill an empty lineup, and nothing at all takes the section off
      if (!all.length) { sec.remove(); jump(); return; }
      var grew = all.length !== shows.length || all.some(function (s) { return s.run; });
      shows = all;
      if (!list) draw();
      if (grew || !list.firstChild) paint();
      texasNext(true); jump();
    }).catch(function (e) { try { console.warn('music: lineup', e && e.message); } catch (x) {} });
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

    // CALL 9, REPORT: a member (never the desk) can report somebody else's room that is out. Not the house's
    // rooms, not the desk's own (report_add refuses both anyway). The shared chooser, as on the Take's comments:
    // 'Tell the desk why', one chip per reason (OTP.reportChoices), 'Never mind'; 'Something else' opens a short
    // note. A room this viewer already reported says Reported (OTP.myReports). Who sent it is only the desk's to see.
    var REP = [], repDone = null, repAsked = false, isDesk = null;
    function canReport(r) { return !r.house && !!r.published && !r.mine && r.kind !== 'desk' && r.id != null; }
    function repSay(c, text, bad) {
      var m = c.querySelector(':scope > .mx-rep-msg');
      if (!m) { m = el('p', 'mx-rep-msg'); m.setAttribute('role', 'status'); c.insertBefore(m, c.querySelector(':scope > .mx-room-embed')); }
      m.className = 'mx-rep-msg' + (bad ? ' bad' : ''); m.textContent = text;
    }
    function chooser(c, r) {
      var had = c.querySelector(':scope > .mx-why'); if (had) { had.remove(); return; }
      var box = el('div', 'mx-why'), chips = el('div', 'mx-chips');
      box.appendChild(el('b', null, 'Tell the desk why')); box.appendChild(chips);
      function send(why, note) {
        var btns = [].slice.call(box.querySelectorAll('button'));
        btns.forEach(function (b) { b.disabled = true; });
        OTP.report('room', r.id, why, note).then(function (res) {
          box.remove();
          repSay(c, res === 'already' ? 'You sent this one. The desk has it.' : 'Sent. Only the desk sees who sent it.');
          (repDone = repDone || new Set()).add(String(r.id));
          var b = c.querySelector('.mx-room-rep'); if (b) b.replaceWith(el('span', 'mx-room-rep done', 'Reported'));
        }, function (e) {
          btns.forEach(function (b) { b.disabled = false; });
          repSay(c, (e && e.message) || 'That did not send. Try again.', true);
        });
      }
      function chip(label, fn, go) { var b = el('button', go ? 'go' : null); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); chips.appendChild(b); return b; }
      (OTP.reportChoices ? OTP.reportChoices('room') : []).forEach(function (p) {
        chip(p[1], function () {
          if (p[0] !== 'other') { send(p[0], null); return; }
          if (box.querySelector('input')) return;
          var inp = el('input'); inp.type = 'text'; inp.maxLength = 140; inp.placeholder = 'What is wrong? (optional)';
          inp.setAttribute('aria-label', 'What is wrong? (optional)');
          var row = el('div', 'mx-chips'), go = el('button', 'go'); go.type = 'button'; go.textContent = 'Send';
          go.addEventListener('click', function () { send('other', inp.value.trim() || null); });
          row.appendChild(go); box.appendChild(inp); box.appendChild(row); inp.focus();
        });
      });
      chip('Never mind', function () { box.remove(); });
      c.insertBefore(box, c.querySelector(':scope > .mx-room-embed'));
    }
    function paintReports() {
      var on = isMember() && isDesk === false && !!(w.OTP && OTP.report);
      REP.forEach(function (x) {
        var go = x.c.querySelector('.mx-room-go'), b = go.querySelector('.mx-room-rep');
        if (!on) { if (b) b.remove(); var open = x.c.querySelector(':scope > .mx-why'); if (open) open.remove(); return; }
        if (b) return;
        if (repDone && repDone.has(String(x.r.id))) { go.appendChild(el('span', 'mx-room-rep done', 'Reported')); return; }
        b = el('button', 'mx-link mx-room-rep', 'Report'); b.type = 'button';
        b.addEventListener('click', function () { chooser(x.c, x.r); });
        go.appendChild(b);
      });
    }
    // which of them this viewer reported, asked once they are a member (the door can answer after the rooms)
    function loadReports() {
      if (!REP.length || isDesk !== false || !isMember() || repAsked || !(w.OTP && OTP.myReports)) { paintReports(); return; }
      repAsked = true;
      OTP.myReports('room', REP.map(function (x) { return String(x.r.id); })).then(function (set) { repDone = set; }, function () {}).then(paintReports);
    }

    function paintFoot() {
      // a closed account: the door's own words and its way back (Your account), never the Crypt step
      if (closedDoor()) { foot.innerHTML = '<p class="mx-note">Members put up rooms. This account is closed. <a href="my/#account">Your account &rarr;</a></p>'; return; }
      // signed in with no Instagram yet ('wait'): "Log in" would bounce them to the timeline, so send them to the Crypt
      if (root.getAttribute('data-door') === 'wait') { foot.innerHTML = '<p class="mx-note">Members put up rooms. <a href="wall/">One more step at the Crypt</a> and you are in.</p>'; return; }
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
    try { new MutationObserver(function () { paintFoot(); loadReports(); }).observe(root, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
    if (!api) return;
    rpc('rooms_list').then(function (q) {
      var rows = (q && !q.error && Array.isArray(q.data)) ? q.data : [];
      rows.filter(function (r) { return r.published; }).forEach(function (r) {
        var c = card(r); wrap.appendChild(c);
        if (canReport(r)) REP.push({ c: c, r: r });
      });
      if (REP.length && w.OTP && OTP.me) OTP.me().then(function (me) { isDesk = !!(me && me.profile && me.profile.is_admin); }, function () { isDesk = null; }).then(loadReports);
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
  // runs again when the lineup's merge lands (it can add or take off #lineup after the first draw)
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
  w.OTPMusic = { queue: function () { return P ? queue() : null; } };   // lounge.js reads queue(); nothing outside calls playFrom
  if (w.__OTP_MUSIC) render(); else w.addEventListener('otp:music', render);
})(window, document);
