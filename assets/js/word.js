/* THE WORD — story page overlay + member wall (migration 008).
   Loaded ONLY by word/<slug>/index.html, after desk.js. Everything here is
   additive: if this file, the CDN, or the backend is missing, the committed
   article renders exactly as it did when the page was pure static HTML.

   Three jobs:
   1. If the desk saved a body override (story_pages), repaint the article from
      its markdown — UNLESS the override's stamp no longer matches the page's
      data-stamp, which means the override was already baked back to git and
      would otherwise SHADOW newer committed content forever.
   2. Render the wall (approved member entries) and, for a logged-in approved
      member, the entry box. Entries are pre-moderated: they go to the desk.
      A line of yours that is up gets Take mine down (045).
   3. The board's fix to this story (045, site_overrides section 'desk', key
      word/<slug>/): a new title, dek or kicker repaints the page, and a pulled
      story reads "Pulled" to everybody but the desk until the next bake turns
      the file itself into a stub. The desk gets its own way back to the board.

   Every network read here is raced and nothing waits on it: the committed page
   paints first, whatever the CDN or the database is doing. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- markdown, the same frozen subset newstory.py renders -----------------
  // SEVEN rules: paragraph, ## heading, > quote, ![figure](img), [link](url),
  // **bold**, *italic*. Any widening must land in newstory.py's md_to_html in
  // the SAME commit or baked pages and overlays render differently.
  // `newstory.py --parity` renders every word/*/source.md both ways and diffs.
  //
  // Two figure rules. HOUSE mode ({house: true}) is newstory.py's: the image
  // on the block's first line, the lines under it its caption (where a CC
  // credit goes), an http src, an .mp4/.m4v/.mov clip with {poster=...}. Only
  // the story_pages override passes it, and only the desk writes story_pages
  // (RLS: admin). MEMBER mode (word/new preview, word/live) keeps the narrow
  // rule: a bare figure block, src pinned to a same-directory image name,
  // because member body_md is not the desk's.
  function inline(s) {
    // & < > only, matching newstory.py's html.escape(quote=False) byte for
    // byte — inline text lands between tags, never in an attribute. Attribute
    // contexts (figure src/alt) go through attr() instead.
    s = String(s).replace(/—/g, ',')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // ⛔ One level of balanced parens, same as newstory.py: Wikimedia file
    //    names carry them, and [^)\s]+ cut the credit link short. A " can
    //    never be part of the url: quotes are not escaped here, so one would
    //    close href="..." and open an attribute of the writer's choosing.
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^()\s"]|\([^()\s"]*\))+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    return s;
  }
  // Python's html.escape(quote=True), byte for byte, for figure attributes.
  const attr = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const isHttp = s => /^https?:\/\//.test(s);
  // newstory.py copies a local file in next to the page under its base name.
  // A local name with a scheme in it is not a file newstory could copy.
  const localName = s => { const n = s.split('/').pop(); return n && n.indexOf(':') === -1 ? n : ''; };
  function houseFigure(b) {
    const lines = b.split('\n');
    const m = /^!\[([^\]]*)\]\(([^)\s]+)\)(?:\{poster=([^}\s]+)\})?$/.exec(lines[0].trim());
    if (!m) return null;
    const alt = m[1];
    let src = m[2], poster = m[3];
    const cap = lines.slice(1).map(l => l.trim()).filter(Boolean).join(' ');
    if (/\.(mp4|m4v|mov)$/i.test(src)) {
      // newstory.py refuses a clip that is not an http url on the media Pages site
      if (!isHttp(src)) return '';
      let pa = '';
      if (poster) {
        if (!isHttp(poster)) poster = localName(poster);
        if (poster) pa = ' poster="' + attr(poster) + '"';
      }
      return '<figure class="clip"><video controls playsinline preload="none"' + pa +
        ' src="' + attr(src) + '"></video>' +
        ((cap || alt) ? '<figcaption>' + inline(cap || alt) + '</figcaption>' : '') + '</figure>';
    }
    if (!isHttp(src)) src = localName(src);
    if (!src) return '';
    return '<figure><img src="' + attr(src) + '" alt="' + attr(alt) + '" loading="lazy">' +
      (cap ? '<figcaption>' + inline(cap) + '</figcaption>' : '') + '</figure>';
  }
  function mdToHtml(md, opts) {
    const house = !!(opts && opts.house);
    return String(md).trim().split(/\n\s*\n/).map(block => {
      const b = block.trim();
      if (!b) return '';
      if (b.startsWith('## ')) return '<h2>' + inline(b.slice(3)) + '</h2>';
      if (b.startsWith('> ')) {
        // ln.lstrip("> ").strip() in newstory.py
        const q = b.split('\n').map(l => l.replace(/^[> ]+/, '').trim()).join(' ');
        return '<blockquote>' + inline(q) + '</blockquote>';
      }
      if (house) {
        const hf = houseFigure(b);
        if (hf !== null) return hf;
      } else {
        const fig = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(b);
        if (fig) {
          const src = fig[2];
          if (!/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(src)) return '';
          return '<figure><img src="' + attr(src) + '" alt="' + attr(fig[1]) + '" loading="lazy"></figure>';
        }
      }
      return '<p>' + inline(b.split('\n').map(l => l.trim()).join(' ')) + '</p>';
    }).filter(Boolean).join('\n');
  }

  // Two taps for anything that takes something down: the first swaps the label
  // and marks the button .sure for four seconds, the second runs fn with the
  // button held. fn says its own errors; a throw only lets the button go again.
  function twoTap(btn, sure, fn) {
    const was = btn.textContent;
    let t = null;
    const reset = () => { clearTimeout(t); btn.classList.remove('sure'); btn.textContent = was; };
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      if (!btn.classList.contains('sure')) {
        btn.classList.add('sure'); btn.textContent = sure;
        t = setTimeout(reset, 4000);
        return;
      }
      clearTimeout(t); btn.disabled = true;
      try { await fn(); } catch (e) { console.warn(e); }
      if (btn.isConnected) { btn.disabled = false; reset(); }
    });
  }

  // Shared renderer: /word/new/ (preview) and /word/live/ (member stories)
  // consume the SAME implementation, so there is exactly one markdown in the
  // house and the byte-parity contract with newstory.py holds everywhere.
  window.OTPWord = { esc, inline, mdToHtml, twoTap };

  const article = document.querySelector('article');
  const wallEl = document.getElementById('wall');
  const slug = wallEl ? wallEl.dataset.story : null;
  if (!slug || !window.OTP || !OTP.configured) return;

  const race = p => Promise.race([
    p, new Promise(r => setTimeout(() => r(null), 1800)),
  ]).catch(() => null);

  // The baked pages' CSS (newstory.py's template, 31 pages and counting) has no
  // rules for what jobs 2 and 3 add, so they carry their own, once, here.
  // Same type and colours as the template; the pulled line is bake.py's stub.
  const css = document.createElement('style');
  css.id = 'otpw-css';
  css.textContent = [
    'html.otpw-down .wrap>:not(.back):not(.otpw-pulled){display:none!important}',
    ".otpw-said{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;text-transform:uppercase;font-size:clamp(30px,6vw,46px);line-height:1}",
    '.otpw-pulled .foot{margin-top:30px;padding-top:8px}.otpw-pulled .foot a{display:inline-flex;align-items:center;min-height:44px}',
    ".otpw-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 14px;margin:22px 0 0;padding:4px 14px;background:#b3122a;color:#fff;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.06em}",
    '.otpw-bar a{color:#fff;font-weight:600;display:inline-flex;align-items:center;min-height:44px}',
    ".otpw-desk{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;margin:-18px 0 18px}",
    '.otpw-desk a{color:var(--pink);text-decoration:none;display:inline-flex;align-items:center;min-height:44px}',
    '.wall-entry .we-row{margin-top:4px}.wall-entry .we-msg{margin-top:0}',
    '.we-row button.sure{border-color:#ff6a7e;color:#ff6a7e}',
  ].join('\n');
  document.head.appendChild(css);

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
    // House rules: source.md seeds the desk's editor, and house stories carry
    // captioned photos and clips the narrow member rule would print as text.
    article.innerHTML = mdToHtml(ov.body_md, { house: true });
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

    // 045: your own lines. One that is up gets Take mine down; one still on the
    // desk keeps Withdraw in the box below. (A writer who is no longer a card
    // holder has no lines on this wall: word_wall shows card holders only.)
    const mine = canPost ? ((await race(OTP.myEntries(slug))) || []) : [];
    const mineUp = new Set(mine.filter(x => x.published).map(x => String(x.id)));

    // The name goes to their card page. c/?s= answers before bake.py has made
    // c/<slug>/. Inline style: the baked pages' CSS has no rule for it.
    const who = e => {
      const n = esc(e.display_name || e.card_slug || 'card holder');
      return e.card_slug
        ? `<a href="../../c/?s=${encodeURIComponent(e.card_slug)}" style="color:inherit;text-decoration:none">${n}</a>`
        : n;
    };
    list.innerHTML = entries.map((e, i) => `
      <div class="wall-entry" data-i="${i}">
        <div class="we-by">${who(e)}</div>
        <div class="we-text">${esc(e.text)}</div>
        ${mineUp.has(String(e.id)) ? `<div class="we-row"><span class="we-msg"></span>
          <button type="button" class="we-down">Take mine down</button></div>` : ''}
      </div>`).join('') ||
      '<div class="we-none">Nothing on the wall yet. First card holder in gets the top slot.</div>';
    list.querySelectorAll('.we-down').forEach(btn => {
      const row = btn.closest('.wall-entry');
      const e = entries[Number(row.dataset.i)];
      twoTap(btn, 'Tap again to take it down', async () => {
        try {
          await OTP.withdrawEntry(e.id);
          row.innerHTML = '<div class="we-pending">Taken down.</div>';
        } catch (err) {
          row.querySelector('.we-msg').textContent = (err && err.message) || 'That did not go through. Try again.';
        }
      });
    });

    if (!canPost) return;
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

  // ---- 3. the board's fix to this story (045) -------------------------------
  // One site_overrides row per story, section 'desk', key 'word/<slug>/'
  // (site_overrides_desk_shape): patch {title, dek, kicker, shelf} and hidden.
  // bake.py folds it into git: the patch into the page head and desk.json, a
  // pull into a stub file. Until that bake, this is what readers see. The
  // shelf only moves the Stories tab, so it has nothing to repaint here.
  (async () => {
    if (!/^[a-z0-9][a-z0-9-]{0,90}$/.test(slug)) return;
    const key = 'word/' + slug + '/';
    const board = '../../board/?story=' + key;
    const wrap = document.querySelector('.wrap');
    // the story's own head, found before anything below adds a .kicker of its own
    const h1 = document.querySelector('h1');
    const dek = document.querySelector('.dek');
    const kicker = document.querySelector('.kicker');
    const byline = document.querySelector('.byline');
    const meta = (sel, v) => { const m = document.querySelector(sel); if (m) m.setAttribute('content', v); };
    const said = v => typeof v === 'string' && v.trim() ? v.trim() : '';

    const rows = await race(OTP.siteOverrides('desk'));
    const ov = (Array.isArray(rows) ? rows : []).find(r => r && r.item_key === key) || null;
    const patch = ov && ov.patch && typeof ov.patch === 'object' && !Array.isArray(ov.patch) ? ov.patch : {};
    let title = (h1 && h1.textContent.trim()) || '';

    const t = said(patch.title), d = said(patch.dek), k = said(patch.kicker);
    if (t && h1) {
      h1.textContent = t; title = t;
      document.title = t + ' · 0FF THE PRINT';
      meta('meta[property="og:title"]', t);
    }
    if (d && dek) {
      dek.textContent = d;
      meta('meta[name="description"]', d);
      meta('meta[property="og:description"]', d);
    }
    if (k && kicker) kicker.textContent = k;

    // Pulled: everybody sees bake.py's stub at once, the desk included, until
    // me() says who is looking. A crawler that runs the page reads noindex.
    let pulled = null;
    if (ov && ov.hidden && wrap) {
      let robots = document.querySelector('meta[name="robots"]');
      if (!robots) {
        robots = document.createElement('meta');
        robots.setAttribute('name', 'robots');
        document.head.appendChild(robots);
      }
      robots.setAttribute('content', 'noindex');
      pulled = document.createElement('div');
      pulled.className = 'otpw-pulled';
      pulled.innerHTML = '<div class="kicker">0FF THE PRINT</div>' +
        '<p class="otpw-said">Pulled. The desk took this story down.</p>' +
        '<div class="foot"><a href="../../#stories">Back to the stories &rarr;</a></div>';
      wrap.appendChild(pulled);
      document.documentElement.classList.add('otpw-down');
      document.title = 'Pulled · 0FF THE PRINT';
    }

    const me = await OTP.me().catch(() => null);
    if (!(me && me.profile && me.profile.is_admin)) return;

    // THE DESK: the story stays readable for him, with the way back to the board
    if (pulled) {
      pulled.remove();
      document.documentElement.classList.remove('otpw-down');
      document.title = (title || 'The Word') + ' · 0FF THE PRINT';
      const bar = document.createElement('div');
      bar.className = 'otpw-bar';
      bar.innerHTML = '<span>PULLED · only you see this</span><a href="' + esc(board) + '">Put it back</a>';
      if (kicker && kicker.parentNode === wrap) wrap.insertBefore(bar, kicker);
      else if (wrap) wrap.insertBefore(bar, wrap.firstElementChild ? wrap.firstElementChild.nextSibling : null);
    }
    if (byline) {
      const fix = document.createElement('div');
      fix.className = 'otpw-desk';
      fix.innerHTML = '<a href="' + esc(board) + '">Desk: fix this story</a>';
      byline.insertAdjacentElement('afterend', fix);
    }
  })();
})();

/* ---------- READING MODE (10/15, his "reading that feels like print") ----------
   Additive, like everything above: paper by default (a Dark key flips it back and the phone remembers), a drop cap,
   the number as a stamp, a progress line, "continue where you left", Clip it (otp-clips, the Stories tab shows a
   Clipped shelf). Read to me was pulled the same night (robot voice). No page is rebuilt for this: the 31 story pages load
   this file already. */
(function () {
  if (!/\/word\/[a-z0-9-]+\/?$/.test(location.pathname) || !document.querySelector('article')) return;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const slug = (location.pathname.match(/\/word\/([a-z0-9-]+)/) || [])[1] || '';
  const link = 'word/' + slug + '/';
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const css = document.createElement('style');
  css.textContent = `
  .otp-prog{position:fixed;left:0;top:0;height:3px;width:0;background:#ff79c6;box-shadow:0 0 8px #ff79c6;z-index:50;transition:width .1s}
  .otp-keys{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}
  .otp-key{min-height:40px;padding:0 14px;border:0;border-radius:5px;background:linear-gradient(180deg,#3f3b48,#27242e);color:#f1ecf5;font:700 10.5px/1 'JetBrains Mono',monospace;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;
    box-shadow:0 1px 0 rgba(255,255,255,.16),0 3px 0 #0b0a0e,0 5px 8px rgba(0,0,0,.6);transition:transform .06s,box-shadow .06s}
  .otp-key:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(255,255,255,.16),0 1px 0 #0b0a0e}
  .otp-key.on{background:linear-gradient(180deg,#ff9fd6,#f068b6 55%,#d9479b);color:#2a0a1e;box-shadow:0 1px 0 rgba(255,255,255,.35),0 3px 0 #6d1f4b,0 5px 8px rgba(0,0,0,.6)}
  .otp-stamp{display:inline-block;margin:14px 0 0;padding:6px 10px;border:2px solid #ff79c6;border-radius:3px;font:700 12px/1 'JetBrains Mono',monospace;letter-spacing:.16em;color:#ff79c6;transform:rotate(-3deg)}
  .otp-cont{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:50;min-height:44px;padding:0 18px;border:0;border-radius:22px;background:#ff79c6;color:#0a0a0d;font:800 13px/1 Inter,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.6);cursor:pointer}
  /* paper */
  body.otp-print{background:#1c1a22}
  body.otp-print .wrap{background:#f3ede2;color:#1a1921;border-radius:4px;margin-top:18px;margin-bottom:30px;padding-top:28px;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 20px 50px rgba(0,0,0,.6);
    background-image:radial-gradient(rgba(0,0,0,.035) 1px,transparent 1.2px);background-size:5px 5px}
  body.otp-print h1,body.otp-print article,body.otp-print .dek,body.otp-print .byline b{color:#1a1921}
  body.otp-print .dek,body.otp-print .byline,body.otp-print .cover-credit,body.otp-print .foot,body.otp-print a.back{color:#5a5365}
  body.otp-print .byline,body.otp-print .foot{border-color:rgba(0,0,0,.15)}
  body.otp-print article{font-family:Georgia,'Times New Roman',serif;font-size:18px}
  body.otp-print article a{color:#c2317f}
  body.otp-print article blockquote{color:#c2317f;border-color:#c2317f}
  body.otp-print article h2{color:#1a1921}
  body.otp-print article figcaption{color:#5a5365}
  body.otp-print .cover{border-color:rgba(0,0,0,.2)}
  body.otp-print .wall,body.otp-print .wall h2,body.otp-print .we-text{color:#1a1921}
  body.otp-print .wall{border-color:rgba(0,0,0,.15)}
  body.otp-print .wall-entry{border-color:rgba(0,0,0,.15)}
  body.otp-print .otp-key{background:linear-gradient(180deg,#3f3b48,#27242e)}
  body.otp-print article > p:first-of-type::first-letter{float:left;font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;font-size:4.4em;line-height:.8;padding:6px 10px 0 0;color:#c2317f}
  article > p:first-of-type::first-letter{float:left;font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;font-size:4.4em;line-height:.8;padding:6px 10px 0 0;color:#ff79c6}`;
  document.head.appendChild(css);

  // paper by default, remembered
  const paper = load('otp-paper', 1); document.body.classList.toggle('otp-print', !!paper);

  // the stamp and the keys under the byline
  const byline = $('.byline'), h1 = $('h1'), art = $('article');
  const num = ((byline && byline.textContent) || '').match(/0TP-\d+/);
  if (num && h1) { const st = document.createElement('span'); st.className = 'otp-stamp'; st.textContent = num[0]; h1.insertAdjacentElement('afterend', st); }
  const keys = document.createElement('div'); keys.className = 'otp-keys';
  const kPaper = document.createElement('button'), kClip = document.createElement('button');
  [kPaper, kClip].forEach(b => { b.type = 'button'; b.className = 'otp-key'; keys.appendChild(b); });
  const paintPaper = () => { const on = document.body.classList.contains('otp-print'); kPaper.textContent = on ? 'Dark' : 'Paper'; };
  kPaper.addEventListener('click', () => { const on = !document.body.classList.contains('otp-print'); document.body.classList.toggle('otp-print', on); save('otp-paper', on ? 1 : 0); paintPaper(); }); paintPaper();
  const clips = () => load('otp-clips', []);
  const clipped = () => clips().some(c => c.link === link);
  const paintClip = () => { kClip.textContent = clipped() ? 'Clipped ✓' : 'Clip it'; kClip.classList.toggle('on', clipped()); };
  kClip.addEventListener('click', () => { let c = clips(); if (clipped()) c = c.filter(x => x.link !== link); else c.unshift({ link, title: h1 ? h1.textContent.trim() : slug, t: Date.now() }); save('otp-clips', c.slice(0, 40)); paintClip(); try { navigator.vibrate && navigator.vibrate(10); } catch (e) {} }); paintClip();
  // (Read to me was here 10/15 and came out the same night: the phone's own voice is a robot, his call: pull it, keep Clip it.)
  if (byline) byline.insertAdjacentElement('afterend', keys);

  // progress, and the way back to where you left
  const prog = document.createElement('div'); prog.className = 'otp-prog'; document.body.appendChild(prog);
  const PK = 'otp-read:' + slug;
  const frac = () => { const h = document.documentElement; return h.scrollHeight > innerHeight ? h.scrollTop / (h.scrollHeight - innerHeight) : 1; };
  let tick = 0; addEventListener('scroll', () => { const f = Math.max(0, Math.min(1, frac())); prog.style.width = (f * 100).toFixed(1) + '%'; if (!tick) { tick = setTimeout(() => { tick = 0; save(PK, {f, t: Date.now()}); }, 500); } }, { passive: true });
  const was = load(PK, null);
  if (was && was.f > .12 && was.f < .94) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'otp-cont'; c.textContent = 'Continue where you left · ' + Math.round(was.f * 100) + '%';
    c.addEventListener('click', () => { const h = document.documentElement; scrollTo({ top: was.f * (h.scrollHeight - innerHeight), behavior: 'smooth' }); c.remove(); });
    document.body.appendChild(c); setTimeout(() => { if (c.parentNode) c.remove(); }, 12000);
  }
})();
