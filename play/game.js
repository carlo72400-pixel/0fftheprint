/* GET THE SHOT v2 (10/15). A cardboard diorama you photograph.
   The room is a toy theater: a painted backdrop, hand-painted cardboard flats standing at different depths on a stage
   floor, and the roster as cutouts glued to board. The camera sits in that space with a real perspective projection,
   so trucking sideways slides the layers past each other, walking in grows the near flats faster than the far ones,
   and focus is a distance (tap a thing to focus on it, everything at another depth goes soft).
   Each brief is a shot to make. The side hint sketches it and the three checks light up live as you frame. The shutter
   grades 1 to 3 stars, the photo develops and goes in the album. No timer, no lives, no fail: every shot is a photo.
   Plain canvas + pointer events, offline from the home screen. */
(function () {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const cv = $('#cv'), cx = cv.getContext('2d', {alpha: false});
const load = (k, d) => { try { const v = localStorage.getItem('gts2-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem('gts2-' + k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms || 10); } catch (e) {} };
const HAS_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); return 'filter' in c; } catch (e) { return false; } })();

/* ---------- seeded random so the daily set is the same for everyone ---------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------- the roster ---------- */
const NAMES = {rin: 'Rin', lena: 'Lena', nyx: 'Nyx', kuro: 'Kuro', mars: 'Mars', cinder: 'Cinder', bala: 'Bala', putty: 'Putty'};
const CAST = ['mars', 'rin', 'lena', 'nyx', 'kuro', 'cinder', 'bala', 'putty'];
const POSES = ['idle', 'peak', 'drink', 'selfie']; // every cutout that exists per character; a missing file just skips that pose
const NAT = {idle: 1, peak: 1, drink: 1, selfie: -1}; // which way each pose was drawn facing
let META = {}; // art/v2/oc/meta.json: [w, h, headx] per cutout
// where the head sits across each cutout, 0..1 from the left (as drawn, facing right)
const HEADX = {bala_idle: .40, bala_peak: .50, cinder_idle: .46, cinder_peak: .53, kuro_idle: .50, kuro_peak: .52, lena_idle: .53, lena_peak: .56, mars_idle: .40, mars_peak: .66, nyx_idle: .47, nyx_peak: .50, putty_idle: .61, putty_peak: .48, rin_idle: .70, rin_peak: .52};

/* ---------- the rooms: flats at depths. x sideways, z away from the door, y up; the floor is y = 0 ---------- */
// roles: which flat plays which part in the briefs (decks = the thing the subject works behind, frame = the thing you
// shoot through, top = the thing that hangs or towers, big = the big piece, lights = the light source, bar = where the drinks are)
const ROOMS = {
  booth: {
    name: 'the booth', backdrop: 'backdrop_booth', bz: 9.2, bh: 6.2, haze: '255,150,190', floor: ['#5a4330', '#7b5b3d', '#3a2a1e'], ball: true,
    roles: {decks: 'f_booth', frame: 'f_arch', top: 'f_ball', big: 'f_speaker', lights: 'f_lights', bar: 'f_bar'},
    words: {decks: 'the decks', frame: 'the doorway', top: 'the ball', big: 'the speaker', lights: 'the lights', bar: 'the bar'},
    titles: {decks: 'On the decks', arch: 'Through the doorway', ball: 'Under the ball', bar: 'At the bar'},
    pool: {x: 0, z: 4.9, col: '255,200,140'},
    flats: [
      {k: 'f_ball',    x: .35,  z: 6.6, h: 1.35, top: 4.1, hang: true},
      {k: 'f_lights',  x: -3.1, z: 5.6, h: 2.7},
      {k: 'f_speaker', x: 2.9,  z: 5.3, h: 2.25},
      {k: 'f_booth',   x: 0,    z: 4.9, h: 1.08},
      {k: 'f_bar',     x: 3.5,  z: 4.2, h: 2.05},
      {k: 'f_wedge',   x: -1.1, z: 3.7, h: .62},
      {k: 'f_table',   x: 1.9,  z: 3.1, h: 1.12},
      {k: 'f_arch',    x: -1.7, z: 2.2, h: 2.9, opening: [.2, .08, .8, .9]},
    ],
    spots: {decks: {x: .25, z: 5.35}, floor: {x: .7, z: 3.6}, bar: {x: 2.5, z: 3.9}, arch: {x: -1.5, z: 3.4}, left: {x: -2.0, z: 4.3}},
    // the rest of the roster hanging out in the room, cutouts like Mars, each with its own idle clock
    extras: [{x: 3.7, z: 3.6, face: 1, h: 1.72, pair: 1}, {x: 4.5, z: 3.6, face: -1, h: 1.78, pair: 1}, {x: 2.3, z: 6.0, face: 1, h: 1.76}, {x: -3.6, z: 6.2, face: 1, h: 1.86}, {x: -1.6, z: 6.5, face: 1, h: 1.74}],
    lights: [{x: -3.0, y: 2.55, z: 5.55, col: '255,121,198', to: {x: -.6, z: 4.6}}, {x: -2.75, y: 2.55, z: 5.55, col: '255,190,90', to: {x: 1.2, z: 4.4}}],
    cam: {x: 0, y: 1.45, z: 0, zoom: 1},
  },
  coop: {
    name: 'the co-op', backdrop: 'backdrop_coop', bz: 9.2, bh: 6.0, haze: '255,210,150', floor: ['#4a3a2a', '#6b5238', '#33261a'],
    roles: {decks: 'c_drums', frame: 'c_door', top: 'c_lamp', big: 'c_couch', lights: 'c_amps', bar: 'c_keg'},
    words: {decks: 'the kit', frame: 'the kitchen door', top: 'the lamp', big: 'the couch', lights: 'the amps', bar: 'the keg'},
    titles: {decks: 'Front of the kit', arch: 'Through the kitchen door', ball: 'Under the lamp', bar: 'At the keg'},
    pool: {x: -.3, z: 5.4, col: '255,210,150'},
    flats: [
      {k: 'c_drums',  x: -.4,  z: 6.4, h: 1.3},
      {k: 'c_amps',   x: -2.6, z: 5.9, h: 1.9},
      {k: 'c_lamp',   x: 3.1,  z: 5.6, h: 2.3},
      {k: 'c_couch',  x: 2.2,  z: 4.6, h: 1.3},
      {k: 'c_keg',    x: -3.3, z: 4.0, h: 1.2},
      {k: 'c_merch',  x: 3.4,  z: 3.3, h: 1.25},
      {k: 'c_fan',    x: -1.6, z: 3.2, h: 1.1},
      {k: 'c_door',   x: -2.4, z: 2.2, h: 2.9, opening: [.25, .1, .75, .92]},
    ],
    spots: {decks: {x: -.3, z: 5.5}, floor: {x: .6, z: 3.7}, bar: {x: -2.6, z: 3.7}, arch: {x: -2.1, z: 3.4}, left: {x: -1.8, z: 4.6}},
    extras: [{x: -4.1, z: 3.6, face: 1, h: 1.74, pair: 1}, {x: -3.3, z: 3.6, face: -1, h: 1.78, pair: 1}, {x: 3.4, z: 5.0, face: -1, h: 1.72}, {x: 1.8, z: 6.6, face: -1, h: 1.76}, {x: -2.2, z: 6.9, face: 1, h: 1.7}],
    lights: [{x: -2.5, y: 2.6, z: 5.85, col: '150,255,120', to: {x: -.4, z: 5.0}}, {x: 3.0, y: 2.5, z: 5.55, col: '255,190,90', to: {x: 1.5, z: 4.4}}],
    cam: {x: 0, y: 1.45, z: 0, zoom: 1},
  },
  lot: {
    name: 'the lot', backdrop: 'backdrop_lot', bz: 10, bh: 6.4, haze: '120,150,255', floor: ['#2a2d36', '#3b3f4a', '#1a1c22'],
    roles: {decks: 'l_car', frame: 'l_fence', top: 'l_pole', big: 'l_dumpster', lights: 'l_pole', bar: 'l_truck'},
    words: {decks: 'the trunk', frame: 'the gate', top: 'the streetlight', big: 'the dumpster', lights: 'the streetlight', bar: 'the truck'},
    titles: {decks: 'Trunk party', arch: 'Through the gate', ball: 'Under the streetlight', bar: 'At the truck'},
    pool: {x: -2.2, z: 5.6, col: '255,160,60'},
    flats: [
      {k: 'l_pole',     x: -2.6, z: 7.2, h: 4.2},
      {k: 'l_truck',    x: 2.6,  z: 6.6, h: 2.6},
      {k: 'l_fence',    x: -3.6, z: 5.6, h: 2.3},
      {k: 'l_car',      x: .4,   z: 5.3, h: 1.5},
      {k: 'l_dumpster', x: -2.2, z: 4.2, h: 1.4},
      {k: 'l_cones',    x: 2.4,  z: 3.3, h: .7},
      {k: 'l_chairs',   x: 1.0,  z: 3.1, h: 1.1},
      {k: 'l_cart',     x: 3.6,  z: 2.6, h: 1.3},
    ],
    spots: {decks: {x: 1.6, z: 4.5}, floor: {x: -1.0, z: 3.9}, bar: {x: 2.4, z: 5.5}, arch: {x: -3.0, z: 4.6}, left: {x: -1.4, z: 4.7}},
    extras: [{x: -4.2, z: 3.7, face: 1, h: 1.78, pair: 1}, {x: -3.4, z: 3.7, face: -1, h: 1.74, pair: 1}, {x: 4.4, z: 5.2, face: -1, h: 1.8}, {x: -0.6, z: 6.9, face: 1, h: 1.76}, {x: 3.2, z: 7.2, face: -1, h: 1.86}],
    lights: [{x: -2.55, y: 4.0, z: 7.15, col: '255,150,40', to: {x: -1.2, z: 5.0}}, {x: 2.6, y: 1.9, z: 6.5, col: '255,210,120', to: {x: 2.2, z: 5.2}}],
    cam: {x: 0, y: 1.45, z: 0, zoom: 1},
  },
};
const ROOM_ORDER = ['booth', 'coop', 'lot'];
// the flats in play, read by a role name
const R = role => ROOMS[G.room].roles[role];

/* ---------- the briefs: what to shoot, the hint, the three checks ---------- */
// hint: sil = how big the person is in the sketch (wide / mid / tight), pos = left / center / right, props = little labels
const BRIEFS = {
  decks: {t: 'On the decks', l: '{N} at {decks}, eyes on a third, {decks} in the shot.', spot: 'decks', face: 1,
    hint: {sil: 'mid', pos: 'r', grid: 1, props: ['decks']},
    checks: [['third', 'eyes on a third', m => m.inFrame && m.thirds < .16], ['decks', '{decks} in frame', m => m.vis[R('decks')] > .5], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp]]},
  wide: {t: 'The whole room', l: 'Pull back. Small in the frame, the room around them.', spot: 'decks', face: -1,
    hint: {sil: 'wide', pos: 'c', grid: 0, props: ['top', 'big', 'bar']},
    checks: [['small', '{N} small, under 40%', m => m.inFrame && m.fill < .4], ['room', 'two of {top}, {big}, {bar}', m => [m.vis[R('top')] > .5, m.vis[R('big')] > .5, m.vis[R('bar')] > .5].filter(Boolean).length >= 2], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp]]},
  tight: {t: 'Tight portrait', l: 'Walk in or zoom. Fill the frame with them, a little air above the head.', spot: 'floor', face: 1,
    hint: {sil: 'tight', pos: 'c', grid: 1, props: []},
    checks: [['fill', 'fills the frame, over 70%', m => m.inFrame && m.fill > .7], ['air', 'a little headroom', m => m.inFrame && m.air > .01 && m.air < .2], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp]]},
  arch: {t: 'Through the doorway', l: 'Stand back. Frame them inside {frame}, focus past it.', spot: 'arch', face: 1,
    hint: {sil: 'mid', pos: 'c', grid: 0, props: ['frame']},
    checks: [['inside', 'eyes inside {frame}', m => m.inFrame && m.inArch], ['arch', '{frame} fills half the frame', m => m.vis[R('frame')] > .45], ['focus', 'sharp on {N}, {frame} soft', m => m.inFrame && m.sharp && m.blur[R('frame')] > 1.8]]},
  lead: {t: 'Lead room', l: 'They look one way. Give them space on that side.', spot: 'floor', face: 0,
    hint: {sil: 'mid', pos: 'l', grid: 1, props: []},
    checks: [['front', 'space where they look', m => m.inFrame && m.front > .5], ['size', 'a third to two thirds tall', m => m.inFrame && m.fill > .33 && m.fill < .8], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp]]},
  low: {t: 'Low angle', l: 'Crane down. Shoot up at them with {lights} in the shot.', spot: 'left', face: 1,
    hint: {sil: 'mid', pos: 'r', grid: 1, props: ['lights'], low: 1},
    checks: [['low', 'camera low, under knee height', m => m.cam.y < .85], ['lights', '{lights} in frame', m => m.vis[R('lights')] > .4], ['third', 'eyes on a third', m => m.inFrame && m.thirds < .18]]},
  ball: {t: 'Under the ball', l: '{top} up top, {N} below it.', spot: 'floor', face: -1,
    hint: {sil: 'mid', pos: 'c', grid: 1, props: ['top'], ballTop: 1},
    checks: [['ball', '{top} up in the top third', m => { const r = m.rect[R('top')]; return m.vis[R('top')] > .4 && r && r.y < m.f.y + m.f.h * .2 && (r.y + r.h * .35) < m.f.y + m.f.h * .5; }], ['under', '{N} under it', m => { const r = m.rect[R('top')]; return m.inFrame && r && Math.abs(m.eye.x - r.cx) < m.f.w * .3; }], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp]]},
  bar: {t: 'At the bar', l: '{N} by {bar}. Both in the shot, eyes on a third.', spot: 'bar', face: -1,
    hint: {sil: 'mid', pos: 'l', grid: 1, props: ['bar']},
    checks: [['bar', '{bar} in frame', m => m.vis[R('bar')] > .35], ['third', 'eyes on a third', m => m.inFrame && m.thirds < .16], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp]]},
  moment: {t: 'The jump', l: 'They jump every few seconds. Shoot at the very top.', spot: 'floor', face: 1, jump: 1,
    hint: {sil: 'mid', pos: 'c', grid: 0, props: [], jump: 1},
    checks: [['top', 'at the top of the jump', m => m.jumpT > .36 && m.jumpT < .64], ['in', 'all of them in frame', m => m.inFrame && m.whole], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp]]},
  long: {t: 'Long lens', l: 'Zoom past 50mm. {N} sharp, {decks} behind gone soft.', spot: 'floor', face: -1,
    hint: {sil: 'mid', pos: 'r', grid: 1, props: ['decks'], long: 1},
    checks: [['lens', 'over 50mm', m => m.cam.zoom >= 2.05], ['sharp', 'sharp on {N}', m => m.inFrame && m.sharp], ['soft', '{decks} gone soft', m => m.blur[R('decks')] > 1.8 && m.vis[R('decks')] > .15]]},
};
const BRIEF_ORDER = ['decks', 'wide', 'tight', 'arch', 'lead', 'low', 'ball', 'bar', 'moment', 'long'];

/* ---------- art ---------- */
const ART = {}; let ARTREADY = false;
const img = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
async function loadArt() {
  const jobs = [];
  const flats = new Set(['proscenium']); Object.values(ROOMS).forEach(r => { flats.add(r.backdrop); r.flats.forEach(f => flats.add(f.k)); });
  flats.forEach(k => jobs.push(img(`art/v2/flat/${k}.webp`).then(i => { ART[k] = i; })));
  try { META = await (await fetch('art/v2/oc/meta.json', {cache: 'no-cache'})).json(); } catch (e) { META = {}; }
  CAST.forEach(k => POSES.forEach(p => jobs.push(img(`art/v2/oc/${k}_${p}.webp`).then(i => { if (i) ART[k + '_' + p] = i; }))));
  await Promise.all(jobs); ARTREADY = true;
}

/* ---------- audio ---------- */
let AC = null; const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
function click() { const c = ac(); if (!c) return; const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * .07, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * (i < 300 ? 1 : .5); n.buffer = b; const g = c.createGain(); g.gain.value = .5; n.connect(g); g.connect(c.destination); n.start(); }
function tone(f, ms, type, vol) { const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.value = vol || .14; o.connect(g); g.connect(c.destination); const t = c.currentTime; o.start(t); g.gain.linearRampToValueAtTime(0, t + ms / 1000); o.stop(t + ms / 1000 + .02); }
const sfxStar = n => { tone(660, 90); if (n > 1) setTimeout(() => tone(880, 90), 110); if (n > 2) setTimeout(() => tone(1320, 220), 220); };
const sfxTick = () => tone(1760, 40, 'sine', .06);

/* ---------- state ---------- */
const G = {
  state: 'load', mode: 'daily', seed: 0, rnd: Math.random, room: 'booth', brief: 'decks', set: [], idx: 0, day: dayKey(),
  cam: {x: 0, y: 1.45, z: 0, zoom: 1}, want: {x: 0, y: 1.45, z: 0, zoom: 1}, par: {x: 0, y: 0}, parWant: {x: 0, y: 0},
  focusD: 4.5, focusWant: 4.5, focusFlash: 0, focusPt: null,
  subj: {oc: 'mars', x: 0, z: 5, face: 1, pose: 'idle', t: 0, jump: 0, jumpT: -1, bob: 0}, crowd: ['rin', 'lena', 'nyx', 'kuro', 'cinder', 'bala', 'putty'], castQ: [],
  frame: {x: 0, y: 0, w: 0, h: 0}, checks: [false, false, false], lastM: null, tut: load('tut', {}), quality: 2, fps: 60, frames: 0, lastQ: 0,
};
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  const inShot = G.state === 'shoot' || G.state === 'grade';
  const door = G.state === 'title' || G.state === 'done';
  const top = sat + (inShot ? 66 : door ? 56 : 24), bottom = inShot ? 214 : door ? 330 : 24;
  let fw = W - (inShot ? 12 : 24), fh = fw * 1.25; const maxH = H - top - bottom; if (fh > maxH) { fh = maxH; fw = fh / 1.25; } if (door && fh < 220) { fh = 220; fw = fh / 1.25; }
  G.frame = {x: (W - fw) / 2, y: inShot || door ? top : top + (maxH - fh) / 2, w: fw, h: fh};
  const vfb = $('#vfb'); if (vfb) vfb.hidden = !door;
  document.documentElement.style.setProperty('--fb', (G.frame.y + G.frame.h) + 'px'); document.documentElement.style.setProperty('--ft', G.frame.y + 'px');
}
addEventListener('resize', resize); resize();

/* ---------- projection ---------- */
// focal length in px: at zoom 1 a thing 1 unit tall, 1 unit away, covers 1.1 frame heights (so a person 4 units away is half the frame)
const focal = () => G.frame.h * 1.1 * G.cam.zoom;
const camX = () => G.cam.x + G.par.x, camY = () => G.cam.y + G.par.y;
function proj(x, y, z) { const d = z - G.cam.z; if (d < .15) return null; const F = focal(), f = G.frame; return {x: f.x + f.w / 2 + (x - camX()) * F / d, y: f.y + f.h / 2 - (y - camY()) * F / d, s: F / d, d}; }
// a flat's rectangle on screen (bottom-center anchored on the floor, or top-anchored when it hangs)
function flatRect(fl) {
  const im = ART[fl.k]; if (!im) return null;
  const w = fl.h * im.width / im.height; const yb = fl.hang ? fl.top - fl.h : 0;
  const p = proj(fl.x, yb, fl.z); if (!p) return null;
  const hpx = fl.h * p.s, wpx = w * p.s; return {x: p.x - wpx / 2, y: p.y - hpx, w: wpx, h: hpx, cx: p.x, cy: p.y - hpx / 2, d: p.d, im};
}
function subjRect() {
  const S = G.subj, im = ART[S.oc + '_' + S.pose]; if (!im) return null;
  const h = 1.84, w = h * im.width / im.height; const lift = S.jump > 0 ? Math.sin(S.jump * Math.PI) * .75 : 0;
  const p = proj(S.x, lift + S.bob, S.z); if (!p) return null;
  const hpx = h * p.s, wpx = w * p.s; const key = S.oc + '_' + S.pose; const hx = HEADX[key] || (META[key] ? META[key][2] : .5); const ex = (S.face * NAT[S.pose]) > 0 ? hx : 1 - hx;
  return {x: p.x - wpx / 2, y: p.y - hpx, w: wpx, h: hpx, cx: p.x, cy: p.y - hpx / 2, d: p.d, im, eye: {x: p.x - wpx / 2 + wpx * ex, y: p.y - hpx + hpx * .1}, feet: {x: p.x, y: p.y}};
}
// what each extra is doing: a new beat every ~8 s, seeded by who and when, pairs keep talking (drink) with a laugh (peak) now and then
function extraPose(ex, i, oc, t) {
  const beat = Math.floor((t + i * 2.9) / 8), r = (hash(oc + beat) % 100) / 100, w = (t + i * 2.9) % 8;
  let pose; if (ex.pair) pose = r < .7 ? 'drink' : r < .85 ? 'idle' : 'peak'; else pose = r < .35 ? 'idle' : r < .6 ? 'drink' : r < .85 ? 'selfie' : 'peak';
  if (pose === 'peak' && w > 1.1) pose = ex.pair ? 'drink' : 'idle'; // a laugh is a beat, not a stance
  return ART[oc + '_' + pose] ? pose : 'idle';
}
function extraRect(ex, i, now) {
  const oc = G.crowd[i]; if (!oc) return null;
  // never between the camera and the subject: closer than them and lined up with them on screen
  if (ex.z < G.subj.z - .2) { const sp = proj(G.subj.x, 0, G.subj.z), ep = proj(ex.x, 0, ex.z); if (sp && ep && Math.abs(sp.x - ep.x) < G.frame.w * .34) return null; } const t = now / 1000; const pose = extraPose(ex, i, oc, t); const im = ART[oc + '_' + pose]; if (!im) return null;
  const w = ex.h * im.width / im.height; const p = proj(ex.x, Math.sin(t * 1.3) * .012, ex.z); if (!p) return null;
  const hpx = ex.h * p.s, wpx = w * p.s; return {x: p.x - wpx / 2, y: p.y - hpx, w: wpx, h: hpx, cx: p.x, cy: p.y - hpx / 2, d: p.d, im, face: ex.face * NAT[pose]};
}
// how much of a rect sits inside the frame, 0..1 of the rect's own area
function cover(r) { const f = G.frame; if (!r) return 0; const ix = Math.max(0, Math.min(r.x + r.w, f.x + f.w) - Math.max(r.x, f.x)), iy = Math.max(0, Math.min(r.y + r.h, f.y + f.h) - Math.max(r.y, f.y)); return r.w * r.h ? ix * iy / (r.w * r.h) : 0; }
// blur radius for a thing at distance d, from the focus distance: longer lens and closer focus = thinner slice
function blurFor(d) { const fd = G.focusD; const coc = Math.abs(1 / fd - 1 / d) * 7.5 * G.cam.zoom * G.cam.zoom; return clamp(coc * 6 - .6, 0, 12); }

/* ---------- measure the frame (for the live checks and the grade) ---------- */
function measure() {
  const f = G.frame, room = ROOMS[G.room], sr = subjRect(); const m = {f, cam: G.cam, vis: {}, rect: {}, blur: {}, inFrame: false, fill: 0, thirds: 9, air: 0, front: 0, sharp: false, whole: false, inArch: false, jumpT: G.subj.jump, eye: null};
  room.flats.forEach(fl => { const r = flatRect(fl); m.rect[fl.k] = r; m.vis[fl.k] = cover(r); m.blur[fl.k] = r ? blurFor(r.d) : 99; });
  if (sr) {
    m.eye = sr.eye; m.inFrame = sr.eye.x > f.x && sr.eye.x < f.x + f.w && sr.eye.y > f.y && sr.eye.y < f.y + f.h;
    m.fill = sr.h / f.h; m.whole = sr.y >= f.y - 2 && sr.y + sr.h <= f.y + f.h + 2 && sr.x >= f.x - 2 && sr.x + sr.w <= f.x + f.w + 2;
    let best = 9; for (let i = 1; i < 3; i++) for (let j = 1; j < 3; j++) best = Math.min(best, Math.hypot(sr.eye.x - (f.x + f.w * i / 3), sr.eye.y - (f.y + f.h * j / 3)) / f.w); m.thirds = best;
    m.air = (sr.y - f.y) / f.h; m.front = G.subj.face > 0 ? (f.x + f.w - sr.eye.x) / f.w : (sr.eye.x - f.x) / f.w;
    m.sharp = blurFor(sr.d) < 1.2;
    const a = m.rect[room.roles.frame], fl = room.flats.find(x => x.k === room.roles.frame); if (a && fl && fl.opening) { const o = fl.opening; m.inArch = sr.eye.x > a.x + a.w * o[0] && sr.eye.x < a.x + a.w * o[2] && sr.eye.y > a.y + a.h * o[1] && sr.eye.y < a.y + a.h * o[3] && sr.d > a.d; }
  }
  return m;
}

/* ---------- draw ---------- */
let lastT = 0, SPARK = [];
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(.05, (now - lastT) / 1000 || 0); lastT = now; G.frames++;
  if (now - G.lastQ > 1000) { G.fps = G.frames; G.frames = 0; G.lastQ = now; if (G.fps < 24 && G.quality > 0) G.quality--; }
  if (!ARTREADY) return;
  tick(dt);
  const f = G.frame, room = ROOMS[G.room];
  cx.save(); cx.fillStyle = '#07060a'; cx.fillRect(0, 0, W, H);
  cx.beginPath(); cx.rect(f.x, f.y, f.w, f.h); cx.clip();
  // the backdrop: a painted wall far back, mirrored copies either side so a truck never shows the edge
  const bd = ART[room.backdrop]; const bp = proj(0, 0, room.bz);
  if (bd && bp) {
    const bh = room.bh * bp.s, bw = bh * bd.width / bd.height, bx = bp.x - bw / 2, by = bp.y - bh;
    cx.drawImage(bd, bx, by, bw, bh);
    cx.save(); cx.translate(bx, 0); cx.scale(-1, 1); cx.drawImage(bd, 0, by, bw, bh); cx.restore();
    cx.save(); cx.translate(bx + 2 * bw, 0); cx.scale(-1, 1); cx.drawImage(bd, 0, by, bw, bh); cx.restore();
    // the mirror ball's dots drift over the back wall (the booth only)
    if (room.ball) { cx.save(); cx.globalCompositeOperation = 'screen'; const t = now / 1000;
    for (let i = 0; i < 30; i++) { const a = i * 2.399 + t * .22; const x = bp.x + Math.cos(a) * bw * .42 * (.3 + (i % 5) / 5), y = by + bh * (.2 + .45 * (.5 + .5 * Math.sin(a * 1.31 + i))); const k = Math.max(2, bp.s * .05); cx.fillStyle = `rgba(255,170,215,${.22 + .2 * Math.sin(t * 3 + i)})`; cx.fillRect(x, y, k, k); }
    cx.restore(); }
  }
  drawFloor(room);
  // haze between the wall and the room
  cx.fillStyle = `rgba(${room.haze},${.10 + .04 * Math.sin(now / 1700)})`; cx.fillRect(f.x, f.y, f.w, f.h);
  // everything standing in the room, far to near, with the subject slotted in by depth
  const sr = subjRect(); const items = room.flats.map(fl => ({fl, r: flatRect(fl)})).filter(i => i.r);
  if (sr) items.push({subj: true, r: sr});
  (room.extras || []).forEach((ex, i) => { const r = extraRect(ex, i, now); if (r) items.push({subj: true, face: r.face, r}); });
  items.sort((a, b) => b.r.d - a.r.d);
  let hazeDone = false;
  items.forEach(it => {
    const r = it.r; if (r.x > f.x + f.w + 40 || r.x + r.w < f.x - 40 || r.y > f.y + f.h + 40) return;
    if (!hazeDone && r.d < 4.6) { hazeDone = true; cx.fillStyle = `rgba(${room.haze},.045)`; cx.fillRect(f.x, f.y, f.w, f.h); }
    const b = blurFor(r.d), blurOn = HAS_FILTER && G.quality > 0 && b > .4;
    // the floor shadow at the foot
    if (!(it.fl && it.fl.hang)) { const fy = r.y + r.h - 1; cx.save(); cx.translate(r.cx, fy); cx.scale(1, .22); const g = cx.createRadialGradient(0, 0, 0, 0, 0, r.w * .62); g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, r.w * .62, 0, 7); cx.fill(); cx.restore(); }
    cx.save();
    if (blurOn) cx.filter = `blur(${b.toFixed(1)}px)`;
    // the cut edge throws a soft shadow on whatever stands behind it
    if (G.quality > 1) { cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = 10 + 8 / Math.max(.5, r.d / 3); cx.shadowOffsetX = 5; cx.shadowOffsetY = 7; }
    if (it.subj) { cx.translate(r.cx, r.y); cx.scale(it.face || (G.subj.face * NAT[G.subj.pose]), 1); cx.drawImage(r.im, -r.w / 2, 0, r.w, r.h); }
    else cx.drawImage(r.im, r.x, r.y, r.w, r.h);
    cx.restore();
  });
  // the gels: two cones of colored light from the light tree, screened over everything
  room.lights.forEach(L => { const a = proj(L.x, L.y, L.z), b = proj(L.to.x, 0, L.to.z); if (!a || !b) return; cx.save(); cx.globalCompositeOperation = 'screen'; const g = cx.createLinearGradient(a.x, a.y, b.x, b.y); g.addColorStop(0, `rgba(${L.col},.30)`); g.addColorStop(1, `rgba(${L.col},0)`); cx.fillStyle = g; const spread = 1.1 * b.s; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x - spread, b.y + 6); cx.lineTo(b.x + spread, b.y + 6); cx.closePath(); cx.fill(); cx.restore(); });
  // the vignette
  const vg = cx.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, f.h * .35, f.x + f.w / 2, f.y + f.h / 2, f.h * .9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)'); cx.fillStyle = vg; cx.fillRect(f.x, f.y, f.w, f.h);
  // the flash sparkle when the shutter went
  SPARK = SPARK.filter(s => (s.t += dt) < s.life); SPARK.forEach(s => { cx.fillStyle = `rgba(255,255,255,${1 - s.t / s.life})`; const k = 2 + 6 * s.t / s.life; cx.fillRect(s.x - k / 2, s.y - k / 2, k, k); });
  cx.restore();
  // outside the frame: the proscenium on the door screens, the frame line, the overlays
  if (G.state === 'title' || G.state === 'album' || G.state === 'how' || G.state === 'done') { const pr = ART.proscenium; if (pr) cx.drawImage(pr, f.x - f.w * .1, f.y - f.h * .06, f.w * 1.2, f.h * 1.12); }
  cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = 1; cx.strokeRect(f.x + .5, f.y + .5, f.w - 1, f.h - 1);
  if (G.state === 'shoot') {
    const br = BRIEFS[G.brief];
    if (br.hint.grid) { cx.strokeStyle = 'rgba(255,255,255,.22)'; for (let i = 1; i < 3; i++) { cx.beginPath(); cx.moveTo(f.x + f.w * i / 3, f.y); cx.lineTo(f.x + f.w * i / 3, f.y + f.h); cx.stroke(); cx.beginPath(); cx.moveTo(f.x, f.y + f.h * i / 3); cx.lineTo(f.x + f.w, f.y + f.h * i / 3); cx.stroke(); } }
    if (G.focusFlash > 0) { G.focusFlash -= dt; const p = G.focusPt; if (p) { const a = clamp(G.focusFlash * 2, 0, 1); cx.strokeStyle = `rgba(255,212,121,${a})`; cx.lineWidth = 2; const k = 26 + (1 - a) * 10; cx.strokeRect(p.x - k, p.y - k, k * 2, k * 2); } }
    cx.strokeStyle = '#ff79c6'; cx.lineWidth = 3; const L = 20; [[f.x, f.y, 1, 1], [f.x + f.w, f.y, -1, 1], [f.x, f.y + f.h, 1, -1], [f.x + f.w, f.y + f.h, -1, -1]].forEach(([x, y, dx, dy]) => { cx.beginPath(); cx.moveTo(x, y + dy * L); cx.lineTo(x, y); cx.lineTo(x + dx * L, y); cx.stroke(); });
    liveChecks();
  }
}
function drawFloor(room) {
  const f = G.frame, F = focal(), cy = camY();
  // the floor meets the far wall at the wall's foot; it runs forward to just in front of the camera
  const yAt = d => f.y + f.h / 2 + cy * F / d; const far = yAt(room.bz - G.cam.z), near = f.y + f.h;
  if (far < near) {
    const g = cx.createLinearGradient(0, far, 0, near); g.addColorStop(0, room.floor[0]); g.addColorStop(.5, room.floor[1]); g.addColorStop(1, room.floor[2]);
    cx.fillStyle = g; cx.fillRect(f.x, far, f.w, near - far);
    // planks: seams across at whole depths, converging seams along z
    cx.strokeStyle = 'rgba(0,0,0,.16)'; cx.lineWidth = 1;
    for (let z = Math.ceil(G.cam.z + .3); z <= room.bz; z += 1) { const y = yAt(z - G.cam.z); if (y < far) continue; cx.beginPath(); cx.moveTo(f.x, y); cx.lineTo(f.x + f.w, y); cx.stroke(); }
    for (let x = -8; x <= 8; x += 1) { const a = proj(x, 0, room.bz), b = proj(x, 0, G.cam.z + .3); if (!a || !b) continue; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
    // the warm pool under the booth and the two gel pools
    const pools = [{x: room.pool.x, z: room.pool.z, col: room.pool.col, r: 2.6}].concat(room.lights.map(L => ({x: L.to.x, z: L.to.z, col: L.col, r: 1.4})));
    cx.save(); cx.globalCompositeOperation = 'screen';
    pools.forEach(p => { const c = proj(p.x, 0, p.z); if (!c) return; const rx = p.r * c.s; cx.save(); cx.translate(c.x, c.y); cx.scale(1, .28); const gr = cx.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${p.col},.26)`); gr.addColorStop(1, `rgba(${p.col},0)`); cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, rx, 0, 7); cx.fill(); cx.restore(); });
    cx.restore();
    cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(f.x, far - 1, f.w, 2);
  }
}
function tick(dt) {
  const k = 1 - Math.pow(.001, dt);
  G.cam.x = lerp(G.cam.x, G.want.x, k); G.cam.y = lerp(G.cam.y, G.want.y, k); G.cam.z = lerp(G.cam.z, G.want.z, k); G.cam.zoom = lerp(G.cam.zoom, G.want.zoom, k);
  G.par.x = lerp(G.par.x, G.parWant.x, k * .6); G.par.y = lerp(G.par.y, G.parWant.y, k * .6);
  if (G.state === 'shoot' && (G.frames & 3) === 0) document.documentElement.style.setProperty('--lx', (50 + G.par.x * 120).toFixed(1) + '%');
  G.focusD = lerp(G.focusD, G.focusWant, k);
  const S = G.subj; S.t += dt; S.bob = Math.sin(S.t * 1.7) * .012;
  if (BRIEFS[G.brief] && BRIEFS[G.brief].jump && G.state === 'shoot') { S.jumpT += dt / 1.0; if (S.jumpT > 1.9) S.jumpT = -1.3; S.jump = S.jumpT > 0 && S.jumpT < 1 ? S.jumpT : 0; S.pose = S.jumpT > .2 && S.jumpT < .8 ? 'peak' : 'idle'; }
  else { S.jump = 0; S.jumpT = 0; const w = S.t % 14; const want = w > 12.6 ? 'peak' : (w > 6 && w < 10) ? 'drink' : 'idle'; S.pose = ART[S.oc + '_' + want] ? want : 'idle'; }
  if (G.state === 'title' || G.state === 'how' || G.state === 'done') { const t = S.t; G.want.x = Math.sin(t * .17) * .9; G.want.y = 1.4 + Math.sin(t * .11) * .25; G.want.z = -.4 + Math.sin(t * .07) * .5; G.want.zoom = 1.05; }
}
function liveChecks() {
  const m = measure(); G.lastM = m; const br = BRIEFS[G.brief]; if (performance.now() - G.briefT < 700) return; // the camera is still gliding into place
  br.checks.forEach((c, i) => { let ok = false; try { ok = !!c[2](m); } catch (e) {} if (ok !== G.checks[i]) { G.checks[i] = ok; const el = $$('#checks .ck')[i]; if (el) { el.classList.toggle('ok', ok); if (ok) sfxTick(); } } });
  const all = G.checks.every(Boolean); if (all !== G.ready) { G.ready = all; $('#shutter').classList.toggle('ready', all); if (all) { tone(1320, 160, 'sine', .1); buzz([12, 30, 12]); } }
}

/* ---------- input: drag trucks and cranes, the edges walk and zoom, a tap pulls focus, the phone tilts the diorama ---------- */
let ptr = null, moved = false;
cv.addEventListener('pointerdown', e => { if (G.state !== 'shoot') return; ptr = {x: e.clientX, y: e.clientY, cx: G.want.x, cy: G.want.y, id: e.pointerId}; moved = false; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
cv.addEventListener('pointermove', e => {
  if (!ptr || G.state !== 'shoot') return; const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; if (Math.hypot(dx, dy) > 6) moved = true;
  const F = focal(); const d = Math.max(1.2, G.subj.z - G.cam.z); // a drag moves the world under the thumb at the subject's depth
  G.want.x = clamp(ptr.cx - dx * d / F, -2.6, 2.6); G.want.y = clamp(ptr.cy + dy * d / F, .3, 3.0);
});
const ptrEnd = e => { if (ptr && !moved && G.state === 'shoot') focusAt(e.clientX, e.clientY); ptr = null; }; cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', () => { ptr = null; });
function focusAt(x, y) {
  const f = G.frame; if (x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return;
  const room = ROOMS[G.room]; let hit = null;
  const sr = subjRect(); if (sr && x > sr.x && x < sr.x + sr.w && y > sr.y && y < sr.y + sr.h) hit = sr;
  room.flats.forEach(fl => { const r = flatRect(fl); if (r && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h && (!hit || r.d < hit.d)) hit = r; });
  (room.extras || []).forEach((ex, i) => { const r = extraRect(ex, i, performance.now()); if (r && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h && (!hit || r.d < hit.d)) hit = r; });
  G.focusWant = hit ? hit.d : (G.subj.z - G.cam.z); G.focusPt = {x, y}; G.focusFlash = .5; buzz(8); paintDials();
}
// a dial: drag around its center, one full turn sweeps the whole range, a tick and a buzz every notch (like a real knob)
function dial(el, get, set, range) {
  let st = null; const ang = e => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  el.addEventListener('pointerdown', e => { if (G.state !== 'shoot') return; st = {a: ang(e), v: get(), cum: 0, notch: 0}; try { el.setPointerCapture(e.pointerId); } catch (x) {} el.classList.add('live'); });
  el.addEventListener('pointermove', e => { if (!st) return; const a = ang(e); let d = a - st.a; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; st.a = a; st.cum += d; set(st.v + st.cum / (2 * Math.PI) * range); const n = Math.round(st.cum / (Math.PI / 12)); if (n !== st.notch) { st.notch = n; buzz(4); sfxKnob(); } paintDials(); });
  const end = () => { st = null; el.classList.remove('live'); }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
dial($('#zoomer'), () => G.want.zoom, v => { G.want.zoom = clamp(v, 1, 2.6); }, 1.6);
dial($('#walker'), () => G.want.z, v => { G.want.z = clamp(v, -1.6, 2.4); }, 4);
const sfxKnob = () => tone(2600, 18, 'square', .025);
function paintDials() {
  $('#zoomt').textContent = Math.round(24 * G.want.zoom) + 'mm'; $('#walkt').textContent = G.want.z > 1.2 ? 'close' : G.want.z < -.8 ? 'back' : G.want.z > .4 ? 'in' : G.want.z < -.3 ? 'out' : 'door';
  $('#zoomer i').style.transform = `rotate(${-150 + (G.want.zoom - 1) / 1.6 * 300}deg)`; $('#walker i').style.transform = `rotate(${-150 + (G.want.z + 1.6) / 4 * 300}deg)`;
  const fd = Math.max(.3, G.focusWant); $('#lcd-f').textContent = (fd < 1.5 ? fd.toFixed(1) : Math.round(fd)) + 'm'; $('#lcd-ap').textContent = 'f/' + (G.want.zoom > 2 ? '2.8' : G.want.zoom > 1.4 ? '2' : '1.4');
}
addEventListener('deviceorientation', e => { if (e.gamma == null) return; const g = clamp(e.gamma, -30, 30) / 30, b = clamp((e.beta || 45) - 45, -30, 30) / 30; G.parWant.x = g * .22; G.parWant.y = -b * .12; });
addEventListener('mousemove', e => { if (ptr || 'ontouchstart' in window) return; G.parWant.x = (e.clientX / W - .5) * .3; G.parWant.y = -(e.clientY / H - .5) * .16; });
$$('.hgt').forEach(b => b.addEventListener('click', () => { G.want.y = +b.dataset.y; $$('.hgt').forEach(x => x.setAttribute('aria-pressed', String(x === b))); buzz(8); }));

/* ---------- the shot ---------- */
$('#shutter').addEventListener('click', () => { if (G.state === 'shoot') shoot(); });
function snapshot(w, h) { const o = document.createElement('canvas'); o.width = w; o.height = h; const oc = o.getContext('2d'); const f = G.frame; oc.drawImage(cv, f.x * DPR, f.y * DPR, f.w * DPR, f.h * DPR, 0, 0, w, h); return o; }
function shoot() {
  const m = G.lastM || measure(); const br = BRIEFS[G.brief]; const passed = br.checks.map(c => { try { return !!c[2](m); } catch (e) { return false; } }); const n = passed.filter(Boolean).length; const stars = n >= 3 ? 3 : n === 2 ? 2 : 1;
  const pic = snapshot(540, 675); const data = pic.toDataURL('image/jpeg', .8);
  G.state = 'grade'; click(); buzz(14);
  const w = $('#white'); w.style.transition = 'none'; w.style.opacity = .85; requestAnimationFrame(() => { w.style.transition = 'opacity .35s'; w.style.opacity = 0; });
  const f = G.frame; for (let i = 0; i < 14; i++) SPARK.push({x: f.x + Math.random() * f.w, y: f.y + Math.random() * f.h, t: 0, life: .3 + Math.random() * .4});
  const shot = {d: data, t: ROOMS[G.room].titles[G.brief] || br.t, s: stars, when: Date.now(), room: G.room, oc: G.subj.oc, day: G.day, mode: G.mode, ok: passed};
  const album = load('album', []); album.push(shot); while (album.length > 60) { const i = album.findIndex(x => x.s < 3); album.splice(i < 0 ? 0 : i, 1); } if (!save('album', album)) { album.splice(0, 10); save('album', album); }
  // the books: stars bank toward pulls in the Crypt (ten stars = a pull)
  const bank = load('bank', 0) + stars; save('bank', bank % 10); if (Math.floor(bank / 10)) { save('pulls', load('pulls', 0) + 1); try { localStorage.setItem('otp-play-pulls', JSON.stringify((JSON.parse(localStorage.getItem('otp-play-pulls') || '0') | 0) + 1)); } catch (e) {} }
  save('shots', load('shots', 0) + 1); save('stars', load('stars', 0) + stars);
  if (G.mode === 'daily') { const dd = load('daily', {}); const rec = dd[G.day] || {}; rec[G.brief] = Math.max(rec[G.brief] || 0, stars); dd[G.day] = rec; save('daily', dd); }
  setTimeout(() => develop(shot, passed), 380);
}
function develop(shot, passed) {
  const br = BRIEFS[G.brief]; const d = $('#dev'); d.querySelector('.pol img').src = shot.d; d.querySelector('.pol b').textContent = shot.t;
  d.querySelector('.stars').innerHTML = [1, 2, 3].map(i => `<i class="${i <= shot.s ? 'on' : ''}">★</i>`).join('');
  const N = NAMES[shot.oc] || 'them', words = ROOMS[G.room].words; d.querySelector('.why').innerHTML = br.checks.map((c, i) => `<span class="${passed[i] ? 'ok' : ''}">${passed[i] ? '✓' : '·'} ${c[1].replace(/\{(\w+)\}/g, (_, w) => w === 'N' ? N : (words[w] || w))}</span>`).join('');
  d.querySelector('.tip').textContent = shot.s === 3 ? 'All three. That one goes on the wall.' : shot.s === 2 ? 'Two of three. A keeper, one thing to fix.' : 'It is a photo. Open the hint and shoot it again, or move on.';
  d.hidden = false; requestAnimationFrame(() => d.classList.add('on')); setTimeout(() => sfxStar(shot.s), 500);
  $('#dev-again').onclick = () => { d.classList.remove('on'); setTimeout(() => { d.hidden = true; G.state = 'shoot'; }, 200); };
  $('#dev-next').onclick = () => { d.classList.remove('on'); setTimeout(() => { d.hidden = true; nextBrief(); }, 200); };
}

/* ---------- briefs ---------- */
function setBrief(k) {
  G.brief = k; G.briefT = performance.now(); const br = BRIEFS[k], room = ROOMS[G.room], r = G.rnd;
  // a different subject each brief: the roster shuffled into a queue, the other seven fill the room
  if (!G.castQ.length) { G.castQ = CAST.slice(); for (let i = G.castQ.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [G.castQ[i], G.castQ[j]] = [G.castQ[j], G.castQ[i]]; } }
  const oc = G.castQ.shift(); G.crowd = CAST.filter(x => x !== oc);
  const sp = room.spots[br.spot]; Object.assign(G.subj, {oc, x: sp.x + (r() - .5) * .3, z: sp.z, face: br.face || (r() < .5 ? 1 : -1), pose: 'idle', jumpT: -1.2, jump: 0, t: 0});
  // the camera opens a step to the side of them, on the side away from the doorway flat so the first look is clear
  // open on the clear side: every room's shoot-through flat stands on the left, so the camera starts to the right of them unless they are already far right
  const side = G.subj.x > 2 ? -1 : 1;
  Object.assign(G.want, {x: clamp(G.subj.x + side * (.8 + r() * .7), -2.6, 2.6), y: room.cam.y, z: k === 'arch' ? -1.2 : room.cam.z, zoom: 1});
  G.focusWant = G.subj.z - G.want.z; G.checks = [false, false, false];
  const N = NAMES[oc]; const say = x => x.replace(/\{(\w+)\}/g, (_, w) => w === 'N' ? N : (room.words[w] || w));
  $('#b-t').textContent = room.titles[k] || br.t; $('#b-l').textContent = say(br.l); $('#lcd-room').textContent = room.name; $('#b-n').textContent = G.mode === 'daily' ? `${G.idx + 1} of ${G.set.length}` : `free · ${G.idx + 1}`;
  $('#checks').innerHTML = br.checks.map(c => `<span class="ck"><i></i>${say(c[1])}</span>`).join('');
  $$('.hgt').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.y === room.cam.y)));
  drawHint(br); paintDials(); drawAvatar(oc); G.ready = false; $('#shutter').classList.remove('ready');
  const bt = $('#btoast'); bt.querySelector('b').textContent = br.t; bt.querySelector('span').textContent = N + ' · ' + say(br.l); bt.classList.add('on'); clearTimeout(G.toastT); G.toastT = setTimeout(() => bt.classList.remove('on'), 1500);
  const first = !G.tut[k]; $('#hint').classList.toggle('open', first || !!load('hintopen', 1)); G.tut[k] = 1; save('tut', G.tut);
  G.state = 'shoot'; resize();
}
function drawAvatar(oc) { // the subject's head in the brief chip
  const c = $('#b-av'), o = c.getContext('2d'), im = ART[oc + '_idle']; o.clearRect(0, 0, 88, 88); if (!im) return; const hx = HEADX[oc + '_idle'] || .5;
  const side = im.height * .3; const sx = clamp(im.width * hx - side / 2, 0, Math.max(0, im.width - side)); o.fillStyle = '#1a1921'; o.fillRect(0, 0, 88, 88); o.drawImage(im, sx, 0, side, side, 0, 0, 88, 88);
}
function drawHint(br) {
  // a tiny photo of the shot you are after: the real backdrop, the real flats for the parts named, the subject's own cutout
  const c = $('#hint canvas'), h = br.hint; const w = c.width = 240, hh = c.height = 300; const o = c.getContext('2d'); const room = ROOMS[G.room];
  const bd = ART[room.backdrop]; if (bd) { const bw = hh * bd.width / bd.height * .9, bh = hh * .9; o.drawImage(bd, w / 2 - bw / 2, -hh * .1, bw, bh); } else { o.fillStyle = '#1a1921'; o.fillRect(0, 0, w, hh); }
  const fg = o.createLinearGradient(0, hh * .55, 0, hh); fg.addColorStop(0, room.floor[0]); fg.addColorStop(1, room.floor[2]); o.fillStyle = fg; o.fillRect(0, hh * .62, w, hh * .38);
  o.fillStyle = `rgba(${room.haze},.18)`; o.fillRect(0, 0, w, hh);
  // the parts the brief names, as their own flats
  const pb = {decks: [w * .5, hh * .9, .32], top: [w * .5, hh * .26, .26], big: [w * .86, hh * .85, .38], lights: [w * .14, hh * .82, .5], bar: [w * .2, hh * .88, .42], frame: [w * .5, hh * 1.02, 1.08]};
  (h.props || []).forEach(p => { const fl = ART[room.roles[p]], b = pb[p]; if (!fl || !b) return; const fh = hh * b[2], fw = fh * fl.width / fl.height; o.save(); o.shadowColor = 'rgba(0,0,0,.5)'; o.shadowBlur = 8; o.shadowOffsetY = 4; if (p === 'top') o.drawImage(fl, b[0] - fw / 2, b[1] - fh * .5, fw, fh); else o.drawImage(fl, b[0] - fw / 2, b[1] - fh, fw, fh); o.restore(); });
  // the subject, their own cutout, glowing pink where the brief wants them
  const size = {wide: .3, mid: .62, tight: 1.1}[h.sil]; const ph = hh * size; const px = {l: w * .34, c: w * .5, r: w * .66}[h.pos]; let py = hh * .92 - ph + (h.sil === 'tight' ? ph * .32 : 0); if (h.ballTop) py = hh * .5 - ph * .25; if (h.jump) py -= hh * .14;
  const im = ART[G.subj.oc + '_idle']; if (im) { const pw = ph * im.width / im.height; o.save(); o.shadowColor = '#ff79c6'; o.shadowBlur = 16; o.translate(px, py); if (h.pos === 'l') o.scale(-1, 1); o.drawImage(im, -pw / 2, 0, pw, ph); o.restore(); }
  if (h.grid) { o.strokeStyle = 'rgba(255,212,121,.55)'; o.lineWidth = 1; for (let i = 1; i < 3; i++) { o.beginPath(); o.moveTo(w * i / 3, 0); o.lineTo(w * i / 3, hh); o.stroke(); o.beginPath(); o.moveTo(0, hh * i / 3); o.lineTo(w, hh * i / 3); o.stroke(); } const key = G.subj.oc + '_idle'; const hx = HEADX[key] || .5; if (im) { const pw = ph * im.width / im.height; const ex = px + (h.pos === 'l' ? -(hx - .5) : (hx - .5)) * pw, ey = py + ph * .1; o.fillStyle = '#ffd479'; o.beginPath(); o.arc(ex, ey, 5, 0, 7); o.fill(); o.strokeStyle = '#ffd479'; o.lineWidth = 2; o.beginPath(); o.arc(ex, ey, 10, 0, 7); o.stroke(); } }
  if (h.pos === 'l' && !h.low) { o.strokeStyle = '#ffd479'; o.lineWidth = 3; o.beginPath(); o.moveTo(w * .55, hh * .42); o.lineTo(w * .9, hh * .42); o.lineTo(w * .82, hh * .36); o.moveTo(w * .9, hh * .42); o.lineTo(w * .82, hh * .48); o.stroke(); }
  const note = h.low ? 'CAMERA LOW, SHOOT UP' : h.long ? 'ZOOM PAST 50MM' : h.jump ? 'SHOOT THE TOP OF THE JUMP' : h.pos === 'l' ? 'ROOM ON THE SIDE THEY FACE' : h.sil === 'wide' ? 'PULL BACK, THEM SMALL' : h.sil === 'tight' ? 'WALK IN, FILL THE FRAME' : h.ballTop ? (room.words.top + ' UP TOP').toUpperCase() : (h.props && h.props[0] ? ('WITH ' + room.words[h.props[0]]).toUpperCase() : 'EYES ON A THIRD');
  o.fillStyle = 'rgba(10,10,13,.82)'; o.fillRect(0, hh - 26, w, 26); o.fillStyle = '#ffd479'; o.font = '700 11px JetBrains Mono, monospace'; o.textAlign = 'center'; o.fillText(note, w / 2, hh - 9);
  o.strokeStyle = 'rgba(255,255,255,.5)'; o.lineWidth = 2; o.strokeRect(1, 1, w - 2, hh - 2);
}
function drawHintOld(br) {
  const c = $('#hint canvas'), h = br.hint; const w = c.width = 120, hh = c.height = 150; const o = c.getContext('2d');
  o.fillStyle = '#1a1921'; o.fillRect(0, 0, w, hh); o.strokeStyle = '#6d6775'; o.strokeRect(.5, .5, w - 1, hh - 1);
  if (h.grid) { o.strokeStyle = 'rgba(255,255,255,.25)'; for (let i = 1; i < 3; i++) { o.beginPath(); o.moveTo(w * i / 3, 0); o.lineTo(w * i / 3, hh); o.stroke(); o.beginPath(); o.moveTo(0, hh * i / 3); o.lineTo(w, hh * i / 3); o.stroke(); } }
  // props as blocks with labels
  o.font = '700 8px JetBrains Mono, monospace'; o.textAlign = 'center';
  const pb = {decks: [18, 86, 84, 30], top: [42, 8, 36, 36], big: [88, 50, 26, 60], lights: [8, 30, 26, 80], bar: [4, 56, 50, 64], frame: [10, 6, 100, 138]};
  const words = ROOMS[G.room].words;
  (h.props || []).forEach(p => { const b = pb[p]; if (!b) return; const label = (words[p] || p).replace(/^the /, '').toUpperCase().slice(0, 9); if (p === 'frame') { o.lineWidth = 7; o.strokeStyle = '#b86a4a'; o.strokeRect(b[0], b[1], b[2], b[3]); o.lineWidth = 1; } else { o.fillStyle = 'rgba(255,255,255,.12)'; o.fillRect(b[0], b[1], b[2], b[3]); o.strokeStyle = 'rgba(255,255,255,.45)'; o.strokeRect(b[0] + .5, b[1] + .5, b[2], b[3]); } o.fillStyle = '#ddd5e2'; o.fillText(label, b[0] + b[2] / 2, p === 'frame' ? 16 : b[1] + b[3] / 2 + 3); });
  // the person: a pink silhouette, sized and placed by the brief
  const size = {wide: .3, mid: .62, tight: 1.05}[h.sil]; const ph = hh * size, pw = ph * .36; const px = {l: w * .3, c: w * .5, r: w * .68}[h.pos]; let py = hh - 8 - ph + (h.sil === 'tight' ? ph * .3 : 0); if (h.ballTop) py = hh * .5 - ph * .3; if (h.jump) py -= 22;
  o.fillStyle = '#ff79c6'; o.beginPath(); o.arc(px, py + ph * .1, ph * .1, 0, 7); o.fill(); o.beginPath(); if (o.roundRect) o.roundRect(px - pw / 2, py + ph * .2, pw, ph * .8, 4); else o.rect(px - pw / 2, py + ph * .2, pw, ph * .8); o.fill();
  if (h.grid) { o.fillStyle = '#ffd479'; o.beginPath(); o.arc(px, py + ph * .1, 3, 0, 7); o.fill(); }
  o.fillStyle = '#ffd479';
  if (h.low) o.fillText('CAMERA LOW', w / 2, hh - 4);
  if (h.long) o.fillText('ZOOM 50mm+', w / 2, hh - 4);
  if (h.jump) o.fillText('TOP OF THE JUMP', w / 2, hh - 4);
  if (h.pos === 'l' && !h.low) { o.fillText('SPACE THIS WAY', w * .68, hh * .3); }
}
function nextBrief() {
  G.idx += 1;
  if (G.idx >= G.set.length) { if (G.mode === 'daily') { endDaily(); return; } G.set.push(BRIEF_ORDER[Math.floor(G.rnd() * BRIEF_ORDER.length)]); }
  setBrief(G.set[G.idx]);
}
$('#skip').addEventListener('click', () => { if (G.state === 'shoot') nextBrief(); });
$('#coach-ok').addEventListener('click', () => { $('#coach').hidden = true; save('coach', 1); G.state = 'shoot'; });
$('#hint-tab').addEventListener('click', () => { const h = $('#hint'); h.classList.toggle('open'); save('hintopen', h.classList.contains('open') ? 1 : 0); });

/* ---------- a session ---------- */
function start(mode) {
  G.mode = mode; G.day = dayKey(); G.seed = mode === 'daily' ? hash('v2' + G.day) : (Math.random() * 1e9) >>> 0; G.rnd = rng(G.seed);
  G.room = mode === 'daily' ? ROOM_ORDER[hash('room' + G.day) % ROOM_ORDER.length] : (load('room', 'booth')); if (!ROOMS[G.room]) G.room = 'booth'; G.idx = 0; G.castQ = [];
  // the daily opens on the decks (the easy one), then five drawn from the rest; free play draws one at a time
  const pool = BRIEF_ORDER.slice(1); const pick = mode === 'daily' ? ['decks'] : []; while (pick.length < (mode === 'daily' ? 6 : 1)) pick.push(pool.splice(Math.floor(G.rnd() * pool.length), 1)[0]); G.set = pick;
  $$('.scr').forEach(s => s.hidden = true); $('#hud').hidden = false; ac();
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().catch(() => {});
  Object.assign(G.cam, ROOMS[G.room].cam); G.par = {x: 0, y: 0};
  setBrief(G.set[0]);
  if (!load('coach', 0)) { $('#coach').hidden = false; G.state = 'coach'; }
}
function endDaily() {
  const dd = load('daily', {}), rec = dd[G.day] || {}; const total = G.set.reduce((a, k) => a + (rec[k] || 0), 0);
  $('#d-stars').textContent = total; $('#d-line').textContent = `of ${G.set.length * 3} stars today`;
  $('#d-grid').innerHTML = G.set.map(k => `<div><b>${BRIEFS[k].t}</b><span>${'★'.repeat(rec[k] || 0)}<i>${'★'.repeat(3 - (rec[k] || 0))}</i></span></div>`).join('');
  $('#hud').hidden = true; $('#s-done').hidden = false; G.state = 'done'; resize();
}
function toTitle() { $$('.scr').forEach(s => s.hidden = true); $('#hud').hidden = true; $('#s-title').hidden = false; G.state = 'title'; paintTitle(); resize(); const ds = $('#s-title .ds'); if (ds) ds.scrollTop = 0; }
function paintTitle() {
  const album = load('album', []); $('#t-shots').textContent = album.length; $('#t-stars').textContent = load('stars', 0); $('#t-pulls').textContent = load('pulls', 0);
  const dd = load('daily', {}), rec = dd[dayKey()]; const got = rec ? Object.values(rec).reduce((a, b) => a + b, 0) : 0;
  $('#daily-sub').textContent = rec ? `today ${got} stars so far · the same six for everyone` : 'six shots, the same six for everyone today';
  const todays = ROOM_ORDER[hash('room' + dayKey()) % ROOM_ORDER.length]; G.room = todays;
  $('#daily-tag').textContent = 'Today: ' + ROOMS[todays].name + ' · ' + new Date().toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  const picked = load('room', 'booth'); $$('.roomchip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.room === picked)));
  const sp = ROOMS[todays].spots.decks; Object.assign(G.subj, {oc: 'mars', x: sp.x, z: sp.z, face: 1}); G.crowd = CAST.filter(x => x !== 'mars'); G.focusWant = sp.z + .4;
}

/* ---------- the album: a scrapbook of polaroids ---------- */
function openAlbum() {
  const album = load('album', []).slice().reverse(); const g = $('#album');
  g.innerHTML = album.length ? album.map((s, i) => `<button type="button" class="pol" data-i="${i}" style="--r:${((i * 7) % 9 - 4) * .8}deg"><img src="${s.d}" alt=""><b>${s.t}</b><span>${'★'.repeat(s.s)}</span></button>`).join('') : '<p class="empty">Nothing developed yet. Shoot the booth and your photos land here.</p>';
  $('#album-sub').textContent = album.length ? `${album.length} photo${album.length > 1 ? 's' : ''} · ${load('stars', 0)} stars` : 'your photos';
  $$('.scr').forEach(s => s.hidden = true); $('#s-album').hidden = false; G.state = 'album'; resize();
  g.onclick = e => { const b = e.target.closest('.pol'); if (!b) return; viewShot(album[+b.dataset.i], album.length - 1 - +b.dataset.i); };
}
function viewShot(s, realIdx) {
  const v = $('#view'); v.querySelector('img').src = s.d; v.querySelector('b').textContent = s.t; v.querySelector('.stars').innerHTML = [1, 2, 3].map(i => `<i class="${i <= s.s ? 'on' : ''}">★</i>`).join('');
  v.querySelector('small').textContent = `${NAMES[s.oc] || 'Mars'} · ${ROOMS[s.room] ? ROOMS[s.room].name : s.room} · ${new Date(s.when).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`;
  v.hidden = false;
  $('#v-share').onclick = () => sharePhoto(s); $('#v-del').onclick = () => { const a = load('album', []); a.splice(realIdx, 1); save('album', a); v.hidden = true; openAlbum(); }; $('#v-close').onclick = () => { v.hidden = true; };
}
async function sharePhoto(s) {
  const o = document.createElement('canvas'); o.width = 1080; o.height = 1350; const c = o.getContext('2d');
  c.fillStyle = '#f3ede2'; c.fillRect(0, 0, 1080, 1350);
  const im = await img(s.d); if (im) c.drawImage(im, 60, 60, 960, 1200);
  c.fillStyle = '#1a1921'; c.font = '900 italic 60px Saira Condensed, Impact, sans-serif'; c.fillText(s.t.toUpperCase(), 60, 1318);
  c.fillStyle = '#ff79c6'; c.font = '700 44px Inter, sans-serif'; c.textAlign = 'right'; c.fillText('★'.repeat(s.s), 1020, 1316);
  const blob = await new Promise(r => o.toBlob(r, 'image/jpeg', .9)); const file = new File([blob], 'get-the-shot-' + s.t.toLowerCase().replace(/\W+/g, '-') + '.jpg', {type: 'image/jpeg'});
  try { if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: 'Get the Shot', text: s.t + ' · 0fftheprint.com/play'}); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}

/* ---------- wiring ---------- */
document.addEventListener('click', e => {
  const m = e.target.closest('[data-mode]'); if (m) { start(m.dataset.mode); return; }
  const rc = e.target.closest('.roomchip'); if (rc) { save('room', rc.dataset.room); $$('.roomchip').forEach(b => b.setAttribute('aria-pressed', String(b === rc))); if (G.state === 'title') { G.room = rc.dataset.room; const sp = ROOMS[G.room].spots.decks; Object.assign(G.subj, {x: sp.x, z: sp.z}); G.focusWant = sp.z + .4; } return; }
  if (e.target.closest('[data-album]')) { openAlbum(); return; }
  if (e.target.closest('#howbtn')) { const w = ROOMS.booth.words; $('#how').innerHTML = BRIEF_ORDER.map(k => `<div><b>${BRIEFS[k].t}</b><span>${BRIEFS[k].l.replace(/\{(\w+)\}/g, (_, x) => x === 'N' ? 'the subject' : (w[x] || x))}</span></div>`).join(''); $$('.scr').forEach(s => s.hidden = true); $('#s-how').hidden = false; G.state = 'how'; resize(); return; }
  if (e.target.closest('[data-back]')) { e.preventDefault(); toTitle(); return; }
  if (e.target.closest('#quit')) { toTitle(); return; }
  if (e.target.closest('#leave')) { e.preventDefault(); try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return; } } catch (x) {} location.href = '../'; return; }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
loadArt().then(() => { toTitle(); requestAnimationFrame(draw); });
})();
