/* GET THE SHOT (10/15). The engine.
   A room (a wide illustration) and a subject (a roster sprite) sit in world space. The camera has a pan and a zoom; the
   delivery frame is a fixed 4:5 window in the middle of the screen. Each shot is a micro-game with one rule; the rule
   grades the frame at the moment the shutter fires. Ten shots a roll, four lives, the contact sheet at the end.
   Everything here is plain canvas and pointer events, so it runs offline from the home screen. */
(function () {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const cv = $('#cv'), cx = cv.getContext('2d');
const load = (k, d) => { try { const v = localStorage.getItem('gts-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem('gts-' + k, JSON.stringify(v)); } catch (e) {} };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms || 10); } catch (e) {} };

/* ---------- the deck: who, where, which rule ---------- */
const OCS = ['rin', 'lena', 'nyx', 'kuro', 'mars', 'cinder', 'bala', 'putty'];
const NAMES = {rin: 'Rin', lena: 'Lena', nyx: 'Nyx', kuro: 'Kuro', mars: 'Mars', cinder: 'Cinder', bala: 'Bala', putty: 'Putty'};
const ROOMS = ['pit', 'booth', 'lot', 'dark', 'roof'];
const ROOMN = {pit: 'the co-op', booth: 'the booth', lot: 'the lot', dark: 'the studio', roof: 'the roof', lounge: 'the lounge'};
const RULES = {
  thirds:   {b: 'Thirds',    s: 'put their eyes on a cross',          how: 'Eyes on one of the four crossings of the thirds grid. The grid shows for a beat after you shoot.'},
  headroom: {b: 'Headroom',  s: 'a little air above the head',        how: 'Keep the head in the frame with a little air above it. Cut the head or leave a mile of ceiling and it is a miss.'},
  lead:     {b: 'Lead room', s: 'space where they are looking',       how: 'They are looking one way. Give them room on that side. Cramming them against the edge they face is a miss.'},
  moment:   {b: 'The moment',s: 'shoot at the top of the jump',       how: 'They jump. Shoot at the very top. Early is a miss, late is a miss.'},
  focus:    {b: 'Focus',     s: 'drag the edge until it snaps sharp', how: 'The frame is soft. The right edge pulls focus. Shoot when it snaps.'},
  meter:    {b: 'Meter',     s: 'shoot when the needle hits zero',    how: 'The needle swings. Shoot at zero. Too far left is dark, too far right is blown out.'},
  level:    {b: 'Level',     s: 'drag sideways until the room sits flat', how: 'The room is crooked. Drag sideways (or tilt the phone) until the horizon is flat, then shoot.'},
  find:     {b: 'Find them', s: 'zoom in on the one in color',        how: 'The pit is packed. One person is in color. Zoom in until they fill the frame and shoot.'},
  noflash:  {b: 'No flash',  s: 'kill the flash first, then frame',   how: 'This room says no flash. The flash button is on. Turn it off before you shoot, then frame them on a third.'},
  burst:    {b: 'Burst',     s: 'hold the gem, then pick the sharp one', how: 'Hold the shutter for a burst of three while they move. Then pick the sharp frame off the strip.'},
};
const ORDER = ['thirds', 'headroom', 'moment', 'lead', 'meter', 'focus', 'find', 'level', 'noflash', 'burst'];

/* ---------- a seeded random so the daily room is the same for everyone ---------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------- art ---------- */
const ART = {oc: {}, room: {}, ui: {}, meta: null};
const img = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
async function loadArt() {
  try { ART.meta = await (await fetch('art/meta.json', {cache: 'no-cache'})).json(); } catch (e) { ART.meta = {}; }
  const jobs = [];
  OCS.forEach(k => ['idle', 'peak'].forEach(p => jobs.push(img(`art/oc/${k}_${p}.webp`).then(i => { ART.oc[k + '_' + p] = i; }))));
  ROOMS.concat(['lounge']).forEach(k => jobs.push(img(`art/room/${k}.webp`).then(i => { ART.room[k] = i; })));
  ['shutter', 'life', 'frame'].forEach(k => jobs.push(img(`art/ui/${k}.webp`).then(i => { ART.ui[k] = i; })));
  await Promise.all(jobs);
}

/* ---------- audio: the shutter, the chime, the buzz ---------- */
let AC = null; const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
function click() { const c = ac(); if (!c) return; const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * .06, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); n.buffer = b; const g = c.createGain(); g.gain.value = .5; n.connect(g); g.connect(c.destination); n.start(); }
function tone(f, ms, type) { const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.value = .18; o.connect(g); g.connect(c.destination); const t = c.currentTime; o.start(t); g.gain.linearRampToValueAtTime(0, t + ms / 1000); o.stop(t + ms / 1000 + .02); }
const sfxGood = () => { tone(880, 120); setTimeout(() => tone(1320, 160), 90); };
const sfxGold = () => { tone(880, 100); setTimeout(() => tone(1320, 100), 80); setTimeout(() => tone(1760, 220), 160); };
const sfxBad = () => tone(160, 260, 'square');

/* ---------- state ---------- */
const G = {
  mode: 'daily', seed: 0, rnd: Math.random, shot: 0, lives: 4, score: 0, roll: [], state: 'title',
  room: 'pit', oc: 'rin', rule: 'thirds', t0: 0, limit: 7, timer: null, raf: 0,
  cam: {x: 0, y: 0, z: 1, rot: 0}, world: {w: 1600, h: 900}, frame: {x: 0, y: 0, w: 0, h: 0},
  subj: {x: 0, y: 0, s: 1, face: 1, pose: 'idle', jumpT: 0, jumping: false, vx: 0}, extras: [],
  focus: 0, focusT: 0, meter: 0, flash: false, burstFrames: [], holding: false, holdT: 0, tutorial: load('tut', {}), tilt: null,
};
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // the delivery frame: 4:5, nearly full width, sitting a little above center so the thumb has room below
  const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0) + 96;
  const bottom = 150; let fw = W - 28, fh = fw * 1.25; const maxH = H - top - bottom; if (fh > maxH) { fh = maxH; fw = fh / 1.25; }
  G.frame = {x: (W - fw) / 2, y: top + (maxH - fh) / 2, w: fw, h: fh};
}
addEventListener('resize', resize); resize();

/* ---------- world <-> screen ---------- */
// the room is drawn so its height covers the frame height times a base scale; zoom multiplies; pan moves the camera center
function viewScale() { const base = G.frame.h / G.world.h * 1.35; return base * G.cam.z; }
function toScreen(wx, wy) { const s = viewScale(); const cxp = G.frame.x + G.frame.w / 2, cyp = G.frame.y + G.frame.h / 2; let dx = (wx - G.cam.x) * s, dy = (wy - G.cam.y) * s; const r = G.cam.rot; if (r) { const c = Math.cos(r), sn = Math.sin(r); const nx = dx * c - dy * sn, ny = dx * sn + dy * c; dx = nx; dy = ny; } return {x: cxp + dx, y: cyp + dy}; }
function subjectBox() { // the subject's rectangle on screen, plus the eye point
  const sp = ART.oc[G.oc + '_' + G.subj.pose]; if (!sp) return null;
  const s = viewScale() * G.subj.s; const w = sp.width * s, h = sp.height * s; const p = toScreen(G.subj.x, G.subj.y);
  const m = (ART.meta || {})[G.oc + '_' + G.subj.pose] || {headx: .5}; const hx = G.subj.face < 0 ? 1 - m.headx : m.headx;
  return {x: p.x - w / 2, y: p.y - h, w, h, eye: {x: p.x - w / 2 + w * hx, y: p.y - h + h * .11}, feet: p};
}

/* ---------- a shot: set the stage ---------- */
function setupShot() {
  const r = G.rnd;
  G.rule = G.mode === 'daily' ? ORDER[G.shot] : ORDER[Math.floor(r() * ORDER.length)];
  G.room = G.rule === 'find' ? 'pit' : ROOMS[Math.floor(r() * ROOMS.length)];
  G.oc = OCS[Math.floor(r() * OCS.length)];
  const rm = ART.room[G.room]; G.world = rm ? {w: rm.width, h: rm.height} : {w: 1600, h: 900};
  const speed = G.mode === 'free' ? Math.max(.55, 1 - G.shot * .05) : Math.max(.7, 1 - G.shot * .03);
  G.limit = Math.round({thirds: 7, headroom: 6, lead: 6, moment: 8, focus: 6, meter: 7, level: 6, find: 9, noflash: 7, burst: 8}[G.rule] * speed * 10) / 10;
  Object.assign(G.subj, {x: G.world.w * (.3 + r() * .4), y: G.world.h * (.86 + r() * .1), s: .6, face: r() < .5 ? 1 : -1, pose: 'idle', jumpT: 0, jumping: false, vx: 0});
  // the camera opens near them but off: the first drag is a framing choice, not a search
  G.cam = {x: clamp(G.subj.x + (r() < .5 ? -1 : 1) * G.world.w * (.1 + r() * .1), 0, G.world.w), y: G.subj.y - G.world.h * .3, z: 1, rot: 0};
  G.extras = []; G.focus = 0; G.meter = 0; G.flash = false; G.burstFrames = []; G.holding = false; G.tilt = null;
  $('#flashbtn').hidden = true; $('#zoomh').textContent = 'drag the edge to zoom';
  if (G.rule === 'find') {
    G.cam.z = 1; G.subj.s = .5;
    for (let i = 0; i < 26; i++) G.extras.push({oc: OCS[Math.floor(r() * OCS.length)], x: G.world.w * (.08 + r() * .84), y: G.world.h * (.8 + r() * .18), s: .42 + r() * .16, face: r() < .5 ? 1 : -1, dim: true});
    G.extras.sort((a, b) => a.y - b.y);
    G.subj.x = G.world.w * (.12 + r() * .76); G.subj.y = G.world.h * (.84 + r() * .12); G.cam = {x: G.world.w / 2, y: G.world.h * .62, z: 1, rot: 0};
  }
  if (G.rule === 'focus') { G.focus = (r() < .5 ? -1 : 1) * (.45 + r() * .4); G.focusT = 0; $('#zoomh').textContent = 'drag the edge to pull focus'; }
  if (G.rule === 'level') { G.cam.rot = (r() < .5 ? -1 : 1) * (.18 + r() * .22); $('#zoomh').textContent = 'drag sideways to level'; }
  if (G.rule === 'noflash') { G.flash = true; $('#flashbtn').hidden = false; $('#flashbtn').setAttribute('aria-pressed', 'true'); $('#flashbtn').textContent = '⚡ Flash on'; }
  if (G.rule === 'moment') { G.subj.jumpT = -1.2 - r() * 1.2; G.subj.jumping = true; }
  if (G.rule === 'burst') { G.subj.vx = (r() < .5 ? -1 : 1) * 90; G.subj.face = G.subj.vx > 0 ? 1 : -1; $('#zoomh').textContent = 'hold the gem'; }
  $('#rule-b').textContent = RULES[G.rule].b; $('#rule-s').textContent = RULES[G.rule].s;
  $('#shotn').textContent = G.shot + 1; $('#score').textContent = G.score; paintLives(); paintZoom();
}
function paintLives() { $('#lives').innerHTML = [0, 1, 2, 3].map(i => `<img src="art/ui/life.webp" alt="" class="${i < G.lives ? '' : 'lost'}">`).join(''); }
function paintZoom() { $('#zoomt').textContent = Math.round(24 * G.cam.z) + 'mm'; const e = $('#edge i'); if (e) e.style.top = (100 - (G.rule === 'focus' ? (G.focusT + 1) / 2 : (G.cam.z - 1) / 2.2) * 100) + '%'; }

/* ---------- the timer ---------- */
function startTimer() { G.t0 = performance.now(); $('#timer').classList.remove('hot'); }
function timeLeft() { return Math.max(0, G.limit - (performance.now() - G.t0) / 1000); }

/* ---------- draw ---------- */
let lastT = 0;
function draw(now) {
  G.raf = requestAnimationFrame(draw);
  const dt = Math.min(.05, (now - lastT) / 1000 || 0); lastT = now;
  if (G.state === 'shoot') tick(dt);
  cx.save(); cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
  // the room, panned and zoomed around the frame center, blurred when the focus is off
  const s = viewScale(), f = G.frame, c = {x: f.x + f.w / 2, y: f.y + f.h / 2};
  cx.save(); cx.translate(c.x, c.y); if (G.cam.rot) cx.rotate(G.cam.rot); cx.scale(s, s); cx.translate(-G.cam.x, -G.cam.y);
  const blurPx = G.rule === 'focus' ? Math.abs(G.focus - G.focusT) * 14 : 0;
  if (blurPx > .3 && 'filter' in cx) cx.filter = `blur(${blurPx}px)`;
  const rm = ART.room[G.room] || ART.room.lounge; if (rm) cx.drawImage(rm, 0, 0, G.world.w, G.world.h); else { cx.fillStyle = '#1a1021'; cx.fillRect(0, 0, G.world.w, G.world.h); }
  // extras (the crowd on Find them)
  G.extras.forEach(e => { const sp = ART.oc[e.oc + '_idle']; if (!sp) return; cx.save(); cx.translate(e.x, e.y); cx.scale(e.face * e.s, e.s); if (e.dim) cx.filter = (blurPx > .3 ? `blur(${blurPx}px) ` : '') + 'brightness(.22) saturate(0)'; cx.drawImage(sp, -sp.width / 2, -sp.height); cx.restore(); });
  // the subject
  const sp = ART.oc[G.oc + '_' + G.subj.pose];
  if (sp) { let lift = 0; if (G.subj.jumping && G.subj.jumpT > 0 && G.subj.jumpT < 1) lift = Math.sin(G.subj.jumpT * Math.PI) * sp.height * .42; cx.save(); cx.translate(G.subj.x, G.subj.y - lift); cx.scale(G.subj.face * G.subj.s, G.subj.s); if (G.rule === 'burst' && Math.abs(G.subj.vx) > 10) cx.filter = (blurPx > .3 ? `blur(${blurPx}px) ` : '') + `blur(${G.holding ? 0 : 2}px)`; cx.drawImage(sp, -sp.width / 2, -sp.height); cx.restore(); }
  cx.restore();
  // the mask outside the frame
  cx.fillStyle = 'rgba(0,0,0,.78)'; cx.fillRect(0, 0, W, f.y); cx.fillRect(0, f.y + f.h, W, H - f.y - f.h); cx.fillRect(0, f.y, f.x, f.h); cx.fillRect(f.x + f.w, f.y, W - f.x - f.w, f.h);
  // the frame line and corners
  cx.strokeStyle = 'rgba(255,255,255,.75)'; cx.lineWidth = 1; cx.strokeRect(f.x + .5, f.y + .5, f.w - 1, f.h - 1);
  cx.strokeStyle = '#ff79c6'; cx.lineWidth = 3; const L = 22; [[f.x, f.y, 1, 1], [f.x + f.w, f.y, -1, 1], [f.x, f.y + f.h, 1, -1], [f.x + f.w, f.y + f.h, -1, -1]].forEach(([x, y, dx, dy]) => { cx.beginPath(); cx.moveTo(x, y + dy * L); cx.lineTo(x, y); cx.lineTo(x + dx * L, y); cx.stroke(); });
  // helpers per rule
  if (G.state === 'shoot' || G.state === 'flashgrid') {
    if (G.rule === 'thirds' || G.rule === 'noflash' || G.state === 'flashgrid') { cx.strokeStyle = 'rgba(255,255,255,.28)'; cx.lineWidth = 1; for (let i = 1; i < 3; i++) { cx.beginPath(); cx.moveTo(f.x + f.w * i / 3, f.y); cx.lineTo(f.x + f.w * i / 3, f.y + f.h); cx.stroke(); cx.beginPath(); cx.moveTo(f.x, f.y + f.h * i / 3); cx.lineTo(f.x + f.w, f.y + f.h * i / 3); cx.stroke(); } for (let i = 1; i < 3; i++) for (let j = 1; j < 3; j++) { cx.fillStyle = '#ff79c6'; cx.beginPath(); cx.arc(f.x + f.w * i / 3, f.y + f.h * j / 3, 4, 0, 7); cx.fill(); } }
    if (G.rule === 'meter') { const mx = f.x + f.w / 2, my = f.y + f.h - 26, mw = f.w * .7; cx.fillStyle = 'rgba(10,10,13,.7)'; cx.fillRect(mx - mw / 2 - 10, my - 18, mw + 20, 36); cx.strokeStyle = 'rgba(255,255,255,.5)'; cx.beginPath(); cx.moveTo(mx - mw / 2, my); cx.lineTo(mx + mw / 2, my); cx.stroke(); for (let i = -3; i <= 3; i++) { cx.beginPath(); cx.moveTo(mx + i * mw / 6, my - (i ? 5 : 10)); cx.lineTo(mx + i * mw / 6, my + (i ? 5 : 10)); cx.stroke(); } cx.fillStyle = '#ffd479'; cx.beginPath(); cx.moveTo(mx + G.meter * mw / 2, my - 14); cx.lineTo(mx + G.meter * mw / 2 - 6, my + 10); cx.lineTo(mx + G.meter * mw / 2 + 6, my + 10); cx.fill(); cx.fillStyle = '#fff'; cx.font = '700 10px JetBrains Mono, monospace'; cx.textAlign = 'center'; cx.fillText('-3', mx - mw / 2, my + 24); cx.fillText('0', mx, my + 24); cx.fillText('+3', mx + mw / 2, my + 24); }
    if (G.rule === 'level') { cx.strokeStyle = 'rgba(255,255,255,.35)'; cx.setLineDash([6, 6]); cx.beginPath(); cx.moveTo(f.x, f.y + f.h / 2); cx.lineTo(f.x + f.w, f.y + f.h / 2); cx.stroke(); cx.setLineDash([]); }
    if (G.rule === 'noflash') { cx.fillStyle = 'rgba(255,212,121,.95)'; cx.font = '900 italic 20px Saira Condensed, Impact, sans-serif'; cx.textAlign = 'center'; cx.fillText('NO FLASH', f.x + f.w / 2, f.y + 30); }
    if (G.rule === 'find') { const sb = subjectBox(); if (sb && G.cam.z < 1.3) { cx.strokeStyle = 'rgba(255,121,198,.9)'; cx.lineWidth = 2; cx.setLineDash([4, 4]); cx.strokeRect(sb.x - 6, sb.y - 6, sb.w + 12, sb.h + 12); cx.setLineDash([]); } }
  }
  // the timer bar
  if (G.state === 'shoot') { const tl = timeLeft() / G.limit; const bar = $('#timer i'); if (bar) bar.style.transform = `scaleX(${tl})`; $('#timer').classList.toggle('hot', tl < .3); if (tl <= 0) shoot(true); }
  cx.restore();
}
function tick(dt) {
  if (G.subj.jumping) { G.subj.jumpT += dt / 1.1; if (G.subj.jumpT > 1.6) G.subj.jumpT = -0.8; G.subj.pose = (G.subj.jumpT > .22 && G.subj.jumpT < .82) ? 'peak' : 'idle'; }
  if (G.rule === 'meter') G.meter = Math.sin(performance.now() / (520 - Math.min(G.shot, 9) * 25)) * .98;
  if (G.rule === 'burst') { G.subj.x += G.subj.vx * dt; if (G.subj.x < G.world.w * .15 || G.subj.x > G.world.w * .85) { G.subj.vx *= -1; G.subj.face = G.subj.vx > 0 ? 1 : -1; } }
  if (G.rule === 'level' && G.tilt != null) G.cam.rot = lerp(G.cam.rot, G.tilt, .2);
}

/* ---------- input: drag pans, the right edge zooms or focuses, sideways levels ---------- */
let ptr = null;
cv.addEventListener('pointerdown', e => { if (G.state !== 'shoot') return; ptr = {x: e.clientX, y: e.clientY, cx: G.cam.x, cy: G.cam.y, rot: G.cam.rot, id: e.pointerId}; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!ptr || G.state !== 'shoot') return; const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; const s = viewScale();
  if (G.rule === 'level') { G.tilt = null; G.cam.rot = clamp(ptr.rot - dx / 260, -.6, .6); return; }
  G.cam.x = clamp(ptr.cx - dx / s, 0, G.world.w); G.cam.y = clamp(ptr.cy - dy / s, 0, G.world.h);
});
const ptrEnd = () => { ptr = null; }; cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
let edge = null; const edgeEl = $('#edge');
edgeEl.addEventListener('pointerdown', e => { if (G.state !== 'shoot') return; edge = {y: e.clientY, z: G.cam.z, f: G.focusT}; edgeEl.setPointerCapture(e.pointerId); });
edgeEl.addEventListener('pointermove', e => { if (!edge) return; const dy = (edge.y - e.clientY) / (H * .55); if (G.rule === 'focus') G.focusT = clamp(edge.f + dy * 2, -1, 1); else G.cam.z = clamp(edge.z + dy * 2.2, 1, 3.2); paintZoom(); });
const edgeEnd = () => { edge = null; }; edgeEl.addEventListener('pointerup', edgeEnd); edgeEl.addEventListener('pointercancel', edgeEnd);
addEventListener('deviceorientation', e => { if (G.state === 'shoot' && G.rule === 'level' && e.gamma != null && !ptr) G.tilt = clamp(-e.gamma / 180 * Math.PI * 1.4 + (G.levelBias || 0), -.6, .6); });
$('#flashbtn').addEventListener('click', () => { G.flash = !G.flash; $('#flashbtn').setAttribute('aria-pressed', String(G.flash)); $('#flashbtn').textContent = G.flash ? '⚡ Flash on' : 'Flash off'; buzz(); });

/* ---------- the shutter ---------- */
const sh = $('#shutter');
sh.addEventListener('pointerdown', e => { if (G.state !== 'shoot') return; e.preventDefault(); if (G.rule === 'burst') { G.holding = true; G.holdT = performance.now(); burstRun(); } });
sh.addEventListener('pointerup', e => { if (G.state !== 'shoot') return; e.preventDefault(); if (G.rule === 'burst') { G.holding = false; return; } shoot(false); });
function snapshot(wp) { // the frame as a small picture for the sheet
  const o = document.createElement('canvas'); o.width = 180; o.height = 225; const oc = o.getContext('2d'); const f = G.frame;
  oc.drawImage(cv, f.x * DPR, f.y * DPR, f.w * DPR, f.h * DPR, 0, 0, 180, 225);
  return o;
}
function burstRun() {
  const frames = [];
  const take = i => { if (!G.holding && i > 0) { finishBurst(frames); return; } const blurred = !(i === G.burstSharp); click(); flashWhite(.35);
    const o = snapshot(); if (blurred) { const o2 = document.createElement('canvas'); o2.width = 180; o2.height = 225; const c2 = o2.getContext('2d'); c2.filter = 'blur(3px)'; c2.drawImage(o, 0, 0); frames.push({c: o2, sharp: false}); } else frames.push({c: o, sharp: true});
    if (i < 2) setTimeout(() => take(i + 1), 380); else finishBurst(frames); };
  G.burstSharp = Math.floor(G.rnd() * 3); take(0);
}
function finishBurst(frames) {
  if (G.state !== 'shoot') return; G.state = 'pick'; G.holding = false;
  const b = document.createElement('div'); b.className = 'burst'; b.id = 'burstpick';
  frames.forEach((fr, i) => { const btn = document.createElement('button'); btn.type = 'button'; btn.appendChild(fr.c); btn.addEventListener('click', () => { b.remove(); grade(fr.sharp ? 100 : 25, fr.sharp ? 'sharp' : 'soft one', fr.c); }); b.appendChild(btn); });
  document.body.appendChild(b); $('#rule-s').textContent = 'tap the sharp one';
}
function flashWhite(a) { const w = $('#white'); w.style.transition = 'none'; w.style.opacity = a; requestAnimationFrame(() => { w.style.transition = 'opacity .3s'; w.style.opacity = 0; }); }
function shoot(timeout) {
  if (G.state !== 'shoot') return;
  click(); flashWhite(G.flash ? .9 : .5); buzz(14);
  const pic = snapshot();
  if (timeout) { grade(0, 'too slow', pic); return; }
  const f = G.frame, sb = subjectBox(); let sc = 0, why = '';
  const inFrame = sb && sb.eye.x > f.x && sb.eye.x < f.x + f.w && sb.eye.y > f.y && sb.eye.y < f.y + f.h;
  switch (G.rule) {
    case 'thirds': case 'noflash': {
      if (G.rule === 'noflash' && G.flash) { sc = 0; why = 'flash'; break; }
      if (!sb || !inFrame) { sc = 0; why = 'lost them'; break; }
      let best = 1e9; for (let i = 1; i < 3; i++) for (let j = 1; j < 3; j++) best = Math.min(best, Math.hypot(sb.eye.x - (f.x + f.w * i / 3), sb.eye.y - (f.y + f.h * j / 3)));
      const tol = f.w * .16; sc = clamp(100 - best / tol * 100, 0, 100); why = sc < 40 ? 'off the cross' : ''; break; }
    case 'headroom': {
      if (!sb || sb.eye.x < f.x || sb.eye.x > f.x + f.w) { sc = 0; why = 'lost them'; break; }
      const headTop = sb.y; const air = (headTop - f.y) / f.h;
      if (air < 0) { sc = 0; why = 'cut the head'; } else if (air > .3) { sc = clamp(100 - (air - .3) * 300, 0, 60); why = 'too much ceiling'; } else { const ideal = .09; sc = clamp(100 - Math.abs(air - ideal) / .12 * 100, 0, 100); if (sc < 40) why = air > ideal ? 'too much ceiling' : 'tight on top'; }
      if (sb.feet.y < f.y + f.h * .4) { sc = Math.min(sc, 30); why = 'they are tiny'; } break; }
    case 'lead': {
      if (!sb || !inFrame) { sc = 0; why = 'lost them'; break; }
      const front = G.subj.face > 0 ? (f.x + f.w - sb.eye.x) / f.w : (sb.eye.x - f.x) / f.w;
      sc = clamp((front - .35) / .3 * 100, 0, 100); if (front < .5) why = 'wrong side'; if (front > .9) { sc = 55; why = 'too far back'; } break; }
    case 'moment': {
      const t = G.subj.jumpT; if (!sb || !inFrame) { sc = 0; why = 'lost them'; break; }
      if (t < 0 || t > 1) { sc = 0; why = t < 0 ? 'early' : 'late'; break; }
      sc = clamp(100 - Math.abs(t - .5) / .22 * 100, 0, 100); why = sc < 40 ? (t < .5 ? 'early' : 'late') : ''; break; }
    case 'focus': { const d = Math.abs(G.focus - G.focusT); sc = clamp(100 - d / .22 * 100, 0, 100); why = sc < 40 ? 'soft' : ''; if (!sb || !inFrame) { sc = Math.min(sc, 50); why = why || 'lost them'; } break; }
    case 'meter': { const m = Math.abs(G.meter); sc = clamp(100 - m / .3 * 100, 0, 100); why = sc < 40 ? (G.meter < 0 ? 'too dark' : 'blown out') : ''; break; }
    case 'level': { const a = Math.abs(G.cam.rot); sc = clamp(100 - a / .14 * 100, 0, 100); why = sc < 40 ? 'crooked' : ''; break; }
    case 'find': {
      if (!sb || !inFrame) { sc = 0; why = 'lost them'; break; }
      const fill = sb.h / f.h; const center = Math.hypot(sb.eye.x - (f.x + f.w / 2), (sb.y + sb.h / 2) - (f.y + f.h / 2)) / f.w;
      sc = clamp((fill - .35) / .5 * 70, 0, 70) + clamp(30 - center * 90, 0, 30); why = sc < 40 ? (fill < .5 ? 'zoom in' : 'center them') : ''; break; }
  }
  grade(Math.round(sc), why, pic);
}
function grade(sc, why, pic) {
  G.state = 'grade';
  const keep = sc >= 70, miss = sc < 40; const word = sc >= 95 ? 'Perfect' : keep ? 'Keeper' : miss ? 'Miss' : 'Close';
  const pts = Math.round(sc * (1 + G.shot * .08)) * (sc >= 95 ? 2 : 1);
  G.score += pts; $('#score').textContent = G.score;
  if (miss) { G.lives -= 1; paintLives(); sfxBad(); buzz([30, 40, 30]); } else if (sc >= 95) { sfxGold(); } else if (keep) sfxGood();
  G.roll.push({sc, why, pic, rule: G.rule, oc: G.oc, pts});
  const t = $('#toast'); t.className = 'toast on ' + (sc >= 95 ? 'gold' : keep ? 'good' : miss ? 'bad' : ''); t.querySelector('b').textContent = word; t.querySelector('span').textContent = (why || (keep ? '+' + pts : 'close, +' + pts)) + (why && pts ? ' · +' + pts : '');
  if (G.rule === 'thirds' || G.rule === 'noflash' || G.rule === 'headroom') G.state = 'flashgrid';
  setTimeout(() => { t.classList.remove('on'); nextShot(); }, 1150);
}
function nextShot() {
  G.shot += 1;
  if (G.lives <= 0 || G.shot >= 10) { endRoll(); return; }
  setupShot(); showCard();
}
function showCard() {
  const first = !G.tutorial[G.rule]; const c = $('#card');
  c.innerHTML = `<b>${RULES[G.rule].b}</b><span>${first ? RULES[G.rule].how : RULES[G.rule].s}</span>`;
  c.classList.add('on'); G.state = 'card';
  setTimeout(() => { c.classList.remove('on'); G.tutorial[G.rule] = 1; save('tut', G.tutorial); G.state = 'shoot'; startTimer(); }, first ? 2200 : 900);
}

/* ---------- a roll ---------- */
function startRoll(mode) {
  G.mode = mode; G.seed = mode === 'daily' ? hash(dayKey()) : (Math.random() * 1e9) >>> 0; G.rnd = rng(G.seed);
  G.shot = 0; G.lives = 4; G.score = 0; G.roll = []; G.levelBias = 0;
  $$('.scr').forEach(s => s.hidden = true); $('#hud').hidden = false; ac();
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') { DeviceOrientationEvent.requestPermission().catch(() => {}); }
  setupShot(); showCard();
}
function endRoll() {
  G.state = 'sheet'; $('#hud').hidden = true; const r = G.roll;
  const keepers = r.filter(x => x.sc >= 70).length, perfect = r.filter(x => x.sc >= 95).length;
  const gradeL = G.score >= 1600 ? 'S' : G.score >= 1100 ? 'A' : G.score >= 700 ? 'B' : G.score >= 350 ? 'C' : 'D';
  $('#sheet').innerHTML = r.map(x => `<div class="fr ${x.sc >= 70 ? 'keep' : x.sc < 40 ? 'miss' : ''}"><i>${x.sc >= 70 ? (x.sc >= 95 ? 'perfect' : RULES[x.rule].b) : (x.why || 'close')}</i>${x.sc >= 70 ? '<em></em>' : ''}</div>`).join('');
  $$('#sheet .fr').forEach((el, i) => { if (r[i].pic) el.prepend(r[i].pic); });
  $('#g-score').textContent = G.score; $('#g-grade').textContent = gradeL; $('#g-line').textContent = `keepers ${keepers} of ${r.length}${perfect ? ' · ' + perfect + ' perfect' : ''}${G.lives <= 0 ? ' · out of lives' : ''}`;
  $('#sheet-sub').textContent = (G.mode === 'daily' ? 'today\'s room · ' : 'free play · ') + dayKey();
  // the books: best, rolls, pulls (1,000 points = one pull token for the Crypt)
  const best = load('best', 0); if (G.score > best) save('best', G.score);
  if (G.mode === 'daily') { const dd = load('daily', {}); dd[dayKey()] = Math.max(dd[dayKey()] || 0, G.score); save('daily', dd); }
  save('rolls', load('rolls', 0) + 1);
  const bank = load('bank', 0) + G.score, pulls = Math.floor(bank / 1000); save('bank', bank % 1000); if (pulls) { save('pulls', load('pulls', 0) + pulls); try { const b = JSON.parse(localStorage.getItem('otp-play-pulls') || '0') + pulls; localStorage.setItem('otp-play-pulls', JSON.stringify(b)); } catch (e) {} }
  $('#again-sub').textContent = pulls ? `+${pulls} pull${pulls > 1 ? 's' : ''} earned` : `${1000 - bank % 1000} points to the next pull`;
  $('#s-sheet').hidden = false; paintTitle();
}
function paintTitle() {
  $('#best').textContent = load('best', 0); $('#pulls').textContent = load('pulls', 0); $('#rolls').textContent = load('rolls', 0);
  const dd = load('daily', {}); const t = dd[dayKey()]; $('#daily-best').textContent = t ? `today's best ${t} · same room for everyone` : 'same room for everyone today'; $('#daily-tag').textContent = 'Daily room · ' + new Date().toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  G.room = 'lounge'; const rm = ART.room.lounge; if (rm) { G.world = {w: rm.width, h: rm.height}; G.cam = {x: rm.width / 2, y: rm.height * .6, z: 1, rot: 0}; }
}
async function shareSheet() {
  const o = document.createElement('canvas'); o.width = 1080; o.height = 1350; const c = o.getContext('2d');
  c.fillStyle = '#0a0a0d'; c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = '#ff79c6'; c.font = '900 italic 96px Saira Condensed, Impact, sans-serif'; c.fillText('GET THE SHOT', 60, 130);
  c.fillStyle = '#9a93a3'; c.font = '700 26px JetBrains Mono, monospace'; c.fillText((G.mode === 'daily' ? 'DAILY ROOM · ' : 'FREE PLAY · ') + dayKey().toUpperCase() + ' · 0FFTHEPRINT.COM/PLAY', 60, 176);
  const cols = 5, cw = 184, ch = 230, gap = 10, x0 = 60, y0 = 230;
  G.roll.forEach((x, i) => { const px = x0 + (i % cols) * (cw + gap), py = y0 + Math.floor(i / cols) * (ch + gap); c.fillStyle = '#000'; c.fillRect(px, py, cw, ch); if (x.pic) c.drawImage(x.pic, px, py, cw, ch); c.strokeStyle = x.sc >= 70 ? '#7ee787' : x.sc < 40 ? '#ff5d7e' : '#26252f'; c.lineWidth = 4; c.strokeRect(px + 2, py + 2, cw - 4, ch - 4); c.fillStyle = 'rgba(10,10,13,.8)'; c.fillRect(px + 6, py + ch - 34, cw - 12, 26); c.fillStyle = x.sc >= 70 ? '#7ee787' : '#fff'; c.font = '700 16px JetBrains Mono, monospace'; c.fillText((x.sc >= 70 ? RULES[x.rule].b : x.why || 'close').toUpperCase().slice(0, 16), px + 12, py + ch - 15); });
  c.fillStyle = '#ff79c6'; c.font = '900 italic 200px Saira Condensed, Impact, sans-serif'; c.fillText(String(G.score), 60, 1000);
  c.fillStyle = '#f4eef2'; c.font = '900 italic 72px Saira Condensed, Impact, sans-serif'; c.fillText($('#g-grade').textContent, 60, 1090);
  c.fillStyle = '#9a93a3'; c.font = '700 28px JetBrains Mono, monospace'; c.fillText($('#g-line').textContent.toUpperCase(), 60, 1150);
  c.fillStyle = '#6d6775'; c.font = '700 24px JetBrains Mono, monospace'; c.fillText('A GAME FROM 0FF THE PRINT · SAN ANTONIO', 60, 1290);
  const blob = await new Promise(r => o.toBlob(r, 'image/png')); const file = new File([blob], 'get-the-shot-' + dayKey() + '.png', {type: 'image/png'});
  try { if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: 'Get the Shot'}); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}

/* ---------- wiring ---------- */
document.addEventListener('click', e => {
  const m = e.target.closest('[data-mode]'); if (m) { startRoll(m.dataset.mode); return; }
  if (e.target.closest('#howbtn')) { $('#how').innerHTML = ORDER.map(k => `<div><b>${RULES[k].b}</b><span>${RULES[k].how}</span></div>`).join(''); $('#s-title').hidden = true; $('#s-how').hidden = false; return; }
  if (e.target.closest('[data-back]')) { e.preventDefault(); $$('.scr').forEach(s => s.hidden = true); $('#s-title').hidden = false; paintTitle(); G.state = 'title'; return; }
  if (e.target.closest('#again')) { startRoll(G.mode); return; }
  if (e.target.closest('#share')) { shareSheet(); return; }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
loadArt().then(() => { paintTitle(); G.state = 'title'; requestAnimationFrame(draw); });
})();
