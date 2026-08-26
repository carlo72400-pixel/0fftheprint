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
 *   overlay- a committed JSON item (work, slate, roster). Edited as a patch in
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
  function panel(title, fields, onSave, extra) {
    var back = d.createElement('div');
    back.className = 'edm-back';
    var rows = fields.map(function (f) {
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
          '<button type="button" class="edm-s">Save</button>' +
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
      try { await onSave(out, say); say('Saved. Reloading…'); setTimeout(function () { location.reload(); }, 550); }
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

  /* ---------- what is editable ---------- */
  async function attach() {
    /* THE WORK grid, desk only. Keyed on the image filename, which survives a
       reorder in a way an array index does not. */
    if (admin) {
      d.querySelectorAll('#work .work-item').forEach(function (el) {
        var img = el.querySelector('img');
        var src = img ? (img.getAttribute('src') || '') : '';
        if (!src) return;
        // BASENAME, not the full path: work.json stores assets/work/x.jpg while
        // derive.py renders assets/grid/work/x.jpg, so a path key would write an
        // override the page could never match back to the item.
        var key = src.split('/').pop();
        if (!key) return;
        pencil(el, 'Edit this frame', function () {
          var cur = overrideFor('work', key);
          var p = (cur && cur.patch) || {};
          panel('THE WORK · ' + key, [
            { key: 'label', label: 'Caption', value: p.label != null ? p.label : (el.querySelector('.work-label') ? el.querySelector('.work-label').textContent : '') },
            { key: 'alt', label: 'Alt text', value: p.alt || (img ? img.alt : '') },
            { key: 'hidden', label: 'Hide this frame', type: 'check', value: !!(cur && cur.hidden) }
          ], async function (v) {
            // !== undefined, not truthiness: a falsy check let him rewrite a
            // caption but never delete one, and the only escape was clearing the
            // whole override. bake.py already handles an empty-string patch.
            var patch = {};
            if (v.label !== undefined) patch.label = v.label;
            if (v.alt !== undefined) patch.alt = v.alt;
            await OTP.setSiteOverride('work', key, patch, { hidden: !!v.hidden });
          });
        });
      });

      /* THE SLATE, desk only. Whole-section patch onto slate.next. */
      var sm = d.getElementById('slate-marquee');
      if (sm) pencil(sm, 'Edit the slate', function () {
        var cur = overrideFor('slate', '');
        var p = (cur && cur.patch) || {};
        var g = function (c) { var e = sm.querySelector(c); return e ? e.textContent.trim() : ''; };
        panel('THE SLATE', [
          { key: 'kicker', label: 'Kicker', value: p.kicker != null ? p.kicker : g('.slate-kicker').split('·')[0].trim() },
          { key: 'title',  label: 'Title',  value: p.title  != null ? p.title  : g('.slate-title') },
          { key: 'line',   label: 'Line',   value: p.line   != null ? p.line   : g('.slate-line'), type: 'textarea', rows: 3 },
          { key: 'status', label: 'Status', value: p.status != null ? p.status : g('.slate-status') },
          { key: 'link',   label: 'Link',   value: p.link   != null ? p.link   : '' },
          { key: 'hidden', label: 'Hide the slate entirely', type: 'check', value: !!(cur && cur.hidden) }
        ], async function (v) {
          var patch = {};
          ['kicker', 'title', 'line', 'status', 'link'].forEach(function (k) { if (v[k] !== undefined) patch[k] = v[k]; });
          await OTP.setSiteOverride('slate', '', patch, { hidden: !!v.hidden });
        });
      });

      /* THE HOUSE VOICE, desk only: the hero kicker, the one liner and the
         ticker. These live in site.json with no overlay until now, so a typo
         in the ticker meant a laptop and a git push. */
      var hero = d.querySelector('.hero') || d.querySelector('header') || d.body;
      var kick = d.querySelector('.kicker');
      if (kick) pencil(kick.parentNode || kick, 'Edit the house voice', function () {
        var g = function (k) {
          var r = overrideFor('site', k);
          return r && r.patch ? r.patch.value : '';
        };
        var tickerNow = [].slice.call(d.querySelectorAll('#ticker *'))
          .map(function (e) { return e.textContent.replace(/^[⚡\s·]+/, '').trim(); })
          .filter(Boolean).join(' | ');
        panel('THE HOUSE VOICE', [
          { key: 'kicker', label: 'Kicker (above the name)', value: g('kicker') || (kick ? kick.textContent.trim() : '') },
          { key: 'one_liner', label: 'One liner', value: g('one_liner'), type: 'textarea', rows: 3 },
          { key: 'ticker_headlines', label: 'Ticker, separate each with |', value: g('ticker_headlines') || tickerNow, type: 'textarea', rows: 4 }
        ], async function (v) {
          for (var k in v) {
            if (!v[k]) { try { await OTP.clearSiteOverride('site', k); } catch (e) {} continue; }
            await OTP.setSiteOverride('site', k, { value: v[k] });
          }
        });
      });

      /* ROSTER lore, desk only. Keyed on the member name from roster.json. */
      d.querySelectorAll('#roster [data-src="roster"]').forEach(function (el) {
        var nm = (el.querySelector('.poke-name') || el.querySelector('h3') || {}).textContent;
        nm = (nm || el.dataset.name || '').trim();
        if (!nm) return;
        pencil(el, 'Edit this card', function () {
          var cur = overrideFor('roster', nm);
          var p = (cur && cur.patch) || {};
          panel('ROSTER · ' + nm, [
            { key: 'flavor', label: 'Flavor line', value: p.flavor || '' },
            { key: 'lore', label: 'Lore', value: p.lore || '', type: 'textarea', rows: 7 },
            { key: 'pending_stamp', label: 'Stamp (e.g. OUT NOW)', value: p.pending_stamp || '' },
            { key: 'hidden', label: 'Hide from the roster', type: 'check', value: !!(cur && cur.hidden) }
          ], async function (v) {
            var patch = {};
            ['flavor', 'lore', 'pending_stamp'].forEach(function (k) { if (v[k] !== undefined) patch[k] = v[k]; });
            await OTP.setSiteOverride('roster', nm, patch, { hidden: !!v.hidden });
          });
        });
      });
    }

    /* MUSIC. Desk can pull or delete any live track; a member can withdraw
       their own. Seeds from rotation.json carry no id and are not touched. */
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
        pencil(el, 'Manage this track', function () {
          panel('MUSIC · ' + (row.title || ''), [
            { key: 'published', label: 'Published', type: 'check', value: !!row.published }
          ], async function (v) {
            // withdrawTrack deletes by id and checks what came back, so it
            // refuses a published row on its own. The member path leans on that
            // rather than trusting a branch here.
            if (admin) await OTP.setTrackPublished(row.id, v.published);
            else await OTP.withdrawTrack(row.id);
          });
        });
      });
    } catch (e) { console.warn('edit: music', e.message); }

    /* THE WORD. The dedicated body editor already exists and is better than a
       popover for long markdown, so this routes there instead of duplicating it. */
    d.querySelectorAll('#desk .desk-item').forEach(function (el) {
      if (!admin) return;
      var href = el.getAttribute('href') || '';
      if (!/^word\//.test(href)) return;
      // ⛔ Do NOT parse a slug out of this href. An unbaked member story links
      // to word/live/?s=<slug>, so /word\/([^\/]+)\// captures the literal
      // "live". And desk/word/ has no ?s= handling at all: it builds its list
      // from content/desk.json, so it can only ever open a BAKED catalog story.
      // Send him to the list and let him pick.
      pencil(el, 'Edit story bodies', function () { location.href = 'desk/word/'; });
    });
  }

  function paintToggle() {
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
