/* THE AD core (10/21): everything that has no screen. Reads pasted scripts, finds the lines that repeat across
   scripts, puts the day in shoot order, says what fits before the wrap, and reads a day back from its taps (the
   live clock and the report). Pure functions on plain objects: ad/index.html draws them, node tests run them.
   Text here stays generic (no client, no place, no person): every shoot day uses this file. */
(function (root) {
'use strict';
const cp = (...c) => String.fromCharCode(...c);
const DASH = cp(0x2013, 0x2014), MID = cp(0x00B7);
const BULL = cp(0x2022, 0x00B7, 0x25CF, 0x25AA, 0x2023, 0x25E6, 0x2043);
const R_ZW = new RegExp('[' + cp(0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF) + ']', 'g');
const R_NB = new RegExp('[' + cp(0x00A0, 0x2007, 0x202F) + ']', 'g');
const R_SQ = new RegExp('[' + cp(0x2018, 0x2019, 0x201B) + ']', 'g');
const R_DQ = new RegExp('[' + cp(0x201C, 0x201D) + ']', 'g');
const R_LEAD = new RegExp('^(?:[-*>+' + BULL + DASH + ']+\\s*|\\(?\\d{1,2}[.)]\\s+|[A-Za-z][.)]\\s+)');
const R_SEP = new RegExp('\\s[-|/:' + DASH + MID + ']\\s|[' + DASH + MID + '|]');
const R_END = new RegExp('[.!?,;' + cp(0x2026) + '][")\\]]*\\s*$');
const R_KEY = /^(?:script|concept|video|spot|ad|promo|scene|reel|tiktok|clip|version|option)\s*(?:[#:]|\d|$)/i;
const R_BR = /^(?:b\s*-?\s*roll|broll|shot|visual|action|insert|cutaway|show)s?\s*[:.-]\s*/i;
const R_NOTE = /^(?:note|notes|direction|vibe|tone)\s*[:.-]\s*/i;
const R_LOC = /^(?:location|where|place|store|set|shop|at)\s*:\s*(.+)$/i;
const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DAYS = '(?:mon|tues|wednes|thurs|fri|satur|sun)day';
const R_DATE = new RegExp('\\b(?:(?:' + MONTHS + ')\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b)', 'i');   // a real date wins the chip
const R_SOON = new RegExp('\\b(?:(?:first|second|third|fourth|last)\\s+' + DAYS + '|this\\s+(?:weekend|' + DAYS + ')|tonight|tomorrow)\\b', 'i');
const R_STREET = /\b\d{2,6}\s+(?:(?:n|s|e|w|north|south|east|west)\.?\s+)?(?:[a-z0-9.']+\s+){0,3}(?:street|st|avenue|ave|av|boulevard|blvd|road|rd|drive|dr|lane|ln|way|highway|hwy|parkway|pkwy|place|pl|court|ct|plaza|square|sq|trail|trl|loop|circle|cir)\b/i;
const R_ADDR = new RegExp(R_STREET.source + '|\\baddress\\b', 'i');
const R_SPK_CAPS = /^([A-Z][A-Z0-9 .'&/]{0,23}?)(?:\s*\([^)]{1,14}\))?\s*:\s+(?=\S)/;     // MODEL: / VO: / HOST 2: / SARAH (V.O.):
const R_SPK_WORD = /^([A-Z][a-z]{1,15}(?:\s[A-Z][a-z]{1,15})?)\s*:\s+(?=\S)/;              // Model: / Sarah Lee: (only in a doc that labels its lines)

/* ---------- ANY SCRIPT (v3, his "work with any script ... different people have different types of script writing") ----------
   A pre-pass that turns the shapes people send into the one shape the reader below knows (headings, lines, MODEL: labels,
   (brackets), B-roll:). Handled: a two-column AV table (tab or | cells: the AUDIO column is the line, the VIDEO column is
   b-roll), a screenplay (INT./EXT. sluglines = scripts, a NAME cue over its lines = who says it, a (parenthetical) under a
   cue = the line's direction, action paragraphs = b-roll, CUT TO: dropped), HOOK / BODY / CTA labels (kept as a tag on the
   line, never a new script), timestamps (0:00-0:05) and emoji bullets stripped, "Line 3:" prefixes stripped, caption /
   music / hashtag / editor-note rows left out, a "Talent: Sarah" name row left out, a trailing "- Name" attribution after
   a quoted line dropped, and an ALL-CAPS doc (caps stop meaning "heading"). parse() returns what it read in .shape. */
const R_EMO = /^(?:\d️?⃣\s*)?[\s←-⇿☀-➿⬀-⯿️‍⃣\p{Extended_Pictographic}\p{So}]+/u;
const R_STAMP = /^[[(]?\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:-|–|—|to)\s*\d{1,2}:\d{2}(?::\d{2})?)?[\])]?\s*[:.\-–—]?\s*(?=\S)/;
const R_LINEN = /^(?:line|take|clip|part|step|beat|segment|seg|section|no\.?|number|shot)\s*#?\s*\d+[a-z]?\s*[:.)\-–—]\s+(?=\S)/i;
const R_META = /^(?:caption|hashtags?|tags|music|song|sound|track|sfx|link(?:s| in bio)?|posting|post date|due|deadline|platform|format|length|duration|ratio|aspect|orientation|notes? (?:to|for) (?:the )?editor|editor'?s? notes?|edit notes?|deliverables?|brand|client|product|goal|objective|tone(?: of voice)?|target|audience|references?|ref|inspo|cta link|date|time|call time|wardrobe|props)\s*:/i;
const R_HASH = /^(?:#\w+[\s,]*)+$/;
const R_NAMEROW = /^(?:talent|model|host|creator|actor|actress|cast|on[- ]camera|presenter|spokesperson)\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){0,2}\s*$/i;
const R_TRANS = /^(?:(?:cut|fade|dissolve|smash cut|match cut|jump cut|wipe)\s+(?:to|in|out)\b.*|fade in|fade out|the end|end of script|end)\.?:?$/i;
const R_ATTR = /^(["“'].*["”'])\s*[-–—]\s*[A-Z][\w .']{1,24}$/;
const SECS = 'hook|body|cta|call to action|intro|outro|close|closing|opening|open|middle|end|ending|setup|set up|punchline|punch line|tagline|tag line|pitch|problem|solution|offer|proof|story|bridge|payoff|value|benefit|main|part one|part two|part three';
const R_SEC = new RegExp('^(' + SECS + ')\\s*(?:\\d+)?\\s*(?::|[-\\u2013\\u2014]\\s|$)\\s*(.*)$', 'i');
const R_SLUG = /^(?:INT|EXT|INT\.?\/EXT|I\/E|EST)[. ]/i;
const R_CUE = /^([A-Z][A-Z0-9'.\-]*(?:\s[A-Z][A-Z0-9'.\-]*){0,2})\s*(?:\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D\.?|CONT\.?|ON PHONE|PHONE|FILTERED)\))?\s*$/;
const A_COL = /\b(?:audio|vo|v\.o\.|voice|voiceover|voice over|script|dialogue|dialog|lines?|copy|says|talent|on[- ]camera|narration|spoken|words)\b/i;
const V_COL = /\b(?:video|visuals?|shots?|b-?roll|action|on[- ]screen|scene|footage|camera|image)\b/i;
// a two-column script pasted as a table: the AUDIO cell is the line, the VIDEO cell is b-roll in front of it
function untable(raw, sep, shape) {
  const out = []; let aCol = -1, vCol = -1;
  for (const r of raw) {
    const isRow = sep === '|' ? /^\s*\|/.test(r) : r.includes('\t');
    if (!isRow) { out.push(r); continue; }
    const cells = (sep === '|' ? r.replace(/^\s*\|/, '').replace(/\|\s*$/, '') : r).split(sep).map(c => c.trim());
    if (cells.every(c => /^[\s:-]*$/.test(c))) continue;
    if (aCol < 0) { const ai = cells.findIndex(c => c.length < 30 && A_COL.test(c)), vi = cells.findIndex(c => c.length < 30 && V_COL.test(c)); if (ai >= 0) { aCol = ai; vCol = vi; shape.cols = cells.filter(Boolean).join(' / '); continue; } }
    const full = cells.filter(Boolean);
    const a = aCol >= 0 ? cells[aCol] || '' : full[full.length - 1] || '', v = aCol >= 0 ? (vCol >= 0 ? cells[vCol] || '' : '') : (full.length > 1 ? full[0] : '');
    if (v && v !== a && !/^b-?roll\s*:/i.test(v)) out.push('B-roll: ' + v); else if (v && v !== a) out.push(v);
    if (a) out.push(a); else if (!v) out.push('');
  }
  shape.table = true; return out;
}
function prep(text) {
  let raw = String(text || '').split(/\r\n|\r|\n/);
  const shape = { table: false, screenplay: false, caps: false, sections: 0, stamps: 0, meta: 0, bullets: 0 };
  const pipes = raw.filter(r => /^\s*\|.*\|\s*$/.test(r)).length, tabs = raw.filter(r => r.includes('\t')).length;
  if (pipes >= 3) raw = untable(raw, '|', shape); else if (tabs >= 3) raw = untable(raw, '\t', shape);
  let rows = raw.map(r => unmark(clean(r)));
  // emoji and arrow bullets, keycap numbers
  rows = rows.map(r => { const s = r.replace(R_EMO, '').trim(); if (s !== r.trim()) shape.bullets++; return s; });
  // timestamps lead the rows only when the doc is timed (three or more), so "10:30 doors open" stays a line elsewhere
  if (rows.filter(r => R_STAMP.test(r)).length >= 3) rows = rows.map(r => { if (R_STAMP.test(r)) { shape.stamps++; return r.replace(R_STAMP, '').trim(); } return r; });
  // rows that are about the post, not the lines
  rows = rows.map(r => { if (r && (R_META.test(r) || R_HASH.test(r) || R_NAMEROW.test(r) || R_TRANS.test(r))) { shape.meta++; return ''; } return r; });
  rows = rows.map(r => r.replace(R_LINEN, '').trim());
  rows = rows.map(r => { const m = r.match(R_ATTR); return m ? m[1] : r; });
  // an ALL-CAPS doc: caps stop meaning "heading" (the reader keeps R_KEY, a trailing colon, # and the gap rule)
  const body = rows.filter(Boolean), capsN = body.filter(r => { const L = r.replace(/[^A-Za-z]/g, ''); return L.length >= 3 && L === L.toUpperCase(); }).length;
  if (body.length >= 4 && capsN >= body.length * .7) shape.caps = true;
  // a screenplay: a NAME over its lines, repeated; INT./EXT. sluglines
  const slugs = rows.filter(r => R_SLUG.test(r)).length;
  const isCue = (r, i) => { const m = r && !R_SLUG.test(r) && !R_KEY.test(r) && !R_SEC.test(r) && r.match(R_CUE); if (!m) return ''; const nx = rows[i + 1] || ''; if (!nx || R_CUE.test(nx) && nx === nx.toUpperCase()) return ''; return m[1]; };
  const cues = rows.map((r, i) => (i === 0 || !rows[i - 1]) ? isCue(r, i) : '').filter(Boolean);
  const distinct = new Set(cues).size;
  if ((cues.length >= 2 && cues.length - distinct >= 2) || slugs >= 2) {
    shape.screenplay = true; shape.cues = distinct;
    const out = []; let who = '', dir = '', buf = null;   // buf: a speech wrapped over rows joins into one line
    const flush = () => { if (buf) { out.push(buf.who + ': ' + (buf.dir ? '(' + buf.dir + ') ' : '') + buf.text); buf = null; } };
    rows.forEach((r, i) => {
      if (!r) { flush(); who = ''; dir = ''; out.push(''); return; }
      if (R_SLUG.test(r)) { flush(); who = ''; out.push(r.replace(/^(INT|EXT|INT\.?\/EXT|I\/E|EST)\.?\s*/i, (x, k) => k.toUpperCase() + '. ')); return; }
      if ((i === 0 || !rows[i - 1]) && isCue(r, i)) { flush(); who = isCue(r, i); dir = ''; return; }
      if (who) {
        const p = r.match(/^\(([^)]{1,40})\)$/); if (p) { flush(); dir = p[1]; return; }
        if (buf) buf.text += ' ' + r; else buf = { who, dir, text: r };
        dir = ''; return;
      }
      if (headKind(r, true, shape.caps) === 2 || R_BR.test(r)) out.push(r); else out.push('B-roll: ' + r);
    });
    flush();
    rows = out;
  }
  // HOOK / BODY / CTA: a tag on the lines under it (secOf), never a new script; a row that only names the section goes.
  // A row under a section is a line for sure (forced), so "This is your sign" under HOOK: never opens a new script.
  const secOf = {}, forced = new Set(); let sec = '', secHead = false;
  rows = rows.map((r, i) => {
    if (!r) { sec = ''; return r; }
    let m = null;
    if (!R_BR.test(r)) m = r.match(R_SEC);   // HOOK: / CTA: are sections before they are speakers
    if (m) { sec = m[1].toLowerCase().replace(/\s+/g, ' '); shape.sections++; r = m[2].trim(); secHead = true; }
    else secHead = false;
    if (sec && r) { secOf[i] = sec; forced.add(i); }
    void secHead;
    return r;
  });
  rows = rows.map(r => r.replace(R_LEAD, '').trim());
  return { rows, shape, secOf, forced };
}
const R_SPLIT = new RegExp('\\s[-|:' + DASH + MID + ']\\s|[,|:' + DASH + MID + ']');
const R_BYE = /\b(?:see (?:you|ya|u)|(?:we'?ll )?meet (?:you|ya)|join us|come (?:thrift|shop|see|visit|hang|check|through|dig|by|out|spend)|stop (?:by|in)|pull up|swing by|don'?t miss|we'?ll be waiting|link in (?:the |our )?bio|follow us|tag us)\b/i;
const STOP = new Set('a an the and or but to of in on at for with from by is are be been it its this that these those we our ours us you your yours i me my so just also all get got have has do did will can'.split(' '));
const BR_MIN = 1.5;             // minutes a b-roll item costs in the plan
const MAX_SAMPLE = 20;          // a line that took longer than this (lunch, a dead battery) is not a pace sample

/* ---------- reading the paste ----------
   Takes whatever the client sends: a doc with MODEL: "..." lines, a plain list, bullets, markdown. Headings are typed:
   a PLACE (it has a street address, or a Location: line) starts fresh, a GROUP (GENERAL CALL-TO-SHOP:) names the kind
   of script, a LEAF (Concept 2:) numbers it. Lines in (brackets) or starting B-roll: are b-roll, not lines she says. */
function clean(s) {
  return String(s).replace(R_ZW, '').replace(R_NB, ' ').replace(R_SQ, "'").replace(R_DQ, '"').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
}
function unmark(s) {
  return s.replace(/\\([\\`*_{}[\]()#+\-.!?:"'@&])/g, '$1').replace(/\*\*|__/g, '').replace(/^\*([^*]+)\*$/, '$1').replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,!?:;])/g, '$1$2').trim();
}
// 0 = a line she says, 1 = a weak heading (only because it follows a gap), 2 = clearly a heading
function headKind(s, gap, capsDoc) {
  if (/^#{1,6}\s*\S/.test(s) || R_KEY.test(s)) return 2;
  if (s.length > 72) return 0;
  if (/:\s*$/.test(s)) return 2;
  if (R_END.test(s)) return 0;
  const w = s.split(' ');
  if (w.length > 10) return 0;
  const L = s.replace(/[^A-Za-z]/g, '');
  if (!capsDoc && L.length >= 2 && L === L.toUpperCase()) return 2;   // in an all-caps doc, caps say nothing
  const tn = s.match(/(\S+)\s+\(?\d{1,2}[a-z]?\)?$/);
  if (tn && !/^(?:to|at|from|by|until|til|till|and|or|of|is|the|on|in|open|than)$/i.test(tn[1])) return 2;
  if (R_SEP.test(s)) return 2;
  const caps = w.filter(x => /^[A-Z0-9@#&]/.test(x)).length;
  if (!capsDoc && w.length >= 2 && caps / w.length >= .6) return 2;
  return gap ? 1 : 0;
}
function headType(t) { return R_KEY.test(t) ? 'leaf' : R_STREET.test(t) ? 'place' : 'group'; }
function speaker(s, labelMode) {
  const m = s.match(R_SPK_CAPS) || (labelMode ? s.match(R_SPK_WORD) : null);
  if (!m || R_KEY.test(m[1]) || R_NOTE.test(m[0]) || R_LOC.test(s) || R_BR.test(m[0])) return null;
  return { who: m[1].trim(), rest: s.slice(m[0].length) };
}
function unquote(s) {
  const single = /^'/.test(s);
  s = s.replace(/^["']+\s*/, '');
  return (single ? s.replace(/\s*["']+$/, '') : s.replace(/\s*"+$/, '')).trim();
}
function lineOf(s, who) {
  if (R_BR.test(s)) return { text: s.replace(R_BR, '').trim() || s, br: true };
  const m = s.match(/^[[({]\s*([^\])}]*)[\])}]\s*(.*)$/);
  if (m) {
    if (!m[2]) return { text: m[1].replace(R_BR, '').trim() || s, br: true };
    return { text: unquote(m[2]), dir: m[1].trim(), who: who || '' };
  }
  return { text: unquote(s), who: who || '' };
}
function dateChip(m) {
  let s = m.toUpperCase().replace(/(\d)(ST|ND|RD|TH)\b/, '$1');
  s = s.replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?/, '$1');
  s = s.replace(/\b(MON|TUES|WEDNES|THURS|FRI|SATUR|SUN)DAY\b/, (x, d) => d.slice(0, 3));
  return s;
}
function shortPlace(p) { if (!p) return ''; const a = String(p).split(R_SPLIT)[0].trim(); return (a.length >= 2 ? a : String(p)).slice(0, 28); }
function titleOf(group, leaf, place, i) {
  const n = leaf && leaf.match(/^(?:script|concept|video|spot|ad|promo|scene|reel|tiktok|clip|version|option)\s*#?\s*(\d+)\s*$/i);
  if (group && n) return group + ' ' + n[1];
  if (group && leaf) return group + ' ' + MID + ' ' + leaf;
  return leaf || group || shortPlace(place) || ('Script ' + (i + 1));
}
// a paragraph into sentences: "Ave." and "W." are not ends, and a tiny one (Hey! / Hi there!) rides with the next
const ABBR = /^(?:mr|mrs|ms|dr|st|ave|av|blvd|rd|ln|hwy|pkwy|jr|sr|vs|etc|inc|co|ft|mt|no|w|e|n|s|a\.m|p\.m|u\.s|e\.g|i\.e)\.$/;
const STARTER = /^["'(]?(?:we|we're|we'll|we've|our|come|see|open|join|and|so|plus|it's|you|your|you're|they|this|that|hey|now|just|bring|don't|stop|visit|find|grab|tag|follow|check)\b/i;
function sentences(t) {
  const out = [], re = /[.!?]+["')\]]*\s+/g;
  let start = 0, m;
  while ((m = re.exec(t))) {
    const cut = m.index + m[0].trimEnd().length, next = t[m.index + m[0].length] || '';
    if (!/["'([A-Z0-9]/.test(next)) continue;
    if (ABBR.test(t.slice(start, cut).split(/\s+/).pop().toLowerCase()) && !STARTER.test(t.slice(m.index + m[0].length))) continue;   // "Ave. We're" still ends one
    out.push(t.slice(start, cut).trim()); start = m.index + m[0].length;
  }
  out.push(t.slice(start).trim());
  const merged = [];
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) continue;
    if (out[i].split(/\s+/).length < 4 && i < out.length - 1) { out[i + 1] = out[i] + ' ' + out[i + 1]; continue; }
    merged.push(out[i]);
  }
  return merged.length ? merged : [t];
}
// a line she keeps missing, made shorter: by sentence first, else at the comma nearest the middle (both halves 3+ words)
function splitLine(t) {
  const s = sentences(t);
  if (s.length > 1) return s;
  if (t.split(/\s+/).length < 8) return [t];
  let best = -1, bestD = 1e9, m;
  const re = /,\s+/g;
  while ((m = re.exec(t))) {
    const a = t.slice(0, m.index + 1).trim(), b = t.slice(m.index + m[0].length).trim();
    if (a.split(/\s+/).length < 3 || b.split(/\s+/).length < 3) continue;
    const d = Math.abs(m.index - t.length / 2);
    if (d < bestD) { bestD = d; best = m.index; }
  }
  return best < 0 ? [t] : [t.slice(0, best + 1).trim(), t.slice(best + 1).trim()];
}
const LONG = 25;   // a line with more words than this is a paragraph: it gets split into sentences
function parse(text) {
  const pp = prep(text), rows = pp.rows, shape = pp.shape;
  const body = rows.filter(Boolean);
  const said = body.filter(s => R_SPK_CAPS.test(s) || R_SPK_WORD.test(s) || /^"/.test(s)).length;
  const labelMode = said >= 3 && said >= body.length * .4;   // a doc that marks its lines (MODEL: "...") calls everything else a heading
  const out = [];
  let cur = null, gap = true, pend = [], ctx = { place: '', group: '', addr: false }, quoteOpen = false, pendLoc = '';
  const open = () => {
    let pl = ctx.place, addr = ctx.addr, gr = ctx.group, lf = '';
    const groups = [];
    for (const h of pend) {
      if (h.type === 'place') { pl = h.t; addr = true; gr = ''; lf = ''; groups.length = 0; }
      else if (h.type === 'group') { groups.push(h.t); lf = ''; }
      else lf = h.t;
    }
    if (pendLoc) { pl = pendLoc; addr = true; }
    if (groups.length >= 2 && !addr) { pl = groups[groups.length - 2]; gr = groups[groups.length - 1]; }
    else if (groups.length >= 2) gr = groups.slice(-2).join(' ' + MID + ' ');
    else if (groups.length) gr = groups[0];
    ctx = { place: pl, group: gr, addr };
    cur = { title: titleOf(gr, lf, pl, out.length), place: pl, group: gr, lines: [], notes: [] };
    out.push(cur); pend = []; pendLoc = '';
  };
  for (let ri = 0; ri < rows.length; ri++) {
    let s = rows[ri];
    if (!s) { gap = true; continue; }
    const lm = s.match(R_LOC);
    if (lm && lm[1].length <= 40) { const v = clean(lm[1]); if (pend.length || !cur) pendLoc = v; else { cur.place = v; ctx.place = v; ctx.addr = true; } gap = false; continue; }
    if (R_NOTE.test(s)) { if (cur && !pend.length) cur.notes.push(s.replace(R_NOTE, '')); gap = false; continue; }
    let head = false, hk = 0, who = '';
    const sp = speaker(s, labelMode);
    if (R_BR.test(s) || /^[[({].*[\])}]$/.test(s)) head = false;
    else if (sp) { who = sp.who; s = sp.rest; }
    else if (pp.forced.has(ri)) head = false;   // a row under HOOK: / BODY: / CTA: is a line for sure
    else if (labelMode) {
      if (quoteOpen && cur && !pend.length && headKind(s, false, shape.caps) !== 2) {   // a quote that runs onto the next line
        const L = cur.lines[cur.lines.length - 1]; L.text = (L.text + ' ' + unquote(s)).trim(); quoteOpen = !/"\s*$/.test(s); gap = false; continue;
      }
      head = !/^"/.test(s);
    } else { hk = headKind(s, gap, shape.caps); head = hk > 0; }
    gap = false;
    if (head) {
      quoteOpen = false;
      // a weak heading right before another heading was really the last line of the script above (no period on it)
      if (pend.length && pend[pend.length - 1].weak && cur) cur.lines.push(lineOf(pend.pop().t));
      const t = s.replace(/^#+\s*/, '').replace(/\s*:\s*$/, '');
      pend.push({ t, type: headType(t), weak: hk === 1 });
      continue;
    }
    if (pend.length || !cur) open();
    const ln = lineOf(s, who); if (pp.secOf[ri]) ln.sec = pp.secOf[ri];
    cur.lines.push(ln);
    quoteOpen = labelMode && /^"/.test(s) && !/"\s*$/.test(s.slice(1));
  }
  for (const p of pend) if (p.weak && cur) cur.lines.push(lineOf(p.t));
  out.forEach(s => { s.lines = s.lines.flatMap(l => !l.br && l.text.split(/\s+/).length > LONG ? sentences(l.text).map(t => Object.assign({}, l, { text: t })) : [l]); });
  const res = out.filter(s => s.lines.length).map((s, i) => {
    const id = 's' + i;
    s.lines.forEach((l, j) => { l.id = id + '.' + j; });
    const blob = [s.title, s.group, ...s.lines.map(l => l.text)].join(' . '), dm = blob.match(R_DATE) || blob.match(R_SOON);
    return { id, idx: i, title: s.title, place: s.place, short: shortPlace(s.place), group: s.group, notes: s.notes, lines: s.lines, dated: dm ? dateChip(dm[0]) : '' };
  });
  shape.people = people(res);
  Object.defineProperty(res, 'shape', { value: shape, enumerable: false });
  return res;
}
// who is in the doc: every speaker named on a line, in the order they first speak (one or none = a one-person doc)
function people(scripts) { const seen = []; for (const s of scripts) for (const l of s.lines) if (l.who && !seen.includes(l.who)) seen.push(l.who); return seen; }
// the places a doc names (DOWNTOWN, EASTSIDE), for "use these as stops"
function placesIn(scripts) {
  const seen = new Map();
  for (const s of scripts) { const p = s.short; if (p && !seen.has(p.toLowerCase())) seen.set(p.toLowerCase(), p); }
  return [...seen.values()];
}
function stopFor(s, stops) {
  if (s.stop && stops.some(x => x.id === s.stop)) return s.stop;
  const hay = [s.short, s.place, s.title].join(' ').toLowerCase();
  for (const st of stops) { const n = String(st.name || '').trim().toLowerCase(); if (n.length >= 2 && hay.includes(n)) return st.id; }
  return stops[0].id;
}

function name(s, scripts) { return s.short && placesIn(scripts).length > 1 ? s.short + ' ' + MID + ' ' + s.title : s.title; }

/* ---------- lines that say the same thing ---------- */
function norm(t) { return String(t).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function toks(t) { return norm(t).split(' ').filter(w => w && !STOP.has(w)); }
// one line said once covers its twin: the same words from the same speaker with the same (bracket) direction (10/21)
const twinKey = (stop, l) => stop + '|' + norm(l.text) + '|' + norm(l.dir || '') + '|' + (l.who || '');
function jac(a, b) { const A = new Set(a), B = new Set(b); let n = 0; A.forEach(x => { if (B.has(x)) n++; }); return n / ((A.size + B.size - n) || 1); }
function kindOf(t) { if (R_ADDR.test(t)) return 'addr'; if (R_BYE.test(t) && t.split(/\s+/).length <= 8) return 'bye'; return ''; }
function dialogue(s) { return s.lines.filter(l => !l.br).length; }

/* ---------- hard lines (10/21 v3): the ones that eat the clock ----------
   An address took 11.8 min on a real day, a line with a price and a time took 5 takes. A line gets flagged HARD for an
   address, numbers (prices, times, phone numbers, dates), a long word, or just being long, and the plan gives it one more
   minute (HARD_MIN). The set says why, so the talent slows down before the first take, not after the fourth. */
const HARD_MIN = 1;
const R_NUM = /\d/;
const R_LONGWORD = /\b[a-z][a-z'-]{10,}\b/i;
function hardOf(text) {
  const t = String(text || '');
  if (!t) return '';
  if (R_ADDR.test(t)) return 'address';
  if ((t.match(/\d+/g) || []).length >= 2) return 'numbers';
  if (/[$]\d|\d\s*(?:%|am|pm|a\.m|p\.m)\b/i.test(t)) return 'numbers';
  if (R_NUM.test(t) && t.split(/\s+/).length >= 10) return 'long';
  if (R_LONGWORD.test(t)) return 'a long word';
  if (t.split(/\s+/).length >= 18) return 'long';
  return '';
}
const isHard = l => !!(l && !l.br && (l.hard != null ? l.hard : hardOf(l.text)));

/* ---------- the operative word (10/21 v3): the one word that sells the line ----------
   Actors hit one word a line, the one that carries the news. Read off the words: a shouted word, a name or a number, else
   the last content word that is not a stop word (the news usually lands at the end). The director can pick another on the
   plan (line.op). Returned as the word itself, so the screens can mark it wherever it sits. */
function opWord(text) {
  const t = String(text || '');
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return '';
  const core = w => w.replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9%]+$/g, '');
  const ok = w => { const c = core(w); return c.length >= 2 && !STOP.has(c.toLowerCase()); };
  const allCaps = t.replace(/[^A-Za-z]/g, '') === t.replace(/[^A-Za-z]/g, '').toUpperCase();
  const shout = allCaps ? null : words.find(w => /^[A-Z][A-Z]{2,}[!.]*$/.test(core(w)) && ok(w));
  if (shout) return core(shout);
  const money = words.find(w => /^(?:\$\d[\d,.]*|\d[\d,.]*%|\d{2,}[\d,.]*)$/.test(core(w)));
  if (money) return core(money);
  const name = words.slice(1).find(w => /^[A-Z][a-z]{2,}$/.test(core(w)) && ok(w));
  if (name) return core(name);
  const bang = t.lastIndexOf('!');
  if (bang > 0) { const before = t.slice(0, bang).split(/\s+/).filter(ok); if (before.length >= 3) return core(before[before.length - 1]); }
  const cands = words.filter(ok);
  if (!cands.length) return '';
  for (let i = cands.length - 1; i >= 0; i--) if (core(cands[i]).length >= 4) return core(cands[i]);
  return core(cands[cands.length - 1]);
}

/* ---------- what the talent does on a line (10/21, his ask for visuals: direction icons) ----------
   One direction per line, read off its words, so the talent gets a picture instead of a speech. A (bracket) note wins;
   then the address (point at it), hello and see-you lines (wave), a hook told like a secret (lean in), the goods
   (hold it up), big news (big energy), an invitation (walk in), a find (look around), shouting caps (big energy),
   and a smile for the rest. The director can change any of them on the plan (line.do). */
const DO = ['smile', 'hype', 'point', 'hold', 'walk', 'wave', 'lean', 'look', 'calm'];
const R_DO_NOTE = [['walk', /\b(?:walk|walks|walking|enter|enters|entering|step|steps|stepping)\b/i], ['point', /\b(?:point|points|pointing|gestures?)\b/i],
  ['hold', /\b(?:hold|holds|holding|show|shows|showing|lift|lifts|pick)\b/i], ['wave', /\b(?:wave|waves|waving)\b/i], ['lean', /\b(?:lean|leans|leaning|whisper|whispers)\b/i],
  ['look', /\b(?:look|looks|looking|browse|browses|browsing|search|searching)\b/i], ['hype', /\b(?:jump|jumps|dance|dances|dancing|cheer|cheers|excited|hype)\b/i],
  ['calm', /\b(?:calm|slow|slowly|breathe|relax)\b/i], ['smile', /\b(?:smile|smiles|smiling|laugh|laughs|laughing)\b/i]];
const R_HI = /^(?:hey|hi|hello|yo|what'?s up|sup)\b/i;
const R_SEEYOU = /\b(?:see (?:you|ya|u)|meet (?:you|ya)|bye|join us|we'?ll be waiting)\b/i;
const R_SECRET = /\b(?:did you know|this is your sign|psst|guess what|between us|secret|if you didn'?t|are you looking|looking for|what are you doing)\b/i;
const R_GOODS = /\b(?:we'?ve got|we have|we got|we'?re buying|bring|check (?:out|these)|these|pieces|clothes|clothing|items|merch|products?)\b/i;
const R_NEWS = /\b(?:tons|is back|are back|live dj|djs?|market|party|sale|grand opening)\b/i;
const R_COME = /\b(?:come (?:thrift|shop|dig|see|hang|through|in|by|on|out|spend|visit)|stop by|swing by|pull up|head (?:to|over)|walk in)\b/i;
const R_FIND = /\b(?:found|find|discover|new favorite)\b/i;
function doOf(text, note) {
  if (note) for (const [k, r] of R_DO_NOTE) if (r.test(note)) return k;
  const t = String(text || '');
  if (R_ADDR.test(t)) return 'point';
  if (R_SEEYOU.test(t) || (R_HI.test(t) && t.split(/\s+/).length <= 4)) return 'wave';
  if (R_SECRET.test(t)) return 'lean';
  if (R_NEWS.test(t)) return 'hype';
  if (R_GOODS.test(t)) return 'hold';
  if (R_COME.test(t)) return 'walk';
  if (R_FIND.test(t)) return 'look';
  if (/!/.test(t) && /\b[A-Z]{3,}\b/.test(t)) return 'hype';
  return 'smile';
}

/* ---------- the order of the day ---------- */
const byRank = warm => (a, b) => ((a.id === warm ? 0 : 1) - (b.id === warm ? 0 : 1)) || ((b.must ? 1 : 0) - (a.must ? 1 : 0)) || ((b.dated ? 1 : 0) - (a.dated ? 1 : 0)) || ((a.added || 0) - (b.added || 0)) || (a.idx - b.idx);
// who goes first when the day does not fit: not starred, not dated, latest in the doc
const cutRank = (a, b) => ((a.must ? 1 : 0) - (b.must ? 1 : 0)) || ((a.dated ? 1 : 0) - (b.dated ? 1 : 0)) || (b.idx - a.idx);

// items = what gets shot, in order: one per line, twins said once (covers the others), near-twins back to back
function order(day, inc, warm) {
  const stops = day.stops, items = [];
  for (const st of stops) {
    const S = day.scripts.filter(s => inc.has(s.id) && stopFor(s, stops) === st.id).sort(byRank(warm));
    const L = [];
    S.forEach((s, si) => s.lines.forEach((l, li) => L.push({ id: l.id, sid: s.id, stop: st.id, br: !!l.br, text: l.text, dir: l.dir || '', do: l.do || '', who: l.who || '', sec: l.sec || '', hard: isHard(l) ? (l.hard || hardOf(l.text)) : '', op: l.br ? '' : (l.op != null ? l.op : opWord(l.text)), n: norm(l.text), k: l.br ? '' : kindOf(l.text), t: toks(l.text), si, li })));
    // twins = the same words from the same speaker with the same (bracket) direction: "(whisper) I can't believe it" and
    // "(yell) I can't believe it" are two different takes, so a line read five ways stays five lines (10/21)
    const first = new Map(), cov = {};
    for (const x of L) {
      if (x.br || !x.n) continue;
      const key = x.n + '|' + norm(x.dir) + '|' + x.who, f = first.get(key);
      if (f) { x.cov = f.id; (cov[f.id] = cov[f.id] || []).push(x.id); } else first.set(key, x);
    }
    const live = L.filter(x => !x.br && !x.cov), grp = {};
    if (day.group !== false) {
      const par = new Map(live.map(x => [x.id, x.id]));
      const find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const A = live[i], B = live[j];
        if (A.sid === B.sid) continue;
        if ((A.k && A.k === B.k) || (A.t.length >= 3 && B.t.length >= 3 && jac(A.t, B.t) >= .6)) { const a = find(A.id), b = find(B.id); if (a !== b) par.set(b, a); }
      }
      const sets = {};
      live.forEach(x => { const r = find(x.id); (sets[r] = sets[r] || []).push(x); });
      Object.values(sets).forEach(g => { if (new Set(g.map(x => x.sid)).size >= 2) g.forEach((x, i) => { grp[x.id] = { key: g[0].id, all: g }; }); });
    }
    const seen = new Set();
    const emit = x => {
      seen.add(x.id);
      const it = { id: x.id, sid: x.sid, stop: x.stop, br: x.br, text: x.text, dir: x.dir, do: x.do, who: x.who, sec: x.sec, hard: x.hard, op: x.op, cov: cov[x.id] || [] };
      const g = grp[x.id];
      if (g) { it.g = g.key; it.gi = g.all.indexOf(x) + 1; it.gn = g.all.length; }
      items.push(it);
    };
    for (const x of L) {
      if (seen.has(x.id) || x.cov) continue;
      const g = grp[x.id];
      if (g) g.all.forEach(y => { if (!seen.has(y.id)) emit(y); }); else emit(x);
    }
  }
  return items;
}
function itemCost(it, pace) { return it.br ? BR_MIN : pace + (it.hard ? HARD_MIN : 0); }
const lineCost = (l, pace) => l.br ? BR_MIN : pace + (isHard(l) ? HARD_MIN : 0);
function driveCost(items, stops, fromStop) {
  const ix = id => stops.findIndex(s => s.id === id);
  let m = 0, prev = fromStop || (items[0] && items[0].stop);
  for (const it of items) {
    if (it.stop !== prev) { const a = ix(prev), b = ix(it.stop); for (let k = Math.min(a, b); k < Math.max(a, b); k++) m += +stops[k].drive || 0; prev = it.stop; }
  }
  return m;
}
function wrapMs(hhmm, ref) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  const d = new Date(ref);
  if (!m) { d.setHours(d.getHours() + 3); return d.getTime(); }
  d.setHours(+m[1], +m[2], 0, 0);
  let t = d.getTime();
  if (t < ref - 3 * 36e5) t += 864e5;   // a wrap after midnight
  return t;
}
function pickWarm(day, inc) {
  for (const st of day.stops) {
    const S = day.scripts.filter(s => inc.has(s.id) && stopFor(s, day.stops) === st.id);
    if (!S.length) continue;
    const easy = S.filter(s => !s.must && !s.dated);
    const pool = easy.length ? easy : S;
    return pool.slice().sort((a, b) => (dialogue(a) - dialogue(b)) || (a.idx - b.idx))[0].id;
  }
  return '';
}
function need(day, inc, warm) {
  const items = order(day, inc, warm);
  return { items, min: (inc.size ? (+day.warm || 0) : 0) + items.reduce((m, it) => m + itemCost(it, +day.pace || 3), 0) + driveCost(items, day.stops) };
}
// THE MATH: what fits between now (or the start) and the wrap, what doesn't, and the order
function plan(day, now) {
  const start = day.run ? day.run.at : now;
  const wrapAt = wrapMs(day.wrap, start), avail = (wrapAt - start) / 6e4;
  const inc = new Set(day.scripts.filter(s => !s.skip).map(s => s.id)), cut = [];
  let n = need(day, inc);
  while (n.min > avail && inc.size) {
    const v = day.scripts.filter(s => inc.has(s.id)).sort(cutRank)[0];
    inc.delete(v.id); cut.push(v.id); n = need(day, inc);
  }
  // a smaller script cut on the way may still fit in what is left
  for (const id of cut.slice().reverse()) { inc.add(id); const t = need(day, inc); if (t.min <= avail) n = t; else inc.delete(id); }
  const warmId = pickWarm(day, inc);
  n = need(day, inc, warmId);
  const per = {};
  n.items.forEach(it => { per[it.sid] = (per[it.sid] || 0) + itemCost(it, +day.pace || 3); });
  if (warmId) per[warmId] = (per[warmId] || 0) + (+day.warm || 0);
  return { start, wrapAt, avail, need: n.min, items: n.items, inc, cut: day.scripts.filter(s => !s.skip && !inc.has(s.id)).map(s => s.id), skip: day.scripts.filter(s => s.skip).map(s => s.id), warmId, per };
}

/* ---------- the day, read back from its taps ----------
   run = { at, warmId, base: [script ids in the plan at START], events: [{t, k, id?, sid?, stop?, n?}] }
   k: again (a take that was not it) · got (the take that was) · skip (line) · roll (camera on) · note · show
      arrive (at a stop) · drop / add (a script) · later (to the back of its stop) · split (a line into parts) · wrap.
   v3 (10/21): got with side: true = a b-roll item grabbed in a gap, it never touches the line clock · cover {id, size} =
      one more angle of a line already got (a kept take for the post sheet, the line stays done) · why {id, w} = why the
      last take missed (words / eyes / energy / flub), a note on the line, never a clock event.
   Every screen number comes from replaying these, so Undo can take any of them back. */
const TERM = { got: 1, skip: 1, later: 1, arrive: 1 };
function live(day, now) {
  const run = day.run, stops = day.stops;
  const inc = new Set(run.base), dropped = new Set(), added = {};
  const done = {}, gotN = new Set(), att = {}, notes = {}, shows = {}, gone = new Set(), why = {}, whyN = {}, covers = {}, sides = {};
  let rolling = null, lastT = run.at, lastK = 'line', wrapped = 0, touched = '', stop = (stops[0] || {}).id;
  const arrived = {}; arrived[stop] = run.at;
  const samples = [], takes = [], log = [];   // takes: every take-ending tap; log: every finished line (start, end, takes)
  let prevTake = run.at;
  // lines split on set: applied to a copy of the scripts (Undo takes a split back); a part can be split again
  const splits = {};
  for (const e of run.events) if (e.k === 'split' && Array.isArray(e.parts) && e.parts.length > 1) splits[e.id] = e.parts;
  const cut = l => splits[l.id] ? splits[l.id].map((t, k) => Object.assign({}, l, { id: l.id + '.' + k, text: t })).flatMap(cut) : [l];
  const scripts = Object.keys(splits).length ? day.scripts.map(s => Object.assign({}, s, { lines: s.lines.flatMap(cut) })) : day.scripts;
  const deferred = {}, laterAt = {}, rounds = {};
  const textOf = {}; scripts.forEach(s => s.lines.forEach(l => { textOf[l.id] = { s, l }; }));
  for (const e of run.events) {
    switch (e.k) {
      case 'again':
        att[e.id] = (att[e.id] || 0) + 1;
        takes.push({ id: e.id, t: e.t, from: prevTake, roll: rolling && rolling.id === e.id ? rolling.t : 0, ok: false });
        prevTake = e.t; lastK = 'again'; rolling = null; touched = e.id; break;
      case 'got': case 'skip': {
        if (e.k === 'got' && e.side) {   // a b-roll item grabbed between takes: done, logged, no clock touched
          done[e.id] = { k: 'got', t: e.t, side: true }; sides[e.id] = e.t;
          log.push({ id: e.id, k: 'got', t0: e.t, t1: e.t, takes: 1, side: true });
          takes.push({ id: e.id, t: e.t, from: e.t, roll: 0, ok: true, side: true });
          break;
        }
        done[e.id] = { k: e.k, t: e.t };
        log.push({ id: e.id, k: e.k, t0: lastT, t1: e.t, takes: (att[e.id] || 0) + (e.k === 'got' ? 1 : 0) });
        const x = textOf[e.id];
        if (e.k === 'got') {
          takes.push({ id: e.id, t: e.t, from: prevTake, roll: rolling && rolling.id === e.id ? rolling.t : 0, ok: true });
          if (x && !x.l.br) gotN.add(twinKey(stopFor(x.s, stops), x.l));
          const dur = (e.t - lastT) / 6e4;
          if (x && x.s.id !== run.warmId && !x.l.br && dur > .25 && dur < MAX_SAMPLE) samples.push(dur);   // under 15 s is a double tap, not a line
        }
        prevTake = e.t; lastT = e.t; lastK = 'line'; rolling = null; touched = ''; break;
      }
      case 'later':   // not now: to the back of its stop, a fresh round of hearts when it comes back
        log.push({ id: e.id, k: 'later', t0: lastT, t1: e.t, takes: (att[e.id] || 0) - (laterAt[e.id] || 0) });
        deferred[e.id] = e.t; laterAt[e.id] = att[e.id] || 0; rounds[e.id] = (rounds[e.id] || 0) + 1;
        prevTake = e.t; lastT = e.t; lastK = 'line'; rolling = null; touched = ''; break;
      case 'split': touched = ''; break;   // its first part is up next, the line's clock keeps running
      case 'cover':   // one more angle of a line already got: a kept take (post sheet), the line stays done, the next line's clock runs on
        (covers[e.id] = covers[e.id] || []).push({ t: e.t, from: prevTake, size: e.size || '' });
        takes.push({ id: e.id, t: e.t, from: prevTake, roll: 0, ok: true, cover: e.size || 'again' });
        prevTake = e.t; break;
      case 'why': (why[e.id] = why[e.id] || []).push(e.w); whyN[e.w] = (whyN[e.w] || 0) + 1; break;
      case 'roll': rolling = { id: e.id, t: e.t }; touched = e.id; break;
      case 'arrive': arrived[e.stop] = e.t; stop = e.stop; lastT = e.t; prevTake = e.t; lastK = 'line'; rolling = null; break;
      case 'go': { const ix = stops.findIndex(x => x.id === e.stop); stops.forEach((x, k) => { if (k < ix) gone.add(x.id); }); lastT = e.t; prevTake = e.t; lastK = 'line'; rolling = null; touched = ''; break; }
      case 'drop': dropped.add(e.sid); inc.delete(e.sid); break;
      case 'add': dropped.delete(e.sid); inc.add(e.sid); added[e.sid] = e.t; break;
      case 'note': notes[e.n] = (notes[e.n] || 0) + 1; touched = e.id || touched; break;
      case 'show': shows[e.id] = (shows[e.id] || 0) + 1; touched = e.id || touched; break;
      case 'wrap': wrapped = e.t; break;
    }
  }
  if (run.events.length && run.events[run.events.length - 1].k !== 'wrap') wrapped = 0;
  const view = Object.assign({}, day, { scripts: scripts.map(s => added[s.id] ? Object.assign({}, s, { added: added[s.id] }) : s) });
  const items = order(view, inc, run.warmId);
  const isDone = it => !!(done[it.id] || (!it.br && gotN.has(twinKey(it.stop, it))));
  let rest = items.filter(it => !isDone(it) && !gone.has(it.stop));
  if (Object.keys(deferred).length) {   // "later" lines go to the back of their own stop, in the order they were sent there
    const segs = [], by = new Map();
    rest.forEach(it => { if (!by.has(it.stop)) { by.set(it.stop, []); segs.push(it.stop); } by.get(it.stop).push(it); });
    rest = [].concat(...segs.map(st => { const a = by.get(st); return a.filter(it => !deferred[it.id]).concat(a.filter(it => deferred[it.id]).sort((x, y) => deferred[x.id] - deferred[y.id])); }));
  }
  if (touched) { const k = rest.findIndex(it => it.id === touched); if (k > 0) rest = [rest[k]].concat(rest.slice(0, k), rest.slice(k + 1)); }
  const cur = rest[0] || null;
  const driveTo = cur && cur.stop !== stop && !arrived[cur.stop] ? cur.stop : '';
  const pace = +day.pace || 3;
  const paceLive = samples.length >= 3 ? median(samples) : 0;
  const p = paceLive || pace;
  // time still needed: the warm-up allowance while the warm-up script runs, every line left, the drives
  const warmS = day.scripts.find(s => s.id === run.warmId);
  const warmOpen = warmS && inc.has(warmS.id) && rest.some(it => it.sid === warmS.id);
  const warmLeft = warmOpen ? Math.max(0, (+day.warm || 0) - (now - run.at) / 6e4) : 0;
  const curSpent = cur && !driveTo ? (now - lastT) / 6e4 : 0;
  let left = warmLeft + driveCost(rest, stops, driveTo ? stop : (cur ? cur.stop : stop));
  rest.forEach((it, i) => { const c = itemCost(it, p); left += i === 0 ? Math.max(c * .25, c - curSpent) : c; });
  if (driveTo) left -= Math.min(+((stops.find(s => s.id === stop) || {}).drive || 0), (now - lastT) / 6e4);
  const wrapAt = wrapMs(day.wrap, run.at), proj = now + Math.max(0, left) * 6e4;
  const warmN = items.filter(it => it.sid === run.warmId).length;
  const budget = it => (it.br ? BR_MIN : pace + (it.hard ? HARD_MIN : 0)) + (it.sid === run.warmId && warmN ? (+day.warm || 0) / warmN : 0);
  log.forEach(r => { const x = textOf[r.id]; r.sid = x ? x.s.id : ''; r.min = (r.t1 - r.t0) / 6e4; r.budget = budget({ br: x && x.l.br, hard: x && isHard(x.l), sid: r.sid }); r.over = !r.side && r.min > r.budget; });
  const over = (proj - wrapAt) / 6e4;
  // per script: lines, done, minutes on the clock (each line owns the time from the tap before it to its own tap)
  const per = {};
  day.scripts.forEach(s => { per[s.id] = { lines: 0, done: 0, got: 0, skip: 0, later: 0, takes: 0, min: 0, first: 0, last: 0 }; });
  const sidOf = id => id.split('.')[0];
  items.forEach(it => { const d = isDone(it), away = !d && gone.has(it.stop); [it.id].concat(it.cov).forEach(id => { const P = per[sidOf(id)]; if (!P) return; P.lines += 1; if (d) P.done += 1; if (away) P.left = (P.left || 0) + 1; }); });
  let t0 = run.at;
  for (const e of run.events) {
    if (e.k === 'arrive') { t0 = e.t; continue; }
    if (!TERM[e.k]) continue;
    const x = textOf[e.id]; if (!x) continue;
    const P = per[x.s.id];
    if (e.k === 'got' && e.side) { P.got += 1; P.takes += 1; continue; }   // a gap grab owns no clock time
    P.min += (e.t - t0) / 6e4; P[e.k] += 1; if (e.k !== 'later') P.takes += (att[e.id] || 0) + (e.k === 'got' ? 1 : 0);
    if (!P.first) P.first = t0; P.last = e.t; t0 = e.t;
  }
  // the next drive: when to leave so every later stop still fits before the wrap
  let leave = null;
  const after = rest.filter(it => it.stop !== (cur ? cur.stop : stop));
  if (cur && !driveTo && after.length) {
    const tail = driveCost(after, stops, cur.stop) + after.reduce((m, it) => m + itemCost(it, p), 0);
    leave = { stop: after[0].stop, at: wrapAt - tail * 6e4 };
  }
  // the last line got (not a gap grab): the one a cover take or a why note would be about
  let lastGot = '';
  for (let i = run.events.length - 1; i >= 0; i--) { const e = run.events[i]; if (TERM[e.k] || e.k === 'arrive' || e.k === 'go' || e.k === 'wrap') { if (e.k === 'got' && !e.side) lastGot = e.id; break; } }
  // b-roll still to grab at this stop (for the gaps between takes)
  const brLeft = rest.filter(it => it.br && it.stop === (cur ? cur.stop : stop) && it.id !== (cur && cur.id));
  return { items, rest, cur, driveTo, stop, arrived, gone, done, lastTap: prevTake, log, budget, curBudget: cur ? budget(cur) : 0, isDone, att, takes, notes, shows, rolling, lastT, lastK, touched, wrapped,
           inc, dropped, pace, paceLive, p, left, proj, wrapAt, over, per, leave, samples, deferred, laterAt, rounds, splits, view: view.scripts,
           why, whyN, covers, sides, lastGot, brLeft, textOf };
}
function median(a) { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

// one suggestion at a time: leave for the next stop, drop the lowest script, or add one back
function nudge(day, L, now) {
  if (!L.cur || L.wrapped) return null;
  const name = id => (day.stops.find(s => s.id === id) || {}).name || 'the next stop';
  if (L.leave && now >= L.leave.at - 10 * 6e4) return { k: now >= L.leave.at ? 'leave-now' : 'leave', stop: L.leave.stop, name: name(L.leave.stop), at: L.leave.at };
  if (L.over > 2) {
    const started = new Set(Object.keys(L.done).map(id => id.split('.')[0]).concat(L.cur ? [L.cur.sid] : []));
    const pool = day.scripts.filter(s => L.inc.has(s.id) && !started.has(s.id)).sort(cutRank);
    if (pool.length) {
      const s = pool[0], save = L.rest.filter(it => it.sid === s.id).reduce((m, it) => m + itemCost(it, L.p), 0);
      return { k: 'drop', sid: s.id, title: s.title, save };
    }
    return { k: 'over' };
  }
  if (L.over < -5 && L.samples.length >= 3) {   // only once today's pace is real, not off one lucky line
    const pool = day.scripts.filter(s => !s.skip && !L.inc.has(s.id)).sort((a, b) => cutRank(b, a));
    for (const s of pool) {
      const cost = s.lines.reduce((m, l) => m + lineCost(l, L.p), 0);
      if (cost <= -L.over) return { k: 'add', sid: s.id, title: s.title, cost };
    }
  }
  return null;
}

/* ---------- the report ---------- */
function report(day, L, now) {
  const run = day.run, end = L.wrapped || (run.events.length ? run.events[run.events.length - 1].t : now);
  const S = L.view || day.scripts;
  const inPlan = S.filter(s => run.base.includes(s.id) || L.inc.has(s.id) || L.dropped.has(s.id) || L.per[s.id].min > 0 || L.per[s.id].takes > 0);
  const finished = inPlan.filter(s => L.per[s.id].lines && L.per[s.id].done >= L.per[s.id].lines && L.per[s.id].got);
  const got = L.takes.filter(t => t.ok).length, skipped = run.events.filter(e => e.k === 'skip').length;
  const nTakes = L.takes.length;
  const waits = L.takes.map(t => ({ id: t.id, w: ((t.roll || t.t) - t.from) / 1e3, ok: t.ok, take: t })).filter(x => x.w >= 0);
  const rolled = L.takes.filter(t => t.roll);
  const rollSec = rolled.reduce((m, t) => m + (t.t - t.roll) / 1e3, 0);
  const textOf = id => { for (const s of S) for (const l of s.lines) if (l.id === id) return { s, l }; return null; };
  const longest = waits.slice().sort((a, b) => b.w - a.w).slice(0, 3).map(x => { const o = textOf(x.id); return { w: x.w, text: o ? o.l.text : '', script: o ? name(o.s, S) : '' }; });
  const warm = run.warmId && L.per[run.warmId] ? L.per[run.warmId].min : 0;
  const left = inPlan.filter(s => L.per[s.id].left).length;
  // THE POST SHEET (v3): every kept take with the clock on it, so the good clip finds itself in the edit by its time.
  // from = the tap before it (about when the camera rolled), at = the Got it tap (the take's end), take = which one it was.
  const sizes = day.sizes || {};
  const lineNo = id => { const o = textOf(id); if (!o) return { n: 0, of: 0 }; const ls = o.s.lines; return { n: ls.findIndex(l => l.id === id) + 1, of: ls.length }; };
  const seenTake = {};
  const kept = L.takes.filter(t => t.ok).map(t => {
    const o = textOf(t.id), ln = lineNo(t.id);
    if (!t.cover) seenTake[t.id] = (seenTake[t.id] || 0) + 1;
    const take = t.cover ? 'cover' : (() => { let n = 0; for (const e of run.events) { if (e.t > t.t) break; if (e.id === t.id && (e.k === 'again' || (e.k === 'got' && !e.side))) n++; } return n; })();
    return { id: t.id, text: o ? o.l.text : '', script: o ? name(o.s, S) : '', who: o ? o.l.who || '' : '', line: ln.n, of: ln.of, br: !!(o && o.l.br), side: !!t.side, cover: t.cover || '', size: t.cover && t.cover !== 'again' ? t.cover : (sizes[t.id] || ''), from: t.from, at: t.t, takes: take };
  });
  const sizeN = {}; kept.forEach(k => { if (!k.br) sizeN[k.size || 'none'] = (sizeN[k.size || 'none'] || 0) + 1; });
  const whyList = Object.entries(L.whyN || {}).sort((a, b) => b[1] - a[1]);
  const hardN = L.log.filter(r => r.k === 'got' && !r.side && textOf(r.id) && isHard(textOf(r.id).l)).length;
  const hardOver = L.log.filter(r => r.k === 'got' && r.over && textOf(r.id) && isHard(textOf(r.id).l)).length;
  const coverN = kept.filter(k => k.cover).length, sideN = kept.filter(k => k.side).length;
  return {
    kept, sizeN, why: whyList, whyBy: L.why || {}, hardN, hardOver, coverN, sideN,
    start: run.at, end, min: (end - run.at) / 6e4,
    planned: run.base.length, finished: finished.length, dropped: [...L.dropped].length, never: S.filter(s => !s.skip && !inPlan.includes(s)).length,
    lines: got, skipped, takes: nTakes, perLine: got ? nTakes / got : 0,
    avgWait: waits.length ? waits.reduce((m, x) => m + x.w, 0) / waits.length : 0, waitIsTalk: rolled.length >= waits.length * .6,
    rollPct: rolled.length ? 100 * rollSec / ((end - run.at) / 1e3) : 0, rolledN: rolled.length,
    pace: L.paceLive, samples: L.samples.length, warm,
    longest, notes: L.notes, left,
    every: L.log.map(r => { const o = textOf(r.id); return { id: r.id, text: o ? o.l.text : '', script: o ? name(o.s, S) : '', who: o ? o.l.who || '' : '', min: r.min, takes: r.takes, k: r.k, budget: r.budget, over: r.over, side: !!r.side, hard: !!(o && isHard(o.l)), why: (L.why && L.why[r.id]) || [], size: sizes[r.id] || '', covers: (L.covers && L.covers[r.id] || []).length }; }),
    slowest: L.log.filter(r => r.k === 'got').slice().sort((a, b) => b.min - a.min).slice(0, 3).map(r => { const o = textOf(r.id); return { text: o ? o.l.text : '', script: o ? name(o.s, S) : '', min: r.min, takes: r.takes, over: r.over }; }),
    overN: L.log.filter(r => r.k === 'got' && r.over).length,
    laterN: run.events.filter(e => e.k === 'later').length, splitN: Object.keys(L.splits || {}).length,
    avgLine: (() => { const g = L.log.filter(r => r.k === 'got'); return g.length ? g.reduce((m, r) => m + r.min, 0) / g.length : 0; })(),
    scripts: inPlan.map(s => ({ id: s.id, title: name(s, S), min: L.per[s.id].min, lines: L.per[s.id].lines, done: L.per[s.id].done, takes: L.per[s.id].takes, skip: L.per[s.id].skip, dropped: L.dropped.has(s.id), left: L.per[s.id].left || 0, warm: s.id === run.warmId }))
  };
}

// scripts in the order they get worked through (warm-up, must, dated, the rest as the doc has them)
function rank(scripts, warm) { return scripts.slice().sort(byRank(warm)); }

const API = { parse, people, sentences, splitLine, placesIn, stopFor, shortPlace, name, rank, norm, kindOf, doOf, DO, hardOf, isHard, opWord, lineCost, order, plan, live, nudge, report, wrapMs, median, dialogue, BR_MIN, HARD_MIN };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.ADCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
