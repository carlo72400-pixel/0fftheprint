import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const code = readFileSync(new URL('./punch.js', import.meta.url), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const G = sandbox.GioPunch;

function at(y, m, d, h, mi, s) {
  const ms = G.wallToInstant(y, m, d, h, mi || 0, s || 0);
  assert.notEqual(ms, null, `missing wall time ${y}-${m}-${d} ${h}:${mi || 0}`);
  return ms;
}

function store(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    map
  };
}

test('storage keys stay on the gio-punch- prefix', () => {
  assert.match(G.STORAGE_KEY, /^gio-punch-/);
  assert.match(G.BACKUP_KEY, /^gio-punch-/);
  assert.equal(G.TZ, 'America/Chicago');
});

test('round-trips every hour on a normal Chicago day', () => {
  for (let h = 0; h < 24; h++) {
    const ms = G.wallToInstant(2026, 11, 5, h, 15, 0);
    assert.notEqual(ms, null, 'hour ' + h);
    const p = G.chicagoParts(ms);
    assert.deepEqual([p.y, p.m, p.d, p.h, p.mi], [2026, 11, 5, h, 15]);
  }
});

test('spring-forward gap is rejected and the hours around it are real', () => {
  assert.equal(G.wallToInstant(2026, 3, 8, 2, 30, 0), null);
  const inn = at(2026, 3, 8, 1, 30);
  const out = at(2026, 3, 8, 3, 30);
  assert.equal(out - inn, 60 * 60 * 1000);
});

test('fall-back overlap keeps the earlier 1:30am and a span across it is 3.5h', () => {
  const first = at(2026, 11, 1, 1, 30);
  assert.equal(new Date(first).toISOString(), '2026-11-01T06:30:00.000Z');
  const start = at(2026, 11, 1, 0, 30);
  const end = at(2026, 11, 1, 3, 0);
  assert.equal(end - start, 3.5 * 60 * 60 * 1000);
});

test('week starts Monday in Chicago, including the Sunday night UTC-tomorrow edge', () => {
  const thu = at(2026, 11, 5, 22, 25);
  assert.equal(G.formatYMD(G.weekStart(thu)), '2026-11-02');
  assert.equal(G.formatYMD(G.chicagoYMD(thu)), '2026-11-05');
  assert.notEqual(new Date(thu).toISOString().slice(0, 10), '2026-11-05');

  assert.equal(G.formatYMD(G.weekStart(at(2026, 11, 2, 0, 0))), '2026-11-02');
  assert.equal(G.formatYMD(G.weekStart(at(2026, 11, 1, 23, 59))), '2026-10-26');
  assert.equal(G.formatYMD(G.weekStart(at(2026, 11, 8, 23, 59))), '2026-11-02');
  assert.equal(G.formatYMD(G.weekStart(at(2026, 11, 9, 0, 0))), '2026-11-09');
});

test('a normal day is 8.00 and lunch splits add up', () => {
  const punches = [];
  const data = { punches };
  G.addPunch(data, 'in', at(2026, 11, 5, 9, 0), '');
  G.addPunch(data, 'out', at(2026, 11, 5, 17, 0), '');
  const week = G.weekStart(at(2026, 11, 5, 12, 0));
  const view = G.weekView(punches, week, at(2026, 11, 5, 18, 0));
  assert.equal(view.cents, 800);
  assert.equal(G.centsToFixed(view.cents), '8.00');

  const lunch = { punches: [] };
  G.addPunch(lunch, 'in', at(2026, 11, 5, 9, 0), '');
  G.addPunch(lunch, 'out', at(2026, 11, 5, 12, 0), '');
  G.addPunch(lunch, 'in', at(2026, 11, 5, 13, 0), '');
  G.addPunch(lunch, 'out', at(2026, 11, 5, 17, 0), '');
  assert.equal(G.weekView(lunch.punches, week, at(2026, 11, 5, 18, 0)).cents, 700);
});

test('open shift counts time so far and an overnight shift splits on Monday', () => {
  const data = { punches: [] };
  G.addPunch(data, 'in', at(2026, 11, 5, 9, 0), '');
  const week = G.weekStart(at(2026, 11, 5, 11, 0));
  const view = G.weekView(data.punches, week, at(2026, 11, 5, 11, 0));
  assert.equal(view.cents, 200);
  assert.match(view.days.find((d) => d.key === '2026-11-05').rows[0].note, /still on the clock/);
  assert.equal(G.isOnClock(data.punches), true);

  const cross = { punches: [] };
  G.addPunch(cross, 'in', at(2026, 11, 1, 22, 0), '');
  G.addPunch(cross, 'out', at(2026, 11, 2, 2, 0), '');
  const thisWeek = G.weekView(cross.punches, G.parseYMD('2026-11-02'), at(2026, 11, 5, 12, 0));
  const prevWeek = G.weekView(cross.punches, G.parseYMD('2026-10-26'), at(2026, 11, 5, 12, 0));
  assert.equal(thisWeek.cents, 200);
  assert.equal(prevWeek.cents, 200);
  assert.match(thisWeek.days[0].rows[0].note, /hours split at week boundary/);
});

test('csv uses Chicago dates, skips voids, marks edits, and names the Monday file', () => {
  const data = { punches: [] };
  const inn = G.addPunch(data, 'in', at(2026, 11, 5, 22, 0), '');
  const out = G.addPunch(data, 'out', at(2026, 11, 5, 23, 0), '=cmd');
  G.editPunch(data, inn.id, { at: inn.at, note: 'dock' });
  const badIn = G.addPunch(data, 'in', at(2026, 11, 4, 9, 0), '');
  const badOut = G.addPunch(data, 'out', at(2026, 11, 4, 10, 0), '');
  G.voidPunch(data, badIn.id);
  G.voidPunch(data, badOut.id);

  const week = G.parseYMD('2026-11-02');
  const now = at(2026, 11, 5, 23, 30);
  const csv = G.buildCsv(data.punches, week, now);
  assert.match(csv, /^date,in,out,hours,note\r\n/);
  assert.match(csv, /2026-11-05,/);
  assert.doesNotMatch(csv, /2026-11-06,/);
  assert.match(csv, /still on the clock|1\.00/);
  assert.match(csv, /' =cmd|'=cmd|edited/);
  assert.match(csv, /week total,,,1\.00,/);
  assert.match(csv, /Giancarlo Ortiz/);
  assert.doesNotMatch(csv, /2026-11-04,9:00 AM,10:00 AM,1\.00/);
  const lines = csv.trim().split('\r\n');
  const body = lines.slice(1, -1);
  assert.equal(body.length, 1);
  assert.match(body[0], /2026-11-05,10:00 PM,11:00 PM,1\.00,/);
  assert.match(body[0], /dock/);
  assert.match(body[0], /edited/);
  assert.match(body[0], /=cmd/);
  assert.equal(G.csvCell('=cmd'), "'=cmd");
  assert.equal(G.exportFilename(week), 'gio-hours-2026-11-02.csv');
  assert.equal(G.formatYMD(G.chicagoYMD(now)), '2026-11-05');
  assert.equal(out.note.startsWith('='), true);
});

test('void and restore round-trip, and a bad log is backed up instead of thrown away silently', () => {
  const data = { punches: [] };
  const p = G.addPunch(data, 'in', at(2026, 11, 5, 9, 0), '  hello\nthere  ');
  assert.equal(p.note, 'hello there');
  G.voidPunch(data, p.id);
  assert.equal(G.isOnClock(data.punches), false);
  const week = G.parseYMD('2026-11-02');
  const view = G.weekView(data.punches, week, at(2026, 11, 5, 12, 0));
  assert.equal(view.cents, 0);
  assert.equal(view.days.find((d) => d.key === '2026-11-05').voided.length, 1);
  G.restorePunch(data, p.id);
  assert.equal(G.isOnClock(data.punches), true);

  const memory = store({ [G.STORAGE_KEY]: '{not json' });
  const loaded = G.load(memory);
  assert.equal(loaded.punches.length, 0);
  assert.equal(memory.map.get(G.BACKUP_KEY), '{not json');
  G.save(memory, data);
  const again = G.load(memory);
  assert.equal(again.punches.length, 1);
  assert.equal(again.punches[0].note, 'hello there');
  assert.equal(again.punches[0].voided, false);
});

test('unchanged edit does not stamp the card, and a skipped hour is refused', () => {
  const data = { punches: [] };
  const p = G.addPunch(data, 'in', at(2026, 11, 5, 9, 0), 'ok');
  const same = G.editPunch(data, p.id, { at: p.at, note: 'ok' });
  assert.equal(same.ok, true);
  assert.equal(p.edited, false);
  const moved = G.editPunch(data, p.id, { at: at(2026, 11, 5, 9, 5), note: 'ok' });
  assert.equal(moved.ok, true);
  assert.equal(p.edited, true);
  const skipped = G.editPunch(data, p.id, { at: NaN, note: 'ok' });
  assert.equal(skipped.ok, false);
  assert.match(skipped.error, /daylight saving/i);
});
