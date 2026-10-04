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

  var PACK = 5;                       // frames per pack
  var media = N.media;
  var n = media.length;

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
    '<button class="sl-pack party" id="sl-pack" type="button" aria-label="Tear the pack open">' +
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
      '<div class="sub">' + PACK + ' frames a pack. Odds of pulling yourself: decent if you were there.</div>' +
      '<div class="odds">In this pack: <b>1</b> hit &middot; <b>' + counts.holo + '</b> holo &middot; ' +
        '<b>' + counts.shine + '</b> shine &middot; <b>' + counts.common + '</b> common' +
        '<br>Chance of the hit in one rip: <b>' + PACK + ' in ' + n + '</b>, about ' + pct + '%.</div>' +
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
    t.textContent = st.have >= n ? 'The whole night is yours.'
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
      done.textContent = 'that is the whole night, ' + n + ' of ' + n;
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
      if (big) big.textContent = 'You have the whole night';
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
        if (sub) sub.textContent = 'Tap a frame for the full res file. Rip again for five more.';
        var skip = d.getElementById('sl-skip');
        if (skip) skip.remove();
        deal();
      }, 300);
    }, 480);
  }
  packEl.addEventListener('click', tear);
  // a link that says "tear it open" (the homepage, the binder) lands here already tearing
  if (w.location.hash === '#rip') {
    try { w.history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) {}
    setTimeout(tear, 650);
  }
})(window, document);
