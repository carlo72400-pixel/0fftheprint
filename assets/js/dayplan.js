/* DAYPLAN: one engine for any event with a schedule (a festival with stages, a wedding
   run of show, a shoot day). The page supplies window.DAYPLAN (the event) plus the
   containers below; this file does the planning, the live NOW panel, the tap-to-pick
   lineup grid, the merged day timeline, the time slider, the pack list, the editing,
   and the SHARED PLAN: one secret invite link, and everybody on it sees the same plan
   (stops, time fixes, added sets, everybody's Want/Must votes) synced through the
   site's database (migration 047). Works offline from the copy on the phone.
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
  var SHARE = cfg.shared || null;

  function walk(a, b) {
    var A = STAGE[a].area || a, B = STAGE[b].area || b;
    if (A === B) return 0;
    var k = [A, B].sort().join('|');
    return WALKS[k] !== undefined ? WALKS[k] : 10;
  }
  function slug(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function hm(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function uid() { return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }

  /* ---------- storage ---------- */
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }
  // this phone's own plan (used when there is no shared plan, and kept as is while one is on)
  var L = {
    picks: PICKABLE ? load(KEY + '-picks-v1', {}) : {},
    full: load(KEY + '-full-v1', false),
    actEdits: load(KEY + '-acts-v1', {}),
    extraActs: load(KEY + '-extra-v1', []),
    custom: load(KEY + '-custom-v1', []),
    logiEdits: load(KEY + '-logi-v1', {})
  };
  function saveLocal() {
    save(KEY + '-picks-v1', L.picks); save(KEY + '-full-v1', L.full); save(KEY + '-acts-v1', L.actEdits);
    save(KEY + '-extra-v1', L.extraActs); save(KEY + '-custom-v1', L.custom); save(KEY + '-logi-v1', L.logiEdits);
  }
  var myName = load(KEY + '-name-v1', '');
  var me = load(KEY + '-me-v1', null);
  if (!me || !me.id) { me = { id: uid() }; save(KEY + '-me-v1', me); }
  // the shared plan on this phone: { code, rev, rows: { 'kind|item': { d, b, x, r } }, pending: [rows], syncs }
  var SH = SHARE ? load(KEY + '-sh-v1', null) : null;
  function saveSH() { if (SH) save(KEY + '-sh-v1', SH); }

  // the working state the page draws from (the local plan, or the shared one)
  var picks, full, actEdits, extraActs, custom, logiEdits, votes = {}, members = {};
  function useLocal() {
    picks = L.picks; full = L.full; actEdits = L.actEdits; extraActs = L.extraActs; custom = L.custom; logiEdits = L.logiEdits;
    votes = {}; members = {};
  }
  function applyShared() {
    actEdits = {}; extraActs = []; custom = []; logiEdits = {}; votes = {}; members = {}; full = false;
    var rows = SH.rows, k;
    for (k in rows) {
      var r = rows[k];
      if (!r || r.x) continue;
      var bar = k.indexOf('|'), kind = k.slice(0, bar), item = k.slice(bar + 1), d = r.d || {};
      if (kind === 'act') actEdits[item] = { s: d.s, e: d.e };
      else if (kind === 'extra') extraActs.push({ id: item, n: d.n, st: d.st, s: d.s, e: d.e });
      else if (kind === 'stop') custom.push({ id: item, when: d.when || MAIN, m: +d.m, b: d.b || '', s: d.s || '', st: d.st || '', by: r.b || '' });
      else if (kind === 'logi') logiEdits[item] = d;
      else if (kind === 'member') members[item] = d.n || '';
      else if (kind === 'setting' && item === 'full') full = !!d.on;
      else if (kind === 'vote') {
        var bar2 = item.indexOf('|'), mid = item.slice(0, bar2), aid = item.slice(bar2 + 1);
        if (d.p === 1 || d.p === 2) (votes[aid] = votes[aid] || {})[mid] = d.p;
      }
    }
    if (myName) members[me.id] = myName;
    picks = {};
    for (k in votes) if (votes[k][me.id]) picks[k] = votes[k][me.id];
  }
  function applyState() { if (SH) applyShared(); else useLocal(); }

  /* ---------- the lineup, with the fixes ---------- */
  var ACTS = [], BY = {};
  function buildActs() {
    ACTS = cfg.acts.map(function (r) {
      var id = r.id || slug(r.n), ed = actEdits[id];
      var a = { id: id, n: r.n, st: r.st, m0: hm(ed && ed.s ? ed.s : r.s), m1: hm(ed && ed.e ? ed.e : r.e), base: { s: r.s, e: r.e }, edited: !!(ed && ed.s) };
      if (a.m1 <= a.m0) a.m1 += 1440;
      return a;
    });
    extraActs.forEach(function (x) {
      if (!STAGE[x.st] || !x.s || !x.e) return;
      var a = { id: x.id, n: x.n || 'Set', st: x.st, m0: hm(x.s), m1: hm(x.e), extra: true };
      if (a.m1 <= a.m0) a.m1 += 1440;
      ACTS.push(a);
    });
    BY = {};
    ACTS.forEach(function (a) { BY[a.id] = a; });
  }

  /* ---------- who wants what ---------- */
  var LEVEL = { 1: 1, 2: 3 }, BONUS = { 1: 1, 2: 15 };
  function wantOf(a) {                      // per-slot weight of a set for the plan
    if (!PICKABLE) return 1;
    if (!SH) return LEVEL[picks[a.id]] || 0;
    var v = votes[a.id], w = 0; if (!v) return 0;
    for (var m in v) w += LEVEL[v[m]] || 0;
    return w;
  }
  function bonusOf(a) {
    if (!SH) return BONUS[picks[a.id]] || 0;
    var v = votes[a.id], b = 0; if (!v) return 0;
    for (var m in v) b += BONUS[v[m]] || 0;
    return b;
  }
  function topLevel(a) {                    // the strongest vote on a set (for drawing it)
    if (!SH) return picks[a.id] || 0;
    var v = votes[a.id], t = 0; if (!v) return 0;
    for (var m in v) t = Math.max(t, v[m]);
    return t;
  }
  function nameOf(mid) { return (mid === me.id ? (myName || 'You') : (members[mid] || 'Someone')); }
  function voters(a) {                      // names of who picked a set, Musts first
    var v = votes[a.id] || {}, out = [];
    Object.keys(v).sort(function (x, y) { return (v[y] - v[x]) || nameOf(x).localeCompare(nameOf(y)); }).forEach(function (m) { out.push({ id: m, n: nameOf(m), p: v[m] }); });
    return out;
  }
  function initials(list) {
    var seen = {};
    return list.map(function (x) {
      var n = (x.n || '?').trim(), i = n.charAt(0).toUpperCase();
      if (seen[i]) i = n.slice(0, 2).replace(/^./, function (c) { return c.toUpperCase(); });
      seen[i] = 1; return i;
    }).join('\u00b7');
  }

  /* ---------- planning ---------- */
  // Split mode: 5-minute slots, you can leave a set early or join late.
  // State = (slot, stage, slots in a row of the current set, capped at 3).
  // Catching 15 minutes of a set pays a one-time bonus (big for a Must), so two
  // clashing Musts get split instead of one dropped. You only ever walk TO a set
  // somebody picked, which also stops the plan hopping out of a set and back in.
  // With a shared plan, every vote adds up: the plan follows what the most people want most.
  var MOVE = 0.5, NEG = -1e18;
  function planSplit() {
    var G = ORDER.length, w = [], bo = [], actAt = [], k, g, h, c, row, row2, row3;
    for (k = 0; k < K; k++) {
      row = []; row2 = []; row3 = [];
      for (g = 0; g < G; g++) { row.push(0); row2.push(null); row3.push(0); }
      w.push(row); actAt.push(row2); bo.push(row3);
    }
    ACTS.forEach(function (a) {
      var gi = ORDER.indexOf(a.st), wt = wantOf(a), bn = bonusOf(a);
      if (!wt) return;
      for (var m = a.m0; m + SL <= a.m1; m += SL) {
        var kk = Math.floor((m - S0) / SL);
        if (kk >= 0 && kk < K) { w[kk][gi] = wt; actAt[kk][gi] = a; bo[kk][gi] = bn; }
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
          if (cont && c > 0) relax(k, g, Math.min(c + 1, 3), pv + v + (c === 2 ? bo[k][g] : 0), [k - 1, g, c]);
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
  function planFull() {
    var arr = ACTS.filter(function (a) { return wantOf(a) > 0; })
      .sort(function (x, y) { return (x.m1 - y.m1) || (x.m0 - y.m0); });
    var n = arr.length, dp = [], prev = [], i, j;
    for (i = 0; i < n; i++) {
      var val = wantOf(arr[i]) * (arr[i].m1 - arr[i].m0), bv = val, bp = -1;
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
  function coverage(segs) {
    var res = [];
    ACTS.forEach(function (a) {
      if (!(wantOf(a) > 0)) return;
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
  function ago(ms) { var s = Math.round((Date.now() - ms) / 1000); return s < 20 ? 'just now' : (s < 90 ? 'a minute ago' : (s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' hr ago')); }
  function joinNames(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  var segs = [], items = [], cov = [], preview = null, editDay = false, editSets = false;
  function replan() {
    segs = !PICKABLE ? planAll() : (full ? planFull() : planSplit());
    items = toItems(segs);
    cov = PICKABLE ? coverage(segs) : [];
  }
  function nowMin() { return preview !== null ? preview : (Date.now() - BASE) / 60000; }

  /* ---------- writes: the local plan, or a row of the shared one ---------- */
  function put(kind, item, data, del) {
    var key = kind + '|' + item, row = { k: kind, i: item, d: data || {}, b: myName || '', x: !!del };
    SH.rows[key] = { d: row.d, b: row.b, x: row.x, r: (SH.rows[key] || {}).r || 0 };
    SH.pending = SH.pending.filter(function (p) { return p.k + '|' + p.i !== key; });
    SH.pending.push(row);
    saveSH(); applyShared(); schedulePush(500);
  }
  function setVote(id, p) {
    if (SH) return put('vote', me.id + '|' + id, { p: p || 0 }, !p);
    if (p) L.picks[id] = p; else delete L.picks[id];
    saveLocal(); useLocal();
  }
  function setMyVotes(map) {
    if (SH) {
      var k;
      for (k in votes) if (votes[k][me.id] && !map[k]) put('vote', me.id + '|' + k, { p: 0 }, true);
      for (k in map) put('vote', me.id + '|' + k, { p: map[k] }, false);
      return;
    }
    L.picks = JSON.parse(JSON.stringify(map)); saveLocal(); useLocal();
  }
  function setFull(v) { if (SH) return put('setting', 'full', { on: !!v }, false); L.full = !!v; saveLocal(); useLocal(); }
  function setAct(id, s, e) {
    if (SH) return put('act', id, s ? { s: s, e: e } : {}, !s);
    if (s) L.actEdits[id] = { s: s, e: e }; else delete L.actEdits[id];
    saveLocal(); useLocal();
  }
  function setExtra(x, del) {
    if (SH) { put('extra', x.id, del ? {} : { n: x.n, st: x.st, s: x.s, e: x.e }, del); if (del) put('vote', me.id + '|' + x.id, { p: 0 }, true); return; }
    L.extraActs = L.extraActs.filter(function (y) { return y.id !== x.id; });
    if (!del) L.extraActs.push(x); else delete L.picks[x.id];
    saveLocal(); useLocal();
  }
  function setStop(c, del) {
    if (SH) return put('stop', c.id, del ? {} : { when: c.when, m: c.m, b: c.b, s: c.s, st: c.st }, del);
    L.custom = L.custom.filter(function (y) { return y.id !== c.id; });
    if (!del) L.custom.push(c);
    saveLocal(); useLocal();
  }
  function setLogi(id, ed) {
    if (SH) return put('logi', id, ed || {}, !ed);
    if (ed) L.logiEdits[id] = ed; else delete L.logiEdits[id];
    saveLocal(); useLocal();
  }

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
  function sheetOpen() { return sheet && !sheet.hidden; }
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
  function disarm(btn, label) { btn.setAttribute('data-arm', '0'); btn.textContent = label; }

  /* ---------- editors ---------- */
  function editSet(a) {
    var f = (a.extra ? fld('fN', 'Name', txt('fN', a.n, 'Who is playing', 60)) + fld('fSt', 'Stage', sel('fSt', stageOpts(), a.st)) : '') +
      '<div class="fld-row">' + fld('fS', 'Starts', tim('fS', hhmm(a.m0))) + fld('fE', 'Ends', tim('fE', hhmm(a.m1))) + '</div>' +
      '<p class="sheet-note">' + (a.extra ? 'An added set.' + (SH ? ' Everyone on the shared plan sees it.' : ' Only you see it, unless you send your plan.') :
        'Official: ' + fmt(hm(a.base.s)) + ' to about ' + fmt(hm(a.base.e)) + '. Fix it here if the festival moves it' + (SH ? ', for everyone on the plan.' : '.')) + '</p>';
    var k = key('save', 'Save', 'gold') + (a.edited ? key('reset', 'Back to official', 'grey') : '') + (a.extra ? key('del', 'Delete set', 'red') : '') + key('x', 'Cancel', 'grey');
    openSheet((a.extra ? 'Added set: ' : 'Fix the time: ') + a.n, f, k, function (act, btn) {
      if (act === 'x') return closeSheet();
      if (act === 'reset') { setAct(a.id, null); closeSheet(); return rebuild(); }
      if (act === 'del') {
        if (!armed(btn, 'Tap again to delete')) return;
        setExtra({ id: a.id }, true); closeSheet(); return rebuild();
      }
      if (act !== 'save') return;
      var s = val('fS'), e = val('fE');
      if (!s || !e) return sheetErr('Set a start and an end time.');
      if (s === e) return sheetErr('The end has to be after the start.');
      if (a.extra) {
        var n = val('fN');
        if (!n) return sheetErr('Give it a name.');
        setExtra({ id: a.id, n: n, st: val('fSt'), s: s, e: e }, false);
      } else if (s === a.base.s && e === a.base.e) setAct(a.id, null);
      else setAct(a.id, s, e);
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
      setExtra({ id: id, n: n, st: val('fSt'), s: s, e: e }, false);
      setVote(id, 1);
      closeSheet(); rebuild();
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
      fld('fS', 'Note', area('fS', c.s, 'Optional')) +
      (SH ? '<p class="sheet-note">Everyone on the shared plan sees this.</p>' : '');
    var k = key('save', isNew ? 'Add it' : 'Save', 'gold') + (isNew ? '' : key('del', 'Delete', 'red')) + key('x', 'Cancel', 'grey');
    openSheet(isNew ? 'Add to the day' : 'Edit: ' + c.b, f, k, function (act, btn) {
      if (act === 'x') return closeSheet();
      if (act === 'del') {
        if (!armed(btn, 'Tap again to delete')) return;
        setStop(c, true); closeSheet(); return refresh();
      }
      if (act !== 'save') return;
      var b = val('fB'), t = val('fT'), w = val('fW') || MAIN;
      if (!b) return sheetErr('Say what it is.');
      if (!t) return sheetErr('Pick a time.');
      setStop({ id: c.id || uid(), when: w, m: whenToM(w, t), b: b, s: val('fS'), st: val('fSt') }, false);
      closeSheet(); refresh();
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
    var f = fld('fB', 'What', txt('fB', row.rawB, '', 60)) + fld('fT', 'Time', tim('fT', hhmm(row.m))) + fld('fS', 'Note', area('fS', row.rawS, '')) +
      (SH ? '<p class="sheet-note">This changes it for everyone on the shared plan.</p>' : '');
    var k = key('save', 'Save', 'gold') + key('hide', 'Hide it', 'red') + (row.edited ? key('reset', 'Back to original', 'grey') : '') + key('x', 'Cancel', 'grey');
    openSheet('Edit: ' + row.rawB, f, k, function (act) {
      if (act === 'x') return closeSheet();
      if (act === 'hide') { var cur = logiEdits[row.id] || {}; setLogi(row.id, Object.assign({}, cur, { hidden: true })); closeSheet(); return refresh(); }
      if (act === 'reset') { setLogi(row.id, null); closeSheet(); return refresh(); }
      if (act !== 'save') return;
      var b = val('fB'), t = val('fT');
      if (!b) return sheetErr('Say what it is.');
      if (!t) return sheetErr('Pick a time.');
      var dayBase = Math.floor(row.orig.m / 1440) * 1440;
      setLogi(row.id, { m: dayBase + hm(t), b: b, s: val('fS') });
      closeSheet(); refresh();
    });
  }

  /* ---------- lineup grid ---------- */
  function axisLabel(h) { var hh = h % 24; return (hh % 12 || 12) + (hh < 12 ? 'A' : 'P'); }
  var gridBound = false, gridSig = '';
  function buildGrid() {
    var grid = $('grid');
    if (!grid) return;
    var sig = ACTS.map(function (a) { return a.id + a.m0 + '-' + a.m1 + a.st + a.n; }).join();
    if (sig === gridSig && grid.firstChild) return;
    gridSig = sig;
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
    grid.classList.toggle('group', !!SH);
    var segBy = {};
    segs.forEach(function (s) { (segBy[s.act.id] = segBy[s.act.id] || []).push(s); });
    [].forEach.call(grid.querySelectorAll('.lb'), function (b) {
      var a = BY[b.getAttribute('data-id')];
      if (!a) return;
      var p = PICKABLE ? topLevel(a) : 1, mine = segBy[a.id], wv = b.querySelector('.wv'), tg = b.querySelector('.tg');
      var vs = SH ? voters(a) : [];
      b.setAttribute('data-pick', p);
      b.classList.toggle('myvote', !!(SH && picks[a.id]));
      b.classList.toggle('inplan', !!mine);
      b.classList.toggle('clash', p > 0 && !mine);
      if (mine) {
        var s0 = mine[0].m0, s1 = mine[mine.length - 1].m1;
        wv.style.top = ((s0 - a.m0) * PXM) + 'px'; wv.style.height = Math.max(4, (s1 - s0) * PXM - 3) + 'px'; wv.hidden = false;
      } else wv.hidden = true;
      if (editSets) tg.textContent = 'EDIT';
      else if (!PICKABLE) tg.textContent = '';
      else if (SH) tg.textContent = vs.length ? initials(vs) : '';
      else tg.textContent = p > 0 && !mine ? 'CLASH' : (p === 2 ? 'MUST' : (p === 1 ? 'WANT' : ''));
      var state = SH ? (vs.length ? 'picked by ' + joinNames(vs.map(function (x) { return x.n + (x.p === 2 ? ' (must)' : ''); })) : 'nobody picked it') :
        (p === 2 ? 'must see' : (p === 1 ? 'want to see' : 'not picked'));
      b.setAttribute('aria-label', a.n + ', ' + where(a.st) + ', ' + fmt(a.m0) + ' to about ' + fmt(a.m1) + (editSets ? ', tap to fix the time' : (PICKABLE ? ', ' + state + (mine ? ', in the plan' : (p > 0 ? ', clashes, not in the plan' : '')) : '')));
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
    if (SH && !myName) { needName(); return; }
    var p = ((picks[id] || 0) + 1) % 3;
    setVote(id, p);
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
  function whoWants(a) {
    var vs = voters(a);
    if (!vs.length) return '';
    return '<em class="who">' + esc(joinNames(vs.map(function (x) { return x.n + (x.p === 2 ? ' (must)' : ''); }))) + '</em>';
  }
  function paintPlan() {
    if (!$('planList')) return;
    var n = cov.length, fullN = 0, part = 0, miss = [], minutes = 0;
    cov.forEach(function (c) { minutes += c.got; if (c.got >= c.len) fullN++; else if (c.got > 0) part++; else miss.push(c); });
    if ($('planSum')) $('planSum').innerHTML = !PICKABLE ? '' : (n ? ((SH ? 'Everybody\'s picks: <b>' : 'Catching <b>') + fullN + ' of ' + n + '</b> sets in full' + (part ? ', <b>' + part + '</b> in part' : '') + '. About <b>' + hrs(minutes) + '</b> of sets.') :
      esc(TXT.noPicks || 'Nothing picked yet. Tap sets in the lineup.'));
    $('planList').innerHTML = items.map(function (it) {
      if (it.type === 'walk') {
        return '<li class="pl walk" data-m0="' + it.m0 + '" data-m1="' + it.m1 + '"><time>' + fmt(it.m0) + '</time><div><b>Walk to ' + esc(sname(it.to)) + '</b><span>About ' + it.mins + ' min, for ' + esc(it.next.n) + ' at ' + fmt(it.m1) + '.</span></div></li>';
      }
      return '<li class="pl blk ' + it.st + '" data-m0="' + it.m0 + '" data-m1="' + it.m1 + '"><time>' + fmt(it.m0) + '</time><div><b>' + esc(it.act.n) + '</b><span>' + esc(sname(it.st)) + '. ' + (PICKABLE ? watchNote(it) : 'Till ' + fmt(it.act.m1) + '.') + '</span>' +
        (SH ? whoWants(it.act) : (picks[it.act.id] === 2 ? '<em>Must</em>' : '')) + '</div></li>';
    }).join('');
    if ($('missed')) $('missed').innerHTML = miss.length ? ('<h3>Not in the plan</h3><ul class="chips no">' + miss.map(function (c) {
      var vs = SH ? voters(c.act).map(function (x) { return x.n; }) : [];
      return '<li>' + esc(c.act.n) + ' ' + fmt(c.act.m0) + (vs.length ? ' (' + esc(joinNames(vs)) + ')' : '') + (c.over.length ? ', clashes with ' + esc(c.over.map(function (a) { return a.n; }).join(' and ')) : '') + '</li>';
    }).join('') + '</ul>') : '';
    var kf = $('kFull');
    if (kf) { kf.classList.toggle('down', !!full); kf.setAttribute('aria-pressed', full ? 'true' : 'false'); kf.textContent = full ? 'Full sets only: on' : 'Full sets only: off'; }
    if ($('kShare')) $('kShare').hidden = !!SH;
    if ($('kPreset')) { var ps = (cfg.presets || [])[0]; if (ps && $('kPreset').getAttribute('data-arm') !== '1') $('kPreset').textContent = SH ? ps.label + ' as mine' : ps.label; }
  }

  /* ---------- the day, merged ---------- */
  function paintDay() {
    if (!$('dayList')) return;
    var rows = logiRows(), list = [], hidden = [];
    rows.forEach(function (r) { if (r.hidden) hidden.push(r); else list.push(r); });
    custom.forEach(function (c) {
      var by = SH ? (c.by && c.by !== myName ? c.by : 'You') : 'Yours';
      list.push({ kind: 'custom', id: c.id, m: c.m, day: String(c.when || MAIN).replace(/-late$/, ''), t: fmt(c.m), b: esc(c.b), s: (c.st ? esc(where(c.st)) + '. ' : '') + esc(c.s || ''), tag: by });
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
      html += '<li data-m="' + it.m + '" data-next="' + (list[i + 1] ? list[i + 1].m : it.m + 180) + '"' + (it.st ? ' data-stage="' + it.st + '"' : '') + (it.tag ? ' class="mine"' : '') +
        '><time>' + it.t + '</time><div class="what"><b>' + it.b + (it.tag ? ' <i class="mine-tag">' + esc(it.tag) + '</i>' : '') + '</b><span>' + it.s + '</span>' + ed + '</div></li>';
    });
    $('dayList').innerHTML = html;
    var hd = $('hiddenDay');
    if (hd) hd.innerHTML = (editDay && hidden.length) ? ('<h3>Hidden from the day</h3><div class="keys">' + hidden.map(function (r) {
      return '<button type="button" class="key sm grey" data-unhide="' + r.id + '">Show ' + esc(r.rawB) + '</button>';
    }).join('') + '</div>') : '';
    var kd = $('kEditDay');
    if (kd) { kd.classList.toggle('down', editDay); kd.setAttribute('aria-pressed', editDay ? 'true' : 'false'); kd.textContent = editDay ? 'Done editing' : (SH ? 'Edit the day' : 'Edit my day'); }
    if ($('kAddItem')) $('kAddItem').textContent = SH ? 'Add to the day' : 'Add to my day';
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
    var first = fp ? esc(TXT.firstUp || 'First up') + ': <b>' + esc(fp.act.n) + '</b>, ' + fmt(fp.m0) + ' on ' + esc(sname(fp.st)) + '.' : esc(TXT.pickPrompt || 'Pick your sets below and this tells you where to be.');
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
        } else next = esc(TXT.lastSet || 'That\'s the last one.');
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
        var any = cov.length || !PICKABLE;
        eye = any ? 'That\'s the plan' : 'Right now';
        big = any ? (TXT.roam || 'Free roam') : 'Pick your sets';
        act = esc(any ? (TXT.planOver || 'The plan is over. Catch whatever\'s on.') : (TXT.pickPrompt || 'Tap the lineup below and this panel tells you where to be.'));
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
        var pk = topLevel(a), vs = SH ? voters(a) : [];
        return '<div class="sn ' + st + (live ? '' : ' off') + '"><span class="st">' + esc(sname(st)) + (live ? ' &#183; now' : ' &#183; next') + '</span><b>' + esc(a.n) + '</b><span>' +
          (live ? 'Till about ' + fmt(a.m1) : 'At ' + fmt(a.m0)) + '</span>' + (SH ? (vs.length ? '<i>' + esc(initials(vs)) + '</i>' : '') : (pk ? '<i>' + (pk === 2 ? 'MUST' : 'WANT') + '</i>' : '')) + '</div>';
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
    paintSyncLine();
  }

  function refresh() { replan(); paintGrid(); paintPlan(); paintDay(); paintNow(); paintShare(); }
  function rebuild() { buildActs(); buildGrid(); refresh(); }

  /* ---------- the shared plan: sync ---------- */
  var client = null, syncing = false, pushTimer = null, lastOk = SH && SH.ok ? SH.ok : 0, offline = false, lostPlan = false, shareMsg = '';
  function sb() {
    if (client) return client;
    if (!window.supabase || !window.OTP_SUPABASE) return null;
    client = window.supabase.createClient(window.OTP_SUPABASE.url, window.OTP_SUPABASE.anonKey,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return client;
  }
  function rpc(name, args) {
    var c = sb();
    if (!c) return Promise.reject(new Error('offline'));
    return c.rpc(name, args).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function schedulePush(ms) { clearTimeout(pushTimer); pushTimer = setTimeout(function () { sync(false); }, ms || 600); }
  function sync(fullPull) {
    if (!SH || syncing) return;
    syncing = true;
    var code = SH.code;
    var pushStep = function () {
      if (!SH || !SH.pending.length) return Promise.resolve(true);
      var batch = SH.pending.slice(0, 60);
      return rpc('dayplan_push', { p_code: code, p_items: batch }).then(function (d) {
        if (d === null) return false;
        if (!SH || SH.code !== code) return true;
        var sent = {}; batch.forEach(function (b) { sent[b.k + '|' + b.i] = b; });
        SH.pending = SH.pending.filter(function (p) { return sent[p.k + '|' + p.i] !== p; });
        saveSH();
        return SH.pending.length ? pushStep() : true;
      });
    };
    pushStep().then(function (ok) {
      if (!SH || SH.code !== code) throw { stale: true };
      if (ok === false) throw { lost: true };
      SH.syncs = (SH.syncs || 0) + 1;
      // every 10th pull is a full one: it also catches a row whose rev was taken before a newer one landed
      var since = (fullPull || SH.syncs % 10 === 0) ? 0 : SH.rev;
      return rpc('dayplan_pull', { p_code: code, p_since: since });
    }).then(function (d) {
      if (!SH || SH.code !== code) throw { stale: true };
      if (d === null) throw { lost: true };
      var changed = false;
      (d.rows || []).forEach(function (r) {
        var key = r.k + '|' + r.i;
        if (SH.pending.some(function (p) { return p.k + '|' + p.i === key; })) return;
        var old = SH.rows[key];
        if (!old || old.r !== r.r || JSON.stringify(old.d) !== JSON.stringify(r.d) || old.x !== r.x) changed = true;
        SH.rows[key] = { d: r.d, b: r.b, x: r.x, r: r.r };
      });
      SH.rev = Math.max(SH.rev || 0, d.rev || 0);
      delete SH.fresh;
      lastOk = Date.now(); SH.ok = lastOk; offline = false; lostPlan = false;
      saveSH();
      if (changed && !sheetOpen()) { applyShared(); rebuild(); } else paintShare();
    }).catch(function (e) {
      if (e && e.stale) return;
      if (e && e.lost && SH && SH.fresh) {
        // a dead invite link: nothing was ever pulled, so go straight back to this phone's own plan
        drop(KEY + '-sh-v1'); SH = null; useLocal();
        shareMsg = 'That invite link doesn\'t work. Ask for a fresh one.';
        rebuild(); return;
      }
      if (e && e.lost) { lostPlan = true; } else { offline = true; }
      paintShare();
    }).then(function () {
      syncing = false;
      if (SH && SH.pending.length && !offline && !lostPlan) schedulePush(3000);
      paintSyncLine();
    });
  }
  function startShared() {
    if (!myName) { needName(); return; }
    var btn = $('kShareStart');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
    rpc('dayplan_start', { p_event: SHARE.event }).then(function (code) {
      if (!code) throw new Error('no code');
      SH = { code: code, rev: 0, rows: {}, pending: [], syncs: 0 };
      // bring this phone's plan in: name, picks, stops, fixes, added sets, the full-sets switch
      put('member', me.id, { n: myName }, false);
      for (var k in L.picks) if (L.picks[k]) put('vote', me.id + '|' + k, { p: L.picks[k] }, false);
      L.custom.forEach(function (c) { put('stop', c.id, { when: c.when, m: c.m, b: c.b, s: c.s, st: c.st }, false); });
      for (k in L.logiEdits) put('logi', k, L.logiEdits[k], false);
      for (k in L.actEdits) put('act', k, L.actEdits[k], false);
      L.extraActs.forEach(function (x) { put('extra', x.id, { n: x.n, st: x.st, s: x.s, e: x.e }, false); });
      if (L.full) put('setting', 'full', { on: true }, false);
      shareMsg = 'Your shared plan is on. Now invite everybody.';
      applyShared(); rebuild(); sync(true);
    }).catch(function () {
      shareMsg = 'Couldn\'t reach the plan right now. Try again when you have signal.';
      if (btn) { btn.disabled = false; btn.textContent = 'Make it a shared plan'; }
      paintShare();
    });
  }
  function joinShared(code) {
    if (!myName) { needName(); return; }
    var mine = {}, k;
    for (k in L.picks) if (L.picks[k]) mine[k] = L.picks[k];
    SH = { code: code, rev: 0, rows: {}, pending: [], syncs: 0, fresh: true };
    put('member', me.id, { n: myName }, false);
    for (k in mine) put('vote', me.id + '|' + k, { p: mine[k] }, false);
    shareMsg = 'You\'re on the shared plan.';
    invite = null;
    history.replaceState(null, '', location.pathname);
    applyShared(); rebuild(); sync(true);
  }
  function leaveShared() {
    // your picks stop counting for the group (best effort, if there's signal) and come back as your own plan
    var code = SH.code, out = [{ k: 'member', i: me.id, d: {}, b: myName || '', x: true }], k;
    L.picks = {};
    for (k in votes) if (votes[k][me.id]) { L.picks[k] = votes[k][me.id]; out.push({ k: 'vote', i: me.id + '|' + k, d: { p: 0 }, b: myName || '', x: true }); }
    saveLocal();
    for (var n = 0; n < out.length; n += 60) rpc('dayplan_push', { p_code: code, p_items: out.slice(n, n + 60) }).catch(function () {});
    drop(KEY + '-sh-v1'); SH = null; offline = false; lostPlan = false; lastOk = 0;
    useLocal(); shareMsg = 'You left the shared plan. Your picks are your own plan again.';
    rebuild();
  }
  function inviteUrl() { return location.origin + location.pathname + '#join=' + SH.code + '.' + encodeURIComponent(myName || ''); }
  function needName() {
    shareMsg = 'Type your name first, so everybody knows whose picks are whose.';
    paintShare();
    var n = $('shName'); if (n) { try { n.focus(); } catch (e) {} n.scrollIntoView({ block: 'center' }); }
  }
  var invite = null;   // { code, from } from a #join= link
  function readInvite() {
    var h = location.hash || '';
    if (h.indexOf('#join=') !== 0) return null;
    var rest = h.slice(6), dot = rest.indexOf('.'), code = (dot < 0 ? rest : rest.slice(0, dot)).toLowerCase(), from = '';
    try { from = dot < 0 ? '' : decodeURIComponent(rest.slice(dot + 1)).slice(0, 40); } catch (e) {}
    return /^[0-9a-f]{64}$/.test(code) ? { code: code, from: from } : null;
  }
  function paintShare() {
    var box = $('shareBox');
    if (!box || !SHARE) return;
    // never redraw under a thumb that's typing; the status line updates on its own (paintSyncLine)
    if (document.activeElement && document.activeElement.id === 'shName' && box.contains(document.activeElement)) { paintSyncLine(); return; }
    var nameField = '<label class="namebox" for="shName">Your name<input type="text" id="shName" maxlength="40" placeholder="Mom, Sis, Gianni" autocomplete="given-name" value="' + esc(myName) + '"></label>';
    var html = '';
    if (invite && (!SH || SH.code !== invite.code)) {
      html = '<p class="sh-big">' + (invite.from ? '<b>' + esc(invite.from) + '</b> invited you' : 'You\'re invited') + ' to the shared plan.</p>' +
        '<p class="sh-sub">Everybody on it sees the same day: the stops, the time fixes, and everybody\'s picks. Your picks come with you.' + (SH ? ' You\'ll leave the shared plan you\'re on now.' : '') + '</p>' +
        nameField + '<div class="keys"><button class="key gold" type="button" id="kJoin">Join the plan</button><button class="key grey" type="button" id="kNoJoin">Not now</button></div>';
    } else if (SH) {
      var names = [], k;
      for (k in members) if (members[k]) names.push(members[k]);
      names.sort();
      html = '<p class="sh-big">Shared plan' + (names.length ? ' with <b>' + esc(joinNames(names)) + '</b>' : '') + '</p>' +
        '<p class="sh-sub" id="shStatus"></p>' +
        (myName ? '' : nameField) +
        '<div class="keys"><button class="key gold" type="button" id="kInvite">Invite people</button><button class="key grey" type="button" id="kSyncNow">Sync now</button><button class="key red" type="button" id="kLeave">Leave</button></div>' +
        '<p class="sh-sub small">Anyone with the invite link can see and change this plan, so send it only to your people. Keep this page open in a tab on the day: if signal drops it keeps working.</p>';
    } else {
      html = '<p class="sh-big">One plan for everybody</p>' +
        '<p class="sh-sub">Right now this plan lives only on this phone. Make it shared, send the invite, and everybody sees the same day: the stops, the time fixes, and everybody\'s picks, with the plan built around what the most people want.</p>' +
        nameField + '<div class="keys"><button class="key gold" type="button" id="kShareStart">Make it a shared plan</button></div>';
    }
    if (shareMsg) html += '<p class="sh-msg" role="status">' + esc(shareMsg) + '</p>';
    // only redraw when something changed, so a sync never swaps a button out from under a tap
    if (box.getAttribute('data-sig') !== html) { box.innerHTML = html; box.setAttribute('data-sig', html); }
    paintSyncLine();
  }
  function statusText() {
    return lostPlan ? 'This shared plan can\'t be found anymore. Your copy is still here.' :
      (offline ? 'No signal. Changes are saved on this phone and go up when you\'re back online.' :
        (SH && SH.pending.length ? 'Saving...' : (lastOk ? 'Synced ' + ago(lastOk) + '.' : 'Syncing...')));
  }
  function paintSyncLine() {
    var ln = $('syncLine');
    if (!ln) return;
    if (!SH) { ln.hidden = true; return; }
    ln.hidden = false;
    ln.textContent = 'Shared plan \u00b7 ' + (lostPlan ? 'can\'t be found' : (offline ? 'no signal, saved on this phone' : (SH.pending.length ? 'saving' : (lastOk ? 'synced ' + ago(lastOk) : 'syncing'))));
    ln.classList.toggle('warn', offline || lostPlan);
    var st = $('shStatus');
    if (st) { var t = statusText(); if (st.textContent !== t) st.textContent = t; st.classList.toggle('warn', offline || lostPlan); }
  }
  function onShareBox(e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    if (t.id === 'kShareStart') return startShared();
    if (t.id === 'kJoin') return joinShared(invite.code);
    if (t.id === 'kNoJoin') { invite = null; history.replaceState(null, '', location.pathname); shareMsg = ''; return paintShare(); }
    if (t.id === 'kSyncNow') { shareMsg = ''; return sync(true); }
    if (t.id === 'kLeave') { if (armed(t, 'Tap again to leave')) { disarm(t, 'Leave'); leaveShared(); } return; }
    if (t.id === 'kInvite') {
      if (!myName) return needName();
      var url = inviteUrl();
      if (navigator.share) navigator.share({ title: myName + ' invited you to ' + (TXT.inviteWhat || 'the plan'), url: url }).catch(function () {});
      else copyText(url, t, 'Link copied');
    }
  }
  function onShareInput(e) {
    if (e.target && e.target.id === 'shName') setMyName(e.target.value);
  }
  function setMyName(v) {
    myName = String(v || '').trim().slice(0, 40); save(KEY + '-name-v1', myName);
    var a = $('myName'), b = $('shName');
    if (a && document.activeElement !== a) a.value = myName;
    if (b && document.activeElement !== b) b.value = myName;
    if (SH) { clearTimeout(setMyName.t); setMyName.t = setTimeout(function () { if (SH) { put('member', me.id, { n: myName }, false); refresh(); } }, 700); }
    if (shareMsg && myName && /name first/.test(shareMsg)) shareMsg = '';
  }

  /* ---------- copy + send (no shared plan) ---------- */
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
    return [(TXT.planTitle || 'The plan') + (myName && !SH ? ' (' + myName + ')' : '')].concat(rows.map(function (r) { return r[1]; })).join('\n');
  }
  function shareUrl() {
    var payload = { v: 1, f: myName, p: L.picks, c: L.custom.map(function (c) { return { w: c.when, t: hhmm(c.m), b: c.b, s: c.s, st: c.st }; }),
      x: L.extraActs.map(function (x) { return { id: x.id, n: x.n, st: x.st, s: x.s, e: x.e }; }) };
    return location.origin + location.pathname + '#plan=' + encodeURIComponent(JSON.stringify(payload));
  }
  function readSent() {
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
  function useSent(got) {
    got.extra.forEach(function (x) { if (!L.extraActs.some(function (y) { return y.id === x.id; })) L.extraActs.push(x); });
    L.picks = got.picks;
    got.custom.forEach(function (c) { if (!L.custom.some(function (y) { return y.b === c.b && y.m === c.m; })) L.custom.push(c); });
    saveLocal(); useLocal(); rebuild();
  }

  /* ---------- pack list (always this phone's own) ---------- */
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
    if (SH && (!SH.code || !SH.rows || !SH.pending)) { SH = null; drop(KEY + '-sh-v1'); }
    applyState();
    buildActs();
    buildGrid();
    var preset = (cfg.presets || [])[0];
    if (preset && $('kPreset')) {
      $('kPreset').textContent = preset.label;
      on('kPreset', function () {
        if (SH && !myName) return needName();
        var go = function () { setMyVotes(preset.picks); rebuild(); };
        if (!count(picks) || armed(this, 'Tap again to replace yours')) { disarm(this, preset.label); go(); }
      });
    }
    on('kClear', function () {
      if (!count(picks)) return;
      if (armed(this, 'Tap again to clear yours')) { disarm(this, 'Clear'); setMyVotes({}); refresh(); }
    });
    on('kFull', function () { setFull(!full); refresh(); });
    on('kEditSets', function () { editSets = !editSets; paintGrid(); });
    on('kAddSet', addSet);
    on('kEditDay', function () { editDay = !editDay; paintDay(); paintNow(); });
    on('kAddItem', function () { editItem(null); });
    var dl = $('dayList'); if (dl) dl.addEventListener('click', onDay);
    var hd = $('hiddenDay');
    if (hd) hd.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-unhide]') : null;
      if (!b) return;
      var id = b.getAttribute('data-unhide'), ed = Object.assign({}, logiEdits[id] || {});
      delete ed.hidden;
      setLogi(id, Object.keys(ed).length ? ed : null); paintDay(); paintNow();
    });
    var nm = $('myName');
    if (nm) { nm.value = myName; nm.addEventListener('input', function () { setMyName(this.value); }); }
    on('kCopy', function () { if (items.length || custom.length) copyText(planText(), this, 'Copied'); });
    on('kShare', function () {
      if (!count(L.picks) && !L.custom.length) return;
      var url = shareUrl();
      var title = (myName ? myName + '\'s ' : 'My ') + (TXT.shareWhat || 'plan');
      if (navigator.share) navigator.share({ title: title, url: url }).catch(function () {});
      else copyText(url, this, 'Link copied');
    });
    var sent = PICKABLE ? readSent() : null;
    if (sent && $('sharedPicks') && !SH) {
      var parts = [];
      if (count(sent.picks)) parts.push(count(sent.picks) + ' set' + (count(sent.picks) === 1 ? '' : 's'));
      if (sent.custom.length) parts.push(sent.custom.length + ' stop' + (sent.custom.length === 1 ? '' : 's') + ' of their own');
      $('sharedMsg').innerHTML = (sent.from ? '<b>' + esc(sent.from) + '</b> sent' : 'Someone sent') + ' you their plan: ' + parts.join(' and ') + '.';
      $('sharedPicks').hidden = false;
      on('kUseShared', function () { useSent(sent); $('sharedPicks').hidden = true; history.replaceState(null, '', location.pathname); });
      on('kKeepMine', function () { $('sharedPicks').hidden = true; history.replaceState(null, '', location.pathname); });
    }
    if (SHARE) {
      invite = readInvite();
      if (invite && SH && SH.code === invite.code) { invite = null; history.replaceState(null, '', location.pathname); }
      var box = $('shareBox');
      if (box) { box.addEventListener('click', onShareBox); box.addEventListener('input', onShareInput); }
      if (invite) setTimeout(function () { var b2 = $('shareBox'); if (b2) b2.scrollIntoView({ block: 'center' }); }, 300);
      // an invite tapped while the page is already open only changes the #
      window.addEventListener('hashchange', function () {
        var inv = readInvite();
        if (!inv) return;
        if (SH && SH.code === inv.code) { history.replaceState(null, '', location.pathname); return; }
        invite = inv; shareMsg = ''; paintShare();
        var b3 = $('shareBox'); if (b3) b3.scrollIntoView({ block: 'center' });
      });
    }
    var sc = $('scrubIn');
    if (sc) sc.addEventListener('input', function () { preview = +this.value; paintNow(); });
    on('liveKey', function () { preview = null; paintNow(); });
    [].slice.call(document.querySelectorAll('[data-copy]')).forEach(function (btn) {
      btn.addEventListener('click', function () { copyText(btn.getAttribute('data-copy'), btn, 'Copied'); });
    });
    initPack();
    refresh();
    if (SH) sync(true);
    setInterval(function () {
      if (preview === null) paintNow();
      if (SH && !document.hidden) sync(false);
    }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && SH) sync(false); });
    window.addEventListener('online', function () { if (SH) { offline = false; sync(true); } });
  }

  init();
  window.DAYPLAN_ENGINE = { acts: function () { return ACTS; }, walk: walk, shared: function () { return SH; }, sync: function () { sync(true); } };
})();
