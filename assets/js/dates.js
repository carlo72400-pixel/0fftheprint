/* 0FF THE PRINT, /dates/ — the page.
 *
 * Thin on purpose. The grid, the add/edit sheet and every date helper live in
 * calendar.js, because the homepage draws the same calendar and two
 * implementations of a calendar is two calendars that drift.
 *
 * The page is the GRID plus the LIST. A grid is the shape of a month, a list is
 * the detail of it; a calendar that only does one of those is half a calendar.
 */
(function (w, d) {
  'use strict';

  var C = w.OTPCal;
  var me = null, admin = false, mine = false;
  var rows = [], pastRows = null, loadedPast = false;
  var state = (function () { var n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() }; })();
  var startedAt = false;   // the opening month is picked once, after the first load

  var esc = C.esc;

  function all() { return rows.concat(pastRows || []); }

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
    var who = r.by || (r.profiles && r.profiles.card_slug);
    var whoName = r.by_name || (r.profiles && r.profiles.display_name) || who;
    if (who) meta.push('<a class="by" href="../c/' + encodeURIComponent(who) + '/">' + esc(whoName) + '</a>');
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
      '</div>';

    var acts = [];
    if (admin) {
      acts.push(['Pull it', 'Put it back', async function () {
        try { await OTP.setDatePublished(r.id, r.published === false); await load(); }
        catch (e) { alert(e.message); }
      }]);
      acts.push(['Edit', null, function () { C.sheet(r, load, { admin: admin }); }]);
    } else if (mine && me && me.profile && who === me.profile.card_slug) {
      acts.push(['Edit', null, function () { C.sheet(r, load, { admin: admin }); }]);
    }
    if (acts.length) {
      var bar = d.createElement('div');
      bar.className = 'd-acts';
      acts.forEach(function (a) {
        var b = d.createElement('button');
        b.type = 'button'; b.className = 'btn ghost sm';
        b.textContent = (a[1] && r.published === false) ? a[1] : a[0];
        b.onclick = a[2];
        bar.appendChild(b);
      });
      el.querySelector('.d-body').appendChild(bar);
    }
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
  async function ensurePastFor(y, mo) {
    if (loadedPast) return;
    var n = new Date();
    if (y > n.getFullYear() || (y === n.getFullYear() && mo >= n.getMonth())) return;
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

  function paint() {
    var panel = d.getElementById('panel');
    panel.innerHTML = '';

    if (mine) {
      var bar = d.createElement('div');
      bar.className = 'addbar';
      var add = d.createElement('button');
      add.type = 'button'; add.className = 'btn'; add.textContent = 'Add a date';
      add.onclick = function () { C.sheet(null, load, { admin: admin }); };
      bar.appendChild(add);
      panel.appendChild(bar);
    } else {
      var l = d.createElement('div');
      l.className = 'wholine';
      l.innerHTML = me
        ? 'You are in the queue. Card holders add their own dates here.'
        : 'Card holders add their own dates. <a href="../join/">Got a card? Log in.</a>';
      panel.appendChild(l);
    }

    var gw = d.createElement('div');
    gw.className = 'cal-wrap';
    panel.appendChild(gw);
    C.grid(gw, all(), state, {
      onPick: jumpTo,
      onMonth: async function (y, mo) { await ensurePastFor(y, mo); paint(); }
    });

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

  async function load() {
    if (admin) {
      var raw = await OTP.calendarAll(300);
      var t = C.todayYMD();
      var mapped = (raw || []).map(function (r) {
        return Object.assign({}, r, {
          by: r.profiles && r.profiles.card_slug,
          by_name: r.profiles && r.profiles.display_name
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
    paint();
  }

  async function boot() {
    var panel = d.getElementById('panel');
    if (!w.OTP || !OTP.configured) {
      panel.innerHTML = '<div class="note">Backend not switched on yet.</div>'; return;
    }
    try { me = await OTP.me(); } catch (e) { me = null; }
    admin = !!(me && me.profile && me.profile.is_admin);
    mine  = !!(me && me.profile && me.profile.approved);
    try { await load(); }
    catch (e) {
      console.error(e);
      panel.innerHTML = '<div class="note">' +
        (/relation|does not exist|schema cache/i.test(e.message || '')
          ? 'The calendar is not switched on yet. Run migration-020-the-calendar.sql.'
          : esc(e.message || 'That did not load.')) + '</div>';
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
