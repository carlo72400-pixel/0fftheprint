/* MY HOURS core: week math, pay, and the send-the-week text. No storage and no page code here; index.html does those.
   A punch is { id, task, in, out, miles, note, link, hand }. in/out are epoch ms on the minute, out is null while on the clock.
   Times are the phone's own clock. A shift that crosses the pay-week line is split there, so each week counts the hours
   worked inside it (overtime is weekly). Miles count in the week the drive started. */
(function (root) {
  'use strict';
  var MIN = 60000;
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TASKS = ['DRIVE', 'SHOOT', 'EDIT', 'POST', 'EVENT', 'GEAR', 'FILES', 'MEETING', 'STORE'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function sameDay(a, b) { return ymd(a) === ymd(b); }
  function money(n) { return '$' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function rateText(r) { r = Number(r) || 0; return '$' + r.toFixed(Math.round(r * 1000) % 10 ? 3 : 2); }
  function hrs(min) { return (min / 60).toFixed(2); }
  function dur(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm'; }
  function t12(ms) { var d = new Date(ms), h = d.getHours(); return (h % 12 || 12) + ':' + pad(d.getMinutes()) + (h < 12 ? ' AM' : ' PM'); }
  function dayLong(d) { d = new Date(d); return DAY[d.getDay()] + ' ' + MON[d.getMonth()] + ' ' + d.getDate(); }
  function dayShort(d) { d = new Date(d); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function storeRate(me) { return me && me.store > 0 ? me.store : (me && me.rate) || 0; }
  function rateFor(task, me) { return task === 'STORE' ? storeRate(me) : (me && me.rate) || 0; }

  /* the pay week holding nowMs, moved by off weeks; startDay 0 = Sunday, 1 = Monday */
  function week(nowMs, startDay, off) {
    var t = new Date(nowMs), back = (t.getDay() - (startDay === 1 ? 1 : 0) + 7) % 7;
    var s = new Date(t.getFullYear(), t.getMonth(), t.getDate() - back + 7 * (off || 0));
    var days = [];
    for (var i = 0; i < 7; i++) days.push(new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
    var e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7);
    return { off: off || 0, start: s.getTime(), end: e.getTime(), days: days, key: ymd(s) };
  }
  /* how many weeks from this week to the week holding ms */
  function weekOffset(nowMs, startDay, ms) {
    var a = week(nowMs, startDay, 0).start, b = week(ms, startDay, 0).start;
    return Math.round((b - a) / (7 * 864e5));
  }
  function label(w) {
    var a = w.days[0], b = w.days[6];
    var left = dayLong(a) + (a.getFullYear() !== b.getFullYear() ? ', ' + a.getFullYear() : '');
    return left + ' to ' + dayLong(b) + ', ' + b.getFullYear();
  }

  /* the part of each punch that falls inside week w, oldest first */
  function segs(punches, w, nowMs) {
    var out = [];
    (punches || []).forEach(function (p) {
      var end = p.out == null ? Math.max(nowMs, p.in) : p.out;
      if (!(p.in < w.end && end > w.start) && !(p.in >= w.start && p.in < w.end)) return;
      var a = Math.max(p.in, w.start), b = Math.min(end, w.end);
      out.push({
        p: p, a: a, b: b, open: p.out == null,
        min: Math.max(0, Math.round((b - a) / MIN)),
        carriedIn: p.in < w.start, carriedOut: end > w.end,
        miles: p.in >= w.start && p.in < w.end && p.miles != null ? Number(p.miles) : null
      });
    });
    out.sort(function (x, y) { return x.a - y.a; });
    return out;
  }

  function sums(list, me) {
    var m = { all: 0, content: 0, store: 0, miles: 0, open: null };
    list.forEach(function (s) {
      if (s.miles != null && s.miles > 0) m.miles += s.miles;
      if (s.open) { m.open = s; return; }
      m.all += s.min;
      if (s.p.task === 'STORE') m.store += s.min; else m.content += s.min;
    });
    m.miles = Math.round(m.miles * 10) / 10;
    /* pay comes off the hours as printed (2 decimals), so whoever checks it on a calculator gets the same cents */
    var rate = (me && me.rate) || 0, h = function (min) { return round2(min / 60); };
    m.split = m.store > 0 && storeRate(me) !== rate;
    m.cPay = round2(h(m.content) * rate);
    m.sPay = round2(h(m.store) * storeRate(me));
    m.straight = m.split ? round2(m.cPay + m.sPay) : round2(h(m.all) * rate);
    m.ot = Math.max(0, m.all - 2400);
    m.prem = m.ot > 0 && m.all > 0 ? round2(h(m.ot) * 0.5 * (m.straight / h(m.all))) : 0;
    m.gross = round2(m.straight + m.prem);
    m.milePay = round2(m.miles * ((me && me.mile) || 0));
    return m;
  }

  /* the text he copies into a message: plain lines, no table, nothing to fix by hand */
  function text(w, list, m, me) {
    me = me || {};
    var L = ['Hours: ' + (me.name || 'my hours') + (me.co ? ', ' + me.co : ''), 'Week of ' + label(w), ''];
    var any = false;
    w.days.forEach(function (d) {
      var rows = list.filter(function (s) { return !s.open && sameDay(s.a, d) && (s.min > 0 || s.miles != null); });
      if (!rows.length) return;
      any = true;
      L.push(dayLong(d));
      rows.forEach(function (s) {
        var line = s.p.task + ' ' + t12(s.a) + ' to ' + t12(s.b) + (sameDay(s.a, s.b) || (s.carriedOut && s.b === w.end) ? '' : ' (next day)') + ', ' + dur(s.min);
        if (s.miles != null) line += ', ' + s.miles.toFixed(1) + ' mi';
        if (s.carriedIn) line += ' (started ' + dayLong(s.p.in) + ' ' + t12(s.p.in) + ', last week)';
        if (s.carriedOut) line += ' (kept going to ' + t12(s.p.out) + ', the rest is on next week)';
        if (s.p.note) line += ' (' + s.p.note + ')';
        L.push(line);
        if (s.p.link) L.push('Link: ' + s.p.link);
      });
      L.push('');
    });
    if (!any) L.push('No hours this week.', '');
    L.push('Total: ' + dur(m.all) + ' (' + hrs(m.all) + ' hrs)');
    if (me.rate > 0 && m.all > 0) {
      var split = m.split;
      if (split) {
        if (m.content > 0) L.push('Content: ' + hrs(m.content) + ' hrs x ' + rateText(me.rate) + ' = ' + money(m.cPay));
        L.push('Store: ' + hrs(m.store) + ' hrs x ' + rateText(storeRate(me)) + ' = ' + money(m.sPay));
      } else {
        L.push('Pay: ' + hrs(m.all) + ' hrs x ' + rateText(me.rate) + ' = ' + money(m.straight));
      }
      if (m.ot > 0) L.push('Overtime: ' + hrs(m.ot) + ' hrs over 40 at time and a half, adds ' + money(m.prem));
      if (split || m.ot > 0) L.push('Total pay: ' + money(m.gross));
    }
    if (m.miles > 0) {
      L.push('Miles driven: ' + m.miles.toFixed(1));
      if (me.mile > 0) L.push('Mileage: ' + m.miles.toFixed(1) + ' mi x ' + rateText(me.mile) + ' = ' + money(m.milePay));
    }
    if (m.open) L.push('', 'Still on the clock: ' + m.open.p.task + ' since ' + t12(m.open.p.in) + ', not counted yet.');
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* a spreadsheet cell; a leading = + - @ gets a quote so a spreadsheet never runs it as a formula */
  function cell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(w, list, m, me) {
    me = me || {};
    var rows = [['Date', 'Day', 'Task', 'In', 'Out', 'Hours', 'Miles', 'Note', 'Link']];
    list.forEach(function (s) {
      if (s.open || (s.min === 0 && s.miles == null)) return;
      rows.push([ymd(s.a), DAY[new Date(s.a).getDay()], s.p.task, t12(s.a), t12(s.b), hrs(s.min), s.miles != null ? s.miles.toFixed(1) : '', s.p.note || '', s.p.link || '']);
    });
    rows.push([]);
    rows.push(['Total', '', '', '', '', hrs(m.all), m.miles ? m.miles.toFixed(1) : '', (me.name || '') + ', week of ' + label(w), '']);
    if (me.rate > 0) rows.push(['Pay', '', '', '', '', '', '', money(m.gross) + (m.ot > 0 ? ' incl. overtime' : ''), '']);
    if (me.mile > 0 && m.miles > 0) rows.push(['Mileage', '', '', '', '', '', '', money(m.milePay), '']);
    return rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  }

  /* a short fingerprint of what a sent week said, so the card can tell when it changed after sending */
  function sig(list, me) {
    var s = JSON.stringify([me && me.name, me && me.rate, me && me.store, me && me.mile, list.filter(function (x) { return !x.open; }).map(function (x) { return [x.p.task, x.a, x.b, x.miles, x.p.note, x.p.link]; })]);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  root.HoursCore = {
    TASKS: TASKS, DAY: DAY, DOW: DOW, MON: MON,
    pad: pad, round2: round2, ymd: ymd, sameDay: sameDay, money: money, rateText: rateText, hrs: hrs, dur: dur, t12: t12,
    dayLong: dayLong, dayShort: dayShort, storeRate: storeRate, rateFor: rateFor,
    week: week, weekOffset: weekOffset, label: label, segs: segs, sums: sums, text: text, csv: csv, cell: cell, sig: sig
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
