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
 * no UI, that is all. The nested site fields and the numbered releases were
 * legal rows in site_overrides the whole time and simply were never READ. One
 * value in one CHECK constraint needed widening, for the curator cards, and that
 * is all migration 017 is.
 *
 * WHAT IS STILL COLD, and it is short: a new night (newevent.py on the laptop),
 * and the one liner that search sees (edit it here, then bake and push).
 * Everything else on this page is warm.
 *
 * 10/11: THIS IS US, the latest drop strip and the banner's route line came off
 * the board. Their homepage sections went 8/26 and 8/27, so a save there landed
 * in the overlay and changed nothing anybody could see.
 *
 * WAVE 2 (call 3, "the board is the control room"): two tabs. THE PAGE is
 * everything above, plus THE NIGHTS (take a photo down by name), THE TAKEDOWNS,
 * the catalog's house stories (pull, retitle, reshelve) and a roster whose
 * card holders read their song from the database. MEMBERS is board-members.js,
 * which reads window.BOARD below. The old THE HOUSE rail and its member sheet
 * are gone: one members manager, not two. The NOW strip reads ONE count
 * (desk_waiting), the same number the homepage Desk key shows.
 *
 * ⛔ EVERY VALUE FROM THE LINK IS CHECKED, AND NONE IS EVER ECHOED. This page
 * holds ban, close and delete, so a link sent to him must not be able to paint
 * anything. ?story, ?mstory, #members/<key> and #run:<id> each match a fixed
 * shape or a known value, and a miss says a fixed sentence.
 */
(function (w, d) {
  'use strict';

  var me = null, admin = false;
  var C = {};            // content/*.json
  var EV = { items: [] };// events/events.json
  var OV = {};           // site_overrides, section -> item_key -> row
  var SEED = {};         // seed_overrides, key -> row
  // live rows, filled by the second pass. ⛔ Never reassigned: board-members.js
  // holds this same object as BOARD.DB and patches DB.people in place.
  var DB = {};
  var NIGHTS = {};       // events/<slug>/data.json, read once per night when it is needed
  var VIEW = 'page';     // 'page' | 'members'
  var VOPTS = {};        // what MEMBERS was opened with ({filter})
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

  // ⛔ A picture is drawn only from our own storage or from this repo (and a
  // Spotify cover where the caller says so). Anything else, a URL somebody typed
  // into a row, paints as the glyph instead. The preview's fake files sit on the
  // page's own origin, which is this repo too.
  var STORE_ORIGIN = (function () {
    try { return new URL(String((w.OTP_SUPABASE && w.OTP_SUPABASE.url) || '')).origin; } catch (e) { return ''; }
  })();
  var REPO_PATH = /^(?:\.\.\/)?[a-z0-9_][a-z0-9._\/-]*$/i;
  function safeImg(src, o) {
    var s = String(src || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) {
      var u;
      try { u = new URL(s); } catch (e) { return ''; }
      if (u.origin === location.origin) return u.href;
      if (u.protocol !== 'https:') return '';
      if (STORE_ORIGIN && u.origin === STORE_ORIGIN && u.pathname.indexOf('/storage/v1/object/public/') === 0) return u.href;
      if (o && o.spotify && /^(i\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)$/i.test(u.hostname)) return u.href;
      return '';
    }
    // a repo path is the site root's: this page sits one folder down
    if (!REPO_PATH.test(s) || s.replace(/^\.\.\//, '').indexOf('..') >= 0) return '';
    return s.indexOf('../') === 0 ? s : '../' + s;
  }

  // The San Antonio clock (the battle and the lineup run on it), as YYYY-MM-DD.
  function dayIn(t) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric',
        month: '2-digit', day: '2-digit' }).format(t || new Date());
    } catch (e) {
      var n = t || new Date();
      return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    }
  }
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // 'YYYY-MM-DD' (or a timestamp) -> 'Oct 13'
  function monD(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? MON3[+m[2] - 1] + ' ' + (+m[3]) : '';
  }
  function dayAdd(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return t.toISOString().slice(0, 10);
  }
  function dayDiff(a, b) {        // b - a, in days
    var x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z');
    return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : NaN;
  }
  // 'YYYY-wWW', the ISO week (Monday to Sunday), the same rule as build_music.py.
  function weekMonday(id) {
    var m = /^(\d{4})-w(\d{1,2})$/.exec(String(id || ''));
    if (!m) return '';
    var jan4 = new Date(Date.UTC(+m[1], 0, 4));
    var mon1 = Date.UTC(+m[1], 0, 4 - ((jan4.getUTCDay() + 6) % 7));
    return new Date(mon1 + (+m[2] - 1) * 7 * 864e5).toISOString().slice(0, 10);
  }
  function weekOf(iso) {
    var t = Date.parse(iso + 'T00:00:00Z');
    var th = new Date(t + (3 - ((new Date(t).getUTCDay() + 6) % 7)) * 864e5);   // that week's Thursday
    var y = th.getUTCFullYear();
    return y + '-w' + String(Math.floor((th.getTime() - Date.UTC(y, 0, 1)) / (7 * 864e5)) + 1).padStart(2, '0');
  }

  // The Run's date box is a date picker now, which always hands back
  // YYYY-MM-DD. A browser with no picker shows a text box instead, and Postgres
  // turned "10/25" or "25/10/2026" into a raw error. So the shape is checked
  // here and refused in words, before anything is sent.
  function isoDay(v) {
    var s = String(v || '').trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    var t = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    if (!t || t.getUTCMonth() !== +m[2] - 1 || t.getUTCDate() !== +m[3])
      throw new Error('Pick the date in the date box, or type it as YYYY-MM-DD (2026-10-25).');
    return s;
  }

  var toastT = null;
  function toastBox(msg, bad, ms) {
    var old = d.querySelector('.toast');
    if (old) old.remove();
    var t = d.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.setAttribute('role', 'status');
    var sp = d.createElement('span');
    sp.textContent = msg;
    t.appendChild(sp);
    d.body.appendChild(t);
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.remove(); }, ms);
    return t;
  }
  function toast(msg, bad) {
    // a long line (the track add's 'filed, not up yet') needs longer than 2.6s to read
    toastBox(msg, bad, bad || String(msg).length > 60 ? 5200 : 2600);
  }

  // Ban, close, take the card back, hide: each says what it did with an Undo
  // beside it for 8 seconds. fn may return the sentence to say after; the board
  // re-reads either way.
  function toastUndo(msg, label, fn) {
    var t = toastBox(msg, false, 8000);
    t.classList.add('has-undo');
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'undo';
    b.textContent = label || 'Undo';
    b.onclick = async function () {
      b.disabled = true;
      try {
        var said = await fn();
        toast(typeof said === 'string' && said ? said : 'Undone.');
        refresh();
      } catch (e) { toast(e.message || String(e), true); }
    };
    t.appendChild(b);
    return t;
  }

  // Two taps for anything that cannot be taken back in one. The first tap
  // swaps the label and turns the button red for 4 seconds; the second runs fn
  // with the button disabled. A throw lands in a toast.
  function twoTap(btn, sure, fn) {
    var label = btn.textContent, timer = null;
    function reset() {
      clearTimeout(timer);
      btn.classList.remove('sure');
      btn.textContent = label;
    }
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      if (!btn.classList.contains('sure')) {
        btn.classList.add('sure');
        btn.textContent = sure || 'Tap again';
        clearTimeout(timer);
        timer = setTimeout(reset, 4000);
        return;
      }
      clearTimeout(timer);
      btn.disabled = true;
      try { await fn(btn); }
      catch (err) { toast(err.message || String(err), true); }
      finally { btn.disabled = false; reset(); }
    });
    return btn;
  }

  /* ============================== the sheet ==============================
     One at a time, bottom anchored so it lands under a thumb on a phone.
     fields: [{key,label,value,type,rows,hint}], type in text|textarea|check|file|url|date|select|song
     save(values, say) may be async. Throwing shows the message in the sheet
     instead of a browser alert he has to dismiss before he can read it.
     Wave 2, for the Members tab and the big sheets:
       o.tall           a wide, tall sheet (720px) whose title stays put
       o.mount(el, shut) called once the sheet is on the page, to fill it later
       o.img            a picture, drawn only from our storage or this repo
       o.killSure       the second-tap label (default 'Tap again to really delete')
       o.killDone       what the toast says after a kill (default 'Gone.')
       o.done           a string, a function of what save returned, or false (no toast)
       o.refresh        false skips the re-read after a save
     Returns {el, box, shut, say}. */

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
      return lab + '<input type="' + (f.type === 'url' ? 'url' : f.type === 'date' ? 'date' : 'text') + '" data-k="' +
             esc(f.key) + '" value="' + esc(f.value == null ? '' : f.value) + '">' +
             (f.hint ? '<div class="note">' + esc(f.hint) + '</div>' : '');
    }).join('');

    var art = safeImg(o.art, { spotify: true }), pic = safeImg(o.img, { spotify: true });
    back.innerHTML =
      '<div class="sh' + (o.tall ? ' tall' : '') + '" role="dialog" aria-modal="true">' +
        '<h3>' + esc(o.title || '') + '</h3>' +
        (o.why ? '<div class="why">' + esc(o.why) + '</div>' : '') +
        (art ? '<img class="art" src="' + esc(art) + '" alt="">' : '') +
        (pic ? '<img class="art pic" src="' + esc(pic) + '" alt="">' : '') +
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
        var res = await o.save(read(), speak);
        shut();
        var said = typeof o.done === 'function' ? o.done(res) : o.done;
        if (said !== false) toast(said || 'Saved.');
        if (o.refresh !== false) refresh();
      } catch (e) { speak(e.message || String(e), true); go.disabled = false; }
    };

    var kill = back.querySelector('[data-kill]');
    if (kill) kill.onclick = async function () {
      if (kill.dataset.sure !== '1') {
        kill.dataset.sure = '1';
        kill.classList.add('sure');
        kill.textContent = o.killSure || 'Tap again to really delete';
        return;
      }
      kill.disabled = true; speak('Deleting…');
      try { await o.kill(); shut(); toast(o.killDone || 'Gone.'); refresh(); }
      catch (e) { speak(e.message || String(e), true); kill.disabled = false; }
    };

    d.body.appendChild(back);
    var first = back.querySelector('input:not([type=checkbox]):not([type=file]),textarea');
    if (first && w.matchMedia('(min-width:640px)').matches) first.focus();
    var handle = { el: back, box: back.querySelector('.sh'), shut: shut, say: speak };
    if (typeof o.mount === 'function') {
      try { o.mount(back, shut); } catch (e) { speak(e.message || String(e), true); }
    }
    return handle;
  }

  // A sheet with nothing to save: it exists to tell him where a thing lives.
  // `copy` is optional: {label, text}. It renders the text in an editable box
  // with a copy button, for the one job this site cannot do itself.
  var TELL_N = 0;
  function tellSheet(title, why, lines, links, copy) {
    var id = 'tell-copy-' + (++TELL_N);
    var h = sheet({
      title: title, why: why,
      body: '<div class="note">' + lines.map(function (l) { return esc(l); }).join('<br>') + '</div>' +
        (copy
          ? '<textarea id="' + id + '" class="tell-copy" rows="5">' + esc(copy.text) + '</textarea>' +
            '<div class="row" style="margin-top:10px">' +
              '<button type="button" class="btn ghost sm" data-copy="' + id + '">' +
              esc(copy.label || 'Copy it') + '</button>' +
            '</div>'
          : '') +
        (links && links.length
          ? '<div class="row" style="margin-top:16px">' + links.map(function (l) {
              return '<a class="btn ghost sm" href="' + esc(l.href) + '"' +
                     (l.blank ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l.label) + '</a>';
            }).join('') + '</div>'
          : '')
    });
    if (!copy) return h;
    // sheet() appends synchronously, so the node is here by now.
    var btn = h.el.querySelector('[data-copy="' + id + '"]');
    var box = h.el.querySelector('#' + id);
    if (!btn || !box) return h;
    btn.onclick = async function () {
      // ⛔ The textarea is not decoration. navigator.clipboard is undefined on
      // a page served over plain http and throws when the document is not
      // focused, and this sheet is the ONLY place the message exists. Select it
      // so he can copy by hand when the API is not there.
      try {
        await navigator.clipboard.writeText(box.value);
        btn.textContent = 'Copied. Now send it.';
      } catch (e) {
        box.focus(); box.select();
        btn.textContent = 'Selected it, copy by hand.';
      }
    };
    return h;
  }

  /* ===================== THE DESK SAYS YES ==============================
     Nothing on this site reaches a member off it. No mail, no webhook, no
     push: the only outbound path in the whole codebase is Supabase's own
     password-reset mail. So the strongest moment in the system, the desk
     agreeing to shoot somebody's night, produced no signal at all and sat
     there until they happened to come back and look.

     This does not add a channel. It writes the message and puts it one tap
     from his clipboard, because his channels are a DM and an email and he
     sends both by hand anyway.

     ⛔ NOTHING FIRES ON A NO. 023 made the refusal deliberately silent: a
        denied member is never told and their side still reads "in the queue".
        Only on_list, shot and approved get a prompt. */
  var SITE = 'https://0fftheprint.com';
  // o.why and o.copyLabel let the same sheet carry a laptop command instead
  // of a message (THE NIGHTS: the tags are off, takedown.py does the file).
  function saidYes(o) {
    return tellSheet(o.title, o.why || 'nothing on the site tells them, so this is the part you send',
              o.lines, o.links, { label: o.copyLabel || 'Copy the message', text: o.text });
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
    if (t.k) b.dataset.k = t.k;
    var img = safeImg(t.img, { spotify: !!t.spotify });
    b.innerHTML = '<span class="shot' + (t.tall ? ' tall' : '') + (img ? '' : ' bare') + '">' +
      (img ? '' : '<i>' + esc(t.glyph || (t.t || '?').trim().charAt(0)) + '</i>') + '</span>' +
      '<span class="cap"><span class="t">' + esc(t.t || '') + '</span>' +
      '<span class="s"><i class="dot ' + esc(t.state || 'git') + '"></i>' + esc(t.s || '') + '</span></span>';
    // Set as a property, not inside the attribute string. A url() written into
    // style="..." with quotes around the path closes the attribute early and the
    // whole rail paints as empty boxes, which is exactly what it did the first time.
    if (img) b.firstChild.style.backgroundImage = 'url("' + String(img).replace(/["\\]/g, encodeURIComponent) + '")';
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

  // `on` is a click handler, or a string: then the tile is a plain link there.
  function addTile(label, glyph, on, cold) {
    var b = d.createElement(typeof on === 'string' ? 'a' : 'button');
    if (typeof on === 'string') b.href = on;
    else { b.type = 'button'; b.onclick = function () { on(); }; }
    b.className = 'tile add' + (cold ? ' off' : '');
    b.innerHTML = '<span class="p"><em>' + esc(glyph || '+') + '</em>' + esc(label) + '</span>';
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
    // One action in the header ('Mark waiting as seen'), two taps.
    if (r.act) {
      var ab = d.createElement('button');
      ab.type = 'button';
      ab.className = 'btn ghost sm rail-act';
      ab.textContent = r.act.label;
      twoTap(ab, r.act.sure, r.act.fn);
      sec.firstChild.appendChild(ab);
    }
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

    /* ---- THE NIGHTS. Built on the laptop by newevent.py: a night is a folder
       of graded frames plus a generated page, none of which a phone can make.
       Wave 2 (call 15): a photo comes down from here BY NAME. The tags on it
       come off at once; the file stays up until takedown.py runs. ---- */
    R.push({
      key: 'nights', nm: 'THE NIGHTS', src: 'events/events.json',
      note: 'every night we shot, newest first. tap one to take a photo down',
      tiles: function () {
        var down = {};
        (DB.takedowns || []).forEach(function (t) {
          if (!t.files_gone_at && onNight(t)) down[t.event_slug] = (down[t.event_slug] || 0) + 1;
        });
        return (EV.items || []).slice()
          .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
          .map(function (e) {
            return {
              k: 'night:' + e.slug,
              img: e.cover ? '../events/' + e.cover : '',
              t: e.venue || e.title || e.slug,
              s: (e.count | 0) + ' frames · ' + (e.date_short || e.date) +
                 (down[e.slug] ? ' · ' + down[e.slug] + ' coming down' : ''),
              state: down[e.slug] ? 'draft' : 'git',
              open: function () { nightSheet(e); }
            };
          });
      },
      add: {
        label: 'NEW NIGHT', glyph: '🌙', cold: true, on: function () {
          tellSheet('A NEW NIGHT', 'laptop only, and that is on purpose', [
            'A night is a folder of graded full quality frames plus its own page.',
            'newevent.py builds both from the exported folder, then git push.',
            'Nothing on a phone can make the frames, so nothing here pretends to.'
          ], [{ label: 'Every night', href: '../events/', blank: true }]);
        }
      }
    });

    /* ---- THE TAKEDOWNS (043). Every photo the board took down. Still up on
       the night means the tags are off and the file waits for takedown.py; only
       then is Undo still possible (the database refuses it once the file is gone). */
    R.push({
      key: 'takedowns', nm: 'THE TAKEDOWNS', src: 'frame_takedowns',
      note: 'photos you took down. the tags come off at once, the file waits for the laptop',
      tiles: function () {
        return (DB.takedowns || []).map(function (t) {
          var up = !t.files_gone_at && onNight(t);
          return {
            k: 'down:' + t.event_slug + '/' + t.media,
            img: up && w.OTP && OTP.frameThumb ? OTP.frameThumb(t.event_slug, t.media, '../') : '',
            glyph: '↓', off: !up, cls: 'down' + (up ? ' up' : ''),
            t: nightName(t.event_slug) + ' · ' + t.media,
            s: up ? 'tags off: ' + (t.tags_off | 0) + ' · still up on the night' : 'gone',
            state: up ? 'draft' : 'hidden',
            open: function () { takedownSheet(t); }
          };
        });
      }
    });

    /* ---- THE SLATE. slate.next, patched by site_overrides['slate']['']. The
       numbered releases have their own rows under THE CATALOG. ---- */
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
              // 10/10: the Stories cover shows the newest story on its own. A save
              // here PINS this slate over it until a newer story is out; set_at
              // is the pin's clock and bake.py folds it into slate.json with the rest.
              sheet({
                title: 'THE SLATE', why: 'pins over the newest story on the Stories cover, until a newer one is out',
                art: full(v.art),
                fields: [
                  { key: 'kicker', label: 'Kicker', value: p.kicker != null ? p.kicker : next.kicker },
                  { key: 'title', label: 'Title', value: p.title != null ? p.title : next.title },
                  { key: 'line', label: 'Line', type: 'textarea', rows: 3, value: p.line != null ? p.line : next.line },
                  { key: 'status', label: 'Status stamp', value: p.status != null ? p.status : next.status },
                  { key: 'link', label: 'Link', value: p.link != null ? p.link : next.link },
                  { key: 'hidden', label: 'Unpin, the newest story takes the cover', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val) {
                  var patch = {};
                  ['kicker', 'title', 'line', 'status', 'link'].forEach(function (k) {
                    if (val[k] !== undefined) patch[k] = val[k];
                  });
                  if (!val.hidden) patch.set_at = new Date().toISOString();
                  await OTP.setSiteOverride('slate', '', patch, { hidden: !!val.hidden });
                }
              });
            }
          });
        }
        // ⛔ No LATEST DROP tile (10/11). The strip under the marquee left the
        // page on 8/26, so this tile saved rows nothing read.
        return out;
      }
    });

    /* ---- THE RUN. Dates go live the moment a card holder adds one, so this
       rail is a PULL surface, not an approval queue. Call 6: it is the ONE
       place for dates now. The Crypt, /dates/ and the Music lineup read it. ---- */
    R.push({
      key: 'run', nm: 'THE RUN', src: 'calendar_dates',
      note: 'your dates live here. The Crypt, /dates/ and the Music lineup read this list',
      tiles: function () {
        return (DB.dates || []).map(function (r) {
          var x = dateBits(r);
          return {
            k: 'date:' + r.id,
            glyph: x.when.split(' ')[1] || '?', off: !r.published,
            t: r.title,
            s: r.published
              ? x.when + ' · ' + (x.cred ? (x.cred.display_name || x.cred.card_slug) + ' · put up by ' + x.who
                                         : x.who) + x.hx
              : x.when + ' · hidden: not on /dates/, the Crypt or the Music lineup',
            state: r.published ? 'live' : 'hidden',
            open: function () { dateSheet(r); }
          };
        });
      },
      add: {
        label: 'ADD A DATE', glyph: '📅', on: function () {
          sheet({
            title: 'ADD A DATE', why: 'goes on the Run, the Crypt and the Music lineup straight away',
            fields: [
              { key: 'title', label: 'What it is' },
              { key: 'on_date', label: 'Date', type: 'date' },
              { key: 'venue', label: 'Venue' },
              { key: 'city', label: 'City' },
              { key: 'link', label: 'Link', hint: 'https:// or blank' },
              { key: 'note', label: 'A line about it', type: 'textarea', rows: 3 }
            ],
            saveLabel: 'Put it on',
            save: async function (v) {
              await OTP.addDate({ title: v.title, onDate: isoDay(v.on_date), venue: v.venue,
                                  city: v.city, link: v.link, note: v.note });
            },
            done: 'On the Run.'
          });
        }
      }
    });

    /* ---- THE REEL. Fully live: submit, publish, feature, delete. ---- */
    R.push({
      key: 'videos', nm: 'THE REEL', src: 'featured_videos',
      note: 'member videos. they go up on their own, pull or feature one here',
      tiles: function () {
        return (DB.videos || []).map(function (v) {
          return {
            k: 'video:' + v.id,
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
                  // The homepage rail came off 10/11. Featured is their card
                  // page's Reel order now: a featured video plays first.
                  { key: 'featured', label: 'Featured (first on their page)', type: 'check', value: !!v.featured }
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
       artifacts. Call 12: a house story in it can be pulled, retitled and
       reshelved from here, through the overlay (site_overrides 'desk', keyed by
       its desk.json link). The words inside stay a laptop job. --- */
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
        var st = ((C.desk && C.desk.items) || []).filter(function (s) { return s && s.link; }).map(function (s) {
          var row = ovRow('desk', s.link), p = (row && row.patch) || {};
          var v = Object.assign({}, s, p);
          return {
            k: 'story:' + s.link,
            img: s.thumb ? thumb(s.thumb) : '', off: !!(row && row.hidden),
            t: v.title, s: row && row.hidden ? 'pulled' : (v.kicker || 'THE WORD'),
            state: row && row.hidden ? 'hidden' : (row && Object.keys(p).length ? 'draft' : 'git'),
            open: function () { storySheet(s); }
          };
        });
        return rel.concat(st);
      }
    });

    /* ---- THE TAKE. The timeline. Live rows plus the two committed seeds.
       Call 1: a post on the Roll is members only. It is marked here, and it
       has no pin (the database refuses a pin on the Roll). --- */
    R.push({
      key: 'take', nm: 'THE TAKE', src: 'posts + take.json seeds',
      note: 'the Take is everyone · Roll posts are members only',
      tiles: function () {
        var out = (DB.posts || []).map(function (p) {
          var who = p.display_name || p.author || 'someone';
          var roll = !!p.members_only;
          // 044: a banned, closed or shut author's posts are off for everyone
          // else, though the row still says published (desk_posts says which)
          var dark = p.published !== false && p.publicly_visible === false;
          var fields = [
            { key: 'text', label: 'Text', type: 'textarea', rows: 6, value: p.text || '' },
            { key: 'published', label: 'Showing on the page', type: 'check', value: p.published !== false }
          ];
          if (!roll) fields.push({ key: 'pinned', label: 'Pinned to the top', type: 'check', value: !!p.pinned });
          return {
            k: 'post:' + p.id,
            img: p.image_url || '', off: p.published === false || dark,
            glyph: '✎', t: (p.text || '').slice(0, 70) || '(photo only)',
            s: who + (roll ? ' · Roll' : '') + (p.pinned ? ' · pinned' : '') + (dark ? ' · dark' : ''),
            state: p.published === false ? 'hidden' : dark ? 'dark' : 'live',
            open: function () {
              sheet({
                title: roll ? 'THE ROLL' : 'THE TAKE',
                why: who + ' · ' + new Date(p.created_at).toLocaleString() + (roll ? ' · members only' : '') + (dark ? ' · dark' : ''),
                art: p.image_url || '',
                body: dark ? '<div class="note">' + esc(TAKE_DARK) + '</div>' : '',
                fields: fields,
                save: async function (v) {
                  if (v.text !== (p.text || '')) await OTP.updatePost(p.id, { text: v.text });
                  if (!!v.published !== (p.published !== false)) await OTP.setPublished(p.id, v.published);
                  if (!roll && !!v.pinned !== !!p.pinned) await OTP.setPinned(p.id, v.pinned);
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
        label: 'POST TO THE TAKE', glyph: '✎', on: function () { postSheet(); }
      }
    });

    /* ---- THE WORD. Member stories, the house's own, and the lines under
       them. A story goes up the moment it is sent; "new" means the desk has not
       read it yet (045's decided_at). A comment and a pick wait for a yes, and
       No is quiet: they are never told. ---- */
    R.push({
      key: 'word', nm: 'THE WORD', src: 'member_stories + word_entries',
      note: 'stories from the roster and the house, and what people wrote under them',
      act: {
        label: 'Mark waiting as seen', sure: 'Tap again: all of it seen',
        fn: async function () {
          var n = (await OTP.deskMarkAllSeen('story_comment')) + (await OTP.deskMarkAllSeen('story'));
          toast(n ? 'Marked ' + n + ' as seen.' : 'Nothing was waiting.');
          refresh();
        }
      },
      tiles: function () {
        var deskThumb = {};
        ((C.desk && C.desk.items) || []).forEach(function (it) {
          var m = /^word\/([^\/]+)\//.exec(String(it.link || ''));
          if (m && it.thumb) deskThumb[m[1]] = it.thumb;
        });
        var out = (DB.stories || []).map(function (s) {
          var fresh = waits('stories', s);
          return {
            k: 'mstory:' + s.slug,
            img: s.cover_url || (deskThumb[s.slug] ? thumb(deskThumb[s.slug]) : ''), glyph: '¶',
            off: !s.published, t: s.title,
            s: (s.house ? 'house' : ((s.profiles && s.profiles.display_name) || 'member')) +
               (s.baked ? ' · baked' : '') + (fresh ? ' · new' : ''),
            state: fresh ? 'draft' : s.baked ? 'git' : (s.published ? 'live' : 'hidden'),
            open: function () { wordSheet(s); }
          };
        });
        (DB.entries || []).forEach(function (e) {
          var fresh = waits('entries', e);
          out.push({
            k: 'entry:' + e.id,
            glyph: '“', off: !e.published, t: (e.text || '').slice(0, 70),
            s: ((e.profiles && e.profiles.display_name) || 'member') + ' · ' + (e.story_slug || '') +
               (fresh ? ' · waiting' : ''),
            state: e.published ? 'live' : (fresh ? 'draft' : 'hidden'),
            open: function () { entrySheet(e); }
          });
        });
        return out;
      },
      // the desk writes a HOUSE story: word/new/ ticks "File it as a house story"
      add: { label: 'WRITE ONE', glyph: '✍', on: '../word/new/?house=1' }
    });

    /* ---- MUSIC. The committed seeds, each swappable for any Spotify link,
       plus the songs the desk adds from here (overlay rows of their own until
       bake.py folds them in), plus whatever the members put on rotation. A
       member's pick waits for the desk; No is quiet. ---- */
    R.push({
      key: 'music', nm: 'ON ROTATION', src: 'rotation.json + overlay + rotation_tracks',
      note: 'tap a tile to swap the song, arrows to reorder',
      act: {
        label: 'Mark waiting as seen', sure: 'Tap again: all of it seen',
        fn: async function () {
          var n = await OTP.deskMarkAllSeen('pick');
          toast(n ? 'Marked ' + n + ' as seen.' : 'Nothing was waiting.');
          refresh();
        }
      },
      tiles: function () {
        var items = rotationItems();
        var keys = ordered('rotation', items, function (it) { return it._added || spot(it.link); });
        var out = keys.map(function (k, i) {
          var it = items.filter(function (x) { return (x._added || spot(x.link)) === k; })[0];
          var p = ovPatch('rotation', k), row = ovRow('rotation', k);
          var v = Object.assign({}, it, p);
          if (it._added) return {
            k: 'rot:' + k, spotify: true,
            img: v.art || '', off: !!(row && row.hidden),
            t: v.title || '', s: row && row.hidden ? 'hidden' : (v.artist || '') + ' · added here',
            state: row && row.hidden ? 'hidden' : 'draft',
            move: function (dir) { nudge('rotation', keys, i, i + dir); },
            open: function () {
              sheet({
                title: 'ROTATION · ' + (v.title || ''), why: 'added from the board, not in git yet',
                art: v.art || '',
                fields: [
                  { key: 'title', label: 'Title', value: p.title || '' },
                  { key: 'artist', label: 'Artist', value: p.artist || '' },
                  { key: 'hidden', label: 'Take it off the grid', type: 'check', value: !!(row && row.hidden) }
                ],
                // ⛔ THE WHOLE PATCH GOES BACK. The link IS this song: a save
                // that sent only the title would drop it off the grid.
                save: async function (val) {
                  if (!String(val.artist || '').trim()) throw new Error('Who is it by? Type the artist.');
                  await writeOv('rotation', k, Object.assign({}, p, { title: val.title, artist: val.artist }),
                                { hidden: !!val.hidden });
                },
                kill: function () { return OTP.clearSiteOverride('rotation', k); },
                killLabel: 'Take it off for good'
              });
            }
          };
          return {
            k: 'rot:' + k, spotify: true,
            img: v.art || '', off: !!(row && row.hidden),
            t: v.title || '', s: (v.artist || 'seed') + (v.won && v.won.week ? ' · won' : ''),
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
                  { key: 'artist', label: 'Artist', value: p.artist != null ? p.artist : (it.artist || ''),
                    hint: 'Spotify sends the title and the cover, never the artist. New song, type who it is by.' },
                  { key: 'hidden', label: 'Take it off the grid', type: 'check', value: !!(row && row.hidden) }
                ],
                save: async function (val, say) {
                  var patch = {};
                  // ⛔ A SWAP WITH NO ARTIST IS REFUSED (10/4). Nothing can fill it in afterwards (Spotify's
                  // open lookup has no artist in it), and three tiles sat on the homepage with no name under them.
                  if (val.link && val.link.trim() && !String(val.artist || '').trim()) {
                    throw new Error('Who is it by? Spotify sends the title and the cover, not the artist. Type it in.');
                  }
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
          var fresh = waits('tracks', t);
          var who = (t.profiles && t.profiles.display_name) || 'member';
          out.push({
            k: 'pick:' + t.id, spotify: true,
            // the `rotation` view builds this same URL out of art_key; rotationAll
            // hands back the raw key, so the board rebuilds it the same way
            img: /^[a-f0-9]{40}$/.test(String(t.art_key || '')) ? 'https://i.scdn.co/image/' + t.art_key : '',
            off: !t.published,
            t: t.title || '', s: who + (fresh ? ' · waiting' : ''),
            state: t.published ? 'live' : (fresh ? 'draft' : 'hidden'),
            open: function () {
              sheet({
                title: t.title || 'TRACK',
                why: 'a pick from ' + who + (fresh ? ' · waiting on you' : ''),
                body: fresh ? quietNo('pick') : '',
                fields: [
                  { key: 'artist', label: 'Artist', value: t.artist || '' },
                  { key: 'published', label: 'On the grid', type: 'check', value: !!t.published }
                ],
                mount: fresh ? function (el, shut) { wireNo(el, shut, 'pick', t.id); } : null,
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
            // Wave 2: the desk's own add goes ON ROTATION, first in line, the
            // same overlay row a swap writes (keyed by the track id). It used to
            // file a pick that sat off until ticked on, under Card Holders' Picks.
            title: 'ADD A TRACK', why: 'straight onto rotation, first in line',
            fields: [
              { key: 'url', label: 'Spotify link', type: 'url' },
              { key: 'artist', label: 'Artist', hint: 'Spotify sends the title and the cover, never the artist. Type who it is by.' }
            ],
            saveLabel: 'Put it on',
            save: async function (v, say) {
              if (!v.url) throw new Error('Needs a Spotify link.');
              // the hint here used to say "blank uses what Spotify reports". Spotify reports none, so blank went up as "unknown".
              if (!String(v.artist || '').trim()) throw new Error('Who is it by? Spotify does not tell us. Type the artist.');
              var t = OTP.readTrack(v.url);
              if (!t.id) throw new Error(t.why || 'That is not a Spotify track link.');
              var cur = ovRow('rotation', t.id);
              // ⛔ BY WHAT IS PLAYING, NOT BY THE KEY. A seed swapped to this
              // song plays it under the seed's own key, and a second row here
              // would put it on the grid twice.
              if (rotationShowing()[t.id]) throw new Error('Already on rotation.');
              var isSeed = ((C.rotation && C.rotation.items) || []).some(function (it) { return spot(it.link) === t.id; });
              if (isSeed && cur && !cur.hidden)
                throw new Error('Its seat plays another song now. Open that seat under ON ROTATION and swap it back.');
              say('Reading the track…');
              var r = await OTP.resolveTrack(v.url);
              var song = { platform: 'spotify', link: 'https://open.spotify.com/track/' + r.id, title: r.title,
                           artist: String(v.artist).trim(), art: r.thumb || '' };
              var patch;
              if (cur && cur.patch && Object.keys(cur.patch).length) {
                // a row that was taken off comes back as it was, with this artist
                patch = Object.assign({}, cur.patch, { artist: song.artist });
                // a seat once swapped to another song plays its own again
                if (patch.link && spot(patch.link) !== r.id) {
                  ['link', 'title', 'art', 'preview', 'start'].forEach(function (x) { delete patch[x]; });
                  if (!isSeed) Object.assign(patch, song);
                }
              } else patch = song;
              await writeOv('rotation', r.id, patch, { hidden: false, sort: -1 });
            },
            done: 'On rotation. First in line.'
          });
        }
      }
    });

    /* ---- THE ROSTER. House art, stats and lore, and their order. Call 2:
       who holds a card, their name, photo, song and links come from the
       database. A seat whose card is out (banned, closed or taken back) goes
       dark everywhere (dark_seats), and a card holder with no seat gets a tile
       of their own at the end, the way the pack and the binder show them. ---- */
    R.push({
      key: 'roster', nm: 'THE ROSTER', src: 'content/roster.json + overlay + cards',
      note: 'house art, stats and lore. Who holds a card, their name, photo, song and links come from the database.',
      tiles: function () {
        var items = ((C.roster && C.roster.items) || []);
        var keys = ordered('roster', items, function (it) { return String(it.name || ''); });
        var used = {};
        var out = keys.map(function (k, i) {
          var it = items.filter(function (x) { return String(x.name || '') === k; })[0];
          var p = ovPatch('roster', k), row = ovRow('roster', k);
          var v = Object.assign({}, it, p);
          var rw = cardFor(it);
          var slug = (rw && rw.card_slug) || it.card_slug || '';
          if (rw) used[rw.card_slug] = 1;
          var dark = isDark(slug, it);
          return {
            k: 'seat:' + k,
            img: thumb(it.photo), tall: true, off: !!(row && row.hidden) || dark,
            t: it.name,
            s: dark ? 'dark' : row && row.hidden ? 'hidden'
               : rw ? 'card holder · ' + (rw.display_name || slug) : (v.type_label || it.rarity || ''),
            state: dark ? 'dark' : row && row.hidden ? 'hidden' : (row && Object.keys(p).length ? 'draft' : (rw ? 'live' : 'git')),
            move: function (dir) { nudge('roster', keys, i, i + dir); },
            open: function () { seatSheet(it, k, rw, dark); }
          };
        });
        // the card holders with no seat, by name, the way peopleMerge appends them
        (DB.cards || []).filter(function (rw) { return rw && rw.card_slug && !used[rw.card_slug]; })
          .sort(function (a, b) {
            return String(a.display_name || a.card_slug).localeCompare(String(b.display_name || b.card_slug), undefined, { sensitivity: 'base' });
          })
          .forEach(function (rw) {
            var row = ovRow('roster', 'c:' + rw.card_slug);
            var dark = isDark(rw.card_slug);
            out.push({
              k: 'card:' + rw.card_slug,
              img: rw.card_photo || '', tall: true, glyph: '?', off: dark || !!(row && row.hidden),
              t: rw.display_name || rw.card_slug,
              s: dark ? 'dark' : row && row.hidden ? 'hidden' : 'card holder · their own art',
              state: dark ? 'dark' : row && row.hidden ? 'hidden' : 'live',
              open: function () { holderSheet(rw, dark); }
            });
          });
        return out;
      }
    });

    /* ---- THE WORK. Every committed frame, captions and order both editable
       from here, plus the frames ADD A FRAME put up from a phone. Those live
       only in the overlay (a row with its own src) until bake.py folds them
       into work.json, and they used to be missing from this rail. ---- */
    R.push({
      key: 'work', nm: 'THE WORK', src: 'content/work.json + overlay',
      note: 'tap a frame to fix the caption, arrows to move it',
      tiles: function () {
        var items = ((C.work && C.work.items) || []);
        var have = {};
        items.forEach(function (it) { have[base(it.src)] = 1; });
        // Same rule as applyList on the homepage: a row no committed frame
        // claims, carrying a src, is a frame of its own. Appended after the
        // file's frames, so with no sort it lands where the homepage puts it.
        Object.keys(OV.work || {}).forEach(function (k) {
          var ap = ovPatch('work', k);
          if (!have[k] && ap.src) items = items.concat([{ src: ap.src, _added: k }]);
        });
        var keyOf = function (it) { return it._added || base(it.src); };
        var keys = ordered('work', items, keyOf);
        return keys.map(function (k, i) {
          var it = items.filter(function (x) { return keyOf(x) === k; })[0];
          var p = ovPatch('work', k), row = ovRow('work', k);
          var v = Object.assign({}, it, p);
          if (it._added) return {
            img: thumb(p.src), off: !!(row && row.hidden),
            t: v.label || k, s: row && row.hidden ? 'hidden' : 'added from a phone',
            state: row && row.hidden ? 'hidden' : 'draft',
            move: function (dir) { nudge('work', keys, i, i + dir); },
            open: function () {
              sheet({
                title: 'THE WORK', why: 'added from a phone, not in git yet', art: full(p.src),
                fields: [
                  { key: 'label', label: 'Caption', value: p.label || '' },
                  { key: 'alt', label: 'Alt text', type: 'textarea', rows: 2, value: p.alt || '' },
                  { key: 'hidden', label: 'Hide this frame', type: 'check', value: !!(row && row.hidden) }
                ],
                // ⛔ THE WHOLE PATCH GOES BACK. src, w and h ARE this frame:
                // a save that sent only the caption would drop the picture.
                save: async function (val) {
                  await writeOv('work', k, Object.assign({}, p, { label: val.label, alt: val.alt }),
                                { hidden: !!val.hidden });
                },
                // Drops the row, so the frame is off the grid for good. The
                // photo file stays in storage: a bake that ran but was not
                // pushed yet may already point at it.
                kill: function () { return OTP.clearSiteOverride('work', k); },
                killLabel: 'Take it off the grid for good'
              });
            }
          };
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
                  // setSiteOverride replaces the patch: keep any other key the
                  // row already carries.
                  var patch = Object.assign({}, p);
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
            body: '<div class="note">Goes straight to the FRONT of the twelve frames ' +
                  'the front page features. The full archive at /work/ reads the ' +
                  'committed file, so it picks this up on the next bake and push.</div>',
            saveLabel: 'Put it up',
            save: async function (v, say) {
              if (!v.file) throw new Error('Pick a frame first.');
              if (!v.label) throw new Error('Give it a caption.');
              say('Shrinking…');
              // ⛔ Downscale BEFORE upload. A phone hands over a 12MP jpg and
              // the grid renders it at 250px; shipping the original torches the
              // egress budget for nothing.
              // ⛔ fitWithin, NOT fitCardArt. fitCardArt cover-crops to exactly
              // W x H, so through it at 1600x1600 a 3:2 frame lost a third of its
              // width to a square. fitWithin keeps the whole frame and hands back
              // its real size, which the grid needs for its shape (w, h).
              var fit = OTP.fitWithin ? await OTP.fitWithin(v.file, 1600) : null;
              var f = fit ? fit.blob : v.file;
              say('Uploading…');
              var url = await OTP.uploadImage(f);
              // The item_key is the uploaded BASENAME, which is what
              // applyList and bake.py both key work items on. Anything else and
              // the row would never match itself again.
              var key = String(url).split('/').pop().split('?')[0];
              say('Putting it up…');
              // ⛔ sort -1 puts it FIRST. Committed frames have no sort, which
              // reads as 0, and an addition is appended, so without this a new
              // frame lands at the end of the file and the homepage only
              // features the top twelve. It would upload fine and be invisible.
              var patch = { src: url, label: v.label, alt: v.alt || '' };
              if (fit && fit.w && fit.h) { patch.w = fit.w; patch.h = fit.h; }
              await OTP.setSiteOverride('work', key, patch, { sort: -1 });
            },
            done: 'Up, at the front of the grid.'
          });
        }
      }
    });

    // ⛔ No THE HOUSE rail (Wave 2). Who is in, who wants a card, bans and
    // closes all live on the MEMBERS tab now (board-members.js): one members
    // manager, never two.

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

    // ⛔ No THIS IS US rail (10/11). The homepage section came out 8/27,
    // creators.json is empty, and the rail had no way to add to it.

    return R;
  }

  /* ============================ THE RUN, one date ======================= */

  var MON_UP = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function dateBits(r) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.on_date || ''));
    var when = m ? MON_UP[+m[2] - 1] + ' ' + (+m[3]) : '';
    var who = (r.profiles && r.profiles.display_name) || 'member';
    // 025. Whose night it is, when that is not the person who typed it in.
    // Resolved off the members list the board already loaded rather than
    // a second embed on every date.
    var cred = r.credited_to
      ? (DB.members || []).filter(function (mb) { return mb.id === r.credited_to; })[0] || null
      : null;
    // THE EXCHANGE. An unanswered ask is the most time-sensitive thing on
    // this whole board: the night happens whether or not anybody replied.
    var hx = r.house_status === 'shot' ? ' · shot'
           : r.house_status === 'on_list' ? ' · we are going'
           : r.want_house ? ' · ASKING FOR THE HOUSE' : '';
    return { when: when, who: who, cred: cred, hx: hx };
  }

  // One date's sheet. The rail opens it, and so does #run:<id> (boardDate()
  // links from the Crypt and /dates/ land here).
  function dateSheet(r) {
    var x = dateBits(r), when = x.when, who = x.who, cred = x.cred;
    sheet({
      title: r.title || 'DATE',
      why: when + ' · ' + (r.venue || '') + (r.city ? ' · ' + r.city : '') + ' · ' + who,
      fields: [
        { key: 'title', label: 'What it is', value: r.title || '' },
        { key: 'on_date', label: 'Date', type: 'date', value: r.on_date || '' },
        { key: 'venue', label: 'Venue', value: r.venue || '' },
        { key: 'city', label: 'City', value: r.city || '' },
        { key: 'link', label: 'Link', value: r.link || '', hint: 'https:// or blank' },
        { key: 'note', label: 'A line about it', type: 'textarea', rows: 3, value: r.note || '' },
        { key: 'published', label: 'On the Run', type: 'check', value: r.published !== false,
          hint: 'Untick to hide it: then it is not on /dates/, the Crypt or the Music lineup.' },
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
                'push first, then come back and point at it.' },
        // 025. A PICKER, not a text field, for the same reason the
        // /events/ folder above it is a picker: a typo here credits a
        // night to nobody and says nothing about it.
        { key: 'credit', label: 'Whose night is it', type: 'select',
          value: (cred && cred.card_slug) || '',
          options: [['', 'whoever put it up (' + who + ')']].concat(
            (DB.members || [])
              .filter(function (mb) { return mb.card_slug; })
              .map(function (mb) {
                return [mb.card_slug, mb.display_name || mb.card_slug];
              })),
          hint: 'Only changes whose page it lands on. It does NOT say they ' +
                'put it up, the byline still reads ' + who + '.' }
      ],
      save: async function (v) {
        await OTP.updateDate(r.id, {
          title: v.title, onDate: isoDay(v.on_date), venue: v.venue,
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
        // Its own call, its own column. house_status answers whether
        // the house is coming; this answers whose night it is.
        if ((v.credit || '') !== ((cred && cred.card_slug) || ''))
          await OTP.setDateCredit(r.id, v.credit);

        // THE EXCHANGE, the half that leaves the building. Only on a
        // CHANGE, so re-saving a sheet to fix a typo does not ask him
        // to send the same message twice.
        var was = r.house_status || 'none';
        if (v.house_status !== was &&
            (v.house_status === 'on_list' || v.house_status === 'shot')) {
          // ⛔ THE MESSAGE GOES TO WHOEVER THE NIGHT BELONGS TO, WHICH
          // AFTER 025 IS NOT ALWAYS WHO TYPED IT IN. The desk entered
          // every row on this calendar, so reading the recipient off
          // r.profiles would greet the desk by name and link the
          // desk's own page on the exact night a credit just moved it
          // to somebody else. Read the credit as it stands AFTER this
          // save, and fall back to the submitter when there is none.
          var toRow = (v.credit
            ? (DB.members || []).filter(function (mb) {
                return mb.card_slug === v.credit; })[0]
            : null) || null;
          var toName = (toRow && (toRow.display_name || toRow.card_slug)) || who;
          var slug = (toRow && toRow.card_slug) ||
                     (r.profiles && r.profiles.card_slug) || '';
          var mine = v.house_status === 'shot';
          var night = (v.title || r.title || 'your night') +
                      (when ? ', ' + when : '');
          // setTimeout so this lands AFTER sheet() shuts the one that
          // is still open behind it.
          setTimeout(function () {
            saidYes({
              title: mine ? 'THE FRAMES ARE UP' : 'THE HOUSE IS COMING',
              lines: mine
                ? ['You marked ' + (r.title || 'this night') + ' as shot.',
                   'They have no idea until you say so.']
                : ['You put the house on ' + (r.title || 'this night') + '.',
                   'It says so on /dates/ now. It does not say so to them.'],
              text: mine
                ? (toName !== 'member' ? toName + ', ' : '') + night +
                  ' is up. Every frame from the night: ' +
                  SITE + '/events/' + (v.event_slug || '') + '/' +
                  (slug ? '\n\nIt is on your page too: ' + SITE + '/c/' + slug + '/' : '')
                : (toName !== 'member' ? toName + ', ' : '') +
                  'the house is coming to ' + night +
                  '. We shoot it, and the frames come back with your name on them.' +
                  '\n\nIt is on the calendar now: ' + SITE + '/dates/',
              links: mine && v.event_slug
                ? [{ label: 'Open the dump', href: '../events/' + v.event_slug + '/', blank: true }]
                : [{ label: 'Open the calendar', href: '../dates/', blank: true }]
            });
          }, 0);
        }
      },
      kill: function () { return OTP.deleteDate(r.id); }
    });
  }

  /* ============================ stories =================================
     THE CATALOG's house stories are git pages (desk.json). A change to one is
     an overlay row in site_overrides 'desk', keyed by its link, holding only
     the fields that differ from the file (045's desk_shape check allows title,
     dek, kicker and shelf, and nothing else). Hidden is "pulled". */

  var SHELF_OPTS = [['', 'Follows the kicker'], ['nights', 'Nights'], ['guides', 'Guides'],
                    ['dates', 'Dates'], ['culture', 'Culture'], ['interviews', 'Interviews']];
  var KICKER_HINT = 'THE NIGHT, THE CRAFT, THE RUN, THE RECORD... A new kicker lands on Culture unless you pick a shelf.';
  var KICKER_OK = /^[A-Z0-9][A-Z0-9 &'.!?-]{1,23}$/;
  var KICKER_SAYS = 'A kicker is 2 to 24 capitals, numbers, spaces and & \' . ! ? -, like THE NIGHT.';
  // en and em dash, built from code points so no tool step can mangle them
  var DASHES = new RegExp('[' + String.fromCharCode(8211) + String.fromCharCode(8212) + ']', 'g');
  function kickerOf(v) {
    return String(v == null ? '' : v).replace(DASHES, '-').replace(/\s+/g, ' ').trim().toUpperCase();
  }
  function plainOf(v) {
    return String(v == null ? '' : v).replace(DASHES, ',').replace(/\s+/g, ' ').trim();
  }

  function storySheet(it) {
    var key = it.link, row = ovRow('desk', key), p = (row && row.patch) || {};
    var file = { title: it.title || '', dek: it.dek || '', kicker: it.kicker || '', shelf: it.shelf || '' };
    var cur = function (k) { return p[k] != null ? p[k] : file[k]; };
    var slug = (/^word\/([a-z0-9][a-z0-9-]*)\/$/.exec(String(key || '')) || [])[1] || '';
    sheet({
      title: cur('title') || 'STORY',
      why: 'a house story. Changes show at once; the laptop bakes them in.',
      art: it.thumb ? full(it.thumb) : '',
      body: '<div class="row links">' +
              '<a class="btn ghost sm" href="../' + esc(key) + '" target="_blank" rel="noopener">Read it</a>' +
              '<a class="btn ghost sm" href="../desk/word/' + (slug ? '?s=' + encodeURIComponent(slug) : '') +
                '">Fix the words inside</a>' +
            '</div>',
      fields: [
        { key: 'title', label: 'Title', value: cur('title') },
        { key: 'dek', label: 'Dek', type: 'textarea', rows: 3, value: cur('dek') },
        { key: 'kicker', label: 'Kicker', value: cur('kicker'), hint: KICKER_HINT },
        { key: 'shelf', label: 'Shelf', type: 'select', value: cur('shelf'), options: SHELF_OPTS },
        { key: 'pulled', label: 'Pull it', type: 'check', value: !!(row && row.hidden),
          hint: 'Off the Stories tab, the catalog and the timeline now. The words leave the page file at ' +
                'the next laptop bake. If it is private, run the bake today.' }
      ],
      // ⛔ ONLY WHAT DIFFERS FROM THE FILE. A field saved as the file already
      // has it would pin today's words over a later fix made in git.
      save: async function (v) {
        var want = { title: plainOf(v.title), dek: plainOf(v.dek), kicker: kickerOf(v.kicker), shelf: v.shelf || '' };
        var patch = {};
        Object.keys(want).forEach(function (k) { if (want[k] !== String(file[k] || '')) patch[k] = want[k]; });
        if ('title' in patch && (patch.title.length < 3 || patch.title.length > 80))
          throw new Error('A title is 3 to 80 characters.');
        if ('dek' in patch && (patch.dek.length < 3 || patch.dek.length > 200))
          throw new Error('A dek is 3 to 200 characters.');
        if ('kicker' in patch && !KICKER_OK.test(patch.kicker)) throw new Error(KICKER_SAYS);
        if ('shelf' in patch && patch.shelf && SHELF_OPTS.every(function (o) { return o[0] !== patch.shelf; }))
          throw new Error('Pick a shelf from the list.');
        if (!Object.keys(patch).length && !v.pulled) {
          if (row) await OTP.clearSiteOverride('desk', key);
          return;
        }
        await writeOv('desk', key, patch, { hidden: !!v.pulled });
      },
      done: 'Saved. Live now.',
      kill: row ? function () { return OTP.clearSiteOverride('desk', key); } : null,
      killLabel: 'Undo every change', killSure: 'Tap again: back to the file', killDone: 'Back to the file.'
    });
  }

  // ⛔ updateStory has no kicker or shelf (desk.js, 045). The desk is privileged
  // on member_stories and the guard normalises the kicker, so the board writes
  // those two columns itself, on a house row only. (Contract note filed.)
  async function houseShelf(id, kicker, shelf) {
    var k = kickerOf(kicker);
    if (k && !KICKER_OK.test(k)) throw new Error(KICKER_SAYS);
    var sh = shelf || null;
    if (sh && SHELF_OPTS.every(function (o) { return o[0] !== sh; })) throw new Error('Pick a shelf from the list.');
    var c = OTP.sb && OTP.sb();
    if (!c) throw new Error('Backend not configured yet.');
    var r = await c.from('member_stories').update({ kicker: k || null, shelf: sh }).eq('id', id).select('id');
    if (r.error) throw new Error(r.error.message || 'That did not save. Try again.');
    if (!r.data || !r.data.length) throw new Error('That one is already gone.');
  }

  // 045's decided_at: what is still WAITING on the desk. deskStories,
  // rotationAll and deskWord do not select it (contract note filed), so the
  // board asks for the ids itself. A read that fails is null: then a story is
  // never "new" and every unpublished pick or comment reads as waiting.
  async function undecided() {
    var c = OTP.sb && OTP.sb();
    if (!c) return {};
    var one = async function (table, published) {
      try {
        var r = await c.from(table).select('id').eq('published', published).is('decided_at', null).limit(500);
        if (r.error) return null;
        var set = {};
        (r.data || []).forEach(function (x) { set[String(x.id)] = 1; });
        return set;
      } catch (e) { return null; }
    };
    var got = await Promise.all([one('member_stories', true), one('rotation_tracks', false), one('word_entries', false)]);
    return { stories: got[0], tracks: got[1], entries: got[2] };
  }
  function waits(kind, r) {
    var u = DB.undecided && DB.undecided[kind];
    if (kind === 'stories') return !!(r.published && u && u[String(r.id)]);
    if (r.published) return false;
    return u ? !!u[String(r.id)] : true;
  }

  // THE WORD, one story. A member's or the house's own (call 12): fix the
  // words, swap or drop the cover, a house row's kicker and shelf, read it.
  // A story's page in content/desk.json, matched the way index.html drops a
  // database house row the catalog already has (its link, word/<slug>/).
  function catalogItem(slug) {
    if (!slug) return null;
    return ((C.desk && C.desk.items) || []).filter(function (x) {
      return x && String(x.link || '').replace(/^word\//, '').replace(/\/$/, '') === slug;
    })[0] || null;
  }

  function wordSheet(s) {
    var fresh = waits('stories', s);
    var who = (s.profiles && s.profiles.display_name) || 'a member';
    var read = s.baked ? '../word/' + encodeURIComponent(s.slug || '') + '/'
                       : '../word/live/?s=' + encodeURIComponent(s.slug || '');
    // ⛔ A STORY IN THE CATALOG SHOWS THE CATALOG'S KICKER AND SHELF. The
    // homepage drops the database row once desk.json has its slug, so a kicker
    // or shelf written here would save and change nothing anyone sees.
    var cat = catalogItem(s.slug);
    var shelfHere = !!s.house && !cat;
    var f = [
      { key: 'title', label: 'Title', value: s.title || '' },
      { key: 'dek', label: 'Dek', type: 'textarea', rows: 2, value: s.dek || '' }
    ];
    if (shelfHere) f.push(
      { key: 'kicker', label: 'Kicker', value: s.kicker || '', hint: KICKER_HINT },
      { key: 'shelf', label: 'Shelf', type: 'select', value: s.shelf || '', options: SHELF_OPTS });
    // Until it is baked the words are the database row, and this is where the
    // desk fixes them (the old /desk/ editor is gone). A baked one is a page in
    // git: desk/word/ edits that.
    if (!s.baked) f.push({ key: 'body', label: 'The words', type: 'textarea', rows: 10, value: s.body_md || '',
                          hint: 'markdown, as it was sent. One cover photo, no pictures inside.' });
    f.push({ key: 'cover', label: 'New cover', type: 'file', accept: 'image/*',
             hint: 'Their cover is swapped for this one. It shows on the Stories tab and their card page.' });
    if (s.cover_url) f.push({ key: 'nocover', label: 'Remove the cover', type: 'check', value: false });
    f.push({ key: 'published', label: 'Live on the page', type: 'check', value: !!s.published });
    if (!s.baked) f.push({ key: 'baked', label: 'Baked into git (the overlay lets go)', type: 'check', value: false });
    sheet({
      title: s.title || 'STORY',
      why: (s.house ? 'a house story' : 'by ' + who) + (s.published ? ' · live' : ' · pulled') +
           (s.baked ? ' · in the catalog' : '') + (fresh ? ' · new, not read yet' : ''),
      art: s.cover_url || '',
      body: '<div class="row links">' +
              '<a class="btn ghost sm" href="' + esc(read) + '" target="_blank" rel="noopener">Open it</a>' +
              (fresh ? '<button type="button" class="btn sm" data-read>Read it</button>' : '') +
              (s.baked ? '<a class="btn ghost sm" href="../desk/word/?s=' + encodeURIComponent(s.slug || '') +
                         '">Fix the words inside</a>' : '') +
              (cat ? '<button type="button" class="btn ghost sm" data-cat>Retitle, pull or reshelve it in THE CATALOG</button>' : '') +
            '</div>' +
            (cat ? '<div class="note">In the catalog now. Its title, dek, kicker and shelf on the Stories tab change in THE CATALOG.</div>' : ''),
      fields: f,
      mount: (fresh || cat) ? function (el, shut) {
        var c = el.querySelector('[data-cat]');
        if (c) c.onclick = function () { shut(); jump('catalog'); storySheet(cat); };
        var b = el.querySelector('[data-read]');
        if (b) b.onclick = async function () {
          b.disabled = true;
          try {
            await OTP.deskMarkRead('story', s.id);
            shut(); toast('Read. It is off your waiting list.'); refresh();
          } catch (e) { b.disabled = false; toast(e.message || String(e), true); }
        };
      } : null,
      save: async function (v, say) {
        var ch = {};
        if (v.title !== (s.title || '')) ch.title = v.title;
        if (v.dek !== (s.dek || '')) ch.dek = v.dek;
        if (!s.baked && v.body !== undefined && v.body !== (s.body_md || '')) ch.body = v.body;
        if (v.cover) {
          say('Fitting the cover…');
          var blob = await OTP.fitCardArt(v.cover, 1280, 720);
          say('Uploading the cover…');
          ch.coverUrl = await OTP.uploadImage(blob);
        } else if (v.nocover) ch.coverUrl = null;
        if (Object.keys(ch).length) { say('Saving…'); await OTP.updateStory(s.id, ch); }
        if (shelfHere && (kickerOf(v.kicker) !== (s.kicker || '') || (v.shelf || '') !== (s.shelf || '')))
          await houseShelf(s.id, v.kicker, v.shelf);
        if (!!v.published !== !!s.published) await OTP.setStoryPublished(s.id, v.published);
        if (v.baked && !s.baked) await OTP.setStoryBaked(s.id);
      },
      kill: function () { return OTP.deleteStory(s.id); }
    });
  }

  // The quiet no on a pick or a comment: it stays off, it leaves the waiting
  // count, and nobody is told (023's rule).
  function quietNo() {
    return '<div class="row links"><button type="button" class="btn ghost sm" data-no>No</button></div>' +
           '<div class="note">No keeps it off and takes it off your waiting count. They are never told.</div>';
  }
  function wireNo(el, shut, kind, id) {
    var b = el.querySelector('[data-no]');
    if (!b) return;
    twoTap(b, 'Tap again to say no', async function () {
      await OTP.deskMarkRead(kind, id);
      shut(); toast('Said no. They are not told.'); refresh();
    });
  }

  function entrySheet(e) {
    var fresh = waits('entries', e);
    var who = (e.profiles && e.profiles.display_name) || 'a member';
    sheet({
      title: 'COMMENT', why: 'under ' + (e.story_slug || 'a story') + ' · ' + who + (fresh ? ' · waiting on you' : ''),
      body: '<div class="note quote">' + esc(e.text || '') + '</div>' + (fresh ? quietNo() : ''),
      fields: [{ key: 'published', label: 'Showing under the story', type: 'check', value: !!e.published }],
      mount: fresh ? function (el, shut) { wireNo(el, shut, 'story_comment', e.id); } : null,
      save: async function (v) { if (!!v.published !== !!e.published) await OTP.setEntryPublished(e.id, v.published); },
      kill: function () { return OTP.deleteEntry(e.id); }
    });
  }

  /* ============================ the roster ============================== */

  function lowSlug(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function slugOf(v) {
    var s = lowSlug(v);
    try { s = s.normalize('NFKD'); } catch (e) {}
    return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function tightOf(v) { return lowSlug(v).replace(/[^a-z0-9]/g, ''); }
  // A house seat's database card: by its card_slug, then its name, the same
  // order peopleMerge matches in.
  function cardFor(it) {
    var rows = DB.cards || [];
    var own = lowSlug(it.card_slug), sl = slugOf(it.name), ti = tightOf(it.name);
    var by = function (fn) { return rows.filter(function (rw) { return rw && rw.card_slug && fn(rw); })[0] || null; };
    return (own && by(function (rw) { return lowSlug(rw.card_slug) === own; })) ||
           (sl && by(function (rw) { return lowSlug(rw.card_slug) === sl; })) ||
           (ti && by(function (rw) { return tightOf(rw.card_slug) === ti; })) || null;
  }
  // dark_seats(): a holder banned, closed or demoted. An older seat with no
  // card_slug goes by its name, as peopleMerge does.
  function isDark(slug, it) {
    var dk = (DB.dark || []).map(lowSlug);
    if (slug && dk.indexOf(lowSlug(slug)) >= 0) return true;
    if (!it || it.card_slug) return false;
    var sl = slugOf(it.name), ti = tightOf(it.name);
    return dk.indexOf(sl) >= 0 || dk.some(function (s) { return tightOf(s) === ti; });
  }
  function personFor(slug) {
    var s = lowSlug(slug);
    return s ? (DB.people || []).filter(function (p) { return lowSlug(p.card_slug) === s; })[0] || null : null;
  }
  function songUrl(v) {
    var t = OTP.readTrack(v);
    return t.id ? 'https://open.spotify.com/track/' + t.id : '';
  }
  var DB_SONG_HINT = 'Their song. It plays on their card and their page in the Crypt. They can change it on /card/ or in the Crypt.';
  var START_HINT = 'Anyone not logged into Spotify only gets the 30 second preview, so past 0:30 does nothing for them.';
  var DARK_LINE = 'Their card is out (banned, closed or taken back), so this seat stays off the site.';
  var TAKE_DARK = 'Their account is banned, closed or no longer in, so nobody else sees this post. It comes back when their account does.';

  // The song fields for a card holder, and the one write behind them. Checked
  // before anything else saves, so a bad link never half-saves a sheet.
  function dbSongFields(rw) {
    return [
      { key: 'song', label: 'Opening song', type: 'song', value: rw.theme_song ? songUrl(rw.theme_song) : '', hint: DB_SONG_HINT },
      { key: 'start', label: 'Start at (seconds)', value: rw.theme_start || '', hint: START_HINT }
    ];
  }
  function dbSongCheck(val) {
    var raw = String(val.song || '').trim(), t = OTP.readTrack(raw);
    if (raw && !t.id) throw new Error(t.why || 'That is not a Spotify track link.');
  }
  async function dbSongSave(rw, who, val, say) {
    var was = rw.theme_song ? songUrl(rw.theme_song) : '';
    var st = parseInt(String(val.start || '').trim(), 10);
    var stWas = parseInt(String(rw.theme_start || '').trim(), 10) || 0;
    if (songUrl(val.song) === was && ((isFinite(st) && st > 0) ? st : 0) === stWas) return;
    say('Setting their song…');
    await OTP.setMemberSong(who.id, { song: String(val.song || '').trim(), start: val.start });
  }
  function holderLinks(slug, who) {
    return '<div class="row links">' +
             '<a class="btn ghost sm" href="../c/?s=' + encodeURIComponent(slug) + '" target="_blank" rel="noopener">Their card page</a>' +
             (who ? '<button type="button" class="btn ghost sm" data-person>Open them under Members</button>' : '') +
           '</div>';
  }
  function wirePerson(el, shut, who) {
    var b = el.querySelector('[data-person]');
    if (!b || !who) return;
    b.onclick = function () {
      shut();
      openPerson(who.sid || who.id);
    };
  }

  // One house seat. House art and lore are the overlay's; a seat with a card in
  // the database reads and saves the holder's song there instead.
  function seatSheet(it, k, rw, dark) {
    var p = ovPatch('roster', k), row = ovRow('roster', k);
    var slug = (rw && rw.card_slug) || it.card_slug || '';
    var who = rw ? personFor(rw.card_slug) : null;
    var body = (dark ? '<div class="note warn">' + esc(DARK_LINE) + '</div>' : '');
    var f = [];
    if (rw) {
      body += '<div class="note">Held by <b>' + esc(rw.display_name || slug) + '</b>. Their name, photo, song ' +
              'and links come from the database.</div>' + holderLinks(slug, who);
      if (who) f = f.concat(dbSongFields(rw));
      else body += '<div class="note">Their song is theirs to set on /card/ or in the Crypt.</div>';
    } else {
      f.push(
        { key: 'theme_song', label: 'Opening song', type: 'song',
          value: p.theme_song != null ? p.theme_song : (it.theme_song || ''),
          hint: 'Plays when somebody opens the card. Empty means no song. ' +
                'Once somebody holds this card, their own song wins over this.' },
        { key: 'theme_start', label: 'Start at (seconds)',
          value: p.theme_start != null ? p.theme_start : (it.theme_start || ''), hint: START_HINT });
    }
    f.push(
      { key: 'flavor', label: 'Flavor line', value: p.flavor != null ? p.flavor : (it.flavor || '') },
      { key: 'lore', label: 'Lore', type: 'textarea', rows: 7, value: p.lore != null ? p.lore : (it.lore || '') },
      { key: 'pending_stamp', label: 'Stamp', value: p.pending_stamp != null ? p.pending_stamp : (it.pending_stamp || '') },
      { key: 'hidden', label: 'Hide from the roster', type: 'check', value: !!(row && row.hidden) });
    sheet({
      title: it.name, why: (dark ? 'dark · ' : '') + (it.rarity || '') + ' · hp ' + (it.hp || ''),
      art: full(it.photo),
      body: body,
      fields: f,
      mount: function (el, shut) { wirePerson(el, shut, who); },
      save: async function (val, say) {
        if (rw && who) dbSongCheck(val);
        // setSiteOverride replaces the patch: keep any other key the row carries,
        // and add only what this save changed (a song-only save writes no row).
        var patch = Object.assign({}, p);
        ['flavor', 'lore', 'pending_stamp'].forEach(function (kk) {
          var was = p[kk] != null ? p[kk] : (it[kk] || '');
          if (val[kk] !== undefined && val[kk] !== String(was)) patch[kk] = val[kk];
        });
        if (!rw && val.theme_song !== undefined) {
          var raw = String(val.theme_song || '').trim();
          var t = OTP.readTrack(raw);
          // ⛔ Refuse rather than write a link the card cannot play.
          // Clearing the box on purpose still clears the song.
          if (raw && !t.id) throw new Error(t.why || 'That is not a Spotify track link.');
          // Store the canonical URL, not whatever shape got pasted, so
          // roster.json ends up holding one format after bake.py folds it in.
          var song = t.id ? 'https://open.spotify.com/track/' + t.id : '';
          var st = parseInt(String(val.theme_start || '').trim(), 10);
          st = (isFinite(st) && st > 0) ? st : 0;
          var songWas = songUrl(p.theme_song != null ? p.theme_song : it.theme_song);
          var stWas = parseInt(String(p.theme_start != null ? p.theme_start : (it.theme_start || '')), 10) || 0;
          if (song !== songWas || st !== stWas) { patch.theme_song = song; patch.theme_start = st; }
        }
        if (JSON.stringify(patch) !== JSON.stringify(p) || !!val.hidden !== !!(row && row.hidden))
          await writeOv('roster', k, patch, { hidden: !!val.hidden });
        if (rw && who) await dbSongSave(rw, who, val, say);
      }
    });
  }

  // A card holder with no house seat: their own art, their song, and the one
  // house switch, off the roster (an overlay row keyed 'c:<slug>').
  function holderSheet(rw, dark) {
    var key = 'c:' + rw.card_slug, row = ovRow('roster', key);
    var who = personFor(rw.card_slug);
    var f = who ? dbSongFields(rw) : [];
    f.push({ key: 'hidden', label: 'Hide from the roster', type: 'check', value: !!(row && row.hidden),
             hint: 'Off the pack, the binder and the Music card holders. Their card page stays up.' });
    sheet({
      title: rw.display_name || rw.card_slug, why: 'card holder · their own art',
      art: rw.card_photo || '',
      body: (dark ? '<div class="note warn">' + esc(DARK_LINE) + '</div>' : '') + holderLinks(rw.card_slug, who) +
            (who ? '' : '<div class="note">Their song is theirs to set on /card/ or in the Crypt.</div>'),
      fields: f,
      mount: function (el, shut) { wirePerson(el, shut, who); },
      save: async function (val, say) {
        if (who) dbSongCheck(val);
        if (!!val.hidden !== !!(row && row.hidden)) {
          if (val.hidden || (row && Object.keys(row.patch || {}).length)) await writeOv('roster', key, {}, { hidden: !!val.hidden });
          else await OTP.clearSiteOverride('roster', key);
        }
        if (who) await dbSongSave(rw, who, val, say);
      }
    });
  }

  // rotation.json's seeds, plus the songs added from here: an overlay row no
  // seed claims, carrying its own Spotify link (index.html adds the same rows).
  function rotationItems() {
    var items = ((C.rotation && C.rotation.items) || []).slice();
    var have = {};
    items.forEach(function (it) { var k = spot(it.link); if (k) have[k] = 1; });
    Object.keys(OV.rotation || {}).forEach(function (k) {
      var p = ovPatch('rotation', k);
      if (!have[k] && spot(p.link) === k)
        items.push({ link: p.link, title: p.title, artist: p.artist, art: p.art, _added: k });
    });
    return items;
  }
  // The songs actually on the grid, by track id: a seed plays its swap's link
  // when it has one, and nothing taken off counts.
  function rotationShowing() {
    var on = {};
    rotationItems().forEach(function (it) {
      var k = it._added || spot(it.link), row = ovRow('rotation', k);
      if (!k || (row && row.hidden)) return;
      var id = it._added ? k : (spot(row && row.patch && row.patch.link) || k);
      on[id] = 1;
    });
    return on;
  }

  /* ============================ THE NIGHTS ==============================
     Call 15: a photo comes down by its NAME (its file stem, 017), never by
     its place in the lightbox, so nobody else's tag moves. The board takes
     the tags off now; takedown.py takes the file off later, on the laptop. */

  var NIGHT_OK = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,80}$/;
  function nightName(slug) {
    var e = (EV.items || []).filter(function (x) { return x.slug === slug; })[0];
    return e ? (e.venue || e.title || slug) : slug;
  }
  function nightStems(data) {
    return ((data && data.media) || []).map(function (m) {
      return (w.OTP && OTP.frameName && OTP.frameName(m && m.thumb)) || '';
    });
  }
  // Still up: not marked gone, and still in its night's data.json when that
  // has been read (takedown.py takes it out before anybody marks it).
  function onNight(t) {
    if (t.files_gone_at) return false;
    var n = NIGHTS[t.event_slug];
    if (!n || !n.data) return true;
    return nightStems(n.data).indexOf(t.media) >= 0;
  }
  async function nightData(slug, fresh) {
    if (!NIGHT_OK.test(String(slug || ''))) return null;
    var n = NIGHTS[slug];
    if (n && n.data && !fresh) return n.data;
    try {
      var r = await fetch('../events/' + slug + '/data.json', { cache: 'no-cache' });
      var j = r.ok ? await r.json() : null;
      NIGHTS[slug] = { data: j && Array.isArray(j.media) ? j : null };
    } catch (e) { NIGHTS[slug] = { data: null }; }
    return NIGHTS[slug].data;
  }
  // '017', 'media/017_t.jpg' and the number under the photo (17) all land on
  // the same photo. A name wins over a number: after one takedown the numbers
  // shift and the names never do.
  function findFrame(data, which) {
    var media = (data && data.media) || [];
    var stems = nightStems(data);
    var q = String(which || '').trim().toLowerCase()
      .replace(/^(?:photo|frame|no\.?|#)\s*/, '')
      .replace(/^.*\//, '')
      .replace(/(?:_t|_full)?\.(?:jpe?g|png|webp|gif|mp4|mov|webm)$/, '');
    if (!q) return null;
    var k = stems.indexOf(q);
    if (k < 0 && /^\d{1,4}$/.test(q)) {
      var n = parseInt(q, 10);
      if (n >= 1 && n <= media.length) k = n - 1;
    }
    if (k < 0 || !stems[k]) return null;
    return { k: k, stem: stems[k], n: k + 1, of: media.length };
  }

  function nightSheet(e) {
    var downs = (DB.takedowns || []).filter(function (t) { return t.event_slug === e.slug; });
    sheet({
      title: e.venue || e.title || e.slug,
      why: (e.date_short || e.date || '') + ' · ' + (e.count | 0) + ' frames',
      art: e.cover ? '../events/' + e.cover : '',
      body: '<div class="row links"><a class="btn ghost sm" href="../events/' + esc(e.slug) +
            '/" target="_blank" rel="noopener">Open the night</a></div>' +
            (downs.length ? '<div class="note">' + downs.length + ' taken down on this night so far. ' +
                            'They are on THE TAKEDOWNS.</div>' : ''),
      fields: [
        { key: 'which', label: 'Take a photo down',
          hint: 'The number under the photo, or its file name (017). Its tags come off now. ' +
                'The photo stays up until takedown.py runs on the laptop.' },
        { key: 'why', label: 'Why (only you see this)' }
      ],
      saveLabel: 'Find it',
      save: async function (v, say) {
        if (!String(v.which || '').trim()) throw new Error('Put in the number under the photo, or its file name.');
        say('Reading the night…');
        var data = await nightData(e.slug, true);
        if (!data) throw new Error('Could not read that night. Try again in a minute.');
        var hit = findFrame(data, v.which);
        if (!hit) throw new Error('No photo by that number or name on this night.');
        // after sheet() shuts this one
        setTimeout(function () { confirmDown(e, hit, v.why); }, 0);
      },
      done: false, refresh: false
    });
  }

  function confirmDown(e, hit, why) {
    sheet({
      title: 'TAKE IT DOWN',
      why: 'Photo ' + hit.stem + ', number ' + hit.n + ' of ' + hit.of,
      img: OTP.frameThumb(e.slug, hit.stem, '../'),
      body: '<div class="note">' + esc(e.venue || e.title || e.slug) + ' · ' + esc(e.date_short || e.date || '') +
            '. The tags come off now, so nobody is named on it. The photo itself stays up until ' +
            'takedown.py runs on the laptop.</div>',
      saveLabel: 'Take it down',
      save: async function (v, say) {
        say('Taking the tags off…');
        var n = await OTP.takeFrameDown(e.slug, hit.stem, hit.k, why);
        setTimeout(function () {
          saidYes({
            title: 'THE TAGS ARE OFF', why: 'the file is a laptop job',
            lines: ['Nobody is named on it any more.' + (n ? ' ' + n + ' tag' + (n > 1 ? 's' : '') + ' came off.' : ''),
                    'The photo stays up on the night until this runs. Until then, Undo is on THE TAKEDOWNS.'],
            text: '/usr/bin/python3 takedown.py ' + e.slug + ' --stem ' + hit.stem,
            copyLabel: 'Copy the command'
          });
        }, 0);
        return n;
      },
      done: false
    });
  }

  function takedownSheet(t) {
    var up = onNight(t);
    var cmd = '/usr/bin/python3 takedown.py ' + t.event_slug + ' --stem ' + t.media;
    var h = sheet({
      title: 'PHOTO ' + t.media,
      why: nightName(t.event_slug) + ' · ' + (up ? 'tags off: ' + (t.tags_off | 0) + ' · still up on the night' : 'gone'),
      img: up ? OTP.frameThumb(t.event_slug, t.media, '../') : '',
      body: (t.note ? '<div class="note">Why: ' + esc(t.note) + '</div>' : '') +
            '<div class="note">Taken down ' + esc(monD(t.created_at)) + (t.by_name ? ' by ' + esc(t.by_name) : '') + '.' +
              (t.files_gone_at ? ' The file came off ' + esc(monD(t.files_gone_at)) + '.' : '') + '</div>' +
            (up ? '<div class="note">On the laptop, this takes the file off the night:</div>' +
                  '<textarea class="tell-copy" rows="2" readonly>' + esc(cmd) + '</textarea>' +
                  '<div class="row links"><button type="button" class="btn ghost sm" data-undo>Undo</button>' +
                  '<a class="btn ghost sm" href="' + esc(OTP.frameLink(t.event_slug, t.media, '../')) +
                  '" target="_blank" rel="noopener">See it on the night</a></div>' +
                  '<div class="note">Undo puts the tags back. It works until the file comes off.</div>'
                : '')
    });
    if (!up) return;
    twoTap(h.el.querySelector('[data-undo]'), 'Tap again: tags back on', async function () {
      var n = await OTP.undoFrameDown(t.event_slug, t.media);
      h.shut();
      toast(n ? 'Put back. ' + n + ' tag' + (n > 1 ? 's' : '') + ' back on.' : 'Put back.');
      refresh();
    });
  }

  /* ============================ posting ================================= */

  // opts.roll ticks Members only. Call 1: a post on the Roll is members only
  // and needs a photo; the Take is everyone. post() always says which.
  function postSheet(opts) {
    var roll = !!(opts && opts.roll === true);
    sheet({
      title: roll ? 'POST TO THE ROLL' : 'POST', why: 'straight up, no approval',
      fields: [
        { key: 'text', label: 'What is it', type: 'textarea', rows: 6 },
        { key: 'file', label: 'Photo or clip' + (roll ? '' : ' (optional)'), type: 'file', accept: 'image/*,video/*',
          hint: 'up to 50MB' },
        { key: 'alt', label: 'Alt text', hint: 'what is in the frame, for anyone who cannot see it' },
        { key: 'roll', label: 'Members only', type: 'check', value: roll, hint: 'goes on the Roll, needs a photo' }
      ],
      saveLabel: 'Put it up',
      save: async function (v, say) {
        if (v.roll && !v.file) throw new Error('The Roll needs a photo.');
        if (!v.text && !v.file) throw new Error('Say something or bring a photo.');
        var url = null;
        if (v.file) { say('Uploading…'); url = await OTP.uploadImage(v.file); }
        say('Posting…');
        await OTP.post({ text: v.text || '', imageUrl: url, imageAlt: v.alt || '', membersOnly: !!v.roll });
        return !!v.roll;
      },
      done: function (onRoll) { return onRoll ? 'Posted to the Roll.' : 'Posted.'; }
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
      // No route line: the hero lost it on 8/26, and the field saved into
      // nothing (10/11).
      ['THE BANNER', 'the first lines anybody reads', [
        { k: 'kicker', l: 'Kicker' },
        { k: 'pulse_line_1', l: 'Headline, first line' },
        { k: 'pulse_line_2', l: 'Headline, blue line' }
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
      { k: 'pitch.btn2_label', l: 'Second button, big text' },
      { k: 'pitch.btn2_sub', l: 'Second button, small text' },
      // ⛔ Different rule from btn_href on purpose. safeUrl() refuses a mailto:,
      // so the page checks this one against a mailto test instead. An https link
      // typed here will be dropped, not painted.
      { k: 'pitch.btn2_href', l: 'Second button link', hint: 'mailto: only, the page refuses anything else' },
      { k: 'pitch.fine', l: 'The fine print', t: 'area' }
    ]]);
    // The boxes beside the page. The Rooms is his list in his words (call 13);
    // stored like the ticker, one line per room.
    g.push(['THE SIDEBAR', 'the boxes beside the page', [
      { k: 'rooms_box', l: 'The Rooms', t: 'ticker',
        hint: 'one room per line: NAME · a few words. Your list, your words.' },
      { k: 'rooms_box_sub', l: 'The Rooms, the line under it' }
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
              hint: f.hint || (f.t === 'ticker' ? 'one headline per line, or separate them with |' : '')
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
    var M = function (filter) { return function () { setView('members', filter ? { filter: filter } : {}); }; };
    var Q = function (kind) { return function () { openQueue(kind); }; };
    var J = function (key) { return function () { jump(key); }; };
    return [
      ['PUT SOMETHING UP', [
        ['Post to the take, photo or clip or text', 'here', function () { postSheet(); }],
        ['Post to the Roll, members only', 'here', function () { postSheet({ roll: true }); }],
        ['Pull or feature a member video', 'here', J('videos')],
        ['Put a song on rotation', 'here', J('music')],
        ['Add a date to the Run', 'here', J('run')],
        ['Write a house story', 'away', '../word/new/?house=1'],
        ['Build or change your own card', 'away', '../card/'],
        ['Every post you made', 'away', '../compose/'],
        ['Publish a new night', 'cold', 'newevent.py on the laptop, then push']
      ]],
      ['CHANGE THE PAGE', [
        ['The kicker, one liner, ticker and house quote', 'here', J('voice')],
        ['The slate: what is out next', 'here', J('slate')],
        ['Captions and alt text on the work', 'here', J('work')],
        ['Reorder the work, the roster, the rotation', 'here', J('work')],
        ['Roster lore, flavor and stamps', 'here', J('roster')],
        ['Swap any song on the grid', 'here', J('music')],
        ["Set next week's battle", 'here', battleSheet],
        ['Hide any frame, card, song or post', 'here', J('work')],
        ['Edit the seeds in the take', 'here', J('take')],
        ['The banner: kicker and headline', 'here', J('voice')],
        ['Social links and every mic check field', 'here', J('voice')],
        ['The Rooms box in the sidebar', 'here', J('voice')],
        ['Any numbered release in the catalog', 'here', J('catalog')],
        ['Pull, retitle or reshelve a story', 'here', J('catalog')],
        ['The one liner that search sees', 'cold', 'edit here, then bake and push'],
        ['Pitch Us and Why blocks', 'here', J('voice')],
        ['Add a new work frame', 'here', J('work')]
      ]],
      ['DECIDE WHAT STAYS UP', [
        ['Make someone a card holder', 'here', M('asks')],
        ['Say no to a card ask', 'here', M('asks')],
        ['Hand out or take back a card', 'here', M()],
        ['Ban or unban anyone, unban puts it all back', 'here', M()],
        ['Close or open an account', 'here', M()],
        ['Rename someone or fix their @', 'here', M()],
        ['Clear a bad photo, link or page', 'here', M()],
        ['See everything one person made', 'here', M()],
        ["Write or fix any member's tagline and bio", 'here', M()],
        ["Open any card holder's page", 'here', M()],
        ['How someone gets a card', 'cold', 'joins the Crypt and picks their card under Kin'],
        ['Packs and rooms waiting', 'here', function () {
          openQueue(DB.waiting && !(+DB.waiting.packs) && +DB.waiting.rooms ? 'rooms' : 'packs');
        }],
        ['Flyer sources', 'here', Q('sources')],
        ['Reports', 'here', Q('reports')],
        ['Take a photo down', 'here', J('nights')],
        ['Fix a Crypt flyer: open it in the Crypt, the desk box sits under the buttons', 'away', '../wall/'],
        ['Pull or pin any post', 'here', J('take')],
        ['Pull, feature or delete a member video (they go up on their own)', 'here', J('videos')],
        ['Publish or delete a track', 'here', J('music')],
        ["Pull or fix anyone's date", 'here', J('run')],
        ['Answer a member asking for the house', 'here', J('run')],
        ['Point a night you shot at its dump', 'here', J('run')],
        ['Publish, bake or delete a story', 'here', J('word')],
        ['Edit a member story body', 'here', J('word')],
        ['Edit a house or baked story body', 'away', '../desk/word/'],
        ['Clear photos with no post left', 'here', drainNow]
      ]],
      ['THE REST OF THE HOUSE', [
        ['Your own page', 'away', '../my/'],
        ['Fold every phone edit into git', 'cold', '/usr/bin/python3 bake.py, then push'],
        ['Sign out', 'here', signOutNow]
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

  // A rail on THE PAGE. From MEMBERS it switches tabs first.
  function jump(key) {
    if (VIEW !== 'page') setView('page');
    var el = $('r-' + key) || $('b-' + key);
    // every open sheet goes (a person's sheet can sit over a queue sheet), not only the first
    Array.prototype.forEach.call(d.querySelectorAll('.sh-back'), function (back) { back.remove(); });
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // The Members tab's own sheets (board-members.js). Loaded after this file,
  // so it is looked up at the moment it is needed.
  function members() { return w.BOARD_MEMBERS && typeof w.BOARD_MEMBERS === 'object' ? w.BOARD_MEMBERS : null; }
  function openQueue(kind) {
    var m = members();
    if (!m || typeof m.openQueue !== 'function') { toast('The members list did not load. Reload the page.', true); return; }
    m.openQueue(kind);
  }
  // One person's sheet. BOARD.openPerson(key), a board button and the address
  // (#members/<key>, which routeHash reads and then drops) all land here, so it
  // opens exactly once, every time. The key is checked first and never echoed.
  function openPerson(key) {
    var k = String(key == null ? '' : key).toLowerCase();
    if (VIEW !== 'members') setView('members');
    if (!(SID_OK.test(k) || UUID_OK.test(k))) { toast('Nobody by that link.', true); return; }
    showPerson(k);
  }
  function showPerson(key) {
    var m = members();
    if (!m || typeof m.openPerson !== 'function') { toast('The members list did not load. Reload the page.', true); return; }
    m.openPerson(key);
  }

  function signOutNow() {
    var b = $('signout');
    if (b) b.disabled = true;
    Promise.resolve().then(function () { return OTP.signOut(); })
      .catch(function () {})
      .then(function () { location.href = '../join/'; });
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
     and it says so in one line rather than showing four zeroes.
     Wave 2: ONE count, desk_waiting (the same number as the homepage's Desk
     key), one chip per queue that has anything in it. The cool chips are the
     laptop's: stray photos, edits not in git yet, and the Music tab. */

  function plural(n, one, many) { return n === 1 ? one : many; }

  function nowChips() {
    var chips = [];
    var wt = DB.waiting;
    var page = function (key) { return function () { jump(key); }; };
    var queue = function (kind) { return function () { openQueue(kind); }; };
    if (wt) {
      [
        ['asks', 'wants a card', 'want a card', function () { setView('members', { filter: 'asks' }); }],
        ['packs', 'pack waiting', 'packs waiting', queue('packs')],
        ['rooms', 'room waiting', 'rooms waiting', queue('rooms')],
        ['sources', 'flyer source', 'flyer sources', queue('sources')],
        ['reports', 'report', 'reports', queue('reports')],
        ['picks', 'pick waiting', 'picks waiting', page('music')],
        ['comments', 'comment waiting', 'comments waiting', page('word')],
        ['stories', 'new story to read', 'new stories to read', page('word')],
        ['house', 'asking for the house', 'asking for the house', page('run')],
        ['photos_up', 'photo still up', 'photos still up', page('takedowns')]
      ].forEach(function (q) {
        var n = +wt[q[0]] || 0;
        if (n > 0) chips.push({ key: q[0], n: n, label: plural(n, q[1], q[2]), go: q[3] });
      });
    }
    var orph = (DB.orphans || []).length;
    if (orph) chips.push({ key: 'orphans', n: orph, label: plural(orph, 'stray photo', 'stray photos'), go: strayPhotos, cool: true });
    var edits = 0;
    Object.keys(OV).forEach(function (s) { edits += Object.keys(OV[s]).length; });
    edits += Object.keys(SEED).length;
    if (edits) chips.push({ key: 'edits', n: edits, label: plural(edits, 'edit not in git yet', 'edits not in git yet'), go: notInGit, cool: true });
    return chips.concat(musicChips());
  }

  function nowEl() {
    var box = d.createElement('div');
    box.className = 'now';
    var chips = nowChips();
    if (!chips.length) {
      var q = d.createElement('div');
      q.className = 'now-quiet';
      q.textContent = DB.waiting ? 'nothing waiting. the house is clean.' : 'checking what is waiting…';
      return q;
    }
    chips.forEach(function (c) {
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'nowchip' + (c.cool ? ' cool' : '');
      b.dataset.now = c.key;
      b.innerHTML = '<b>' + esc(c.n) + '</b><span>' + esc(c.label) + '</span>';
      b.onclick = c.go;
      box.appendChild(b);
    });
    return box;
  }

  // Photos whose post went away: the database queued them and the sweep could
  // not take them off storage yet. Ported from the old /desk/ (Wave 2).
  function strayPhotos() {
    var rows = DB.orphans || [];
    sheet({
      title: 'STRAY PHOTOS', why: 'files whose post is gone, still in storage',
      body: '<div class="note">These should have gone when their post did. Sweep again takes each one off ' +
            'storage. One that will not go stays here, with the reason.</div>' +
            '<div class="list">' + rows.map(function (o) {
              return '<div class="li"><b>' + esc(o.object_name) + '</b><span>' + esc(o.reason || 'no reason recorded') + '</span></div>';
            }).join('') + '</div>',
      saveLabel: 'Sweep again',
      save: async function (v, say) { say('Sweeping…'); return await OTP.drainOrphans(); },
      done: function (r) {
        r = r || {};
        return 'Cleared ' + (r.cleared || 0) + '.' + (r.stuck ? ' ' + r.stuck + ' would not go.' : '');
      }
    });
  }

  // Every phone edit still living only in the overlay, each with its own way
  // back to the committed file. Ported from the old /desk/ (Wave 2).
  function notInGit() {
    var rows = [];
    Object.keys(OV).forEach(function (s) { Object.keys(OV[s]).forEach(function (k) { rows.push(OV[s][k]); }); });
    rows.sort(function (a, b) { return String(b.updated_at || '').localeCompare(String(a.updated_at || '')); });
    var seeds = Object.keys(SEED).map(function (k) { return SEED[k]; });
    var n = rows.length + seeds.length;
    sheet({
      title: 'NOT IN GIT YET', tall: true,
      why: n + ' phone edit' + (n === 1 ? '' : 's') + ' live in the database',
      body: '<div class="note">Every edit you make from a phone lands in the overlay first, which is why it ' +
            'shows on the site straight away without a push. When you are next at the laptop:</div>' +
            '<textarea class="tell-copy" rows="2" readonly>/usr/bin/python3 bake.py\ngit add -A &amp;&amp; git commit &amp;&amp; git push</textarea>' +
            '<div class="note">bake.py folds them into content/*.json and says which rows went redundant. ' +
            'Back to the file drops one edit now, and the committed file shows again.</div>' +
            '<div class="list">' +
              rows.map(function (o, i) {
                var what = o.hidden ? 'hidden' : (Object.keys(o.patch || {}).join(', ') || 'order only');
                return '<div class="li" data-ov="' + i + '"><b>' + esc(o.section) + ' · ' + esc(o.item_key || '(whole section)') +
                       '</b><span>' + esc(what) + (o.updated_at ? ' · ' + esc(monD(o.updated_at)) : '') + '</span>' +
                       '<button type="button" class="btn ghost sm" data-back>Back to the file</button></div>';
              }).join('') +
              seeds.map(function (o, i) {
                return '<div class="li" data-seed="' + i + '"><b>a seed in the take</b><span>' +
                       (o.hidden ? 'hidden' : 'rewritten') + '</span>' +
                       '<button type="button" class="btn ghost sm" data-back>Back to the file</button></div>';
              }).join('') +
            '</div>',
      mount: function (el) {
        el.querySelectorAll('[data-ov]').forEach(function (li) {
          var o = rows[+li.dataset.ov];
          twoTap(li.querySelector('[data-back]'), 'Tap again: drop this edit', async function () {
            await OTP.clearSiteOverride(o.section, o.item_key || '');
            li.remove(); toast('Back to the file.'); refresh();
          });
        });
        el.querySelectorAll('[data-seed]').forEach(function (li) {
          var o = seeds[+li.dataset.seed];
          twoTap(li.querySelector('[data-back]'), 'Tap again: drop this edit', async function () {
            await OTP.clearSeedOverride(o.key);
            li.remove(); toast('Back to the file.'); refresh();
          });
        });
      }
    });
  }

  /* ---- THE MUSIC TAB's laptop jobs (call 11). The battle runs Monday to
     Sunday on the San Antonio clock; from its Sunday on, next week's wants
     setting. The lineup and the drops want topping up three weeks out, the
     same line build_music.py warns at. ---- */
  var MUSIC_SOON = 21;
  var MUSIC_CMD = '/usr/bin/python3 _build/music/build_music.py';

  function musicChips() {
    var M = C.music || {}, out = [], today = dayIn();
    var mon = M.battle && weekMonday(M.battle.id);
    if (mon && today >= dayAdd(mon, 6))
      out.push({ key: 'battle', n: '♫', label: 'battle needs next week', go: battleSheet, cool: true });
    [['lineup', 'lineup', 'runs out', 'ran out'], ['drops', 'drops', 'run out', 'ran out']].forEach(function (q) {
      var rows = Array.isArray(M[q[0]]) ? M[q[0]] : null;
      if (!rows) return;
      var last = rows.reduce(function (m, r) {
        var x = /^\d{4}-\d{2}-\d{2}/.test(String((r && r.date) || '')) ? String(r.date).slice(0, 10) : '';
        return x > m ? x : m;
      }, '');
      var left = last ? dayDiff(today, last) : -1;
      if (last && left >= MUSIC_SOON) return;
      out.push({
        key: q[0], n: '♫', cool: true,
        label: !last ? q[1] + ' is empty' : q[1] + ' ' + (left < 0 ? q[3] : q[2]) + ' ' + monD(last),
        go: function () { listSheet(q[0], last); }
      });
    });
    return out;
  }

  function battleSheet() {
    var M = C.music || {}, b = M.battle || {}, a = b.a || {}, bb = b.b || {};
    var today = dayIn(), mon = weekMonday(b.id), sun = mon ? dayAdd(mon, 6) : '';
    // From its Sunday, the week after; once it is over, this week (build_music.py
    // takes the current week, never one already over).
    var next = !mon ? weekOf(today) : today <= sun ? weekOf(dayAdd(mon, 7)) : weekOf(today);
    var lines = [];
    if (mon) lines.push('This week: ' + (a.title || '?') + ' (' + (a.artist || '?') + ') vs ' +
                        (bb.title || '?') + ' (' + (bb.artist || '?') + '). Voting ' +
                        (today > sun ? 'closed' : 'closes') + ' Sun ' + monD(sun) + '.');
    var win = (M.winners || [])[0];
    if (win) {
      var same = (M.winners || []).filter(function (x) { return x.battle === win.battle; });
      var v = Array.isArray(win.votes) ? win.votes.map(function (x) { return +x || 0; }) : null;
      lines.push(win.tie
        ? 'Last result, the week of ' + (win.week || monD(win.mon)) + ': a tie, ' +
          same.map(function (x) { return x.title; }).join(' and ') + '. Both stay on rotation.'
        : 'Last result, the week of ' + (win.week || monD(win.mon)) + ': ' + win.title + ' by ' + win.artist + ' won' +
          (v ? ', ' + Math.max(v[0], v[1]) + ' to ' + Math.min(v[0], v[1]) : '') + '.');
    }
    lines.push('', 'Send two Spotify links and who made each. The laptop closes this week, puts the winner ' +
                   'on rotation, then sets the new pair. It runs from the Monday after voting closes.');
    tellSheet("NEXT WEEK'S BATTLE", 'the laptop sets it', lines, [],
      { label: 'Copy the command',
        text: MUSIC_CMD + ' battle <linkA> <linkB> --artists "Artist A" "Artist B" --week ' + next + ' --write' });
  }

  function listSheet(kind, last) {
    var lu = kind === 'lineup';
    tellSheet(lu ? 'THE LINEUP RUNS OUT' : 'THE DROPS RUN OUT', 'the Music tab, filled from the laptop',
      [last ? 'The last ' + (lu ? 'show' : 'drop') + ' on the Music tab is ' + monD(last) + '.' : 'Nothing on it is dated.',
       lu ? 'Add Texas shows with a ticket link and where you found them.'
          : 'Add dated releases with where you found them.'],
      [{ label: 'The Music tab', href: '../#music', blank: true }],
      { label: 'Copy the command',
        text: lu ? MUSIC_CMD + ' lineup add --date YYYY-MM-DD --artist "Artist" --venue "Venue" --city Austin --ticket <url> --source <url> --write'
                 : MUSIC_CMD + ' drop add --date YYYY-MM-DD --artist "Artist" --title "Title" --source <url> --write' });
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

  // THE PAGE and MEMBERS. The count on MEMBERS is the card asks waiting.
  function tabsEl() {
    var nav = d.createElement('nav');
    nav.className = 'tabs btabs';
    nav.setAttribute('role', 'tablist');
    var asks = (DB.waiting && +DB.waiting.asks) || 0;
    [['page', 'THE PAGE'], ['members', 'MEMBERS']].forEach(function (t) {
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (VIEW === t[0] ? ' on' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', VIEW === t[0] ? 'true' : 'false');
      b.dataset.view = t[0];
      b.appendChild(d.createTextNode(t[1]));
      if (t[0] === 'members' && asks > 0) {
        var c = d.createElement('b');
        c.className = 'chip';
        c.textContent = String(asks);
        c.title = asks + ' ' + plural(asks, 'wants a card', 'want a card');
        b.appendChild(c);
      }
      b.onclick = function () { if (VIEW !== t[0]) setView(t[0]); };
      nav.appendChild(b);
    });
    return nav;
  }

  function legendEl() {
    var leg = d.createElement('div');
    leg.className = 'legend';
    leg.innerHTML =
      '<b><i class="dot live"></i>live</b>' +
      '<b><i class="dot draft"></i>edited or waiting</b>' +
      '<b><i class="dot git"></i>as committed</b>' +
      '<b><i class="dot hidden"></i>hidden</b>' +
      '<b><i class="dot dark"></i>dark</b>';
    return leg;
  }

  // The top of both tabs: the tabs, the legend and NOW. Repainted on its own
  // (paintBar) when only a count moved, so the Members list keeps its place.
  function barEl() {
    var bar = d.createElement('div');
    bar.id = 'bbar';
    bar.appendChild(tabsEl());
    bar.appendChild(legendEl());
    bar.appendChild(nowEl());
    return bar;
  }
  function paintBar() {
    var old = $('bbar');
    if (old) old.parentNode.replaceChild(barEl(), old);
  }

  function paintMembers(mount) {
    if (!DB.people) { mount.innerHTML = '<div class="note">opening the members list…</div>'; return; }
    var m = members();
    if (!m || typeof m.render !== 'function') {
      mount.innerHTML = '<div class="note">The members list did not load. Reload the page.</div>';
      return;
    }
    try { m.render(mount, { filter: VOPTS.filter || null }); }
    catch (e) {
      console.warn('board: the members list', e);
      mount.innerHTML = '<div class="note">The members list hit a snag. Reload the page.</div>';
    }
  }

  function paint() {
    var panel = $('panel');
    var frag = d.createDocumentFragment();
    frag.appendChild(barEl());

    if (VIEW === 'members') {
      var mount = d.createElement('div');
      mount.id = 'members-mount';
      mount.className = 'members-mount';
      frag.appendChild(mount);
      panel.innerHTML = '';
      panel.appendChild(frag);
      paintMembers(mount);
      painted = true;
      return;
    }

    // the jump bar, built from what actually renders. Sticky under the bar,
    // THE PAGE only.
    var specs = railSpecs();
    var jb = d.createElement('nav');
    jb.className = 'jump';
    specs.map(function (r) { return [r.key, r.nm]; })
      .concat([['voice', 'HOUSE VOICE'], ['map', 'EVERYTHING']])
      .forEach(function (p) {
        var a = d.createElement('a');
        a.href = '#' + p[0];
        a.textContent = p[1];
        a.onclick = function (e) {
          e.preventDefault();
          try { history.replaceState(null, '', location.pathname + location.search + '#' + p[0]); } catch (x) {}
          jump(p[0]);
        };
        jb.appendChild(a);
      });
    frag.appendChild(jb);

    var mk = d.createElement('h2');
    mk.className = 'bh';
    mk.innerHTML = 'Make something <span>every door in the house</span>';
    frag.appendChild(mk);

    var make = d.createElement('div');
    make.className = 'make';
    [
      ['✎', 'POST', 'to the take', function () { postSheet(); }],
      ['▶', 'VIDEO', 'member videos', function () { jump('videos'); }],
      ['♫', 'TRACK', 'on rotation', function () { jump('music'); }],
      ['✍', 'STORY', 'a house story', '../word/new/?house=1'],
      ['🎴', 'CARD', 'your card', '../card/'],
      ['📻', 'TICKER', 'the crawl', function () { jump('voice'); }],
      ['🌙', 'NIGHT', 'laptop only', 'cold']
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

  // THE PAGE or MEMBERS. The address follows (#page, #members) without a
  // history entry or a hashchange, so this never routes twice.
  function setView(v, opts) {
    VIEW = v === 'members' ? 'members' : 'page';
    VOPTS = opts || {};
    var want = VIEW === 'members' ? '#members' : '#page';
    if (!VOPTS.keepHash && location.hash !== want) {
      try { history.replaceState(null, '', location.pathname + location.search + want); } catch (e) {}
    }
    if (!admin) return;
    paint();
    var tabs = d.querySelector('.btabs');
    if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
  }

  /* ============================== routes ================================
     ⛔ EVERY VALUE FROM THE LINK IS CHECKED BEFORE USE, AND NONE IS ECHOED.
       ''  or #page        THE PAGE
       #members            the list
       #members/<key>      one person: a Crypt sid (10 hex) or a uuid
       #<railkey>          a rail this page actually has
       #run:<id>           one date on THE RUN, a uuid
       ?story=<link>       a house story: exactly a link in content/desk.json
       ?mstory=<slug>      a member story, ^[a-z0-9-]{1,90}$ */

  var UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var SID_OK = /^[0-9a-f]{10}$/;
  var MSTORY_OK = /^[a-z0-9-]{1,90}$/;

  function hashNow() { return String(location.hash || '').replace(/^#/, ''); }
  function railKeys() { return railSpecs().map(function (r) { return r.key; }).concat(['voice', 'map']); }
  function viewFromHash() { return /^members(?:\/|$)/.test(hashNow()) ? 'members' : 'page'; }

  function routeHash() {
    var h = hashNow();
    if (h === '' || h === 'page') { if (VIEW !== 'page') setView('page', { keepHash: true }); return; }
    if (h === 'members') { if (VIEW !== 'members') setView('members', { keepHash: true }); return; }
    if (h.indexOf('members/') === 0) {
      // ⛔ THE KEY LEAVES THE ADDRESS ONCE IT IS READ. Left there, the same row
      // tapped again is no change and opens nothing, and Back reopens the last
      // person on top of whoever is open now.
      try { history.replaceState(null, '', location.pathname + location.search + '#members'); } catch (e) {}
      openPerson(h.slice(8));
      return;
    }
    if (h.indexOf('run:') === 0) {
      var id = h.slice(4);
      jump('run');
      var r = UUID_OK.test(id)
        ? (DB.dates || []).filter(function (x) { return String(x.id).toLowerCase() === id.toLowerCase(); })[0]
        : null;
      if (!r) { toast('No date by that link.', true); return; }
      dateSheet(r);
      return;
    }
    var rk = h.replace(/^[rb]-/, '');
    if (railKeys().indexOf(rk) >= 0) jump(rk);
  }

  function routeQuery() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var story = q.get('story'), mstory = q.get('mstory');
    if (story == null && mstory == null) return;
    // used once: a reload must not open the sheet again
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    if (story != null) {
      var it = ((C.desk && C.desk.items) || []).filter(function (x) { return x && x.link && x.link === story; })[0];
      if (!it) { toast('No story by that link.', true); return; }
      jump('catalog');
      storySheet(it);
      return;
    }
    if (!MSTORY_OK.test(mstory)) { toast('No story by that link.', true); return; }
    var s = (DB.stories || []).filter(function (x) { return x.slug === mstory; })[0];
    if (s) { jump('word'); wordSheet(s); return; }
    // deskStories is the newest 50. An older one is read on its own before
    // the link is called wrong.
    storyBySlug(mstory).then(function (row) {
      if (!row) { toast('No story by that link.', true); return; }
      jump('word');
      wordSheet(row);
    });
  }

  // One member_stories row by its slug, the same columns deskStories reads
  // (desk.js has no single-story read for the desk; contract note filed).
  async function storyBySlug(slug) {
    var c = OTP.sb && OTP.sb();
    if (!c) return null;
    try {
      var r = await c.from('member_stories')
        .select('id,slug,title,dek,body_md,cover_url,published,baked,created_at,edited_at,house,kicker,shelf, profiles(display_name)')
        .eq('slug', slug).limit(1);
      return (!r.error && r.data && r.data[0]) || null;
    } catch (e) { return null; }
  }

  /* ============================== load ================================== */

  async function loadContent() {
    var files = ['site', 'slate', 'work', 'roster', 'rotation', 'desk', 'take', 'music'];
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
      // THE MEMBERS MANAGER (044 / 045). people is the Members tab's list,
      // waiting the one badge, takedowns THE TAKEDOWNS, dark the seats whose
      // card is out.
      people: OTP.deskMembers(),
      waiting: OTP.deskWaiting(),
      takedowns: OTP.frameTakedowns(),
      dark: OTP.darkSeats(),
      cards: OTP.cards(),
      dates: OTP.calendarAll(200),
      orphans: OTP.orphanImages(),
      undecided: undecided()
    };
    await Promise.all(Object.keys(jobs).map(async function (k) {
      try { DB[k] = await jobs[k]; }
      catch (e) {
        DB[k] = k === 'undecided' ? {} : [];
        console.warn('board: ' + k + ' unavailable, ' + e.message);
      }
    }));
    // THE RUN's credit picker: the card holders and the desk, still on show
    DB.members = (DB.people || [])
      .filter(function (p) { return (p.role === 'card' || p.role === 'desk') && p.state === 'active'; })
      .map(function (p) { return { id: p.id, display_name: p.name, card_slug: p.card_slug }; });
    // a night with a photo coming down: its data.json says whether it is still up
    var slugs = {};
    (DB.takedowns || []).forEach(function (t) { if (t && !t.files_gone_at) slugs[t.event_slug] = 1; });
    await Promise.all(Object.keys(slugs).map(function (s) { return nightData(s); }));
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

  // One read at a time; a refresh asked for during one runs once more after it,
  // so an action that lands mid-read is never painted stale.
  var refreshing = null, again = false;
  function refresh() {
    if (!admin) return Promise.resolve();
    if (refreshing) { again = true; return refreshing; }
    refreshing = (async function () {
      try {
        do {
          again = false;
          var y = w.scrollY;
          await loadDB();
          paint();
          w.scrollTo(0, y);
        } while (again);
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  // Just the badge: deskWaiting again, the tabs and NOW repainted, nothing else.
  async function loadWaiting() {
    if (!admin) return;
    DB.waiting = await OTP.deskWaiting();
    paintBar();
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
    // next= so the door can send him back here once the join page knows the key
    if (!me) { location.href = '../join/?next=board'; return; }
    var so = $('signout');
    if (so) { so.hidden = false; so.onclick = signOutNow; }
    admin = !!(me.profile && me.profile.is_admin);
    if (!admin) {
      panel.innerHTML = '<div class="card"><b style="font-family:var(--f-display);font-style:italic;' +
        'font-size:24px;text-transform:uppercase">Board is the desk\'s.</b>' +
        '<div class="note">Signed in as ' + esc(me.user && me.user.email) + '. Your own page is ' +
        '<a href="../my/">here</a>.</div></div>';
      return;
    }
    VIEW = viewFromHash();
    paint();                    // paints from content alone, DB state fills in
    await loadDB();
    // Photos whose post went away, swept whenever he opens the board. Before
    // the paint and the route, so the stray photos chip never vanishes from
    // under a jump; a sweep that hangs gets 4 seconds.
    try {
      var r = await Promise.race([OTP.drainOrphans(), new Promise(function (ok) { setTimeout(ok, 4000); })]);
      if (r && r.cleared) DB.orphans = await OTP.orphanImages();
    } catch (e) {}
    paint();
    routeHash();
    routeQuery();
    w.addEventListener('hashchange', routeHash);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  // ⛔ THE CONTRACT board-members.js (T3) reads at call time. DB is the live
  // object (never reassigned), so BOARD.DB.people is always the current list.
  w.BOARD = {
    esc: esc, thumb: thumb, full: full, toast: toast, sheet: sheet, tellSheet: tellSheet,
    saidYes: saidYes, twoTap: twoTap, toastUndo: toastUndo, DB: DB, refresh: refresh,
    setView: setView, jump: jump,
    // beyond the plan's list: the picture check, the badge alone, the bar alone,
    // one person's sheet (checked, opens once every time)
    safeImg: safeImg, loadWaiting: loadWaiting, paintBar: paintBar, openPerson: openPerson
  };
  w.OTPBoard = { refresh: refresh, jump: jump, sheet: sheet };

})(window, document);
