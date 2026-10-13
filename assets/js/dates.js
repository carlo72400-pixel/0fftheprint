/* 0FF THE PRINT, /dates/ — the page.
 *
 * Thin on purpose. The grid, the add/edit sheet and every date helper live in
 * calendar.js, because the homepage draws the same calendar and two
 * implementations of a calendar is two calendars that drift.
 *
 * The page is the GRID plus the LIST. A grid is the shape of a month, a list is
 * the detail of it; a calendar that only does one of those is half a calendar.
 *
 * WAVE 2, CALL 6: THE RUN IS THE ONE PLACE. This page is where a card holder
 * puts a date up, and it is What's coming for a stranger. The desk runs the
 * list from the board (THE RUN), so here it only gets a way there: one "Fix it
 * on the board" per date, no Pull and no Edit. Each viewer gets one line that
 * says what the Run is to THEM (who = out | pending | casual | card | desk |
 * gone). The stranger's line is in the HTML, so it is there on the first frame.
 */
(function (w, d) {
  'use strict';

  var C = w.OTPCal;
  var me = null, admin = false, mine = false, who = 'out', hasIg = false;
  var rows = [], pastRows = null, loadedPast = false;
  var state = (function () { var n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() }; })();
  var startedAt = false;   // the opening month is picked once, after the first load

  var esc = C.esc;

  function all() { return rows.concat(pastRows || []); }

  // A credit MOVES a night (025): it is whoever is credited, and the person who
  // typed it in only when nobody is. Same rule as datesFor() and the Music lineup.
  function whoseNight(r) {
    var slug = r.credit || r.by || (r.profiles && r.profiles.card_slug) || '';
    var name = r.credit ? (r.credit_name || r.credit)
             : (r.by_name || (r.profiles && r.profiles.display_name) || slug);
    return { slug: slug, name: name };
  }

  function rowEl(r) {
    var p = C.parts(r.on_date);
    var el = d.createElement('div');
    el.className = 'd-row' + (r.published === false ? ' pulled' : '');
    el.id = 'dt-' + r.id;
    var link = C.safeLink(r.link);
    var meta = [];
    if (C.clock(r.start_time)) meta.push('<span>' + esc(C.clock(r.start_time)) + '</span>');
    if (r.venue) meta.push('<span>' + esc(r.venue) + '</span>');
    if (r.city) meta.push('<span>' + esc(r.city) + '</span>');
    var wn = whoseNight(r);
    if (wn.slug) meta.push('<a class="by" href="../c/' + encodeURIComponent(wn.slug) + '/">' + esc(wn.name) + '</a>');
    // only the desk ever holds a pulled row (calendarAll); the view has none
    if (r.published === false) meta.push('<span class="pill off">pulled</span>');
    // THE EXCHANGE. Public on purpose: a night the house is coming to should
    // read as one on everybody's screen, not only on the member's own page.
    var hx = C.houseLabel(r);
    if (hx) {
      var slug = hx.k === 'shot' && r.event_slug ? String(r.event_slug) : '';
      meta.push(slug
        ? '<a class="pill house ' + hx.k + '" href="../events/' + encodeURIComponent(slug) +
          '/">' + esc(hx.t) + '</a>'
        : '<span class="pill house ' + hx.k + '">' + esc(hx.t) + '</span>');
    }

    el.innerHTML =
      '<div class="d-when"><span class="m">' + (p ? C.MON[p.mo] : '') + '</span>' +
        '<span class="d">' + (p ? p.day : '?') + '</span>' +
        '<span class="dow">' + (p ? C.DOW[p.dow] : '') + '</span></div>' +
      '<div class="d-body">' +
        '<div class="d-title">' + (link
          ? '<a href="' + esc(link) + '" target="_blank" rel="noopener nofollow">' + esc(r.title) + '</a>'
          : esc(r.title)) + '</div>' +
        '<div class="d-meta"><span class="kind ' + esc(r.kind || 'show') + '">' +
          esc(r.kind || 'show') + '</span>' + meta.join('') + '</div>' +
        (r.note ? '<div class="d-note">' + esc(r.note) + '</div>' : '') +
      '</div>' +
      // the kind icon. iconURL() only ever returns one of six known files.
      (C.iconURL ? '<img class="d-ic" src="' + esc(C.iconURL(r.kind)) + '" alt="" width="52" height="52" loading="lazy" decoding="async">' : '');

    var bar = null;
    if (admin) {
      // ⛔ ONE WAY IN FOR THE DESK. Pull and Edit live on the board's sheet now
      // (the credit, the house's answer, the dump), and two editors for one date
      // is two editors that drift. boardDate() only ever builds a #run link.
      bar = d.createElement('div');
      bar.className = 'd-acts';
      var fix = d.createElement('a');
      fix.className = 'btn ghost sm';
      fix.href = OTP.boardDate(r.id);
      fix.textContent = 'Fix it on the board';
      bar.appendChild(fix);
    } else if (mine && me && me.profile && me.profile.card_slug && r.by === me.profile.card_slug) {
      // a card holder edits what THEY put up. `by` is who typed it, not who it is
      // credited to: a night the desk credited to them is still the desk's row.
      bar = d.createElement('div');
      bar.className = 'd-acts';
      var b = d.createElement('button');
      b.type = 'button'; b.className = 'btn ghost sm';
      b.textContent = 'Edit';
      b.onclick = function () { C.sheet(r, load, { admin: false }); };
      bar.appendChild(b);
    }
    if (bar) el.querySelector('.d-body').appendChild(bar);
    return el;
  }

  function monthsInto(mount, list) {
    var seen = null;
    list.forEach(function (r) {
      var p = C.parts(r.on_date);
      var key = p ? p.y + '-' + p.mo : '?';
      if (key !== seen) {
        seen = key;
        var h = d.createElement('div');
        h.className = 'month';
        h.innerHTML = esc(p ? C.MONTH[p.mo] : 'Undated') + '<span>' + (p ? p.y : '') + '</span>';
        mount.appendChild(h);
        var rule = d.createElement('div'); rule.className = 'rule'; mount.appendChild(rule);
      }
      mount.appendChild(rowEl(r));
    });
  }

  // Paging the grid back before today needs the archive, which is not loaded
  // until something asks for it.
  // ⛔ THE CURRENT MONTH NEEDS IT TOO. OTP.calendar() starts at today, so on
  //    the 20th the grid painted an empty first three weeks while nine shot
  //    nights sat in the table, and they only appeared if you paged to the
  //    month before and back. A month is "past enough" the moment it contains
  //    any day before today, which the current month always does after the 1st.
  async function ensurePastFor(y, mo) {
    if (loadedPast) return;
    var n = new Date();
    if (y > n.getFullYear() || (y === n.getFullYear() && mo > n.getMonth())) return;
    loadedPast = true;
    try { pastRows = await OTP.calendarPast(200); } catch (e) { pastRows = []; }
  }

  function jumpTo(r) {
    var el = d.getElementById('dt-' + r.id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /* ONE LINE PER VIEWER. The stranger keeps the HTML's line (the Crypt pitch)
     and gets the log in here; everyone signed in gets the first sentence there
     and their own line here.
     Every link is a fixed page, nothing out of the database reaches these. */
  function wholine(html) {
    var l = d.createElement('p');
    l.className = 'wholine run-role';
    l.innerHTML = html;
    return l;
  }
  function sayWho(panel) {
    var top = d.getElementById('run-line');
    if (top && who !== 'out')
      top.innerHTML = 'The house&rsquo;s nights and the roster&rsquo;s own shows, in one list.';

    if (who === 'out') {
      // the HTML's line is the way in for a new face; a card holder who is only
      // signed out logs in here, and next=dates brings them back to this page
      panel.appendChild(wholine('Got a card? <a href="../join/?next=dates">Log in</a> and put your own dates up.'));
    } else if (who === 'pending') {
      // a login that already carries an @ (it knocked on /join/) walks straight
      // into the Crypt; only one with none has anything to type there
      panel.appendChild(wholine('One more step and you see every flyer: ' + (hasIg
        ? '<a href="../wall/">walk into the Crypt</a>.'
        : '<a href="../wall/">put your Instagram in at the Crypt</a>.')));
    } else if (who === 'casual') {
      panel.appendChild(wholine('Every flyer and every show, on one calendar: ' +
        '<a href="../wall/#cal">open the Crypt</a>. Card holders put their own dates up here.'));
    } else if (who === 'card') {
      var bar = d.createElement('div');
      bar.className = 'addbar';
      var add = d.createElement('button');
      add.type = 'button'; add.className = 'btn'; add.id = 'run-add'; add.textContent = 'Put a date up';
      add.onclick = function () { C.sheet(null, load, { admin: false }); };
      bar.appendChild(add);
      panel.appendChild(bar);
      panel.appendChild(wholine('It goes on the Run and in the Crypt straight away. ' +
        'Want the house there? Tick ask the house.'));
    } else if (who === 'desk') {
      panel.appendChild(wholine('You run this list from the board. ' +
        '<a href="../board/#run">Open THE RUN</a>'));
    }
    // 'gone' (a banned or closed login) gets the first sentence and nothing to do
  }

  function paint() {
    var panel = d.getElementById('panel');
    panel.innerHTML = '';
    sayWho(panel);

    var gw = d.createElement('div');
    gw.className = 'cal-wrap';
    panel.appendChild(gw);
    C.grid(gw, all(), state, {
      onPick: jumpTo,
      onMonth: async function (y, mo) { await ensurePastFor(y, mo); paint(); }
    });
    // First paint of the month the viewer lands on: pull the archive once so the
    // days before today in THIS month are not blank. Repaint only if it added rows.
    if (!loadedPast) {
      var nw = new Date();
      ensurePastFor(nw.getFullYear(), nw.getMonth()).then(function () {
        if ((pastRows || []).length) paint();
      });
    }

    if (!rows.length) {
      var e = d.createElement('div');
      e.className = 'empty-cal';
      e.textContent = 'nothing on the run yet';
      panel.appendChild(e);
    } else {
      monthsInto(panel, rows);
    }

    var pt = d.createElement('button');
    pt.type = 'button'; pt.className = 'past-toggle';
    pt.textContent = 'What already happened';
    pt.onclick = async function () {
      if (!loadedPast) {
        pt.textContent = 'Reading…';
        loadedPast = true;
        try { pastRows = await OTP.calendarPast(200); } catch (e) { pastRows = []; }
      }
      pt.remove();
      var wrap = d.createElement('div');
      if (!(pastRows || []).length) {
        wrap.className = 'empty-cal'; wrap.textContent = 'nothing behind us yet';
      } else monthsInto(wrap, pastRows);
      panel.appendChild(wrap);
    };
    panel.appendChild(pt);
  }

  async function fetchRows() {
    if (admin) {
      // The desk reads the table (pulled rows too, marked pulled), and the view
      // beside it for whose night each one is: the table only holds the credit
      // as a uuid. A view that does not answer costs the names, never the list.
      // The view is read both ways from today, so a night already gone says
      // whose it was too. A pulled night is not in the view and keeps its typist.
      // ⛔ 200, THE BOARD'S NUMBER. The board's THE RUN reads calendarAll(200)
      //    and #run:<id> only finds what it read, so a row this page held past
      //    the board's 200 sent "Fix it on the board" to "No date by that link."
      var got = await Promise.all([
        OTP.calendarAll(200),
        OTP.calendar(200).catch(function () { return []; }),
        OTP.calendarPast(200).catch(function () { return []; })
      ]);
      var view = {};
      (got[1] || []).concat(got[2] || []).forEach(function (v) { view[v.id] = v; });
      var t = C.todayYMD();
      var mapped = (got[0] || []).map(function (r) {
        var v = view[r.id];
        return Object.assign({}, r, {
          by: (v && v.by) || (r.profiles && r.profiles.card_slug),
          by_name: (v && v.by_name) || (r.profiles && r.profiles.display_name),
          credit: v ? v.credit || null : null,
          credit_name: v ? v.credit_name || null : null
        });
      });
      rows = mapped.filter(function (r) { return r.on_date >= t; });
      // the desk already holds the whole table, so the archive is free
      pastRows = mapped.filter(function (r) { return r.on_date < t; })
                       .sort(function (a, b) { return b.on_date.localeCompare(a.on_date); });
      loadedPast = true;
    } else {
      rows = await OTP.calendar(200);
    }
    if (!startedAt) { startedAt = true; var st = C.startMonth(rows); state.y = st.y; state.mo = st.mo; }
  }

  async function load() {
    await fetchRows();
    paint();
  }

  // ⛔ ONLY A MISSING TABLE MEANS 020 HAS NOT RUN. The old test was a bare
  //    /relation|does not exist|schema cache/, and "more than one relationship
  //    was found" (PGRST201, an embed PostgREST cannot tell apart), a missing
  //    column or function, or a missing foreign key all matched it, so the desk
  //    was told to re-run 020 for an error 020 has nothing to do with.
  //    PGRST205 is PostgREST's "no such table or view", 42P01 is Postgres's own.
  function tableMissing(e) {
    var c = e && e.code, m = String((e && e.message) || '');
    return c === 'PGRST205' || c === '42P01' ||
           /relation "[^"]+" does not exist|could not find the table/i.test(m);
  }

  /* Who is looking. me() settles the desk and a card holder (my_profile already
     reports a banned or closed holder as not approved). Anyone else signed in
     asks my_account whether they are in the Crypt yet: 'pending' is a login
     that has not walked in (with or without an Instagram on it). An account
     that will not answer gets the casual line, whose Crypt link is right for
     both. */
  function whoOf(acct) {
    hasIg = !!(acct && acct.ig);
    if (!me) return 'out';
    if (admin) return 'desk';
    if (mine) return 'card';
    if (acct && (acct.banned || acct.closed)) return 'gone';
    if (acct && acct.kind === 'pending') return 'pending';
    return 'casual';
  }

  async function boot() {
    var panel = d.getElementById('panel');
    if (!w.OTP || !OTP.configured) {
      panel.innerHTML = '<div class="note">Backend not switched on yet.</div>'; return;
    }
    try { me = await OTP.me(); } catch (e) { me = null; }
    admin = !!(me && me.profile && me.profile.is_admin);
    mine  = !admin && !!(me && me.profile && me.profile.approved);
    // the account ask and the list go out together; neither waits on the other
    var acctP = (me && !admin && !mine)
      ? OTP.account().catch(function () { return null; })
      : Promise.resolve(null);
    var failed = null;
    await Promise.all([
      fetchRows().catch(function (e) { failed = e; }),
      acctP.then(function (a) { who = whoOf(a); })
    ]);
    if (!failed) { paint(); return; }
    console.error(failed);
    panel.innerHTML = '';
    sayWho(panel);
    var n = d.createElement('div');
    n.className = 'note';
    n.textContent = tableMissing(failed)
      ? 'The calendar is not switched on yet. Run migration-020-the-calendar.sql.'
      : (failed.message || 'That did not load.');
    panel.appendChild(n);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
