/* DAYPLAN: one engine for any event with a schedule (a festival with stages, a wedding
   run of show, a shoot day). The page supplies window.DAYPLAN (the event) plus the
   containers below; this file does the planning, the live NOW panel, the tap-to-pick
   lineup grid, the merged day timeline, the time slider and the pack list.
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

  function walk(a, b) {
    var A = STAGE[a].area || a, B = STAGE[b].area || b;
    if (A === B) return 0;
    var k = [A, B].sort().join('|');
    return WALKS[k] !== undefined ? WALKS[k] : 10;
  }
  function slug(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function hm(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  var ACTS = cfg.acts.map(function (r) { return { id: r.id || slug(r.n), n: r.n, st: r.st, m0: hm(r.s), m1: hm(r.e), note: r.note || '' }; });
  var BY = {};
  ACTS.forEach(function (a) { BY[a.id] = a; });

  /* ---------- planning ---------- */
  function weight(p) { return p === 2 ? 3 : (p === 1 ? 1 : 0); }
  // Split mode: 5-minute slots, you can leave a set early or join late.
  // State = (slot, stage, slots in a row of the current set, capped at 3).
  // Catching 15 minutes of a set pays a one-time bonus (big for a Must), so two
  // clashing Musts get split instead of one dropped. You only ever walk TO a set
  // you picked, which also stops the plan hopping out of a set and back in.
  var BONUS = { 1: 1, 2: 15 }, MOVE = 0.5, NEG = -1e18;
  function planSplit(picks) {
    var G = ORDER.length, w = [], actAt = [], k, g, h, c, row;
    for (k = 0; k < K; k++) {
      row = []; var row2 = [];
      for (g = 0; g < G; g++) { row.push(0); row2.push(null); }
      w.push(row); actAt.push(row2);
    }
    ACTS.forEach(function (a) {
      var gi = ORDER.indexOf(a.st), wt = weight(picks[a.id] || 0);
      for (var m = a.m0; m + SL <= a.m1; m += SL) {
        var kk = (m - S0) / SL;
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
          if (cont && c > 0) relax(k, g, Math.min(c + 1, 3), pv + v + (c === 2 ? BONUS[picks[cur.id]] : 0), [k - 1, g, c]);
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
      if (!a || !(picks[a.id] > 0)) continue;
      var m0 = S0 + k * SL, last = segs[segs.length - 1];
      if (last && last.act === a && last.m1 === m0) last.m1 = m0 + SL;
      else segs.push({ act: a, st: a.st, m0: m0, m1: m0 + SL });
    }
    return segs;
  }
  // Full-set mode: whole sets only, best chain by weight x minutes with walks in between.
  function planFull(picks) {
    var arr = ACTS.filter(function (a) { return picks[a.id] > 0; })
      .sort(function (x, y) { return (x.m1 - y.m1) || (x.m0 - y.m0); });
    var n = arr.length, dp = [], prev = [], i, j;
    for (i = 0; i < n; i++) {
      var val = weight(picks[arr[i].id]) * (arr[i].m1 - arr[i].m0), bv = val, bp = -1;
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
      it.full = s.m0 === s.act.m0 && s.m1 === s.act.m1; it.late = s.m0 > s.act.m0; it.early = s.m1 < s.act.m1;
      out.push(it);
      if (nx && nx.m0 >= s.m1) {
        var wk = walk(s.st, nx.st);
        if (wk > 0) out.push({ type: 'walk', from: s.st, to: nx.st, m0: nx.m0 - wk, m1: nx.m0, mins: wk, next: nx.act });
      }
    });
    return out;
  }
  function coverage(picks, segs) {
    var res = [];
    ACTS.forEach(function (a) {
      if (!(picks[a.id] > 0)) return;
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
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function count(o) { var n = 0; for (var k in o) if (o[k] > 0) n++; return n; }
  function sname(st) { return STAGE[st].name; }
  function where(st) { return STAGE[st].name + (cfg.stageWord ? ' ' + cfg.stageWord : ''); }

  var picks = PICKABLE ? load(KEY + '-picks-v1', {}) : {}, full = load(KEY + '-full-v1', false), preview = null;
  var segs = [], items = [], cov = [];
  function replan() {
    segs = !PICKABLE ? planAll() : (full ? planFull(picks) : planSplit(picks));
    items = toItems(segs);
    cov = PICKABLE ? coverage(picks, segs) : [];
  }
  function nowMin() { return preview !== null ? preview : (Date.now() - BASE) / 60000; }

  /* ---------- lineup grid ---------- */
  function axisLabel(h) { var hh = h % 24; return (hh % 12 || 12) + (hh < 12 ? 'A' : 'P'); }
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
        return '<button type="button" class="lb ' + st + '" data-id="' + a.id + '" style="top:' + ((a.m0 - S0) * PXM) + 'px;height:' + ((a.m1 - a.m0) * PXM - 3) + 'px"' + (PICKABLE ? '' : ' disabled') + '>' +
          '<i class="wv"></i><span class="nm">' + esc(a.n) + '</span><span class="tm">' + fmt(a.m0).replace(' ', '') + '</span><i class="tg"></i></button>';
      }).join('') + '</div>';
    }).join('');
    grid.innerHTML = head + '<div class="lu-body" style="height:' + ((S1 - S0) * PXM) + 'px"><div class="lu-axis">' + axis + '</div>' + cols +
      '<div class="lu-now" id="luNow" hidden><span>NOW</span></div></div>';
    grid.addEventListener('click', onGrid);
  }
  function paintGrid() {
    var segBy = {};
    segs.forEach(function (s) { (segBy[s.act.id] = segBy[s.act.id] || []).push(s); });
    [].forEach.call(document.querySelectorAll('#grid .lb'), function (b) {
      var a = BY[b.getAttribute('data-id')], p = PICKABLE ? (picks[a.id] || 0) : 1, mine = segBy[a.id], wv = b.querySelector('.wv'), tg = b.querySelector('.tg');
      b.setAttribute('data-pick', p);
      b.classList.toggle('inplan', !!mine);
      b.classList.toggle('clash', p > 0 && !mine);
      if (mine) {
        var s0 = mine[0].m0, s1 = mine[mine.length - 1].m1;
        wv.style.top = ((s0 - a.m0) * PXM) + 'px'; wv.style.height = ((s1 - s0) * PXM - 3) + 'px'; wv.hidden = false;
      } else wv.hidden = true;
      tg.textContent = !PICKABLE ? '' : (p > 0 && !mine ? 'CLASH' : (p === 2 ? 'MUST' : (p === 1 ? 'WANT' : '')));
      var state = p === 2 ? 'must see' : (p === 1 ? 'want to see' : 'not picked');
      b.setAttribute('aria-label', a.n + ', ' + where(a.st) + ', ' + fmt(a.m0) + ' to about ' + fmt(a.m1) + (PICKABLE ? ', ' + state + (mine ? ', in your plan' : (p > 0 ? ', clashes, not in your plan' : '')) : ''));
    });
  }
  function onGrid(e) {
    if (!PICKABLE) return;
    var b = e.target.closest ? e.target.closest('.lb') : null;
    if (!b) return;
    var id = b.getAttribute('data-id'), p = ((picks[id] || 0) + 1) % 3;
    if (p) picks[id] = p; else delete picks[id];
    save(KEY + '-picks-v1', picks);
    if (navigator.vibrate) { try { navigator.vibrate(p ? 10 : 5); } catch (er) {} }
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
      (TXT.noPicks || 'Nothing picked yet. Tap sets in the lineup.'));
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
    var list = (cfg.logistics || []).map(function (l) { return { m: l.m, day: l.day, t: l.t || fmt(l.m), b: l.b, s: l.s }; });
    items.forEach(function (it) {
      if (it.type === 'walk') list.push({ m: it.m0, day: cfg.mainDay, t: fmt(it.m0), b: 'Walk to ' + esc(sname(it.to)), s: 'About ' + it.mins + ' min, for ' + esc(it.next.n) + '.' });
      else list.push({ m: it.m0, day: cfg.mainDay, t: fmt(it.m0), b: esc(it.act.n), s: esc(sname(it.st)) + '. ' + (PICKABLE ? watchNote(it) : ''), st: it.st });
    });
    if (!items.length && PICKABLE) list.push({ m: S0 + 60, day: cfg.mainDay, t: fmt(S0 + 60), b: 'Pick your sets', s: 'Tap the lineup in <a href="#picks">Your picks</a> and they land here.' });
    list.sort(function (x, y) { return x.m - y.m; });
    var html = '', day = '';
    list.forEach(function (it, i) {
      if (it.day !== day) { day = it.day; html += '<li class="day">' + esc((cfg.days || {})[day] || day) + '</li>'; }
      html += '<li data-m="' + it.m + '" data-next="' + (list[i + 1] ? list[i + 1].m : it.m + 180) + '"' + (it.st ? ' data-stage="' + it.st + '"' : '') + '><time>' + it.t + '</time><div class="what"><b>' + it.b + '</b><span>' + it.s + '</span></div></li>';
    });
    $('dayList').innerHTML = html;
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
  function paintNow() {
    var m = nowMin(), eye, big, act = '', next = '', stage = '';
    var realDays = Math.ceil((BASE - Date.now()) / 864e5);
    var fp = segs[0];
    var first = fp ? (TXT.firstUp || 'First up for you') + ': <b>' + esc(fp.act.n) + '</b>, ' + fmt(fp.m0) + ' on ' + esc(sname(fp.st)) + '.' : (TXT.pickPrompt || 'Pick your sets below and this tells you where to be.');
    var doors = cfg.doors !== undefined ? cfg.doors : S0;
    if (m < 0) {
      eye = 'Countdown'; big = realDays <= 1 ? 'Tomorrow' : realDays + ' days out';
      act = first; next = TXT.preview || 'Drag the slider to see how the day plays out. On the day this panel runs live.';
    } else if (m < doors) {
      eye = 'Today'; big = TXT.beforeDoors || ('Doors at ' + fmt(doors));
      act = first; next = (TXT.doorsIn || 'Doors in') + ' ' + hrs(Math.max(0, Math.round(doors - m))) + '.' + (TXT.doorsNote ? ' ' + TXT.doorsNote : '');
    } else if (m >= S1) {
      var after = TXT.after || ['That\'s the night', 'Get home safe.', ''];
      eye = 'Done'; big = after[0]; act = after[1]; next = after[2];
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
        } else next = TXT.lastSet || 'That\'s your last one.';
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
          next = TXT.freeTime || 'Till then: water, food, merch.';
        }
      } else {
        eye = count(picks) || !PICKABLE ? 'You\'re done' : 'Right now';
        big = count(picks) || !PICKABLE ? (TXT.roam || 'Free roam') : 'Pick your sets';
        act = count(picks) || !PICKABLE ? (TXT.planOver || 'Your plan is over. Catch whatever\'s on.') : (TXT.pickPrompt || 'Tap the lineup below and this panel tells you where to be.');
      }
    }
    if (preview !== null) eye = 'Preview, ' + fmt(m);
    $('nowCard').setAttribute('data-stage', stage);
    $('nowEye').textContent = eye;
    $('nowBig').textContent = big;
    $('nowAct').innerHTML = act;
    $('nowNext').innerHTML = next;
    if ($('stagesNow')) {
      var tm = (m >= S0 && m < S1) ? m : S0;
      $('stagesNow').innerHTML = ORDER.map(function (st) {
        var p = onStage(st, tm), a = p.now || p.next, on = !!p.now && m >= S0 && m < S1;
        if (!a) return '<div class="sn ' + st + ' off"><span class="st">' + esc(sname(st)) + '</span><b>Done</b><span>Nothing left</span></div>';
        var pk = picks[a.id] || 0;
        return '<div class="sn ' + st + (on ? '' : ' off') + '"><span class="st">' + esc(sname(st)) + (on ? ' &#183; now' : ' &#183; next') + '</span><b>' + esc(a.n) + '</b><span>' +
          (on ? 'Till about ' + fmt(a.m1) : 'At ' + fmt(a.m0)) + '</span>' + (pk ? '<i>' + (pk === 2 ? 'MUST' : 'WANT') + '</i>' : '') + '</div>';
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
        var live = Math.round(m / 5) * 5;
        sc.value = (live >= +sc.min && live <= +sc.max) ? live : (cfg.previewStart || S0 + 360);
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

  /* ---------- keys ---------- */
  function twoStep(btn, label, go) {
    if (btn.getAttribute('data-arm') === '1') { btn.setAttribute('data-arm', '0'); btn.textContent = label; go(); return; }
    btn.setAttribute('data-arm', '1'); btn.textContent = 'Tap again to confirm';
    setTimeout(function () { if (btn.getAttribute('data-arm') === '1') { btn.setAttribute('data-arm', '0'); btn.textContent = label; } }, 3000);
  }
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
    var lines = [(TXT.planTitle || 'My plan')];
    items.forEach(function (it) {
      if (it.type === 'walk') lines.push(fmt(it.m0) + '  walk to ' + sname(it.to) + ' (about ' + it.mins + ' min)');
      else lines.push(fmt(it.m0) + '  ' + it.act.n + ', ' + sname(it.st) + (it.full ? '' : ' (' + fmt(it.m0) + ' to ' + fmt(it.m1) + ')'));
    });
    return lines.join('\n');
  }
  function shareUrl() {
    var ids = []; for (var k in picks) if (picks[k] > 0) ids.push(k + '.' + picks[k]);
    return location.origin + location.pathname + '#picks=' + ids.join(',');
  }
  function readShared() {
    var h = location.hash || '';
    if (h.indexOf('#picks=') !== 0) return null;
    var got = {};
    h.slice(7).split(',').forEach(function (p) {
      var bits = p.split('.'), id = decodeURIComponent(bits[0] || ''), v = +bits[1];
      if (BY[id] && (v === 1 || v === 2)) got[id] = v;
    });
    return count(got) ? got : null;
  }
  function on(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }

  function init() {
    var nav = document.querySelector('.jump');
    function navH() { document.documentElement.style.setProperty('--navh', (nav ? nav.offsetHeight : 60) + 'px'); }
    navH(); window.addEventListener('resize', navH);
    buildGrid();
    var preset = (cfg.presets || [])[0];
    if (preset && $('kPreset')) {
      $('kPreset').textContent = preset.label;
      on('kPreset', function () {
        var b = this, go = function () { picks = JSON.parse(JSON.stringify(preset.picks)); save(KEY + '-picks-v1', picks); refresh(); };
        if (count(picks)) twoStep(b, preset.label, go); else go();
      });
    }
    on('kClear', function () { if (count(picks)) twoStep(this, 'Clear', function () { picks = {}; save(KEY + '-picks-v1', picks); refresh(); }); });
    on('kFull', function () { full = !full; save(KEY + '-full-v1', full); refresh(); });
    on('kCopy', function () { if (items.length) copyText(planText(), this, 'Copied'); });
    on('kShare', function () {
      if (!count(picks)) return;
      var url = shareUrl();
      if (navigator.share) navigator.share({ title: TXT.shareTitle || 'My picks', url: url }).catch(function () {});
      else copyText(url, this, 'Link copied');
    });
    var shared = PICKABLE ? readShared() : null;
    if (shared && $('sharedPicks')) {
      $('sharedN').textContent = count(shared);
      $('sharedPicks').hidden = false;
      on('kUseShared', function () { picks = shared; save(KEY + '-picks-v1', picks); $('sharedPicks').hidden = true; history.replaceState(null, '', location.pathname); refresh(); });
      on('kKeepMine', function () { $('sharedPicks').hidden = true; history.replaceState(null, '', location.pathname); });
    }
    var sc = $('scrubIn');
    if (sc) sc.addEventListener('input', function () { preview = +this.value; paintNow(); });
    on('liveKey', function () { preview = null; paintNow(); });
    refresh();
    setInterval(function () { if (preview === null) paintNow(); }, 20000);
  }

  /* ---------- pack list + copy keys ---------- */
  var PK = cfg.packKey || (KEY + '-pack-v1'), packed = load(PK, {}) || {};
  var boxes = [].slice.call(document.querySelectorAll('.pack input[type=checkbox]'));
  function packCount() {
    var n = boxes.filter(function (b) { return b.checked; }).length;
    if ($('packcount')) $('packcount').textContent = n + ' of ' + boxes.length + ' packed';
  }
  boxes.forEach(function (b) {
    if (packed[b.id]) b.checked = true;
    b.addEventListener('change', function () {
      packed[b.id] = b.checked; save(PK, packed); packCount();
      if (navigator.vibrate) { try { navigator.vibrate(b.checked ? 12 : 6); } catch (e) {} }
    });
  });
  on('packreset', function () { boxes.forEach(function (b) { b.checked = false; }); packed = {}; save(PK, packed); packCount(); });
  packCount();
  [].slice.call(document.querySelectorAll('[data-copy]')).forEach(function (btn) {
    btn.addEventListener('click', function () { copyText(btn.getAttribute('data-copy'), btn, 'Copied'); });
  });

  init();
  window.DAYPLAN_ENGINE = { planSplit: planSplit, planFull: planFull, items: toItems, acts: ACTS, walk: walk };
})();
