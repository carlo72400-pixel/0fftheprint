/* DAYPLAN: one engine for any event with a schedule (a festival with stages, a wedding
   run of show, a shoot day). The page supplies window.DAYPLAN (the event) plus the
   containers below; this file does the planning, the live NOW panel, the tap-to-pick
   lineup grid, the merged day timeline, the time slider, the pack list, and the editing:
   everyone can add their own stops, fix times, hide rows, fix or add sets, add pack
   items, and send their whole plan to someone else. Edits stay on that phone.
   How to make a new event page: see DAYPLAN.md at the repo root.
   Times are minutes after midnight on cfg.date, in the event's own timezone (cfg.tz). */
(function () {
  'use strict';
  var cfg = window.DAYPLAN;
  if (!cfg) return;

  /* ---------- the event ---------- */
  var STAGE = {}, ORDER = [];
  cfg.stages.forEach(function (s) { STAGE[s.id] = s; ORDER.push(s.id); });
  var WALKS = cfg.walks || {};
  var S0 = cfg.dayStart, S1 = cfg.dayEnd, SL = 5, K = (S1 - S0) / SL;
  var BASE = Date.parse(cfg.date + 'T00:00:00' + cfg.tz);
  var PICKABLE = cfg.pickable !== false;
  var KEY = cfg.key || 'dayplan';
  var TXT = cfg.text || {};
  var PXM = cfg.pxPerMin || 2.2;
  var MAIN = cfg.mainDay || 'day';
  var OFFS = cfg.dayOffsets || {};
  if (OFFS[MAIN] === undefined) OFFS[MAIN] = 0;

  function walk(a, b) {
    var A = STAGE[a].area || a, B = STAGE[b].area || b;
    if (A === B) return 0;
    var k = [A, B].sort().join('|');
    return WALKS[k] !== undefined ? WALKS[k] : 10;
  }
  function slug(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function hm(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function uid() { return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  /* ---------- storage ---------- */
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var picks = PICKABLE ? load(KEY + '-picks-v1', {}) : {};
  var full = load(KEY + '-full-v1', false);
  var actEdits = load(KEY + '-acts-v1', {});      // { actId: { s: 'HH:MM', e: 'HH:MM' } }
  var extraActs = load(KEY + '-extra-v1', []);    // [{ id, n, st, s, e }]
  var custom = load(KEY + '-custom-v1', []);      // [{ id, when, m, b, s, st }]
  var logiEdits = load(KEY + '-logi-v1', {});     // { rowId: { m, b, s, hidden } }
  var myName = load(KEY + '-name-v1', '');
  var preview = null, editDay = false, editSets = false;

  /* ---------- the lineup, with this phone's fixes ---------- */
  var ACTS = [], BY = {};
  function buildActs() {
    ACTS = cfg.acts.map(function (r) {
      var id = r.id || slug(r.n), ed = actEdits[id];
      var a = { id: id, n: r.n, st: r.st, m0: hm(ed && ed.s ? ed.s : r.s), m1: hm(ed && ed.e ? ed.e : r.e), base: { s: r.s, e: r.e }, edited: !!ed };
      if (a.m1 <= a.m0) a.m1 += 1440;
      return a;
    });
    extraActs.forEach(function (x) {
      if (!STAGE[x.st]) return;
      var a = { id: x.id, n: x.n, st: x.st, m0: hm(x.s), m1: hm(x.e), extra: true };
      if (a.m1 <= a.m0) a.m1 += 1440;
      ACTS.push(a);
    });
    BY = {};
    ACTS.forEach(function (a) { BY[a.id] = a; });
    for (var k in picks) if (!BY[k]) delete picks[k];
  }

  /* ---------- planning ---------- */
  function weight(p) { return p === 2 ? 3 : (p === 1 ? 1 : 0); }
  // Split mode: 5-minute slots, you can leave a set early or join late.
  // State = (slot, stage, slots in a row of the current set, capped at 3).
  // Catching 15 minutes of a set pays a one-time bonus (big for a Must), so two
  // clashing Musts get split instead of one dropped. You only ever walk TO a set
  // you picked, which also stops the plan hopping out of a set and back in.
  var BONUS = { 1: 1, 2: 15 }, MOVE = 0.5, NEG = -1e18;
  function planSplit(pk) {
    var G = ORDER.length, w = [], actAt = [], k, g, h, c, row, row2;
    for (k = 0; k < K; k++) {
      row = []; row2 = [];
      for (g = 0; g < G; g++) { row.push(0); row2.push(null); }
      w.push(row); actAt.push(row2);
    }
    ACTS.forEach(function (a) {
      var gi = ORDER.indexOf(a.st), wt = weight(pk[a.id] || 0);
      if (!wt) return;
      for (var m = a.m0; m + SL <= a.m1; m += SL) {
        var kk = Math.floor((m - S0) / SL);
        if (kk >= 0 && kk < K) { w[kk][gi] = wt; actAt[kk][gi] = a; }
      }
    });
    var best = [], from = [];
    for (k = 0; k < K; k++) {
      best.push([]); from.push([]);
      for (g = 0; g < G; g++) { best[k].push([NEG, NEG, NEG, NEG]); from[k].push([null, null, null, null]); }
    }
    function relax(k2, g2, c2, val, ptr) {
      if (val > best[k2][g2][c2] + 1e-9) { best[k2][g2][c2] = val; from[k2][g2][c2] = ptr; }
    }
    for (g = 0; g < G; g++) relax(0, g, w[0][g] > 0 ? 1 : 0, w[0][g], null);
    for (k = 1; k < K; k++) {
      for (g = 0; g < G; g++) {
        var v = w[k][g], cur = actAt[k][g], on = v > 0;
        var cont = on && actAt[k - 1][g] === cur;
        for (c = 0; c < 4; c++) {
          var pv = best[k - 1][g][c];
          if (pv <= NEG) continue;
          if (cont && c > 0) relax(k, g, Math.min(c + 1, 3), pv + v + (c === 2 ? BONUS[pk[cur.id]] : 0), [k - 1, g, c]);
          else relax(k, g, on ? 1 : 0, pv + v, [k - 1, g, c]);
        }
        if (!on) continue;
        for (h = 0; h < G; h++) {
          if (h === g) continue;
          var k0 = k - 1 - Math.ceil(walk(ORDER[h], ORDER[g]) / SL);
          if (k0 < 0) continue;
          for (c = 0; c < 4; c++) {
            var pv2 = best[k0][h][c];
            if (pv2 > NEG) relax(k, g, 1, pv2 - MOVE + v, [k0, h, c]);
          }
        }
      }
    }
    var bk = K - 1, bg = 0, bc = 0, bv = NEG;
    for (g = 0; g < G; g++) for (c = 0; c < 4; c++) if (best[bk][g][c] > bv + 1e-9) { bv = best[bk][g][c]; bg = g; bc = c; }
    var at = new Array(K), ptr = [bk, bg, bc];
    while (ptr) { at[ptr[0]] = ptr[1]; ptr = from[ptr[0]][ptr[1]][ptr[2]]; }
    var segs = [];
    for (k = 0; k < K; k++) {
      if (at[k] === undefined) continue;
      var a = actAt[k][at[k]];
      if (!a) continue;
      var m0 = Math.max(S0 + k * SL, a.m0), m1 = Math.min(S0 + k * SL + SL, a.m1), last = segs[segs.length - 1];
      if (last && last.act === a && last.m1 >= m0) last.m1 = m1;
      else segs.push({ act: a, st: a.st, m0: m0, m1: m1 });
    }
    return segs;
  }
  // Full-set mode: whole sets only, best chain by weight x minutes with walks in between.
  function planFull(pk) {
    var arr = ACTS.filter(function (a) { return pk[a.id] > 0; })
      .sort(function (x, y) { return (x.m1 - y.m1) || (x.m0 - y.m0); });
    var n = arr.length, dp = [], prev = [], i, j;
    for (i = 0; i < n; i++) {
      var val = weight(pk[arr[i].id]) * (arr[i].m1 - arr[i].m0), bv = val, bp = -1;
      for (j = 0; j < i; j++) {
        if (arr[j].m1 + walk(arr[j].st, arr[i].st) <= arr[i].m0 && dp[j] + val > bv) { bv = dp[j] + val; bp = j; }
      }
      dp.push(bv); prev.push(bp);
    }
    var bi = -1, best = -1;
    for (i = 0; i < n; i++) if (dp[i] > best) { best = dp[i]; bi = i; }
    var chain = [];
    while (bi >= 0) { chain.unshift(arr[bi]); bi = prev[bi]; }
    return chain.map(function (a) { return { act: a, st: a.st, m0: a.m0, m1: a.m1 }; });
  }
  // Everything on the run of show is in the plan (weddings, shoot days).
  function planAll() {
    return ACTS.slice().sort(function (x, y) { return x.m0 - y.m0; }).map(function (a) { return { act: a, st: a.st, m0: a.m0, m1: a.m1 }; });
  }
  function toItems(segs) {
    var out = [];
    segs.forEach(function (s, i) {
      var nx = segs[i + 1], it = { type: 'watch', act: s.act, st: s.st, m0: s.m0, m1: s.m1 };
      it.full = s.m0 <= s.act.m0 && s.m1 >= s.act.m1; it.late = s.m0 > s.act.m0; it.early = s.m1 < s.act.m1;
      out.push(it);
      if (nx && nx.m0 >= s.m1) {
        var wk = walk(s.st, nx.st);
        if (wk > 0) out.push({ type: 'walk', from: s.st, to: nx.st, m0: nx.m0 - wk, m1: nx.m0, mins: wk, next: nx.act });
      }
    });
    return out;
  }
  function coverage(pk, segs) {
    var res = [];
    ACTS.forEach(function (a) {
      if (!(pk[a.id] > 0)) return;
      var got = 0, over = [];
      segs.forEach(function (s) {
        if (s.act === a) got += s.m1 - s.m0;
        else if (s.m0 < a.m1 && s.m1 > a.m0 && over.indexOf(s.act) < 0) over.push(s.act);
      });
      res.push({ act: a, got: got, len: a.m1 - a.m0, over: over });
    });
    return res;
  }

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmt(m) { m = Math.round(m); m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + ':' + (mm < 10 ? '0' : '') + mm + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function nb(s) { return s.replace(' ', '\u00a0'); }
  function hrs(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + ' hr' + (h > 1 ? 's' : '') + (m ? ' ' + m + ' min' : '') : m + ' min'; }
  function count(o) { var n = 0; for (var k in o) if (o[k] > 0) n++; return n; }
  function sname(st) { return STAGE[st] ? STAGE[st].name : ''; }
  function where(st) { return sname(st) + (cfg.stageWord ? ' ' + cfg.stageWord : ''); }
  function on(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }
  function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

  var segs = [], items = [], cov = [];
  function replan() {
    segs = !PICKABLE ? planAll() : (full ? planFull(picks) : planSplit(picks));
    items = toItems(segs);
    cov = PICKABLE ? coverage(picks, segs) : [];
  }
  function nowMin() { return preview !== null ? preview : (Date.now() - BASE) / 60000; }

  /* ---------- the bottom sheet every editor uses ---------- */
  var sheet = null, sheetBg = null, sheetKey = null, lastFocus = null;
  function ensureSheet() {
    if (sheet) return;
    sheetBg = document.createElement('div'); sheetBg.className = 'sheet-bg'; sheetBg.hidden = true;
    sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.hidden = true;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'sheetT');
    document.body.appendChild(sheetBg); document.body.appendChild(sheet);
    sheetBg.addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet && !sheet.hidden) closeSheet(); });
    sheet.addEventListener('click', function (e) {
      var k = e.target.closest ? e.target.closest('[data-act]') : null;
      if (k && sheetKey) sheetKey(k.getAttribute('data-act'), k);
    });
    sheet.addEventListener('submit', function (e) { e.preventDefault(); if (sheetKey) sheetKey('save'); });
  }
  function openSheet(title, fields, keys, onKey) {
    ensureSheet();
    lastFocus = document.activeElement;
    sheet.innerHTML = '<form class="sheet-in" novalidate><h3 id="sheetT">' + esc(title) + '</h3>' + fields +
      '<p class="sheet-err" id="sheetErr" role="alert" hidden></p><div class="keys">' + keys + '</div></form>';
    sheetKey = onKey;
    sheet.hidden = false; sheetBg.hidden = false;
    document.documentElement.classList.add('sheet-open');
    var f = sheet.querySelector('input, select, textarea');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true; sheetBg.hidden = true; sheetKey = null;
    document.documentElement.classList.remove('sheet-open');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  function sheetErr(msg) { var e = $('sheetErr'); e.textContent = msg; e.hidden = false; }
  function fld(id, label, html) { return '<label class="fld" for="' + id + '"><span>' + label + '</span>' + html + '</label>'; }
  function txt(id, v, ph, max) { return '<input type="text" id="' + id + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '" maxlength="' + (max || 80) + '" autocomplete="off">'; }
  function area(id, v, ph) { return '<textarea id="' + id + '" rows="3" maxlength="300" placeholder="' + esc(ph || '') + '">' + esc(v || '') + '</textarea>'; }
  function tim(id, v) { return '<input type="time" id="' + id + '" value="' + v + '" step="300" required>'; }
  function sel(id, opts, v) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function key(act, label, cls) { return '<button type="' + (act === 'save' ? 'submit' : 'button') + '" class="key ' + (cls || 'grey') + '" data-act="' + act + '">' + label + '</button>'; }
  function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
  function stageOpts(none) { var o = ORDER.map(function (st) { return [st, where(st)]; }); return none ? [['', none]].concat(o) : o; }
  function armed(btn, label) {
    if (btn.getAttribute('data-arm') === '1') return true;
    btn.setAttribute('data-arm', '1'); var o = btn.textContent; btn.textContent = label || 'Tap again';
    setTimeout(function () { if (btn.getAttribute('data-arm') === '1') { btn.setAttribute('data-arm', '0'); btn.textContent = o; } }, 3000);
    return false;
  }

  /* ---------- editors ---------- */
  function editSet(a) {
    var f = (a.extra ? fld('fN', 'Name', txt('fN', a.n, 'Who is playing', 60)) + fld('fSt', 'Stage', sel('fSt', stageOpts(), a.st)) : '') +
      '<div class="fld-row">' + fld('fS', 'Starts', tim('fS', hhmm(a.m0))) + fld('fE', 'Ends', tim('fE', hhmm(a.m1))) + '</div>' +
      '<p class="sheet-note">' + (a.extra ? 'You added this set. Only you see it, unless you send your plan.' : 'Official: ' + fmt(hm(a.base.s)) + ' to about ' + fmt(hm(a.base.e)) + '. Fix it here if the festival moves it.') + '</p>';
    var k = key('save', 'Save', 'gold') + (a.edited ? key('reset', 'Back to official', 'grey') : '') + (a.extra ? key('del', 'Delete set', 'red') : '') + key('x', 'Cancel', 'grey');
    openSheet((a.extra ? 'Your set: ' : 'Fix the time: ') + a.n, f, k, function (act, btn) {
      if (act === 'x') return closeSheet();
      if (act === 'reset') { delete actEdits[a.id]; save(KEY + '-acts-v1', actEdits); closeSheet(); return rebuild(); }
      if (act === 'del') {
        if (!armed(btn, 'Tap again to delete')) return;
        extraActs = extraActs.filter(function (x) { return x.id !== a.id; }); delete picks[a.id];
        save(KEY + '-extra-v1', extraActs); save(KEY + '-picks-v1', picks); closeSheet(); return rebuild();
      }
      if (act !== 'save') return;
      var s = val('fS'), e = val('fE');
      if (!s || !e) return sheetErr('Set a start and an end time.');
      if (s === e) return sheetErr('The end has to be after the start.');
      if (a.extra) {
        var n = val('fN');
        if (!n) return sheetErr('Give it a name.');
        extraActs.forEach(function (x) { if (x.id === a.id) { x.n = n; x.st = val('fSt'); x.s = s; x.e = e; } });
        save(KEY + '-extra-v1', extraActs);
      } else {
        if (s === a.base.s && e === a.base.e) delete actEdits[a.id]; else actEdits[a.id] = { s: s, e: e };
        save(KEY + '-acts-v1', actEdits);
      }
      closeSheet(); rebuild();
    });
  }
  function addSet() {
    var f = fld('fN', 'Name', txt('fN', '', 'Who is playing', 60)) + fld('fSt', 'Stage', sel('fSt', stageOpts(), ORDER[0])) +
      '<div class="fld-row">' + fld('fS', 'Starts', tim('fS', hhmm(S0 + 360))) + fld('fE', 'Ends', tim('fE', hhmm(S0 + 390))) + '</div>' +
      '<p class="sheet-note">A surprise set, a signing, anything with a time and a stage. It goes in your picks as a Want.</p>';
    openSheet('Add a set', f, key('save', 'Add it', 'gold') + key('x', 'Cancel', 'grey'), function (act) {
      if (act === 'x') return closeSheet();
      if (act !== 'save') return;
      var n = val('fN'), s = val('fS'), e = val('fE');
      if (!n) return sheetErr('Give it a name.');
      if (!s || !e || s === e) return sheetErr('Set a start and an end time.');
      var id = uid();
      extraActs.push({ id: id, n: n, st: val('fSt'), s: s, e: e }); picks[id] = 1;
      save(KEY + '-extra-v1', extraActs); save(KEY + '-picks-v1', picks); closeSheet(); rebuild();
    });
  }
  function dayChoices() {
    var o = [];
    Object.keys(OFFS).sort(function (a, b) { return OFFS[a] - OFFS[b]; }).forEach(function (d) {
      o.push([d, (cfg.days || {})[d] || d]);
      if (d === MAIN) o.push([MAIN + '-late', ((cfg.days || {})[MAIN] || MAIN) + ', after midnight']);
    });
    return o;
  }
  function whenToM(when, t) { var late = /-late$/.test(when), d = when.replace(/-late$/, ''); return (OFFS[d] || 0) + (late ? 1440 : 0) + hm(t); }
  function editItem(c) {
    var isNew = !c;
    c = c || { when: MAIN, m: Math.max(S0, Math.min(S1 - 60, Math.ceil(nowMin() / 15) * 15)), b: '', s: '', st: '' };
    if (isNew && (c.m < S0 || c.m > S1)) c.m = S0 + 360;
    var f = fld('fB', 'What', txt('fB', c.b, 'Meet at the merch tent', 60)) +
      '<div class="fld-row">' + fld('fW', 'Day', sel('fW', dayChoices(), c.when)) + fld('fT', 'Time', tim('fT', hhmm(c.m))) + '</div>' +
      (ORDER.length > 1 ? fld('fSt', 'Where', sel('fSt', stageOpts('Nowhere in particular'), c.st || '')) : '') +
      fld('fS', 'Note', area('fS', c.s, 'Optional'));
    var k = key('save', isNew ? 'Add it' : 'Save', 'gold') + (isNew ? '' : key('del', 'Delete', 'red')) + key('x', 'Cancel', 'grey');
    openSheet(isNew ? 'Add to your day' : 'Edit: ' + c.b, f, k, function (act, btn) {
      if (act === 'x') return closeSheet();
      if (act === 'del') {
        if (!armed(btn, 'Tap again to delete')) return;
        custom = custom.filter(function (x) { return x.id !== c.id; }); save(KEY + '-custom-v1', custom); closeSheet(); return refresh();
      }
      if (act !== 'save') return;
      var b = val('fB'), t = val('fT'), w = val('fW') || MAIN;
      if (!b) return sheetErr('Say what it is.');
      if (!t) return sheetErr('Pick a time.');
      var rec = { id: c.id || uid(), when: w, m: whenToM(w, t), b: b, s: val('fS'), st: val('fSt') };
      if (isNew) custom.push(rec); else custom = custom.map(function (x) { return x.id === c.id ? rec : x; });
      save(KEY + '-custom-v1', custom); closeSheet(); refresh();
    });
  }
  function logiRows() {
    return (cfg.logistics || []).map(function (l, i) {
      var id = l.id || ('l' + i), ed = logiEdits[id] || {};
      var row = { kind: 'logi', id: id, orig: l, day: l.day, hidden: !!ed.hidden };
      row.edited = ed.m !== undefined || ed.b !== undefined || ed.s !== undefined;
      row.m = ed.m !== undefined ? ed.m : l.m;
      row.t = ed.m !== undefined ? fmt(row.m) : (l.t || fmt(l.m));
      row.b = ed.b !== undefined ? esc(ed.b) : l.b;
      row.s = ed.s !== undefined ? esc(ed.s) : l.s;
      row.rawB = ed.b !== undefined ? ed.b : l.b.replace(/<[^>]*>/g, '');
      row.rawS = ed.s !== undefined ? ed.s : l.s.replace(/<[^>]*>/g, '');
      return row;
    });
  }
  function editLogi(row) {
    var f = fld('fB', 'What', txt('fB', row.rawB, '', 60)) + fld('fT', 'Time', tim('fT', hhmm(row.m))) + fld('fS', 'Note', area('fS', row.rawS, ''));
    var k = key('save', 'Save', 'gold') + key('hide', 'Hide it', 'red') + (row.edited ? key('reset', 'Back to original', 'grey') : '') + key('x', 'Cancel', 'grey');
    openSheet('Edit: ' + row.rawB, f, k, function (act) {
      if (act === 'x') return closeSheet();
      if (act === 'hide') { logiEdits[row.id] = Object.assign({}, logiEdits[row.id] || {}, { hidden: true }); save(KEY + '-logi-v1', logiEdits); closeSheet(); return refresh(); }
      if (act === 'reset') { delete logiEdits[row.id]; save(KEY + '-logi-v1', logiEdits); closeSheet(); return refresh(); }
      if (act !== 'save') return;
      var b = val('fB'), t = val('fT');
      if (!b) return sheetErr('Say what it is.');
      if (!t) return sheetErr('Pick a time.');
      var dayBase = Math.floor(row.orig.m / 1440) * 1440;
      logiEdits[row.id] = { m: dayBase + hm(t), b: b, s: val('fS') };
      save(KEY + '-logi-v1', logiEdits); closeSheet(); refresh();
    });
  }

  /* ---------- lineup grid ---------- */
  function axisLabel(h) { var hh = h % 24; return (hh % 12 || 12) + (hh < 12 ? 'A' : 'P'); }
  var gridBound = false;
  function buildGrid() {
    var grid = $('grid');
    if (!grid) return;
    grid.style.setProperty('--cols', ORDER.length);
    var head = '<div class="lu-head" aria-hidden="true"><span class="ax"></span>' + ORDER.map(function (st) {
      return '<span class="' + st + '">' + esc(sname(st)) + '</span>';
    }).join('') + '</div>';
    var axis = '';
    for (var h = Math.ceil(S0 / 60); h <= S1 / 60; h++) axis += '<span style="top:' + ((h * 60 - S0) * PXM) + 'px">' + axisLabel(h) + '</span>';
    var cols = ORDER.map(function (st) {
      return '<div class="lu-col" role="group" aria-label="' + esc(where(st)) + '">' + ACTS.filter(function (a) { return a.st === st; }).map(function (a) {
        var top = Math.max(0, (a.m0 - S0) * PXM), bot = Math.min((S1 - S0) * PXM, (a.m1 - S0) * PXM);
        return '<button type="button" class="lb ' + st + (a.edited ? ' fixed' : '') + (a.extra ? ' mine' : '') + '" data-id="' + a.id + '" style="top:' + top + 'px;height:' + Math.max(18, bot - top - 3) + 'px"' + (PICKABLE || cfg.editableSets ? '' : ' disabled') + '>' +
          '<i class="wv"></i><span class="nm">' + esc(a.n) + '</span><span class="tm">' + fmt(a.m0).replace(' ', '') + '</span><i class="tg"></i></button>';
      }).join('') + '</div>';
    }).join('');
    grid.innerHTML = head + '<div class="lu-body" style="height:' + ((S1 - S0) * PXM) + 'px"><div class="lu-axis">' + axis + '</div>' + cols +
      '<div class="lu-now" id="luNow" hidden><span>NOW</span></div></div>';
    if (!gridBound) { grid.addEventListener('click', onGrid); gridBound = true; }
  }
  function paintGrid() {
    var grid = $('grid');
    if (!grid) return;
    grid.classList.toggle('editing', editSets);
    var segBy = {};
    segs.forEach(function (s) { (segBy[s.act.id] = segBy[s.act.id] || []).push(s); });
    [].forEach.call(grid.querySelectorAll('.lb'), function (b) {
      var a = BY[b.getAttribute('data-id')];
      if (!a) return;
      var p = PICKABLE ? (picks[a.id] || 0) : 1, mine = segBy[a.id], wv = b.querySelector('.wv'), tg = b.querySelector('.tg');
      b.setAttribute('data-pick', p);
      b.classList.toggle('inplan', !!mine);
      b.classList.toggle('clash', p > 0 && !mine);
      if (mine) {
        var s0 = mine[0].m0, s1 = mine[mine.length - 1].m1;
        wv.style.top = ((s0 - a.m0) * PXM) + 'px'; wv.style.height = Math.max(4, (s1 - s0) * PXM - 3) + 'px'; wv.hidden = false;
      } else wv.hidden = true;
      tg.textContent = editSets ? 'EDIT' : (!PICKABLE ? '' : (p > 0 && !mine ? 'CLASH' : (p === 2 ? 'MUST' : (p === 1 ? 'WANT' : ''))));
      var state = p === 2 ? 'must see' : (p === 1 ? 'want to see' : 'not picked');
      b.setAttribute('aria-label', a.n + ', ' + where(a.st) + ', ' + fmt(a.m0) + ' to about ' + fmt(a.m1) + (editSets ? ', tap to fix the time' : (PICKABLE ? ', ' + state + (mine ? ', in your plan' : (p > 0 ? ', clashes, not in your plan' : '')) : '')));
    });
    var ke = $('kEditSets');
    if (ke) { ke.classList.toggle('down', editSets); ke.setAttribute('aria-pressed', editSets ? 'true' : 'false'); ke.textContent = editSets ? 'Done fixing' : 'Fix set times'; }
    if ($('kAddSet')) $('kAddSet').hidden = !editSets;
  }
  function onGrid(e) {
    var b = e.target.closest ? e.target.closest('.lb') : null;
    if (!b) return;
    var id = b.getAttribute('data-id');
    if (editSets) { if (BY[id]) editSet(BY[id]); return; }
    if (!PICKABLE) return;
    var p = ((picks[id] || 0) + 1) % 3;
    if (p) picks[id] = p; else delete picks[id];
    save(KEY + '-picks-v1', picks);
    buzz(p ? 10 : 5);
    refresh();
  }

  /* ---------- plan list ---------- */
  function watchNote(it) {
    var a = it.act;
    if (it.full) return 'Full set, till ' + fmt(a.m1) + '.';
    if (it.late && it.early) return 'Catch ' + fmt(it.m0) + ' to ' + fmt(it.m1) + '.';
    if (it.late) return 'Join at ' + fmt(it.m0) + ', till ' + fmt(a.m1) + '.';
    return 'Leave at ' + fmt(it.m1) + ' (it runs till ' + fmt(a.m1) + ').';
  }
  function paintPlan() {
    if (!$('planList')) return;
    var n = count(picks), fullN = 0, part = 0, miss = [], minutes = 0;
    cov.forEach(function (c) { minutes += c.got; if (c.got >= c.len) fullN++; else if (c.got > 0) part++; else miss.push(c); });
    if ($('planSum')) $('planSum').innerHTML = !PICKABLE ? '' : (n ? ('Catching <b>' + fullN + ' of ' + n + '</b> picks in full' + (part ? ', <b>' + part + '</b> in part' : '') + '. About <b>' + hrs(minutes) + '</b> of sets.') :
      esc(TXT.noPicks || 'Nothing picked yet. Tap sets in the lineup.'));
    $('planList').innerHTML = items.map(function (it) {
      if (it.type === 'walk') {
        return '<li class="pl walk" data-m0="' + it.m0 + '" data-m1="' + it.m1 + '"><time>' + fmt(it.m0) + '</time><div><b>Walk to ' + esc(sname(it.to)) + '</b><span>About ' + it.mins + ' min, for ' + esc(it.next.n) + ' at ' + fmt(it.m1) + '.</span></div></li>';
      }
      return '<li class="pl blk ' + it.st + '" data-m0="' + it.m0 + '" data-m1="' + it.m1 + '"><time>' + fmt(it.m0) + '</time><div><b>' + esc(it.act.n) + '</b><span>' + esc(sname(it.st)) + '. ' + (PICKABLE ? watchNote(it) : 'Till ' + fmt(it.act.m1) + '.') + '</span>' +
        (picks[it.act.id] === 2 ? '<em>Must</em>' : '') + '</div></li>';
    }).join('');
    if ($('missed')) $('missed').innerHTML = miss.length ? ('<h3>Not in the plan</h3><ul class="chips no">' + miss.map(function (c) {
      return '<li>' + esc(c.act.n) + ' ' + fmt(c.act.m0) + (c.over.length ? ', clashes with ' + esc(c.over.map(function (a) { return a.n; }).join(' and ')) : '') + '</li>';
    }).join('') + '</ul>') : '';
    var kf = $('kFull');
    if (kf) { kf.classList.toggle('down', !!full); kf.setAttribute('aria-pressed', full ? 'true' : 'false'); kf.textContent = full ? 'Full sets only: on' : 'Full sets only: off'; }
  }

  /* ---------- the day, merged ---------- */
  function paintDay() {
    if (!$('dayList')) return;
    var rows = logiRows(), list = [], hidden = [];
    rows.forEach(function (r) { if (r.hidden) hidden.push(r); else list.push(r); });
    custom.forEach(function (c) {
      list.push({ kind: 'custom', id: c.id, m: c.m, day: c.when.replace(/-late$/, ''), t: fmt(c.m), b: esc(c.b), s: (c.st ? esc(where(c.st)) + '. ' : '') + esc(c.s || ''), mine: true });
    });
    items.forEach(function (it) {
      if (it.type === 'walk') list.push({ kind: 'plan', m: it.m0, day: MAIN, t: fmt(it.m0), b: 'Walk to ' + esc(sname(it.to)), s: 'About ' + it.mins + ' min, for ' + esc(it.next.n) + '.' });
      else list.push({ kind: 'plan', m: it.m0, day: MAIN, t: fmt(it.m0), b: esc(it.act.n), s: esc(sname(it.st)) + '. ' + (PICKABLE ? watchNote(it) : ''), st: it.st });
    });
    if (!items.length && PICKABLE) list.push({ kind: 'plan', m: S0 + 60, day: MAIN, t: fmt(S0 + 60), b: 'Pick your sets', s: 'Tap the lineup in <a href="#picks">Your picks</a> and they land here.' });
    list.sort(function (x, y) { return x.m - y.m; });
    var html = '', day = '';
    list.forEach(function (it, i) {
      if (it.day !== day) { day = it.day; html += '<li class="day">' + esc((cfg.days || {})[day] || day) + '</li>'; }
      var ed = (editDay && it.kind !== 'plan') ? '<button type="button" class="key sm bone rowedit" data-kind="' + it.kind + '" data-id="' + it.id + '">Edit</button>' : '';
      html += '<li data-m="' + it.m + '" data-next="' + (list[i + 1] ? list[i + 1].m : it.m + 180) + '"' + (it.st ? ' data-stage="' + it.st + '"' : '') + (it.mine ? ' class="mine"' : '') +
        '><time>' + it.t + '</time><div class="what"><b>' + it.b + (it.mine ? ' <i class="mine-tag">Yours</i>' : '') + '</b><span>' + it.s + '</span>' + ed + '</div></li>';
    });
    $('dayList').innerHTML = html;
    var hd = $('hiddenDay');
    if (hd) hd.innerHTML = (editDay && hidden.length) ? ('<h3>Hidden from your day</h3><div class="keys">' + hidden.map(function (r) {
      return '<button type="button" class="key sm grey" data-unhide="' + r.id + '">Show ' + esc(r.rawB) + '</button>';
    }).join('') + '</div>') : '';
    var kd = $('kEditDay');
    if (kd) { kd.classList.toggle('down', editDay); kd.setAttribute('aria-pressed', editDay ? 'true' : 'false'); kd.textContent = editDay ? 'Done editing' : 'Edit my day'; }
  }
  function onDay(e) {
    var b = e.target.closest ? e.target.closest('.rowedit') : null;
    if (!b) return;
    var id = b.getAttribute('data-id');
    if (b.getAttribute('data-kind') === 'custom') { custom.forEach(function (c) { if (c.id === id) editItem(c); }); return; }
    logiRows().forEach(function (r) { if (r.id === id) editLogi(r); });
  }

  /* ---------- now ---------- */
  function onStage(st, m) {
    var now = null, next = null;
    ACTS.forEach(function (a) {
      if (a.st !== st) return;
      if (a.m0 <= m && m < a.m1) now = a;
      else if (a.m0 > m && (!next || a.m0 < next.m0)) next = a;
    });
    return { now: now, next: next };
  }
  function nextCustom(m) {
    var best = null;
    custom.forEach(function (c) { if (c.m >= m - 5 && (!best || c.m < best.m)) best = c; });
    return best;
  }
  function paintNow() {
    if (!$('nowCard')) return;
    var m = nowMin(), eye, big, act = '', next = '', stage = '';
    var realDays = Math.ceil((BASE - Date.now()) / 864e5);
    var fp = segs[0];
    var first = fp ? esc(TXT.firstUp || 'First up for you') + ': <b>' + esc(fp.act.n) + '</b>, ' + fmt(fp.m0) + ' on ' + esc(sname(fp.st)) + '.' : esc(TXT.pickPrompt || 'Pick your sets below and this tells you where to be.');
    var doors = cfg.doors !== undefined ? cfg.doors : S0;
    if (m < 0) {
      eye = 'Countdown'; big = realDays <= 1 ? 'Tomorrow' : realDays + ' days out';
      act = first; next = esc(TXT.preview || 'Drag the slider to see how the day plays out. On the day this panel runs live.');
    } else if (m < doors) {
      eye = 'Today'; big = TXT.beforeDoors || ('Doors at ' + fmt(doors));
      act = first; next = esc(TXT.doorsIn || 'Doors in') + ' ' + hrs(Math.max(0, Math.round(doors - m))) + '.' + (TXT.doorsNote ? ' ' + esc(TXT.doorsNote) : '');
    } else if (m >= S1) {
      var after = TXT.after || ['That\'s the night', 'Get home safe.', ''];
      eye = 'Done'; big = after[0]; act = esc(after[1] || ''); next = esc(after[2] || '');
      if (m >= S1 + 240) { big = 'See you next time'; act = ''; next = ''; }
    } else {
      var cur = null, nx = null, pv = null;
      segs.forEach(function (s) {
        if (s.m0 <= m && m < s.m1) cur = s;
        if (s.m0 > m && !nx) nx = s;
        if (s.m1 <= m) pv = s;
      });
      if (cur) {
        stage = cur.st; eye = 'Be here'; big = where(cur.st);
        act = '<b>' + esc(cur.act.n) + '</b><small>' + (cur.m1 < cur.act.m1 ? 'Leave at ' + fmt(cur.m1) : 'Till ' + fmt(cur.m1)) + ', ' + Math.max(1, Math.round(cur.m1 - m)) + ' min left</small>';
        var aft = segs[segs.indexOf(cur) + 1];
        if (aft) {
          var w2 = walk(cur.st, aft.st);
          next = 'Next: <b>' + esc(aft.act.n) + '</b>, ' + fmt(aft.m0) + ' on ' + esc(sname(aft.st)) + (w2 ? ' (about a ' + w2 + ' min walk)' : '') + '.';
        } else next = esc(TXT.lastSet || 'That\'s your last one.');
      } else if (nx) {
        var wk = pv ? walk(pv.st, nx.st) : 0, leave = nx.m0 - wk, mins = Math.max(1, Math.round(nx.m0 - m));
        stage = nx.st;
        if (wk && m >= leave) {
          eye = 'Move'; big = 'Walk to ' + sname(nx.st);
          act = '<b>' + esc(nx.act.n) + '</b><small>Starts ' + fmt(nx.m0) + ', in ' + mins + ' min</small>';
          next = 'About a ' + wk + ' min walk from ' + esc(sname(pv.st)) + '.';
        } else {
          eye = 'Free time';
          big = wk ? 'Leave at ' + nb(fmt(leave)) : (mins <= 60 ? 'Next in ' + mins + ' min' : 'Free till ' + nb(fmt(nx.m0)));
          act = '<b>' + esc(nx.act.n) + '</b><small>' + fmt(nx.m0) + ' on ' + esc(sname(nx.st)) + (wk ? ', about a ' + wk + ' min walk' : '') + '</small>';
          next = esc(TXT.freeTime || 'Till then: water, food, merch.');
        }
      } else {
        var any = count(picks) || !PICKABLE;
        eye = any ? 'You\'re done' : 'Right now';
        big = any ? (TXT.roam || 'Free roam') : 'Pick your sets';
        act = esc(any ? (TXT.planOver || 'Your plan is over. Catch whatever\'s on.') : (TXT.pickPrompt || 'Tap the lineup below and this panel tells you where to be.'));
      }
    }
    var nc = (m >= 0 && m < S1 + 120) ? nextCustom(m) : null;
    if (nc && nc.m - m <= 30) next += '<span class="heads">' + (nc.m <= m ? 'Now' : 'Heads up') + ': <b>' + esc(nc.b) + '</b> at ' + fmt(nc.m) + (nc.st ? ', ' + esc(where(nc.st)) : '') + '.</span>';
    if (preview !== null) eye = 'Preview, ' + fmt(m);
    $('nowCard').setAttribute('data-stage', stage);
    $('nowEye').textContent = eye;
    $('nowBig').textContent = big;
    $('nowAct').innerHTML = act;
    $('nowNext').innerHTML = next;
    if ($('stagesNow')) {
      var tm = (m >= S0 && m < S1) ? m : S0;
      $('stagesNow').innerHTML = ORDER.map(function (st) {
        var p = onStage(st, tm), a = p.now || p.next, live = !!p.now && m >= S0 && m < S1;
        if (!a) return '<div class="sn ' + st + ' off"><span class="st">' + esc(sname(st)) + '</span><b>Done</b><span>Nothing left</span></div>';
        var pk = picks[a.id] || 0;
        return '<div class="sn ' + st + (live ? '' : ' off') + '"><span class="st">' + esc(sname(st)) + (live ? ' &#183; now' : ' &#183; next') + '</span><b>' + esc(a.n) + '</b><span>' +
          (live ? 'Till about ' + fmt(a.m1) : 'At ' + fmt(a.m0)) + '</span>' + (pk ? '<i>' + (pk === 2 ? 'MUST' : 'WANT') + '</i>' : '') + '</div>';
      }).join('');
    }
    var ln = $('luNow');
    if (ln) { if (m >= S0 && m <= S1) { ln.hidden = false; ln.style.top = ((m - S0) * PXM) + 'px'; } else ln.hidden = true; }
    [].forEach.call(document.querySelectorAll('#dayList li[data-m]'), function (li) {
      var a = +li.getAttribute('data-m'), b = +li.getAttribute('data-next');
      li.classList.toggle('done', m >= b); li.classList.toggle('now', m >= a && m < b);
    });
    [].forEach.call(document.querySelectorAll('#planList li'), function (li) {
      var a = +li.getAttribute('data-m0'), b = +li.getAttribute('data-m1');
      li.classList.toggle('done', m >= b); li.classList.toggle('now', m >= a && m < b);
    });
    var sc = $('scrubIn');
    if (sc) {
      if (preview === null) {
        var live2 = Math.round(m / 5) * 5;
        sc.value = (live2 >= +sc.min && live2 <= +sc.max) ? live2 : (cfg.previewStart || S0 + 360);
        $('scrubTime').textContent = (m >= +sc.min && m <= +sc.max) ? 'Live, ' + fmt(m) : 'Drag to preview';
        $('liveKey').hidden = true;
      } else { $('scrubTime').textContent = fmt(preview); $('liveKey').hidden = false; }
    }
    var pill = $('status');
    if (pill) {
      if (Date.now() >= BASE + (S1 + 180) * 60000) pill.textContent = TXT.pillAfter || 'See you next time';
      else if (Date.now() >= BASE) pill.textContent = 'Today';
      else pill.textContent = realDays <= 1 ? 'Tomorrow' : realDays + ' days out';
    }
  }

  function refresh() { replan(); paintGrid(); paintPlan(); paintDay(); paintNow(); }
  function rebuild() { buildActs(); buildGrid(); refresh(); }

  /* ---------- copy + share ---------- */
  function copyText(text, btn, okLabel) {
    var orig = btn.textContent;
    function flash(t) { btn.textContent = t; setTimeout(function () { btn.textContent = orig; }, 1600); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); flash(okLabel); } catch (e) { flash('Copy failed'); }
      document.body.removeChild(ta);
    }
    try { navigator.clipboard.writeText(text).then(function () { flash(okLabel); }, fallback); } catch (e) { fallback(); }
  }
  function planText() {
    var rows = [];
    items.forEach(function (it) {
      if (it.type === 'walk') rows.push([it.m0, fmt(it.m0) + '  walk to ' + sname(it.to) + ' (about ' + it.mins + ' min)']);
      else rows.push([it.m0, fmt(it.m0) + '  ' + it.act.n + ', ' + sname(it.st) + (it.full ? '' : ' (' + fmt(it.m0) + ' to ' + fmt(it.m1) + ')')]);
    });
    custom.forEach(function (c) { rows.push([c.m, fmt(c.m) + '  ' + c.b + (c.st ? ', ' + where(c.st) : '')]); });
    rows.sort(function (a, b) { return a[0] - b[0]; });
    return [(TXT.planTitle || 'My plan') + (myName ? ' (' + myName + ')' : '')].concat(rows.map(function (r) { return r[1]; })).join('\n');
  }
  function shareUrl() {
    var p = {};
    for (var k in picks) if (picks[k] > 0) p[k] = picks[k];
    var payload = { v: 1, f: myName, p: p, c: custom.map(function (c) { return { w: c.when, t: hhmm(c.m), b: c.b, s: c.s, st: c.st }; }),
      x: extraActs.map(function (x) { return { id: x.id, n: x.n, st: x.st, s: x.s, e: x.e }; }) };
    return location.origin + location.pathname + '#plan=' + encodeURIComponent(JSON.stringify(payload));
  }
  function readShared() {
    var h = location.hash || '';
    try {
      if (h.indexOf('#plan=') === 0) {
        var d = JSON.parse(decodeURIComponent(h.slice(6)));
        var got = { from: String(d.f || '').slice(0, 40), picks: {}, custom: [], extra: [] };
        (d.x || []).forEach(function (x) { if (x && STAGE[x.st] && x.n && x.s && x.e) got.extra.push({ id: String(x.id || uid()).slice(0, 24), n: String(x.n).slice(0, 60), st: x.st, s: x.s, e: x.e }); });
        var ok = {}; ACTS.forEach(function (a) { ok[a.id] = 1; }); got.extra.forEach(function (x) { ok[x.id] = 1; });
        for (var k in (d.p || {})) if (ok[k] && (d.p[k] === 1 || d.p[k] === 2)) got.picks[k] = d.p[k];
        (d.c || []).forEach(function (c) {
          if (!c || !c.b || !c.t) return;
          var w = String(c.w || MAIN);
          got.custom.push({ id: uid(), when: w, m: whenToM(w, c.t), b: String(c.b).slice(0, 60), s: String(c.s || '').slice(0, 300), st: STAGE[c.st] ? c.st : '' });
        });
        return (count(got.picks) || got.custom.length) ? got : null;
      }
      if (h.indexOf('#picks=') === 0) {
        var pk = {};
        h.slice(7).split(',').forEach(function (p) {
          var bits = p.split('.'), id = decodeURIComponent(bits[0] || ''), v = +bits[1];
          if (BY[id] && (v === 1 || v === 2)) pk[id] = v;
        });
        return count(pk) ? { from: '', picks: pk, custom: [], extra: [] } : null;
      }
    } catch (e) {}
    return null;
  }
  function useShared(got) {
    got.extra.forEach(function (x) { if (!extraActs.some(function (y) { return y.id === x.id; })) extraActs.push(x); });
    picks = got.picks;
    got.custom.forEach(function (c) { if (!custom.some(function (y) { return y.b === c.b && y.m === c.m; })) custom.push(c); });
    save(KEY + '-extra-v1', extraActs); save(KEY + '-picks-v1', picks); save(KEY + '-custom-v1', custom);
    rebuild();
  }

  /* ---------- pack list ---------- */
  var PK = cfg.packKey || (KEY + '-pack-v1');
  var packed = load(PK, {}) || {};
  var packHide = load(KEY + '-packhide-v1', {});
  var packMine = load(KEY + '-packmine-v1', []);
  var packEdit = false;
  function packBoxes() { return [].slice.call(document.querySelectorAll('.pack input[type=checkbox]')); }
  function paintPack() {
    var ul = $('packCustom');
    if (ul) ul.innerHTML = packMine.map(function (p) {
      var id = 'pm-' + p.id;
      return '<li data-mine="' + p.id + '"><input type="checkbox" id="' + id + '" class="sr"' + (packed[id] ? ' checked' : '') + '><label for="' + id + '"><span class="led" aria-hidden="true">&#10003;</span><span class="txt">' + esc(p.t) + '</span></label>' +
        '<button type="button" class="key sm red pack-x" data-del="' + p.id + '">Remove</button></li>';
    }).join('');
    [].forEach.call(document.querySelectorAll('.pack li'), function (li) {
      if (li.hasAttribute('data-mine')) return;
      var cb = li.querySelector('input[type=checkbox]');
      if (!cb) return;
      var x = li.querySelector('.pack-x');
      if (!x) { x = document.createElement('button'); x.type = 'button'; x.className = 'key sm grey pack-x'; x.setAttribute('data-hide', cb.id); li.appendChild(x); }
      var hid = !!packHide[cb.id];
      li.classList.toggle('is-hidden', hid);
      x.textContent = hid ? 'Show' : 'Hide';
    });
    document.documentElement.classList.toggle('pack-editing', packEdit);
    var ke = $('packEdit');
    if (ke) { ke.classList.toggle('down', packEdit); ke.setAttribute('aria-pressed', packEdit ? 'true' : 'false'); ke.textContent = packEdit ? 'Done editing' : 'Edit list'; }
    packCount();
  }
  function packCount() {
    var boxes = packBoxes().filter(function (b) { var li = b.closest('li'); return !(li && li.classList.contains('is-hidden')); });
    var n = boxes.filter(function (b) { return b.checked; }).length;
    if ($('packcount')) $('packcount').textContent = n + ' of ' + boxes.length + ' packed';
  }
  function initPack() {
    packBoxes().forEach(function (b) { if (packed[b.id]) b.checked = true; });
    document.addEventListener('change', function (e) {
      var b = e.target;
      if (!b || b.type !== 'checkbox' || !b.closest('.pack')) return;
      packed[b.id] = b.checked; save(PK, packed); packCount(); buzz(b.checked ? 12 : 6);
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.pack-x') : null;
      if (!t) return;
      if (t.hasAttribute('data-del')) {
        var id = t.getAttribute('data-del');
        packMine = packMine.filter(function (p) { return p.id !== id; }); delete packed['pm-' + id];
        save(KEY + '-packmine-v1', packMine); save(PK, packed);
      } else {
        var cid = t.getAttribute('data-hide');
        if (packHide[cid]) delete packHide[cid]; else packHide[cid] = 1;
        save(KEY + '-packhide-v1', packHide);
      }
      paintPack();
    });
    on('packreset', function () { packBoxes().forEach(function (b) { b.checked = false; }); packed = {}; save(PK, packed); packCount(); });
    on('packEdit', function () { packEdit = !packEdit; paintPack(); });
    function addMine() {
      var inp = $('packNew'), t = inp ? inp.value.trim() : '';
      if (!t) { if (inp) inp.focus(); return; }
      packMine.push({ id: uid(), t: t.slice(0, 60) }); save(KEY + '-packmine-v1', packMine);
      inp.value = ''; paintPack();
    }
    on('packAdd', addMine);
    var inp = $('packNew');
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addMine(); } });
    paintPack();
  }

  /* ---------- wiring ---------- */
  function init() {
    var nav = document.querySelector('.jump');
    function navH() { document.documentElement.style.setProperty('--navh', (nav ? nav.offsetHeight : 60) + 'px'); }
    navH(); window.addEventListener('resize', navH);
    buildActs();
    buildGrid();
    var preset = (cfg.presets || [])[0];
    if (preset && $('kPreset')) {
      $('kPreset').textContent = preset.label;
      on('kPreset', function () {
        var go = function () { picks = JSON.parse(JSON.stringify(preset.picks)); save(KEY + '-picks-v1', picks); refresh(); };
        if (!count(picks) || armed(this, 'Tap again to replace yours')) { this.setAttribute('data-arm', '0'); this.textContent = preset.label; go(); }
      });
    }
    on('kClear', function () {
      if (!count(picks)) return;
      if (armed(this, 'Tap again to clear')) { this.setAttribute('data-arm', '0'); this.textContent = 'Clear'; picks = {}; save(KEY + '-picks-v1', picks); refresh(); }
    });
    on('kFull', function () { full = !full; save(KEY + '-full-v1', full); refresh(); });
    on('kEditSets', function () { editSets = !editSets; paintGrid(); });
    on('kAddSet', addSet);
    on('kEditDay', function () { editDay = !editDay; paintDay(); paintNow(); });
    on('kAddItem', function () { editItem(null); });
    var dl = $('dayList'); if (dl) dl.addEventListener('click', onDay);
    var hd = $('hiddenDay');
    if (hd) hd.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-unhide]') : null;
      if (!b) return;
      var id = b.getAttribute('data-unhide'), ed = logiEdits[id] || {};
      delete ed.hidden;
      if (Object.keys(ed).length) logiEdits[id] = ed; else delete logiEdits[id];
      save(KEY + '-logi-v1', logiEdits); paintDay(); paintNow();
    });
    var nm = $('myName');
    if (nm) { nm.value = myName; nm.addEventListener('input', function () { myName = this.value.trim().slice(0, 40); save(KEY + '-name-v1', myName); }); }
    on('kCopy', function () { if (items.length || custom.length) copyText(planText(), this, 'Copied'); });
    on('kShare', function () {
      if (!count(picks) && !custom.length) return;
      var url = shareUrl();
      var title = (myName ? myName + '\'s ' : 'My ') + (TXT.shareWhat || 'plan');
      if (navigator.share) navigator.share({ title: title, url: url }).catch(function () {});
      else copyText(url, this, 'Link copied');
    });
    var shared = PICKABLE ? readShared() : null;
    if (shared && $('sharedPicks')) {
      var parts = [];
      if (count(shared.picks)) parts.push(count(shared.picks) + ' set' + (count(shared.picks) === 1 ? '' : 's'));
      if (shared.custom.length) parts.push(shared.custom.length + ' stop' + (shared.custom.length === 1 ? '' : 's') + ' of their own');
      $('sharedMsg').innerHTML = (shared.from ? '<b>' + esc(shared.from) + '</b> sent' : 'Someone sent') + ' you their plan: ' + parts.join(' and ') + '.';
      $('sharedPicks').hidden = false;
      on('kUseShared', function () { useShared(shared); $('sharedPicks').hidden = true; history.replaceState(null, '', location.pathname); });
      on('kKeepMine', function () { $('sharedPicks').hidden = true; history.replaceState(null, '', location.pathname); });
    }
    var sc = $('scrubIn');
    if (sc) sc.addEventListener('input', function () { preview = +this.value; paintNow(); });
    on('liveKey', function () { preview = null; paintNow(); });
    [].slice.call(document.querySelectorAll('[data-copy]')).forEach(function (btn) {
      btn.addEventListener('click', function () { copyText(btn.getAttribute('data-copy'), btn, 'Copied'); });
    });
    initPack();
    refresh();
    setInterval(function () { if (preview === null) paintNow(); }, 20000);
  }

  init();
  window.DAYPLAN_ENGINE = { planSplit: planSplit, planFull: planFull, items: toItems, acts: function () { return ACTS; }, walk: walk };
})();
