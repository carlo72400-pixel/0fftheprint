/* 0FF THE PRINT — LAST NIGHT, SEALED.
 *
 * Every /events/ dump arrives as a sealed pack instead of a wall of thumbnails.
 * You tear it, it deals you five frames, and the odds of pulling yourself are
 * decent if you were there.
 *
 * WHY IT EXISTS. A night dump is a grid of forty photographs, which is a
 * perfectly good archive and a completely flat thing to be handed. The house
 * already prints cards, already runs a booster pack on the front page, and
 * already shoots the room these people were standing in. This is the same
 * gesture pointed at the night: the frames ARE the cards, and the person
 * opening the pack might be in one.
 *
 * ⛔ ONE IMPLEMENTATION, SHARED. newevent.py writes the tag into every new
 *    dump and the five live ones were patched to match. Inlining this into the
 *    page template would mean every fix lands on future nights only and the
 *    nights already up drift away from it forever.
 *
 * ⛔ IT HIDES THE GRID ITSELF, the markup does not. If this file 404s or throws,
 *    the page is exactly the gallery that shipped before the pack existed. The
 *    grid is how a stranger finds their own face and gets the full res file;
 *    that must not depend on a game loading.
 *
 * CONTRACT: the page publishes window.OTPNight = { media, show, slug, title,
 * venue, dateShort } from its own inline script, which runs first because this
 * one is deferred.
 *
 * THE BINDER (10/4). What a pack deals is kept: assets/js/binder.js, loaded just
 * before this file, remembers every frame this phone has pulled. So a pack deals
 * what you have NOT pulled first, the page says where you stand, and pulling the
 * hit is a moment. ⛔ Optional: with no binder.js every line of it is skipped and
 * this is the pack that shipped before.
 */
(function (w, d) {
  'use strict';

  var N = w.OTPNight;
  if (!N || !Array.isArray(N.media) || !N.media.length) return;

  var media = N.media;
  var n = media.length;
  // THE MINI PACK (10/16, his call on a small night, XBONGX: "push it as a mini pack"). newevent.py --mini sets
  // OTPNight.mini: one rip deals all of it, the pouch is the smaller one with the MINI sticker (sealed.css), the words
  // say mini pack. The hit, the rarity and the binder are the same as any night's.
  var MINI = !!N.mini;
  var PACK = MINI ? n : 5;            // frames per pack
  var WHOLE = MINI ? 'mini pack' : 'night';

  /* ---------- rarity ----------
     ⛔ DETERMINISTIC, NOT RANDOM. A frame's rarity is a property OF THAT FRAME,
     the same for everybody who opens the night. That is the whole point: "did
     you get the gold one" only means something if the gold one is the same
     photograph for you and the person standing next to you. Rolling per view
     would make it noise. */
  // ⛔ FNV-1a ALONE IS NOT ENOUGH HERE and it shipped wrong once. Hashing
  //    "<slug>|0", "|1", "|2" changes only the last character, FNV avalanches
  //    badly in its HIGH bits, and dividing by 2^32 is asking the high bits for
  //    the answer. Measured across the five live nights it gave 55% holo on one
  //    and 0% holo on three, including Zen Haus at a flat 100% common: a rarity
  //    system with no rarity in it. The murmur3 fmix32 finisher is what makes
  //    the bits move. With it: 8 to 11% holo, 23 to 29% shine, the rest common.
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  var seed = String(N.slug || 'night');
  // exactly ONE hit per night, and never frame 1: the cover is the most seen
  // picture of the night already, so making it the chase hides nothing
  var hitIdx = n > 1 ? 1 + Math.floor(hash(seed + '|hit') * (n - 1)) : 0;

  function rarityOf(i) {
    if (i === hitIdx) return 'hit';
    var v = hash(seed + '|' + i);
    if (v < 0.10) return 'holo';
    if (v < 0.32) return 'shine';
    return 'common';
  }
  var LABEL = { hit: 'the hit', holo: 'holo', shine: 'shine', common: 'common' };

  var counts = { hit: 0, holo: 0, shine: 0, common: 0 };
  for (var i = 0; i < n; i++) counts[rarityOf(i)]++;

  /* ---------- the photo's own name (Wave 2, migration 043) ----------
     A tag names the photo ('017', 'v01': media/017_t.jpg), never its place in the lightbox, so a photo that comes
     down or a photo added never moves anybody's tag. Rarity above stays by place: it is a toy, the tag is a person.
     ⛔ INLINE ON PURPOSE. A night page loads desk.js by a plain string stamp.py never stamps, so a phone can hold an
        old desk.js with no frameName. OTP.frameName is asked only when it is there, and both read the name the same way. */
  var STEM_OK = /^[a-z0-9][a-z0-9_-]{0,40}$/;
  function stemOf(i) {
    var t = media[i] && media[i].thumb;
    if (w.OTP && typeof w.OTP.frameName === 'function') { try { var f = w.OTP.frameName(t); if (f) return f; } catch (e) {} }
    var m = /(?:^|\/)media\/([^\/?#]+?)_t\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.exec(String(t == null ? '' : t));
    var s = m ? m[1].toLowerCase() : '';
    return STEM_OK.test(s) ? s : null;
  }
  var IDX = {};                         // photo name -> its place on this page
  for (var ix = 0; ix < n; ix++) { var sx = stemOf(ix); if (sx && !IDX.hasOwnProperty(sx)) IDX[sx] = ix; }

  /* ---------- the deck ----------
     A pack never deals a frame twice until the night is exhausted, so ripping
     repeatedly walks the whole set instead of teasing the same six photos. */
  var B = w.OTPBinder || null;          // the binder, when binder.js is on the page
  var slugOk = /^[a-z0-9][a-z0-9-]{0,80}$/.test(seed);
  function kept(i) { try { return !!(B && slugOk && B.has(seed, i)); } catch (e) { return false; } }
  function mine() { try { return (B && slugOk) ? B.night(seed) : null; } catch (e) { return null; } }

  var deck = [];
  function shuffled(a) {
    // Fisher-Yates. This one IS random: the ORDER you meet the night in can
    // differ, the rarity of a given frame cannot.
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }
  function reshuffle() {
    // frames this phone has never pulled come off the top, so every rip moves the binder
    var fresh = [], seen = [];
    for (var i = 0; i < n; i++) (kept(i) ? seen : fresh).push(i);
    deck = shuffled(fresh).concat(shuffled(seen));
  }
  reshuffle();
  var pulled = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- build ---------- */
  var grid = d.getElementById('grid');
  var seal = d.createElement('div');
  seal.className = 'seal';

  var pct = Math.round((PACK / n) * 100);

  /* THE PARTY PACK (10/3). Every night is a full-art booster: pack.webp, sitting
     next to this page, is the night's own photo printed edge to edge on the pouch
     (makepack.py). A night that has none yet wears the house pack.
     .pk-b is the pouch and .pk-top is the same picture clipped to the top crimp,
     so the tear is the real seal coming off and not a white strip.
     The title is printed over the picture, as the pack's logo. */
  var tl = String(N.title || 'Last Night');
  seal.innerHTML =
    '<button class="sl-pack party' + (MINI ? ' mini' : '') + '" id="sl-pack" type="button" aria-label="Tear the ' + (MINI ? 'mini ' : '') + 'pack open">' +
      '<span class="pk-b"><img class="pk-w" alt="" width="520" height="878"></span>' +
      '<span class="pk-top"><img class="pk-w" alt="" width="520" height="878"></span>' +
      '<span class="face">' +
        '<span class="mk' + (tl.length <= 7 ? ' short' : tl.length > 16 ? ' long' : '') + '">' + esc(tl) + '</span>' +
        '<span class="bot"><b>' + esc(N.venue || '') + '</b>' +
          '<i>' + esc(N.dateShort || '') + ' &middot; ' + n + ' frames &middot; sealed</i></span>' +
      '</span>' +
    '</button>' +
    '<div class="sl-say">' +
      '<div class="big">Tear it open</div>' +
      '<div class="sub">' + (MINI ? 'A mini pack: one rip, all ' + n + ' frames.' : PACK + ' frames a pack.') +
        ' Odds of pulling yourself: decent if you were there.</div>' +
      '<div class="odds">In this pack: <b>1</b> hit &middot; <b>' + counts.holo + '</b> holo &middot; ' +
        '<b>' + counts.shine + '</b> shine &middot; <b>' + counts.common + '</b> common' +
        (MINI ? '<br>One rip opens the whole mini pack, the hit included.</div>'
              : '<br>Chance of the hit in one rip: <b>' + PACK + ' in ' + n + '</b>, about ' + pct + '%.</div>') +
      '<div class="sl-mine" id="sl-mine" hidden></div>' +
    '</div>' +
    '<div class="sl-acts" id="sl-acts"></div>' +
    '<div class="sl-hand" id="sl-hand"></div>' +
    '<button class="sl-skip" id="sl-skip" type="button">Just show me the whole night</button>';

  if (grid && grid.parentNode) grid.parentNode.insertBefore(seal, grid);
  else return;

  // the wrapper: this night's own, or the house pack if it has none yet
  var HOUSE = '../../assets/cathedral/pack-house.webp';
  var wraps = seal.querySelectorAll('.pk-w');
  var fell = false;
  function fallBack() { if (fell) return; fell = true; for (var q = 0; q < wraps.length; q++) wraps[q].src = HOUSE; }
  for (var q = 0; q < wraps.length; q++) { wraps[q].addEventListener('error', fallBack); wraps[q].src = 'pack.webp'; }
  // ⛔ THE HIT IS NEVER ON THE FRONT. makepack.py runs this file's own hitIdx hash
  //    and refuses to print that frame on a pack. Change the hash here and it has
  //    to change there (hit_index), or a pack can show the chase before the tear.

  var packEl = d.getElementById('sl-pack');
  var handEl = d.getElementById('sl-hand');
  var actsEl = d.getElementById('sl-acts');

  // ⛔ HERE, in script, never in the markup. See the header.
  grid.hidden = true;

  function openGrid(scroll) {
    grid.hidden = false;
    if (scroll) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  d.getElementById('sl-skip').onclick = function () {
    openGrid(true);
    this.remove();
  };

  function cardEl(idx, delay, isNew) {
    var m = media[idx];
    var r = rarityOf(idx);
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'sl-card ' + r + (isNew ? ' fresh' : '');
    b.style.animationDelay = delay + 'ms';
    b.innerHTML =
      '<img src="' + esc(m.thumb) + '" alt="Frame ' + (idx + 1) + '" loading="lazy" decoding="async">' +
      (isNew ? '<span class="nw">new</span>' : '') +
      '<span class="tag"><span class="no">' + (idx + 1) + ' / ' + n + '</span>' +
      '<span class="rar">' + LABEL[r] + '</span></span>';
    // hand the frame straight to the page's own lightbox: full res link, arrows
    // and keyboard already live there and a second viewer would be a second
    // thing to keep in step
    b.onclick = function () { if (typeof N.show === 'function') N.show(idx); };
    return b;
  }

  /* where this phone stands on this night. Says nothing until there is a binder with something in it. */
  var mineEl = d.getElementById('sl-mine');
  function paintMine(gotHit) {
    var st = mine();
    if (!mineEl || !st || !st.opened) return;
    mineEl.textContent = '';
    var a = d.createElement('button'); a.type = 'button'; a.className = 'sl-bind';
    a.textContent = 'In your binder: ' + st.have + ' of ' + n;
    a.onclick = function () { try { B.open(); } catch (e) {} };
    var t = d.createElement('span');
    t.className = st.hit ? 'got' : '';
    t.textContent = st.have >= n ? 'The whole ' + WHOLE + ' is yours.'
      : st.hit ? (gotHit ? 'You pulled the hit.' : 'You found the hit.')
      : 'The hit is still in there.';
    mineEl.appendChild(a); mineEl.appendChild(t);
    mineEl.hidden = false;
    if (gotHit) { mineEl.classList.remove('pop'); void mineEl.offsetWidth; mineEl.classList.add('pop'); }
  }

  function deal() {
    if (!deck.length) return;
    var take = Math.min(PACK, deck.length), gotHit = false;
    for (var i = 0; i < take; i++) {
      var idx = deck.shift(), isNew = false;
      pulled++;
      if (B && slugOk) {
        try { isNew = B.add(seed, idx, { total: n, hit: idx === hitIdx, thumb: media[idx] && media[idx].thumb }); } catch (e) {}
        if (isNew && idx === hitIdx) gotHit = true;
      }
      handEl.appendChild(cardEl(idx, i * 110, isNew));
    }
    if (B && slugOk) { try { B.rip(); } catch (e) {} }
    paintMine(gotHit);
    paintActs();
  }

  function paintActs() {
    actsEl.innerHTML = '';
    if (deck.length) {
      var again = d.createElement('button');
      again.type = 'button'; again.className = 'sl-btn';
      again.textContent = 'Rip another';
      again.onclick = deal;
      actsEl.appendChild(again);
    } else {
      var done = d.createElement('div');
      done.className = 'sl-done';
      done.textContent = 'that is the whole ' + WHOLE + ', ' + n + ' of ' + n;
      actsEl.appendChild(done);
    }
    var all = d.createElement('button');
    all.type = 'button'; all.className = 'sl-btn ghost';
    all.textContent = grid.hidden ? 'Open the whole night' : 'The whole night is below';
    all.onclick = function () { openGrid(true); paintActs(); };
    if (!grid.hidden) all.disabled = true;
    actsEl.appendChild(all);
  }

  // somebody who has been here before sees where they left off, before they tear
  (function () {
    var st = mine(); if (!st || !st.opened) return;
    var big = seal.querySelector('.sl-say .big'), sub = seal.querySelector('.sl-say .sub');
    if (st.have >= n) {
      if (big) big.textContent = 'You have the whole ' + WHOLE;
      if (sub) sub.textContent = 'All ' + n + ' frames are in your binder. Tear it anyway, or open the night below.';
    } else {
      if (big) big.textContent = 'Rip another';
      if (sub) sub.textContent = (n - st.have) + ' frames you have not pulled yet. They come out first.';
    }
    paintMine(false);
  })();

  function tear() {
    if (packEl.classList.contains('rip')) return;
    packEl.classList.add('rip');
    setTimeout(function () {
      packEl.classList.add('gone');
      setTimeout(function () {
        packEl.remove();
        seal.classList.add('has-hand');
        var say = seal.querySelector('.sl-say .big');
        var sub = seal.querySelector('.sl-say .sub');
        if (say) say.textContent = N.title || 'The night';
        if (sub) sub.textContent = MINI ? 'Tap a frame for the full res file. That is the whole mini pack.'
                                        : 'Tap a frame for the full res file. Rip again for five more.';
        var skip = d.getElementById('sl-skip');
        if (skip) skip.remove();
        deal();
      }, 300);
    }, 480);
  }
  packEl.addEventListener('click', tear);
  /* ---------- I'M IN THIS ONE (10/11, migration 037; by name since Wave 2, migration 043) ----------
     A member marks a photo as theirs from the lightbox. Their marks show as a dot on the grid tiles;
     other members see who is in a photo under the counter, each name a link to their Crypt page. Strangers see
     none of it: this only draws when is_wall_member says yes, and the tag calls are members-only at the database.
     Every tag is keyed by the photo's NAME (stemOf), never its place: frame_tag_by_name. Rows from before 043 carry
     only a place, so they fall back to the name of the photo at that place.
     NOT THEM (calls 9, 15): a member who sees somebody tagged in a photo that is not them tells the desk (report_add,
     kind frame_tag, target night/photo/sid). The desk (OTP.me() admin) sees every tag, hidden members too, and takes
     one off with the cross (desk_frame_untag).
     ⛔ Its own rpc() on OTP.sb(), never the newer desk.js methods: a phone may run an old cached desk.js here (see stemOf). */
  (function tags() {
    var lb = d.getElementById('lb'), lbc = d.getElementById('lbc'), lbdl = d.getElementById('lbdl');
    if (!lb || !lbc || !slugOk) return;
    // A night page carries no database scripts (strangers never need them). A saved session in localStorage
    // (the same sign cathedral.js reads) is the cue to fetch them, in order: config, the library, desk.js.
    if (!(w.OTP && OTP.configured && OTP.sb)) {
      var has = false; try { for (var i = 0; i < w.localStorage.length; i++) { if (/^sb-.*-auth-token/.test(w.localStorage.key(i) || '')) { has = true; break; } } } catch (e) {}
      if (!has || tags._loading) return;
      tags._loading = true;
      // ⛔ PINNED with SRI, the same file and hash as every page's own tag (newstory.py SUPABASE_JS / SUPABASE_SRI and
      //    stamp.py's PIN step): the floating @2 let the CDN swap the library under the site with no commit.
      var SB_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
      var SB_SRI = 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok';
      var load = function (src, cb, sri) {
        var sc = d.createElement('script');
        if (sri) { sc.integrity = sri; sc.crossOrigin = 'anonymous'; }
        sc.src = src; sc.onload = cb; sc.onerror = function () { tags._loading = false; }; d.head.appendChild(sc);
      };
      load('../../supabase-config.js', function () {
        load(SB_JS, function () {
          load('../../assets/js/desk.js', function () { tags._loading = false; if (w.OTP && OTP.configured) tags(); });
        }, SB_SRI);
      });
      return;
    }
    var MINE = {}, WHO = {}, SENT = {}, cur = -1, on = false, ready = false, DESK = false, MYUID = null, MYSID = null, asked = false;
    var SID = /^[0-9a-f]{10}$/;
    function rpc(name, args) { return Promise.resolve(OTP.sb().rpc(name, args || {})).catch(function (e) { return { error: e }; }); }
    // the database's own sentence, short enough for the button
    function said(err, fall) { return String((err && err.message) || fall || 'That did not go through.').slice(0, 90); }
    // a row's photo: its name (043), or the photo at the place it was tagged (a row from before 043)
    function keyOf(x) { var k = String((x && x.media) || '').toLowerCase(); return STEM_OK.test(k) ? k : (x && x.frame != null ? stemOf(x.frame | 0) : null); }
    var btn = d.createElement('button'); btn.type = 'button'; btn.className = 'lb-tag'; btn.hidden = true; btn.textContent = "I'm in this one";
    var who = d.createElement('div'); who.className = 'lb-who'; who.hidden = true;
    if (lbdl && lbdl.parentNode) { lbdl.parentNode.insertBefore(btn, lbdl); lbdl.parentNode.insertBefore(who, lbdl); } else { lb.appendChild(btn); lb.appendChild(who); }
    function dots() {
      var tiles = d.querySelectorAll('#grid .tile[data-i]');
      for (var i = 0; i < tiles.length; i++) {
        var k = stemOf(+tiles[i].getAttribute('data-i')), has = !!(k && MINE[k]), dot = tiles[i].querySelector('.tag-dot');
        if (has && !dot) { dot = d.createElement('span'); dot.className = 'tag-dot'; dot.textContent = 'you'; tiles[i].appendChild(dot); }
        else if (!has && dot) dot.remove();
      }
    }
    // The look chips (a night printed more than one way) sit over the bottom of the lightbox and wrap to two rows
    // on a phone, right where this row was pinned, so the row moves up over them. The stylesheet reads --lb-tag-b.
    function place() {
      var chips = d.getElementById('lblooks'), b = 52;
      if (chips && !chips.hidden && chips.offsetHeight) b = Math.max(b, Math.round(lb.getBoundingClientRect().bottom - chips.getBoundingClientRect().top + 8));
      lb.style.setProperty('--lb-tag-b', b + 'px');
    }
    function small(cls, text, label) {
      var b = d.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text;
      if (label) b.setAttribute('aria-label', label);
      return b;
    }
    function paint() {
      var st = cur >= 0 ? stemOf(cur) : null;
      if (!ready || !st) { btn.hidden = true; who.hidden = true; return; }
      btn.hidden = false;
      btn.classList.toggle('on', !!MINE[st]);
      btn.textContent = MINE[st] ? "You're in this one" : "I'm in this one";
      // each name opens that person's page in the Crypt (frame_tags_of only sends people whose page is open; the desk
      // also gets the hidden ones, named as such and never linked).
      // ⛔ textContent for the names, never innerHTML: a display name is whatever its owner typed.
      var list = WHO[st] || [];
      who.hidden = !list.length;
      who.textContent = list.length ? 'In this frame: ' : '';
      list.forEach(function (x, i) {
        if (i) who.appendChild(d.createTextNode(', '));
        var sid = String(x.sid || '');
        if (x.open && SID.test(sid)) { var a = d.createElement('a'); a.href = '../../wall/#s-' + sid; a.textContent = x.name; who.appendChild(a); }
        else who.appendChild(d.createTextNode(x.open ? x.name : x.name + ' (hidden)'));
        if (DESK) { if (x.user) who.appendChild(untag(x, st)); return; }
        if (!SID.test(sid) || sid === MYSID) return;
        var target = seed + '/' + st + '/' + sid;
        if (SENT[target]) { var r = d.createElement('span'); r.className = 'bn-sent'; r.textContent = 'Reported'; who.appendChild(r); return; }
        var nt = small('bn-notthem', 'Not them?', 'Not ' + x.name + '? Tell the desk');
        nt.addEventListener('click', function (ev) { ev.stopPropagation(); chooser(target); });
        who.appendChild(nt);
      });
      place();
    }
    // the desk's cross: one tag off this photo, after a yes
    function untag(x, st) {
      var b = small('bn-untag', String.fromCharCode(215), 'Take ' + x.name + ' off this photo');
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!w.confirm('Take ' + x.name + ' off this photo?')) return;
        b.disabled = true;
        rpc('desk_frame_untag', { p_user: x.user, p_slug: seed, p_media: st }).then(function (r) {
          if (r && r.error) { b.disabled = false; btn.textContent = said(r.error); return; }
          if (x.user === MYUID) { delete MINE[st]; dots(); }
          names().then(function () { if (r && r.data === false) btn.textContent = 'That tag is already gone.'; });
        });
      });
      return b;
    }
    // NOT THEM: the chooser the rest of the site uses ('Tell the desk why', a chip per reason, 'Never mind';
    // 'Something else' opens a short note). Who sent it is only ever the desk's to see.
    function chooser(target) {
      var had = who.querySelector('.bn-why'); if (had) { had.remove(); if (had.getAttribute('data-t') === target) return; }
      var box = d.createElement('div'); box.className = 'bn-why'; box.setAttribute('data-t', target);
      box.addEventListener('click', function (ev) { ev.stopPropagation(); });
      // typing a note must not page the lightbox (arrows) or close it (Escape)
      box.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
      var head = d.createElement('b'); head.textContent = 'Tell the desk why'; box.appendChild(head);
      var chips = d.createElement('div'); chips.className = 'bn-why-c'; box.appendChild(chips);
      var msg = d.createElement('p'); msg.className = 'bn-why-m'; msg.setAttribute('role', 'status');
      var choices = null;
      try { if (OTP.reportChoices) choices = OTP.reportChoices('frame_tag'); } catch (e) {}
      if (!Array.isArray(choices) || !choices.length) choices = [['not_them', 'That is not them'], ['other', 'Something else']];
      function send(why, note) {
        var all = box.querySelectorAll('button'); for (var k = 0; k < all.length; k++) all[k].disabled = true;
        rpc('report_add', { p_kind: 'frame_tag', p_target: target, p_why: why, p_note: note || null }).then(function (r) {
          if (r && r.error) {
            for (var k = 0; k < all.length; k++) all[k].disabled = false;
            msg.textContent = /members only|permission denied/i.test(r.error.message || '') ? 'Reporting is for members.' : said(r.error, 'That did not send. Try again.');
            if (!msg.parentNode) box.appendChild(msg);
            return;
          }
          SENT[target] = 1;
          paint();
          var ok = d.createElement('span'); ok.className = 'bn-said';
          ok.textContent = r && r.data === 'already' ? 'You sent this one. The desk has it.' : 'Sent. Only the desk sees who sent it.';
          who.appendChild(ok); place();
        });
      }
      function chip(label, fn, go) { var b = small('bn-why-b' + (go ? ' go' : ''), label); b.addEventListener('click', fn); chips.appendChild(b); return b; }
      choices.forEach(function (c) {
        chip(c[1], function () {
          if (c[0] !== 'other') { send(c[0], null); return; }
          if (box.querySelector('input')) return;
          var inp = d.createElement('input'); inp.type = 'text'; inp.maxLength = 140; inp.placeholder = 'What is wrong? (optional)';
          inp.setAttribute('aria-label', 'What is wrong? (optional)');
          var row = d.createElement('div'); row.className = 'bn-why-c';
          var go = small('bn-why-b go', 'Send');
          go.addEventListener('click', function () { send('other', inp.value.trim() || null); });
          row.appendChild(go); box.appendChild(inp); box.appendChild(row);
          try { inp.focus({ preventScroll: true }); } catch (e) {}
        });
      });
      chip('Never mind', function () { box.remove(); });
      who.appendChild(box);
      place();
    }
    function read() {
      var m = /(\d+)\s*\/\s*\d+/.exec(lbc.textContent || '');
      cur = m ? (+m[1] - 1) : -1; paint();
    }
    btn.addEventListener('click', function () {
      var st = cur >= 0 ? stemOf(cur) : null;
      if (!st || on) return; on = true; btn.disabled = true;
      var want = !MINE[st];
      rpc('frame_tag_by_name', { p_slug: seed, p_media: st, p_on: want, p_frame: cur }).then(function (r) {
        on = false; btn.disabled = false;
        // the database's sentence, in the button ('That photo came down.', 'This page is out of date...')
        if (r && r.error) { btn.textContent = said(r.error); return; }
        if (want) MINE[st] = 1; else delete MINE[st];
        dots(); paint();
        names();   // your own name joins (or leaves) the line now, not on the next visit
      });
    });
    try { new MutationObserver(read).observe(lbc, { childList: true, characterData: true, subtree: true }); } catch (e) {}
    try { w.addEventListener('resize', function () { if (ready) place(); }); } catch (e) {}
    function names() {
      // the desk reads every tag (hidden members too, with who they are); everyone else, the open ones
      var p = DESK
        ? rpc('desk_frame_tags', { p_slug: seed }).then(function (r) { return (r && !r.error && Array.isArray(r.data)) ? r : rpc('frame_tags_of', { p_slug: seed }); })
        : rpc('frame_tags_of', { p_slug: seed });
      return p.then(function (r) {
        if (!r || r.error || !Array.isArray(r.data)) return;
        WHO = {};
        r.data.forEach(function (x) {
          var k = keyOf(x); if (!k) return;
          (WHO[k] = WHO[k] || []).push({ name: String(x.name || 'Member'), sid: x.sid, user: x.user_id || null, open: x.open !== false });
        });
        paint();
        if (!DESK && !asked) return mine();
      });
    }
    // which of these tags I already told the desk about, once a page (report_mine; nothing on any failure)
    function mine() {
      asked = true;
      var t = [];
      Object.keys(WHO).forEach(function (k) { WHO[k].forEach(function (x) { if (SID.test(String(x.sid || ''))) t.push(seed + '/' + k + '/' + x.sid); }); });
      if (!t.length) return;
      return rpc('report_mine', { p_kind: 'frame_tag', p_targets: t.slice(0, 200) }).then(function (r) {
        if (!r || r.error || !Array.isArray(r.data) || !r.data.length) return;
        r.data.forEach(function (x) { SENT[String(x)] = 1; });
        paint();
      });
    }
    function meNow() { try { return Promise.resolve(OTP.me ? OTP.me() : null).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); } }
    // only a member. my_frames answers any login (an empty list for somebody who is not in the Crypt yet), so
    // the member test asks first: anyone else would be offered the button and then told "Members only."
    rpc('is_wall_member').then(function (m) {
      if (!m || m.error || m.data !== true) return null;
      return Promise.all([rpc('my_frames'), meNow()]);
    }).then(function (got) {
      if (!got) return;
      var r = got[0], me = got[1];
      DESK = !!(me && me.profile && me.profile.is_admin);
      MYUID = me && me.user ? me.user.id : null;
      if (!r || r.error || !Array.isArray(r.data)) return;
      r.data.forEach(function (x) { if (x.event_slug === seed) { var k = keyOf(x); if (k) MINE[k] = 1; } });
      ready = true; dots(); read();
      // your own name gets no Not them? (the database would say "That one is yours.")
      if (!DESK) rpc('my_account').then(function (a) { var s = a && !a.error && a.data && a.data.sid; if (SID.test(String(s || ''))) { MYSID = s; paint(); } });
      return names();
    });
  })();

  // a link that says "tear it open" (the homepage, the binder) lands here already tearing
  if (w.location.hash === '#rip') {
    try { w.history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) {}
    setTimeout(tear, 650);
  }
  // a frame link from the homepage contact sheet (#f12, 10/7): the pack steps aside, the grid opens and
  // that frame comes up big. The pack is still there to tear, the link just did not ask for it.
  var fm = /^#f(\d{1,4})$/.exec(w.location.hash || '');
  if (fm && +fm[1] >= 1 && +fm[1] <= n) {
    try { w.history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) {}
    openGrid(false);
    var sk = d.getElementById('sl-skip'); if (sk) sk.remove();
    setTimeout(function () { try { N.show(+fm[1] - 1); } catch (e) {} }, 250);
  }
  // a photo by its NAME (#m017, Wave 2: OTP.frameLink, the Crypt's Frames you're in, the desk's lists). A name stays
  // put when a photo before it comes down, a number does not. A photo no longer on the night opens the grid only.
  var mm = /^#m([A-Za-z0-9][A-Za-z0-9_-]{0,40})$/.exec(w.location.hash || '');
  if (mm) {
    var mAt = IDX.hasOwnProperty(mm[1].toLowerCase()) ? IDX[mm[1].toLowerCase()] : -1;
    try { w.history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) {}
    openGrid(false);
    var mk = d.getElementById('sl-skip'); if (mk) mk.remove();
    if (mAt >= 0) setTimeout(function () { try { N.show(mAt); } catch (e) {} }, 250);
  }
})(window, document);
