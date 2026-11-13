/* THE STREET's skin on every inner page (11/12): the sound and the sound key.
 *
 * The strip itself (the back key, the place's name) is markup street_skin.py writes into the page, so it is there with
 * no script at all. This file adds what needs one:
 *
 *   THE SOUND   the street's click on every key and link you press. ON by default (his call 11/11), and never before
 *               the first tap: the sound IS the tap. One setting for the whole site, the street's own
 *               (localStorage 'st-snd', 'on' or 'off'), so muting anywhere mutes everywhere, the street included.
 *   THE KEY     one small sound key, top right of the strip, the same corner on every page. The BAG key (bag.js or
 *               binder.js, on the pages that keep a bag) sits beside it in the same holder, #sk-keys.
 *
 * It fails quiet where a phone has no sound, and says so on the console where something else goes wrong.
 * ⛔ Run stamp.py after editing. ⛔ No em dashes in copy.
 */
(function (w, d) {
  'use strict';
  if (w.__skSkin) return;
  w.__skSkin = true;
  var KEY = 'st-snd';
  function isOn() { try { return w.localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
  var on = isOn(), ac = null, out = null;

  function audio() {
    if (!ac) {
      var C = w.AudioContext || w.webkitAudioContext; if (!C) return null;
      ac = new C(); out = ac.createGain(); out.gain.value = .5; out.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f, t0, dur, type, vol, f2) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || .06, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .03);
  }
  /* the street's own two clicks: 'pick' on a key or a link, 'blip' on the sound key itself */
  var SFX = {
    pick: function () { tone(880, 0, .07, 'triangle', .06, 1320); tone(1760, .05, .06, 'sine', .03); },
    blip: function () { tone(1320, 0, .06, 'square', .05); },
    hello: function () { tone(1047, 0, .14, 'sine', .05); tone(1568, .07, .14, 'sine', .05); }
  };
  function sfx(n) { if (!on || !SFX[n]) return; try { SFX[n](); } catch (e) { console.warn('street skin: no sound on this phone', e); } }
  w.__skSfx = sfx;

  var btn = null;
  function paint() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Sound on. Tap to mute the whole site.' : 'Sound off. Tap to turn it on.');
    btn.querySelector('small').textContent = on ? 'On' : 'Off';
  }
  function set(v) {
    on = !!v;
    try { w.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { console.warn('street skin: the sound setting would not save', e); }
    paint();
  }
  w.addEventListener('storage', function (e) { if (e.key === KEY) { on = isOn(); paint(); } });

  function mount() {
    var keys = d.getElementById('sk-keys');
    if (!keys) { console.warn('street skin: this page has no strip (street_skin.py did not run on it)'); return; }
    btn = d.createElement('button');
    btn.type = 'button'; btn.className = 'sk-snd';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="on" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg><small></small>';
    btn.addEventListener('click', function () { set(!on); sfx('hello'); });
    keys.insertBefore(btn, keys.firstChild);
    paint();
  }
  /* an iPhone paints :active on a key that is not a link only when the page listens for touches (11/14). This listener
     does nothing else: the strip's sound key, the back key and every .sk-key get their press look. */
  d.addEventListener('touchstart', function () {}, { passive: true });
  /* THE CAP BEHIND THE STATUS BAR (street-skin.css): on once the page has moved, off at the very top. Its colour is
     the page's own (the body's, or the root's when the body has none); a light page keeps the stylesheet's dark. */
  var capped = false, capHue = false;
  function capColour() {
    try {
      var rx = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/, c = rx.exec(w.getComputedStyle(d.body).backgroundColor);
      if (!c || c[4] === '0') c = rx.exec(w.getComputedStyle(d.documentElement).backgroundColor);
      if (!c || c[4] === '0') return '';
      return (+c[1] * 299 + +c[2] * 587 + +c[3] * 114) / 1000 < 90 ? 'rgb(' + c[1] + ', ' + c[2] + ', ' + c[3] + ')' : '';
    } catch (e) { console.warn('street skin: the cap could not read the page colour', e); return ''; }
  }
  function cap() {
    var on = (w.pageYOffset || 0) > 2; if (on === capped) return; capped = on;
    if (on && !capHue) { capHue = true; var c = capColour(); if (c) d.documentElement.style.setProperty('--sk-cap', c); }
    d.documentElement.classList.toggle('sk-capped', on);
  }
  w.addEventListener('scroll', cap, { passive: true }); cap();
  /* the click: on the press itself, for keys and links, never for typing or the sound key (it has its own) */
  d.addEventListener('pointerdown', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('a[href], button, summary, [role="button"], input[type="submit"], input[type="button"], label[for]') : null;
    if (!t || t === btn || t.disabled) return;
    sfx('pick');
  }, true);

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', mount); else mount();
})(window, document);
