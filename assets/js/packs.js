/* THE PACK MAKER (10/11). His call off the Photos brainstorm: "make it so people can make their own packs ...
 * their own rarities based on the photos", "a tool for other photographers or artists ... drop an art pack",
 * "you can favorite people's pictures", and "make it easy for me".
 *
 *   /packs/              the shelf: every pack that is out (packs_list), newest first. Members: Make a pack.
 *                        The desk: the queue (desk_packs), publish / take down.
 *   /packs/?p=<slug>     one pack, sealed. Tear it open, the cards deal face down, tap to flip, the rarity
 *                        shows (common, rare, holo, full art, the hit). Favourite a card (members, pack_fave;
 *                        counts for everyone). What you flipped stays on this phone (localStorage otp-packs).
 *   /packs/#new          the builder: title, a line, 3 to 12 photos (uploaded to the member's own folder in
 *   /packs/?edit=<slug>  the packs bucket), a rarity and a caption per photo, a cover. Save = pack_save. A
 *                        member's pack waits for the desk; the desk's own goes live on save.
 *
 * Database: migration 037. Everything fails quiet without it. ⛔ Run stamp.py after editing. ⛔ No em dashes.
 */
(function (w, d) {
  'use strict';
  var app = d.getElementById('pk-app'); if (!app) return;
  var R = { common: 'Common', rare: 'Rare', holo: 'Holo', fullart: 'Full art', hit: 'The hit' };
  var RORDER = ['common', 'rare', 'holo', 'fullart', 'hit'];

  function el(tag, cls, html) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function slugOk(s) { return /^[a-z0-9][a-z0-9-]{2,60}$/.test(String(s || '')); }
  function url(key) { try { return (w.OTP && OTP.packPhotoUrl) ? OTP.packPhotoUrl(key) : ''; } catch (e) { return ''; } }
  function authorLink(p) { return p.card_slug ? '../c/' + encodeURIComponent(p.card_slug) + '/' : (p.sid ? '../wall/#s-' + p.sid : ''); }
  function kindWord(k) { return k === 'desk' ? 'the desk' : k === 'card' ? 'card holder' : 'member'; }
  function when(iso) { var dt = new Date(iso); return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function store(v) { try { if (v === undefined) return JSON.parse(w.localStorage.getItem('otp-packs') || '{"v":1,"p":{}}'); w.localStorage.setItem('otp-packs', JSON.stringify(v)); } catch (e) { return { v: 1, p: {} }; } }
  function sb() { return (w.OTP && OTP.configured && OTP.sb) ? OTP.sb() : null; }
  function rpc(name, args) { var c = sb(); if (!c) return Promise.resolve({ error: { message: 'The backend is asleep.' } }); return Promise.resolve(c.rpc(name, args || {})).catch(function (e) { return { error: e }; }); }
  function note(msg, bad) { var n = el('p', 'pk-note' + (bad ? ' bad' : ''), esc(msg)); app.innerHTML = ''; app.appendChild(n); }

  var ME = null, MEMBER = false, ADMIN = false;
  async function whoami() {
    try { ME = w.OTP && OTP.me ? await OTP.me() : null; } catch (e) { ME = null; }
    ADMIN = !!(ME && ME.profile && ME.profile.is_admin);
    if (ME) { var r = await rpc('is_wall_member'); MEMBER = !!(r && !r.error && r.data === true) || ADMIN; }
  }

  /* ================= THE SHELF ================= */
  async function shelf() {
    d.title = 'Packs · 0FF THE PRINT';
    app.innerHTML = '<p class="pk-note">Loading the shelf…</p>';
    var r = await rpc('packs_list');
    var list = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
    app.innerHTML = '';
    var head = el('div', 'pk-head');
    head.innerHTML = '<div class="kicker">The pack maker</div><h1>Packs</h1><p class="pk-dek">Photos in packs, rarities picked by whoever made them. Tear one open, flip the cards, keep the ones you like.</p>';
    app.appendChild(head);
    var row = el('div', 'pk-cta');
    if (MEMBER) row.innerHTML = '<a class="pk-btn" href="#new">&#43; Make a pack</a><span class="pk-cta-l">Three to twelve photos, your own rarities. ' + (ADMIN ? 'Yours go live on save.' : 'The desk okays it, then it is out.') + '</span>';
    else row.innerHTML = '<span class="pk-cta-l">Members make packs. <a href="../join/?next=home">Log in</a> or <a href="../wall/">join the Crypt</a>.</span>';
    app.appendChild(row);
    if (ADMIN) await queue();
    if (!list.length) { app.appendChild(el('p', 'pk-note', 'No packs out yet. Make the first one.')); return; }
    var mine = list.filter(function (p) { return p.mine; }), out = list.filter(function (p) { return p.published; });
    if (mine.length) { app.appendChild(el('h2', 'pk-h2', 'Yours')); app.appendChild(grid(mine, true)); }
    app.appendChild(el('h2', 'pk-h2', 'Out now <span>' + out.length + '</span>'));
    app.appendChild(grid(out.filter(function (p) { return !p.mine; }).concat([]), false));
  }
  function grid(list, mine) {
    var g = el('div', 'pk-grid');
    var S = store();
    list.forEach(function (p) {
      var a = el('a', 'pk-tile' + (p.has_hit ? ' has-hit' : ''));
      a.href = '?p=' + encodeURIComponent(p.slug);
      var st = S.p[p.slug];
      a.innerHTML = '<span class="pk-cov">' + (p.cover ? '<img src="' + esc(url(p.cover)) + '" alt="" loading="lazy" decoding="async">' : '') +
        (!p.published ? '<span class="pk-badge wait">' + (p.mine ? 'On the desk' : 'Draft') + '</span>' : (st ? '<span class="pk-badge">Opened · ' + (st.f || []).length + ' / ' + p.cards + '</span>' : '<span class="pk-badge seal">Sealed</span>')) +
        '</span><span class="pk-t">' + esc(p.title) + '</span>' +
        '<span class="pk-by">' + esc(p.author) + ' · ' + esc(kindWord(p.kind)) + '</span>' +
        '<span class="pk-m">' + p.cards + ' cards' + (p.has_hit ? ' · one hit' : '') + (p.faves ? ' · ' + p.faves + ' ♥' : '') + '</span>';
      if (mine) { var e = el('span', 'pk-edit', 'Edit'); e.addEventListener('click', function (ev) { ev.preventDefault(); location.href = '?edit=' + encodeURIComponent(p.slug); }); a.appendChild(e); }
      g.appendChild(a);
    });
    return g;
  }
  async function queue() {
    var r = await rpc('desk_packs'); var rows = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
    var box = el('div', 'pk-queue');
    var waiting = rows.filter(function (x) { return !x.published; });
    box.innerHTML = '<h2 class="pk-h2">The desk <span>' + waiting.length + ' waiting</span></h2>';
    if (!rows.length) { box.appendChild(el('p', 'pk-note', 'Nothing on the desk.')); app.appendChild(box); return; }
    var ul = el('div', 'pk-q');
    rows.forEach(function (x) {
      var li = el('div', 'pk-q-row' + (x.published ? ' on' : ''));
      li.innerHTML = '<a href="?p=' + encodeURIComponent(x.slug) + '"><b>' + esc(x.title) + '</b><span>' + esc(x.author) + ' · ' + x.cards + ' cards · ' + esc(when(x.updated_at)) + '</span></a>' +
        '<button type="button" class="pk-btn ' + (x.published ? 'ghost' : '') + '">' + (x.published ? 'Take down' : 'Publish') + '</button>';
      li.querySelector('button').addEventListener('click', async function () {
        this.disabled = true;
        var q = await rpc('pack_publish', { p_id: x.id, p_on: !x.published });
        if (q && q.error) { this.disabled = false; alert(q.error.message || 'That did not go through.'); return; }
        location.reload();
      });
      ul.appendChild(li);
    });
    box.appendChild(ul); app.appendChild(box);
  }

  /* ================= ONE PACK ================= */
  async function open(slug) {
    app.innerHTML = '<p class="pk-note">Opening the pack…</p>';
    var r = await rpc('pack_open', { p_slug: slug });
    var P = r && !r.error ? r.data : null;
    if (!P) { note('That pack is not out. It may still be on the desk.', true); app.appendChild(el('p', 'pk-note', '<a href="./">Back to the shelf</a>')); return; }
    d.title = P.title + ' · Packs · 0FF THE PRINT';
    var S = store(), st = S.p[slug] || { f: [] };
    var cards = (P.cards || []).slice();
    var coverKey = P.cover || (cards[0] && cards[0].image) || '';
    app.innerHTML = '';
    var head = el('div', 'pk-head');
    var by = authorLink(P);
    head.innerHTML = '<div class="kicker">A pack by ' + (by ? '<a href="' + esc(by) + '">' + esc(P.author) + '</a>' : esc(P.author)) + ' · ' + esc(kindWord(P.kind)) + (!P.published ? ' · <span class="wait">on the desk, not public yet</span>' : '') + '</div>' +
      '<h1>' + esc(P.title) + '</h1>' + (P.line ? '<p class="pk-dek">' + esc(P.line) + '</p>' : '') +
      '<p class="pk-meta">' + cards.length + ' cards' + (cards.some(function (c) { return c.rarity === 'hit'; }) ? ' · one hit inside' : '') + ' · ' + esc(when(P.created_at)) +
      (P.mine ? ' · <a href="?edit=' + esc(slug) + '">Edit</a>' : '') + ' · <button type="button" class="pk-link pk-share">Copy the link</button></p>';
    app.appendChild(head);
    head.querySelector('.pk-share').addEventListener('click', function () {
      var u = location.origin + location.pathname + '?p=' + encodeURIComponent(slug);
      try { navigator.clipboard.writeText(u); this.textContent = 'Copied'; } catch (e) { prompt('The link', u); }
    });

    // the sealed pouch
    var pouch = el('div', 'pk-pouch');
    pouch.innerHTML = '<span class="pk-pouch-art">' + (coverKey ? '<img src="' + esc(url(coverKey)) + '" alt="">' : '') + '</span>' +
      '<span class="pk-pouch-seal top"></span><span class="pk-pouch-seal bot"></span>' +
      '<span class="pk-pouch-t">' + esc(P.title) + '</span><button type="button" class="pk-btn pk-tear">Tear it open</button>';
    var table = el('div', 'pk-table'); table.hidden = true;
    var line = el('p', 'pk-line'); line.hidden = true;
    app.appendChild(pouch); app.appendChild(line); app.appendChild(table);

    function deal() {
      pouch.classList.add('torn');
      setTimeout(function () { pouch.hidden = true; }, 650);
      table.hidden = false; line.hidden = false;
      var order = cards.slice();
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
      order.forEach(function (c, i) { table.appendChild(card(c, i)); });
      var all = el('button', 'pk-link pk-all'); all.type = 'button'; all.textContent = 'Flip them all';
      all.addEventListener('click', function () { table.querySelectorAll('.pk-card:not(.up)').forEach(function (x) { x.click(); }); });
      line.appendChild(all);
      if (!S.p[slug]) { S.p[slug] = { f: [], t: Date.now() }; store(S); }
      paintLine();
      tally();
    }
    function paintLine() {
      var n = cards.length, f = (S.p[slug] && S.p[slug].f || []).length;
      var hitUp = cards.some(function (c) { return c.rarity === 'hit' && (S.p[slug].f || []).indexOf(c.id) >= 0; });
      var txt = line.querySelector('.pk-line-t') || line.insertBefore(el('span', 'pk-line-t'), line.firstChild);
      txt.textContent = f >= n ? 'All ' + n + ' flipped.' + (hitUp ? ' You found the hit.' : '') : f + ' of ' + n + ' flipped.' + (hitUp ? ' The hit is yours.' : cards.some(function (c) { return c.rarity === 'hit'; }) ? ' The hit is still face down.' : '');
    }
    function card(c, i) {
      var up = (st.f || []).indexOf(c.id) >= 0;
      var k = el('div', 'pk-card r-' + c.rarity + (up ? ' up' : ''));
      k.dataset.id = c.id; k.style.animationDelay = (i * 70) + 'ms';
      k.innerHTML = '<div class="pk-flip"><div class="pk-back"><img src="../assets/cathedral/mark.webp" alt=""></div>' +
        '<div class="pk-face"><span class="pk-img"><img src="' + esc(url(c.image)) + '" alt="' + esc(c.caption || '') + '" loading="lazy" decoding="async"></span>' +
        '<span class="pk-rar">' + esc(R[c.rarity] || c.rarity) + '</span>' +
        (c.caption ? '<span class="pk-capt">' + esc(c.caption) + '</span>' : '') +
        '<span class="pk-acts"><button type="button" class="pk-fav' + (c.mine ? ' on' : '') + '" aria-pressed="' + (c.mine ? 'true' : 'false') + '" aria-label="Favourite"><img src="../assets/cathedral/r/heart.webp" alt=""><span class="n">' + (c.faves | 0) + '</span></button>' +
        '<a class="pk-full" href="' + esc(url(c.image)) + '" target="_blank" rel="noopener">full size &rarr;</a></span></div></div>';
      k.addEventListener('click', function (ev) {
        if (ev.target.closest('.pk-acts')) return;
        if (k.classList.contains('up')) return;
        k.classList.add('up');
        if (c.rarity === 'hit') { k.classList.add('pop'); }
        S = store(); S.p[slug] = S.p[slug] || { f: [], t: Date.now() };
        if (S.p[slug].f.indexOf(c.id) < 0) S.p[slug].f.push(c.id);
        store(S); paintLine();
      });
      var fav = k.querySelector('.pk-fav');
      fav.addEventListener('click', async function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (!MEMBER) { nudge(k); return; }
        var on = !fav.classList.contains('on');
        fav.disabled = true;
        var q = await rpc('pack_fave', { p_card: c.id, p_on: on });
        fav.disabled = false;
        if (q && q.error) { nudge(k, q.error.message); return; }
        fav.classList.toggle('on', on); fav.setAttribute('aria-pressed', on ? 'true' : 'false');
        var n = fav.querySelector('.n'); n.textContent = Math.max(0, (parseInt(n.textContent, 10) || 0) + (on ? 1 : -1));
      });
      return k;
    }
    function nudge(k, msg) {
      var old = k.querySelector('.pk-nudge'); if (old) old.remove();
      var n = el('span', 'pk-nudge', msg ? esc(msg) : 'Keeping a card is for members. <a href="../join/?next=home">Log in</a> or <a href="../wall/">join the Crypt</a>.');
      k.querySelector('.pk-face').appendChild(n);
      setTimeout(function () { n.remove(); }, 4000);
    }
    async function tally() {
      var ids = cards.map(function (c) { return c.id; });
      var q = await rpc('pack_fave_tally', { p_cards: ids });
      if (!q || q.error || !Array.isArray(q.data)) return;
      q.data.forEach(function (row) {
        var k = table.querySelector('.pk-card[data-id="' + row.card_id + '"]'); if (!k) return;
        k.querySelector('.pk-fav .n').textContent = row.n | 0;
        k.querySelector('.pk-fav').classList.toggle('on', !!row.mine);
      });
    }
    pouch.querySelector('.pk-tear').addEventListener('click', deal);
    if ((st.f || []).length) { pouch.querySelector('.pk-tear').textContent = 'Open it again'; }
  }

  /* ================= THE BUILDER ================= */
  async function build(editSlug) {
    d.title = 'Make a pack · 0FF THE PRINT';
    if (!MEMBER) { note('Members make packs.', true); app.appendChild(el('p', 'pk-note', '<a href="../join/?next=home">Log in</a> or <a href="../wall/">join the Crypt</a>. All it takes is an Instagram.')); return; }
    var P = null;
    if (editSlug) {
      var r = await rpc('pack_open', { p_slug: editSlug });
      P = r && !r.error ? r.data : null;
      if (!P || !(P.mine || ADMIN)) { note('That pack is not yours to edit.', true); return; }
    }
    var cards = P ? (P.cards || []).map(function (c) { return { key: c.image, url: url(c.image), rarity: c.rarity, caption: c.caption || '' }; }) : [];
    var cover = P ? P.cover : '';
    app.innerHTML = '';
    var head = el('div', 'pk-head');
    head.innerHTML = '<div class="kicker"><a href="./">&larr; Packs</a></div><h1>' + (P ? 'Edit the pack' : 'Make a pack') + '</h1>' +
      '<p class="pk-dek">Three to twelve photos. You pick the rarity of each: common, rare, holo, full art, and one hit if you want a chase. ' + (ADMIN ? 'Yours go live when you save.' : 'When you save it goes to the desk, and it is out once they okay it.') + '</p>';
    app.appendChild(head);
    var f = el('form', 'pk-form'); f.setAttribute('novalidate', '');
    f.innerHTML = '<label>Title<input name="title" maxlength="60" value="' + esc(P ? P.title : '') + '" placeholder="Side Stage Nights"></label>' +
      '<label>A line<input name="line" maxlength="200" value="' + esc(P ? P.line : '') + '" placeholder="Five frames from the pit, one of them you"></label>' +
      '<div class="pk-add"><label class="pk-btn ghost"><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>&#43; Add photos</label><span class="pk-add-l">JPG, PNG or WebP. Forty uploads a day.</span></div>' +
      '<div class="pk-cards"></div>' +
      '<div class="pk-form-row"><span class="pk-msg" role="status"></span>' + (P ? '<button type="button" class="pk-link pk-del">Delete the pack</button>' : '') + '<button type="submit" class="pk-btn">' + (ADMIN ? 'Save and publish' : 'Save and send to the desk') + '</button></div>';
    app.appendChild(f);
    var list = f.querySelector('.pk-cards'), msg = f.querySelector('.pk-msg'), input = f.querySelector('input[type=file]');
    function say(t, bad) { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); }
    function draw() {
      list.innerHTML = '';
      if (!cards.length) { list.appendChild(el('p', 'pk-note', 'No photos yet. Add some.')); return; }
      cards.forEach(function (c, i) {
        var row = el('div', 'pk-row' + (c.busy ? ' busy' : '') + (c.err ? ' err' : ''));
        row.innerHTML = '<span class="pk-row-img">' + (c.url ? '<img src="' + esc(c.url) + '" alt="">' : '') + (c.busy ? '<i>uploading…</i>' : '') + (c.err ? '<i class="bad">' + esc(c.err) + '</i>' : '') + '</span>' +
          '<span class="pk-row-f"><label>Rarity<select>' + RORDER.map(function (k) { return '<option value="' + k + '"' + (c.rarity === k ? ' selected' : '') + '>' + R[k] + '</option>'; }).join('') + '</select></label>' +
          '<label>Caption<input maxlength="140" value="' + esc(c.caption) + '" placeholder="one line, or none"></label>' +
          '<label class="pk-cv"><input type="radio" name="cover"' + (c.key && cover === c.key ? ' checked' : '') + (c.key ? '' : ' disabled') + '> the cover</label></span>' +
          '<span class="pk-row-b"><button type="button" data-up aria-label="Move up">&uarr;</button><button type="button" data-down aria-label="Move down">&darr;</button><button type="button" data-rm aria-label="Remove">&times;</button></span>';
        row.querySelector('select').addEventListener('change', function () {
          if (this.value === 'hit') cards.forEach(function (x, j) { if (j !== i && x.rarity === 'hit') x.rarity = 'fullart'; });
          c.rarity = this.value; draw();
        });
        row.querySelector('input[maxlength]').addEventListener('input', function () { c.caption = this.value; });
        row.querySelector('input[type=radio]').addEventListener('change', function () { cover = c.key; });
        row.querySelector('[data-up]').addEventListener('click', function () { if (i > 0) { cards.splice(i - 1, 0, cards.splice(i, 1)[0]); draw(); } });
        row.querySelector('[data-down]').addEventListener('click', function () { if (i < cards.length - 1) { cards.splice(i + 1, 0, cards.splice(i, 1)[0]); draw(); } });
        row.querySelector('[data-rm]').addEventListener('click', function () { if (cover === c.key) cover = ''; cards.splice(i, 1); draw(); });
        list.appendChild(row);
      });
      var n = cards.filter(function (c) { return c.key; }).length;
      list.appendChild(el('p', 'pk-count', n + ' of 12' + (cards.some(function (c) { return c.rarity === 'hit'; }) ? ' · one hit set' : ' · no hit yet')));
    }
    input.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(input.files || []); input.value = '';
      if (cards.length + files.length > 12) { say('Twelve photos is the ceiling.', true); files = files.slice(0, Math.max(0, 12 - cards.length)); }
      for (var k = 0; k < files.length; k++) {
        var c = { key: '', url: URL.createObjectURL(files[k]), rarity: 'common', caption: '', busy: true };
        cards.push(c); draw();
        try { var up = await OTP.uploadPackPhoto(files[k]); c.key = up.key; c.url = up.url; c.busy = false; }
        catch (e) { c.busy = false; c.err = (e && e.message) || 'That one did not upload.'; }
        draw();
      }
    });
    f.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var title = f.elements.title.value.trim(), line = f.elements.line.value.trim();
      var ready = cards.filter(function (c) { return c.key; });
      if (title.length < 2) { say('Give it a title.', true); f.elements.title.focus(); return; }
      if (cards.some(function (c) { return c.busy; })) { say('Still uploading, one second.', true); return; }
      if (ready.length < 3) { say('A pack is at least three photos.', true); return; }
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true; say('Saving…');
      var q = await rpc('pack_save', { p: { id: P ? P.id : null, title: title, line: line, cover: cover || ready[0].key,
        cards: ready.map(function (c) { return { image: c.key, rarity: c.rarity, caption: c.caption }; }) } });
      btn.disabled = false;
      if (q && q.error) { say(q.error.message || 'That did not go through.', true); return; }
      say(ADMIN ? 'Live.' : 'Sent to the desk.');
      setTimeout(function () { location.href = '?p=' + encodeURIComponent(q.data); }, 500);
    });
    var del = f.querySelector('.pk-del');
    if (del) del.addEventListener('click', async function () {
      if (!confirm('Take this pack down for good?')) return;
      var q = await rpc('pack_delete', { p_id: P.id });
      if (q && q.error) { say(q.error.message || 'That did not go through.', true); return; }
      location.href = './';
    });
    draw();
    // the maker's shelf, under the form
    var mine = await rpc('my_packs');
    if (mine && !mine.error && Array.isArray(mine.data) && mine.data.length) {
      var box = el('div', 'pk-mine');
      box.innerHTML = '<h2 class="pk-h2">Your packs</h2>';
      mine.data.forEach(function (p) {
        box.appendChild(el('p', 'pk-mine-row', '<a href="?p=' + esc(p.slug) + '"><b>' + esc(p.title) + '</b></a> <span>' + (p.published ? 'out' : 'on the desk') + ' · ' + esc(when(p.updated_at)) + '</span> <a href="?edit=' + esc(p.slug) + '">edit</a>'));
      });
      app.appendChild(box);
    }
  }

  /* ================= route ================= */
  async function go() {
    if (!(w.OTP && OTP.configured)) { note('The backend is asleep, so the packs are resting too.', true); return; }
    await whoami();
    var q = new URLSearchParams(location.search);
    var p = q.get('p'), e = q.get('edit');
    if (p && slugOk(p)) return open(p);
    if (e && slugOk(e)) return build(e);
    if (location.hash === '#new') return build(null);
    return shelf();
  }
  w.addEventListener('hashchange', function () { if (location.hash === '#new' || !location.search) go(); });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', go); else go();
})(window, document);
