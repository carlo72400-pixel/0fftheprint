/* THE TAKE IS THE EIGHTH CARD (11/13). The members' timeline at /take/ wears the Coven's card: the cloth and the two
 * thin sides, a title plate in THE TAKE's pink with the camera, and YOUR HAND along the bottom, the same eight small cards
 * as on the Coven's page with THE TAKE lifted. Each of the other seven goes to its card there (wall/#c-<card>).
 *
 * This file only DRESSES the page. It asks the database for nothing and changes no key's job:
 *   THE SKIN     html.tkc switches assets/css/take-card.css on. It goes on only when that sheet has loaded (the sheet
 *                sets --tkc-css) and comes off again if one of the eight drawings does not load: then the page is the
 *                page it was, and the console says why.
 *   THE PLATE    its right side is a seal of the camera with two stars. The page keeps no "since you last looked", so
 *                there is no true number to show there.
 *   THE HAND     a member only (html[data-door="in"], the page's own answer). Two cards carry a number, the two the page
 *                already asks for itself (cathedral.js, for the old home's member strip that is still in the page, hidden):
 *                unread on WHISPERS (dm_inbox) and asks on KINDRED (friend_asks). Read off those two hidden badges.
 *                THE SIGNS and YOUR PATH carry none here: the page does not know tonight's count or the saved nights.
 *   THE STATES   #take-mount says wait, empty or full (data-tkc), so the sheet can show a stamp and a plain line.
 *
 * BUILT into the site as assets/js/take-card.js by the street kit's take_card_build.py (the cards' names, colours and
 * drawings come from the Coven's own table there). Edit machine-tools/take_card.js in the kit, then build, then stamp.py.
 */
(function (w, d) {
  'use strict';
  var root = d.documentElement;
  if (!root.hasAttribute('data-take') || w.__tkc) return;
  w.__tkc = true;
  var CARDS = [{"id": "signs", "name": "THE SIGNS", "line": "tonight's flyers", "art": "street/coven/signs.webp?v=c1bd29e7", "px": [280, 249], "c": "#e23a56", "c2": "#e86178", "href": "wall/#c-signs"}, {"id": "stars", "name": "THE STARS", "line": "the month ahead", "art": "street/coven/stars.webp?v=b1e89453", "px": [280, 243], "c": "#343e94", "c2": "#5d65a9", "href": "wall/#c-stars"}, {"id": "visions", "name": "VISIONS", "line": "what's showing", "art": "street/coven/visions.webp?v=a23ad5ac", "px": [264, 234], "c": "#7a3ea8", "c2": "#9565b9", "href": "wall/#c-visions"}, {"id": "path", "name": "YOUR PATH", "line": "your plan for the night", "art": "street/coven/path.webp?v=267f9eb4", "px": [280, 276], "c": "#268e84", "c2": "#51a59d", "href": "wall/#c-path"}, {"id": "kindred", "name": "KINDRED", "line": "your people", "art": "street/coven/kindred.webp?v=cffc2f86", "px": [184, 280], "c": "#e88a36", "c2": "#eda15e", "href": "wall/#c-kindred", "live": 1, "badge": "hk-kin-n"}, {"id": "whispers", "name": "WHISPERS", "line": "your messages", "art": "street/coven/whispers.webp?v=79cf0696", "px": [201, 280], "c": "#3c3c4e", "c2": "#636371", "href": "wall/#c-whispers", "live": 1, "badge": "hk-dm-n"}, {"id": "take", "name": "THE TAKE", "line": "the timeline", "art": "street/coven/take.webp?v=c15e1077", "px": [271, 280], "c": "#ec6ea4", "c2": "#f08bb6", "href": "take/"}, {"id": "palm", "name": "YOUR PALM", "line": "your page", "art": "street/coven/palm.webp?v=c9b3976f", "px": [280, 269], "c": "#c4963c", "c2": "#d0ab63", "href": "wall/#c-palm"}], ME = 'take';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ready(fn) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function () {
    var has = '';
    try { has = String(w.getComputedStyle(root).getPropertyValue('--tkc-css')).trim(); } catch (e) { has = ''; }
    if (has !== '1') { console.error('the take card: its styles did not load, so the page stays as it was.'); return; }
    var wrap = d.querySelector('.wrap'), mount = d.getElementById('take-mount');
    if (!wrap || !d.querySelector('.sk-top')) { console.error('the take card: the page is not laid out the way this expects (no .wrap or no strip), so it stays as it was.'); return; }
    var mine = CARDS.filter(function (c) { return c.id === ME; })[0];

    /* the frame, the plate, the hand */
    var frame = d.createElement('div'); frame.className = 'tkc-frame'; frame.setAttribute('aria-hidden', 'true');
    frame.innerHTML = '<i class="tkc-rail l"></i><i class="tkc-rail r"></i>';
    var plate = d.createElement('header'); plate.className = 'tkc-plate'; plate.id = 'tkc-plate';
    plate.innerHTML = '<img alt="" width="58" height="58" draggable="false" src="' + esc(mine.art) + '"><div><h2 id="tkc-pn">' + esc(mine.name) + '</h2><p>' + esc(mine.line) + '</p></div>' +
      '<div class="tkc-px" aria-hidden="true"><i class="tkc-emb"><img alt="" src="' + esc(mine.art) + '"></i></div>';
    var hand = d.createElement('nav'); hand.className = 'tkc-hand'; hand.id = 'tkc-hand'; hand.setAttribute('aria-label', 'Your hand. The eight cards.');
    hand.innerHTML = '<div class="tkc-tip" id="tkc-tip" aria-hidden="true"><b></b><small></small></div><div class="tkc-hand-in" id="tkc-hand-in">' + CARDS.map(function (c, i) {
      var cur = c.id === ME;
      return '<a class="tkc-hc" data-tkc="' + esc(c.id) + '" href="' + esc(c.href) + '"' + (cur ? ' aria-current="page"' : ' tabindex="-1"') + ' style="--c:' + esc(c.c) + ';--c2:' + esc(c.c2) + ';--r:' + ((i - 3.5) * 1.5).toFixed(1) + 'deg;--y:' + (Math.abs(i - 3.5) * 1.2).toFixed(1) + 'px">' +
        '<span class="tkc-hf" aria-hidden="true"><span class="tkc-in"><img alt="" decoding="async" draggable="false" width="' + c.px[0] + '" height="' + c.px[1] + '" data-art="' + esc(c.art) + '"></span></span>' +
        (c.live ? '<em class="tkc-n" data-tkc-n="' + esc(c.id) + '" hidden></em>' : '') + '</a>';
    }).join('') + '</div>';
    var handIn = hand.querySelector('.tkc-hand-in'), tip = hand.querySelector('.tkc-tip');
    d.body.insertBefore(frame, d.body.firstChild);
    wrap.insertBefore(plate, wrap.firstChild);
    d.body.appendChild(hand);
    root.classList.add('tkc');

    var obs = [], off = false;
    function undo(why) {
      if (off) return; off = true;
      console.error('the take card: ' + why + ', so the page stays as it was.');
      root.classList.remove('tkc', 'tkc-ok');
      [frame, plate, hand].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      obs.forEach(function (o) { try { o.disconnect(); } catch (e) { /* already off */ } });
      if (mount) mount.removeAttribute('data-tkc');
    }
    /* every drawing has to come. The camera first, for everybody (the plate, the stamps, a stranger's card). The other
       seven only once the page says a member is here: a stranger never asks for them. They wait in data-art, a name of
       their own: the page's lazy loader (OTPLazy) takes over anything that carries data-src. */
    var cam = new Image();
    cam.onerror = function () { undo('the camera drawing did not load (' + mine.art + ')'); };
    cam.src = mine.art;
    var dealt = false;
    function deal() {
      if (dealt || off || root.getAttribute('data-door') !== 'in') return; dealt = true;
      var ims = Array.prototype.slice.call(handIn.querySelectorAll('img[data-art]')), left = ims.length;
      ims.forEach(function (im) {
        im.addEventListener('load', function () { if (--left === 0 && !off) { root.classList.add('tkc-ok'); fit(); } }, { once: true });
        im.addEventListener('error', function () { undo('a drawing did not load (' + im.getAttribute('data-art') + ')'); }, { once: true });
        im.src = im.getAttribute('data-art');
      });
    }

    /* the two numbers the page already has: unread whispers, asks from kindred (cathedral.js fills these hidden badges) */
    var SAY = { whispers: function (n) { return n + ' unread'; }, kindred: function (n) { return n + (n === '1' ? ' ask' : ' asks'); } };
    function label(c, n) { return c.name + '. ' + c.line.charAt(0).toUpperCase() + c.line.slice(1) + '.' + (n && SAY[c.id] ? ' ' + SAY[c.id](n) + '.' : '') + (c.id === ME ? ' You are here.' : ''); }
    function nums() {
      CARDS.forEach(function (c) {
        var src = c.badge ? d.getElementById(c.badge) : null, n = src && !src.hidden ? String(src.textContent || '').trim() : '';
        if (!/^\d{1,2}\+?$/.test(n) || n === '0') n = '';
        var k = handIn.querySelector('[data-tkc="' + c.id + '"]'), b = k && k.querySelector('.tkc-n');
        if (b) { b.textContent = n; b.hidden = !n; }
        if (k) k.setAttribute('aria-label', label(c, n));
      });
    }
    CARDS.forEach(function (c) {
      var src = c.badge ? d.getElementById(c.badge) : null; if (!src || !w.MutationObserver) return;
      var o = new MutationObserver(nums); o.observe(src, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); obs.push(o);
    });
    nums();

    /* the hand: when eight 44 px cards do not fit it scrolls sideways, and the lifted card is brought into view */
    function fit() {
      handIn.classList.toggle('ovf', handIn.scrollWidth > handIn.clientWidth + 1);
      var cur = handIn.querySelector('[aria-current="page"]');
      if (cur && handIn.classList.contains('ovf')) handIn.scrollLeft = Math.max(0, cur.offsetLeft + cur.offsetWidth / 2 - handIn.clientWidth / 2);
    }
    w.addEventListener('resize', fit);
    if (w.MutationObserver) { var od = new MutationObserver(function () { deal(); fit(); }); od.observe(root, { attributes: true, attributeFilter: ['data-door'] }); obs.push(od); }
    deal(); fit();
    /* the card you are on goes back to its top; the other seven are plain links to their cards */
    handIn.addEventListener('click', function (ev) {
      var k = ev.target.closest ? ev.target.closest('.tkc-hc') : null; if (!k || k.getAttribute('data-tkc') !== ME) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button) return;
      ev.preventDefault(); w.scrollTo(0, 0);
    });
    handIn.addEventListener('keydown', function (ev) {
      var ks = Array.prototype.slice.call(handIn.querySelectorAll('.tkc-hc')), i = ks.indexOf(d.activeElement); if (i < 0) return;
      var j = ev.key === 'ArrowRight' ? i + 1 : ev.key === 'ArrowLeft' ? i - 1 : ev.key === 'Home' ? 0 : ev.key === 'End' ? ks.length - 1 : -1;
      if (j < 0 || j >= ks.length || j === i) return;
      ev.preventDefault(); ks[j].focus(); if (ks[j].scrollIntoView) ks[j].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    /* the little name box over the hand: a card's name and its plain line, while a key or a mouse is on it */
    function tipShow(k) {
      var c = CARDS.filter(function (x) { return x.id === k.getAttribute('data-tkc'); })[0]; if (!c) return;
      tip.firstChild.textContent = c.name; tip.lastChild.textContent = c.line;
      var r = k.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.style.left = Math.max(8, Math.min(w.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px'; tip.classList.add('on');
    }
    function tipOff() { tip.classList.remove('on'); }
    handIn.addEventListener('focusin', function (ev) { var k = ev.target.closest ? ev.target.closest('.tkc-hc') : null; if (k && k.matches(':focus-visible')) tipShow(k); });
    handIn.addEventListener('focusout', tipOff);
    if (w.matchMedia && w.matchMedia('(hover:hover)').matches) {
      handIn.addEventListener('mouseover', function (ev) { var k = ev.target.closest ? ev.target.closest('.tkc-hc') : null; if (k) tipShow(k); });
      handIn.addEventListener('mouseleave', tipOff);
    }
    w.addEventListener('scroll', tipOff, { passive: true });

    /* the timeline's state, for the stamp and the plain line: wait until the first post is drawn, empty if none came */
    if (mount) {
      var late = false;
      var st = function () { if (!off) mount.setAttribute('data-tkc', mount.children.length ? 'full' : late ? 'empty' : 'wait'); };
      if (w.MutationObserver) { var om = new MutationObserver(st); om.observe(mount, { childList: true }); obs.push(om); }
      setTimeout(function () { late = true; st(); }, 9000);
      st();
    }
  });
})(window, document);
