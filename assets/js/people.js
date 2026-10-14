/* THE ROLL (10/11). His call on the People tab: "make people like an instagram feed for the members",
 * then "make it private, photos only", and the house's nights fill it while members warm up.
 * Wave 2 (his call 1): the Roll is MEMBERS ONLY for real. It reads roll_feed(60, photos) (045), not the public
 * take_feed, and what you post here stays behind the door. Home's Take is the public one.
 *
 *   THE DOOR     members only (html[data-door="in"], painted by cathedral.js off door.js). A stranger gets
 *                the door card and nothing else; Open A Pack under it stays public.
 *   POST         photo first: pick a photo, write a line, post. post({..., membersOnly: true}), so it never shows
 *                on Home. A casual member's photo goes up through uploadTakePhoto(file, {roll: true}) (the take
 *                bucket, an hour's cache, not a year), a card holder's through uploadImage. Same rules as the
 *                timeline (a line is optional, 12 a day for a casual member). The page reloads onto #roll so the
 *                new post lands through one render path. 'Your posts' is compose/, every post you made.
 *   (THIS WEEK, the row of member faces, came off 10/13, his call: it put the other members on show.)
 *   THE ROLL     the photo posts off roll_feed(60, photos): members only, the photo leads. A post made in Home's
 *                box shows here too and says On Home (everyone can see that one). Plus one card per night the
 *                house shot (events/events.json), newest first. Hearts, fire, skull, eye and comments are the
 *                timeline's own wiring (window.OTPWireReactions), so a tap here is the same tap as on Home.
 *                Double tap = heart. Your own post: Edit (your words, in place) and Delete. The desk: Pull on
 *                anybody else's (deskHide, so it is hidden, not gone: the board can put it back).
 *   CLIPS        the video posts (card holders can post video), one row.
 *   A NAME       tap one, their page opens as a sheet: avatar, name, seat, posts, a grid of their photos, the
 *                frames they marked, and their links: a card holder's card (/c/) and, for anybody on the Wall,
 *                their page in the Crypt. Faces and names come off OTP.people() (044's one list: roster.json
 *                with the cards and the dark seats folded in), keyed by card slug.
 *   FRAMES YOU'RE IN  the frames you marked "I'm in this one" (my_frames, by name since 043), 30, then Show all.
 *                Every frame (30 at random) came off by his call 4: it repeated Home's Contact Sheet.
 *
 * Everything fails quiet. ⛔ Run stamp.py after editing. ⛔ No em dashes in copy. ⛔ No arch shapes.
 */
(function (w, d) {
  'use strict';
  var root = d.documentElement;
  var mount = d.getElementById('roll-mount');
  if (!mount) return;
  var ACC = { acid: '#a3e635', gold: '#ffd479', ember: '#ff8a5c', pink: '#ff79c6', violet: '#c084fc', ice: '#a0e6ff' };
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // same allow-list as the timeline: https, root-relative, bare path, #anchor; never a scheme that runs
  function safe(u) {
    var v = String(u == null ? '' : u).trim();
    if (!v) return '';
    if (/^#[\w-]*$/.test(v)) return v;
    if (/^\/\//.test(v)) return '';
    if (/^(https?:)?\/\//i.test(v) || /^\/(?!\/)/.test(v) || /^[\w./-]+$/.test(v)) return /^\s*(javascript|data|vbscript):/i.test(v) ? '' : v.replace(/["']/g, '');
    return '';
  }
  function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
  function tight(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  // the 96px cut of a local photo (derive.py), the file itself for anything hosted. A card holder's own
  // card art ships as a -full/-card pair (uploadCardArt), and a circle gets the -card one, like index.html sized().
  function av(u) {
    u = safe(u); if (!u) return '';
    if (/\/storage\/v1\/object\/public\/cards\/.+-full\.jpg$/i.test(u)) return u.replace(/-full\.jpg$/i, '-card.jpg');
    var m = /^assets\/(?!(av|thumb|card|grid)\/)(.+)\.(jpe?g|png)$/i.exec(u); return m ? 'assets/av/' + m[2] + '.jpg' : u;
  }
  function isVideo(u) { return w.OTP && OTP.isVideo ? OTP.isVideo(u) : /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(u || '')); }
  function ymd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
  function ago(iso) {
    var t = new Date(iso).getTime(); if (!t) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'now'; if (m < 60) return m + 'm'; if (m < 1440) return Math.round(m / 60) + 'h';
    var dd = Math.round(m / 1440); if (dd < 7) return dd + 'd';
    var dt = new Date(t); return MON3[dt.getMonth()] + ' ' + dt.getDate();
  }
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function door() { return root.getAttribute('data-door'); }

  /* ---------- who is who: one list for faces and names (OTP.people(), 044) ---------- */
  // roster.json with the cards folded in: a holder's own card photo is item.photo (the house art when they set
  // none), and a banned, closed or demoted holder's seat is already dark (left out). Keyed by the card slug and
  // its tight form. ⛔ TWO KEYS: The Ink holds `theink`, WUN MOR holds `wunmor`, so a feed row's slug finds the seat.
  var ROSTER = { bySlug: {}, byTight: {} };
  function learn(items) {
    (items || []).forEach(function (x) {
      if (!x || !x.name) return;
      var rec = { name: x.display_name || x.name, photo: x.photo || '', accent: x.accent || '', seat: x.type_label || '' };
      var slug = String(x.card_slug || '').trim().toLowerCase() || slugify(x.name);   // an older list with no card_slug goes by its name
      if (slug && !ROSTER.bySlug[slug]) ROSTER.bySlug[slug] = rec;
      if (tight(slug) && !ROSTER.byTight[tight(slug)]) ROSTER.byTight[tight(slug)] = rec;
    });
  }
  function seatOf(slug) { slug = String(slug || '').trim().toLowerCase(); return slug ? (ROSTER.bySlug[slug] || ROSTER.byTight[tight(slug)] || null) : null; }
  function who(r) {
    var kind = r.kind || 'member';
    var rec = kind !== 'member' ? seatOf(r.card_slug) : null;
    // one profile: the name they go by (the database's), the seat's name only when the row has none
    var name = r.display_name || (rec && rec.name) || (kind === 'desk' ? 'THE DESK' : 'Member');
    var link = kind === 'member' ? (r.sid ? 'wall/#s-' + r.sid : '') : (r.card_slug ? 'c/' + encodeURIComponent(r.card_slug) + '/' : '');
    // a card holder: their card photo off the one list (the roster's art when they set none), then whatever the feed carries
    var photo = kind === 'member' ? safe(r.pic) : (av(rec && rec.photo) || av(r.pic));
    return { key: (kind === 'member' ? 'm:' + (r.sid || tight(r.display_name)) : 'c:' + (r.card_slug || tight(name))),
      name: name, photo: photo, link: link, kind: kind, sid: r.sid || '',
      // the card's own seat line (THE LENS), the same one Home prints
      seat: (kind !== 'member' && rec && rec.seat) || (kind === 'desk' ? 'The desk' : kind === 'card' ? 'Card holder' : 'Member'),
      accent: ACC[r.accent] || ACC[rec && rec.accent] || '' };
  }
  function avatar(p, cls) {
    var s = el('span', 'rl-av' + (cls ? ' ' + cls : ''));
    if (p.photo) s.style.backgroundImage = 'url("' + p.photo + '")'; else s.textContent = Array.from(String(p.name || '0').trim())[0] || '0';
    if (p.accent) s.style.setProperty('--ring', p.accent);
    return s;
  }

  /* ---------- the door ---------- */
  // A closed account paints like 'wait' (door.js), with its key on Your account. Banned stays the quiet 'wait' (023).
  function closedDoor() {
    var k = d.getElementById('nav-key');
    return root.getAttribute('data-door') === 'wait' && !!k && /(^|\/)my\/#account$/.test(k.getAttribute('href') || '');
  }
  function doorCard(state) {
    mount.innerHTML = '';
    var c = el('div', 'rl-door');
    c.innerHTML = '<img src="assets/cathedral/a/join.webp" alt="" width="96" height="96" decoding="async">' +
      '<b>Members only.</b><p>The Roll is where the people in the house post their photos. It stays behind the door.</p>' +
      (state === 'wait' && closedDoor() ? '<p class="rl-door-l">This account is closed. <a href="my/#account">Your account &rarr;</a></p>'
        : state === 'wait' ? '<p class="rl-door-l"><a href="wall/">One more step at the Crypt</a> and you are in.</p>'
        : '<p class="rl-door-l"><a href="join/?next=home">Log in</a> or <a href="wall/">join the Crypt</a>. All it takes is an Instagram.</p>');
    mount.appendChild(c);
  }

  /* ---------- POST: photo first, members only ---------- */
  function composer(me, canPost, casual, box) {
    // the face comes off the same one list as the feed, by card slug
    var prof = (me && me.profile) || {};
    var mine = seatOf(prof.card_slug);
    var meP = { name: prof.display_name || 'You', photo: casual ? '' : (av(mine && mine.photo) || av(prof.card_photo)), accent: '' };
    box.className = 'rl-post';
    if (!canPost) { box.innerHTML = '<p class="rl-note">Put your Instagram in at <a href="wall/">the Crypt</a> and you can post here.</p>'; return; }
    box.innerHTML = '<div class="rl-post-top"></div>' +
      '<label class="rl-pick"><input type="file" accept="' + (casual ? 'image/*' : 'image/*,video/*') + '" hidden><span class="rl-pick-b">&#43; ' + (casual ? 'Post a photo' : 'Post a photo or clip') + '</span></label>' +
      '<div class="rl-draft" hidden><div class="rl-prev"></div><textarea maxlength="800" rows="2" placeholder="A line, if you want one" aria-label="Your line"></textarea>' +
      '<div class="rl-draft-row"><button type="button" class="rl-x">Remove</button><span class="rl-msg" role="status"></span><button type="button" class="rl-go" disabled>Post</button></div></div>' +
      '<p class="rl-fine">Only members see the Roll. For everyone, post on the Take on <a href="#take">Home</a>.</p>';
    var top = box.querySelector('.rl-post-top');
    top.appendChild(avatar(meP));
    top.appendChild(el('span', 'rl-post-who', '<b>' + esc(meP.name) + '</b><span>' + (casual ? 'members only · photos, twelve a day' : 'members only · photos and clips') + '</span>'));
    var yours = el('a', 'rl-mine', 'Your posts'); yours.href = 'compose/'; top.appendChild(yours);
    var input = box.querySelector('input[type=file]'), draft = box.querySelector('.rl-draft'), prev = box.querySelector('.rl-prev'),
        ta = box.querySelector('textarea'), go = box.querySelector('.rl-go'), msg = box.querySelector('.rl-msg');
    var file = null, url = null, upFile = null, upUrl = null;
    function say(t, bad) { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); }
    function sync() { go.disabled = !(file && ta.value.trim().length <= 800); }   // 038: a photo says enough
    function clear() {
      if (upUrl && w.OTP && OTP.deleteImage) { OTP.deleteImage(upUrl).catch(function () {}); }
      upFile = null; upUrl = null; file = null;
      if (url) { URL.revokeObjectURL(url); url = null; }
      prev.innerHTML = ''; draft.hidden = true; input.value = ''; say(''); sync();
    }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; if (!f) return;
      var vid = /^video\//.test(f.type || '') || /\.(mp4|mov|webm|m4v)$/i.test(f.name || '');
      if (vid && casual) { say('Photos only.', true); input.value = ''; return; }
      if (!vid && !/^image\//.test(f.type || '')) { say('Photos only.', true); input.value = ''; return; }
      if (upFile !== f) { if (upUrl && w.OTP && OTP.deleteImage) OTP.deleteImage(upUrl).catch(function () {}); upFile = null; upUrl = null; }
      file = f; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(f);
      prev.innerHTML = ''; var m = el(vid ? 'video' : 'img'); m.src = url; if (vid) { m.muted = true; m.playsInline = true; m.controls = true; } else m.alt = '';
      prev.appendChild(m); draft.hidden = false; say(''); sync(); ta.focus();
    });
    ta.addEventListener('input', sync);
    box.querySelector('.rl-x').addEventListener('click', clear);
    go.addEventListener('click', function () {
      var text = ta.value.trim(); if (!file) return;
      go.disabled = true; var label = go.textContent;
      (async function () {
        try {
          // a Roll photo is cached for an hour, not a year: one the desk or its owner takes down must not live on in phones
          if (upFile !== file || !upUrl) { go.textContent = 'Uploading…'; upUrl = casual ? await OTP.uploadTakePhoto(file, { roll: true }) : await OTP.uploadImage(file); upFile = file; }
          go.textContent = 'Posting…';
          await OTP.post({ text: text, imageUrl: upUrl, membersOnly: true });   // ⛔ 045: always says which, and this is the Roll
          upFile = null; upUrl = null;
          say('Up. Members only.');
          setTimeout(function () { location.replace(location.pathname + '?r=' + Date.now() + '#roll'); }, 500);
        } catch (e) {
          var m = (e && e.message) || '';
          say(/^(Slow down|That is twenty|That is twelve|The desk pulled|Log in first|That clip|That photo|Photos, GIFs|Photos only|The Roll)/.test(m) ? m : (m || 'That did not go through.'), true);
          go.disabled = false; go.textContent = label;
        }
      })();
    });
  }

  /* ---------- the cards ---------- */
  // edited_at is stamped by the database on any change to the words or the photo, the desk's included,
  // "so the marker cannot be dodged" (guard_post_update), so the card says so
  function meta(r, p) { return '<b>' + esc(p.name) + '</b><span>' + esc(p.seat) + ' · ' + esc(ago(r.created_at)) + (r.edited_at ? ' · edited' : '') + '</span>'; }
  function cap(r, p) { return '<b>' + esc(p.name) + '</b> ' + esc(String(r.text).slice(0, 800)).replace(/\n/g, '<br>'); }
  function postCard(r, p) {
    var c = el('article', 'rl-card'); c.dataset.key = p.key; c.dataset.pid = String(r.id);
    if (p.accent) c.style.setProperty('--ring', p.accent);
    var head = el('div', 'rl-head');
    var a = el('a', 'rl-who'); a.href = p.link || '#roll'; a.dataset.who = p.key;
    a.appendChild(avatar(p));
    a.appendChild(el('span', 'rl-nm', meta(r, p)));
    head.appendChild(a);
    // 045: a post made in Home's box shows here too, and to everyone on the Take, so it says so. A Roll post says
    // nothing: behind the door is the Roll's normal.
    if (r.members_only === false) { var pub = el('span', 'rl-tag rl-pub', 'On Home'); pub.title = 'Everyone can see this one. It went up on Home.'; head.appendChild(pub); }
    if (r.mine && r.id != null) {
      var ed = el('button', 'rl-edit', 'Edit'); ed.type = 'button'; ed.dataset.edit = String(r.id); head.appendChild(ed);
      var del = el('button', 'rl-del', 'Delete'); del.type = 'button'; del.dataset.del = String(r.id); head.appendChild(del);
    } else if (DESK && r.id != null) {
      var pl = el('button', 'rl-pull', 'Pull'); pl.type = 'button'; pl.dataset.pull = String(r.id); head.appendChild(pl);
    }
    c.appendChild(head);
    var img = safe(r.image_url);
    var pic = el('div', 'rl-pic');
    if (isVideo(img)) { pic.innerHTML = '<video src="' + esc(img) + '" controls playsinline preload="metadata"></video>'; }
    else { pic.innerHTML = '<img src="' + esc(img) + '" alt="' + esc(r.image_alt || '') + '" loading="lazy" decoding="async">'; }
    c.appendChild(pic);
    var main = el('div', 'rl-main');
    if (r.text) main.appendChild(el('p', 'rl-cap', cap(r, p)));
    var key = 'p' + r.id;
    main.insertAdjacentHTML('beforeend',
      '<div class="react-bar" data-post="' + esc(key) + '" data-base-likes="0">' +
      ['heart', 'fire', 'skull', 'eye'].map(function (k) { return '<button class="react-btn" data-emoji="' + k + '" type="button" aria-label="' + k + '"><img class="em" src="assets/cathedral/r/' + k + '.webp" alt="" width="20" height="20" decoding="async"><span class="ct">0</span></button>'; }).join('') +
      '<button class="react-btn cmt" data-cmt type="button" aria-label="Comments" aria-expanded="false" hidden><img class="em" src="assets/cathedral/r/talk.webp" alt="" width="20" height="20" decoding="async"><span class="ct">0</span></button></div>' +
      '<div class="tk-nudge" hidden></div><div class="tk-box" hidden></div>');
    c.appendChild(main);
    // double tap the picture = heart (the bar's own button, so it is the same tap as on Home)
    var last = 0;
    pic.addEventListener('click', function (ev) {
      if (ev.target.tagName === 'VIDEO') return;
      var now = Date.now();
      if (now - last < 320) { var h = c.querySelector('.react-btn[data-emoji="heart"]'); if (h && !h.classList.contains('voted')) h.click(); flash(pic); }
      last = now;
    });
    return c;
  }
  function flash(pic) { var f = el('span', 'rl-heart', '<img src="assets/cathedral/r/heart.webp" alt="">'); pic.appendChild(f); setTimeout(function () { f.remove(); }, 700); }
  function nightCard(n) {
    var c = el('article', 'rl-card house'); c.dataset.key = 'house';
    var head = el('div', 'rl-head');
    var a = el('a', 'rl-who'); a.href = 'c/vamppsych/'; a.dataset.who = 'house';
    a.appendChild(avatar(HOUSE));
    var dt = ymd(n.date);
    a.appendChild(el('span', 'rl-nm', '<b>' + esc(HOUSE.name) + '</b><span>shot this night · ' + (dt ? MON3[dt.getMonth()] + ' ' + dt.getDate() : '') + '</span>'));
    head.appendChild(a); head.appendChild(el('span', 'rl-tag', 'A night'));
    c.appendChild(head);
    var pic = el('a', 'rl-pic wide'); pic.href = 'events/' + encodeURIComponent(n.slug) + '/';
    pic.innerHTML = '<img src="events/' + esc(n.slug) + '/preview.jpg" alt="" loading="lazy" decoding="async">';
    c.appendChild(pic);
    var main = el('div', 'rl-main');
    main.appendChild(el('p', 'rl-cap', '<b>' + esc(n.title) + '</b> ' + esc(n.venue || '') + '. ' + (n.count ? n.count + ' frames, full quality, free.' : '')));
    main.appendChild(el('a', 'rl-night-go', 'Open the night &rarr;')).href = 'events/' + encodeURIComponent(n.slug) + '/';
    c.appendChild(main);
    return c;
  }
  var HOUSE = { key: 'house', name: 'THE HOUSE', photo: '', link: 'c/vamppsych/', seat: 'The desk', accent: ACC.pink };

  /* ---------- Edit: your own words, in place (updatePost; the database stamps it edited) ---------- */
  function editPost(btn) {
    var c = btn.closest('.rl-card'), r = c && POSTS[c.dataset.pid], p = c && PEOPLE[c.dataset.pid];
    if (!r || !p || c.querySelector('.rl-ed') || !w.OTP || !OTP.updatePost) return;
    var main = c.querySelector('.rl-main'), old = main.querySelector('.rl-cap');
    var box = el('div', 'rl-ed',
      '<textarea maxlength="800" rows="3" placeholder="A line, if you want one" aria-label="Your words"></textarea>' +
      '<div class="rl-draft-row"><button type="button" class="rl-ed-no">Never mind</button><span class="rl-msg" role="status"></span><button type="button" class="rl-ed-go">Save</button></div>');
    var ta = box.querySelector('textarea'), go = box.querySelector('.rl-ed-go'), msg = box.querySelector('.rl-msg');
    ta.value = r.text || '';
    if (old) old.hidden = true;
    main.insertBefore(box, main.firstChild);
    btn.disabled = true;
    function close() { box.remove(); var k = main.querySelector('.rl-cap'); if (k) k.hidden = false; btn.disabled = false; }
    box.querySelector('.rl-ed-no').addEventListener('click', close);
    go.addEventListener('click', function () {
      var text = ta.value.trim();
      if (text === String(r.text || '').trim()) { close(); return; }
      go.disabled = true; go.textContent = 'Saving…'; msg.textContent = ''; msg.classList.remove('bad');
      OTP.updatePost(r.id, { text: text }).then(function (row) {
        r.text = row && row.text != null ? row.text : text;
        r.edited_at = (row && row.edited_at) || new Date().toISOString();
        var k = main.querySelector('.rl-cap');
        if (r.text) { if (!k) { k = el('p', 'rl-cap'); main.insertBefore(k, box.nextSibling); } k.innerHTML = cap(r, p); }
        else if (k) k.remove();
        var nm = c.querySelector('.rl-nm'); if (nm) nm.innerHTML = meta(r, p);
        close();
      }).catch(function (e) {
        var m = (e && e.message) || '';
        msg.textContent = /^(That one|Slow down|The Roll|A post|The desk|Log in)/.test(m) ? m : 'That did not save. Try again.';
        msg.classList.add('bad');
        go.disabled = false; go.textContent = 'Save';
      });
    });
    ta.focus();
  }

  function jumpTo(pid) {
    var c = mount.querySelector('.rl-card[data-pid="' + pid + '"]'); if (!c) return;
    try { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { c.scrollIntoView(); }
    c.classList.add('lit'); setTimeout(function () { c.classList.remove('lit'); }, 1400);
  }
  // ?post=<id>: that post goes mid-screen (under a sticky nav, above the tab bar) and stays there. The router puts #roll
  // back at its top for the first ~3 s (index.html show(), settle) and the photos above it load late and push it down,
  // so it holds until the reader scrolls, taps or types, 10 s at most.
  function holdOn(pid) {
    var c = mount.querySelector('.rl-card[data-pid="' + pid + '"]'); if (!c) return;
    var t0 = Date.now(), done = false, ro = null, quit = ['wheel', 'touchmove', 'keydown', 'pointerdown'];
    function place() {
      if (done) return;
      if (Date.now() - t0 > 10000) { stop(); return; }
      if (!c.isConnected || !c.getClientRects().length) return;   // taken down, or the People tab is not showing
      var nav = d.querySelector('nav.site'), bar = d.querySelector('.tabbar');
      var top = nav && getComputedStyle(nav).position === 'sticky' ? nav.offsetHeight : 0;
      var bot = w.innerHeight - (bar && getComputedStyle(bar).position === 'fixed' ? bar.offsetHeight : 0);
      var r = c.getBoundingClientRect(), room = bot - top;
      var dy = Math.round(r.top - (r.height <= room ? top + (room - r.height) / 2 : top + 8));
      if (Math.abs(dy) < 2) return;
      try { w.scrollTo({ top: w.scrollY + dy, left: 0, behavior: 'instant' }); } catch (e) { w.scrollTo(0, w.scrollY + dy); }
    }
    function stop() {
      done = true;
      quit.forEach(function (ev) { w.removeEventListener(ev, stop, true); });
      w.removeEventListener('scroll', place);
      if (ro) ro.disconnect();
    }
    quit.forEach(function (ev) { w.addEventListener(ev, stop, { capture: true, passive: true }); });
    w.addEventListener('scroll', place, { passive: true });   // any scroll the reader did not make is the router's
    try { ro = new ResizeObserver(place); ro.observe(d.body); ro.observe(mount); } catch (e) {}
    setTimeout(stop, 10500);
    place();
    c.classList.add('lit'); setTimeout(function () { c.classList.remove('lit'); }, 1800);
  }

  /* ---------- a name: their page as a sheet ---------- */
  var SHEET = null;
  function sheet(p, rows) {
    if (SHEET) SHEET.remove();
    var s = el('div', 'rl-sheet'); s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', p.name);
    var pan = el('div', 'rl-pan');
    var top = el('div', 'rl-pan-top'); top.appendChild(avatar(p, 'big'));
    var photos = rows.filter(function (r) { return r.key === p.key && safe(r.image_url) && !isVideo(r.image_url); });
    var nPosts = rows.filter(function (r) { return r.key === p.key; }).length;
    // anybody who shows on the Wall has a page in the Crypt: a card holder too (roll_feed sends their sid), not only
    // somebody whose link is their Crypt page. A card holder's card is the other link.
    var sid = /^[a-z0-9]+$/.test(p.sid || '') ? p.sid : ((/^wall\/#s-([a-z0-9]+)$/.exec(p.link || '') || [])[1] || '');
    var go = (p.kind !== 'member' && p.link ? '<a href="' + esc(p.link) + '">Their card &rarr;</a>' : '') +
      (sid ? '<a href="wall/#s-' + esc(sid) + '">Their page in the Crypt &rarr;</a>' : '');
    top.appendChild(el('div', 'rl-pan-who', '<b>' + esc(p.name) + '</b><span>' + esc(p.seat) + '</span><em>' + nPosts + (nPosts === 1 ? ' post here' : ' posts here') + '</em>' + go));
    var x = el('button', 'rl-pan-x', '&times;'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); top.appendChild(x);
    pan.appendChild(top);
    var grid = el('div', 'rl-grid');
    photos.forEach(function (r) {
      var a = el('a', 'rl-g'); a.href = '#roll'; a.innerHTML = '<img src="' + esc(safe(r.image_url)) + '" alt="" loading="lazy" decoding="async">';
      a.addEventListener('click', function (ev) { ev.preventDefault(); close(); jumpTo(r.id); });
      grid.appendChild(a);
    });
    if (!photos.length) grid.appendChild(el('p', 'rl-g-none', 'No photos yet.'));
    pan.appendChild(grid);
    // the frames they marked "I'm in this one" (037, by name since 043), members only, for anyone with a sid
    if (sid && w.OTP && OTP.framesOf && OTP.frameThumb && OTP.frameLink && OTP.frameName) {
      var fr = el('div', 'rl-pan-frames'); pan.appendChild(fr);
      OTP.framesOf(sid).then(function (list) {
        list = (Array.isArray(list) ? list : []).filter(function (f) { return f && f.event_slug; });
        if (!list.length) { fr.remove(); return; }
        var shown = list.slice(0, 30);
        return tiles(shown).then(function (h) {
          fr.innerHTML = '<div class="rl-wk-h"><b>In our frames</b><span>' + (list.length > shown.length ? shown.length + ' of ' : '') + list.length + (list.length === 1 ? ' frame' : ' frames') + ' they marked</span></div>' +
            '<div class="rl-grid">' + h + '</div>';
        });
      }).catch(function () { fr.remove(); });
    }
    s.appendChild(pan); d.body.appendChild(s); SHEET = s;
    d.documentElement.style.overflow = 'hidden';
    function close() { s.remove(); if (SHEET === s) SHEET = null; d.documentElement.style.overflow = ''; d.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.addEventListener('click', close); s.addEventListener('click', function (e) { if (e.target === s) close(); }); d.addEventListener('keydown', onKey);
    setTimeout(function () { s.classList.add('open'); }, 20);
  }

  /* A frame tile. Since 043 a tag names its photo ('017', 'v01'), so a photo taken down or added never moves anybody's
     tag: the thumb is media/<name>_t.jpg and the link lands on that photo (#m<name>). A tag from before 043 with no
     name goes by its place in the night's own list (events/<slug>/data.json, asked for once): the name comes from the
     list, the number guess only if the list fails. Some nights skip numbers (08-25 The Mix jumps from 020 to 023) and
     clips are v01_t.jpg and on, so building the name from the number drew somebody else's photo or a broken tile. */
  var NIGHTS = {}, TITLES = {};
  function night(slug) { return NIGHTS[slug] || (NIGHTS[slug] = getJSON('events/' + encodeURIComponent(slug) + '/data.json')); }
  function thumbOf(slug, frame, data) {
    var m = data && Array.isArray(data.media) ? data.media[frame] : null;
    var t = m && /^media\/[\w.-]+\.(jpe?g|png|webp)$/i.test(String(m.thumb || '')) ? m.thumb : 'media/' + String(frame + 1).padStart(3, '0') + '_t.jpg';
    return 'events/' + slug + '/' + t;
  }
  function tiles(list) {
    var need = [];
    list.forEach(function (x) { if (!OTP.frameThumb(x.event_slug, x.media) && need.indexOf(x.event_slug) === -1) need.push(x.event_slug); });
    return Promise.all(need.map(night)).then(function (lists) {
      var by = {}; need.forEach(function (sl, i) { by[sl] = lists[i]; });
      return list.map(function (x) {
        var slug = x.event_slug, m = x.media, src = OTP.frameThumb(slug, m);
        if (!src) {
          var data = by[slug], f = x.frame | 0, it = data && Array.isArray(data.media) ? data.media[f] : null;
          m = (it && OTP.frameName(it.thumb)) || '';
          src = m ? OTP.frameThumb(slug, m) : thumbOf(slug, f, data);
        }
        var href = OTP.frameLink(slug, m), t = TITLES[slug] || '';
        if (!src || !href) return '';    // a night slug that does not read
        return '<a class="rl-g" href="' + esc(href) + '"' + (t ? ' title="' + esc(t) + '"' : '') + '><img src="' + esc(src) + '" alt="" loading="lazy" decoding="async"></a>';
      }).join('');
    });
  }

  /* ---------- FRAMES YOU'RE IN ---------- */
  function framesIn(box) {
    if (!w.OTP || !OTP.myFrames || !OTP.frameThumb || !OTP.frameLink || !OTP.frameName) { box.remove(); return; }
    box.className = 'rl-frames';
    OTP.myFrames().then(function (list) {
      list = (Array.isArray(list) ? list : []).filter(function (x) { return x && x.event_slug; });
      if (!list.length) {
        box.innerHTML = '<div class="rl-wk-h"><b>Frames you\'re in</b></div>' +
          '<div class="rl-f-none"><p>Nothing marked yet. Find yourself in a night\'s photos and tap <b>I\'m in this one</b>.</p><a class="rl-find" href="#find">Find Yourself</a></div>';
        return;
      }
      var n = list.length;
      box.innerHTML = '<div class="rl-wk-h"><b>Frames you\'re in</b><span>' + n + ' you marked · tap one</span></div><div class="rl-fgrid"></div>' +
        (n > 30 ? '<button type="button" class="rl-all">Show all ' + n + '</button>' : '');
      var g = box.querySelector('.rl-fgrid'), all = box.querySelector('.rl-all');
      tiles(list.slice(0, 30)).then(function (h) { g.innerHTML = h; });
      if (all) all.addEventListener('click', function () { all.disabled = true; tiles(list).then(function (h) { g.innerHTML = h; all.remove(); }, function () { all.disabled = false; }); });
    }).catch(function () { box.remove(); });
  }

  /* ---------- the roll itself ---------- */
  var RENDERED = null, DESK = false, POSTS = {}, PEOPLE = {};
  async function roll() {
    if (RENDERED === 'in') return; RENDERED = 'in';
    mount.innerHTML = '<p class="rl-note">Loading the roll…</p>';
    var post = el('div'), feed = el('div', 'rl-feed'), clips = el('div'), fr = el('div');
    var results = await Promise.all([
      // the one list (044): roster.json with the cards and the dark seats folded in; its own 3 s cap, roster.json is the floor
      (w.OTP && OTP.people) ? OTP.people().catch(function () { return []; }) : getJSON('content/roster.json').then(function (j) { return (j && j.items) || []; }),
      getJSON('events/events.json'),
      // 045: the Roll's own read, members only (a stranger never gets this far: the door card stops them)
      (w.OTP && OTP.rollFeed) ? OTP.rollFeed(60, { photos: true }).catch(function () { return []; }) : Promise.resolve([]),
      (w.OTP && OTP.me) ? OTP.me().catch(function () { return null; }) : Promise.resolve(null)
    ]);
    learn(Array.isArray(results[0]) ? results[0] : []);
    var house = seatOf('vamppsych'); if (house) HOUSE.photo = av(house.photo);
    var nights = ((results[1] && results[1].items) || []).filter(function (n) { return n && n.slug && n.date; });
    nights.forEach(function (n) { TITLES[n.slug] = n.title || ''; });
    var rows = (Array.isArray(results[2]) ? results[2] : []).filter(function (r) { return r && safe(r.image_url); });
    var me = results[3];
    DESK = !!(me && me.profile && me.profile.is_admin);
    var people = PEOPLE; rows.forEach(function (r) { var p = who(r); people[r.id] = p; POSTS[r.id] = r; r.key = p.key; });
    var approved = !!(me && me.profile && me.profile.approved), canPost = approved;
    if (me && !canPost && w.OTP && OTP.canTake) { try { canPost = await OTP.canTake(); } catch (e) {} }
    mount.innerHTML = '';
    if (me) { composer(me, canPost, !approved, post); mount.appendChild(post); }
    // photos and nights together, newest first
    var items = rows.filter(function (r) { return !isVideo(r.image_url); }).map(function (r) { return { t: new Date(r.created_at).getTime() || 0, r: r }; })
      .concat(nights.map(function (n) { var dt = ymd(n.date); return { t: dt ? dt.getTime() + 23 * 36e5 : 0, n: n }; }))
      .sort(function (a, b) { return b.t - a.t; });
    mount.appendChild(el('div', 'rl-wk-h rl-feed-h', '<b>The roll</b><span>' + rows.length + (rows.length === 1 ? ' photo' : ' photos') + ' from the house · ' + nights.length + ' nights</span>'));
    items.forEach(function (x) { feed.appendChild(x.r ? postCard(x.r, people[x.r.id]) : nightCard(x.n)); });
    if (!items.length) feed.appendChild(el('p', 'rl-note', 'Nothing on the roll yet. Post the first one.'));
    mount.appendChild(feed);
    var vids = rows.filter(function (r) { return isVideo(r.image_url); });
    if (vids.length) {
      clips.className = 'rl-clips';
      clips.innerHTML = '<div class="rl-wk-h"><b>Clips</b><span>' + vids.length + (vids.length === 1 ? ' clip' : ' clips') + '</span></div><div class="rl-clip-rail"></div>';
      var rail = clips.querySelector('.rl-clip-rail');
      vids.forEach(function (r) { var p = people[r.id]; var c = el('div', 'rl-clip'); c.innerHTML = '<video src="' + esc(safe(r.image_url)) + '" controls playsinline preload="metadata"></video><span>' + esc(p.name) + '</span>'; rail.appendChild(c); });
      mount.appendChild(clips);
    }
    framesIn(fr); mount.appendChild(fr);
    // the timeline's own reactions and comments, once index.html has handed them over
    var t0 = Date.now(); (function wire() {
      if (w.OTPWireReactions) { try { w.OTPWireReactions(feed); } catch (e) {} return; }
      if (Date.now() - t0 < 8000) setTimeout(wire, 150);
    })();
    // names open the sheet; Edit and Delete are the member's own; Pull is the desk's
    mount.addEventListener('click', function (ev) {
      var del = ev.target.closest && ev.target.closest('.rl-del');
      if (del) {
        ev.preventDefault(); if (!w.OTP || !OTP.deletePost || !confirm('Take this one down?')) return;
        del.disabled = true;
        OTP.deletePost(del.dataset.del).then(function () { var c = del.closest('.rl-card'); if (c) c.remove(); }).catch(function () { del.disabled = false; });
        return;
      }
      var ed = ev.target.closest && ev.target.closest('.rl-edit');
      if (ed) { ev.preventDefault(); editPost(ed); return; }
      var pull = ev.target.closest && ev.target.closest('.rl-pull');
      if (pull) {
        ev.preventDefault(); if (!w.OTP || !OTP.deskHide || !confirm('Pull this one? It comes off the Roll, and off Home if it is there too. The board can put it back.')) return;
        pull.disabled = true;
        OTP.deskHide('post', pull.dataset.pull, true).then(function () { var c = pull.closest('.rl-card'); if (c) c.remove(); }).catch(function (e) {
          var m = (e && e.message) || '';
          if (/already gone/i.test(m)) { var c = pull.closest('.rl-card'); if (c) c.remove(); return; }
          // the reason goes in the button itself: a phone never shows a title
          pull.disabled = false; pull.textContent = m ? m.slice(0, 40) : 'Did not pull'; pull.title = m;
        });
        return;
      }
      var a = ev.target.closest && ev.target.closest('.rl-who'); if (!a) return;
      var key = a.dataset.who; if (key === 'house') return;   // the house's own page is a real link
      ev.preventDefault();
      var p = null; Object.keys(people).some(function (id) { if (people[id].key === key) { p = people[id]; return true; } });
      if (p) sheet(p, rows);
    });
    root.setAttribute('data-roll', 'ready');
    // ?post=<id>#roll opens the roll on that post (a page elsewhere can link one photo), the top if it is not in the 60
    var want = new URLSearchParams(location.search).get('post');
    if (want && /^\d{1,12}$/.test(want)) holdOn(want);
  }

  function paint() {
    var st = door();
    if (st === 'in') { roll(); return; }
    if (st === 'out' || st === 'wait') { RENDERED = st; doorCard(st); root.setAttribute('data-roll', 'door'); return; }
    // not answered yet: a saved session makes door.js speak within ~2.5s, otherwise it is a stranger
    if (!mount.firstChild) mount.innerHTML = '<p class="rl-note">…</p>';
  }
  try { new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-door'] }); } catch (e) {}
  paint();
  setTimeout(function () { if (!door() && RENDERED == null) { doorCard('out'); RENDERED = 'out'; root.setAttribute('data-roll', 'door'); } }, 3500);
})(window, document);
