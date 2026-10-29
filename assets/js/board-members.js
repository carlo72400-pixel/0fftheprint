/* 0FF THE PRINT, THE BOARD: MEMBERS.
 *
 * His call 3: the members manager lives on /board/, with all four powers.
 *   (a) roles, ban and unban      (b) fix their info
 *   (c) close an account (a hide, undoable)
 *   (d) see everything they made, and hide or delete each piece
 * DMs stay private unless somebody in the chat reported it.
 *
 * board.js owns the page and the sheet. This file owns the MEMBERS tab: the one
 * list of everyone with a login, the person sheet, and the four queue sheets
 * (packs, rooms, flyer sources, reports). It loads after board.js and reads
 * window.BOARD at the moment it needs it, never at load.
 *
 *   window.BOARD_MEMBERS = { render(mountEl, opts), openPerson(key), openQueue(kind) }
 *
 * Data: BOARD.DB.people (desk_members) and BOARD.DB.waiting (desk_waiting).
 * Every power is one OTP method, and every one of those is one RPC that starts
 * with the desk check. Nothing here writes a table.
 *
 * ⛔ EVERY ACTION RE-READS AFTER IT LANDS. The person (deskMember), the badge
 *    (deskWaiting), their row on the list and the tab count. Two tabs open on
 *    the board is normal for him, so what the sheet shows is never trusted past
 *    the action that just ran, even when that action failed.
 * ⛔ NOTHING A MEMBER TYPED IS EVER PAINTED AS MARKUP. Every value goes through
 *    BOARD.esc, and a picture is drawn only from our own storage (a frame from
 *    a night is this repo's own file). A name like <img onerror> is a name.
 * ⛔ A KEY FROM THE ADDRESS IS CHECKED AND NEVER ECHOED: a miss says "Nobody by
 *    that link." and nothing else.
 */
(function (w, d) {
  'use strict';

  /* ============================ the board ============================ */

  function B() { return w.BOARD && typeof w.BOARD === 'object' ? w.BOARD : null; }
  function esc(s) {
    var b = B();
    if (b && b.esc) return b.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m, bad) { var b = B(); if (b && b.toast) b.toast(m, bad); }
  function people() { var b = B(); return b && b.DB && Array.isArray(b.DB.people) ? b.DB.people : []; }
  function noop() {}

  var DOT = ' · ';
  var SID_OK = /^[0-9a-f]{10}$/;
  var UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var IG_OK = /^[a-z0-9._]{1,30}$/;
  var PLAYLIST_OK = /^[A-Za-z0-9]{22}$/;
  var PACK_OK = /^[a-z0-9-]{1,90}$/;
  // 002's reserved_slugs: nobody but the desk is handed one, so the prefill skips them
  var RESERVED = ['vamppsych', 'the-desk', 'desk', 'otp', 'admin', '0ff-the-print', 'off-the-print', 'theprint'];
  // 044's house_seats, mirrored with their roster names. ⛔ The roster-seat guard reads THIS first, so it never waits on
  // roster.json, and a failed fetch never opens it. A new roster seat needs its line here too (044's RUNBOOK note).
  var HOUSE_SEATS = { 'kav-man': 'KAV-MAN', 'virgosgateway': 'VIRGOSGATEWAY', 'wrathfol': 'WRATHFOL', 'theink': 'The Ink',
    'the-ink': 'The Ink', 'kurlytop': 'KURLYTOP', 'wunmor': 'WUN MOR', 'wun-mor': 'WUN MOR', 'josh-fuego': 'JOSH FUEGO',
    'vamppsych': 'VAMPPSYCH' };
  var FRAMES = ['rainbow-rare', 'tera-ex', 'gold-rare', 'full-art', 'darklord', 'warlord', 'amazing', 'diamond-rare', 'vampy', 'stone', 'tag-team'];

  // the database's slugify (002) and the tight compare peopleMerge uses
  function slugify(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
  function tight(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function firstName(s) { return String(s || 'them').trim().split(/\s+/)[0] || 'them'; }
  function initial(s) { var a = Array.from(String(s || '?').trim()); return (a[0] || '?').toUpperCase(); }

  /* ============================== time =============================== */

  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // a timestamp as its San Antonio day, YYYY-MM-DD (a bare date stays as it is)
  function ymd(v) {
    var s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var t = Date.parse(s);
    if (!isFinite(t)) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit',
        day: '2-digit' }).format(new Date(t));
    } catch (e) { return new Date(t).toISOString().slice(0, 10); }
  }
  // 'Oct 3', with the year when it is not this year
  function day(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd(v));
    if (!m) return '';
    var now = ymd(new Date().toISOString());
    return MON3[+m[2] - 1] + ' ' + (+m[3]) + (now.slice(0, 4) !== m[1] ? ', ' + m[1] : '');
  }
  function ageMs(v) { var t = Date.parse(v); return isFinite(t) ? Math.max(0, Date.now() - t) : NaN; }
  // the list's short form: '5m ago', '2d ago'
  function agoShort(v) {
    var ms = ageMs(v);
    if (!isFinite(ms)) return '';
    var m = ms / 6e4, h = m / 60, dd = h / 24;
    if (m < 1) return 'just now';
    if (h < 1) return Math.floor(m) + 'm ago';
    if (dd < 1) return Math.floor(h) + 'h ago';
    if (dd < 14) return Math.floor(dd) + 'd ago';
    if (dd < 60) return Math.floor(dd / 7) + 'w ago';
    if (dd < 365) return Math.floor(dd / 30) + 'mo ago';
    return Math.floor(dd / 365) + 'y ago';
  }
  // the sheet's long form: 'Seen 2 days ago.'
  function agoLong(v) {
    var ms = ageMs(v);
    if (!isFinite(ms)) return '';
    var dd = ms / 864e5;
    if (ms < 36e5) return 'just now';
    if (dd < 1) return 'today';
    if (dd < 2) return 'yesterday';
    if (dd < 14) return Math.floor(dd) + ' days ago';
    if (dd < 60) return Math.floor(dd / 7) + ' weeks ago';
    if (dd < 365) return Math.floor(dd / 30) + ' months ago';
    return 'over a year ago';
  }
  // last time we know they were here: a login, or the newest thing they made
  function seenAt(p) {
    var a = Date.parse(p && p.last_in), b = Date.parse(p && p.last_active);
    if (!isFinite(a) && !isFinite(b)) return null;
    return new Date(Math.max(isFinite(a) ? a : 0, isFinite(b) ? b : 0)).toISOString();
  }

  /* ============================ pictures =============================
     ⛔ A face, a post photo or a pack cover is drawn only from our storage
     (BOARD.safeImg, and only its absolute answers). A frame from a night is a
     file in this repo, so it goes through safeImg as a repo path. */

  function pic(src) {
    var b = B(), s = b && b.safeImg ? b.safeImg(src) : '';
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function repoPic(src) {
    var b = B(), s = b && b.safeImg ? b.safeImg(src) : '';
    return /^https?:\/\//i.test(s) || /^\.\.\/[a-z0-9_]/i.test(s) ? s : '';
  }
  function packUrl(key) {
    if (!key) return '';
    try { return pic(w.OTP && OTP.packPhotoUrl ? OTP.packPhotoUrl(key) : ''); } catch (e) { return ''; }
  }
  function faceHtml(src, name, big) {
    var f = pic(src);
    return '<span class="mface' + (big ? ' big' : '') + '">' +
      (f ? '<img src="' + esc(f) + '" alt="" loading="lazy">' : '<i>' + esc(initial(name)) + '</i>') + '</span>';
  }

  /* ========================== roster seats ===========================
     The house's roster seats, from content/roster.json and creators.json (the
     same list 044's house_seats was seeded from). The sheet uses them for the
     roster-seat warning and "No roster card yet". Read once per page. Until
     they land, or when the read fails, HOUSE_SEATS answers for them. */

  var SEATS = null, seatsP = null;
  function loadSeats() {
    if (seatsP) return seatsP;
    seatsP = Promise.all(['roster', 'creators'].map(function (f) {
      return fetch('../content/' + f + '.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; });
    })).then(function (js) {
      var out = [];
      js.forEach(function (j) {
        ((j && j.items) || []).forEach(function (it) {
          if (!it || !(it.card_slug || it.name)) return;
          out.push({ name: String(it.name || it.card_slug), slug: slugify(it.card_slug), nslug: slugify(it.name), tight: tight(it.name) });
        });
      });
      SEATS = out;
      if (P && alive(P)) paintPerson(P);
      return out;
    });
    return seatsP;
  }
  function houseSeat(s) {
    if (!Object.prototype.hasOwnProperty.call(HOUSE_SEATS, s)) return null;
    var n = HOUSE_SEATS[s];
    return { name: n, slug: s, nslug: slugify(n), tight: tight(n) };
  }
  // the seat a card slug IS (its card_slug, or its name as a slug): the fetched roster, then 044's own list
  function seatOf(slug) {
    var s = slugify(slug);
    if (!s) return null;
    return (SEATS || []).filter(function (x) { return x.slug === s || x.nslug === s; })[0] || houseSeat(s);
  }
  // a seat whose name their name (or a slug) reads as
  function seatByName(name) {
    var t = tight(name);
    if (!t) return null;
    var got = (SEATS || []).filter(function (x) { return x.tight === t || tight(x.slug) === t; })[0];
    if (got) return got;
    var k = Object.keys(HOUSE_SEATS).filter(function (s) { return tight(s) === t || tight(HOUSE_SEATS[s]) === t; })[0];
    return k ? houseSeat(k) : null;
  }
  // ⛔ a roster seat is handed out on the second tap only. While the roster is still on its way, every card takes two
  // taps (044's seats are known already; this covers one roster.json has and 044 does not).
  function seatArm(v, waiting) {
    var seat = seatOf(v);
    if (seat) return 'Tap again: they get the roster seat ' + seat.name;
    return SEATS ? null : waiting;
  }

  /* ============================== chips ============================== */

  // 049: 'door' = a new @ waiting for him to look; state 'turned' = he turned them away (they are never told)
  var ROLE = { card: ['CARD HOLDER', 'card'], member: ['MEMBER', 'live'], login: ['ALMOST IN', 'hidden'], desk: ['DESK', 'git'],
    door: ['AT THE DOOR', 'wait'] };
  var ROLE_WORD = { card: 'card holder', member: 'member', login: 'almost in', desk: 'the desk', door: 'at the door' };
  function pill(t, cls) { return '<b class="mpill' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</b>'; }
  // 050, LOOK AFTER: the board's DB.fresh (desk_fresh) is who walked in through the open door and still needs a look
  function freshAt(p) {
    var b = B(), f = b && b.DB && Array.isArray(b.DB.fresh) ? b.DB.fresh : [];
    for (var i = 0; i < f.length; i++) if (f[i] && f[i].id === p.id) return f[i].at || true;
    return null;
  }
  // to check = waiting at the door (049, the look-first mode) or in already and fresh (050, the live mode)
  function toCheck(p) { return p.state === 'active' && (p.role === 'door' || (p.role === 'member' && !!freshAt(p))); }
  function tagsHtml(p) {
    var t = [], r = ROLE[p.role] || ROLE.login, nr = +p.n_reports || 0;
    if (p.state !== 'turned') t.push(pill(r[0], r[1]));     // turned away is not "almost in": its own pill says it
    if (p.role === 'member' && p.state === 'active' && freshAt(p)) t.push(pill('NEW, CHECK THEIR @', 'wait'));
    if (p.state === 'banned') t.push(pill('BANNED', 'bad'));
    if (p.state === 'closed') t.push(pill('CLOSED', 'dark'));
    if (p.state === 'turned') t.push(pill('TURNED AWAY', 'hidden'));
    if (p.asks) t.push(pill('WANTS A CARD', 'wait'));
    if (nr > 0) t.push(pill(nr + (nr === 1 ? ' REPORT' : ' REPORTS'), 'bad'));
    if (p.said_no) t.push(pill('SAID NO', 'hidden'));
    return t.join('');
  }
  function stuffCount(p) {
    return ['n_posts', 'n_comments', 'n_page', 'n_packs', 'n_rooms', 'n_stories', 'n_story_comments', 'n_picks',
            'n_videos', 'n_dates', 'n_tags', 'n_sources']
      .reduce(function (n, k) { return n + (+p[k] || 0); }, 0);
  }

  /* =============================== LIST ===============================
     Everyone with a login, one list. All filtering is client side: the board
     already read desk_members, and a search is one keystroke, not a request. */

  var WHO = [['all', 'Everyone'], ['door', 'At the door'], ['card', 'Card holders'], ['member', 'Crypt members'], ['login', 'Almost in'], ['desk', 'Desk']];
  var STAND = [['any', 'Any'], ['check', 'To check'], ['asks', 'Wants a card'], ['reported', 'Reported'], ['banned', 'Banned'],
    ['closed', 'Closed'], ['turned', 'Turned away'], ['said_no', 'Said no']];
  var SORTS = [['new', 'Newest'], ['seen', 'Last seen'], ['stuff', 'Most stuff'], ['az', 'A to Z']];
  var PAGE = 60;
  var L = { q: '', who: 'all', stand: 'any', sort: 'new', shown: PAGE, optsFilter: null, fresh: false, mount: null };

  // 049: somebody turned away is a login, but not "almost in" (Turned away under the standing chips finds them)
  function whoOk(p, who) { return who === 'all' || (p.role === who && !(who === 'login' && p.state === 'turned')); }
  function standOk(p, st) {
    switch (st) {
      case 'asks': return !!p.asks;
      case 'reported': return (+p.n_reports || 0) > 0;
      case 'banned': return p.state === 'banned';
      case 'closed': return p.state === 'closed';
      case 'turned': return p.state === 'turned';
      case 'check': return toCheck(p);
      case 'said_no': return !!p.said_no;
      default: return true;
    }
  }
  function hay(p) {
    return [p.name, p.ig, p.ig ? '@' + p.ig : '', p.card_slug, p.card_want, p.requested_slug, p.sid]
      .map(function (x) { return String(x || '').toLowerCase(); }).join(' ');
  }
  function matches(p) {
    if (!whoOk(p, L.who) || !standOk(p, L.stand)) return false;
    var q = L.q.trim().toLowerCase();
    if (!q) return true;
    var h = hay(p);
    return q.split(/\s+/).every(function (t) { return h.indexOf(t) >= 0; });
  }
  function sorted(list) {
    var t = function (v) { var x = Date.parse(v); return isFinite(x) ? x : 0; };
    var byName = function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }); };
    var f = {
      new: function (a, b) { return t(b.joined) - t(a.joined) || byName(a, b); },
      seen: function (a, b) { return t(seenAt(b)) - t(seenAt(a)) || byName(a, b); },
      stuff: function (a, b) { return stuffCount(b) - stuffCount(a) || byName(a, b); },
      az: byName
    }[L.sort] || byName;
    return list.slice().sort(f);
  }

  function lineOf(p) {
    var bits = [];
    if (p.joined) bits.push('joined ' + day(p.joined));
    var seen = seenAt(p);
    if (seen) bits.push('seen ' + agoShort(seen));
    if (+p.n_posts > 0) bits.push(plural(+p.n_posts, 'post', 'posts'));
    if (+p.n_comments > 0) bits.push(plural(+p.n_comments, 'comment', 'comments'));
    if (+p.n_packs > 0) bits.push(plural(+p.n_packs, 'pack', 'packs'));
    return bits.join(DOT);
  }
  function keyOf(p) {
    var s = String(p.sid || '').toLowerCase();
    return SID_OK.test(s) ? s : String(p.id || '').toLowerCase();
  }
  function rowHtml(p) {
    return '<a class="mrow' + (p.state !== 'active' ? ' out' : '') + '" href="#members/' + encodeURIComponent(keyOf(p)) +
      '" data-id="' + esc(p.id) + '">' +
      faceHtml(p.pic, p.name) +
      '<span class="mbody">' +
        '<span class="mname">' + esc(p.name || 'Member') + '</span>' +
        (p.ig ? '<span class="mig">@' + esc(p.ig) + '</span>' : '') +
        '<span class="mtags">' + tagsHtml(p) + '</span>' +
        '<span class="mline">' + esc(lineOf(p)) + '</span>' +
      '</span></a>';
  }

  function countLine(all) {
    var n = function (f) { return all.filter(f).length; };
    var check = n(toCheck);
    var turned = n(function (p) { return p.state === 'turned'; });
    return plural(all.length, 'person', 'people') + DOT +
      (check ? check + ' to check' + DOT : '') +
      plural(n(function (p) { return p.role === 'card'; }), 'card holder', 'card holders') + DOT +
      n(function (p) { return p.role === 'member'; }) + ' in the Crypt' + DOT +
      n(function (p) { return p.role === 'login' && p.state !== 'turned'; }) + ' almost in' + DOT +
      n(function (p) { return p.state === 'banned'; }) + ' banned' + DOT +
      n(function (p) { return p.state === 'closed'; }) + ' closed' +
      (turned ? DOT + turned + ' turned away' : '');
  }
  function chipRow(name, list, on, count) {
    return '<div class="mm-chips" role="group" aria-label="' + esc(name) + '">' + list.map(function (c) {
      var n = count ? count(c[0]) : null;
      return '<button type="button" class="mchip' + (c[0] === on ? ' on' : '') + '" data-' + name + '="' + esc(c[0]) + '"' +
        ' aria-pressed="' + (c[0] === on ? 'true' : 'false') + '">' + esc(c[1]) +
        (n != null ? ' <i>' + esc(n) + '</i>' : '') + '</button>';
    }).join('') + '</div>';
  }

  // opts.filter comes from the board (the NOW chip says 'asks'). It is applied
  // when it CHANGES, so a board re-read (which renders again with the same
  // filter) never undoes a chip he picked since. A tap on a NOW chip or a MAP
  // row is a fresh ask, so the render that tap makes applies it even when it is
  // the same filter as last time (see the click listener at the bottom).
  function applyFilter(f) {
    if (f === L.optsFilter && !L.fresh) return;
    L.fresh = false;
    L.optsFilter = f;
    L.shown = PAGE;
    if (!f) { L.who = 'all'; L.stand = 'any'; return; }
    if (WHO.some(function (c) { return c[0] === f; })) { L.who = f; L.stand = 'any'; }
    else if (STAND.some(function (c) { return c[0] === f; })) { L.who = 'all'; L.stand = f; }
  }

  function render(mount, opts) {
    if (!mount) return;
    applyFilter(opts && opts.filter ? String(opts.filter) : null);
    L.mount = mount;
    loadSeats();
    mount.innerHTML =
      '<div class="mm">' +
        '<h2 class="bh mm-h">MEMBERS <span>everyone with a login, one list</span></h2>' +
        '<div class="mm-count"></div>' +
        '<div class="mm-door" aria-live="polite"></div>' +
        '<input type="search" class="mm-q" placeholder="Find someone: name, @, card" aria-label="Find someone: name, @, card"' +
          ' autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">' +
        '<div class="mm-who"></div><div class="mm-stand"></div><div class="mm-sort"></div>' +
        '<div class="mm-hits"></div>' +
        '<div class="mm-list"></div>' +
        '<div class="mm-foot"></div>' +
      '</div>';
    var q = mount.querySelector('.mm-q');
    q.value = L.q;
    q.addEventListener('input', function () { L.q = q.value; L.shown = PAGE; paintList(); });
    mount.querySelector('.mm').addEventListener('click', function (e) {
      var c = e.target.closest('.mchip');
      if (!c) return;
      if (c.dataset.who) L.who = c.dataset.who;
      else if (c.dataset.stand) L.stand = c.dataset.stand;
      else if (c.dataset.sort) L.sort = c.dataset.sort;
      else return;
      L.shown = PAGE;
      paintList();
    });
    paintList();
    paintDoor();
  }

  /* ============================== TO CHECK ==============================
     049 + 050, his asks 10/29: "make sure they're real people", then "let them in first
     ... we'll do a vet afterwards". The door is open: a new @ walks in and lands here as
     NEW until he looks (KEEP, or REMOVE = Close the account). If the door is ever set to
     look first (049), a new @ waits here instead (LET IN / TURN AWAY, and a no is never
     told). One card each, oldest first: their @ opens their Instagram (the app on his
     phone), then two keys. The red one takes two taps. */
  async function rereadFresh() {
    var b = B();
    if (b && b.DB && w.OTP && OTP.deskFresh) { try { b.DB.fresh = await OTP.deskFresh(); } catch (e) {} }
  }
  function doorKey(p, letIn) {
    return async function () {
      var got = await OTP.deskDoor(p.id, letIn);
      await rereadFresh();
      await touch(p.id);
      paintDoor();
      if (p.role === 'member') return firstName(p.name) + ' stays. Checked.';
      return got === 'in' ? firstName(p.name) + ' is in.' : 'Turned away. They are not told.';
    };
  }
  function removeKey(p) {
    return async function () {
      await OTP.deskClose(p.id, 'Instagram check: not a real page');
      await rereadFresh();
      await touch(p.id);
      paintDoor();
      return { msg: 'Removed. Their account is closed.', undo: async function () {
        await OTP.deskReopen(p.id);
        await rereadFresh();
        await touch(p.id);
        paintDoor();
        return 'Open again. Still to check.';
      } };
    };
  }
  function igLink(ig, cls, label) {
    return '<a class="' + cls + '" href="https://instagram.com/' + encodeURIComponent(ig) + '/" target="_blank" rel="noopener noreferrer">' +
      label + '</a>';
  }
  function doorCard(p, reg) {
    var ig = String(p.ig || ''), inAlready = p.role === 'member';
    var when = inAlready ? 'in since ' + agoShort(freshAt(p) === true ? p.crypt_joined : freshAt(p)) + ', not checked yet'
      : 'waiting since ' + agoShort(p.joined);
    return '<div class="dr" data-id="' + esc(p.id) + '">' +
      '<a class="dr-who" href="#members/' + encodeURIComponent(keyOf(p)) + '">' + faceHtml(p.pic, p.name) +
        '<span class="mbody"><span class="mname">' + esc(p.name || 'Member') + '</span>' +
        '<span class="mline">' + esc(when) + '</span></span></a>' +
      (ig && IG_OK.test(ig) ? igLink(ig, 'dr-ig', '@' + esc(ig) + '<small>open their Instagram</small>')
        : '<span class="dr-ig none">no @ on this login</span>') +
      '<div class="dr-keys">' +
        (inAlready
          ? mk(reg, 'KEEP', doorKey(p, true), { cls: 'btn ok dr-in' }) +
            mk(reg, 'REMOVE', removeKey(p), { sure: 'Tap again', cls: 'btn bad dr-no' })
          : mk(reg, 'LET IN', doorKey(p, true), { cls: 'btn ok dr-in' }) +
            mk(reg, 'TURN AWAY', doorKey(p, false), { sure: 'Tap again', cls: 'btn bad dr-no' })) +
      '</div></div>';
  }
  function paintDoor() {
    var m = L.mount;
    if (!m || !m.isConnected) return;
    var box = m.querySelector('.mm-door');
    if (!box) return;
    var t = function (v) { var x = Date.parse(v); return isFinite(x) ? x : 0; };
    var since = function (p) { var f = freshAt(p); return p.role === 'member' && f !== true ? t(f) : t(p.joined); };
    var list = people().filter(toCheck).sort(function (a, b) { return since(a) - since(b); });
    if (!list.length) { box.innerHTML = ''; return; }
    var reg = [], says = [];
    if (list.some(function (p) { return p.role === 'member'; }))
      says.push('NEW ones are in already. Open their Instagram: KEEP the real ones, REMOVE the fakes (it closes the account, and you can open it back up).');
    if (list.some(function (p) { return p.role === 'door'; }))
      says.push('Waiting ones are not in until you LET IN. Turned away, they are never told.');
    box.innerHTML = '<h3 class="bh dr-h">TO CHECK <span>' + esc(list.length) + '</span></h3>' +
      '<div class="note dr-note">' + esc(says.join(' ')) + '</div>' +
      list.map(function (p) { return doorCard(p, reg); }).join('');
    wire(box, reg, { say: null, repaint: paintDoor, after: function () { return waiting(); } });
  }

  function paintCounts() {
    var m = L.mount;
    if (!m || !m.isConnected) return;
    var all = people();
    m.querySelector('.mm-count').textContent = countLine(all);
    m.querySelector('.mm-who').innerHTML = chipRow('who', WHO, L.who, function (k) {
      return all.filter(function (p) { return whoOk(p, k); }).length;
    });
    m.querySelector('.mm-stand').innerHTML = chipRow('stand', STAND, L.stand, function (k) {
      return all.filter(function (p) { return standOk(p, k); }).length;
    });
    m.querySelector('.mm-sort').innerHTML = chipRow('sort', SORTS, L.sort, null);
  }

  function paintList() {
    var m = L.mount;
    if (!m || !m.isConnected) return;
    paintCounts();
    var all = people(), hits = sorted(all.filter(matches));
    var filtered = L.q.trim() || L.who !== 'all' || L.stand !== 'any';
    m.querySelector('.mm-hits').textContent = filtered ? (hits.length === 1 ? '1 person matches.' : hits.length + ' people match.') : '';
    m.querySelector('.mm-list').innerHTML = hits.length
      ? hits.slice(0, L.shown).map(rowHtml).join('')
      : '<div class="empty">' + (all.length ? 'Nobody matches that.' : 'Nobody has a login yet.') + '</div>';
    var foot = m.querySelector('.mm-foot');
    foot.innerHTML = '';
    if (hits.length > L.shown) {
      var more = d.createElement('button');
      more.type = 'button';
      more.className = 'btn ghost mm-more';
      more.textContent = 'Show more (' + (hits.length - L.shown) + ' left)';
      more.onclick = function () { L.shown += PAGE; paintList(); };
      foot.appendChild(more);
    }
  }

  // one person changed: their row in the board's list, their line on screen, the counts
  function patchRow(row) {
    if (!row || !row.id) return;
    var b = B(), list = b && b.DB ? b.DB.people : null;
    if (!Array.isArray(list)) return;
    var i = -1;
    list.some(function (x, j) { if (x && x.id === row.id) { i = j; return true; } return false; });
    if (i >= 0) list[i] = row; else list.push(row);
    var m = L.mount;
    if (!m || !m.isConnected) return;
    var el = null;
    m.querySelectorAll('.mrow').forEach(function (r) { if (r.dataset.id === String(row.id)) el = r; });
    if (el) {
      var t = d.createElement('div');
      t.innerHTML = rowHtml(row);
      el.parentNode.replaceChild(t.firstChild, el);
    }
    paintCounts();
    paintDoor();
  }

  // the badge and the tab count (BOARD.loadWaiting re-reads desk_waiting and repaints the bar)
  function waiting() {
    var b = B();
    if (b && typeof b.loadWaiting === 'function') return Promise.resolve(b.loadWaiting()).catch(noop);
    return Promise.resolve();
  }

  /* ============================ actions ==============================
     Every button in a sheet is one entry in that paint's list: data-a is its
     index, never an id or a name. Kinds:
       fn(el)         the work. A string is the toast; {msg, undo} is a toast
                      with Undo (BOARD.toastUndo); {inline, msg, bad} speaks
                      under the field instead.
       sure           two taps (BOARD.twoTap), this is the second label
       arm(el)        two taps only when it returns a label (a roster seat)
       inline         where a throw is said (under the field, not a toast)
       ui             a toggle: repaint, no request
       local          fetched more rows: repaint, no re-read
     After the work, the sheet re-reads (after()), even when the work failed. */

  function mk(reg, label, fn, o) {
    o = o || {};
    reg.push({ fn: fn, sure: o.sure || null, arm: o.arm || null, inline: o.inline || null, ui: !!o.ui, local: !!o.local });
    return '<button type="button" class="' + (o.cls != null ? o.cls : 'btn ghost sm') + '" data-a="' + (reg.length - 1) + '"' +
      (o.pressed != null ? ' aria-pressed="' + (o.pressed ? 'true' : 'false') + '"' : '') + '>' + (o.html || esc(label)) + '</button>';
  }

  function wire(root, reg, ctx) {
    root.querySelectorAll('[data-a]').forEach(function (el) {
      var a = reg[+el.dataset.a];
      if (!a) return;
      if (el.tagName === 'SELECT') { el.addEventListener('change', function () { go(a, el); }); return; }
      if (a.sure) { B().twoTap(el, a.sure, function () { return go(a, el); }); return; }
      var armed = false, timer = null, label = el.textContent;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (el.disabled) return;
        if (a.arm && !armed) {
          var sure = a.arm(el);
          if (sure) {
            armed = true;
            el.classList.add('sure');
            el.textContent = sure;
            clearTimeout(timer);
            timer = setTimeout(function () { armed = false; el.classList.remove('sure'); el.textContent = label; }, 4000);
            return;
          }
        }
        clearTimeout(timer);
        go(a, el);
      });
    });
    async function go(a, el) {
      if (a.ui) { a.fn(el); ctx.repaint(); return; }
      ctx.say = null;
      var prev = el.disabled;
      el.disabled = true;
      var res, err;
      try { res = await a.fn(el); } catch (e) { err = e; }
      if (err) {
        var m = (err && err.message) || String(err);
        if (a.inline) ctx.say = { key: a.inline, msg: m, bad: true };
        else toast(m, true);
      } else if (res && typeof res === 'object') {
        if (res.inline) ctx.say = { key: res.inline, msg: res.msg, bad: !!res.bad };
        if (res.undo) B().toastUndo(res.msg, res.label || 'Undo', res.undo);
        else if (res.msg && !res.inline) toast(res.msg, !!res.bad);
      } else if (typeof res === 'string' && res) toast(res);
      if (a.local) { ctx.repaint(); return; }
      try { await ctx.after(); } catch (e) {}
      if (el.isConnected) el.disabled = prev;
    }
  }

  // what a clear says: what came off, and how many files went with it
  function clearSaid(r, what) {
    if (!r || r.cleared == null) return 'Nothing there to clear.';
    var n = +r.removed || 0;
    return (what || 'Cleared.') + (n ? ' ' + plural(n, 'file', 'files') + ' deleted.' : '');
  }

  /* ========================== the person sheet ==========================
     One person, everything about them, the four powers in one place. It opens
     on their list row at once and fills from deskMember. */

  var P = null;

  function alive(p) { return !!p && p === P && p.h && p.h.el && p.h.el.isConnected; }
  function lookup(k) {
    return people().filter(function (p) {
      return String(p.sid || '').toLowerCase() === k || String(p.id || '').toLowerCase() === k;
    })[0] || null;
  }

  function openPerson(key) {
    var k = String(key == null ? '' : key).trim().toLowerCase();
    if (!(SID_OK.test(k) || UUID_OK.test(k))) { toast('Nobody by that link.', true); return; }
    var row = lookup(k);
    if (row) { showPerson(row); return; }
    // not on the list the board read: ask for them by themselves before the link is called wrong
    (async function () {
      var r = null;
      try {
        if (!Array.isArray((B() && B().DB || {}).people)) {
          r = (await OTP.deskMembers()).filter(function (p) {
            return String(p.sid || '').toLowerCase() === k || String(p.id || '').toLowerCase() === k;
          })[0] || null;
        }
        if (!r && UUID_OK.test(k)) {
          var st = await OTP.deskMember(k);
          if (st && st.person) r = st.person;
        }
      } catch (e) { r = null; }
      if (!r) { toast('Nobody by that link.', true); return; }
      showPerson(r);
    })();
  }

  function whyOf(r) {
    var bits = [r.state === 'turned' ? 'turned away at the door' : (ROLE_WORD[r.role] || 'member')];
    if ((r.role === 'card' || r.role === 'desk') && r.card_slug) bits.push(r.card_slug);
    if (r.state === 'banned') bits.push('banned');
    if (r.state === 'closed') bits.push('closed');
    return bits.join(DOT);
  }

  function showPerson(row) {
    var b = B();
    if (!b || !b.sheet) return;
    if (P && P.h && P.h.el.isConnected) P.h.shut();
    loadSeats();
    var h = b.sheet({ title: row.name || 'Member', why: whyOf(row), tall: true, body: '<div class="mp" aria-live="polite"></div>' });
    h.box.classList.add('mp-sheet');
    var p = P = {
      id: row.id, row: row, st: null, err: null, h: h, el: h.el.querySelector('.mp'),
      ui: { tab: 'posts', all: {}, card: false, read: {} }, pages: {}, extra: {}, say: null, gen: 0,
      repaint: function () { paintPerson(p); },
      after: function () { return reloadPerson(p); }
    };
    paintPerson(p);
    loadPerson(p);
  }

  async function loadPerson(p) {
    var mine = ++p.gen, st = null, err = null;
    try { st = await OTP.deskMember(p.id); } catch (e) { err = e; }
    if (st && st.person) {
      try { st = await moreRows(p, st); } catch (e) {}
    }
    if (mine !== p.gen) return;
    // a re-read that failed keeps what the sheet last read, and says so
    if (!st && err && p.st) {
      toast('Could not read them again. ' + (err.message || String(err)), true);
      return;
    }
    if (st && st.person) { p.row = st.person; patchRow(st.person); }
    p.st = st;
    p.err = st ? null : (err ? (err.message || String(err)) : 'They are not here any more.');
    if (alive(p)) paintPerson(p);
  }
  function reloadPerson(p) { return Promise.all([loadPerson(p), waiting()]); }
  // an Undo or a queue action touched somebody: their sheet (if open) and their row
  async function touch(uid) {
    if (!uid) return;
    if (P && P.id === uid && alive(P)) { await reloadPerson(P); return; }
    try { var st = await OTP.deskMember(uid); if (st && st.person) patchRow(st.person); } catch (e) {}
  }

  // the older pages he opened stay open across a re-read
  async function moreRows(p, st) {
    var keys = Object.keys(p.pages);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], rows = ((st[k] && st[k].rows) || []).slice(), extra = [];
      for (var n = 0; n < p.pages[k] && rows.length; n++) {
        var more = await OTP.deskMemberItems(p.id, k, rows[rows.length - 1].at);
        if (!more.length) break;
        rows = rows.concat(more);
        extra = extra.concat(more);
      }
      p.extra[k] = extra;
    }
    return st;
  }

  // what he typed and has not saved survives a repaint, unless the saved value moved under it
  function dirty(root) {
    var out = {};
    root.querySelectorAll('input[data-f], textarea[data-f]').forEach(function (el) {
      var was = el.dataset.was || '';
      if (el.value !== was) out[el.dataset.f] = { was: was, v: el.value };
    });
    return out;
  }
  function undirty(root, keep) {
    Object.keys(keep).forEach(function (k) {
      var el = null;
      root.querySelectorAll('[data-f]').forEach(function (x) { if (x.dataset.f === k) el = x; });
      if (el && (el.dataset.was || '') === keep[k].was) {
        el.value = keep[k].v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  function sec(title, cls) { return '<section class="mp-sec' + (cls ? ' ' + cls : '') + '"><h4 class="mp-h">' + esc(title) + '</h4>'; }
  function note(t, cls) { return '<div class="note' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</div>'; }
  function quote(t) { return '<div class="note quote">&ldquo;' + esc(t) + '&rdquo;</div>'; }
  function line(t) { return '<div class="mp-line">' + esc(t) + '</div>'; }
  function row(html) { return '<div class="row mp-do">' + html + '</div>'; }
  function sayHtml(p, key) {
    var s = p.say && p.say.key === key ? p.say : null;
    return '<div class="mp-say' + (s && s.bad ? ' bad' : '') + '" role="status">' + (s ? esc(s.msg) : '') + '</div>';
  }
  function field(key, val, o) {
    o = o || {};
    var v = val == null ? '' : String(val);
    var a = ' data-f="' + key + '" data-was="' + esc(v) + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') +
      (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.raw ? ' autocapitalize="off" autocorrect="off" spellcheck="false"' : '') +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + ' aria-label="' + esc(o.label || key) + '"';
    if (o.area) return '<textarea rows="' + (o.rows || 4) + '"' + a + '>' + esc(v) + '</textarea>';
    return '<input type="text"' + a + ' value="' + esc(v) + '">';
  }
  function val(p, key) {
    var el = null;
    p.el.querySelectorAll('[data-f]').forEach(function (x) { if (x.dataset.f === key) el = x; });
    return el ? el.value : '';
  }

  function paintPerson(p) {
    if (!alive(p)) return;
    var keep = dirty(p.el), top = p.h.box.scrollTop;
    var reg = [], r = p.row, s = p.st;
    var h3 = p.h.box.querySelector('h3');
    if (h3) h3.textContent = r.name || 'Member';
    var why = p.h.box.querySelector('.why');
    if (why) why.textContent = whyOf(r);
    var html = headHtml(p);
    if (!s) html += note(p.err || 'reading their things…', p.err ? 'warn' : '');
    else html += doorHtml(p, reg) + waitHtml(p, reg) + roleHtml(p, reg) + standHtml(p, reg) + fixHtml(p, reg) +
                 stuffHtml(p, reg) + reportsHtml(p, reg) + histHtml(p) +
                 note('Their messages stay private. You only see a chat somebody in it reported.', 'mp-foot');
    p.el.innerHTML = html;
    wire(p.el, reg, p);
    wireLive(p);
    undirty(p.el, keep);
    p.h.box.scrollTop = top;
  }

  /* ---- HEADER ---- */
  function headHtml(p) {
    var r = p.row, ig = String(r.ig || '');
    var igHtml = !ig ? '<span class="mp-ig none">no @</span>'
      : IG_OK.test(ig) ? '<a class="mp-ig" href="https://instagram.com/' + encodeURIComponent(ig) + '/" target="_blank" rel="noopener noreferrer">@' + esc(ig) + '</a>'
      : '<span class="mp-ig">@' + esc(ig) + '</span>';
    var bits = [];
    if (r.joined) bits.push('Joined ' + day(r.joined) + '.');
    if (r.role !== 'login' && r.role !== 'door' && r.crypt_joined) bits.push('In the Crypt since ' + day(r.crypt_joined) + '.');
    var seen = seenAt(r);
    bits.push(seen ? 'Seen ' + agoLong(seen) + '.' : 'Not seen yet.');
    var links = [];
    if ((r.role === 'card' || r.role === 'desk') && r.card_slug)
      links.push('<a class="btn ghost sm" href="../c/?s=' + encodeURIComponent(r.card_slug) + '" target="_blank" rel="noopener">Their card page</a>');
    if (r.role !== 'login' && r.role !== 'door' && SID_OK.test(String(r.sid || '')))
      links.push('<a class="btn ghost sm" href="../wall/#s-' + encodeURIComponent(r.sid) + '" target="_blank" rel="noopener">Their Crypt page</a>');
    var out = '<div class="mp-top">' + faceHtml(r.pic, r.name, true) +
      '<div class="mp-who">' + igHtml + '<span class="mtags">' + tagsHtml(r) + '</span></div></div>' +
      line(bits.join(' ')) +
      (links.length ? '<div class="row mp-links">' + links.join('') + '</div>' : '');
    if (r.role === 'card' && SEATS && !seatOf(r.card_slug) && !seatByName(r.card_slug))
      out += note('No roster card yet. Their card art goes on at the laptop.');
    return out;
  }

  /* ---- THE DOOR (049) ---- */
  function doorHtml(p, reg) {
    var r = p.row, ig = String(r.ig || '');
    // 050: in already through the open door, not looked at yet
    if (r.role === 'member' && r.state === 'active' && freshAt(r)) {
      var f = freshAt(r);
      return sec('TO CHECK', 'wait') +
        line('In since ' + agoLong(f === true ? r.crypt_joined : f) + ' through the open door. Nobody has looked at their Instagram yet.') +
        (ig && IG_OK.test(ig) ? row(igLink(ig, 'btn ghost sm', 'Open @' + esc(ig) + ' on Instagram'))
          : note('No @ on this login.')) +
        '<div class="dr-keys">' +
          mk(reg, 'KEEP', async function () {
            await OTP.deskDoor(r.id, true);
            await rereadFresh();
            return firstName(r.name) + ' stays. Checked.';
          }, { cls: 'btn ok dr-in' }) +
          mk(reg, 'REMOVE', async function () {
            await OTP.deskClose(r.id, 'Instagram check: not a real page');
            await rereadFresh();
            return { msg: 'Removed. Their account is closed.', undo: async function () {
              await OTP.deskReopen(r.id);
              await rereadFresh();
              await touch(r.id);
              return 'Open again. Still to check.';
            } };
          }, { sure: 'Tap again', cls: 'btn bad dr-no' }) +
        '</div>' +
        note('REMOVE closes the account: everything they made is hidden, nothing is deleted, and Open it back up undoes it.') +
        '</section>';
    }
    if (r.role === 'door' && r.state === 'active') {
      return sec('AT THE DOOR', 'wait') +
        line('Signed up ' + agoLong(r.joined) + '. They are not in until you let them in.') +
        (ig && IG_OK.test(ig) ? row(igLink(ig, 'btn ghost sm', 'Open @' + esc(ig) + ' on Instagram'))
          : note('No @ on this login. Fix it below, or turn them away.')) +
        '<div class="dr-keys">' +
          mk(reg, 'LET IN', async function () {
            await OTP.deskDoor(r.id, true);
            return firstName(r.name) + ' is in.';
          }, { cls: 'btn ok dr-in' }) +
          mk(reg, 'TURN AWAY', async function () {
            await OTP.deskDoor(r.id, false);
            return 'Turned away. They are not told.';
          }, { sure: 'Tap again', cls: 'btn bad dr-no' }) +
        '</div>' +
        note('Turned away, they are never told. Their side keeps saying they are at the door.') + '</section>';
    }
    if (r.state === 'turned') {
      var h = ((p.st && p.st.history) || []).filter(function (x) { return x.action === 'door_no'; })[0];
      return sec('TURNED AWAY') +
        line('You turned them away at the door' + (h ? ' on ' + day(h.at) : '') + '. They are not told.') +
        row(mk(reg, 'Let them in after all', async function () {
          await OTP.deskDoor(r.id, true);
          return firstName(r.name) + ' is in.';
        }, { cls: 'btn sm' })) +
        note('Their @ stays on this login so you know who it was. If the real owner of that @ signs up, clear it under Fix their info.') +
        '</section>';
    }
    return '';
  }

  /* ---- WAITING (an open ask) ---- */
  // the card the database would hand out, in its own order: the card they hold,
  // the one they asked for (a roster seat too: naming it is the only way one is
  // handed out, so the field says so out loud), the one from /join/, then one
  // off their name (a roster seat's name starts at -2, taken ones count up)
  function prefill(p) {
    var r = p.row, ask = (p.st && p.st.ask) || {};
    var heldBy = function (x) {
      return !!x && ((RESERVED.indexOf(x) >= 0 && r.role !== 'desk') ||
        people().some(function (q) { return q.id !== r.id && slugify(q.card_slug) === x; }));
    };
    if (r.card_slug) return { slug: String(r.card_slug), from: 'held' };
    var want = slugify(ask.want || r.card_want);
    if (want && !heldBy(want)) return { slug: want, from: 'want' };
    var req = slugify(r.requested_slug);
    if (req && !heldBy(req) && !seatOf(req)) return { slug: req, from: 'join' };
    var base = slugify(r.name) || 'member';
    if (RESERVED.indexOf(base) >= 0) base = 'member';
    for (var i = seatOf(base) ? 2 : 1; i <= 30; i++) {
      var c = i === 1 ? base : base + '-' + i;
      if (!heldBy(c)) return { slug: c, from: 'name' };
    }
    return { slug: '', from: 'name' };
  }
  function cardHint(p, value) {
    var r = p.row, pre = p.pre || prefill(p), v = slugify(value);
    var want = slugify(((p.st && p.st.ask) || {}).want || r.card_want);
    var seat = seatOf(v) || (v === slugify(pre.slug) && want ? seatOf(want) : null);
    if (seat) return 'This is the roster seat ' + seat.name + '. Only hand it over if this is really them.';
    var match = seatByName(r.name);
    if (match) return 'Matches the roster card ' + match.name + '.';
    if (!v || v !== slugify(pre.slug)) return '';
    return { name: 'Made from their name.', want: 'The card they asked for.', join: 'The card they picked when they joined.',
             held: 'The card they held before. The same card comes back.' }[pre.from] || '';
  }
  function cardField(p) {
    var pre = p.pre = prefill(p);
    return '<label>Their card</label>' +
      field('card', pre.slug, { max: 60, raw: true, label: 'Their card', ph: 'their-card-name' }) +
      '<div class="note" data-hint="card">' + esc(cardHint(p, pre.slug)) + '</div>' + sayHtml(p, 'card');
  }
  function makeBtn(p, reg) {
    var r = p.row;
    return mk(reg, 'Make card holder', async function () {
      var slug = String(val(p, 'card') || '').trim();
      var got = await OTP.cardDecide(r.id, true, slug || null);
      return (r.name || 'They') + ' is a card holder now. Card: /c/?s=' + (got || slugify(slug));
    }, {
      cls: 'btn sm', inline: 'card',
      arm: function () { return seatArm(val(p, 'card'), 'Tap again: make them a card holder'); }
    });
  }
  function waitHtml(p, reg) {
    var r = p.row, ask = p.st.ask || {};
    if (!r.asks) return '';
    var want = ask.want || r.card_want;
    return sec('WAITING', 'wait') +
      line('Wants a card.' + (ask.at ? ' Asked ' + day(ask.at) + '.' : '')) +
      (ask.note ? quote(ask.note) : '') +
      (want ? '<div class="mp-line">Wants: <b>' + esc(want) + '</b></div>' : '') +
      cardField(p) +
      row(makeBtn(p, reg) +
          mk(reg, 'No', async function () {
            await OTP.cardDecide(r.id, false);
            return 'Said no. They are not told.';
          }, { sure: 'Tap again to say no', cls: 'btn bad sm' })) +
      note('Their Crypt pic and song go on their public card.') +
      note('They are never told. Their side still reads the same.') +
      '</section>';
  }

  /* ---- ROLE ---- */
  function frameLabel(f) {
    return String(f || '').split('-').map(function (x) {
      return x === 'ex' ? 'EX' : x.charAt(0).toUpperCase() + x.slice(1);
    }).join(' ');
  }
  function saidNoAt(p) {
    var ask = (p.st && p.st.ask) || {};
    if (ask.state === 'denied' && ask.at) return ask.at;
    var h = ((p.st && p.st.history) || []).filter(function (x) { return x.action === 'card_no'; })[0];
    return h ? h.at : null;
  }
  function roleHtml(p, reg) {
    var r = p.row;
    // 049: nobody at the door (or turned away) is handed a card before the door has let them in
    if (r.role === 'desk' || r.role === 'door' || r.state === 'turned' || (r.asks && r.role !== 'card')) return '';
    var out = sec('ROLE');
    if (r.role === 'card') {
      var slug = String(r.card_slug || '');
      out += '<div class="mp-line">Card: <b>' + esc(slug || 'none') + '</b>' + esc(DOT) +
        mk(reg, p.ui.card ? 'Never mind' : 'Change card', function () { p.ui.card = !p.ui.card; },
           { ui: true, cls: 'mp-link' }) + '</div>';
      if (p.ui.card) {
        out += '<label>Their card is now</label><div class="mp-inline">' +
          field('newcard', slug, { max: 60, raw: true, label: 'Their card is now' }) +
          mk(reg, 'Save card', async function () {
            var v = String(val(p, 'newcard') || '').trim();
            if (!v) throw new Error('Put a card name in.');
            if (slugify(v) === slugify(slug)) return { inline: 'newcard', msg: 'That is their card already.' };
            var got = await OTP.cardDecide(r.id, true, v);
            p.ui.card = false;
            return 'Their card is ' + (got || slugify(v)) + ' now. Card: /c/?s=' + (got || slugify(v));
          }, {
            cls: 'btn sm', inline: 'newcard',
            // the same rule as Make card holder (their own card again is said under the field, in one tap)
            arm: function () {
              var v = String(val(p, 'newcard') || '').trim();
              return !v || slugify(v) === slugify(slug) ? null : seatArm(v, 'Tap again: change their card');
            }
          }) + '</div>' + sayHtml(p, 'newcard') +
          note('A roster seat is handed out by name, here, and only here.');
      }
      var grants = (w.OTP && Array.isArray(OTP.GRANT_FRAMES) ? OTP.GRANT_FRAMES : FRAMES).slice();
      if (r.frame_grant && grants.indexOf(r.frame_grant) < 0) grants.push(r.frame_grant);
      reg.push({ fn: async function (el) {
        var f = el.value || null;
        var got = await OTP.setFrameGrant(r.id, f);
        return got ? 'They may wear ' + frameLabel(got) + ' now.' : 'No house frame for them now.';
      } });
      out += '<label>Frame they may wear</label><select data-a="' + (reg.length - 1) + '" aria-label="Frame they may wear">' +
        '<option value=""' + (r.frame_grant ? '' : ' selected') + '>None</option>' +
        grants.map(function (f) {
          return '<option value="' + esc(f) + '"' + (r.frame_grant === f ? ' selected' : '') + '>' + esc(frameLabel(f)) + '</option>';
        }).join('') + '</select>' +
        note('On top of the four everyone gets. Changing it takes the old one off their card if they had it on.');
      out += row(mk(reg, 'Take the card back', async function () {
        await OTP.takeCard(r.id);
        return { msg: 'Card taken back. They stay in the Crypt as a member.', undo: async function () {
          var got = await OTP.cardDecide(r.id, true, slug || null);
          await touch(r.id);
          return (r.name || 'They') + ' is a card holder again. Card: /c/?s=' + (got || slug);
        } };
      }, { sure: 'Tap again: they stay in the Crypt as a member.', cls: 'btn bad sm' })) +
        note('Their card page comes down, and so do their stories, videos, picks and dates. Their posts stay up. ' +
             'Make them a card holder again and the same card comes back.');
    } else if (r.said_no) {
      var at = saidNoAt(p);
      out += line('You said no' + (at ? ' on ' + day(at) : '') + '. They are not told.') +
        row(mk(reg, 'Take back the no', async function () {
          var ok = await OTP.unNo(r.id);
          return ok ? 'They are back in Wants a card.' : 'There was no no to take back.';
        })) + note('They are back in Wants a card.');
    } else if (r.state === 'active') {
      out += line(r.role === 'login' ? 'Almost in: a login with no @ in the Crypt yet.' : 'In the Crypt, no card.') +
        cardField(p) + row(makeBtn(p, reg)) + note('Their Crypt pic and song go on their public card.');
    } else {
      out += line(r.state === 'banned' ? 'Unban them first to hand them a card.' : 'Open the account back up first to hand them a card.');
    }
    return out + '</section>';
  }

  /* ---- STANDING ---- */
  function unbanSaid(s) {
    return s === 'closed' ? 'Unbanned. The account is still closed.'
         : s === 'banned' ? 'Still banned.'
         : 'Unbanned. Everything they had is back.';
  }
  function standHtml(p, reg) {
    var r = p.row;
    if (r.role === 'desk') return '';
    var out = sec('STANDING');
    var unban = function () {
      return mk(reg, 'Unban', async function () { return unbanSaid(await OTP.ban(r.id, false)); }, { cls: 'btn sm' });
    };
    if (r.state === 'active' || r.state === 'turned') {
      out += '<label>Why, for you only</label>' + field('note', '', { max: 280, label: 'Why, for you only', ph: 'spam, threats, a second account' }) +
        row(mk(reg, 'Ban', async function () {
          var n = String(val(p, 'note') || '').trim();
          await OTP.ban(r.id, true, n || null);
          return { msg: 'Banned. Off the Crypt and the site.', undo: async function () {
            var s = await OTP.ban(r.id, false);
            await touch(r.id);
            return unbanSaid(s);
          } };
        }, { sure: 'Tap again: off the Crypt and the site.', cls: 'btn bad sm' })) +
        note('Their card page, posts, comments, page, packs and rooms go dark. Nothing is deleted. Unban puts every bit of it back.') +
        row(mk(reg, 'Close the account', async function () {
          var n = String(val(p, 'note') || '').trim();
          await OTP.deskClose(r.id, n || null);
          return { msg: 'Closed. Everything they made is hidden.', undo: async function () {
            await OTP.deskReopen(r.id);
            await touch(r.id);
            return 'Open again.';
          } };
        }, { sure: 'Tap again: hide it all.', cls: 'btn bad sm' })) +
        note('Hides everything they made and shows them as Closed account in messages. Nothing is deleted. Open it back up any time.');
    } else if (r.state === 'banned') {
      out += line('Banned' + (r.banned_at ? ' ' + day(r.banned_at) : '') + '.') + (r.ban_note ? quote(r.ban_note) : '') + row(unban());
    } else if (r.state === 'closed') {
      out += line('Closed' + (r.closed_at ? ' ' + day(r.closed_at) : '') + (r.closed_by_desk ? ' by you.' : ' by them.')) +
        (r.close_reason ? quote(r.close_reason) : '') +
        row(mk(reg, 'Open it back up', async function () {
          await OTP.deskReopen(r.id);
          return r.banned_at ? 'Open again. They are still banned.' : 'Open again. Everything they had is back.';
        }, { cls: 'btn sm' }));
      // a closed account can be banned as well: the row says closed first
      if (r.banned_at) out += line('Also banned ' + day(r.banned_at) + '.') + (r.ban_note ? quote(r.ban_note) : '') + row(unban());
    }
    return out + stillPublic(p, reg) + '</section>';
  }
  // what the gates do not reach: stories baked into the catalog, and the roster seat (dark while the card is out)
  function stillPublic(p, reg) {
    var r = p.row, sp = (p.st && p.st.still_public) || {};
    var out = r.state !== 'active' || (r.role !== 'card' && r.role !== 'desk');
    var n = +sp.catalog_stories || 0;
    if (!out || (!n && !sp.roster_seat)) return '';
    var h = '<div class="mp-still">';
    if (n) h += note('Still public: ' + plural(n, 'story', 'stories') + ' in the catalog. Take them down from THE CATALOG.', 'warn') +
      row(mk(reg, 'Open THE CATALOG', function () {
        var b = B();
        if (P && P.h) P.h.shut();
        if (b && b.jump) b.jump('catalog');
      }, { ui: true }));
    if (sp.roster_seat) h += note('Their roster seat is off the site while their card is out.');
    return h + '</div>';
  }

  /* ---- FIX THEIR INFO ---- */
  var IG_SAID = { ok: 'Their @ is fixed.', cleared: 'Their @ is cleared.', same: 'That is their @ already.' };
  function trackUrl(id) { return id ? 'https://open.spotify.com/track/' + id : ''; }
  function linksOf(wds) {
    var out = [], seen = {};
    (Array.isArray(wds.links) ? wds.links : []).forEach(function (l) {
      if (!l || !l.p || l.h == null) return;
      var k = String(l.p).toLowerCase() + ':' + String(l.h).toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ p: String(l.p), h: String(l.h) });
    });
    if (wds.link_platform && wds.link_handle) {
      var k2 = String(wds.link_platform).toLowerCase() + ':' + String(wds.link_handle).toLowerCase();
      if (!seen[k2]) out.push({ p: String(wds.link_platform), h: String(wds.link_handle) });
    }
    return out;
  }
  function clearRow(title, body, btnHtml) {
    return '<div class="li"><b>' + esc(title) + '</b><span>' + body + '</span>' + btnHtml + '</div>';
  }
  function thumbSpan(src) { var f = pic(src); return f ? '<img class="mp-thumb" src="' + esc(f) + '" alt="" loading="lazy">' : ''; }
  function clearer(p, reg, label, what, url, said, sure) {
    var r = p.row;
    return mk(reg, label, async function () {
      return clearSaid(await (url == null ? OTP.clearSpace(r.id, what) : OTP.clearSpace(r.id, what, url)), said);
    }, { sure: sure || 'Tap again to clear', cls: 'btn bad sm' });
  }
  function fixHtml(p, reg) {
    var r = p.row, s = p.st, wds = s.words || {}, pg = s.page || null;
    var holder = r.role === 'card' || r.role === 'desk';
    var out = sec('FIX THEIR INFO');

    out += '<label>Name</label><div class="mp-inline">' + field('name', r.name, { max: 60, label: 'Name' }) +
      mk(reg, 'Save', async function () {
        var got = await OTP.renameMember(r.id, val(p, 'name'));
        return 'Renamed. They go by ' + (got || String(val(p, 'name')).trim()) + ' now.';
      }, { cls: 'btn sm', inline: 'name' }) + '</div>' + sayHtml(p, 'name') +
      (holder ? note('Their card page and roster card keep the old name until the next bake.') : '');

    out += '<label>Instagram</label><div class="mp-inline">' + field('ig', r.ig || '', { max: 80, raw: true, label: 'Instagram', ph: '@handle' }) +
      mk(reg, 'Save', async function () {
        var a = await OTP.setMemberIg(r.id, val(p, 'ig'));
        if (a === 'taken') return { inline: 'ig', msg: 'Another account has that @.', bad: true };
        if (a === 'bad') return { inline: 'ig', msg: 'That is not an Instagram handle.', bad: true };
        return IG_SAID[a] || IG_SAID.ok;
      }, { cls: 'btn sm', inline: 'ig' }) + '</div>' + sayHtml(p, 'ig') +
      note("One account per @. Clearing a Crypt member's @ takes them off the Crypt until they bring their own. Saving one for someone with none lets them in.");

    if (holder) {
      out += '<label>Tagline</label>' + field('tagline', wds.tagline || '', { max: 80, label: 'Tagline' }) +
        '<label>Bio</label>' + field('bio', wds.bio || '', { area: true, rows: 4, max: 600, label: 'Bio' }) +
        row(mk(reg, 'Save their words', async function () {
          await OTP.setMemberWords(r.id, { tagline: val(p, 'tagline'), bio: val(p, 'bio') });
          return 'Saved their words.';
        }, { cls: 'btn sm', inline: 'words' })) + sayHtml(p, 'words');
      out += '<label>Opening song</label>' +
        field('song', trackUrl(wds.theme_track), { raw: true, mode: 'url', label: 'Opening song', ph: 'https://open.spotify.com/track/...' }) +
        '<div class="songsay" data-songsay></div>' +
        '<label>Start at (seconds)</label>' + field('start', wds.theme_start || '', { max: 4, mode: 'numeric', label: 'Start at (seconds)' }) +
        row(mk(reg, 'Save the song', async function () {
          var got = await OTP.setMemberSong(r.id, { song: String(val(p, 'song') || '').trim(), start: val(p, 'start') });
          return got ? 'Their song is set.' : 'Their song is off.';
        }, { cls: 'btn sm', inline: 'song' })) + sayHtml(p, 'song') +
        note('It plays on their card and their Crypt page. Anyone not logged into Spotify gets the 30 second preview, so past 0:30 does nothing for them.');
    }

    // the clears, one row each: what is there now, and its own button
    var rows = [];
    var face = r.pic || wds.card_photo || (pg && pg.pic);
    if (face) rows.push(clearRow('Photo', thumbSpan(face) || 'set', clearer(p, reg, 'Clear photo', 'pic', null, 'Photo off.', 'Tap again: photo off, file deleted')));
    var song = wds.theme_track || (pg && pg.song);
    if (song) rows.push(clearRow('Song', esc(song), clearer(p, reg, 'Clear song', 'song', null, 'Song off.')));
    if (holder) {
      var ls = linksOf(wds);
      ls.forEach(function (l) {
        rows.push(clearRow(l.p, esc(l.h), clearer(p, reg, 'Remove', 'link_one', l.p + ':' + l.h, 'Link off.', 'Tap again to remove')));
      });
      if (ls.length) rows.push(clearRow('Every link', plural(ls.length, 'link', 'links'), clearer(p, reg, 'Clear all links', 'links', null, 'Links off.')));
      var ft = Array.isArray(wds.featured) ? wds.featured : [];
      if (ft.length) rows.push(clearRow('The three tracks', plural(ft.length, 'track', 'tracks') + ' on their card',
        clearer(p, reg, 'Clear the three tracks', 'tracks', null, 'Tracks off.')));
    }
    if (pg) {
      if (pg.wallpaper) rows.push(clearRow('Crypt wallpaper', thumbSpan(pg.wallpaper) || 'set', clearer(p, reg, 'Clear', 'wallpaper', null, 'Wallpaper off.')));
      (Array.isArray(pg.pics) ? pg.pics : []).forEach(function (u, i) {
        rows.push(clearRow('Album picture ' + (i + 1), thumbSpan(u) || 'a picture', clearer(p, reg, 'Clear', 'pic_one', u, 'Picture off.')));
      });
      if (pg.about) rows.push(clearRow('About me', esc(pg.about), clearer(p, reg, 'Clear', 'about', null, 'About me cleared.')));
      if (pg.headline) rows.push(clearRow('Headline', esc(pg.headline), clearer(p, reg, 'Clear', 'headline', null, 'Headline cleared.')));
      if (pg.mood || pg.mood_e) rows.push(clearRow('Mood', esc([pg.mood_e, pg.mood].filter(Boolean).join(' ')), clearer(p, reg, 'Clear', 'mood', null, 'Mood cleared.')));
      if (pg.meet) rows.push(clearRow('Meet', esc(pg.meet), clearer(p, reg, 'Clear', 'meet', null, 'Meet cleared.')));
    }
    out += '<h5 class="mp-h2">Clear one thing</h5>' +
      (rows.length ? '<div class="list mp-clears">' + rows.join('') + '</div>' : note('Nothing on their card or page to clear.'));
    out += row(mk(reg, 'Reset the whole page', async function () {
      return clearSaid(await OTP.clearSpace(r.id, 'page'), 'Their page is back to the house colors.');
    }, { sure: 'Tap again: back to the house colors, pictures deleted', cls: 'btn bad sm' })) +
      note('Their Crypt page goes back to how a new page looks. Their card is not touched.');
    return out + '</section>';
  }

  /* ---- THEIR STUFF ---- */
  var TABS = [
    ['posts', 'Posts', ['posts']], ['comments', 'Comments', ['take_comments', 'flyer_comments']],
    ['page_comments', 'Page comments', ['page_comments']], ['on_their_page', 'On their page', ['on_their_page']],
    ['packs', 'Packs', ['packs']], ['rooms', 'Rooms', ['rooms']], ['stories', 'Stories', ['stories']],
    ['story_comments', 'Story comments', ['story_comments']], ['picks', 'Picks', ['picks']], ['videos', 'Videos', ['videos']],
    ['dates', 'Dates', ['dates']], ['tags', 'Frames', ['tags']], ['sources', 'Sources', ['sources']]
  ];
  // each list's kind in deskHide / deskDelete, and whether it hides (or only comes down)
  var LISTK = {
    posts: ['post', true], take_comments: ['take_comment', true], flyer_comments: ['flyer_comment', true],
    page_comments: ['space_post', false], on_their_page: ['space_post', false], packs: ['pack', true], rooms: ['room', true],
    stories: ['story', true], story_comments: ['story_comment', true], picks: ['pick', true], videos: ['video', true],
    dates: ['date', true], tags: ['frame_tag', false], sources: [null, false]
  };
  var STATE_PILL = { live: ['LIVE', 'live'], hidden: ['HIDDEN', 'hidden'], waiting: ['WAITING', 'wait'], pulled: ['PULLED', 'bad'],
                     out: ['DOWN WHILE THEY ARE OUT', 'hidden'], sweep: ['IN THE SWEEP', 'live'], no: ['SAID NO', 'hidden'] };

  function tabOf(key) { return TABS.filter(function (t) { return t[0] === key; })[0] || TABS[0]; }
  function rowsOf(p, k) { return (((p.st[k] || {}).rows) || []).concat(p.extra[k] || []); }
  function totalOf(p, k) { return +((p.st[k] || {}).total) || 0; }
  function tabRows(p, t) {
    var out = [];
    t[2].forEach(function (k) { rowsOf(p, k).forEach(function (r) { out.push({ k: k, r: r }); }); });
    if (t[2].length > 1) out.sort(function (a, b) { return (Date.parse(b.r.at) || 0) - (Date.parse(a.r.at) || 0); });
    return out;
  }

  function itemHtml(p, reg, k, r) {
    var title = '', sub = [], chips = [], img = '', link = '', state = 'live';
    var dk = LISTK[k][0], hides = LISTK[k][1];
    switch (k) {
      case 'posts':
        title = r.text || (r.image_url ? 'A photo' : 'A post'); img = pic(r.image_url);
        // up or pulled. A banned or closed author's posts are dark at the door (045's visible), not pulled, and come
        // back with them; Hide pulls one so it stays down after an unban
        state = !r.published ? 'pulled' : r.visible === false ? 'out' : 'live';
        if (r.members_only) chips.push(pill('THE ROLL', 'git'));
        if (r.pinned) chips.push(pill('PINNED', 'card'));
        break;
      case 'take_comments': title = r.b; sub.push('on the Take'); state = r.hidden ? 'hidden' : 'live'; if (r.edited_at) sub.push('edited'); break;
      case 'flyer_comments': title = r.b; sub.push('on a Crypt flyer'); state = r.hidden ? 'hidden' : 'live'; if (r.edited_at) sub.push('edited'); break;
      case 'page_comments': title = r.b; sub.push('on ' + (r.on_name || 'a member') + "'s page"); break;
      case 'on_their_page': title = r.b; sub.push('by ' + (r.by_name || 'a member')); break;
      case 'packs':
        title = r.title || 'A pack'; img = packUrl(r.cover || (Array.isArray(r.images) ? r.images[0] : ''));
        sub.push(plural((r.images || []).length, 'card', 'cards'));
        state = r.published ? 'live' : r.waiting ? 'waiting' : 'hidden';
        if (PACK_OK.test(String(r.slug || ''))) link = '<a class="btn ghost sm" href="../packs/?p=' + encodeURIComponent(r.slug) + '" target="_blank" rel="noopener">Open it</a>';
        break;
      case 'rooms':
        title = r.name || 'A room'; if (r.label) sub.push(r.label);
        state = r.published ? 'live' : r.waiting ? 'waiting' : 'hidden';
        if (PLAYLIST_OK.test(String(r.playlist || ''))) link = '<a class="btn ghost sm" href="https://open.spotify.com/playlist/' + encodeURIComponent(r.playlist) + '" target="_blank" rel="noopener noreferrer">Listen</a>';
        break;
      case 'stories':
        title = r.title || 'A story'; state = r.published ? 'live' : 'hidden';
        if (r.baked) chips.push(pill('IN THE CATALOG', 'git'));
        if (r.house) chips.push(pill('HOUSE', 'git'));
        if (r.waiting) chips.push(pill('NEW', 'card'));
        break;
      case 'story_comments':
        title = r.text; if (r.story_slug) sub.push('on ' + r.story_slug);
        state = r.published ? 'live' : r.waiting ? 'waiting' : 'hidden';
        break;
      case 'picks':
        title = (r.title || 'A pick') + (r.artist ? DOT + r.artist : '');
        state = r.published ? 'live' : r.waiting ? 'waiting' : 'hidden';
        break;
      case 'videos': title = r.title || 'A video'; state = r.published ? 'live' : 'hidden'; if (r.featured) chips.push(pill('FEATURED', 'card')); break;
      case 'dates':
        title = r.title || 'A date'; if (r.on_date) sub.push('on ' + day(r.on_date));
        state = r.published ? 'live' : 'hidden';
        if (r.want_house) chips.push(pill('ASKING FOR THE HOUSE', 'wait'));
        break;
      case 'tags':
        title = 'Photo ' + (r.media || '') + DOT + (r.event_slug || '');
        try {
          img = repoPic(OTP.frameThumb(r.event_slug, r.media, '../'));
          var fl = OTP.frameLink(r.event_slug, r.media, '../');
          if (fl && /^\.\.\/events\//.test(fl)) link = '<a class="btn ghost sm" href="' + esc(fl) + '" target="_blank" rel="noopener">See the photo</a>';
        } catch (e) {}
        break;
      case 'sources':
        title = (r.kind === 'ig' ? '@' : '') + (r.source || '');
        state = r.status === 'pending' ? 'waiting' : r.status === 'approved' ? 'sweep' : 'no';
        if (+r.found > 0) sub.push(r.found + ' found');
        break;
    }
    var sp = STATE_PILL[state] || STATE_PILL.live;
    var meta = [day(r.at)].concat(sub).filter(Boolean).join(DOT);
    var id = r.id, uid = p.id, btns = [];
    var put = function (on) {
      return function () {
        if (k === 'packs') return OTP.packDecide(id, on);
        if (k === 'rooms') return OTP.roomDecide(id, on);
        if (on) return OTP.deskHide(dk, id, false);
        return OTP.deskMarkRead(k === 'picks' ? 'pick' : 'story_comment', id);
      };
    };
    if (k === 'sources') {
      if (state === 'waiting') {
        btns.push(mk(reg, 'Add to the sweep', async function () { await OTP.sourceDecide(id, 'approved'); return 'Added. The Tuesday sweep reads it.'; }, { cls: 'btn sm' }));
        btns.push(mk(reg, 'No', async function () { await OTP.sourceDecide(id, 'denied'); return 'Said no.'; }));
      }
    } else {
      if (state === 'waiting' && (k === 'packs' || k === 'rooms' || k === 'picks' || k === 'story_comments')) {
        btns.push(mk(reg, 'Put it up', async function () { await put(true)(); return 'Up.'; }, { cls: 'btn sm' }));
        btns.push(mk(reg, 'No', async function () { await put(false)(); return 'Said no. It stays down.'; }));
      } else if (hides && (state === 'live' || state === 'out')) {
        var outNow = state === 'out';
        btns.push(mk(reg, 'Hide', async function () {
          await OTP.deskHide(dk, id, true);
          return { msg: outNow ? 'Pulled. It stays down when they are back.' : 'Hidden.', undo: async function () {
            await OTP.deskHide(dk, id, false); await touch(uid); return outNow ? 'Put back. It shows again when they are back.' : 'Back up.';
          } };
        }));
      } else if (hides && (state === 'hidden' || state === 'pulled')) {
        btns.push(mk(reg, 'Show', async function () {
          await OTP.deskHide(dk, id, false);
          return k === 'posts' && p.row && p.row.state !== 'active' ? 'Put back. It shows again when they are back.' : 'Back up.';
        }));
      }
      btns.push(mk(reg, 'Delete', async function () {
        if (k === 'tags') await OTP.deskDelete('frame_tag', null, { user: uid, slug: r.event_slug, media: r.media });
        else await OTP.deskDelete(dk, id);
        return 'Deleted.';
      }, { sure: 'Tap again to delete for good', cls: 'btn bad sm' }));
    }
    return '<div class="mi">' +
      (img ? '<span class="mi-pic"><img src="' + esc(img) + '" alt="" loading="lazy"></span>' : '') +
      '<div class="mi-b">' +
        '<div class="mi-t">' + esc(title || '(nothing written)') + '</div>' +
        '<div class="mi-s"><span>' + esc(meta) + '</span>' + pill(sp[0], sp[1]) + chips.join('') + '</div>' +
        ((btns.length || link) ? '<div class="row mi-do">' + link + btns.join('') + '</div>' : '') +
      '</div></div>';
  }

  function stuffHtml(p, reg) {
    var t = tabOf(p.ui.tab);
    var out = sec('THEIR STUFF') + '<div class="mm-chips mp-tabs" role="group" aria-label="Their stuff">' +
      TABS.map(function (x) {
        var n = x[2].reduce(function (m, k) { return m + totalOf(p, k); }, 0);
        return mk(reg, x[1], function () {
          if (p.ui.tab === x[0]) return;
          p.ui.tab = x[0]; p.ui.all = {}; p.pages = {}; p.extra = {};
        }, { ui: true, cls: 'mchip' + (x[0] === t[0] ? ' on' : ''), pressed: x[0] === t[0], html: esc(x[1]) + ' <i>' + esc(n) + '</i>' });
      }).join('') + '</div>';
    var rows = tabRows(p, t), total = t[2].reduce(function (m, k) { return m + totalOf(p, k); }, 0);
    var all = !!p.ui.all[t[0]], shown = all ? rows : rows.slice(0, 10);
    out += '<div class="mp-items">' + (shown.length
      ? shown.map(function (x) { return itemHtml(p, reg, x.k, x.r); }).join('')
      : '<div class="empty">Nothing here.</div>') + '</div>';
    if (!all && rows.length > 10) {
      out += row(mk(reg, 'Show all', function () { p.ui.all[t[0]] = true; }, { ui: true }));
    } else if (all && rows.length < total) {
      out += '<div class="mp-more">Showing ' + esc(rows.length) + ' of ' + esc(total) + esc(DOT) +
        mk(reg, 'Older', async function () {
          for (var i = 0; i < t[2].length; i++) {
            var k = t[2][i], have = rowsOf(p, k);
            if (!have.length || have.length >= totalOf(p, k)) continue;
            var more = await OTP.deskMemberItems(p.id, k, have[have.length - 1].at);
            p.extra[k] = (p.extra[k] || []).concat(more);
            p.pages[k] = (p.pages[k] || 0) + 1;
          }
        }, { local: true }) + '</div>';
    }
    return out + '</section>';
  }

  /* ---- REPORTS (the person sheet and the REPORTS queue share these) ---- */
  var KIND_NAME = {
    dm: 'A chat', take_comment: 'A comment on the Take', flyer_comment: 'A comment on a Crypt flyer',
    space_post: 'A comment on a Crypt page', space: 'Their Crypt page', post: 'A post', pack: 'A pack',
    room: 'A room', frame_tag: 'A frame tag'
  };
  var HIDE_KINDS = ['take_comment', 'flyer_comment', 'post', 'pack', 'room'];
  var OUTCOME = { kept: 'kept', hidden: 'hidden', removed: 'removed', banned: 'banned', gone: 'already gone' };
  function whyWord(k) { return (w.OTP && OTP.REPORT_WHY && OTP.REPORT_WHY[k]) || (k ? 'Something else' : 'No reason given'); }

  function shotHtml(g) {
    var s = g.shot || {}, k = g.kind, out = '';
    if (k === 'take_comment' || k === 'flyer_comment' || k === 'space_post') out = s.b ? quote(s.b) : '';
    else if (k === 'post') {
      var im = pic(s.img);
      out = (s.text ? quote(s.text) : '') + (im ? '<img class="mg-pic" src="' + esc(im) + '" alt="" loading="lazy">' : '') +
        (s.members_only ? '<div class="mtags">' + pill('THE ROLL', 'git') + '</div>' : '');
    } else if (k === 'pack') {
      var cv = packUrl(s.cover);
      out = '<div class="mp-line"><b>' + esc(s.title || 'A pack') + '</b></div>' + (s.line ? quote(s.line) : '') +
        (cv ? '<img class="mg-pic" src="' + esc(cv) + '" alt="" loading="lazy">' : '');
    } else if (k === 'room') {
      out = '<div class="mp-line"><b>' + esc(s.name || 'A room') + '</b>' + (s.label ? esc(DOT + s.label) : '') + '</div>' +
        (s.line ? quote(s.line) : '');
    } else if (k === 'space') {
      out = (s.headline ? '<div class="mp-line"><b>' + esc(s.headline) + '</b></div>' : '') + (s.about ? quote(s.about) : '');
    } else if (k === 'frame_tag') {
      try {
        var th = repoPic(OTP.frameThumb(s.slug, s.media, '../'));
        out = (th ? '<img class="mg-pic" src="' + esc(th) + '" alt="" loading="lazy">' : '') +
          '<div class="mp-line">' + esc('Photo ' + (s.media || '') + DOT + (s.slug || '')) + '</div>';
      } catch (e) { out = ''; }
    }
    return out ? '<div class="mg-shot">' + out + '</div>' : '';
  }

  // one reported thing: what it said, who reported it and why, and what the desk can do
  function groupHtml(g, reg, ctx) {
    var kind = g.kind, about = g.about || null, key = kind + ':' + g.target;
    var n = +g.n || (g.reports || []).length;
    var st = g.state || 'up';
    var stp = st === 'gone' ? pill('GONE', 'hidden') : st === 'hidden' ? pill('HIDDEN', 'hidden') : pill('UP', 'live');
    var head = '<div class="mg-h"><b>' + esc(KIND_NAME[kind] || 'Something') + '</b>' +
      (ctx.queue && about ? ' <span class="mg-by">by ' + mk(reg, about.name || 'Member', function () {
        var b = B();
        if (b && b.openPerson) b.openPerson(about.sid || about.user_id);
      }, { ui: true, cls: 'mp-link' }) + '</span>' : '') +
      '<span class="mtags">' + stp + pill(plural(n, 'report', 'reports'), 'bad') + '</span></div>';
    var reps = (g.reports || []).map(function (rp) {
      return '<div class="mg-r"><b>' + esc((rp.by && rp.by.name) || 'Member') + '</b>' +
        esc(DOT + whyWord(rp.why) + DOT + day(rp.at)) + (rp.note ? quote(rp.note) : '') + '</div>';
    }).join('');
    var body = kind === 'dm' ? dmHtml(g, reg, ctx) : shotHtml(g) + reps;
    var acts = g.closed
      ? line('Closed' + (g.closed_at ? ' ' + day(g.closed_at) : '') + DOT + (OUTCOME[g.outcome] || 'kept') + '.')
      : kind === 'dm' ? '' : groupActs(g, reg, ctx, st, about);
    return '<div class="mg' + (g.closed ? ' closed' : '') + '" data-g="' + esc(key) + '">' + head + body + acts + '</div>';
  }
  function banBtn(reg, ctx, about, label, why) {
    if (!about || !about.user_id || about.kind === 'desk' || about.banned) return '';
    return mk(reg, label, async function () {
      await OTP.ban(about.user_id, true, why ? 'From a report: ' + why : 'From a report');
      ctx.touched = about.user_id;
      return { msg: 'Banned ' + (about.name || 'them') + '. Off the Crypt and the site.', undo: async function () {
        var s = await OTP.ban(about.user_id, false);
        await touch(about.user_id);
        if (ctx.reload) await ctx.reload();
        return unbanSaid(s);
      } };
    }, { sure: 'Tap again: off the Crypt and the site.', cls: 'btn bad sm' });
  }
  function groupActs(g, reg, ctx, st, about) {
    var kind = g.kind, tgt = g.target, b = [];
    // the reported person's row on the list (their report count) is re-read after, too
    var act = function (how) {
      if (about && about.user_id) ctx.touched = about.user_id;
      return OTP.deskAct(kind, tgt, how);
    };
    var goneSaid = 'That one is already gone. The report is closed.';
    if (st !== 'gone') {
      b.push(mk(reg, 'Keep', async function () {
        var r = await act('keep');
        return r.outcome === 'gone' ? goneSaid : 'Kept. The report is closed.';
      }));
      if (HIDE_KINDS.indexOf(kind) >= 0) {
        if (st === 'hidden') b.push(mk(reg, 'Show', async function () {
          var r = await act('unhide');
          return r.outcome === 'gone' ? goneSaid : 'Back up. The report stays open.';
        }));
        else b.push(mk(reg, 'Hide', async function () {
          var r = await act('hide');
          if (r.outcome === 'gone') return goneSaid;
          return { msg: 'Hidden. The report is closed.', undo: async function () {
            await act('unhide');
            if (ctx.reload) await ctx.reload();
            return 'Back up.';
          } };
        }));
      }
      if (kind === 'space') b.push(mk(reg, 'Reset the page', async function () {
        var r = await act('remove');
        return r.outcome === 'gone' ? goneSaid : 'Their page is back to the house colors.';
      }, { sure: 'Tap again: back to the house colors, pictures deleted', cls: 'btn bad sm' }));
      else b.push(mk(reg, 'Remove', async function () {
        var r = await act('remove');
        return r.outcome === 'gone' ? goneSaid : 'Removed. The report is closed.';
      }, { sure: 'Tap again to remove', cls: 'btn bad sm' }));
    } else {
      b.push(mk(reg, 'Close', async function () {
        if (about && about.user_id) ctx.touched = about.user_id;
        await OTP.closeReport(kind, tgt, 'gone');
        return 'Closed.';
      }));
    }
    if (ctx.queue) {
      var first = (g.reports || [])[0];
      b.push(banBtn(reg, ctx, about, 'Ban the author', first ? whyWord(first.why) : ''));
    }
    return row(b.join(''));
  }
  function dmHtml(g, reg, ctx) {
    var key = 'dm:' + g.target, about = g.about || null;
    var first = (g.reports || [])[0] || {};
    var names = {};
    (g.pair || []).forEach(function (x) { if (x && x.sid) names[x.sid] = x.name || 'Member'; });
    var live = Array.isArray(g.msgs) && g.msgs.length;
    var msgs = live ? g.msgs : ((g.shot && g.shot.msgs) || []);
    var open = !!ctx.read[key];
    var out = line('Reported by ' + ((first.by && first.by.name) || 'a member') + (first.at ? ' on ' + day(first.at) : '') + '.') +
      (first.note ? quote(first.note) : '');
    if (g.closed) return out;
    out += row(mk(reg, open ? 'Hide the chat' : 'Read it (' + msgs.length + ')', function () { ctx.read[key] = !open; }, { ui: true, pressed: open }));
    if (open) {
      out += '<div class="mg-msgs">' + (msgs.length ? msgs.map(function (m) {
        var who = names[m.from] || 'Member';
        var text = m.removed ? 'removed' : (m.b == null ? '' : m.b);
        return '<div class="mg-m' + (m.removed ? ' gone' : '') + '"><div class="mg-mh"><b>' + esc(who) + '</b>' +
          esc(m.t ? DOT + day(m.t) : '') + '</div><div class="mg-mb">' + esc(text) + '</div>' +
          (live && !m.removed && m.id != null ? mk(reg, 'Remove', async function () {
            if (about && about.user_id) ctx.touched = about.user_id;
            await OTP.deskRemoveMessage(m.id);
            return 'Removed.';
          }, { sure: 'Tap again to remove', cls: 'btn bad sm' }) : '') + '</div>';
      }).join('') : '<div class="empty">No messages to read.</div>') + '</div>' +
        note('Both of them see "removed by the desk", so the sender may guess who reported it.');
    }
    out += row(banBtn(reg, ctx, about, 'Ban ' + firstName(about && about.name), whyWord(first.why)) +
      mk(reg, 'Close the report', async function () {
        if (about && about.user_id) ctx.touched = about.user_id;
        await OTP.dmDeskClose(Number(g.target));
        return 'Closed.';
      }));
    return out;
  }

  function reportsHtml(p, reg) {
    var s = p.st, gs = Array.isArray(s.reports) ? s.reports : [];
    var ctx = { queue: false, read: p.ui.read, reload: function () { return reloadPerson(p); } };
    var by = +s.reports_by || 0;
    return sec('REPORTS ON THEM') +
      (gs.length ? gs.map(function (g) { return groupHtml(g, reg, ctx); }).join('') : note('Nobody reported them.')) +
      line(by ? 'They reported ' + plural(by, 'thing', 'things') + '.' : 'They have not reported anything.') + '</section>';
  }

  /* ---- HISTORY ---- */
  var WHAT_WORD = { page: 'their page reset', pic: 'photo cleared', wallpaper: 'wallpaper cleared', pic_one: 'an album picture cleared',
    about: 'about me cleared', headline: 'headline cleared', mood: 'mood cleared', meet: 'meet cleared', song: 'song cleared',
    links: 'links cleared', link_one: 'a link removed', tracks: 'the three tracks cleared' };
  var DO_WORD = { keep: 'kept', hide: 'hid', unhide: 'put back', remove: 'removed' };
  // 045's desk_mark_read logs 'read' on the desk's own row
  var READ_WORD = { pack: ['pack', 'packs'], room: ['room', 'rooms'], pick: ['pick', 'picks'], story: ['story', 'stories'],
    story_comment: ['story comment', 'story comments'] };
  function histLine(h) {
    var dt = h.detail || {}, you = !!h.by_desk;
    switch (h.action) {
      case 'ban': return 'banned' + (dt.note ? ' (' + dt.note + ')' : '');
      case 'unban': return 'unbanned';
      case 'close': return 'closed by you' + (dt.note ? ' (' + dt.note + ')' : '');
      case 'closed_self': return 'closed it themselves' + (dt.take_back ? ', messages taken back' : '');
      case 'reopen': return 'opened back up by you';
      case 'reopened_self': return 'opened it back up themselves';
      case 'card_on': return 'made a card holder' + (dt.slug ? ' (' + dt.slug + ')' : '');
      case 'card_off': return 'card taken back';
      case 'card_no': return 'you said no to a card';
      case 'card_unno': return 'you took back the no';
      case 'door_in': return 'let in at the door' + (dt.was === 'no' ? ' after all' : '') + (dt.ig ? ' (@' + dt.ig + ')' : '');
      case 'door_no': return 'turned away at the door' + (dt.ig ? ' (@' + dt.ig + ')' : '');
      case 'door_keep': return 'you looked at their @ and kept them' + (dt.ig ? ' (@' + dt.ig + ')' : '');
      case 'name': return you ? 'renamed by you' : dt.old ? 'changed their name' : 'picked a name';
      case 'ig': return you ? '@ fixed by you' : 'changed their @';
      case 'frame': return dt.frame ? 'frame ' + frameLabel(dt.frame) + ' handed out' : 'house frame taken back';
      case 'song': return dt.track ? 'song set by you' : 'song cleared by you';
      case 'page_clear': return (WHAT_WORD[dt.what] || 'something cleared') + ' by you';
      case 'item': return 'you ' + (DO_WORD[dt.do] || 'acted on') + ' ' + String(KIND_NAME[dt.kind] || 'something').toLowerCase();
      case 'untag': return 'a frame tag taken off';
      case 'dm_remove': return 'a message of theirs removed by you';
      case 'read':
        var rw = READ_WORD[dt.kind] || ['thing', 'things'];
        return 'you marked ' + plural(+dt.n || 0, rw[0], rw[1]) + ' as seen';
      default: return String(h.action || 'changed').replace(/_/g, ' ');
    }
  }
  function histHtml(p) {
    var hs = Array.isArray(p.st.history) ? p.st.history : [];
    return sec('HISTORY') + (hs.length
      ? '<div class="mp-hist">' + hs.map(function (h) { return '<div>' + esc(day(h.at) + DOT + histLine(h)) + '</div>'; }).join('') + '</div>'
      : note('Nothing yet.')) + '</section>';
  }

  /* ---- the live bits: the card hint as he types, the song read-out ---- */
  var SONGS = {};
  function wireLive(p) {
    p.el.querySelectorAll('[data-f]').forEach(function (inp) {
      if (inp.dataset.f !== 'card') return;
      var hint = null;
      p.el.querySelectorAll('[data-hint]').forEach(function (x) { if (x.dataset.hint === 'card') hint = x; });
      if (!hint) return;
      inp.addEventListener('input', function () { hint.textContent = cardHint(p, inp.value); });
    });
    var song = null, out = p.el.querySelector('[data-songsay]');
    p.el.querySelectorAll('[data-f]').forEach(function (x) { if (x.dataset.f === 'song') song = x; });
    if (!song || !out) return;
    var seq = 0, timer = null;
    function show(cls, html) { out.className = 'songsay' + (cls ? ' ' + cls : ''); out.innerHTML = html; }
    function run() {
      var mine = ++seq;
      var t = OTP.readTrack ? OTP.readTrack(song.value) : { id: null, empty: !song.value };
      if (t.empty) { show('', 'No song on their card.'); return; }
      if (!t.id) { show('bad', esc(t.why || 'That is not a Spotify track link.')); return; }
      if (SONGS[t.id]) { show('ok', SONGS[t.id]); return; }
      show('', 'reading…');
      fetch('https://open.spotify.com/oembed?url=https://open.spotify.com/track/' + t.id)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (meta) {
          if (mine !== seq) return;
          if (!meta || !meta.title) { show('ok', 'Track id looks right. Spotify did not answer, that is fine.'); return; }
          var img = pic(meta.thumbnail_url) || (/^https:\/\/(i\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)\//i.test(String(meta.thumbnail_url || '')) ? meta.thumbnail_url : '');
          var html = (img ? '<img src="' + esc(img) + '" alt="">' : '') + '<span><b>' + esc(meta.title) + '</b></span>';
          SONGS[t.id] = html;
          show('ok', html);
        });
    }
    song.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 320); });
    run();
  }

  /* ============================ QUEUE SHEETS ============================
     What is waiting on him, one sheet per queue: packs, rooms, flyer sources,
     reports. Each action re-reads the queue and the badge. */

  var Q = null;
  var QT = {
    packs: ['PACKS WAITING', 'members made these. nothing is up until you say'],
    rooms: ['ROOMS WAITING', 'a playlist and a name, waiting on you'],
    sources: ['FLYER SOURCES', 'accounts and links members sent for the Tuesday sweep'],
    reports: ['REPORTS', 'one entry per reported thing, open first']
  };

  function openQueue(kind) {
    var b = B();
    if (!b || !b.sheet) return;
    var k = QT[kind] ? kind : 'packs';
    if (Q && Q.h && Q.h.el.isConnected) Q.h.shut();
    var h = b.sheet({ title: QT[k][0], why: QT[k][1], tall: true, body: '<div class="mq" aria-live="polite"></div>' });
    h.box.classList.add('mp-sheet');
    var q = Q = {
      kind: k, h: h, el: h.el.querySelector('.mq'), rows: null, err: null, closed: false, gen: 0, say: null,
      read: {}, queue: true,
      repaint: function () { paintQueue(q); },
      reload: function () { return loadQueue(q); },
      after: function () {
        var t = q.touched; q.touched = null;
        return Promise.all([loadQueue(q), waiting(), t ? touch(t) : null]);
      }
    };
    paintQueue(q);
    loadQueue(q);
  }
  function qAlive(q) { return !!q && q === Q && q.h && q.h.el && q.h.el.isConnected; }

  async function loadQueue(q) {
    var mine = ++q.gen, rows = null, err = null;
    try {
      if (q.kind === 'reports') rows = await OTP.deskReports({ state: q.closed ? 'closed' : 'open' });
      else {
        var all = await OTP.deskQueue();
        rows = all && Array.isArray(all[q.kind]) ? all[q.kind] : [];
      }
    } catch (e) { err = e.message || String(e); }
    if (mine !== q.gen) return;
    q.rows = rows; q.err = err;
    if (qAlive(q)) paintQueue(q);
  }

  function byLine(by, extra) {
    return [by && by.name ? 'by ' + by.name : '', by && by.ig ? '@' + by.ig : ''].concat(extra || []).filter(Boolean).join(DOT);
  }
  function packRow(q, reg, x) {
    var cv = packUrl(x.cover);
    var open = PACK_OK.test(String(x.slug || '')) ? '<a class="btn ghost sm" href="../packs/?p=' + encodeURIComponent(x.slug) + '" target="_blank" rel="noopener">Open it</a>' : '';
    return '<div class="mi">' + (cv ? '<span class="mi-pic"><img src="' + esc(cv) + '" alt="" loading="lazy"></span>' : '') +
      '<div class="mi-b"><div class="mi-t">' + esc(x.title || 'A pack') + '</div>' + (x.line ? quote(x.line) : '') +
      '<div class="mi-s"><span>' + esc(byLine(x.by, [plural(+x.cards || 0, 'card', 'cards'), day(x.at)])) + '</span></div>' +
      '<div class="row mi-do">' + open +
        mk(reg, 'Put it up', async function () { await OTP.packDecide(x.id, true); return 'Up. It is in the packs now.'; }, { cls: 'btn sm' }) +
        mk(reg, 'No', async function () { await OTP.packDecide(x.id, false); return 'Said no. It stays down.'; }) +
      '</div></div></div>';
  }
  function roomRow(q, reg, x) {
    var listen = PLAYLIST_OK.test(String(x.playlist || ''))
      ? '<a class="btn ghost sm" href="https://open.spotify.com/playlist/' + encodeURIComponent(x.playlist) + '" target="_blank" rel="noopener noreferrer">Listen</a>' : '';
    return '<div class="mi"><div class="mi-b"><div class="mi-t">' + esc(x.name || 'A room') + (x.label ? esc(DOT + x.label) : '') + '</div>' +
      (x.line ? quote(x.line) : '') +
      '<div class="mi-s"><span>' + esc(byLine(x.by, [day(x.at)])) + '</span></div>' +
      '<div class="row mi-do">' + listen +
        mk(reg, 'Put it up', async function () { await OTP.roomDecide(x.id, true); return 'Up. The room is open.'; }, { cls: 'btn sm' }) +
        mk(reg, 'No', async function () { await OTP.roomDecide(x.id, false); return 'Said no. It stays down.'; }) +
      '</div></div></div>';
  }
  function sourceRow(q, reg, x) {
    var src = String(x.source || '');
    var href = x.kind === 'ig' && IG_OK.test(src) ? 'https://instagram.com/' + encodeURIComponent(src) + '/'
             : x.kind === 'link' && /^https:\/\/[^\s"'<>]+$/i.test(src) ? src : '';
    var label = (x.kind === 'ig' ? '@' : '') + src;
    return '<div class="mi"><div class="mi-b"><div class="mi-t">' +
      (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>' : esc(label)) + '</div>' +
      (x.note ? quote(x.note) : '') +
      '<div class="mi-s"><span>' + esc(['from ' + (x.by_name || 'a member'), x.by_ig ? '@' + x.by_ig : '', day(x.created_at)].filter(Boolean).join(DOT)) + '</span></div>' +
      '<div class="row mi-do">' +
        mk(reg, 'Add to the sweep', async function () { await OTP.sourceDecide(x.id, 'approved'); return 'Added. The Tuesday sweep reads it.'; }, { cls: 'btn sm' }) +
        mk(reg, 'No', async function () { await OTP.sourceDecide(x.id, 'denied'); return 'Said no.'; }) +
      '</div></div></div>';
  }

  function paintQueue(q) {
    if (!qAlive(q)) return;
    var reg = [], top = q.h.box.scrollTop, rows = q.rows, k = q.kind, html = '';
    if (k === 'reports') {
      html += '<div class="row mq-top">' + mk(reg, q.closed ? 'Open reports' : 'Closed reports', function () {
        q.closed = !q.closed; q.rows = null; q.read = {}; loadQueue(q);
      }, { ui: true, pressed: q.closed }) + '</div>';
    }
    if (q.err) html += note(q.err, 'warn');
    else if (!rows) html += note('reading the queue…');
    else if (!rows.length) html += '<div class="empty">' + (k === 'reports' ? (q.closed ? 'No closed reports.' : 'No open reports.') : 'Nothing waiting.') + '</div>';
    else if (k === 'reports') html += rows.map(function (g) { return groupHtml(g, reg, q); }).join('');
    else html += '<div class="mp-items">' + rows.map(function (x) {
      return k === 'packs' ? packRow(q, reg, x) : k === 'rooms' ? roomRow(q, reg, x) : sourceRow(q, reg, x);
    }).join('') + '</div>';
    if ((k === 'packs' || k === 'rooms') && rows && rows.length) {
      html += row(mk(reg, 'Mark all as seen', async function () {
        var n = await OTP.deskMarkAllSeen(k === 'packs' ? 'pack' : 'room');
        return n ? n + ' marked seen. They stay down.' : 'Nothing left to mark.';
      }, { sure: 'Tap again: mark them all seen' })) +
        note('Every one still down is marked seen and leaves the badge. Nothing goes up.');
    }
    q.el.innerHTML = html;
    wire(q.el, reg, q);
    q.h.box.scrollTop = top;
  }

  // A NOW chip or a MAP row is a fresh ask: the render it makes (board.js paints in the same tap) applies its filter
  // again. Caught before the board's own handler runs, and forgotten once the tap is over, so a re-read later still
  // keeps the chips he picked.
  d.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('.nowchip, .caprow button.go')) return;
    L.fresh = true;
    setTimeout(function () { L.fresh = false; }, 0);
  }, true);

  w.BOARD_MEMBERS = { render: render, openPerson: openPerson, openQueue: openQueue };

})(window, document);
