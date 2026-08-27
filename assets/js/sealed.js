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
  var deck = [];
  function reshuffle() {
    deck = [];
    for (var i = 0; i < n; i++) deck.push(i);
    // Fisher-Yates. This one IS random: the ORDER you meet the night in can
    // differ, the rarity of a given frame cannot.
    for (var j = deck.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = deck[j]; deck[j] = deck[k]; deck[k] = t;
    }
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

  var cover = (media[0] && media[0].thumb) || '';
  var pct = Math.round((PACK / n) * 100);

  seal.innerHTML =
    '<button class="sl-pack" id="sl-pack" type="button" aria-label="Tear the pack open">' +
      '<span class="art"></span><span class="foil"></span><span class="glare"></span>' +
      '<span class="lip"></span>' +
      '<span class="face">' +
        '<span class="mk">Last Night<i>sealed</i></span>' +
        '<span class="bot"><b>' + esc(N.venue || '') + '</b>' +
          esc(N.dateShort || '') + ' &middot; ' + n + ' frames &middot; sealed</span>' +
      '</span>' +
    '</button>' +
    '<div class="sl-say">' +
      '<div class="big">Tear it open</div>' +
      '<div class="sub">' + PACK + ' frames a pack. Odds of pulling yourself: decent if you were there.</div>' +
      '<div class="odds">In this pack: <b>1</b> hit &middot; <b>' + counts.holo + '</b> holo &middot; ' +
        '<b>' + counts.shine + '</b> shine &middot; <b>' + counts.common + '</b> common' +
        '<br>Chance of the hit in one rip: <b>' + PACK + ' in ' + n + '</b>, about ' + pct + '%.</div>' +
    '</div>' +
    '<div class="sl-acts" id="sl-acts"></div>' +
    '<div class="sl-hand" id="sl-hand"></div>' +
    '<button class="sl-skip" id="sl-skip" type="button">Just show me the whole night</button>';

  if (grid && grid.parentNode) grid.parentNode.insertBefore(seal, grid);
  else return;

  var art = seal.querySelector('.art');
  if (cover) art.style.backgroundImage = 'url("' + String(cover).replace(/"/g, '%22') + '")';

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

  function cardEl(idx, delay) {
    var m = media[idx];
    var r = rarityOf(idx);
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'sl-card ' + r;
    b.style.animationDelay = delay + 'ms';
    b.innerHTML =
      '<img src="' + esc(m.thumb) + '" alt="Frame ' + (idx + 1) + '" loading="lazy" decoding="async">' +
      '<span class="tag"><span class="no">' + (idx + 1) + ' / ' + n + '</span>' +
      '<span class="rar">' + LABEL[r] + '</span></span>';
    // hand the frame straight to the page's own lightbox: full res link, arrows
    // and keyboard already live there and a second viewer would be a second
    // thing to keep in step
    b.onclick = function () { if (typeof N.show === 'function') N.show(idx); };
    return b;
  }

  function deal() {
    if (!deck.length) return;
    var take = Math.min(PACK, deck.length);
    for (var i = 0; i < take; i++) {
      var idx = deck.shift();
      pulled++;
      handEl.appendChild(cardEl(idx, i * 110));
    }
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

  packEl.addEventListener('click', function () {
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
  });
})(window, document);
