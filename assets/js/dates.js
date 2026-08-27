/* 0FF THE PRINT, THE CALENDAR.  /dates/
 *
 * 0TP-006 THE FALL RUN is a hand-written story listing every Texas date between
 * now and Halloween, and it ends with "If your show belongs on this list and is
 * not, the DMs are open." That is a submission form being run by hand in a DM.
 * This is the form, and the list it feeds.
 *
 * PUBLISHED IS TRUE AT THE DATABASE, his call. A card holder's date is live the
 * second they add it and the desk pulls it if it is wrong. That puts the
 * calendar on the posts side of the house rule rather than the approval side,
 * because a show announced three days out is worthless behind a queue.
 *
 * ⛔ EVERY DATE IS HANDLED AS A PLAIN Y-M-D STRING, never a Date object, until
 *    the moment it is formatted. `new Date('2026-09-15')` parses as UTC
 *    MIDNIGHT, which is the previous evening in San Antonio, so every date on
 *    this page would render one day early for the entire city it is written for.
 *    fmt() splits the string and builds a LOCAL date instead.
 */
(function (w, d) {
  'use strict';

  var me = null, admin = false, mine = false, rows = [], pastRows = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var MONTH = ['January','February','March','April','May','June','July','August',
               'September','October','November','December'];
  var DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  // ⛔ Local, not UTC. See the header note.
  function parts(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    if (!m) return null;
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return { y: +m[1], mo: +m[2] - 1, day: +m[3], dow: dt.getDay() };
  }
  function todayYMD() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' +
           String(n.getDate()).padStart(2,'0');
  }
  function clock(t) {
    if (!t) return '';
    var m = /^(\d{2}):(\d{2})/.exec(String(t));
    if (!m) return '';
    var h = +m[1], ap = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (!h) h = 12;
    return h + (m[2] === '00' ? '' : ':' + m[2]) + ap;
  }
  // The database will not hold a scheme other than https (migration 020's CHECK),
  // so this only has to refuse what never reached the table in the first place.
  function safeLink(u) {
    var v = String(u || '').trim();
    return /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(v) ? v : '';
  }

  /* ---------------------------- the sheet ---------------------------- */
  function dateSheet(row) {
    var back = d.createElement('div');
    back.className = 'sh-back';
    var r = row || {};
    var kinds = (w.OTP && OTP.CAL_KINDS) || ['show','drop','release','booth','festival','other'];
    back.innerHTML =
      '<div class="sh">' +
        '<h3>' + (row ? 'Edit the date' : 'Add a date') + '</h3>' +
        '<div class="note">Anything you have coming up. It goes live straight away.</div>' +
        '<label for="f-title">What is it</label>' +
        '<input id="f-title" type="text" maxlength="90" value="' + esc(r.title || '') + '" ' +
          'placeholder="the show, the drop, the release">' +
        '<div class="two">' +
          '<div><label for="f-date">Date</label>' +
            '<input id="f-date" type="date" value="' + esc(r.on_date || '') + '"></div>' +
          '<div><label for="f-time">Time (optional)</label>' +
            '<input id="f-time" type="time" value="' + esc((r.start_time || '').slice(0,5)) + '"></div>' +
        '</div>' +
        '<label for="f-kind">Kind</label>' +
        '<select id="f-kind">' + kinds.map(function (k) {
            return '<option value="' + k + '"' + (r.kind === k ? ' selected' : '') + '>' + k + '</option>';
          }).join('') + '</select>' +
        '<div class="two">' +
          '<div><label for="f-venue">Venue (optional)</label>' +
            '<input id="f-venue" type="text" maxlength="80" value="' + esc(r.venue || '') + '"></div>' +
          '<div><label for="f-city">City (optional)</label>' +
            '<input id="f-city" type="text" maxlength="60" value="' + esc(r.city || '') + '"></div>' +
        '</div>' +
        '<label for="f-link">Link (optional)</label>' +
        '<input id="f-link" type="url" value="' + esc(r.link || '') + '" placeholder="https://">' +
        '<div class="note">Has to start with https://</div>' +
        '<label for="f-note">A line about it (optional)</label>' +
        '<textarea id="f-note" rows="3" maxlength="240">' + esc(r.note || '') + '</textarea>' +
        '<div class="say"></div>' +
        '<div class="foot">' +
          '<button class="btn" id="f-go">' + (row ? 'Save' : 'Put it up') + '</button>' +
          '<button class="btn ghost" id="f-x">Never mind</button>' +
        '</div>' +
        (row ? '<button class="btn bad" id="f-del" style="width:100%;margin-top:10px">Remove this date</button>' : '') +
      '</div>';
    d.body.appendChild(back);

    var say = back.querySelector('.say');
    function shut() { back.remove(); d.removeEventListener('keydown', key); }
    function key(e) { if (e.key === 'Escape') shut(); }
    d.addEventListener('keydown', key);
    back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    back.querySelector('#f-x').onclick = shut;

    function read() {
      return {
        title: back.querySelector('#f-title').value,
        onDate: back.querySelector('#f-date').value,
        startTime: back.querySelector('#f-time').value,
        kind: back.querySelector('#f-kind').value,
        venue: back.querySelector('#f-venue').value,
        city: back.querySelector('#f-city').value,
        link: back.querySelector('#f-link').value,
        note: back.querySelector('#f-note').value
      };
    }

    back.querySelector('#f-go').onclick = async function () {
      var b = this, v = read();
      b.disabled = true; say.className = 'say'; say.textContent = 'Saving…';
      try {
        if (row) await OTP.updateDate(row.id, v);
        else await OTP.addDate(v);
        shut(); await load();
      } catch (e) {
        say.className = 'say bad'; say.textContent = e.message || String(e);
        b.disabled = false;
      }
    };
    var del = back.querySelector('#f-del');
    if (del) del.onclick = async function () {
      if (this.dataset.sure !== '1') {
        this.dataset.sure = '1'; this.textContent = 'Tap again to remove it'; return;
      }
      this.disabled = true;
      try { await OTP.deleteDate(row.id); shut(); await load(); }
      catch (e) { say.className = 'say bad'; say.textContent = e.message; this.disabled = false; }
    };
  }

  /* ----------------------------- painting ----------------------------- */
  function rowEl(r, opts) {
    opts = opts || {};
    var p = parts(r.on_date);
    var el = d.createElement('div');
    el.className = 'd-row' + (r.published === false ? ' pulled' : '');
    var link = safeLink(r.link);
    var meta = [];
    if (clock(r.start_time)) meta.push('<span>' + esc(clock(r.start_time)) + '</span>');
    if (r.venue) meta.push('<span>' + esc(r.venue) + '</span>');
    if (r.city) meta.push('<span>' + esc(r.city) + '</span>');
    var who = r.by || (r.profiles && r.profiles.card_slug);
    var whoName = r.by_name || (r.profiles && r.profiles.display_name) || who;
    if (who) meta.push('<a class="by" href="../c/' + encodeURIComponent(who) + '/">' + esc(whoName) + '</a>');
    if (r.published === false) meta.push('<span class="pill off">pulled</span>');

    el.innerHTML =
      '<div class="d-when"><span class="m">' + (p ? MON[p.mo] : '') + '</span>' +
        '<span class="d">' + (p ? p.day : '?') + '</span>' +
        '<span class="dow">' + (p ? DOW[p.dow] : '') + '</span></div>' +
      '<div class="d-body">' +
        '<div class="d-title">' + (link
          ? '<a href="' + esc(link) + '" target="_blank" rel="noopener nofollow">' + esc(r.title) + '</a>'
          : esc(r.title)) + '</div>' +
        '<div class="d-meta"><span class="kind ' + esc(r.kind || 'show') + '">' + esc(r.kind || 'show') + '</span>' +
          meta.join('') + '</div>' +
        (r.note ? '<div class="d-note">' + esc(r.note) + '</div>' : '') +
      '</div>';

    if (opts.acts && opts.acts.length) {
      var bar = d.createElement('div');
      bar.className = 'd-acts';
      opts.acts.forEach(function (a) {
        var b = d.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (a.cls || 'ghost') + ' sm';
        b.textContent = a.label;
        b.onclick = a.on;
        bar.appendChild(b);
      });
      el.querySelector('.d-body').appendChild(bar);
    }
    return el;
  }

  function monthsInto(mount, list, opts) {
    var seen = null;
    list.forEach(function (r) {
      var p = parts(r.on_date);
      var key = p ? p.y + '-' + p.mo : '?';
      if (key !== seen) {
        seen = key;
        var h = d.createElement('div');
        h.className = 'month';
        h.innerHTML = esc(p ? MONTH[p.mo] : 'Undated') +
          '<span>' + (p ? p.y : '') + '</span>';
        mount.appendChild(h);
        var rule = d.createElement('div');
        rule.className = 'rule';
        mount.appendChild(rule);
      }
      mount.appendChild(rowEl(r, opts));
    });
  }

  function paint() {
    var panel = d.getElementById('panel');
    panel.innerHTML = '';

    if (mine) {
      var bar = d.createElement('div');
      bar.className = 'addbar';
      var add = d.createElement('button');
      add.type = 'button'; add.className = 'btn'; add.textContent = 'Add a date';
      add.onclick = function () { dateSheet(null); };
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

    if (!rows.length) {
      var e = d.createElement('div');
      e.className = 'empty-cal';
      e.textContent = 'nothing on the run yet';
      panel.appendChild(e);
    } else {
      monthsInto(panel, rows, {
        acts: null,
        // per-row actions are decided per row below
      });
    }

    // rebuild rows that the viewer owns or the desk owns, with their buttons
    panel.querySelectorAll('.d-row').forEach(function (el, i) {
      var r = rows[i];
      if (!r) return;
      var acts = [];
      if (admin) {
        acts.push({ label: r.published === false ? 'Put it back' : 'Pull it', on: async function () {
          try { await OTP.setDatePublished(r.id, r.published === false); await load(); }
          catch (e) { alert(e.message); }
        }});
        acts.push({ label: 'Edit', on: function () { dateSheet(r); } });
      } else if (mine && r.by && me && me.profile && r.by === me.profile.card_slug) {
        acts.push({ label: 'Edit', on: function () { dateSheet(r); } });
      }
      if (!acts.length) return;
      var bar = d.createElement('div');
      bar.className = 'd-acts';
      acts.forEach(function (a) {
        var b = d.createElement('button');
        b.type = 'button'; b.className = 'btn ghost sm'; b.textContent = a.label;
        b.onclick = a.on; bar.appendChild(b);
      });
      el.querySelector('.d-body').appendChild(bar);
    });

    var pt = d.createElement('button');
    pt.type = 'button'; pt.className = 'past-toggle';
    pt.textContent = 'What already happened';
    pt.onclick = async function () {
      if (pastRows === null) {
        pt.textContent = 'Reading…';
        try { pastRows = await OTP.calendarPast(60); } catch (e) { pastRows = []; }
      }
      pt.remove();
      var wrap = d.createElement('div');
      if (!pastRows.length) {
        wrap.className = 'empty-cal';
        wrap.textContent = 'nothing behind us yet';
      } else monthsInto(wrap, pastRows, {});
      panel.appendChild(wrap);
    };
    panel.appendChild(pt);
  }

  async function load() {
    // The desk reads the table so a pulled date is still visible to the person
    // who has to decide about it; everyone else reads the public view.
    if (admin) {
      var all = await OTP.calendarAll(200);
      var t = todayYMD();
      rows = (all || []).filter(function (r) { return r.on_date >= t; }).map(function (r) {
        return Object.assign({}, r, {
          by: r.profiles && r.profiles.card_slug,
          by_name: r.profiles && r.profiles.display_name
        });
      });
    } else {
      rows = await OTP.calendar(120);
    }
    paint();
  }

  async function boot() {
    var panel = d.getElementById('panel');
    if (!w.OTP || !OTP.configured) {
      panel.innerHTML = '<div class="note">Backend not switched on yet.</div>';
      return;
    }
    try { me = await OTP.me(); } catch (e) { me = null; }
    admin = !!(me && me.profile && me.profile.is_admin);
    mine = !!(me && me.profile && me.profile.approved);
    try { await load(); }
    catch (e) {
      console.error(e);
      // A missing table means 020 has not been run. Say that, do not show a
      // stack trace to a visitor.
      panel.innerHTML = '<div class="note">' +
        (/relation|does not exist|schema cache/i.test(e.message || '')
          ? 'The calendar is not switched on yet. Run migration-020-the-calendar.sql.'
          : esc(e.message || 'That did not load.')) + '</div>';
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
