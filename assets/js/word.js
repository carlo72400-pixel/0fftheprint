/* THE WORD — story page overlay + member wall (migration 008).
   Loaded ONLY by word/<slug>/index.html, after desk.js. Everything here is
   additive: if this file, the CDN, or the backend is missing, the committed
   article renders exactly as it did when the page was pure static HTML.

   Two jobs:
   1. If the desk saved a body override (story_pages), repaint the article from
      its markdown — UNLESS the override's stamp no longer matches the page's
      data-stamp, which means the override was already baked back to git and
      would otherwise SHADOW newer committed content forever.
   2. Render the wall (approved member entries) and, for a logged-in approved
      member, the entry box. Entries are pre-moderated: they go to the desk. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- markdown, the same frozen subset newstory.py renders -----------------
  // SEVEN rules: paragraph, ## heading, > quote, ![figure](img), [link](url),
  // **bold**, *italic*. Any widening must land in newstory.py's md_to_html in
  // the SAME commit or baked pages and overlays render differently.
  // Overrides are DESK-authored (RLS: admin only writes story_pages), but the
  // figure src is pinned to a same-directory image name anyway.
  function inline(s) {
    // & < > only, matching newstory.py's html.escape(quote=False) byte for
    // byte — inline text lands between tags, never in an attribute. Attribute
    // contexts (figure src/alt) go through the full esc() instead.
    s = String(s).replace(/—/g, ',')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    return s;
  }
  function mdToHtml(md) {
    return String(md).trim().split(/\n\s*\n/).map(block => {
      const b = block.trim();
      if (!b) return '';
      if (b.startsWith('## ')) return '<h2>' + inline(b.slice(3)) + '</h2>';
      if (b.startsWith('> ')) {
        const q = b.split('\n').map(l => l.replace(/^>\s?/, '').trim()).join(' ');
        return '<blockquote>' + inline(q) + '</blockquote>';
      }
      const fig = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(b);
      if (fig) {
        const src = fig[2];
        if (!/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(src)) return '';
        return '<figure><img src="' + esc(src) + '" alt="' + esc(fig[1]) + '" loading="lazy"></figure>';
      }
      return '<p>' + inline(b.split('\n').map(l => l.trim()).join(' ')) + '</p>';
    }).filter(Boolean).join('\n');
  }

  // Shared renderer: /word/new/ (preview) and /word/live/ (member stories)
  // consume the SAME implementation, so there is exactly one markdown in the
  // house and the byte-parity contract with newstory.py holds everywhere.
  window.OTPWord = { esc, inline, mdToHtml };

  const article = document.querySelector('article');
  const wallEl = document.getElementById('wall');
  const slug = wallEl ? wallEl.dataset.story : null;
  if (!slug || !window.OTP || !OTP.configured) return;

  const race = p => Promise.race([
    p, new Promise(r => setTimeout(() => r(null), 1800)),
  ]).catch(() => null);

  // ---- 1. the body override -------------------------------------------------
  (async () => {
    if (!article) return;
    const ov = await race(OTP.storyOverride(slug));
    if (!ov || !ov.body_md) return;
    const pageStamp = article.dataset.stamp || '';
    if (ov.stamp && pageStamp && ov.stamp !== pageStamp) {
      // Baked and pushed since this override was written. The override is
      // stale; the committed page wins. The desk editor surfaces this state.
      console.warn('story override is stale (baked since), ignoring');
      return;
    }
    article.innerHTML = mdToHtml(ov.body_md);
    const byline = document.querySelector('.byline');
    if (byline && ov.updated_at) {
      const d = new Date(ov.updated_at);
      if (!isNaN(d)) byline.insertAdjacentHTML('beforeend',
        ' &nbsp;·&nbsp; UPDATED ' + esc(d.toLocaleDateString('en-US',
          { month: 'short', day: 'numeric' }).toUpperCase()));
    }
  })();

  // ---- 2. the wall ----------------------------------------------------------
  (async () => {
    const list = document.getElementById('wall-entries');
    const compose = document.getElementById('wall-compose');
    if (!list || !compose) return;

    const entries = (await race(OTP.wall(slug))) || [];
    const me = await race(OTP.me());
    const canPost = !!(me && me.profile && me.profile.approved);

    if (!entries.length && !canPost) return;   // nothing to show, stay hidden
    wallEl.hidden = false;

    list.innerHTML = entries.map(e => `
      <div class="wall-entry">
        <div class="we-by">${esc(e.display_name || e.card_slug || 'card holder')}</div>
        <div class="we-text">${esc(e.text)}</div>
      </div>`).join('') ||
      '<div class="we-none">Nothing on the wall yet. First card holder in gets the top slot.</div>';

    if (!canPost) return;
    const mine = (await race(OTP.myEntries(slug))) || [];
    const pending = mine.find(x => !x.published);

    if (pending) {
      compose.innerHTML = `
        <div class="we-pending">Yours is on the desk. <button type="button" id="we-withdraw">Withdraw</button></div>`;
      const btn = document.getElementById('we-withdraw');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await OTP.withdrawEntry(pending.id); compose.innerHTML = ''; renderBox(); }
        catch (err) { btn.disabled = false; alert(err.message); }
      });
      return;
    }
    renderBox();

    function renderBox() {
      compose.innerHTML = `
        <textarea id="we-text" maxlength="500" rows="3"
          placeholder="Add to this one. Goes to the desk first."></textarea>
        <div class="we-row">
          <span class="we-count" id="we-count">500</span>
          <button type="button" id="we-send">Send to the desk</button>
        </div>
        <div class="we-msg" id="we-msg"></div>`;
      const ta = document.getElementById('we-text');
      const count = document.getElementById('we-count');
      ta.addEventListener('input', () => { count.textContent = 500 - ta.value.length; });
      document.getElementById('we-send').addEventListener('click', async () => {
        const msg = document.getElementById('we-msg');
        try {
          await OTP.submitEntry(slug, ta.value);
          compose.innerHTML = '<div class="we-pending">On the desk. It shows up here when it clears.</div>';
        } catch (err) { msg.textContent = err.message; }
      });
    }
  })();
})();
