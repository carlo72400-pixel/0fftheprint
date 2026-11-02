#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""After build_oddball_1101.sh (THE ODD BALL, Justine's Brasserie, Austin, Oct 31 2026, the whole set in four looks): everything
around the gallery, in the house formats.
  1. events.json: the row goes in as TEXT at the top of main's file (the newest night). newevent.py rewrites the whole file at
     indent=2 with no final newline, and one row (Bar Hop) carries a literal middle dot, so a re-dump churns it.
  2. The pack is redrawn off the cover, a tall frame, so one picture fills the pouch (makepack.py --frames, off the staged web
     frames). A wide cover lost the top of the face under the crimp.
  3. THE WORK: one frame, first in the grid (the newest night's frames sit first).
  4. press/: the no-JS fallback words for galleries and The Work. site.json: Justine's Brasserie joins the_rooms.
  5. THE MAP: Justine's joins content/rooms.json (a restaurant open to the public, so the address and the pin, like Paper Tiger).
Run derive.py, framekeys.py and stamp.py after.
Usage: post_oddball_1101.py   (COVER / PACK2 / WORK = stems override the picks)"""
import json, os, re, subprocess, sys
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__)); EV = os.path.join(ROOT, 'events'); SLUG = '2026-10-31-the-odd-ball'
T = '/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-10-30_Halloween-Weekend'
PL = T + '/_web/plooks'
COVER = os.environ['COVER']; PACK2 = os.environ.get('PACK2'); WORK = os.environ['WORK']; ALT = os.environ['ALT']
order = json.load(open(T + '/_web/order_oddball.json'))['order']
num = lambda stem: order.index(stem) + 1

# 1. the row, as text, into main's events.json (the parsed result must equal what the build wrote, with the cover set)
p = os.path.join(EV, 'events.json'); built = json.load(open(p)); row = [e for e in built['items'] if e['slug'] == SLUG][0]
cover = f'{SLUG}/media/{num(COVER):03d}_t.jpg'; assert os.path.exists(os.path.join(EV, cover)), cover
row['cover'] = cover; assert not row.get('mini'), 'a full night, not a mini pack'
base = subprocess.run(['git', 'show', 'HEAD:events/events.json'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
assert all(e['slug'] != SLUG for e in json.loads(base)['items']), 'HEAD already lists this night'
anchor = '{\n "items": [\n'; assert base.startswith(anchor), 'events.json no longer opens the way it did'
block = '\n'.join('  ' + l for l in json.dumps(row, indent=1, ensure_ascii=True).splitlines())
out = anchor + block + ',\n' + base[len(anchor):]; assert json.loads(out) == built, 'text insert differs from the build'
open(p, 'w').write(out)
print(f"events.json: {len(built['items'])} rows ({sum(1 for e in built['items'] if not e.get('mini'))} nights + "
      f"{sum(1 for e in built['items'] if e.get('mini'))} mini), {SLUG} count {row['count']} cover {cover}")

# 2. the pack
stage = os.path.join(__import__('tempfile').gettempdir(), f'otp-stage-{SLUG}')      # the web-size frames, before the release is up
frames = f'{num(COVER)},{num(PACK2)}' if PACK2 else str(num(COVER))
r = subprocess.run([sys.executable, '-W', 'ignore', 'makepack.py', SLUG, '--frames', frames] + (['--src', stage] if os.path.isdir(stage) else []), cwd=ROOT, capture_output=True, text=True)
print('pack:', (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else r.returncode)
if r.returncode: sys.exit('the pack did not draw: pick another frame')

# 3. THE WORK (newest night first)
W = os.path.join(ROOT, 'assets', 'work'); wp = os.path.join(ROOT, 'content', 'work.json'); work = json.load(open(wp))
def photo(stem, name, long_side=1400, q=88):
    src = os.path.join(PL, 'SUSPIRIA', stem + '.jpg')
    im = Image.open(src).convert('RGB'); im.thumbnail((long_side, long_side), Image.LANCZOS); out = os.path.join(W, name); im.save(out, 'JPEG', quality=q, optimize=True, progressive=True); return out, im.size
name = f"w10-oddball-{WORK.split('_')[-1]}.jpg"
o, (w, h) = photo(WORK, name)
new = {"src": "assets/work/" + name, "label": "THE ODD BALL · justine's brasserie · 10.31", "alt": ALT, "w": w, "h": h, "night": SLUG}
items = [it for it in work['items'] if it['src'] != new['src']]
items.insert(0, new); work['items'] = items
nl = open(wp).read().endswith('\n'); open(wp, 'w').write(json.dumps(work, indent=1, ensure_ascii=True) + ('\n' if nl else ''))
print(f"work.json: {len(work['items'])} items, {name} first ({os.path.getsize(o) // 1000} KB, {w}x{h})")

# 4. press fallback words (the script on the page overwrites them from the JSON; these stay when JS or a file is missing)
pp = os.path.join(ROOT, 'press', 'index.html'); s = open(pp).read()
ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
words = lambda n: ONES[n] if n < 20 else TENS[n // 10] + (' ' + ONES[n % 10] if n % 10 else '')
nights = sum(1 for e in built['items'] if not e.get('mini'))
for key, n, cap in (('events', nights, False), ('work', len(work['items']), True)):
    w_ = words(n); w_ = w_[0].upper() + w_[1:] if cap else w_
    s, k = re.subn(r'(<span data-n="%s"[^>]*>)[^<]*(</span>)' % key, r'\g<1>%s\g<2>' % w_, s); assert k == 1, key
open(pp, 'w').write(s); print(f'press fallback words: {words(nights)} galleries, {words(len(work["items"]))} frames')
sp = os.path.join(ROOT, 'content', 'site.json'); raw = open(sp).read()
m = re.search(r'("the_rooms": ")([^"]*)(")', raw); assert m, 'the_rooms not found in site.json'      # nested, so edit the line itself
if "Justine's Brasserie" not in m.group(2):
    raw = raw[:m.end(2)] + " · Justine's Brasserie" + raw[m.end(2):]; json.loads(raw); open(sp, 'w').write(raw)
print('site.json the_rooms:', re.search(r'"the_rooms": "([^"]*)"', open(sp).read()).group(1)[-64:])

# 5. THE MAP (pin off the US Census geocoder, 11/1; a restaurant open to the public, so address + pin like Paper Tiger)
rp = os.path.join(ROOT, 'content', 'rooms.json'); rooms = json.load(open(rp)); rnl = open(rp).read().endswith('\n')
room = {"name": "Justine's Brasserie", "key": "justines brasserie",
        "aliases": ["justine's", "justines", "justine's brasserie austin", "justinesbrasserie"],
        "city": "Austin", "address": "4710 E 5th St, Austin, TX 78702", "lat": 30.25292, "lng": -97.70029, "city_only": False}
if not any(x['name'] == room['name'] for x in rooms['rooms']):
    rooms['rooms'].append(room)
open(rp, 'w').write(json.dumps(rooms, indent=1, ensure_ascii=True) + ('\n' if rnl else ''))
print('rooms.json:', len(rooms['rooms']), 'rooms')
