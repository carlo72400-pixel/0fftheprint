/* 0FF THE PRINT, THE BOARD.
 *
 * His ask: "theres not enough ui for customizing the page fully or posting
 * shit. i need to visually see everything we can do type shit."
 *
 * THE DIAGNOSIS THIS FILE ANSWERS: desk.js exposes 79 methods. The desk page
 * used about forty of them, edit.js reached five surfaces on the homepage, and
 * the rest were reachable only by knowing they existed. Nothing was WRONG, it
 * was just invisible, spread over five pages, and every one of them a vertical
 * list of text you have to read before you can act.
 *
 * SO: one screen, laid out in the same order as the real homepage, every
 * section a rail of actual thumbnails, every rail with a + on the end, and a
 * map at the bottom naming every single thing the house can do and where that
 * thing lives. Nothing here is a menu he has to remember.
 *
 * IT PAINTS BEFORE IT AUTHENTICATES. content/*.json is public and cached, so
 * the whole shape of the board is on screen while Supabase is still waking up.
 * The DB pass fills in live state after, in place, without a reflow of the
 * layout he already started reading.
 *
 * ALMOST NO NEW SQL. Everything wired here writes through methods that already
 * exist. The reorder arrows lean on the `sort` column 014 shipped, which the
 * homepage already sorted by and bake.py already folded into the JSON: it had
 * no UI, that is all. The nested site fields, the latest drop strip and the
 * numbered releases were legal rows in site_overrides the whole time and simply
 * were never READ. One value in one CHECK constraint needed widening, for the
 * curator cards, and that is all migration 017 is.
 *
 * WHAT IS STILL COLD, and it is short: the Pitch Us and Why blocks, which are
 * literal HTML in index.html, and adding a NEW work frame, which needs the file
 * on disk and derive.py. Everything else on this page is warm. The curator
 * cards need migration-017-the-board.sql run once, and the tile says so in
 * plain words if the database refuses the write.
 */
(function (w, d) {
  'use strict';

  var me = null, admin = false;
  var C = {};            // content/*.json
  var EV = { items: [] };// events/events.json
  var OV = {};           // site_overrides, section -> item_key -> row
  var SEED = {};         // seed_overrides, key -> row
  var DB = {};           // live rows, filled by the second pass
  var painted = false;

  /* ============================ small tools ============================ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return d.getElementById(id); }

  // derive.py mirrors subfolders: assets/work/x.jpg -> assets/thumb/work/x.jpg.
  // The board is a grid of small squares, so it asks for the 440px derivative
  // and only falls back to the full frame when one was never generated.
  function thumb(src) {
    var s = String(src || '');
    if (!s) return '';
    if (/^https?:/.test(s)) return s;
    // derive.py only mirrors what lives under assets/. desk.json points its
    // catalog thumbs at word/<slug>/thumb.jpg, which has no derivative, so
    // routing those through assets/thumb/ just 404s the whole rail.
    if (s.indexOf('assets/') !== 0) return '../' + s;
    return '../assets/thumb/' + s.slice(7);
  }
  function full(src) {
    var s = String(src || '');
    if (!s) return '';
    return /^https?:/.test(s) ? s : '../' + s;
  }

  var toastT = null;
  function toast(msg, bad) {
    var old = d.querySelector('.toast');
    if (old) old.remove();
    var t = d.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    d.body.appendChild(t);
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.remove(); }, bad ? 5200 : 2600);
  }

  /* ============================== the sheet ==============================
     One at a time, bottom anchored so it lands under a thumb on a phone.
     fields: [{key,label,value,type,rows,hint}], type in text|textarea|check|file|url
     save(values, say) may be async. Throwing shows the message in the sheet
     instead of a browser alert he has to dismiss before he can read it. */

  var SONGS = {};   // track id -> the read-out html, so a re-type is one request

  function sheet(o) {
    var back = d.createElement('div');
    back.className = 'sh-back';
    var fields = o.fields || [];
    var rows = fields.map(function (f) {
      var lab = '<label>' + esc(f.label) + '</label>';
      if (f.type === 'check')
        // ⛔ THE HINT USED TO BE SILENTLY DROPPED HERE. Every other field type
        // renders f.hint and this one ignored it, so a checkbox could carry an
        // explanation that never reached the screen. Found while adding the
        // door's no, whose whole point is saying what unticking does.
        return '<label class="chk"><input type="checkbox" data-k="' + esc(f.key) + '"' +
               (f.value ? ' checked' : '') + '> ' + esc(f.label) + '</label>' +
               (f.hint ? '<div class="note">' + esc(f.hint) + '</div>' : '');
      if (f.type === 'select')
        return lab + '<select data-k="' + esc(f.key) + '">' +
               (f.options || []).map(function (o) {
                 return '<option value="' + esc(o[0]) + '"' +
                   (String(f.value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
               }).join('') + '</select>' +
               (f.hint ? '<div class="note">' + esc(f.hint) + '</div>' : '');
      if (f.type === 'textarea')
        return lab + '<textarea data-k="' + esc(f.key) + '" rows="' + (f.rows || 4) + '">' +
               esc(f.value == null ? '' : f.value) + '</textarea>' +
               (f.hint ? '<div class="note">' + esc(f.hint) + '</div>' : '');
      if (f.type === 'song')
        // A bare text box makes a wrong Spotify link and a right one look
        // identical until the card is already wrong. This one says which song
        // it is, out loud, before Save is ever tapped.
        return lab + '<input type="text" data-k="' + esc(f.key) + '" data-song="1" ' +
               'inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
               'placeholder="https://open.spotify.com/track/..." value="' +
               esc(f.value == null ? '' : f.value) + '">' +
               '<div class="songsay"></div>' +
               (f.hint ? '<div class="note">' + esc(f.hint) + '</div>' : '');
      if (f.type === 'file')
        return lab + '<input type="file" data-k="' + esc(f.key) + '" accept="' +
               esc(f.accept || 'image/*') + '">' +
               (f.hint ? '<div class="note">' + esc(f.hint) + '</div>' : '');
      return lab + '<input type="' + (f.type === 'url' ? 'url' : 'text') + '" data-k="' +
             esc(f.key) + '" value="' + esc(f.value == null ? '' : f.value) + '">' +
             (f.hint ? '<div class="note">' + esc(f.hint) + '</div>' : '');
    }).join('');

    back.innerHTML =
      '<div class="sh">' +
        '<h3>' + esc(o.title || '') + '</h3>' +
        (o.why ? '<div class="why">' + esc(o.why) + '</div>' : '') +
        (o.art ? '<img class="art" src="' + esc(o.art) + '" alt="">' : '') +
        (o.body || '') +
        rows +
        '<div class="say"></div>' +
        '<div class="foot">' +
          (o.save ? '<button class="btn" data-go>' + esc(o.saveLabel || 'Save') + '</button>' : '') +
          '<button class="btn ghost" data-x>' + esc(o.save ? 'Never mind' : 'Close') + '</button>' +
        '</div>' +
        (o.kill ? '<button class="kill" data-kill>' + esc(o.killLabel || 'Delete this') + '</button>' : '') +
      '</div>';

    function shut() { back.remove(); d.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') shut(); }
    var say = back.querySelector('.say');
    function speak(m, bad) { say.textContent = m || ''; say.classList.toggle('bad', !!bad); }

    // Spotify's oembed needs no key and no login, so the sheet can name the
    // actual track. Cached per id so re-typing the same link is one request.
    back.querySelectorAll('input[data-song]').forEach(function (inp) {
      var out = inp.parentNode.querySelector('.songsay')
             || inp.nextElementSibling;
      if (!out) return;
      var seq = 0, timer = null;
      function show(cls, html) { out.className = 'songsay' + (cls ? ' ' + cls : ''); out.innerHTML = html; }
      function run() {
        var mine = ++seq;
        var t = (w.OTP && OTP.readTrack) ? OTP.readTrack(inp.value) : { id: null, empty: !inp.value };
        if (t.empty) { show('', 'No song on this card.'); return; }
        if (!t.id) { show('bad', esc(t.why || 'That is not a Spotify track link.')); return; }
        if (SONGS[t.id]) { show('ok', SONGS[t.id]); return; }
        show('', 'reading\u2026');
        fetch('https://open.spotify.com/oembed?url=https://open.spotify.com/track/' + t.id)
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })
          .then(function (meta) {
            if (mine !== seq) return;                       // they kept typing
            if (!meta || !meta.title) {
              show('ok', 'Track id looks right. Spotify did not answer, that is fine.');
              return;
            }
            var html = (meta.thumbnail_url ? '<img src="' + esc(meta.thumbnail_url) + '" alt="">' : '') +
                       '<span><b>' + esc(meta.title) + '</b></span>';
            SONGS[t.id] = html;
            show('ok', html);
          });
      }
      inp.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 320); });
      inp.addEventListener('blur', run);
      run();
    });

    function read() {
      var v = {};
      back.querySelectorAll('[data-k]').forEach(function (el) {
        v[el.dataset.k] = el.type === 'checkbox' ? el.checked
                        : el.type === 'file' ? (el.files && el.files[0]) || null
                        : el.value;
      });
      return v;
    }

    back.querySelector('[data-x]').onclick = shut;
    back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    d.addEventListener('keydown', onKey);

    var go = back.querySelector('[data-go]');
    if (go) go.onclick = async function () {
      go.disabled = true; speak('Saving…');
      try {
        await o.save(read(), speak);
        shut();
        toast(o.done || 'Saved.');
        refresh();
      } catch (e) { speak(e.message || String(e), true); go.disabled = false; }
    };

    var kill = back.querySelector('[data-kill]');
    if (kill) kill.onclick = async function () {
      if (kill.dataset.sure !== '1') {
        kill.dataset.sure = '1';
        kill.textContent = 'Tap again to really delete';
        return;
      }
      kill.disabled = true; speak('Deleting…');
      try { await o.kill(); shut(); toast('Gone.'); refresh(); }
      catch (e) { speak(e.message || String(e), true); kill.disabled = false; }
    };

    d.body.appendChild(back);
    var first = back.querySelector('input:not([type=checkbox]),textarea');
    if (first && w.matchMedia('(min-width:640px)').matches) first.focus();
  }

  // A sheet with nothing to save: it exists to tell him where a thing lives.
  function tellSheet(title, why, lines, links) {
    sheet({
      title: title, why: why,
      body: '<div class="note">' + lines.map(function (l) { return esc(l); }).join('<br>') + '</div>' +
        (links && links.length
          ? '<div class="row" style="margin-top:16px">' + links.map(function (l) {
              return '<a class="btn ghost sm" href="' + esc(l.href) + '"' +
                     (l.blank ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l.label) + '</a>';
            }).join('') + '</div>'
          : '')
    });
  }

  /* ========================= overrides, read + write =====================
     setSiteOverride REPLACES the patch, so anything that touches one field has
     to resend the rest. Every write in this file goes through here for that
     reason: a reorder that quietly dropped his caption would be a very annoying
     bug to find later. */

  function ovRow(section, key) {
    return (OV[section] && OV[section][key]) || null;
  }
  function ovPatch(section, key) {
    var r = ovRow(section, key);
    return (r && r.patch) || {};
  }
  async function writeOv(section, key, patch, opts) {
    var cur = ovRow(section, key) || {};
    var o = {
      hidden: opts && 'hidden' in opts ? !!opts.hidden : !!cur.hidden,
      sort: opts && 'sort' in opts ? opts.sort : (cur.sort == null ? undefined : cur.sort)
    };
    if (o.sort === undefined) delete o.sort;
    await OTP.setSiteOverride(section, key, patch, o);
  }

  /* Reorder. The homepage and bake.py both sort on `sort` with a missing value
     reading as 0, so a single moved item cannot be expressed by writing one
     row: the whole rail needs a total order. First nudge in a section writes
     every item, later ones only rewrite what actually moved. */
  async function nudge(section, keys, from, to) {
    if (to < 0 || to >= keys.length) return;
    var order = keys.slice();
    var moved = order.splice(from, 1)[0];
    order.splice(to, 0, moved);
    var writes = [];
    order.forEach(function (k, i) {
      var cur = ovRow(section, k);
      if (cur && cur.sort === i) return;             // already where it belongs
      writes.push(writeOv(section, k, (cur && cur.patch) || {}, { sort: i }));
    });
    if (!writes.length) return;
    toast('Moving…');
    await Promise.all(writes);
    toast('Moved.');
    await refresh();
  }

  /* ============================== tiles ================================ */

  function tileEl(t) {
    var b = d.createElement(t.href ? 'a' : 'button');
    if (t.href) { b.href = t.href; if (t.blank) { b.target = '_blank'; b.rel = 'noopener'; } }
    else b.type = 'button';
    b.className = 'tile' + (t.off ? ' off' : '') + (t.cls ? ' ' + t.cls : '');
    b.innerHTML = '<span class="shot' + (t.tall ? ' tall' : '') + (t.img ? '' : ' bare') + '">' +
      (t.img ? '' : '<i>' + esc(t.glyph || (t.t || '?').trim().charAt(0)) + '</i>') + '</span>' +
      '<span class="cap"><span class="t">' + esc(t.t || '') + '</span>' +
      '<span class="s"><i class="dot ' + (t.state || 'git') + '"></i>' + esc(t.s || '') + '</span></span>';
    // Set as a property, not inside the attribute string. A url() written into
    // style="..." with quotes around the path closes the attribute early and the
    // whole rail paints as empty boxes, which is exactly what it did the first time.
    if (t.img) b.firstChild.style.backgroundImage = 'url("' + String(t.img).replace(/"/g, '%22') + '")';
    if (t.move) {
      var n = d.createElement('span');
      n.className = 'nudge';
      n.innerHTML = '<button type="button" title="Move left">&#9664;</button>' +
                    '<button type="button" title="Move right">&#9654;</button>';
      n.children[0].onclick = function (e) { e.preventDefault(); e.stopPropagation(); t.move(-1); };
      n.children[1].onclick = function (e) { e.preventDefault(); e.stopPropagation(); t.move(1); };
      b.appendChild(n);
    }
    if (t.open) b.onclick = t.open;
    return b;
  }

  function addTile(label, glyph, on, cold) {
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'tile add' + (cold ? ' off' : '');
    b.innerHTML = '<span class="p"><em>' + (glyph || '+') + '</em>' + esc(label) + '</span>';
    b.onclick = on;
    return b;
  }

  function railEl(r) {
    var sec = d.createElement('section');
    sec.className = 'rail';
    sec.id = 'r-' + r.key;
    var tiles = [];
    try { tiles = r.tiles() || []; } catch (e) {
      console.warn('board rail ' + r.key + ':', e.message);
      tiles = [];
    }
    var live = tiles.filter(function (t) { return !t.off; }).length;
    sec.innerHTML =
      '<div class="rail-h"><span class="nm">' + esc(r.nm) + '</span>' +
      '<span class="ct">' + live + (tiles.length !== live ? ' live / ' + tiles.length : ' items') + '</span>' +
      '<span class="src">' + esc(r.src || '') + '</span></div>' +
      (r.note ? '<div class="rail-note">' + esc(r.note) + '</div>' : '');
    var strip = d.createElement('div');
    strip.className = 'strip';
    if (!tiles.length && !r.add) {
      strip.innerHTML = '<div class="empty-rail">nothing here yet</div>';
    }
    tiles.forEach(function (t) { strip.appendChild(tileEl(t)); });
    if (r.add) strip.appendChild(addTile(r.add.label, r.add.glyph, r.add.on, r.add.cold));
    sec.appendChild(strip);
    return sec;
  }

  /* ========================== the rails, in page order ==================
     Same order as index.html so the board reads like the site. If a section
     moves on the homepage, move it here too. THE WORD moved up under THE TAKE
     on 8/26 and this list moved with it. */

  function railSpecs() {
    var R = [];

    /* ---- THE DROPS. Built on the laptop by newevent.py: a night is a folder
       of graded frames plus a generated page, none of which a phone can make.
       Shown anyway, because "is the newest night up" is a real question. ---- */
    R.push({
      key: 'drops', nm: 'THE DROPS', src: 'events/events.json',
      note: 'every night we shot, newest first',
      tiles: function () {
        return (EV.items || []).slice()
          .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
          .map(function (e) {
            return {
              img: e.cover ? '../events/' + e.cover : '',
              t: e.venue || e.title || e.slug,
              s: (e.count | 0) + ' frames · ' + (e.date_short || e.date),
              state: 'git',
              href: '../events/' + e.slug + '/', blank: true
            };
          });
      },
      add: {
        label: 'NEW NIGHT', glyph: '🌙', cold: true, on: function () {
          tellSheet('A NEW NIGHT', 'laptop only, and that is on purpose', [
            'A drop is a folder of graded full quality frames plus its own page.',
            'newevent.py builds both from the exported folder, then git push.',
            'Nothing on a phone can make the frames, so nothing here pretends to.'
          ], [{ label: 'Every drop', href: '../events/', blank: true }]);
        }
      }
    });

    /* ---- THE SLATE. slate.next is the only part with an overlay path: the
       page merges site_overrides['slate'][''] onto next and ignores any other
       key. latest_drop and the releases list are still git. ---- */
    R.push({
      key: 'slate', nm: 'THE SLATE', src: 'content/slate.json + overlay',
      note: 'what the house is putting out next',
      tiles: function () {
        var out = [];
        var next = (C.slate && C.slate.next) || null;
        if (next) {
          var p = ovPatch('slate', ''), row = ovRow('slate', '');
          var v = Object.assign({}, next, p);
          out.push({
            img: thumb(v.art), tall: true, off: !!(row && row.hidden),
            t: (v.num ? v.num + ' · ' : '') + (v.title || ''),
            s: row && row.hidden ? 'hidden' : (v.status || 'live'),
            state: row && row.hidden ? 'hidden' : (row ? 'draft' : 'git'),
            open: function () {
              sheet({
                title: 'THE SLATE', why: 'the marquee at the top of the page',
                art: full(v.art),
                fields: [
                  { key: 'kicker', label: 'Kicker', value: p.kicker != null ? p.kicker : next.kicker },
                  { key: 'title', label: 'Title', value: p.title != null ? p.title : next.title },
                  { key: 'line', label: 'Line', type: 'textarea', rows: 3, value: p.line != null ? p.line : next.line },
                  { key: 'status', label: 'Status stamp', value: p.status != null ? p.status : next.status },
                  { key: 'link', label: 'Link', value: p.link != null ? p.link : next.link },
                  { key: 'hidden', label: 'Hide the slate entirely', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val) {
                  var patch = {};
                  ['kicker', 'title', 'line', 'status', 'link'].forEach(function (k) {
                    if (val[k] !== undefined) patch[k] = val[k];
                  });
                  await OTP.setSiteOverride('slate', '', patch, { hidden: !!val.hidden });
                }
              });
            }
          });
        }
        var ld = (C.slate && C.slate.latest_drop) || null;
        if (ld) {
          var lp = ovPatch('slate', 'latest_drop'), lr = ovRow('slate', 'latest_drop');
          var lv = Object.assign({}, ld, lp);
          out.push({
            t: lv.title || 'Latest drop', glyph: '⧉', s: lv.count || '', off: !!(lr && lr.hidden),
            state: lr && lr.hidden ? 'hidden' : (lr ? 'draft' : 'git'),
            open: function () {
              sheet({
                title: 'LATEST DROP', why: 'the strip under the marquee',
                fields: [
                  { key: 'label', label: 'Label', value: lp.label != null ? lp.label : (ld.label || 'LATEST DROP') },
                  { key: 'title', label: 'Title', value: lp.title != null ? lp.title : (ld.title || '') },
                  { key: 'count', label: 'Count line', value: lp.count != null ? lp.count : (ld.count || '') },
                  { key: 'link', label: 'Link', value: lp.link != null ? lp.link : (ld.link || '') },
                  { key: 'hidden', label: 'Hide the strip', type: 'check', value: !!(lr && lr.hidden) }
                ],
                save: async function (val) {
                  var patch = {};
                  ['label', 'title', 'count', 'link'].forEach(function (kk) {
                    if (val[kk] !== undefined) patch[kk] = val[kk];
                  });
                  await writeOv('slate', 'latest_drop', patch, { hidden: !!val.hidden });
                }
              });
            }
          });
        }
        return out;
      }
    });

    /* ---- THE RUN. Dates go live the moment a card holder adds one, so this
       rail is a PULL surface, not an approval queue. ---- */
    R.push({
      key: 'run', nm: 'THE RUN', src: 'calendar_dates',
      note: 'what the roster has coming. live on add, pull it here',
      tiles: function () {
        var MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        return (DB.dates || []).map(function (r) {
          var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.on_date || ''));
          var when = m ? MON[+m[2] - 1] + ' ' + (+m[3]) : '';
          var who = (r.profiles && r.profiles.display_name) || 'member';
          // THE EXCHANGE. An unanswered ask is the most time-sensitive thing on
          // this whole board: the night happens whether or not anybody replied.
          var hx = r.house_status === 'shot' ? ' · shot'
                 : r.house_status === 'on_list' ? ' · we are going'
                 : r.want_house ? ' · ASKING FOR THE HOUSE' : '';
          return {
            glyph: when.split(' ')[1] || '?', off: !r.published,
            t: r.title, s: when + ' · ' + who + hx,
            state: r.published ? 'live' : 'hidden',
            open: function () {
              sheet({
                title: r.title || 'DATE',
                why: when + ' · ' + (r.venue || '') + (r.city ? ' · ' + r.city : '') + ' · ' + who,
                fields: [
                  { key: 'title', label: 'What it is', value: r.title || '' },
                  { key: 'on_date', label: 'Date', value: r.on_date || '', hint: 'YYYY-MM-DD' },
                  { key: 'venue', label: 'Venue', value: r.venue || '' },
                  { key: 'city', label: 'City', value: r.city || '' },
                  { key: 'link', label: 'Link', value: r.link || '', hint: 'https:// or blank' },
                  { key: 'note', label: 'A line about it', type: 'textarea', rows: 3, value: r.note || '' },
                  { key: 'published', label: 'On the calendar', type: 'check', value: r.published !== false },
                  { key: 'house_status', label: 'The house', type: 'select',
                    value: r.house_status || 'none',
                    options: [['none', r.want_house ? 'they asked, no answer yet' : 'not asked'],
                              ['on_list', 'on the list, we are going'],
                              ['shot', 'shot it']],
                    hint: r.want_house ? 'They asked for this one.' : 'They have not asked for this one.' },
                  // ⛔ A PICKER, NOT A TEXT FIELD. This value becomes a link on
                  // somebody else's page, and a typo there is a 404 with their
                  // name on it. EV.items is the DEPLOYED events.json, so the
                  // only slugs on offer are dumps that are actually live: you
                  // cannot mark a night shot before its frames are up, which is
                  // the correct order anyway.
                  { key: 'event_slug', label: 'The dump it landed in', type: 'select',
                    value: r.event_slug || '',
                    options: [['', 'no dump yet']].concat(
                      (EV.items || []).map(function (e) {
                        return [e.slug, (e.date_short || e.date || '') + ' · ' + (e.venue || e.title || e.slug)];
                      }),
                      // an old value that has since left events.json still has to
                      // be visible, or saving this sheet would quietly clear it
                      (r.event_slug && !(EV.items || []).some(function (e) { return e.slug === r.event_slug; }))
                        ? [[r.event_slug, r.event_slug + ' (not in events.json)']] : []),
                    hint: 'Only nights that are already live show up here. Run newevent.py and ' +
                          'push first, then come back and point at it.' }
                ],
                save: async function (v) {
                  await OTP.updateDate(r.id, {
                    title: v.title, onDate: v.on_date, venue: v.venue,
                    city: v.city, link: v.link, note: v.note
                  });
                  if (!!v.published !== (r.published !== false))
                    await OTP.setDatePublished(r.id, v.published);
                  // second call on purpose: the trigger pins these two for
                  // anybody who is not the desk, so they never ride along with
                  // a member's own patch
                  if (v.house_status !== (r.house_status || 'none') ||
                      (v.event_slug || '') !== (r.event_slug || ''))
                    await OTP.setDateHouse(r.id, { status: v.house_status, eventSlug: v.event_slug });
                },
                kill: function () { return OTP.deleteDate(r.id); }
              });
            }
          };
        });
      },
      add: {
        label: 'ADD A DATE', glyph: '📅', on: function () {
          sheet({
            title: 'ADD A DATE', why: 'goes on the calendar straight away',
            fields: [
              { key: 'title', label: 'What it is' },
              { key: 'on_date', label: 'Date', hint: 'YYYY-MM-DD' },
              { key: 'venue', label: 'Venue' },
              { key: 'city', label: 'City' },
              { key: 'link', label: 'Link', hint: 'https:// or blank' },
              { key: 'note', label: 'A line about it', type: 'textarea', rows: 3 }
            ],
            saveLabel: 'Put it on',
            save: async function (v) {
              await OTP.addDate({ title: v.title, onDate: v.on_date, venue: v.venue,
                                  city: v.city, link: v.link, note: v.note });
            },
            done: 'On the calendar.'
          });
        }
      }
    });

    /* ---- THE REEL. Fully live: submit, publish, feature, delete. ---- */
    R.push({
      key: 'videos', nm: 'THE REEL', src: 'featured_videos',
      note: 'what the roster is putting out',
      tiles: function () {
        return (DB.videos || []).map(function (v) {
          return {
            img: v.cover_url || '', off: !v.published,
            t: v.title, s: (v.featured ? 'featured · ' : '') + v.provider,
            state: v.published ? 'live' : 'draft',
            open: function () {
              sheet({
                title: v.title || 'VIDEO', why: v.provider + ' · ' + v.vid,
                art: v.cover_url || '',
                fields: [
                  { key: 'title', label: 'Title', value: v.title },
                  { key: 'published', label: 'Live on the page', type: 'check', value: !!v.published },
                  { key: 'featured', label: 'Featured (front of the rail)', type: 'check', value: !!v.featured }
                ],
                save: async function (val) {
                  if (val.title !== v.title) await OTP.updateVideo(v.id, { title: val.title });
                  if (!!val.published !== !!v.published) await OTP.setVideoPublished(v.id, val.published);
                  if (!!val.featured !== !!v.featured) await OTP.setVideoFeatured(v.id, val.featured);
                },
                kill: function () { return OTP.deleteVideo(v.id); }
              });
            }
          };
        });
      },
      add: {
        label: 'ADD A VIDEO', glyph: '▶', on: function () {
          sheet({
            title: 'ADD A VIDEO', why: 'youtube · tiktok · instagram',
            fields: [
              { key: 'url', label: 'Link', type: 'url', hint: 'paste the watch or share link, not the embed' },
              { key: 'title', label: 'Title', hint: 'up to 80 characters' },
              { key: 'cover', label: 'Cover image (optional)', type: 'file' }
            ],
            saveLabel: 'Put it up',
            save: async function (v, say) {
              if (!v.url) throw new Error('Needs a link.');
              if (!v.title) throw new Error('Needs a title.');
              var cover = null;
              if (v.cover) { say('Uploading the cover…'); cover = await OTP.uploadImage(v.cover); }
              say('Filing it…');
              await OTP.submitVideo({ url: v.url, title: v.title, coverUrl: cover });
            },
            done: 'Video is up.'
          });
        }
      }
    });

    /* ---- THE CATALOG. Numbered releases plus baked stories. Both are git
       artifacts today, so this rail is a mirror with links, not an editor. --- */
    R.push({
      key: 'catalog', nm: 'THE CATALOG', src: 'slate.releases + desk.json',
      note: 'every drop gets a number',
      tiles: function () {
        var rel = ((C.slate && C.slate.releases) || []).map(function (r) {
          var key = 'release:' + String(r.num || '');
          var p = ovPatch('slate', key), row = ovRow('slate', key);
          var v = Object.assign({}, r, p);
          return {
            img: thumb(v.art), glyph: '№', off: !!(row && row.hidden),
            t: (v.num ? v.num + ' · ' : '') + (v.title || ''),
            s: row && row.hidden ? 'pulled' : (v.kind || 'FILM'),
            state: row && row.hidden ? 'hidden' : (row && Object.keys(p).length ? 'draft' : 'git'),
            open: function () {
              sheet({
                title: v.num || 'RELEASE', why: 'a numbered row of the catalog',
                art: full(v.art),
                fields: [
                  { key: 'kicker', label: 'Kicker', value: p.kicker != null ? p.kicker : (r.kicker || '') },
                  { key: 'title', label: 'Title', value: p.title != null ? p.title : (r.title || '') },
                  { key: 'line', label: 'Line', type: 'textarea', rows: 3, value: p.line != null ? p.line : (r.line || '') },
                  { key: 'kind', label: 'Kind', value: p.kind != null ? p.kind : (r.kind || 'FILM') },
                  { key: 'link', label: 'Link', value: p.link != null ? p.link : (r.link || '') },
                  { key: 'hidden', label: 'Pull it from the catalog', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val) {
                  var patch = {};
                  ['kicker', 'title', 'line', 'kind', 'link'].forEach(function (kk) {
                    if (val[kk] !== undefined) patch[kk] = val[kk];
                  });
                  await writeOv('slate', key, patch, { hidden: !!val.hidden });
                }
              });
            }
          };
        });
        var st = ((C.desk && C.desk.items) || []).map(function (s) {
          return {
            img: s.thumb ? thumb(s.thumb) : '', t: s.title, s: s.kicker || 'THE WORD',
            state: 'git', href: s.link ? '../' + s.link : null, blank: true
          };
        });
        return rel.concat(st);
      }
    });

    /* ---- THE TAKE. The timeline. Live rows plus the two committed seeds. --- */
    R.push({
      key: 'take', nm: 'THE TAKE', src: 'posts + take.json seeds',
      note: 'card holders only · art, thoughts, whatever',
      tiles: function () {
        var out = (DB.posts || []).map(function (p) {
          var who = p.display_name || p.author || 'someone';
          return {
            img: p.image_url || '', off: p.published === false,
            glyph: '✎', t: (p.text || '').slice(0, 70) || '(photo only)',
            s: who + (p.pinned ? ' · pinned' : ''),
            state: p.published === false ? 'hidden' : 'live',
            open: function () {
              sheet({
                title: 'THE TAKE', why: who + ' · ' + new Date(p.created_at).toLocaleString(),
                art: p.image_url || '',
                fields: [
                  { key: 'text', label: 'Text', type: 'textarea', rows: 6, value: p.text || '' },
                  { key: 'published', label: 'Showing on the page', type: 'check', value: p.published !== false },
                  { key: 'pinned', label: 'Pinned to the top', type: 'check', value: !!p.pinned }
                ],
                save: async function (v) {
                  if (v.text !== (p.text || '')) await OTP.updatePost(p.id, { text: v.text });
                  if (!!v.published !== (p.published !== false)) await OTP.setPublished(p.id, v.published);
                  if (!!v.pinned !== !!p.pinned) await OTP.setPinned(p.id, v.pinned);
                },
                kill: function () { return OTP.deletePost(p.id); }
              });
            }
          };
        });
        // The committed seeds have no id, so they are keyed by a content hash
        // that Python and the browser both compute the same way.
        ((C.take && C.take.items) || []).forEach(function (s) {
          out.push({
            glyph: '❝', t: (s.text || '').slice(0, 70), s: s.author + ' · seed', state: 'git',
            off: !!(SEED[s._key] && SEED[s._key].hidden),
            open: function () {
              var cur = SEED[s._key] || {};
              sheet({
                title: 'SEED · ' + (s.author || ''), why: 'committed in content/take.json',
                fields: [
                  { key: 'newText', label: 'Replace the text', type: 'textarea', rows: 7,
                    value: cur.new_text || s.text || '' },
                  { key: 'hidden', label: 'Hide this seed', type: 'check', value: !!cur.hidden }
                ],
                save: async function (v) {
                  var same = (v.newText || '').trim() === (s.text || '').trim();
                  if (!v.hidden && same) { await OTP.clearSeedOverride(s._key); return; }
                  await OTP.setSeedOverride(s._key, { hidden: v.hidden, newText: same ? null : v.newText });
                }
              });
            }
          });
        });
        return out;
      },
      add: {
        label: 'POST TO THE TAKE', glyph: '✎', on: postSheet
      }
    });

    /* ---- THE WORD. Member stories and their entries. ---- */
    R.push({
      key: 'word', nm: 'THE WORD', src: 'member_stories + word_entries',
      note: 'stories from the roster, and what people wrote under them',
      tiles: function () {
        var deskThumb = {};
        ((C.desk && C.desk.items) || []).forEach(function (it) {
          var m = /^word\/([^\/]+)\//.exec(String(it.link || ''));
          if (m && it.thumb) deskThumb[m[1]] = it.thumb;
        });
        var out = (DB.stories || []).map(function (s) {
          return {
            img: deskThumb[s.slug] ? thumb(deskThumb[s.slug]) : '', glyph: '¶',
            off: !s.published, t: s.title,
            s: ((s.profiles && s.profiles.display_name) || 'member') + (s.baked ? ' · baked' : ''),
            state: s.baked ? 'git' : (s.published ? 'live' : 'draft'),
            open: function () {
              sheet({
                title: s.title || 'STORY',
                why: (s.published ? 'live' : 'waiting') + (s.baked ? ' · baked into git' : ''),
                fields: [
                  { key: 'title', label: 'Title', value: s.title || '' },
                  { key: 'dek', label: 'Dek', type: 'textarea', rows: 2, value: s.dek || '' },
                  { key: 'published', label: 'Live on the page', type: 'check', value: !!s.published },
                  { key: 'baked', label: 'Baked into git (the overlay lets go)', type: 'check', value: !!s.baked }
                ],
                body: '<div class="note">Long body edits open in the story editor, which is a better ' +
                      'box for markdown than this one.</div>' +
                      '<div class="row" style="margin-top:12px"><a class="btn ghost sm" href="../desk/word/">Open the story editor</a></div>',
                save: async function (v) {
                  if (v.title !== s.title || v.dek !== (s.dek || ''))
                    await OTP.updateStory(s.id, { title: v.title, dek: v.dek });
                  if (!!v.published !== !!s.published) await OTP.setStoryPublished(s.id, v.published);
                  if (v.baked && !s.baked) await OTP.setStoryBaked(s.id);
                },
                kill: function () { return OTP.deleteStory(s.id); }
              });
            }
          };
        });
        (DB.entries || []).forEach(function (e) {
          out.push({
            glyph: '“', off: !e.published, t: (e.text || '').slice(0, 70),
            s: ((e.profiles && e.profiles.display_name) || 'member') + ' · ' + (e.story_slug || ''),
            state: e.published ? 'live' : 'draft',
            open: function () {
              sheet({
                title: 'ENTRY', why: 'under ' + (e.story_slug || 'a story'),
                body: '<div class="note">' + esc(e.text || '') + '</div>',
                fields: [{ key: 'published', label: 'Showing under the story', type: 'check', value: !!e.published }],
                save: async function (v) { await OTP.setEntryPublished(e.id, v.published); },
                kill: function () { return OTP.deleteEntry(e.id); }
              });
            }
          });
        });
        return out;
      },
      add: { label: 'WRITE ONE', glyph: '✍', on: function () { location.href = '../word/new/'; } }
    });

    /* ---- MUSIC. Six committed seeds that can be swapped for any Spotify
       link, plus whatever the members put on rotation. ---- */
    R.push({
      key: 'music', nm: 'ON ROTATION', src: 'rotation.json + rotation_tracks',
      note: 'tap a tile to swap the song, arrows to reorder',
      tiles: function () {
        var items = ((C.rotation && C.rotation.items) || []);
        var keys = ordered('rotation', items, function (it) { return spot(it.link); });
        var out = keys.map(function (k, i) {
          var it = items.filter(function (x) { return spot(x.link) === k; })[0];
          var p = ovPatch('rotation', k), row = ovRow('rotation', k);
          var v = Object.assign({}, it, p);
          return {
            img: v.art || '', off: !!(row && row.hidden),
            t: v.title || '', s: v.artist || 'seed',
            state: row && row.hidden ? 'hidden' : (row && Object.keys(p).length ? 'draft' : 'git'),
            move: function (dir) { nudge('rotation', keys, i, i + dir); },
            open: function () {
              sheet({
                title: 'ROTATION · ' + (v.title || ''), why: 'a committed seed, swappable',
                art: v.art || '',
                fields: [
                  { key: 'link', label: 'New Spotify link', type: 'url', value: '',
                    hint: 'leave blank to keep this song and only fix the text' },
                  { key: 'title', label: 'Title', value: p.title != null ? p.title : (it.title || '') },
                  { key: 'artist', label: 'Artist', value: p.artist != null ? p.artist : (it.artist || '') },
                  { key: 'hidden', label: 'Take it off the grid', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val, say) {
                  var patch = {};
                  if (val.link && val.link.trim()) {
                    say('Reading the track…');
                    var r = await OTP.resolveTrack(val.link);
                    patch.link = 'https://open.spotify.com/track/' + r.id;
                    patch.title = r.title;
                    if (r.thumb) patch.art = r.thumb;
                    // a different song, so the old preview mp3 and its start
                    // offset belong to something that is no longer there
                    patch.preview = '';
                    patch.start = '';
                  }
                  if (val.title !== undefined && !patch.title) patch.title = val.title;
                  if (val.artist !== undefined) patch.artist = val.artist;
                  await writeOv('rotation', k, patch, { hidden: !!val.hidden });
                }
              });
            }
          };
        });
        (DB.tracks || []).forEach(function (t) {
          out.push({
            // the `rotation` view builds this same URL out of art_key; rotationAll
            // hands back the raw key, so the board rebuilds it the same way
            img: t.art_key ? 'https://i.scdn.co/image/' + t.art_key : '', off: !t.published,
            t: t.title || '', s: (t.profiles && t.profiles.display_name) || 'member',
            state: t.published ? 'live' : 'draft',
            open: function () {
              sheet({
                title: t.title || 'TRACK',
                why: 'submitted by ' + ((t.profiles && t.profiles.display_name) || 'a member'),
                fields: [
                  { key: 'artist', label: 'Artist', value: t.artist || '' },
                  { key: 'published', label: 'On the grid', type: 'check', value: !!t.published }
                ],
                save: async function (v) {
                  if (v.artist !== (t.artist || '')) await OTP.updateTrack(t.id, { artist: v.artist });
                  if (!!v.published !== !!t.published) await OTP.setTrackPublished(t.id, v.published);
                },
                kill: function () { return OTP.deleteTrack(t.id); }
              });
            }
          });
        });
        return out;
      },
      add: {
        label: 'ADD A TRACK', glyph: '♫', on: function () {
          sheet({
            title: 'ADD A TRACK', why: 'spotify link, the house reads the rest',
            fields: [
              { key: 'url', label: 'Spotify link', type: 'url' },
              { key: 'artist', label: 'Artist (optional)', hint: 'blank uses what Spotify reports' }
            ],
            saveLabel: 'Put it on',
            save: async function (v, say) {
              if (!v.url) throw new Error('Needs a Spotify link.');
              say('Reading the track…');
              await OTP.submitTrack({ url: v.url, artist: v.artist || '' });
            },
            done: 'On rotation.'
          });
        }
      }
    });

    /* ---- THE ROSTER. Flavor, lore, stamp and order, all from here. ---- */
    R.push({
      key: 'roster', nm: 'THE ROSTER', src: 'content/roster.json + overlay',
      note: 'the cards. song, lore and order are editable, the art is not',
      tiles: function () {
        var items = ((C.roster && C.roster.items) || []);
        var keys = ordered('roster', items, function (it) { return String(it.name || ''); });
        return keys.map(function (k, i) {
          var it = items.filter(function (x) { return String(x.name || '') === k; })[0];
          var p = ovPatch('roster', k), row = ovRow('roster', k);
          var v = Object.assign({}, it, p);
          return {
            img: thumb(it.photo), tall: true, off: !!(row && row.hidden),
            t: it.name, s: row && row.hidden ? 'hidden' : (v.type_label || it.rarity || ''),
            state: row && row.hidden ? 'hidden' : (row && Object.keys(p).length ? 'draft' : 'git'),
            move: function (dir) { nudge('roster', keys, i, i + dir); },
            open: function () {
              sheet({
                title: it.name, why: (it.rarity || '') + ' · hp ' + (it.hp || ''),
                art: full(it.photo),
                fields: [
                  { key: 'theme_song', label: 'Opening song', type: 'song',
                    value: p.theme_song != null ? p.theme_song : (it.theme_song || ''),
                    hint: 'Plays when somebody opens the card. Empty means no song. ' +
                          'If they hold an account and set their own song at /card/, theirs wins over this.' },
                  { key: 'theme_start', label: 'Start at (seconds)',
                    value: p.theme_start != null ? p.theme_start : (it.theme_start || ''),
                    hint: 'Anyone not logged into Spotify only gets the 30 second preview, so past 0:30 does nothing for them.' },
                  { key: 'flavor', label: 'Flavor line', value: p.flavor != null ? p.flavor : (it.flavor || '') },
                  { key: 'lore', label: 'Lore', type: 'textarea', rows: 7, value: p.lore != null ? p.lore : (it.lore || '') },
                  { key: 'pending_stamp', label: 'Stamp', value: p.pending_stamp != null ? p.pending_stamp : (it.pending_stamp || '') },
                  { key: 'hidden', label: 'Hide from the roster', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val) {
                  var patch = {};
                  ['flavor', 'lore', 'pending_stamp'].forEach(function (kk) {
                    if (val[kk] !== undefined) patch[kk] = val[kk];
                  });
                  if (val.theme_song !== undefined) {
                    var raw = String(val.theme_song || '').trim();
                    var t = (w.OTP && OTP.readTrack) ? OTP.readTrack(raw) : { id: raw ? null : null, empty: !raw };
                    // ⛔ Refuse rather than write a link the card cannot play.
                    // Clearing the box on purpose still clears the song.
                    if (raw && !t.id) throw new Error(t.why || 'That is not a Spotify track link.');
                    // Store the canonical URL, not whatever shape got pasted, so
                    // roster.json ends up holding one format after bake.py folds it in.
                    patch.theme_song = t.id ? 'https://open.spotify.com/track/' + t.id : '';
                    var st = parseInt(String(val.theme_start || '').trim(), 10);
                    patch.theme_start = (isFinite(st) && st > 0) ? st : 0;
                  }
                  await writeOv('roster', k, patch, { hidden: !!val.hidden });
                }
              });
            }
          };
        });
      }
    });

    /* ---- THE WORK. 37 frames, captions and order both editable from here.
       Adding a frame is still a git thing: the file has to exist and derive.py
       has to make its three sizes before the page can paint it. ---- */
    R.push({
      key: 'work', nm: 'THE WORK', src: 'content/work.json + overlay',
      note: 'tap a frame to fix the caption, arrows to move it',
      tiles: function () {
        var items = ((C.work && C.work.items) || []);
        var keys = ordered('work', items, function (it) { return base(it.src); });
        return keys.map(function (k, i) {
          var it = items.filter(function (x) { return base(x.src) === k; })[0];
          var p = ovPatch('work', k), row = ovRow('work', k);
          var v = Object.assign({}, it, p);
          return {
            img: thumb(it.src), off: !!(row && row.hidden),
            t: v.label || k, s: row && row.hidden ? 'hidden' : (row ? 'edited' : 'in git'),
            state: row && row.hidden ? 'hidden' : (row && Object.keys(p).length ? 'draft' : 'git'),
            move: function (dir) { nudge('work', keys, i, i + dir); },
            open: function () {
              sheet({
                title: 'THE WORK', why: k, art: full(it.src),
                fields: [
                  { key: 'label', label: 'Caption', value: p.label != null ? p.label : (it.label || '') },
                  { key: 'alt', label: 'Alt text', type: 'textarea', rows: 2, value: p.alt != null ? p.alt : (it.alt || '') },
                  { key: 'hidden', label: 'Hide this frame', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val) {
                  var patch = {};
                  if (val.label !== undefined) patch.label = val.label;
                  if (val.alt !== undefined) patch.alt = val.alt;
                  await writeOv('work', k, patch, { hidden: !!val.hidden });
                }
              });
            }
          };
        });
      },
      add: {
        label: 'ADD A FRAME', glyph: '🖼', on: function () {
          sheet({
            title: 'ADD A FRAME', why: 'straight onto the grid, no laptop',
            fields: [
              { key: 'file', label: 'The frame', type: 'file', accept: 'image/*',
                hint: 'shrunk before it uploads. landscape reads best on the grid.' },
              { key: 'label', label: 'Caption', hint: 'ROOM · what it is · 08.27' },
              { key: 'alt', label: 'Alt text', type: 'textarea', rows: 2,
                hint: 'what is in the frame, for anyone who cannot see it' }
            ],
            body: '<div class="note">Goes straight to the FRONT of the six frames ' +
                  'the front page features. The full archive at /work/ reads the ' +
                  'committed file, so it picks this up on the next bake and push.</div>',
            saveLabel: 'Put it up',
            save: async function (v, say) {
              if (!v.file) throw new Error('Pick a frame first.');
              if (!v.label) throw new Error('Give it a caption.');
              say('Shrinking…');
              // ⛔ Downscale BEFORE upload. A phone hands over a 12MP jpg and
              // the grid renders it at 250px; shipping the original torches the
              // egress budget for nothing. Same reason card art has fitCardArt.
              var f = OTP.fitCardArt ? await OTP.fitCardArt(v.file, 1600, 1600) : v.file;
              say('Uploading…');
              var url = await OTP.uploadImage(f);
              // The item_key is the uploaded BASENAME, which is what
              // applyList and bake.py both key work items on. Anything else and
              // the row would never match itself again.
              var key = String(url).split('/').pop().split('?')[0];
              say('Putting it up…');
              // ⛔ sort -1 puts it FIRST. Committed frames have no sort, which
              // reads as 0, and an addition is appended, so without this a new
              // frame lands at position 38 of 37 and the homepage only features
              // the top SIX. It would upload fine and be invisible.
              await OTP.setSiteOverride('work', key, {
                src: url, label: v.label, alt: v.alt || ''
              }, { sort: -1 });
            },
            done: 'Up, at the front of the grid.'
          });
        }
      }
    });

    /* ---- THE HOUSE. Not a homepage section, but it is the thing that
       actually needs him: who is at the door and who is in. ---- */
    R.push({
      key: 'members', nm: 'THE HOUSE', src: 'profiles',
      note: 'who holds a card',
      tiles: function () {
        var art = {};
        (DB.cards || []).forEach(function (c) { if (c.card_slug) art[c.card_slug] = c.card_photo || ''; });
        var out = (DB.pending || []).map(function (p) {
          return {
            tall: true, off: true, t: p.display_name || '(no name)', s: 'at the door', state: 'draft',
            glyph: '?',
            open: function () { memberSheet(p, false); }
          };
        });
        (DB.members || []).forEach(function (p) {
          var w = (DB.cards || []).filter(function (c) { return c.card_slug === p.card_slug; })[0] || {};
          out.push({
            img: art[p.card_slug] || '', tall: true,
            t: p.display_name || '(no name)',
            s: (p.card_slug ? (w.tagline ? 'page written' : 'page blank') : 'no card') +
               (p.is_admin ? ' · desk' : ''),
            state: 'live',
            open: function () { memberSheet(p, true); }
          });
        });
        // 023: the ones the desk said no to, LAST and dimmed. They are here so
        // the decision is reversible, not so it gets re-litigated every time
        // this rail paints.
        (DB.refused || []).forEach(function (p) {
          out.push({
            tall: true, off: true, glyph: '\u2715',
            t: p.display_name || '(no name)', s: 'not going forward',
            state: 'hidden',
            open: function () { memberSheet(p, false); }
          });
        });
        return out;
      },
      add: {
        label: 'INVITE', glyph: '🎟', cold: true, on: function () {
          tellSheet('SEATS', 'they let themselves in', [
            'There is no invite button because there is no invite.',
            'Someone holding a card signs up at /join/, then shows up here as',
            'at the door, and you tap approve.',
            '',
            'If you do not want them, open them and tick NOT THIS ONE. They drop',
            'out of your queue instead of being re-read every time you open this.',
            'Their side does not change at all: it still says in the queue, the',
            'same as it did before. Undo puts them back at the door, not in.'
          ], [{ label: 'The seats page', href: '../seats/', blank: true },
              { label: 'The door', href: '../join/', blank: true }]);
        }
      }
    });

    /* ---- PITCH and WHY, both written straight into index.html. ---- */
    R.push({
      key: 'static', nm: 'PITCH + WHY', src: 'content/site.json',
      note: 'the DM block and the receipts, both editable now',
      tiles: function () {
        var edited = Object.keys(OV.site || {}).some(function (k) {
          return k.indexOf('pitch.') === 0 || k.indexOf('why.') === 0;
        });
        return [
          { t: 'Pitch Us', glyph: '✉', s: (C.site && C.site.pitch && C.site.pitch.accent) || 'get on the desk',
            state: edited ? 'draft' : 'live', open: function () { jump('voice'); } },
          { t: 'Why we are the experts', glyph: '★', s: (C.site && C.site.why && C.site.why.sub) || 'credentials · craft · receipts',
            state: edited ? 'draft' : 'live', open: function () { jump('voice'); } }
        ];
      }
    });

    /* ---- THIS IS US. creators.json has no overlay section yet. ---- */
    R.push({
      key: 'curators', nm: 'THIS IS US', src: 'content/creators.json',
      note: 'the outlet, the lens, the open seats',
      tiles: function () {
        var items = ((C.creators && C.creators.items) || []);
        var keys = ordered('creators', items, function (it) { return String(it.name || ''); });
        return keys.map(function (k, i) {
          var c = items.filter(function (x) { return String(x.name || '') === k; })[0];
          var p = ovPatch('creators', k), row = ovRow('creators', k);
          var v = Object.assign({}, c, p);
          return {
            img: thumb(c.photo), tall: true, off: !!(row && row.hidden),
            t: v.name, s: row && row.hidden ? 'hidden' : (v.role || ''),
            state: row && row.hidden ? 'hidden' : (row && Object.keys(p).length ? 'draft' : 'git'),
            move: function (dir) { nudge('creators', keys, i, i + dir); },
            open: function () {
              sheet({
                title: c.name, why: c.kind === 'ex' ? 'the lens' : 'a voice',
                art: full(c.photo),
                fields: [
                  { key: 'role', label: 'Role', value: p.role != null ? p.role : (c.role || '') },
                  { key: 'tag', label: 'Tag line', value: p.tag != null ? p.tag : (c.tag || '') },
                  { key: 'flavor', label: 'Flavor line', value: p.flavor != null ? p.flavor : (c.flavor || '') },
                  { key: 'lore', label: 'Lore', type: 'textarea', rows: 6, value: p.lore != null ? p.lore : (c.lore || '') },
                  { key: 'hidden', label: 'Hide this card', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val) {
                  var patch = {};
                  ['role', 'tag', 'flavor', 'lore'].forEach(function (kk) {
                    if (val[kk] !== undefined) patch[kk] = val[kk];
                  });
                  try {
                    await writeOv('creators', k, patch, { hidden: !!val.hidden });
                  } catch (e) {
                    // The section CHECK is the only thing that can refuse this,
                    // and it refuses with a constraint error nobody can read.
                    if (/violates check|check constraint|23514/i.test(e.message || ''))
                      throw new Error('The database still refuses a creators row. Run migration-017-the-board.sql, then try again.');
                    throw e;
                  }
                }
              });
            }
          };
        });
      }
    });

    return R;
  }

  function memberSheet(p, isIn) {
    // The back of their card, from his side. Same two columns they type, and
    // the words are the only part of a member page the desk writes: their
    // posts, songs and stories are moderated where they already live.
    var words = (DB.cards || []).filter(function (c) { return c.card_slug === p.card_slug; })[0] || {};
    sheet({
      title: p.display_name || 'MEMBER',
      why: p.denied ? 'refused. not going forward'
         : isIn ? 'in the house' + (p.card_slug ? ' · ' + p.card_slug : '')
         : 'waiting at the door',
      body: p.card_slug
        ? '<div class="row" style="margin-top:14px"><a class="btn ghost sm" href="../c/' +
          encodeURIComponent(p.card_slug) + '/" target="_blank" rel="noopener">Open their page</a></div>'
        : '',
      fields: [
        { key: 'approved', label: 'In the house', type: 'check', value: !!p.approved },
        // 023. Ticking this takes the seat back in the same write (the trigger
        // does it), so the two boxes can never both end up true.
        { key: 'denied', label: p.denied ? 'Refused (untick to put them back at the door)' : 'Not this one',
          type: 'check', value: !!p.denied,
          hint: p.denied
            ? 'Untick and they go back to WAITING, not in. You still have to say yes on purpose.'
            : 'Says no and clears them out of your queue. They are never told: their side still reads "in the queue" exactly like before. Reversible.' },
        { key: 'card', label: 'Card slug', value: p.card_slug || '', hint: 'the /card/ they hold. blank takes it away.' },
        { key: 'tagline', label: 'Their tagline', value: words.tagline || '', hint: 'one line, up to 80' },
        { key: 'bio', label: 'Their bio', type: 'textarea', rows: 5, value: words.bio || '', hint: 'up to 600' }
      ],
      save: async function (v) {
        // ⛔ THE NO GOES FIRST. It clears approved server side, so sending an
        // approve after it would just undo the thing that was asked for.
        if (!!v.denied !== !!p.denied) await OTP.setDenied(p.id, v.denied);
        if (!v.denied && !!v.approved !== !!p.approved) await OTP.setApproved(p.id, v.approved);
        if ((v.card || '') !== (p.card_slug || '')) await OTP.setCard(p.id, v.card || null);
        if ((v.tagline || '') !== (words.tagline || '') || (v.bio || '') !== (words.bio || ''))
          await OTP.setMemberWords(p.id, { tagline: v.tagline, bio: v.bio });
      },
      kill: isIn ? async function () {
        var batch = await OTP.retireMember(p.id);
        if (batch) w.__lastRetire = batch;
      } : null,
      killLabel: 'Retire this member'
    });
  }

  /* ============================ posting ================================= */

  function postSheet() {
    sheet({
      title: 'POST', why: 'straight to the take, no approval',
      fields: [
        { key: 'text', label: 'What is it', type: 'textarea', rows: 6 },
        { key: 'file', label: 'Photo or clip (optional)', type: 'file', accept: 'image/*,video/*',
          hint: 'up to 50MB' },
        { key: 'alt', label: 'Alt text', hint: 'what is in the frame, for anyone who cannot see it' }
      ],
      saveLabel: 'Put it up',
      save: async function (v, say) {
        if (!v.text && !v.file) throw new Error('Say something or bring a photo.');
        var url = null;
        if (v.file) { say('Uploading…'); url = await OTP.uploadImage(v.file); }
        say('Posting…');
        await OTP.post({ text: v.text || '', imageUrl: url, imageAlt: v.alt || '' });
      },
      done: 'Posted.'
    });
  }

  /* ============================ the voice =============================== */
  /* site.json top level keys. index.html already does site[item_key] = value
     for any key it finds, so every one of these works today with no migration.
     The nested blocks (social, mic_check) do not, and say so. */

  /* Every one of these is a real top level or DOTTED key in site.json, and the
     page reads all of them. A dotted key writes into a nested block, which is
     what finally made the mic check and the social links editable without a
     laptop: nothing about the table changed, the page just never READ them. */

  var MIC_LABELS = {
    studio: 'Studio', founded: 'Founded', what_it_is: 'What it is', pillars: 'Pillars',
    the_roster: 'The Roster', territory: 'Territory', the_rooms: 'The Rooms', vibe: 'Vibe',
    the_lens: 'The Lens', the_color: 'The Color', influences: 'Influences', palette: 'Palette',
    signature: 'Signature', voice: 'Voice', not_interested_in: 'Not interested in'
  };

  function voiceGroups() {
    var g = [
      ['THE BANNER', 'the first three lines anybody reads', [
        { k: 'kicker', l: 'Kicker' },
        { k: 'pulse_line_1', l: 'Headline, first line' },
        { k: 'pulse_line_2', l: 'Headline, blue line' },
        { k: 'pulse_route', l: 'Route line' }
      ]],
      ['THE CRAWL AND THE QUOTE', 'the marquee and the pull quote', [
        { k: 'ticker_headlines', l: 'The ticker', t: 'ticker' },
        { k: 'house_quote', l: 'House quote', t: 'area' },
        { k: 'house_quote_attribution', l: 'Quote is by' },
        { k: 'house_quote_highlight', l: 'Word to highlight', hint: 'has to appear in the quote or nothing glows' }
      ]],
      ['THE NAME', 'nav, footer and what search sees', [
        { k: 'site_name', l: 'House name' },
        { k: 'handle', l: 'Handle' },
        { k: 'city', l: 'City' },
        { k: 'one_liner', l: 'One liner', t: 'area',
          note: 'this one only feeds the meta description, which is baked into the page head. Editing it here changes nothing until bake.py and a push.' }
      ]],
      ['SOCIAL', 'nav Follow button and the footer row', [
        { k: 'social.instagram', l: 'Instagram' },
        { k: 'social.tiktok', l: 'TikTok' },
        { k: 'social.youtube', l: 'YouTube' }
      ]]
    ];
    // PITCH US and WHY. Moved out of index.html markup and into site.json, so
    // the last two literal blocks on the front page are editable from a phone
    // like everything else. The board's own explainer promised this.
    g.push(['PITCH US', 'the DM block at the bottom of the page', [
      { k: 'pitch.title', l: 'Heading' },
      { k: 'pitch.accent', l: 'Heading, pink half' },
      { k: 'pitch.sub', l: 'Sub line' },
      { k: 'pitch.lead', l: 'Lead line', t: 'area' },
      { k: 'pitch.btn_label', l: 'Button, big text' },
      { k: 'pitch.btn_sub', l: 'Button, small text' },
      { k: 'pitch.btn_href', l: 'Button link', hint: 'https:// only, the page refuses anything else' },
      { k: 'pitch.fine', l: 'The fine print', t: 'area' }
    ]]);
    g.push(['WHY WE ARE THE EXPERTS', 'credentials, craft, receipts', [
      { k: 'why.title', l: 'Heading' },
      { k: 'why.accent', l: 'Heading, pink half' },
      { k: 'why.sub', l: 'Sub line' },
      { k: 'why.name', l: 'Whose block it is' },
      { k: 'why.role', l: 'Their role' },
      { k: 'why.bullets', l: 'The receipts', t: 'ticker' }
    ]]);

    var mic = (C.site && C.site.mic_check) || {};
    var micFields = Object.keys(mic).map(function (k) {
      return { k: 'mic_check.' + k, l: MIC_LABELS[k] || k };
    });
    // any override for a mic_check field the committed file does not have yet
    Object.keys(OV.site || {}).forEach(function (key) {
      if (key.indexOf('mic_check.') !== 0) return;
      if (micFields.some(function (f) { return f.k === key; })) return;
      micFields.push({ k: key, l: MIC_LABELS[key.slice(10)] || key.slice(10) });
    });
    if (micFields.length) g.push(['THE MIC CHECK', 'the fact sheet in the sidebar', micFields]);
    return g;
  }

  function getPath(obj, path) {
    var cur = obj, parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function voiceValue(k) {
    var r = ovRow('site', k);
    if (r && !r.hidden && r.patch && r.patch.value !== undefined) return String(r.patch.value);
    var v = getPath(C.site || {}, k);
    return Array.isArray(v) ? v.join(' | ') : String(v == null ? '' : v);
  }

  function voiceEl() {
    var box = d.createElement('div');
    voiceGroups().forEach(function (grp) {
      var h = d.createElement('h4');
      h.className = 'vgroup';
      h.innerHTML = esc(grp[0]) + '<span>' + esc(grp[1]) + '</span>';
      box.appendChild(h);
      var wrap = d.createElement('div');
      wrap.className = 'voice';
      grp[2].forEach(function (f) {
        var overridden = !!ovRow('site', f.k);
        var b = d.createElement('button');
        b.type = 'button';
        b.className = 'vt';
        b.innerHTML = '<span class="k"><i class="dot ' + (overridden ? 'draft' : 'git') + '"></i>' +
          esc(f.l) + (f.note ? ' <span class="lock">head only</span>' : '') +
          '</span><span class="v">' + esc(voiceValue(f.k)) + '</span>';
        b.onclick = function () {
          sheet({
            title: f.l.toUpperCase(),
            why: overridden ? 'edited from a phone, not baked into git yet' : 'as committed in site.json',
            body: f.note ? '<div class="note">' + esc(f.note) + '</div>' : '',
            fields: [{
              key: 'value', label: f.l,
              type: (f.t === 'ticker' || f.t === 'area') ? 'textarea' : 'text',
              rows: f.t === 'ticker' ? 6 : 3,
              value: voiceValue(f.k),
              hint: f.t === 'ticker' ? 'one headline per line, or separate them with |' : (f.hint || '')
            }],
            save: async function (v) {
              var val = v.value;
              if (f.t === 'ticker') val = val.split(/\n|\|/).map(function (x) { return x.trim(); })
                .filter(Boolean).join(' | ');
              if (!val) { await OTP.clearSiteOverride('site', f.k); return; }
              await OTP.setSiteOverride('site', f.k, { value: val });
            },
            kill: overridden ? function () { return OTP.clearSiteOverride('site', f.k); } : null,
            killLabel: 'Put it back to what is in git'
          });
        };
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
    });
    return box;
  }

  /* ============================== the map =============================== */
  /* The literal answer to "i need to visually see everything we can do". Every
     capability the house has, what state it is in, and one tap to the place it
     happens. Grouped, because a flat list of eighty rows is not seeing. */

  function MAP() {
    return [
      ['PUT SOMETHING UP', [
        ['Post to the take, photo or clip or text', 'here', postSheet],
        ['Put a video on the reel', 'here', function () { jump('videos'); }],
        ['Put a song on rotation', 'here', function () { jump('music'); }],
        ['Add a date to the calendar', 'here', function () { jump('run'); }],
        ['Write a story', 'away', '../word/new/'],
        ['Build or change a member card', 'away', '../card/'],
        ['Compose with the full editor', 'away', '../compose/'],
        ['Publish a new night', 'cold', 'newevent.py on the laptop, then push']
      ]],
      ['CHANGE THE PAGE', [
        ['The kicker, one liner, ticker and house quote', 'here', function () { jump('voice'); }],
        ['The slate: what is out next', 'here', function () { jump('slate'); }],
        ['Captions and alt text on the work', 'here', function () { jump('work'); }],
        ['Reorder the work, the roster, the rotation', 'here', function () { jump('work'); }],
        ['Roster lore, flavor and stamps', 'here', function () { jump('roster'); }],
        ['Swap any song on the grid', 'here', function () { jump('music'); }],
        ['Hide any frame, card, song or post', 'here', function () { jump('work'); }],
        ['Edit the seeds in the take', 'here', function () { jump('take'); }],
        ['The banner: kicker, headline, route line', 'here', function () { jump('voice'); }],
        ['Social links and every mic check field', 'here', function () { jump('voice'); }],
        ['The latest drop strip', 'here', function () { jump('slate'); }],
        ['Any numbered release in the catalog', 'here', function () { jump('catalog'); }],
        ['Curator cards', 'here', function () { jump('curators'); }],
        ['The one liner that search sees', 'cold', 'edit here, then bake and push'],
        ['Pitch Us and Why blocks', 'here', function () { jump('voice'); }],
        ['Add a new work frame', 'here', function () { jump('work'); }]
      ]],
      ['DECIDE WHAT STAYS UP', [
        ['Approve someone at the door', 'here', function () { jump('members'); }],
        ['Say no to someone at the door', 'here', function () { jump('members'); }],
        ['Hand out or take back a card', 'here', function () { jump('members'); }],
        ['Retire a member and pull their posts', 'here', function () { jump('members'); }],
        ['Write or fix any member\'s tagline and bio', 'here', function () { jump('members'); }],
        ['Open any card holder\'s page', 'here', function () { jump('members'); }],
        ['Pull or pin any post', 'here', function () { jump('take'); }],
        ['Pull, feature or delete a video (they go up on their own)', 'here', function () { jump('videos'); }],
        ['Publish or delete a track', 'here', function () { jump('music'); }],
        ['Pull or fix anyone\'s date', 'here', function () { jump('run'); }],
        ['Answer a member asking for the house', 'here', function () { jump('run'); }],
        ['Point a night you shot at its dump', 'here', function () { jump('run'); }],
        ['Publish, bake or delete a story', 'here', function () { jump('word'); }],
        ['Edit a live story body', 'away', '../desk/word/'],
        ['Undo a batch pull', 'away', '../desk/'],
        ['Clear photos with no post left', 'here', drainNow]
      ]],
      ['THE REST OF THE HOUSE', [
        ['The hit list', 'away', '../desk/targets/'],
        ['The goals board', 'away', '../desk/goals/'],
        ['The old desk, moderation queue', 'away', '../desk/'],
        ['Your own page', 'away', '../my/'],
        ['Fold every phone edit into git', 'cold', '/usr/bin/python3 bake.py, then push']
      ]]
    ];
  }

  function mapEl() {
    var wrap = d.createElement('div');
    wrap.className = 'capg';
    MAP().forEach(function (g) {
      var h4 = d.createElement('h4');
      h4.textContent = g[0];
      wrap.appendChild(h4);
      g[1].forEach(function (row) {
        var r = d.createElement('div');
        r.className = 'caprow';
        var st = row[1], go = row[2];
        r.innerHTML = '<span class="st ' + st + '"></span><span>' + esc(row[0]) + '</span>';
        var tail;
        if (st === 'here' && typeof go === 'function') {
          tail = d.createElement('button');
          tail.className = 'go'; tail.type = 'button'; tail.textContent = 'do it';
          tail.onclick = go;
        } else if (st === 'away') {
          tail = d.createElement('a');
          tail.className = 'go'; tail.href = go; tail.textContent = 'open';
        } else {
          tail = d.createElement('span');
          tail.className = 'go'; tail.textContent = String(go || 'not yet');
        }
        r.appendChild(tail);
        wrap.appendChild(r);
      });
    });
    return wrap;
  }

  function jump(key) {
    var el = $('r-' + key) || $('b-' + key);
    var back = d.querySelector('.sh-back');
    if (back) back.remove();
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function drainNow() {
    try {
      toast('Sweeping…');
      var r = await OTP.drainOrphans();
      toast('Cleared ' + ((r && r.cleared) || 0) + ' photo(s).');
      refresh();
    } catch (e) { toast(e.message, true); }
  }

  /* ============================== NOW =================================== */
  /* Only what is actually waiting on him. An empty strip is the good outcome
     and it says so in one line rather than showing four zeroes. */

  function nowEl() {
    var box = d.createElement('div');
    box.className = 'now';
    var chips = [];
    var atDoor = (DB.pending || []).length;
    if (atDoor) chips.push([atDoor, atDoor === 1 ? 'at the door' : 'at the door', function () { jump('members'); }, false]);
    var dark = (DB.videos || []).filter(function (v) { return !v.published; }).length;
    if (dark) chips.push([dark, 'video' + (dark > 1 ? 's' : '') + ' not up', function () { jump('videos'); }, false]);
    var qt = (DB.tracks || []).filter(function (t) { return !t.published; }).length;
    if (qt) chips.push([qt, 'track' + (qt > 1 ? 's' : '') + ' waiting', function () { jump('music'); }, false]);
    var ws = (DB.stories || []).filter(function (s) { return !s.published; }).length;
    if (ws) chips.push([ws, 'stor' + (ws > 1 ? 'ies' : 'y') + ' waiting', function () { jump('word'); }, false]);
    var we = (DB.entries || []).filter(function (e) { return !e.published; }).length;
    if (we) chips.push([we, 'entr' + (we > 1 ? 'ies' : 'y') + ' waiting', function () { jump('word'); }, false]);
    // THE EXCHANGE. Upcoming, asked for, and nobody has answered. This one
    // EXPIRES: the night goes ahead either way, so it sits with the door.
    var t0 = (function () { var n = new Date();
      return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') +
             '-' + String(n.getDate()).padStart(2,'0'); })();
    var asks = (DB.dates || []).filter(function (r) {
      return r.want_house && (r.house_status || 'none') === 'none' && String(r.on_date) >= t0;
    }).length;
    if (asks) chips.push([asks, asks === 1 ? 'asking for the house' : 'asking for the house',
                          function () { jump('run'); }, false]);
    var orph = (DB.orphans || []).length;
    if (orph) chips.push([orph, 'stray photo' + (orph > 1 ? 's' : ''), drainNow, true]);
    var edits = 0;
    Object.keys(OV).forEach(function (s) { edits += Object.keys(OV[s]).length; });
    edits += Object.keys(SEED).length;
    if (edits) chips.push([edits, 'edit' + (edits > 1 ? 's' : '') + ' not in git yet', function () {
      tellSheet('NOT IN GIT YET', edits + ' overlay row(s) live in the database', [
        'Every edit you make from a phone lands in the overlay first, which is',
        'why it shows up on the site straight away without a push.',
        '',
        'When you are next at the laptop:',
        '  /usr/bin/python3 bake.py',
        '  git add -A && git commit && git push',
        '',
        'bake.py folds them into content/*.json and tells you which rows went',
        'redundant, so the overlay does not quietly grow forever.'
      ]);
    }, true]);

    if (!chips.length) {
      var q = d.createElement('div');
      q.className = 'now-quiet';
      q.textContent = 'nothing waiting. the house is clean.';
      return q;
    }
    chips.forEach(function (c) {
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'nowchip' + (c[3] ? ' cool' : '');
      b.innerHTML = '<b>' + c[0] + '</b><span>' + esc(c[1]) + '</span>';
      b.onclick = c[2];
      box.appendChild(b);
    });
    return box;
  }

  /* ============================== helpers =============================== */

  function base(v) { return String(v || '').split('/').pop(); }
  function spot(link) {
    var m = /(?:track\/|spotify:track:)([A-Za-z0-9]{22})/.exec(String(link || ''));
    return m ? m[1] : '';
  }
  // The key order a rail is actually painted in, overlay sort applied. Same
  // rule as index.html: a missing sort reads as 0, and JS sort is stable, so
  // items with no override keep the order the file gave them.
  function ordered(section, items, keyOf) {
    return items.map(function (it, i) { return { k: keyOf(it), i: i }; })
      .filter(function (x) { return x.k; })
      .sort(function (a, b) {
        var ra = ovRow(section, a.k), rb = ovRow(section, b.k);
        var sa = ra && ra.sort != null ? ra.sort : 0;
        var sb = rb && rb.sort != null ? rb.sort : 0;
        return sa - sb || a.i - b.i;
      })
      .map(function (x) { return x.k; });
  }

  /* ============================== paint ================================= */

  function paint() {
    var panel = $('panel');
    var frag = d.createDocumentFragment();

    // legend
    var leg = d.createElement('div');
    leg.className = 'legend';
    leg.innerHTML =
      '<b><i class="dot live"></i>live</b>' +
      '<b><i class="dot draft"></i>edited or waiting</b>' +
      '<b><i class="dot git"></i>as committed</b>' +
      '<b><i class="dot hidden"></i>hidden</b>';
    frag.appendChild(leg);

    frag.appendChild(nowEl());

    var mk = d.createElement('h2');
    mk.className = 'bh';
    mk.innerHTML = 'Make something <span>every door in the house</span>';
    frag.appendChild(mk);

    var make = d.createElement('div');
    make.className = 'make';
    [
      ['✎', 'POST', 'to the take', postSheet],
      ['▶', 'VIDEO', 'on the reel', function () { jump('videos'); }],
      ['♫', 'TRACK', 'on rotation', function () { jump('music'); }],
      ['✍', 'STORY', 'the word', '../word/new/'],
      ['🎴', 'CARD', 'member card', '../card/'],
      ['📻', 'TICKER', 'the crawl', function () { jump('voice'); }],
      ['🌙', 'NIGHT', 'laptop only', 'cold'],
      ['🎯', 'HIT LIST', 'who to chase', '../desk/targets/']
    ].forEach(function (m) {
      var el;
      if (typeof m[3] === 'string' && m[3] !== 'cold') {
        el = d.createElement('a'); el.href = m[3];
      } else {
        el = d.createElement('button'); el.type = 'button';
        el.onclick = m[3] === 'cold'
          ? function () {
              tellSheet('A NEW NIGHT', 'laptop only, and that is on purpose', [
                'newevent.py builds the folder of graded frames and the page.',
                'A phone cannot make the frames, so this stays where the files are.'
              ]);
            }
          : m[3];
      }
      el.className = 'mk' + (m[3] === 'cold' ? ' cold' : '');
      el.innerHTML = '<span class="g">' + m[0] + '</span><span class="l">' + esc(m[1]) +
        '</span><span class="h">' + esc(m[2]) + '</span>';
      make.appendChild(el);
    });
    frag.appendChild(make);

    var ph = d.createElement('h2');
    ph.className = 'bh';
    ph.innerHTML = 'The page <span>top to bottom, same order as the site</span>';
    frag.appendChild(ph);

    var specs = railSpecs();
    specs.forEach(function (r) {
      try { frag.appendChild(railEl(r)); }
      catch (e) { console.warn('board: rail ' + r.key + ' failed', e); }
    });

    var vh = d.createElement('h2');
    vh.className = 'bh';
    vh.id = 'b-voice';
    vh.innerHTML = 'The house voice <span>the words the site says about itself</span>';
    frag.appendChild(vh);
    frag.appendChild(voiceEl());

    var mh = d.createElement('h2');
    mh.className = 'bh';
    mh.id = 'b-map';
    mh.innerHTML = 'Everything this can do <span>and exactly where it happens</span>';
    frag.appendChild(mh);
    frag.appendChild(mapEl());

    panel.innerHTML = '';
    panel.appendChild(frag);

    // the jump bar, built from what actually rendered
    var old = d.querySelector('.jump');
    if (old) old.remove();
    var jb = d.createElement('nav');
    jb.className = 'jump';
    specs.forEach(function (r) {
      var a = d.createElement('a');
      a.href = '#r-' + r.key;
      a.textContent = r.nm;
      jb.appendChild(a);
    });
    ['voice:HOUSE VOICE', 'map:EVERYTHING'].forEach(function (p) {
      var a = d.createElement('a');
      a.href = '#b-' + p.split(':')[0];
      a.textContent = p.split(':')[1];
      jb.appendChild(a);
    });
    panel.parentNode.insertBefore(jb, panel.parentNode.querySelector('.back'));

    if (!d.querySelector('.lift')) {
      var lift = d.createElement('button');
      lift.type = 'button';
      lift.className = 'lift';
      lift.textContent = 'top';
      lift.onclick = function () { w.scrollTo({ top: 0, behavior: 'smooth' }); };
      d.body.appendChild(lift);
    }
    painted = true;
  }

  /* ============================== load ================================== */

  async function loadContent() {
    var files = ['site', 'slate', 'work', 'roster', 'rotation', 'desk', 'take', 'creators'];
    await Promise.all(files.map(async function (f) {
      try {
        var r = await fetch('../content/' + f + '.json', { cache: 'no-cache' });
        C[f] = await r.json();
      } catch (e) { C[f] = {}; console.warn('board: content/' + f + '.json', e.message); }
    }));
    try {
      var r2 = await fetch('../events/events.json', { cache: 'no-cache' });
      EV = await r2.json();
    } catch (e) { EV = { items: [] }; }
    // Seed keys are a content hash, so they have to be computed once up front
    // and hung on the item; every later render just reads _key.
    var seeds = (C.take && C.take.items) || [];
    await Promise.all(seeds.map(async function (s) {
      try { s._key = await OTP.seedKey(s.author, s.text); } catch (e) { s._key = ''; }
    }));
  }

  async function loadDB() {
    var jobs = {
      posts: OTP.allPosts(60),
      videos: OTP.videosAll(),
      tracks: OTP.rotationAll(),
      stories: OTP.deskStories(),
      entries: OTP.deskWord(),
      pending: OTP.pending(),
      members: OTP.members(),
      cards: OTP.cards(),
      dates: OTP.calendarAll(200),
      refused: OTP.refused ? OTP.refused().catch(function () { return []; }) : [],
      orphans: OTP.orphanImages()
    };
    await Promise.all(Object.keys(jobs).map(async function (k) {
      try { DB[k] = await jobs[k]; }
      catch (e) { DB[k] = []; console.warn('board: ' + k + ' unavailable, ' + e.message); }
    }));
    try {
      var rows = await OTP.siteOverrides();
      OV = {};
      (rows || []).forEach(function (r) {
        (OV[r.section] = OV[r.section] || {})[r.item_key] = r;
      });
    } catch (e) { OV = {}; }
    try {
      var s = await OTP.seedOverrides();
      SEED = {};
      (s || []).forEach(function (r) { SEED[r.key] = r; });
    } catch (e) { SEED = {}; }
  }

  var refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    var y = w.scrollY;
    try { await loadDB(); paint(); w.scrollTo(0, y); }
    finally { refreshing = false; }
  }

  async function boot() {
    var panel = $('panel');
    if (!w.OTP || !OTP.configured) {
      panel.innerHTML = '<div class="setup"><b>Backend not switched on yet</b> ' +
        'Run <code>schema.sql</code> in Supabase and fill in <code>supabase-config.js</code>.</div>';
      return;
    }
    // Content first so the shape of the board is on screen while auth resolves.
    await loadContent();
    me = await OTP.me();
    if (!me) { location.href = '../join/'; return; }
    admin = !!(me.profile && me.profile.is_admin);
    if (!admin) {
      panel.innerHTML = '<div class="card"><b style="font-family:var(--f-display);font-style:italic;' +
        'font-size:24px;text-transform:uppercase">Board is the desk\'s.</b>' +
        '<div class="note">Signed in as ' + esc(me.user.email) + '. Your own page is ' +
        '<a href="../my/">here</a>.</div></div>';
      return;
    }
    paint();                    // paints from content alone, DB state fills in
    await loadDB();
    paint();
    // Photos whose post went away, swept whenever he opens the board.
    try { await OTP.drainOrphans(); } catch (e) {}
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  w.OTPBoard = { refresh: refresh, jump: jump, sheet: sheet };

})(window, document);
