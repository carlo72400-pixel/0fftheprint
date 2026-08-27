/* 0FF THE PRINT, THE CALENDAR, shared.
 *
 * The month grid, the add/edit sheet and the date helpers, in one file, because
 * the homepage and /dates/ both draw them and two implementations of a calendar
 * is two calendars that drift.
 *
 * ⛔ EVERY DATE IS A Y-M-D STRING UNTIL IT IS FORMATTED. new Date('2026-09-15')
 *    parses as UTC MIDNIGHT, which is the evening BEFORE in San Antonio, so a
 *    naive Date renders every date one day early for the exact city this site is
 *    written for. ymd() builds a LOCAL date from the parts. Nothing in here is
 *    allowed to hand a raw value to the Date constructor.
 */
(function (w, d) {
  'use strict';

  var MON   = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var MONTH = ['January','February','March','April','May','June','July','August',
               'September','October','November','December'];
  var DOW   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parts(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    if (!m) return null;
    return { y: +m[1], mo: +m[2] - 1, day: +m[3],
             dow: new Date(+m[1], +m[2] - 1, +m[3]).getDay() };
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayYMD() {
    var n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }
  function ymd(y, mo, day) { return y + '-' + pad(mo + 1) + '-' + pad(day); }
  function clock(t) {
    var m = /^(\d{2}):(\d{2})/.exec(String(t || ''));
    if (!m) return '';
    var h = +m[1], ap = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (!h) h = 12;
    return h + (m[2] === '00' ? '' : ':' + m[2]) + ap;
  }
  // 020's CHECK is what actually enforces the scheme; this only refuses what
  // never reached the table.
  function safeLink(u) {
    var v = String(u || '').trim();
    return /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(v) ? v : '';
  }

  /* ------------------------------ the sheet ------------------------------ */
  function sheet(row, onDone) {
    var back = d.createElement('div');
    back.className = 'sh-back';
    var r = row || {};
    var kinds = (w.OTP && OTP.CAL_KINDS) || ['show','drop','release','booth','festival','other'];
    back.innerHTML =
      '<div class="sh">' +
        '<h3>' + (row ? 'Edit the date' : 'Add a date') + '</h3>' +
        '<div class="note">Anything you have coming up. It goes live straight away.</div>' +
        '<label for="cf-title">What is it</label>' +
        '<input id="cf-title" type="text" maxlength="90" value="' + esc(r.title || '') + '" ' +
          'placeholder="the show, the drop, the release">' +
        '<div class="two">' +
          '<div><label for="cf-date">Date</label>' +
            '<input id="cf-date" type="date" value="' + esc(r.on_date || '') + '"></div>' +
          '<div><label for="cf-time">Time (optional)</label>' +
            '<input id="cf-time" type="time" value="' + esc((r.start_time || '').slice(0,5)) + '"></div>' +
        '</div>' +
        '<label for="cf-kind">Kind</label>' +
        '<select id="cf-kind">' + kinds.map(function (k) {
            return '<option value="' + k + '"' + (r.kind === k ? ' selected' : '') + '>' + k + '</option>';
          }).join('') + '</select>' +
        '<div class="two">' +
          '<div><label for="cf-venue">Venue (optional)</label>' +
            '<input id="cf-venue" type="text" maxlength="80" value="' + esc(r.venue || '') + '"></div>' +
          '<div><label for="cf-city">City (optional)</label>' +
            '<input id="cf-city" type="text" maxlength="60" value="' + esc(r.city || '') + '"></div>' +
        '</div>' +
        '<label for="cf-link">Link (optional)</label>' +
        '<input id="cf-link" type="url" value="' + esc(r.link || '') + '" placeholder="https://">' +
        '<div class="note">Has to start with https://</div>' +
        '<label for="cf-note">A line about it (optional)</label>' +
        '<textarea id="cf-note" rows="3" maxlength="240">' + esc(r.note || '') + '</textarea>' +
        '<div class="say"></div>' +
        '<div class="foot">' +
          '<button class="btn" id="cf-go">' + (row ? 'Save' : 'Put it up') + '</button>' +
          '<button class="btn ghost" id="cf-x">Never mind</button>' +
        '</div>' +
        (row ? '<button class="btn bad" id="cf-del" style="width:100%;margin-top:10px">Remove this date</button>' : '') +
      '</div>';
    d.body.appendChild(back);

    var say = back.querySelector('.say');
    function shut() { back.remove(); d.removeEventListener('keydown', key); }
    function key(e) { if (e.key === 'Escape') shut(); }
    d.addEventListener('keydown', key);
    back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    back.querySelector('#cf-x').onclick = shut;

    back.querySelector('#cf-go').onclick = async function () {
      var b = this;
      var v = {
        title: back.querySelector('#cf-title').value,
        onDate: back.querySelector('#cf-date').value,
        startTime: back.querySelector('#cf-time').value,
        kind: back.querySelector('#cf-kind').value,
        venue: back.querySelector('#cf-venue').value,
        city: back.querySelector('#cf-city').value,
        link: back.querySelector('#cf-link').value,
        note: back.querySelector('#cf-note').value
      };
      b.disabled = true; say.className = 'say'; say.textContent = 'Saving…';
      try {
        if (row) await OTP.updateDate(row.id, v); else await OTP.addDate(v);
        shut(); if (onDone) await onDone();
      } catch (e) {
        say.className = 'say bad'; say.textContent = e.message || String(e);
        b.disabled = false;
      }
    };
    var del = back.querySelector('#cf-del');
    if (del) del.onclick = async function () {
      if (this.dataset.sure !== '1') {
        this.dataset.sure = '1'; this.textContent = 'Tap again to remove it'; return;
      }
      this.disabled = true;
      try { await OTP.deleteDate(row.id); shut(); if (onDone) await onDone(); }
      catch (e) { say.className = 'say bad'; say.textContent = e.message; this.disabled = false; }
    };
  }

  /* ------------------------------- the grid -------------------------------
     opts: { onPick(row), canEdit(row), onMonth(y, mo) } */
  function grid(mount, rows, state, opts) {
    opts = opts || {};
    mount.innerHTML = '';
    var y = state.y, mo = state.mo;

    var head = d.createElement('div');
    head.className = 'cal-head';
    head.innerHTML = '<b>' + esc(MONTH[mo]) + '</b><span class="yr">' + y + '</span>' +
      '<span class="cal-nav">' +
        '<button type="button" data-go="-1" aria-label="Previous month">&#8249;</button>' +
        '<button type="button" class="today" data-go="0">today</button>' +
        '<button type="button" data-go="1" aria-label="Next month">&#8250;</button>' +
      '</span>';
    mount.appendChild(head);
    head.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () {
        var g = +b.dataset.go;
        if (g === 0) { var n = new Date(); state.y = n.getFullYear(); state.mo = n.getMonth(); }
        else {
          state.mo += g;
          if (state.mo < 0) { state.mo = 11; state.y--; }
          if (state.mo > 11) { state.mo = 0; state.y++; }
        }
        if (opts.onMonth) opts.onMonth(state.y, state.mo);
      };
    });

    var g = d.createElement('div');
    g.className = 'cal-grid';
    DOW.forEach(function (n) {
      var h = d.createElement('div'); h.className = 'cal-dow'; h.textContent = n; g.appendChild(h);
    });

    // bucket by day, so a cell is a lookup and not a scan per square
    var byDay = {};
    (rows || []).forEach(function (r) {
      var p = parts(r.on_date);
      if (p && p.y === y && p.mo === mo) (byDay[p.day] = byDay[p.day] || []).push(r);
    });

    var first = new Date(y, mo, 1).getDay();
    var days  = new Date(y, mo + 1, 0).getDate();
    var prevDays = new Date(y, mo, 0).getDate();
    var today = todayYMD();
    // ⛔ Render WHOLE weeks. Looping a fixed 42 and skipping the trailing
    // out-of-month cells leaves the last row short, and the grid's own gap
    // colour shows through as one wide block that reads as a broken layout.
    var weeks = Math.ceil((first + days) / 7);

    for (var i = 0; i < weeks * 7; i++) {
      var cell = d.createElement('div');
      var n = i - first + 1;
      var out = n < 1 || n > days;
      var shown = out ? (n < 1 ? prevDays + n : n - days) : n;
      cell.className = 'cal-cell' + (out ? ' out' : '');
      if (!out && ymd(y, mo, n) === today) cell.className += ' today';
      var list = (!out && byDay[n]) || [];
      if (list.length) cell.className += ' has';
      cell.innerHTML = '<span class="cal-num">' + shown + '</span>';

      list.slice(0, 2).forEach(function (r) {
        var b = d.createElement('button');
        b.type = 'button';
        b.className = 'cal-ev ' + esc(r.kind || 'show') + (r.published === false ? ' pulled' : '');
        b.textContent = r.title || '';
        b.title = [r.title, r.venue, r.city].filter(Boolean).join(' · ');
        b.onclick = function () { if (opts.onPick) opts.onPick(r); };
        cell.appendChild(b);
      });
      if (list.length > 2) {
        var more = d.createElement('button');
        more.type = 'button'; more.className = 'cal-more';
        more.textContent = '+' + (list.length - 2) + ' more';
        (function (l) { more.onclick = function () { if (opts.onPick) opts.onPick(l[2]); }; })(list);
        cell.appendChild(more);
      }
      g.appendChild(cell);
    }
    mount.appendChild(g);
  }

  /* The month a calendar should OPEN on is the one with something in it. If
     this month is empty and there is a date coming, start there instead of
     showing an empty grid and making someone hunt for the arrow. */
  function startMonth(rows) {
    var n = new Date(), y = n.getFullYear(), mo = n.getMonth();
    var has = (rows || []).some(function (r) {
      var p = parts(r.on_date); return p && p.y === y && p.mo === mo;
    });
    if (has) return { y: y, mo: mo };
    var t = todayYMD();
    var next = (rows || []).filter(function (r) { return String(r.on_date) >= t; })
      .sort(function (a, b) { return String(a.on_date).localeCompare(String(b.on_date)); })[0];
    var p = next && parts(next.on_date);
    return p ? { y: p.y, mo: p.mo } : { y: y, mo: mo };
  }

  w.OTPCal = {
    startMonth: startMonth,
    MON: MON, MONTH: MONTH, DOW: DOW,
    esc: esc, parts: parts, todayYMD: todayYMD, ymd: ymd, clock: clock, safeLink: safeLink,
    sheet: sheet, grid: grid
  };
})(window, document);
