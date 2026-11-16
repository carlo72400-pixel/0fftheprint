#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""After build_bloodbath_1115.sh (BLOODBATH 4, Private Park, San Marcos, Nov 13 2026: 149 frames, six looks): everything
around the gallery, in the house formats (the post_oddball_1101.py pattern).
  1. events.json: the row goes in as TEXT at the top of main's file (the newest night). newevent.py rewrites the whole file
     at indent=2, so a re-dump churns every row; HEAD's text plus one block keeps the diff to this night.
  2. The pack is redrawn off a tall frame, so one picture fills the pouch (makepack.py --frames, off the staged web frames).
     Run this BEFORE release_split.py, while every web frame still sits in the first staging folder.
  3. THE WORK: one frame, first in the grid (the newest night's frames sit first).
  4. press/: the no-JS fallback words for galleries and The Work. Private Park is already in site.json's the_rooms and in
     content/rooms.json (city only, no address: the yard's street stays off the site).
Run release_split.py, upload_release.py, framewall.py, looks.py, derive.py, framekeys.py and stamp.py after.
Usage: COVER=<stem> PACK=<stem> WORK=<stem> ALT="<alt text>" post_bloodbath_1115.py"""
import json, os, re, subprocess, sys
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__)); EV = os.path.join(ROOT, 'events'); SLUG = '2026-11-13-bloodbath-4'
T = '/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-11-13_BLOODBATH-PrivatePark'
PL = os.environ.get('PL') or T + '/_web/plooks'
COVER = os.environ['COVER']; PACK = os.environ.get('PACK') or COVER; WORK = os.environ['WORK']; ALT = os.environ['ALT']
order = json.load(open(T + '/_web/order_bloodbath.json'))['order']
num = lambda stem: order.index(stem) + 1

# 1. the row, as text, into main's events.json (the parsed result must equal what the build wrote, with the cover set)
p = os.path.join(EV, 'events.json'); built = json.load(open(p)); row = [e for e in built['items'] if e['slug'] == SLUG][0]
cover = f'{SLUG}/media/{num(COVER):03d}_t.jpg'; assert os.path.exists(os.path.join(EV, cover)), cover
row['cover'] = cover; assert not row.get('mini'), 'a full night, not a mini pack'
base = subprocess.run(['git', 'show', 'HEAD:events/events.json'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
assert all(e['slug'] != SLUG for e in json.loads(base)['items']), 'HEAD already lists this night'
anchor = '{\n "items": [\n'; assert base.startswith(anchor), 'events.json no longer opens the way it did'
block = '\n'.join('  ' + l for l in json.dumps(row, indent=1, ensure_ascii=True).splitlines())
out = anchor + block + ',\n' + base[len(anchor):]
want = dict(built); want['items'] = [row] + [e for e in built['items'] if e['slug'] != SLUG]
assert json.loads(out) == want, 'text insert differs from the build'
open(p, 'w').write(out)
print(f"events.json: {len(built['items'])} rows ({sum(1 for e in built['items'] if not e.get('mini'))} nights + "
      f"{sum(1 for e in built['items'] if e.get('mini'))} mini), {SLUG} count {row['count']} cover {cover}")

# 2. the pack (a tall frame fills the pouch)
stage = os.path.join(__import__('tempfile').gettempdir(), f'otp-stage-{SLUG}')
r = subprocess.run([sys.executable, '-W', 'ignore', 'makepack.py', SLUG, '--frames', str(num(PACK))] + (['--src', stage] if os.path.isdir(stage) else []), cwd=ROOT, capture_output=True, text=True)
print('pack:', (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else r.returncode)
if r.returncode: sys.exit('the pack did not draw: pick another frame')

# 3. THE WORK (newest night first), off the primary look
W = os.path.join(ROOT, 'assets', 'work'); wp = os.path.join(ROOT, 'content', 'work.json'); work = json.load(open(wp))
def photo(stem, name, long_side=1400, q=88):
    src = os.path.join(PL, 'CORN SYRUP', stem + '.jpg')
    im = Image.open(src).convert('RGB'); im.thumbnail((long_side, long_side), Image.LANCZOS); o = os.path.join(W, name); im.save(o, 'JPEG', quality=q, optimize=True, progressive=True); return o, im.size
name = f"w11-bloodbath-{WORK.split('_')[-1]}.jpg"
o, (w, h) = photo(WORK, name)
new = {"src": "assets/work/" + name, "label": "BLOODBATH 4 · private park · 11.13", "alt": ALT, "w": w, "h": h, "night": SLUG}
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
sp = os.path.join(ROOT, 'content', 'site.json'); assert 'Private Park' in open(sp).read(), 'Private Park left the_rooms'
rp = os.path.join(ROOT, 'content', 'rooms.json'); room = [x for x in json.load(open(rp))['rooms'] if x['name'] == 'Private Park']
assert room and room[0]['city_only'] and not room[0]['address'], 'Private Park must stay city-only, no street'
print('site.json + rooms.json: Private Park already listed, city only')
