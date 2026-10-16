#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""After build_ob_1016.sh (XBONGX, One Bee Presents, 21st Street Co-op, Sept 26 2026, a MINI PACK): everything around the gallery,
in the house formats.
  1. events.json: the row (mini, the cover on the bench four) goes in as TEXT into main's file. newevent.py rewrites the whole
     file at indent=2 with no final newline, and one row (Bar Hop) carries a literal middle dot, so a re-dump churns it.
  2. The pack is redrawn off the cover + a second wide frame (makepack.py --frames, off the staged web frames).
  3. THE WORK: one frame, the two in the yard, in date order after PULSE ANGELS 3's four.
  4. press/: the no-JS fallback words. A mini pack is not a night: the galleries stay nineteen; The Work goes to fifty two.
     21st Street Co-op is already in the_rooms.
Run derive.py, framekeys.py and stamp.py after. Usage: post_ob_1016.py   (COVER / PACK2 / WORK = stems override the picks)"""
import json, os, re, subprocess, sys
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__)); EV = os.path.join(ROOT, 'events'); SLUG = '2026-09-26-xbongx'
OB = '/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-09-26_OneBee-21stStCoop'
GR = OB + '/_web/graded/01 PULSE ANGELS LOOK'
COVER = os.environ.get('COVER', 'IMG_20260926_214040_008'); PACK2 = os.environ.get('PACK2', 'IMG_20260926_223004_017')
WORK = os.environ.get('WORK', 'IMG_20260926_223004_017')
order = json.load(open(OB + '/_web/order_ob.json'))['order']
num = lambda stem: order.index(stem) + 1

# 1. the row, as text, into main's events.json (the parsed result must equal what the build wrote, with the cover set)
p = os.path.join(EV, 'events.json'); built = json.load(open(p)); row = [e for e in built['items'] if e['slug'] == SLUG][0]
cover = f'{SLUG}/media/{num(COVER):03d}_t.jpg'; assert os.path.exists(os.path.join(EV, cover)), cover
row['cover'] = cover; assert row.get('mini') is True, 'the build did not mark the night mini (newevent.py --mini)'
base = subprocess.run(['git', 'show', 'main:events/events.json'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
assert all(e['slug'] != SLUG for e in json.loads(base)['items']), 'main already lists this night'
anchor = '"cover": "2026-10-03-pulse-angels-3/media/030_t.jpg"\n  },\n'; assert base.count(anchor) == 1, 'anchor row moved'
block = '\n'.join('  ' + l for l in json.dumps(row, indent=1, ensure_ascii=True).splitlines())
out = base.replace(anchor, anchor + block + ',\n', 1); assert json.loads(out) == built, 'text insert differs from the build'
open(p, 'w').write(out)
print(f"events.json: {len(built['items'])} rows ({sum(1 for e in built['items'] if not e.get('mini'))} nights + "
      f"{sum(1 for e in built['items'] if e.get('mini'))} mini), {SLUG} count {row['count']} cover {cover}")

# 2. the pack
stage = os.path.join(__import__('tempfile').gettempdir(), f'otp-stage-{SLUG}')      # the web-size frames, before the release is up
r = subprocess.run([sys.executable, '-W', 'ignore', 'makepack.py', SLUG, '--frames', f'{num(COVER)},{num(PACK2)}'] + (['--src', stage] if os.path.isdir(stage) else []), cwd=ROOT, capture_output=True, text=True)
print('pack:', (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else r.returncode)

# 3. THE WORK (the newest night's frames sit first; this night is older than PULSE ANGELS 3, so it goes in after that night's four)
W = os.path.join(ROOT, 'assets', 'work'); wp = os.path.join(ROOT, 'content', 'work.json'); work = json.load(open(wp))
def photo(stem, name, long_side=1400, q=88):
    src = [os.path.join(dp, f) for dp, _, fs in os.walk(GR) for f in fs if f == stem + '.jpg'][0]
    im = Image.open(src).convert('RGB'); im.thumbnail((long_side, long_side), Image.LANCZOS); out = os.path.join(W, name); im.save(out, 'JPEG', quality=q, optimize=True, progressive=True); return out, im.size
name = f"w8-xb-{WORK.split('_')[-1]}.jpg"
o, (w, h) = photo(WORK, name)
new = {"src": "assets/work/" + name, "label": "XBONGX · 21st st co-op · 09.26",
       "alt": "Two friends posing in the co-op yard at night under the flash, one in a green plaid tie-front top and fishnets, the other with a raccoon tail clipped to her bag",
       "w": w, "h": h, "night": SLUG}
items = [it for it in work['items'] if it['src'] != new['src']]
at = max((i + 1 for i, it in enumerate(items) if it.get('night') == '2026-10-03-pulse-angels-3'), default=0)
items.insert(at, new); work['items'] = items
nl = open(wp).read().endswith('\n'); open(wp, 'w').write(json.dumps(work, indent=1, ensure_ascii=True) + ('\n' if nl else ''))
print(f"work.json: {len(work['items'])} items, {name} at position {at + 1} ({os.path.getsize(o) // 1000} KB, {w}x{h})")

# 4. press fallback words (the script on the page overwrites them from the JSON; these stay when JS or a file is missing).
#    A mini pack is not a night, so the galleries stay nineteen.
pp = os.path.join(ROOT, 'press', 'index.html'); s = open(pp).read()
assert '<span data-n="events">nineteen</span>' in s, 'the press fallback should still say nineteen galleries'
a, b = '<span data-n="work" data-cap>Fifty one</span>', '<span data-n="work" data-cap>Fifty two</span>'
if a in s: s = s.replace(a, b)
else: assert b in s, a
open(pp, 'w').write(s); print('press fallback words: nineteen galleries, fifty two frames')
sp = os.path.join(ROOT, 'content', 'site.json')
assert '21st Street Co-op' in re.search(r'"the_rooms": "([^"]*)"', open(sp).read()).group(1), 'the_rooms lost 21st Street Co-op'
