/* THE TAKE on its own page (take/index.html, 11/12). His call: "just 1 timeline", then "merge": The Take and The Roll
 * are ONE members' timeline, called The Take. The page is the old home with everything but the
 * timeline switched off (take/index.html is its own source; assets/css/take.css hides the rest). This file loads
 * right after desk.js and before anything asks for the feed, and changes four things for this page only:
 *
 *   THE FEED   OTP.feed() answers with roll_feed(60, every post) (045): every post a member may see, the public ones
 *              and the members-only ones, newest first, in the shape the timeline's own renderer already draws.
 *              Nobody signed in gets nothing here (the members-only card shows instead).
 *   A POST     a post with a photo is sent members only, the way the Roll's own box posts (membersOnly, and the photo
 *              goes up as a Roll photo). Since migration 053 the database decides anyway: every new post by a member
 *              is members only, words alone included, whatever this page sends, and the line under the box says
 *              so. Only the desk's own posts stay public unless the desk flags them.
 *   LINKS      the page lives one folder down with <base href="../">, so a bare #link would leave for the front
 *              page. Bare #links stay here; a link to one of the old home's tabs goes to that place on the street,
 *              and the members' tabs (people, roster, coven) go to the Coven's table (wall/).
 *   WORDS      11/13: THE TAKE is the eighth card of the Coven, and the page says so. A stranger's card reads THE TAKE
 *              is for members of the Coven, with the two ways in the old card had as two keys (Log in to
 *              join/?next=take, Join to wall/). The back key is Table (wall/) for a member and Street for anybody who
 *              is not in. The card's look is assets/css/take-card.css and assets/js/take-card.js; these words stand
 *              with or without it.
 *
 * ?post=<id> (a shared post) scrolls to that post once the feed has drawn. No new SQL. ⛔ Run stamp.py after editing.
 */
(function (w, d) {
  'use strict';
  var root = d.documentElement;
  if (!root.hasAttribute('data-take')) return;
  if (!w.OTP) { console.error('the take: desk.js did not load, the timeline cannot draw'); return; }
  var OTP = w.OTP, pub = OTP.feed.bind(OTP), post = OTP.post.bind(OTP);
  var up = OTP.uploadTakePhoto ? OTP.uploadTakePhoto.bind(OTP) : null;

  OTP.feed = async function (limit) {
    var me = null;
    try { me = await OTP.me(); } catch (e) { console.warn('the take: could not tell who is here', e); }
    if (!me) return [];
    var rows;
    try { rows = await OTP.rollFeed(60, { photos: false }); }
    catch (e) { console.warn('the take: the members feed did not answer, showing the public timeline', e); return pub(limit); }
    return rows.map(function (r) {
      return { id: r.id, author: r.card_slug || '', author_name: r.display_name, text: r.text, image: r.image_url || '',
               image_alt: r.image_alt || '', pinned: !!r.pinned, date: r.created_at, edited: r.edited_at || null,
               accent: r.accent || null, live: true, kind: r.kind || 'card', sid: r.sid || '', avatar: r.pic || '',
               mine: !!r.mine, members_only: !!r.members_only };
    });
  };
  OTP.post = function (o) { return post(Object.assign({}, o, { membersOnly: !!(o && o.imageUrl) })); };
  if (up) OTP.uploadTakePhoto = function (file, opts) { return up(file, Object.assign({}, opts, { roll: true })); };

  /* bare #links: stay on this page */
  var OWN = { '': 1, take: 1, roll: 1, home: 1, composer: 1 };
  var TABLE = { people: 1, roster: 1, coven: 1, crypt: 1, login: 1, join: 1 };      // the old home's members' tabs: the Coven's table now
  d.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    ev.preventDefault();
    if (OWN[id]) return;
    if (/^[a-z][a-z0-9-]{0,30}$/.test(id) && d.getElementById(id) && !a.hasAttribute('data-keep')) location.href = TABLE[id] ? 'wall/' : './#' + id;
  }, true);

  /* the card anybody who is not in gets (people.js draws the old home's members-only card; this is it in the Take's words).
     The two ways in it had are two keys, going where they went: Log in (join/?next=take) and Join (wall/). The three
     waiting states keep their own way on: one more step (wall/), waiting for a look (no key), a closed account (my/#account). */
  var CARD = {
    out:    ['<a class="tk-key go" href="join/?next=take">Log in</a><a class="tk-key" href="wall/">Join</a>', 'Log in with your email and password. Joining asks for your Instagram.'],
    step:   ['<a class="tk-key go" href="wall/">One more step</a>', 'Put your Instagram in at the Coven and you are in. One account per Instagram.'],
    look:   ['', 'Your Instagram is waiting for a look. Every one gets looked at before the Coven opens.'],
    closed: ['<a class="tk-key go" href="my/#account">Your account</a>', 'This account is closed.']
  };
  function reword(card) {
    if (card.hasAttribute('data-take-card')) return;
    var l = card.querySelector('.rl-door-l');
    var st = !l ? 'out' : l.querySelector('a[href="my/#account"]') ? 'closed' : l.querySelector('a[href^="join/"]') ? 'out' : l.querySelector('a[href="wall/"]') ? 'step' : 'look';
    card.setAttribute('data-take-card', st);
    card.innerHTML = '<span class="tk-name">The Take</span><b>Members only</b><p>The Take is for members of the Coven: posts and photos, one timeline.</p>' +
      (CARD[st][0] ? '<p class="rl-door-l tk-keys">' + CARD[st][0] + '</p>' : '') + '<p class="tk-fine">' + CARD[st][1] + '</p>';
  }
  /* the back key. street_skin.py writes the member's key into the page: Table, to the Coven's table. Anybody who is not in
     has no table to go back to, so for them it says Street and goes to the street. */
  var pill0 = null;
  function pill() {
    var p = d.querySelector('.sk-back'); if (!p) return;
    if (!pill0) pill0 = { html: p.innerHTML, href: p.getAttribute('href'), label: p.getAttribute('aria-label') };
    var st = root.getAttribute('data-door'), to = st === 'out' || st === 'wait' ? 'street' : 'table';
    if (p.getAttribute('data-take-to') === to) return;
    p.setAttribute('data-take-to', to);
    if (to === 'street') { p.innerHTML = '<span aria-hidden="true">&lsaquo;</span>Street'; p.setAttribute('href', './'); p.setAttribute('aria-label', 'Back to the street'); }
    else { p.innerHTML = pill0.html; p.setAttribute('href', pill0.href); p.setAttribute('aria-label', pill0.label); }
  }
  /* the box's own line, and the stranger's heading, in the one timeline's words */
  var NOTE = 'What you post here is for members of the Coven. Members only.';
  function words() {
    d.querySelectorAll('.rl-door').forEach(reword);
    pill();
    var n = d.querySelector('#composer .cnote'); if (n && n.textContent !== NOTE) n.textContent = NOTE;
    var h = d.querySelector('#roll .section-head h2');
    if (h && !h.hasAttribute('data-take-h')) { h.setAttribute('data-take-h', ''); h.innerHTML = 'The Take <span class="accent">members only</span>'; }
    var sb = d.querySelector('#roll .section-head .sub');
    if (sb && !sb.hasAttribute('data-take-h')) { sb.setAttribute('data-take-h', ''); sb.textContent = 'for members of the Coven \u00b7 posts and photos, one timeline'; }
  }
  new MutationObserver(words).observe(d.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-door'] });
  d.addEventListener('DOMContentLoaded', words);

  /* a shared post: ?post=<id> */
  var want = null;
  try { want = new URLSearchParams(location.search).get('post'); } catch (e) { console.warn('the take: could not read the address', e); }
  if (want && /^\d{1,12}$/.test(want)) {
    var tries = 0;
    var t = setInterval(function () {
      var el = d.querySelector('#take-mount [data-pid="' + want + '"]');
      if (el) {
        clearInterval(t);
        el.scrollIntoView({ block: 'center' });
        setTimeout(function () { el.scrollIntoView({ block: 'center' }); }, 1500);      // again once the photos above it have their height
        el.classList.add('take-lit'); setTimeout(function () { el.classList.remove('take-lit'); }, 2400);
      } else if (++tries > 40) clearInterval(t);
    }, 300);
  }
})(window, document);
