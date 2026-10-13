/* 0FF THE PRINT, EDIT MODE.
 *
 * His ask: "ui on the front page for all of our editble things. like the music
 * the cards, the stories etc", scoped to "everything, including slate and
 * roster lore".
 *
 * WHY THIS FILE IS A LAYER AND NOT A REWRITE: every renderer on the homepage
 * already paints its own DOM, and desk.js already exposes the write methods.
 * So this attaches AFTER render by selector instead of threading edit state
 * through nine renderers. Nothing here re-implements a save.
 *
 * SECURITY IS NOT HERE. RLS and the insert/update guards decide what a caller
 * may write, server-side. This file only decides what to DRAW. A member who
 * forges a pencil in the console still gets refused by the database, which is
 * why it is safe to ship edit affordances on a public page.
 *
 * TWO KINDS OF EDITABLE:
 *   live   - a real DB row (tracks, posts, stories). Edited directly.
 *   overlay- a committed JSON item (work, slate, rotation). Edited as a patch in
 *            site_overrides; bake.py folds it into git later and the row goes
 *            inert, exactly how 011's seed overrides work.
 */
(function (w, d) {
  'use strict';

  var me = null, admin = false, on = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- the popover ---------- */
  // opts (Wave 2, optional): save = the action button's words (default Save), done = what it says before the
  // reload (default "Saved. Reloading…"). A field of type 'note' is a line of words, nothing to fill in.
  function panel(title, fields, onSave, extra, opts) {
    opts = opts || {};
    var back = d.createElement('div');
    back.className = 'edm-back';
    var rows = fields.map(function (f) {
      if (f.type === 'note')
        return '<p class="edm-c edm-note">' + esc(f.label) + '</p>';
      if (f.type === 'textarea')
        return '<label class="edm-l">' + esc(f.label) +
               '<textarea data-k="' + esc(f.key) + '" rows="' + (f.rows || 4) + '">' + esc(f.value || '') + '</textarea></label>';
      if (f.type === 'check')
        return '<label class="edm-c"><input type="checkbox" data-k="' + esc(f.key) + '"' +
               (f.value ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
      return '<label class="edm-l">' + esc(f.label) +
             '<input type="text" data-k="' + esc(f.key) + '" value="' + esc(f.value || '') + '"></label>';
    }).join('');
    back.innerHTML =
      '<div class="edm" role="dialog" aria-modal="true">' +
        '<div class="edm-h">' + esc(title) + '</div>' +
        '<div class="edm-b">' + rows + '</div>' +
        '<div class="edm-msg" hidden></div>' +
        '<div class="edm-f">' +
          (extra || '') +
          '<button type="button" class="edm-x">Cancel</button>' +
          '<button type="button" class="edm-s">' + esc(opts.save || 'Save') + '</button>' +
        '</div>' +
      '</div>';
    d.body.appendChild(back);
    var msg = back.querySelector('.edm-msg');
    function say(t, bad) { msg.hidden = false; msg.textContent = t; msg.className = 'edm-msg' + (bad ? ' bad' : ''); }
    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('.edm-x').addEventListener('click', close);
    d.addEventListener('keydown', function k(e) {
      if (e.key === 'Escape') { close(); d.removeEventListener('keydown', k); }
    });
    back.querySelector('.edm-s').addEventListener('click', async function () {
      var out = {};
      back.querySelectorAll('[data-k]').forEach(function (el) {
        out[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      });
      this.disabled = true; say('Saving…');
      try { await onSave(out, say); say(opts.done || 'Saved. Reloading…'); setTimeout(function () { location.reload(); }, 550); }
      catch (err) { this.disabled = false; say(err.message || String(err), true); }
    });
    return { close: close, say: say, el: back };
  }

  /* ---------- pencils ---------- */
  function pencil(host, label, handler) {
    if (!host || host.querySelector(':scope > .edm-pen')) return;
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'edm-pen';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.textContent = '✎';
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); handler();
    });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(b);
  }

  /* ---------- overlay helper ---------- */
  function overrideFor(section, key) {
    var b = (w.__OTP_OVERRIDES || {})[section] || [];
    for (var i = 0; i < b.length; i++) if (b[i].item_key === key) return b[i];
    return null;
  }

  /* The homepage sets window.__OTP_OVERRIDES once the overlay answers, in time or late.
     Still undefined while the backend is configured means the stored rows are not known
     yet (slow or failed), and a site pencil would fill from the committed page and save
     those words over his unbaked edits. So it says so and opens nothing. */
  function overlayLoading() {
    if (!(w.OTP && OTP.configured) || w.__OTP_OVERRIDES !== undefined) return false;
    var p = panel('One moment', [], async function () {});
    p.el.querySelector('.edm-s').style.display = 'none';
    p.say('Still loading the desk\'s edits. Try again in a moment, or reload.');
    return true;
  }

  /* The committed frames by basename, fetched once, so the work pencil fills
     from the item itself. Fails soft to {}: the pencil then reads the caption
     off the tile and leaves alt alone unless he types one. */
  var WORK = null;
  function workItems() {
    if (!WORK) WORK = fetch('content/work.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var m = {};
        (j.items || []).forEach(function (it) { m[String(it.src || '').split('/').pop()] = it; });
        return m;
      })
      .catch(function () { return {}; });
    return WORK;
  }

  /* ---------- what is editable ---------- */
  async function attach() {
    /* THE WORK grid, desk only. Keyed on the image filename, which survives a
       reorder in a way an array index does not. */
    if (admin) {
      d.querySelectorAll('#work .work-item').forEach(function (el) {
        // ⛔ img.main, NOT the first img. A tall frame paints a blurred .bed
        // copy first, with alt="", and that is what the pencil used to read.
        var img = el.querySelector('img.main') || el.querySelector('img');
        var src = img ? (img.getAttribute('src') || '') : '';
        if (!src) return;
        // BASENAME, not the full path: work.json stores assets/work/x.jpg while
        // derive.py renders assets/grid/work/x.jpg, so a path key would write an
        // override the page could never match back to the item.
        var key = src.split('/').pop();
        if (!key) return;
        pencil(el, 'Edit this frame', async function () {
          if (overlayLoading()) return;
          var cur = overrideFor('work', key);
          var p = (cur && cur.patch) || {};
          // ⛔ THE CAPTION USED TO OPEN EMPTY AND SAVE EMPTY. It was read off a
          // .work-label the tile does not have (the caption is a figcaption),
          // so ticking only Hide blanked the caption on the page and, after a
          // bake, in work.json. The fields start from what the page is showing:
          // the override's value, else the committed item's.
          var it = (await workItems())[key] || {};
          var cap = el.querySelector('figcaption');
          var label0 = p.label != null ? String(p.label)
                     : it.label != null ? String(it.label) : (cap ? cap.textContent : '');
          var alt0 = p.alt != null ? String(p.alt) : (it.alt != null ? String(it.alt) : '');
          panel('THE WORK · ' + key, [
            { key: 'label', label: 'Caption', value: label0 },
            { key: 'alt', label: 'Alt text', value: alt0 },
            { key: 'hidden', label: 'Hide this frame', type: 'check', value: !!(cur && cur.hidden) }
          ], async function (v) {
            // The row's whole patch goes back: setSiteOverride replaces it, and a
            // frame added on the board keeps its src, w and h in there, so a
            // caption-only patch took the picture off the site. Only a field he
            // changed is written. !== , not truthiness, so a caption can still
            // be deleted on purpose (bake.py handles an empty-string patch).
            var patch = Object.assign({}, p);
            if (v.label !== undefined && v.label !== label0) patch.label = v.label;
            if (v.alt !== undefined && v.alt !== alt0) patch.alt = v.alt;
            await OTP.setSiteOverride('work', key, patch, { hidden: !!v.hidden });
          });
        });
      });

      /* THE SLATE, desk only. Whole-section patch onto slate.next.
         10/10: the marquee is THE COVER now and shows the newest story on its
         own. Saving here PINS slate.next over it (set_at is the pin's clock),
         and the pin holds until a newer story is out. So the fields fill from
         slate.next itself, never from the marquee, which may be showing a story:
         reading the DOM would pin that story's words over the slate's art. */
      var sm = d.getElementById('slate-marquee');
      if (sm) pencil(sm, 'Pin a cover', function () {
        if (overlayLoading()) return;
        var cur = overrideFor('slate', '');
        var p = (cur && cur.patch) || {};
        var nx = window.__OTP_SLATE_NEXT || null;
        var g = function (c, k) {
          if (nx && nx[k] != null) return String(nx[k]);
          var e = sm.querySelector(c); return e ? e.textContent.trim() : '';
        };
        panel('THE COVER · pin the slate over the newest story', [
          { key: 'kicker', label: 'Kicker', value: p.kicker != null ? p.kicker : g('.slate-kicker', 'kicker').split('·')[0].trim() },
          { key: 'title',  label: 'Title',  value: p.title  != null ? p.title  : g('.slate-title', 'title') },
          { key: 'line',   label: 'Line',   value: p.line   != null ? p.line   : g('.slate-line', 'line'), type: 'textarea', rows: 3 },
          { key: 'status', label: 'Status', value: p.status != null ? p.status : g('.slate-status', 'status') },
          { key: 'link',   label: 'Link',   value: p.link   != null ? p.link   : (nx && nx.link) || '' },
          { key: 'hidden', label: 'Unpin, the newest story takes the cover', type: 'check', value: !!(cur && cur.hidden) }
        ], async function (v) {
          var patch = {};
          ['kicker', 'title', 'line', 'status', 'link'].forEach(function (k) { if (v[k] !== undefined) patch[k] = v[k]; });
          if (!v.hidden) patch.set_at = new Date().toISOString();
          await OTP.setSiteOverride('slate', '', patch, { hidden: !!v.hidden });
        });
      });

      /* THE HOUSE VOICE, desk only: the hero kicker, the one liner and the
         ticker. These live in site.json with no overlay until now, so a typo
         in the ticker meant a laptop and a git push. */
      // ⛔ NOT '.kicker'. That class exists in the stylesheet and on NO element:
      // this markup calls the banner line `.pulse-kick`, so querySelector came
      // back null and the whole house-voice pencil silently never attached. It
      // shipped dead. The board found it by listing what each surface actually
      // paints instead of trusting the selector.
      var kick = d.querySelector('.pulse-kick');
      if (kick) pencil(kick.parentNode || kick, 'Edit the house voice', function () {
        if (overlayLoading()) return;
        var g = function (k) {
          var r = overrideFor('site', k);
          return r && r.patch ? r.patch.value : '';
        };
        var tickerNow = [].slice.call(d.querySelectorAll('#ticker *'))
          .map(function (e) { return e.textContent.replace(/^[⚡\s·]+/, '').trim(); })
          .filter(Boolean).join(' | ');
        // No route line (10/11): the hero lost .pulse-route on 8/26, so that
        // field saved into nothing.
        var line1 = d.querySelector('.pulse-line');
        var l1 = line1 ? (line1.childNodes[0] ? String(line1.childNodes[0].textContent).trim() : '') : '';
        var l2 = line1 && line1.querySelector('.blue') ? line1.querySelector('.blue').textContent.trim() : '';
        panel('THE HOUSE VOICE', [
          { key: 'kicker', label: 'Kicker (top line of the banner)', value: g('kicker') || (kick ? kick.textContent.trim() : '') },
          { key: 'pulse_line_1', label: 'Headline, first line', value: g('pulse_line_1') || l1 },
          { key: 'pulse_line_2', label: 'Headline, blue line', value: g('pulse_line_2') || l2 },
          { key: 'ticker_headlines', label: 'Ticker, separate each with |', value: g('ticker_headlines') || tickerNow, type: 'textarea', rows: 4 }
        ], async function (v) {
          for (var k in v) {
            if (!v[k]) { try { await OTP.clearSiteOverride('site', k); } catch (e) {} continue; }
            await OTP.setSiteOverride('site', k, { value: v[k] });
          }
        });
      });

      /* ROSTER lore has no pencil here any more: the #roster grid it hung off
         came out 10/7, so it drew nothing. The board's THE ROSTER edits it. */
    }

    /* MUSIC SEEDS, desk only. The six hand-picked tracks live in
       content/rotation.json and were git-only until migration 016 allowed a
       'rotation' section in site_overrides. Paste a new Spotify link and the
       tile swaps; the committed file stays the floor until bake.py folds it. */
    if (admin) {
      // 10/11: only On Rotation's own tiles. The Music tab's other rows (picks, nights, cards, Texas,
      // the battle) are not seeds, and a battle winner music.js draws in the gap (.won) is not one either.
      // Wave 2: once build_music.py close puts the winner in rotation.json it IS a seed (no .won), pencil and all.
      d.querySelectorAll('#rotation-mount .track:not(.won)').forEach(function (el) {
        var a = el.matches('a') ? el : el.querySelector('a[href*="open.spotify.com/track/"]');
        var href = a ? a.getAttribute('href') || '' : '';
        var m = /track\/([A-Za-z0-9]{22})/.exec(href);
        if (!m) return;
        var key = m[1];
        pencil(el, 'Swap this track', function () {
          if (overlayLoading()) return;
          var cur = overrideFor('rotation', key);
          var p = (cur && cur.patch) || {};
          var t = el.querySelector('.track-title'), ar = el.querySelector('.track-artist');
          panel('ROTATION · ' + (t ? t.textContent : ''), [
            { key: 'link', label: 'New Spotify link (leave blank to keep)', value: p.link || '' },
            { key: 'title', label: 'Title', value: p.title != null ? p.title : (t ? t.textContent : '') },
            { key: 'artist', label: 'Artist (Spotify never sends it: new song, type who it is by)', value: p.artist != null ? p.artist : (ar ? ar.textContent : '') },
            { key: 'note', label: 'Desk note (a line or two: why it is on, where it was spotted)', type: 'textarea', rows: 2, value: p.note != null ? p.note : (el.querySelector('.track-note') ? el.querySelector('.track-note').textContent : '') },
            { key: 'hidden', label: 'Take it off the grid', type: 'check', value: !!(cur && cur.hidden) }
          ], async function (v, say) {
            var patch = {};
            // ⛔ same rule as the board (10/4): a swap with no artist is refused, nothing can fill it in later
            if (v.link && v.link.trim() && !String(v.artist || '').trim()) {
              throw new Error('Who is it by? Spotify sends the title and the cover, not the artist. Type it in.');
            }
            if (v.link && v.link.trim()) {
              say('Reading the track…');
              // same resolver submit uses, so a swapped seed cannot drift from
              // what a member submission of the same link would produce
              var r = await OTP.resolveTrack(v.link);
              patch.link = 'https://open.spotify.com/track/' + r.id;
              patch.title = r.title;
              if (r.thumb) patch.art = r.thumb;
              // a swapped seed is a different song, so the old preview mp3 and
              // its start offset belong to a track that is no longer there
              patch.preview = '';
              patch.start = '';
            }
            if (v.title !== undefined && !patch.title) patch.title = v.title;
            if (v.artist !== undefined) patch.artist = v.artist;
            if (v.note !== undefined) patch.note = String(v.note).replace(/\u2014/g, ',').trim().slice(0, 240);
            await OTP.setSiteOverride('rotation', key, patch, { hidden: !!v.hidden });
          });
        });
      });

      /* THE MUSIC COVER, desk only (10/11). site.json keys music_cover.* through the site overlay,
         one row each, so bake.py folds them into site.json like the house voice. A track that is not
         on rotation needs its own words: Spotify sends the title and the cover, never the artist. */
      var mc = d.getElementById('mx-cover');
      if (mc) pencil(mc, 'Pin the music cover', function () {
        if (overlayLoading()) return;
        var K = ['track', 'title', 'artist', 'art', 'note'];
        var g = function (k) { var r = overrideFor('site', 'music_cover.' + k); return r && r.patch ? r.patch.value : ''; };
        var pinned = !!g('track');
        panel('THE MUSIC COVER' + (pinned ? ' · pinned' : ' · picks itself'), [
          { key: 'link', label: 'Spotify link of the track to pin', value: g('track') || (mc.dataset.sp ? 'https://open.spotify.com/track/' + mc.dataset.sp : '') },
          { key: 'artist', label: 'Artist (type it: Spotify never sends it)', value: g('artist') || mc.dataset.a || '' },
          { key: 'note', label: 'Desk note (why it is the cover)', type: 'textarea', rows: 3, value: g('note') || ((mc.querySelector('.mx-cv-n') || {}).textContent || '') },
          { key: 'hidden', label: 'Unpin, the cover goes back to the top of rotation', type: 'check', value: false }
        ], async function (v, say) {
          if (v.hidden) { for (var i = 0; i < K.length; i++) { try { await OTP.clearSiteOverride('site', 'music_cover.' + K[i]); } catch (e) {} } return; }
          if (!String(v.link || '').trim()) throw new Error('Paste the Spotify link of the track.');
          if (!String(v.artist || '').trim()) throw new Error('Who is it by? Spotify sends the title and the cover, not the artist.');
          say('Reading the track…');
          var r = await OTP.resolveTrack(v.link);
          var vals = { track: 'https://open.spotify.com/track/' + r.id, title: r.title, artist: String(v.artist).trim().slice(0, 60),
                       art: r.thumb || '', note: String(v.note || '').replace(/\u2014/g, ',').trim().slice(0, 280) };
          for (var j = 0; j < K.length; j++) {
            if (!vals[K[j]]) { try { await OTP.clearSiteOverride('site', 'music_cover.' + K[j]); } catch (e) {} continue; }
            await OTP.setSiteOverride('site', 'music_cover.' + K[j], { value: vals[K[j]] });
          }
        });
      });
    }

    /* MUSIC. Desk can pull any live track. A card holder's pencil on their own
       pick takes it down (045: withdrawTrack works on a pick that is out) and
       still points at /compose/, where a live pick can be swapped or its artist
       fixed. Seeds from rotation.json carry no id and are not touched. */
    try {
      var mine = me ? await OTP.myRotation() : [];
      var all = admin ? await OTP.rotationAll() : [];
      var byTrack = {};
      all.concat(mine).forEach(function (t) { if (t && t.track) byTrack[t.track] = t; });
      d.querySelectorAll('#music .track').forEach(function (el) {
        var a = el.matches('a') ? el : el.querySelector('a[href*="open.spotify.com/track/"]');
        var href = a ? a.getAttribute('href') || '' : '';
        var m = /track\/([A-Za-z0-9]{22})/.exec(href);
        if (!m) return;                       // a seed, not a live row
        var row = byTrack[m[1]];
        if (!row) return;                     // live for someone else, not yours to touch
        // ⛔ A MEMBER'S PENCIL HERE USED TO FAIL: the database refused a member
        // deleting a published pick, so it went to /compose/ instead. 045 lets
        // them take their own pick down whether it is out or not (call 8), so
        // the pencil opens the panel again, with /compose/ one tap away.
        // Only on their tile in Card Holders' Picks: a pick the desk made a seed
        // is the desk's tile now, and taking the row down would not move it.
        if (!admin) {
          if (!el.closest('#mx-picks') || el.classList.contains('won')) return;
          pencil(el, 'Your pick', function () {
            var pn = panel('MUSIC · ' + (row.title || ''), [
              { type: 'note', label: "Takes your pick off Card Holders' Picks. You can send it again later; it goes back through the desk." }
            ], async function () {
              await OTP.withdrawTrack(row.id);
            }, '<button type="button" class="edm-go">Swap or fix it</button>', { save: 'Take it down', done: 'Down. Reloading…' });
            pn.el.querySelector('.edm-go').addEventListener('click', function () { location.href = 'compose/#rot'; });
          });
          return;
        }
        pencil(el, 'Manage this track', function () {
          panel('MUSIC · ' + (row.title || ''), [
            { key: 'published', label: 'Published', type: 'check', value: !!row.published }
          ], async function (v) {
            await OTP.setTrackPublished(row.id, v.published);
          });
        });
      });
    } catch (e) { console.warn('edit: music', e.message); }

    /* THE TAKE. The one live surface edit.js named in its own header and never
       wired. Every write method already existed on OTP.

       ⛔ THE RENDERED BODY IS NOT THE POST. #take paints p.text through md(),
       so reading .post-body back out of the DOM would put HTML in the textarea
       and save it over the member's markdown. The raw rows are fetched instead,
       ONCE, and the fetch doubles as the permission check for DRAWING: myPosts()
       returns only yours and allPosts() only runs for the desk, so an id that is
       not in the map gets no pencil. RLS still decides the write either way.

       ⛔ A seeded post out of take.json carries no data-pid, so it is skipped.
       There is no row behind it. Those are edited by committing take.json or
       through 011's seed overrides, not here. */
    try {
      var feed = [].slice.call(d.querySelectorAll('#take .post-t[data-pid]'));
      if (feed.length) {
        var raw = {};
        (admin ? await OTP.allPosts(60) : await OTP.myPosts(60)).forEach(function (r) {
          if (r && r.id != null) raw[String(r.id)] = r;
        });
        feed.forEach(function (el) {
          var id = el.getAttribute('data-pid');
          var row = raw[id];
          if (!row) return;                       // not yours, or not loaded
          pencil(el, 'Edit this post', function () {
            var fields = [
              { key: 'text', label: 'The post, in their words', type: 'textarea',
                rows: 5, value: row.text || '' },
              { key: 'alt', label: 'Image description (blank if there is no image)',
                value: row.image_alt || '' }
            ];
            // published is the desk's switch, same as everywhere else on this
            // site. A member editing their own post keeps whatever the desk left.
            if (admin) fields.push({ key: 'up', label: 'Up on the front page',
                                     type: 'check', value: row.published !== false });
            var pn = panel('THE TAKE · post ' + id, fields, async function (v, say) {
              await OTP.updatePost(id, { text: v.text, imageAlt: v.alt });
              if (admin && (v.up === false) !== (row.published === false)) {
                say('Saving…');
                await OTP.setPublished(id, !!v.up);
              }
            }, '<button type="button" class="edm-del">Delete</button>');
            var del = pn.el.querySelector('.edm-del');
            if (del) del.addEventListener('click', async function () {
              if (!w.confirm('Delete this post for good? Pulling it instead keeps the row.')) return;
              this.disabled = true;
              try {
                await OTP.deletePost(id);
                pn.say('Deleted. Reloading…');
                setTimeout(function () { location.reload(); }, 550);
              } catch (e) { this.disabled = false; pn.say(e.message || String(e), true); }
            });
          });
        });
      }
    } catch (e) { console.warn('edit: take', e.message); }

    /* THE WORD. The dedicated body editors already exist and are better than a
       popover for long markdown, so this routes there instead of duplicating it.
       ⛔ TWO EDITORS, BY WHERE THE BODY LIVES. An unbaked member story links to
       word/live/?s=<slug>: its body is the database row, edited on the board
       (THE WORD, board/?mstory=<slug>; /desk/ only forwards there now). A
       committed page links to word/<slug>/ and is edited in desk/word/, which
       lists only committed pages. Both open the story straight from ?s=. The
       slug of a live one comes off the query, never the path, where a path
       regex reads the literal "live". */
    d.querySelectorAll('#desk .desk-item').forEach(function (el) {
      if (!admin) return;
      var href = el.getAttribute('href') || '';
      if (!/^word\//.test(href)) return;
      var live = /^word\/live\/\?(?:[^#]*&)?s=([^&#]+)/.exec(href);
      var page = /^word\/([^\/?#]+)\/?$/.exec(href);
      var to = live ? 'board/?mstory=' + live[1]
             : page && page[1] !== 'live' && page[1] !== 'new' ? 'desk/word/?s=' + page[1]
             : 'desk/word/';
      pencil(el, 'Edit this story', function () { location.href = to; });
    });
  }

  function paintToggle() {
    // The desk gets a way OFF the homepage and onto the board, because the
    // pencils only reach what is on screen and the board reaches everything.
    if (admin && !d.getElementById('edm-board')) {
      var lnk = d.createElement('a');
      lnk.id = 'edm-board';
      lnk.href = 'board/';
      lnk.textContent = 'BOARD';
      d.body.appendChild(lnk);
    }
    var b = d.createElement('button');
    b.type = 'button';
    b.id = 'edm-toggle';
    b.textContent = admin ? 'EDIT' : 'EDIT MINE';
    b.addEventListener('click', function () {
      on = !on;
      d.body.classList.toggle('editing', on);
      b.classList.toggle('on', on);
      if (on) attach();
      else d.querySelectorAll('.edm-pen').forEach(function (p) { p.remove(); });
    });
    d.body.appendChild(b);
  }

  async function boot() {
    if (!w.OTP || !OTP.configured) return;
    try { me = await OTP.me(); } catch (e) { return; }
    if (!me) return;                                  // signed out sees nothing
    admin = !!(me.profile && me.profile.is_admin);
    if (!admin && !(me.profile && me.profile.approved)) return;
    paintToggle();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  w.OTPEdit = { attach: attach, panel: panel };
})(window, document);
