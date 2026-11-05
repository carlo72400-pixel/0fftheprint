/* Personal punch clock for Giancarlo Ortiz.
   Solo hours only. America/Chicago. The week starts Monday.
   Storage keys use the gio-punch- prefix and are not the shop clock. */
(function (root) {
  'use strict';

  var TZ = 'America/Chicago';
  var STORAGE_KEY = 'gio-punch-log';
  var BACKUP_KEY = 'gio-punch-log-bak';
  var NOTE_MAX = 140;
  var WD_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function cleanNote(note) {
    return String(note == null ? '' : note).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  }

  function uid() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function chicagoParts(ms) {
    var date = ms instanceof Date ? ms : new Date(ms);
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    var o = {};
    var parts = fmt.formatToParts(date);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'literal') o[parts[i].type] = parts[i].value;
    }
    var h = Number(o.hour);
    if (h === 24) h = 0;
    return {
      y: Number(o.year),
      m: Number(o.month),
      d: Number(o.day),
      h: h,
      mi: Number(o.minute),
      s: Number(o.second)
    };
  }

  function chicagoYMD(ms) {
    var date = ms instanceof Date ? ms : new Date(ms);
    var p = chicagoParts(date);
    var wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date);
    return { y: p.y, m: p.m, d: p.d, wd: wd };
  }

  function sameWall(instant, y, mo, d, h, mi, s) {
    var p = chicagoParts(instant);
    return p.y === y && p.m === mo && p.d === d && p.h === h && p.mi === mi && p.s === s;
  }

  /* Wall-clock time in America/Chicago → UTC epoch ms.
     Returns null when daylight saving skipped that minute (the 2 o'clock hour in spring).
     On the fall-back overlap, the earlier instant wins. */
  function wallToInstant(y, mo, d, h, mi, s) {
    s = s || 0;
    if (![y, mo, d, h, mi, s].every(function (n) { return Number.isFinite(n); })) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
    var asUTC = Date.UTC(y, mo - 1, d, h, mi, s);
    var hits = [];
    var offsets = [300, 360];
    for (var i = 0; i < offsets.length; i++) {
      var instant = asUTC + offsets[i] * 60000;
      if (sameWall(instant, y, mo, d, h, mi, s)) hits.push(instant);
    }
    if (!hits.length) return null;
    return Math.min.apply(null, hits);
  }

  function addDays(ymd, n) {
    var t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  function ymdKey(ymd) {
    return ymd.y * 10000 + ymd.m * 100 + ymd.d;
  }

  function formatYMD(ymd) {
    return ymd.y + '-' + pad(ymd.m) + '-' + pad(ymd.d);
  }

  function parseYMD(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  function weekStart(ms) {
    var ymd = chicagoYMD(ms);
    var idx = WD_INDEX[ymd.wd];
    if (idx == null) idx = 0;
    var sinceMon = idx === 0 ? 6 : idx - 1;
    return addDays(ymd, -sinceMon);
  }

  function weekRange(weekStartYmd) {
    var start = wallToInstant(weekStartYmd.y, weekStartYmd.m, weekStartYmd.d, 0, 0, 0);
    var endYmd = addDays(weekStartYmd, 7);
    var end = wallToInstant(endYmd.y, endYmd.m, endYmd.d, 0, 0, 0);
    return { start: start, end: end, endYmd: addDays(weekStartYmd, 6) };
  }

  function ymdInWeek(ymd, startYmd) {
    var end = addDays(startYmd, 7);
    var k = ymdKey(ymd);
    return k >= ymdKey(startYmd) && k < ymdKey(end);
  }

  function formatTime(ms) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(ms));
  }

  function formatWhen(ms, rowYmd) {
    var ymd = chicagoYMD(ms);
    var time = formatTime(ms);
    if (formatYMD(ymd) === formatYMD(rowYmd)) return time;
    return String(ymd.wd || '').toUpperCase() + ' ' + time;
  }

  function formatDayHead(ymd) {
    var instant = wallToInstant(ymd.y, ymd.m, ymd.d, 12, 0, 0);
    var wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(instant).toUpperCase();
    return wd + ' ' + pad(ymd.m) + '/' + pad(ymd.d);
  }

  function formatWeekLabel(startYmd, endYmd) {
    var a = wallToInstant(startYmd.y, startYmd.m, startYmd.d, 12, 0, 0);
    var b = wallToInstant(endYmd.y, endYmd.m, endYmd.d, 12, 0, 0);
    var left = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(a);
    var right = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(b);
    return left + ' – ' + right;
  }

  function formatDateLine(ms) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(ms)).toUpperCase();
  }

  function clockParts(ms) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    var o = {};
    var parts = fmt.formatToParts(new Date(ms));
    for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
    var hour = String(o.hour || '').replace(/^(\d)$/, '0$1');
    if (hour.length === 1) hour = '0' + hour;
    var minute = pad(Number(o.minute));
    var second = pad(Number(o.second));
    var dayPeriod = String(o.dayPeriod || '').replace(/\./g, '').toUpperCase();
    if (dayPeriod === 'A M') dayPeriod = 'AM';
    if (dayPeriod === 'P M') dayPeriod = 'PM';
    return {
      hour: hour,
      minute: minute,
      second: second,
      dayPeriod: dayPeriod,
      digits: hour + minute + second
    };
  }

  function toCents(hours) {
    return Math.round(hours * 100);
  }

  function centsToFixed(cents) {
    var sign = cents < 0 ? '-' : '';
    var a = Math.abs(cents);
    return sign + Math.floor(a / 100) + '.' + pad(a % 100);
  }

  function formatHM(cents) {
    var totalMin = Math.round(cents * 60 / 100);
    var h = Math.floor(Math.abs(totalMin) / 60);
    var m = Math.abs(totalMin) % 60;
    return h + 'h ' + pad(m) + 'm';
  }

  function activePunches(punches) {
    return punches.filter(function (p) { return p && !p.voided; }).slice().sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function isOnClock(punches) {
    var list = activePunches(punches || []);
    var last = list[list.length - 1];
    return !!(last && last.kind === 'in');
  }

  function openPunch(punches) {
    if (!isOnClock(punches)) return null;
    var list = activePunches(punches);
    return list[list.length - 1];
  }

  function nextKind(punches) {
    return isOnClock(punches) ? 'out' : 'in';
  }

  function pair(punches) {
    var list = activePunches(punches || []);
    var shifts = [];
    var open = null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.kind === 'in') {
        if (open) shifts.push({ inn: open, out: null, missing: 'out' });
        open = p;
      } else if (open) {
        shifts.push({ inn: open, out: p, missing: null });
        open = null;
      } else {
        shifts.push({ inn: null, out: p, missing: 'in' });
      }
    }
    if (open) shifts.push({ inn: open, out: null, missing: null });
    return shifts;
  }

  function collect(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (out.indexOf(parts[i]) === -1) out.push(parts[i]);
    }
    return out.join('; ');
  }

  function describeShift(shift, weekStartYmd, now) {
    var range = weekRange(weekStartYmd);
    var inn = shift.inn;
    var out = shift.out;

    if (shift.missing === 'in') {
      var outDay = chicagoYMD(out.at);
      if (!ymdInWeek(outDay, weekStartYmd)) return null;
      return row(outDay, '', formatWhen(out.at, outDay), null, collect([out.note, out.edited && 'edited', 'missing punch in']), false, inn, out);
    }

    if (shift.missing === 'out') {
      var inDay = chicagoYMD(inn.at);
      if (!ymdInWeek(inDay, weekStartYmd)) return null;
      return row(inDay, formatWhen(inn.at, inDay), '', null, collect([inn.note, inn.edited && 'edited', 'missing punch out']), false, inn, out);
    }

    var start = inn.at;
    var openShift = !out;
    var end = openShift ? now : out.at;

    if (end < start) {
      var badDay = chicagoYMD(start);
      var show = ymdInWeek(badDay, weekStartYmd);
      if (!show && out && ymdInWeek(chicagoYMD(out.at), weekStartYmd)) {
        badDay = chicagoYMD(out.at);
        show = true;
      }
      if (!show) return null;
      return row(
        badDay,
        formatWhen(start, badDay),
        openShift ? '' : formatWhen(out.at, badDay),
        null,
        collect([inn.note, out && out.note, (inn.edited || (out && out.edited)) && 'edited', 'out is before in']),
        false,
        inn,
        out
      );
    }

    var overlapStart = Math.max(start, range.start);
    var overlapEnd = Math.min(end, range.end);
    if (overlapEnd < overlapStart) return null;
    if (overlapEnd === overlapStart && (start < range.start || start >= range.end)) return null;

    var hours = (overlapEnd - overlapStart) / 3600000;
    var date = chicagoYMD(overlapStart);
    var split = start < range.start || (!openShift && end > range.end) || (openShift && now > range.end);
    var note = collect([
      split && 'hours split at week boundary',
      openShift && 'still on the clock',
      inn.note,
      out && out.note,
      (inn.edited || (out && out.edited)) && 'edited'
    ]);
    return row(
      date,
      formatWhen(start, date),
      openShift ? '' : formatWhen(end, date),
      hours,
      note,
      openShift,
      inn,
      out
    );
  }

  function row(date, inText, outText, hours, note, open, inn, out) {
    return {
      key: (inn && inn.id ? inn.id : 'x') + '-' + (out && out.id ? out.id : (open ? 'open' : 'x')),
      date: { y: date.y, m: date.m, d: date.d },
      inText: inText,
      outText: outText,
      hours: hours,
      note: note,
      open: open,
      inn: inn,
      out: out,
      edited: !!(inn && inn.edited) || !!(out && out.edited)
    };
  }

  function weekView(punches, weekStartYmd, now) {
    var shifts = pair(punches);
    var rows = [];
    for (var i = 0; i < shifts.length; i++) {
      var described = describeShift(shifts[i], weekStartYmd, now);
      if (described) rows.push(described);
    }
    rows.sort(function (a, b) {
      var at = a.inn ? a.inn.at : a.out.at;
      var bt = b.inn ? b.inn.at : b.out.at;
      return at - bt;
    });

    var days = [];
    var totalCents = 0;
    for (var n = 0; n < 7; n++) {
      var ymd = addDays(weekStartYmd, n);
      var key = formatYMD(ymd);
      var dayRows = rows.filter(function (r) { return formatYMD(r.date) === key; });
      var voided = (punches || []).filter(function (p) {
        return p && p.voided && formatYMD(chicagoYMD(p.at)) === key;
      }).slice().sort(function (a, b) { return a.at - b.at; });
      var cents = 0;
      var hasHours = false;
      for (var r = 0; r < dayRows.length; r++) {
        if (dayRows[r].hours == null) continue;
        hasHours = true;
        cents += toCents(dayRows[r].hours);
      }
      totalCents += cents;
      days.push({
        ymd: ymd,
        key: key,
        head: formatDayHead(ymd),
        rows: dayRows,
        voided: voided,
        cents: cents,
        hasHours: hasHours
      });
    }

    var endYmd = addDays(weekStartYmd, 6);
    return {
      days: days,
      cents: totalCents,
      weekStart: weekStartYmd,
      weekEnd: endYmd,
      label: formatWeekLabel(weekStartYmd, endYmd)
    };
  }

  function csvCell(value) {
    var s = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildCsv(punches, weekStartYmd, now) {
    var view = weekView(punches, weekStartYmd, now);
    var lines = [['date', 'in', 'out', 'hours', 'note']];
    for (var d = 0; d < view.days.length; d++) {
      var day = view.days[d];
      for (var r = 0; r < day.rows.length; r++) {
        var rowItem = day.rows[r];
        lines.push([
          day.key,
          rowItem.inText,
          rowItem.outText,
          rowItem.hours == null ? '' : centsToFixed(toCents(rowItem.hours)),
          rowItem.note
        ]);
      }
    }
    var totalNote = 'Giancarlo Ortiz; America/Chicago; week of ' + formatYMD(weekStartYmd) + ' to ' + formatYMD(view.weekEnd);
    lines.push(['week total', '', '', centsToFixed(view.cents), totalNote]);
    return lines.map(function (cols) {
      return cols.map(csvCell).join(',');
    }).join('\r\n') + '\r\n';
  }

  function exportFilename(weekStartYmd) {
    return 'gio-hours-' + formatYMD(weekStartYmd) + '.csv';
  }

  function blankLog() {
    return { version: 1, punches: [] };
  }

  function normalizePunch(p) {
    if (!p || typeof p !== 'object') return null;
    if (p.kind !== 'in' && p.kind !== 'out') return null;
    if (!Number.isFinite(Number(p.at))) return null;
    var id = typeof p.id === 'string' && p.id ? p.id : uid();
    return {
      id: id,
      at: Number(p.at),
      kind: p.kind,
      note: cleanNote(p.note),
      edited: !!p.edited,
      voided: !!p.voided
    };
  }

  function load(storage) {
    var raw = null;
    try { raw = storage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) return blankLog();
    try {
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.punches)) throw new Error('shape');
      var punches = [];
      for (var i = 0; i < data.punches.length; i++) {
        var punch = normalizePunch(data.punches[i]);
        if (punch) punches.push(punch);
      }
      return { version: 1, punches: punches };
    } catch (err) {
      try { storage.setItem(BACKUP_KEY, raw); } catch (e2) { /* ignore */ }
      return blankLog();
    }
  }

  function save(storage, data) {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, punches: data.punches || [] }));
  }

  function addPunch(data, kind, at, note) {
    if (kind !== 'in' && kind !== 'out') return null;
    if (!Number.isFinite(at)) return null;
    var punch = {
      id: uid(),
      at: at,
      kind: kind,
      note: cleanNote(note),
      edited: false,
      voided: false
    };
    data.punches.push(punch);
    return punch;
  }

  function editPunch(data, id, fields) {
    var p = null;
    for (var i = 0; i < data.punches.length; i++) {
      if (data.punches[i].id === id) { p = data.punches[i]; break; }
    }
    if (!p || p.voided) return { ok: false, error: 'That punch is not on the card.' };
    if (!Number.isFinite(fields.at)) {
      return { ok: false, error: 'That time does not exist in Chicago. Daylight saving skipped it.' };
    }
    var noteNext = cleanNote(fields.note);
    if (p.at !== fields.at || p.note !== noteNext) {
      p.at = fields.at;
      p.note = noteNext;
      p.edited = true;
    }
    return { ok: true, punch: p };
  }

  function voidPunch(data, id) {
    for (var i = 0; i < data.punches.length; i++) {
      if (data.punches[i].id === id && !data.punches[i].voided) {
        data.punches[i].voided = true;
        data.punches[i].edited = true;
        return data.punches[i];
      }
    }
    return null;
  }

  function restorePunch(data, id) {
    for (var i = 0; i < data.punches.length; i++) {
      if (data.punches[i].id === id && data.punches[i].voided) {
        data.punches[i].voided = false;
        return data.punches[i];
      }
    }
    return null;
  }

  root.GioPunch = {
    TZ: TZ,
    STORAGE_KEY: STORAGE_KEY,
    BACKUP_KEY: BACKUP_KEY,
    chicagoParts: chicagoParts,
    chicagoYMD: chicagoYMD,
    wallToInstant: wallToInstant,
    addDays: addDays,
    weekStart: weekStart,
    weekRange: weekRange,
    formatYMD: formatYMD,
    parseYMD: parseYMD,
    formatTime: formatTime,
    formatWhen: formatWhen,
    formatDayHead: formatDayHead,
    formatWeekLabel: formatWeekLabel,
    formatDateLine: formatDateLine,
    clockParts: clockParts,
    toCents: toCents,
    centsToFixed: centsToFixed,
    formatHM: formatHM,
    isOnClock: isOnClock,
    openPunch: openPunch,
    nextKind: nextKind,
    pair: pair,
    weekView: weekView,
    buildCsv: buildCsv,
    exportFilename: exportFilename,
    load: load,
    save: save,
    addPunch: addPunch,
    editPunch: editPunch,
    voidPunch: voidPunch,
    restorePunch: restorePunch,
    cleanNote: cleanNote,
    csvCell: csvCell
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
