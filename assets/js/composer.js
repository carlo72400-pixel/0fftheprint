/* 0FF THE PRINT — the box at the top of the timeline.
   Posting should be one tap from the homepage, not a trip to another page.

   Four states, same as the door: signed out, in the queue, card holder, desk.
   Only a card holder gets the actual box. Everyone else gets one line and a
   link, because this is a members door and not a signup funnel.

   Its own file, loaded deferred AFTER desk.js, so if any of it throws the
   timeline underneath still renders. The homepage is not allowed to depend on
   this working. */
(async () => {
  const mount = document.getElementById('composer');
  if (!mount) return;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Same rule the timeline uses: escaping makes text safe inside an attribute,
  // it does nothing to a URL scheme.
  const safeUrl = u => {
    const v = String(u ?? '').trim();
    if (!v) return '';
    // '#anchor' has to be allowed explicitly. It cannot execute anything, and
    // leaving it out silently killed every in-page link that came through here
    // (the #roster catalog tile, a card holder's avatar with no external link).
    if (/^#[\w-]*$/.test(v)) return v;
    if (/^(https?:)?\/\//i.test(v) || /^\/(?!\/)/.test(v) || /^[\w./-]+$/.test(v)) {
      return /^\s*(javascript|data|vbscript):/i.test(v) ? '' : v.replace(/["']/g, '');
    }
    return '';
  };

  const line = (html) => { mount.innerHTML = `<div class="cbox prompt">${html}</div>`; };

  if (!window.OTP || !OTP.configured) return;      // no backend, no box, no noise

  let me = null;
  try { me = await OTP.me(); } catch (e) { console.warn('composer: no session', e.message); }

  // ---------- signed out ----------
  if (!me) {
    line(`<span class="cav plain"></span>
      <div class="cgrow"><a class="clink" href="join/">Got a card? Log in.</a>
        <div class="cnote">Card holders post straight to this timeline.</div></div>`);
    return;
  }

  // ---------- signed in, still in the queue ----------
  if (!me.profile || !me.profile.approved) {
    line(`<span class="cav plain"></span>
      <div class="cgrow"><b class="clink">You're in the queue.</b>
        <div class="cnote">The desk approves by hand. It moves when it moves.</div></div>`);
    return;
  }

  // ---------- card holder: the real box ----------
  // Their card art, so the box looks like them. Falls back to a plain ring.
  let avatar = '';
  try {
    const [r, c] = await Promise.all([
      fetch('content/roster.json', { cache: 'no-cache' }).then(x => x.json()).catch(() => ({ items: [] })),
      fetch('content/creators.json', { cache: 'no-cache' }).then(x => x.json()).catch(() => ({ items: [] })),
    ]);
    const slugify = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const mine = [...(c.items || []), ...(r.items || [])]
      .find(x => slugify(x.name) === (me.profile.card_slug || ''));
    avatar = safeUrl(mine && mine.photo);
  } catch (e) { /* a missing avatar is not worth a broken box */ }

  const first = (me.profile.display_name || '0').trim()[0] || '0';
  mount.innerHTML = `
    <div class="cbox">
      <div class="crow">
        <span class="cav${avatar ? '' : ' plain'}" id="c-av">${avatar ? '' : esc(first)}</span>
        <div class="cgrow">
          <textarea id="c-text" maxlength="800" rows="1"
            placeholder="What's up, ${esc((me.profile.display_name || '').split(' ')[0])}?"></textarea>
          <div class="cprev" id="c-prev"><button id="c-rm" type="button" aria-label="Remove">&times;</button></div>
          <div class="cbar">
            <button class="cattach" id="c-attach" type="button">Photo / GIF / video</button>
            <span class="cspacer"></span>
            <span class="ccount" id="c-count"></span>
            <button class="cpost" id="c-go" type="button" disabled>Post</button>
          </div>
          <div class="cmsg" id="c-msg"></div>
        </div>
      </div>
      <input type="file" id="c-file" accept="image/*,video/*" hidden>
    </div>`;

  if (avatar) document.getElementById('c-av').style.backgroundImage = 'url("' + avatar + '")';

  const $ = id => document.getElementById(id);
  const ta = $('c-text'), prev = $('c-prev'), go = $('c-go'), msgEl = $('c-msg'), countEl = $('c-count');
  let file = null, objUrl = null;

  const msg = (t, k) => { msgEl.textContent = t; msgEl.className = 'cmsg show ' + (k || ''); };
  const clearMsg = () => { msgEl.className = 'cmsg'; };

  const sync = () => {
    const n = ta.value.trim().length;
    countEl.textContent = n > 640 ? `${n} / 800` : '';
    countEl.classList.toggle('over', n > 800);
    go.disabled = (n === 0 && !file) || n > 800;
  };

  // Grow with the text instead of making them scroll a 2 line box.
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 260) + 'px'; };
  ta.addEventListener('input', () => { grow(); sync(); clearMsg(); });

  $('c-attach').onclick = () => $('c-file').click();
  $('c-file').onchange = e => { if (e.target.files[0]) setFile(e.target.files[0]); };

  $('c-rm').onclick = () => {
    file = null;
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    prev.style.display = 'none';
    [...prev.querySelectorAll('img,video')].forEach(el => el.remove());
    $('c-file').value = '';
    sync();
  };

  function setFile(f) {
    const isVid = /^video\//.test(f.type || '') || /\.(mp4|mov|webm|m4v)$/i.test(f.name || '');
    if (!isVid && !/^image\//.test(f.type || '') && !/\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(f.name || '')) {
      msg('Photos, GIFs and video clips only.', 'err'); return;
    }
    if (f.size > 50 * 1024 * 1024) {
      msg(isVid ? 'That clip is over 50MB. Trim it or drop the quality a notch.'
                : 'That photo is over 50MB. Shrink it first.', 'err');
      return;
    }
    file = f;
    clearMsg();
    if (objUrl) URL.revokeObjectURL(objUrl);
    objUrl = URL.createObjectURL(f);
    [...prev.querySelectorAll('img,video')].forEach(el => el.remove());
    const el = document.createElement(isVid ? 'video' : 'img');
    el.src = objUrl;
    if (isVid) { el.controls = true; el.playsInline = true; }
    prev.appendChild(el);
    prev.style.display = 'block';
    sync();
  }

  go.onclick = async () => {
    const text = ta.value.trim();
    if (!text && !file) return;
    if (!text) { msg('Say something with it.', 'err'); return; }
    go.disabled = true;
    const label = go.textContent;
    try {
      let url = null;
      if (file) { go.textContent = 'Uploading…'; url = await OTP.uploadImage(file); }
      go.textContent = 'Posting…';
      await OTP.post({ text, imageUrl: url });
      ta.value = ''; grow(); $('c-rm').click();
      msg('Up.', 'good');
      // Reload so the new post lands in the timeline through the same render
      // path as everything else. Cheaper than duplicating the post template
      // here and letting the two drift apart.
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      const m = e.message || '';
      msg(/^(Slow down|That is twenty|The desk pulled|Log in first|That clip|That photo|Photos, GIFs)/.test(m)
        ? m : (m || 'That did not go through.'), 'err');
      go.disabled = false; go.textContent = label;
    }
  };

  sync();
})();
