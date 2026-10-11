/* THE ROLL (10/11). His call on the People tab: "make people like an instagram feed for the members",
 * then "make it private, photos only", and the house's nights fill it while members warm up.
 *
 *   THE DOOR     members only (html[data-door="in"], painted by cathedral.js off door.js). A stranger gets
 *                the door card and nothing else; Open A Pack under it stays public.
 *   POST         photo first: pick a photo, write a line, post. Same OTP calls as the timeline's composer
 *                (uploadTakePhoto / uploadImage, then post), same rules (a line with it, 12 a day for a
 *                casual member). The page reloads onto #roll so the new post lands through one render path.
 *   THIS WEEK    a circle for everyone who posted in the last 7 days, ring in their accent, tap = their
 *                newest post. Fewer than three? Faces of members with pages (wall_here) fill the row.
 *   THE ROLL     the photo posts off take_feed(60): the same posts as The Take on Home, photos only, the
 *                photo leads. Plus one card per night the house shot (events/events.json), newest first.
 *                Hearts, fire, skull, eye and comments are the timeline's own wiring
 *                (window.OTPWireReactions), so a tap here is the same tap as on Home. Double tap = heart.
 *   CLIPS        the video posts (card holders can post video), one row.
 *   A NAME       tap one, their page opens as a sheet: avatar, name, seat, posts, a grid of their photos,
 *                and the link to their page (a card holder's /c/, a member's space in the Crypt).
 *   EVERY FRAME  30 of the house's frames at random, three across, tap = the gallery at that frame.
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
  // the 96px cut of a local photo (derive.py), the file itself for anything hosted
  function av(u) { u = safe(u); if (!u) return ''; var m = /^assets\/(?!(av|thumb|card|grid)\/)(.+)\.(jpe?g|png)$/i.exec(u); return m ? 'assets/av/' + m[2] + '.jpg' : u; }
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

  /* ---------- who is who: card art for card holders and the desk, their own pic for a member ---------- */
  var ROSTER = { bySlug: {}, byTight: {} };
  function learn(items) {
    (items || []).forEach(function (x) {
      if (!x || !x.name) return;
      var rec = { name: x.name, photo: x.photo || '', accent: x.accent || '' };
      ROSTER.bySlug[slugify(x.name)] = rec; ROSTER.byTight[tight(x.name)] = rec;
    });
  }
  function who(r) {
    var kind = r.kind || 'member';
    var rec = (kind !== 'member') ? (ROSTER.bySlug[r.card_slug || ''] || ROSTER.byTight[tight(r.card_slug || '')] || ROSTER.byTight[tight(r.display_name || '')]) : null;
    var name = (rec && rec.name) || r.display_name || (kind === 'desk' ? 'THE DESK' : 'Member');
    var link = kind === 'member' ? (r.sid ? 'wall/#s-' + r.sid : '') : (r.card_slug ? 'c/' + encodeURIComponent(r.card_slug) + '/' : '');
    return { key: (kind === 'member' ? 'm:' + (r.sid || tight(r.display_name)) : 'c:' + (r.card_slug || tight(name))),
      name: name, photo: kind === 'member' ? safe(r.pic) : av(rec && rec.photo), link: link, kind: kind,
      seat: kind === 'desk' ? 'The desk' : kind === 'card' ? 'Card holder' : 'Member', accent: ACC[r.accent] || ACC[rec && rec.accent] || '' };
  }
  function avatar(p, cls) {
    var s = el('span', 'rl-av' + (cls ? ' ' + cls : ''));
    if (p.photo) s.style.backgroundImage = 'url("' + p.photo + '")'; else s.textContent = Array.from(String(p.name || '0').trim())[0] || '0';
    if (p.accent) s.style.setProperty('--ring', p.accent);
    return s;
  }

  /* ---------- the door ---------- */
  function doorCard(state) {
    mount.innerHTML = '';
    var c = el('div', 'rl-door');
    c.innerHTML = '<img src="assets/cathedral/a/join.webp" alt="" width="96" height="96" decoding="async">' +
      '<b>Members only.</b><p>The Roll is where the people in the house post their photos. It stays behind the door.</p>' +
      (state === 'wait' ? '<p class="rl-door-l"><a href="wall/">One more step at the Crypt</a> and you are in.</p>'
        : '<p class="rl-door-l"><a href="join/?next=home">Log in</a> or <a href="wall/">join the Crypt</a>. All it takes is an Instagram.</p>');
    mount.appendChild(c);
  }

  /* ---------- POST: photo first ---------- */
  function composer(me, canPost, casual, box) {
    var mine = me && me.profile ? (ROSTER.bySlug[me.profile.card_slug || ''] || ROSTER.byTight[tight(me.profile.display_name || '')]) : null;
    var meP = { name: (me && me.profile && me.profile.display_name) || 'You', photo: casual ? '' : av(mine && mine.photo), accent: '' };
    box.className = 'rl-post';
    if (!canPost) { box.innerHTML = '<p class="rl-note">Put your Instagram in at <a href="wall/">the Crypt</a> and you can post here.</p>'; return; }
    box.innerHTML = '<div class="rl-post-top"></div>' +
      '<label class="rl-pick"><input type="file" accept="' + (casual ? 'image/*' : 'image/*,video/*') + '" hidden><span class="rl-pick-b">&#43; ' + (casual ? 'Post a photo' : 'Post a photo or clip') + '</span></label>' +
      '<div class="rl-draft" hidden><div class="rl-prev"></div><textarea maxlength="800" rows="2" placeholder="Say something with it" aria-label="Your line"></textarea>' +
      '<div class="rl-draft-row"><button type="button" class="rl-x">Remove</button><span class="rl-msg" role="status"></span><button type="button" class="rl-go" disabled>Post</button></div></div>';
    box.querySelector('.rl-post-top').appendChild(avatar(meP));
    box.querySelector('.rl-post-top').appendChild(el('span', 'rl-post-who', '<b>' + esc(meP.name) + '</b><span>' + (casual ? 'photos only, twelve a day' : 'photos, GIFs and clips') + '</span>'));
    var input = box.querySelector('input[type=file]'), draft = box.querySelector('.rl-draft'), prev = box.querySelector('.rl-prev'),
        ta = box.querySelector('textarea'), go = box.querySelector('.rl-go'), msg = box.querySelector('.rl-msg');
    var file = null, url = null, upFile = null, upUrl = null;
    function say(t, bad) { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); }
    function sync() { go.disabled = !(file && ta.value.trim().length && ta.value.trim().length <= 800); }
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
      var text = ta.value.trim(); if (!file || !text) return;
      go.disabled = true; var label = go.textContent;
      (async function () {
        try {
          if (upFile !== file || !upUrl) { go.textContent = 'Uploading…'; upUrl = casual ? await OTP.uploadTakePhoto(file) : await OTP.uploadImage(file); upFile = file; }
          go.textContent = 'Posting…';
          await OTP.post({ text: text, imageUrl: upUrl });
          upFile = null; upUrl = null;
          say('Up.');
          setTimeout(function () { location.replace(location.pathname + '?r=' + Date.now() + '#roll'); }, 500);
        } catch (e) {
          var m = (e && e.message) || '';
          say(/^(Slow down|That is twenty|That is twelve|The desk pulled|Log in first|That clip|That photo|Photos, GIFs|Photos only)/.test(m) ? m : (m || 'That did not go through.'), true);
          go.disabled = false; go.textContent = label;
        }
      })();
    });
  }

  /* ---------- the cards ---------- */
  function postCard(r, p) {
    var c = el('article', 'rl-card'); c.dataset.key = p.key; c.dataset.pid = String(r.id);
    if (p.accent) c.style.setProperty('--ring', p.accent);
    var head = el('div', 'rl-head');
    var a = el('a', 'rl-who'); a.href = p.link || '#roll'; a.dataset.who = p.key;
    a.appendChild(avatar(p));
    a.appendChild(el('span', 'rl-nm', '<b>' + esc(p.name) + '</b><span>' + esc(p.seat) + ' · ' + esc(ago(r.created_at)) + '</span>'));
    head.appendChild(a);
    if (r.mine && r.id != null) { var del = el('button', 'rl-del', 'Delete'); del.type = 'button'; del.dataset.del = String(r.id); head.appendChild(del); }
    c.appendChild(head);
    var img = safe(r.image_url);
    var pic = el('div', 'rl-pic');
    if (isVideo(img)) { pic.innerHTML = '<video src="' + esc(img) + '" controls playsinline preload="metadata"></video>'; }
    else { pic.innerHTML = '<img src="' + esc(img) + '" alt="' + esc(r.image_alt || '') + '" loading="lazy" decoding="async">'; }
    c.appendChild(pic);
    var main = el('div', 'rl-main');
    if (r.text) main.appendChild(el('p', 'rl-cap', '<b>' + esc(p.name) + '</b> ' + esc(String(r.text).slice(0, 800)).replace(/\n/g, '<br>')));
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

  /* ---------- THIS WEEK ---------- */
  function week(rows, people, box) {
    box.className = 'rl-week';
    var cut = Date.now() - 7 * 864e5, seen = {}, list = [];
    rows.forEach(function (r) { if (new Date(r.created_at).getTime() < cut) return; var p = people[r.id]; if (!p || seen[p.key]) return; seen[p.key] = 1; list.push({ p: p, pid: r.id }); });
    function circle(p, href, sub, onTap) {
      var a = el('a', 'rl-wk'); a.href = href || '#roll';
      a.appendChild(avatar(p, 'big'));
      a.appendChild(el('span', 'rl-wk-n', esc(p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name)));
      if (sub) a.appendChild(el('span', 'rl-wk-s', esc(sub)));
      if (onTap) a.addEventListener('click', function (ev) { ev.preventDefault(); onTap(); });
      return a;
    }
    box.appendChild(el('div', 'rl-wk-h', '<b>This week</b><span>' + (list.length ? (list.length === 1 ? 'one person posted' : list.length + ' people posted') : 'nobody has posted yet, be the one') + '</span>'));
    var rail = el('div', 'rl-wk-rail');
    list.forEach(function (x) { rail.appendChild(circle(x.p, x.p.link, 'posted', function () { jumpTo(x.pid); })); });
    box.appendChild(rail);
    if (list.length < 3 && w.OTP && OTP.configured && OTP.sb) {
      Promise.resolve(OTP.sb().rpc('wall_here')).then(function (r) {
        if (!r || r.error || !Array.isArray(r.data)) return;
        r.data.slice(0, 12).forEach(function (h) {
          var p = { key: 'h:' + h.sid, name: h.name || 'Member', photo: safe(h.pic) ? (/^https?:/.test(h.pic) ? h.pic : av(h.pic)) : '', accent: '' };
          if (seen[p.key]) return;
          rail.appendChild(circle(p, h.sid ? 'wall/#s-' + h.sid : 'wall/', h.mood_e ? h.mood_e : 'their page'));
        });
      }).catch(function () {});
    }
  }
  function jumpTo(pid) {
    var c = mount.querySelector('.rl-card[data-pid="' + pid + '"]'); if (!c) return;
    try { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { c.scrollIntoView(); }
    c.classList.add('lit'); setTimeout(function () { c.classList.remove('lit'); }, 1400);
  }

  /* ---------- a name: their page as a sheet ---------- */
  var SHEET = null;
  function sheet(p, rows) {
    if (SHEET) SHEET.remove();
    var s = el('div', 'rl-sheet'); s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', p.name);
    var pan = el('div', 'rl-pan');
    var top = el('div', 'rl-pan-top'); top.appendChild(avatar(p, 'big'));
    var photos = rows.filter(function (r) { return r.key === p.key && safe(r.image_url) && !isVideo(r.image_url); });
    top.appendChild(el('div', 'rl-pan-who', '<b>' + esc(p.name) + '</b><span>' + esc(p.seat) + '</span><em>' + rows.filter(function (r) { return r.key === p.key; }).length + ' posts here</em>' +
      (p.link ? '<a href="' + esc(p.link) + '">' + (p.kind === 'member' ? 'Their page in the Crypt' : 'Their page') + ' &rarr;</a>' : '')));
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
    // the frames they marked "I'm in this one" (037), members only, when they show themselves on The Wall
    var sidM = /^wall\/#s-([a-z0-9]+)$/.exec(p.link || '');
    if (sidM && w.OTP && OTP.configured && OTP.sb) {
      var fr = el('div', 'rl-pan-frames'); pan.appendChild(fr);
      Promise.resolve(OTP.sb().rpc('frames_of', { p_sid: sidM[1] })).then(function (r) {
        if (!r || r.error || !Array.isArray(r.data) || !r.data.length) { fr.remove(); return; }
        fr.innerHTML = '<div class="rl-wk-h"><b>In our frames</b><span>' + r.data.length + (r.data.length === 1 ? ' frame' : ' frames') + ' they marked</span></div>' +
          '<div class="rl-grid">' + r.data.slice(0, 30).map(function (x) {
            var n = String((x.frame | 0) + 1).padStart(3, '0');
            return '<a class="rl-g" href="events/' + esc(x.event_slug) + '/#f' + ((x.frame | 0) + 1) + '"><img src="events/' + esc(x.event_slug) + '/media/' + n + '_t.jpg" alt="" loading="lazy" decoding="async"></a>';
          }).join('') + '</div>';
      }).catch(function () { fr.remove(); });
    }
    s.appendChild(pan); d.body.appendChild(s); SHEET = s;
    d.documentElement.style.overflow = 'hidden';
    function close() { s.remove(); if (SHEET === s) SHEET = null; d.documentElement.style.overflow = ''; d.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    x.addEventListener('click', close); s.addEventListener('click', function (e) { if (e.target === s) close(); }); d.addEventListener('keydown', onKey);
    setTimeout(function () { s.classList.add('open'); }, 20);
  }

  /* ---------- EVERY FRAME ---------- */
  function frames(box) {
    getJSON('content/frames.json').then(function (fr) {
      var all = [];
      ((fr && fr.nights) || []).forEach(function (nt) { (nt.f || []).forEach(function (f) { all.push({ s: nt.s, t: nt.t, n: f[1], i: f[0] }); }); });
      if (!all.length) { box.remove(); return; }
      box.className = 'rl-frames';
      box.innerHTML = '<div class="rl-wk-h"><b>Every frame</b><span>' + all.length + ' frames from ' + ((fr && fr.nights) || []).length + ' nights · tap one</span><button type="button" class="rl-deal">Deal again</button></div><div class="rl-fgrid"></div>';
      var g = box.querySelector('.rl-fgrid');
      function deal() {
        var pick = all.slice(); for (var i = pick.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pick[i]; pick[i] = pick[j]; pick[j] = t; }
        g.innerHTML = pick.slice(0, 30).map(function (x) {
          return '<a class="rl-g" href="events/' + esc(x.s) + '/#f' + (x.i + 1) + '" title="' + esc(x.t) + '"><img src="events/' + esc(x.s) + '/media/' + esc(x.n) + '_t.jpg" alt="" loading="lazy" decoding="async"></a>';
        }).join('');
      }
      deal(); box.querySelector('.rl-deal').addEventListener('click', deal);
    });
  }

  /* ---------- the roll itself ---------- */
  var RENDERED = null;
  async function roll() {
    if (RENDERED === 'in') return; RENDERED = 'in';
    mount.innerHTML = '<p class="rl-note">Loading the roll…</p>';
    var post = el('div'), wk = el('div'), feed = el('div', 'rl-feed'), clips = el('div'), fr = el('div');
    var results = await Promise.all([
      getJSON('content/roster.json'), getJSON('content/creators.json'), getJSON('events/events.json'),
      (w.OTP && OTP.configured && OTP.sb) ? Promise.resolve(OTP.sb().rpc('take_feed', { p_limit: 60 })).then(function (r) { return (r && !r.error && Array.isArray(r.data)) ? r.data : []; }).catch(function () { return []; }) : Promise.resolve([]),
      (w.OTP && OTP.me) ? OTP.me().catch(function () { return null; }) : Promise.resolve(null)
    ]);
    learn(results[0] && results[0].items); learn(results[1] && results[1].items);
    var house = ROSTER.bySlug.vamppsych || ROSTER.byTight.vamppsych; if (house) HOUSE.photo = av(house.photo);
    var nights = ((results[2] && results[2].items) || []).filter(function (n) { return n && n.slug && n.date; });
    var rows = results[3].filter(function (r) { return r && safe(r.image_url); });
    var me = results[4];
    var people = {}; rows.forEach(function (r) { var p = who(r); people[r.id] = p; r.key = p.key; });
    var approved = !!(me && me.profile && me.profile.approved), canPost = approved;
    if (me && !canPost && w.OTP && OTP.canTake) { try { canPost = await OTP.canTake(); } catch (e) {} }
    mount.innerHTML = '';
    if (me) { composer(me, canPost, !approved, post); mount.appendChild(post); }
    week(rows, people, wk); mount.appendChild(wk);
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
    frames(fr); mount.appendChild(fr);
    // the timeline's own reactions and comments, once index.html has handed them over
    var t0 = Date.now(); (function wire() {
      if (w.OTPWireReactions) { try { w.OTPWireReactions(feed); } catch (e) {} return; }
      if (Date.now() - t0 < 8000) setTimeout(wire, 150);
    })();
    // names open the sheet; delete is the member's own
    mount.addEventListener('click', function (ev) {
      var del = ev.target.closest && ev.target.closest('.rl-del');
      if (del) {
        ev.preventDefault(); if (!w.OTP || !OTP.deletePost || !confirm('Take this one down?')) return;
        del.disabled = true;
        OTP.deletePost(del.dataset.del).then(function () { var c = del.closest('.rl-card'); if (c) c.remove(); }).catch(function () { del.disabled = false; });
        return;
      }
      var a = ev.target.closest && ev.target.closest('.rl-who'); if (!a) return;
      var key = a.dataset.who; if (key === 'house') return;   // the house's own page is a real link
      ev.preventDefault();
      var p = null; Object.keys(people).some(function (id) { if (people[id].key === key) { p = people[id]; return true; } });
      if (p) sheet(p, rows);
    });
    root.setAttribute('data-roll', 'ready');
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
