/* THE TAKE on its own page (take/index.html, 11/12). His call: "just 1 timeline", then "merge": The Take and The Roll
 * are ONE members' timeline behind the door, called The Take. The page is the old home with everything but the
 * timeline switched off (take/index.html is its own source; assets/css/take.css hides the rest). This file loads
 * right after desk.js and before anything asks for the feed, and changes three things for this page only:
 *
 *   THE FEED   OTP.feed() answers with roll_feed(60, every post) (045): every post a member may see, the public ones
 *              and the members-only ones, newest first, in the shape the timeline's own renderer already draws.
 *              Nobody signed in gets nothing here (the Roll's door card shows instead).
 *   A POST     a post with a photo is sent members only, the way the Roll's own box posts (membersOnly, and the photo
 *              goes up as a Roll photo). Since migration 053 the database decides anyway: every new post by a member
 *              goes behind the door, words alone included, whatever this page sends, and the line under the box says
 *              so. Only the desk's own posts stay public unless the desk flags them.
 *   LINKS      the page lives one folder down with <base href="../">, so a bare #link would leave for the front
 *              page. Bare #links stay here; a link to one of the old home's tabs goes to that place on the street.
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
  d.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    ev.preventDefault();
    if (OWN[id]) return;
    if (/^[a-z][a-z0-9-]{0,30}$/.test(id) && d.getElementById(id) && !a.hasAttribute('data-keep')) location.href = './#' + id;
  }, true);

  /* the Roll's door card, in the Take's words (people.js draws it for anybody who is not in) */
  function reword(card) {
    var p = card.querySelector('p');
    if (p && /The Roll is where/.test(p.textContent)) p.textContent = 'The Take is the members’ timeline: posts and photos, one feed. It stays behind the door.';
    card.querySelectorAll('a[href="join/?next=home"]').forEach(function (a) { a.setAttribute('href', 'join/?next=take'); });
  }
  /* the box's own line, and the Roll's heading, in the one timeline's words */
  var NOTE = 'What you post here stays behind the door. Members only.';
  function words() {
    d.querySelectorAll('.rl-door').forEach(reword);
    var n = d.querySelector('#composer .cnote'); if (n && n.textContent !== NOTE) n.textContent = NOTE;
    var h = d.querySelector('#roll .section-head h2');
    if (h && !h.hasAttribute('data-take-h')) { h.setAttribute('data-take-h', ''); h.innerHTML = 'The Take <span class="accent">members only</span>'; }
    var sb = d.querySelector('#roll .section-head .sub');
    if (sb && !sb.hasAttribute('data-take-h')) { sb.setAttribute('data-take-h', ''); sb.textContent = 'behind the door · posts and photos, one timeline'; }
  }
  new MutationObserver(words).observe(d.documentElement, { childList: true, subtree: true });
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
