#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""After build_tatw_1018.sh (FILL-A-BAG, Thrift @ The Warehouse, South Congress then 34th Street, Austin, Oct 17 2026, a FULL
night with its three edits as clips): everything around the gallery, in the house formats.
  1. events.json: the row goes in as TEXT at the top of main's file (the newest night). newevent.py rewrites the whole file at
     indent=2 with no final newline, and one row (Bar Hop) carries a literal middle dot, so a re-dump churns it.
  2. The pack is redrawn off the cover + a second frame (makepack.py --frames, off the staged web frames).
  3. THE WORK: one frame, first in the grid (the newest night's frames sit first).
  4. press/: the no-JS fallback words: twenty galleries, fifty three frames, and the story count and newest date the new story
     makes (the words had gone stale before this: thirty one and October 7). site.json: Thrift @ The Warehouse joins the_rooms.
  5. THE MAP: both stores join content/rooms.json (public shops, so the address and the pin, like Paper Tiger or Mohawk).
  6. THE TAPE: the three edits are authored cuts, so they ride content/video.json as CUTS with their own line (linked to the
     story), and the night joins exclude_nights so the same three clips do not ride twice as night clips.
Run videos.py, derive.py, framekeys.py and stamp.py after.
Usage: post_tatw_1018.py   (COVER / PACK2 / WORK = stems override the picks)"""
import json, os, re, subprocess, sys
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__)); EV = os.path.join(ROOT, 'events'); SLUG = '2026-10-17-fill-a-bag'
T = '/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-10-17_TATW-FillABag'
PL = T + '/_web/plooks'
COVER = os.environ.get('COVER', 'IMG_20261017_112816_086')   # the RUIN THE TOUR tee under the THRIFT@ sign, horizontal
PACK2 = os.environ.get('PACK2', 'IMG_20261017_101307_001')   # the first pile at South Congress, wide
WORK = os.environ.get('WORK', 'IMG_20261017_112816_086')
STORY = 'word/fifteen-dollars-and-whatever-fits/'
order = json.load(open(T + '/_web/order_tatw.json'))['order']
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
r = subprocess.run([sys.executable, '-W', 'ignore', 'makepack.py', SLUG, '--frames', f'{num(COVER)},{num(PACK2)}'] + (['--src', stage] if os.path.isdir(stage) else []), cwd=ROOT, capture_output=True, text=True)
print('pack:', (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else r.returncode)

# 3. THE WORK (newest night first)
W = os.path.join(ROOT, 'assets', 'work'); wp = os.path.join(ROOT, 'content', 'work.json'); work = json.load(open(wp))
def photo(stem, name, long_side=1400, q=88):
    src = os.path.join(PL, 'KAWAUCHI', stem + '.jpg')
    im = Image.open(src).convert('RGB'); im.thumbnail((long_side, long_side), Image.LANCZOS); out = os.path.join(W, name); im.save(out, 'JPEG', quality=q, optimize=True, progressive=True); return out, im.size
name = f"w9-tatw-{WORK.split('_')[-1]}.jpg"
o, (w, h) = photo(WORK, name)
new = {"src": "assets/work/" + name, "label": "FILL-A-BAG · thrift @ the warehouse · 10.17",
       "alt": "A shopper holding up a black tee printed THIS IS GOING TO RUIN THE TOUR in pink under the THRIFT@ THE WAREHOUSE sign on 34th Street, the pile on the table in front of him",
       "w": w, "h": h, "night": SLUG}
items = [it for it in work['items'] if it['src'] != new['src']]
items.insert(0, new); work['items'] = items
nl = open(wp).read().endswith('\n'); open(wp, 'w').write(json.dumps(work, indent=1, ensure_ascii=True) + ('\n' if nl else ''))
print(f"work.json: {len(work['items'])} items, {name} first ({os.path.getsize(o) // 1000} KB, {w}x{h})")

# 4. press fallback words (the script on the page overwrites them from the JSON; these stay when JS or a file is missing)
pp = os.path.join(ROOT, 'press', 'index.html'); s = open(pp).read()
desk = json.load(open(os.path.join(ROOT, 'content', 'desk.json')))['items']
assert any(it.get('link') == STORY for it in desk), 'run newstory.py for the Fill-a-Bag story first'
ours = sum(1 for it in desk if it.get('platform') != 'READ')
ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
words = lambda n: ONES[n] if n < 20 else TENS[n // 10] + (' ' + ONES[n % 10] if n % 10 else '')
nights = sum(1 for e in built['items'] if not e.get('mini'))
for key, n, cap in (('word', ours, True), ('events', nights, False), ('work', len(work['items']), True)):
    w_ = words(n); w_ = w_[0].upper() + w_[1:] if cap else w_
    s, k = re.subn(r'(<span data-n="%s"[^>]*>)[^<]*(</span>)' % key, r'\g<1>%s\g<2>' % w_, s); assert k == 1, key
s, k = re.subn(r'(<span data-newest>)[^<]*(</span>)', r'\g<1>October 18, 2026\g<2>', s); assert k == 1, 'data-newest'
open(pp, 'w').write(s); print(f'press fallback words: {words(ours)} stories, {words(nights)} galleries, {words(len(work["items"]))} frames, newest October 18, 2026')
sp = os.path.join(ROOT, 'content', 'site.json'); raw = open(sp).read()
m = re.search(r'("the_rooms": ")([^"]*)(")', raw); assert m, 'the_rooms not found in site.json'      # nested, so edit the line itself
if 'Thrift @ The Warehouse' not in m.group(2):
    raw = raw[:m.end(2)] + ' · Thrift @ The Warehouse' + raw[m.end(2):]; json.loads(raw); open(sp, 'w').write(raw)
print('site.json the_rooms:', re.search(r'"the_rooms": "([^"]*)"', open(sp).read()).group(1)[-64:])

# 5. THE MAP (pins off the US Census geocoder, 10/18; both are shops open to the public, so address + pin like Paper Tiger)
rp = os.path.join(ROOT, 'content', 'rooms.json'); rooms = json.load(open(rp)); rnl = open(rp).read().endswith('\n')
for room in ({"name": "Thrift @ The Warehouse SoCo", "key": "thrift @ the warehouse soco",
              "aliases": ["thrift at the warehouse soco", "thrift @ the warehouse south congress", "tatw soco"],
              "city": "Austin", "address": "3820 S Congress Ave, Building 2, Austin, TX 78704", "lat": 30.22526, "lng": -97.76265, "city_only": False},
             {"name": "Thrift @ The Warehouse 34th St", "key": "thrift @ the warehouse 34th st",
              "aliases": ["thrift at the warehouse 34th st", "thrift @ the warehouse 34th street", "tatw 34th st"],
              "city": "Austin", "address": "1104 W 34th St, Austin, TX 78705", "lat": 30.30329, "lng": -97.74581, "city_only": False}):
    if not any(x['name'] == room['name'] for x in rooms['rooms']):
        rooms['rooms'].append(room)
open(rp, 'w').write(json.dumps(rooms, indent=1, ensure_ascii=True) + ('\n' if rnl else ''))
print('rooms.json:', len(rooms['rooms']), 'rooms')

# 6. THE TAPE: the edits as CUTS, posters off the night's own clip posters, durations off the web clips
vp = os.path.join(ROOT, 'content', 'video.json'); vj = json.load(open(vp)); vnl = open(vp).read().endswith('\n')
data = json.load(open(os.path.join(EV, SLUG, 'data.json'))); vids = [m for m in data['media'] if m.get('type') == 'video']
assert len(vids) == 3, f'expected the three edits on the night, found {len(vids)}'
def dur(url):
    tag = url.split('/video/')[1]
    loc = os.path.join(os.path.dirname(stage), '_video_' + SLUG, os.path.basename(tag))
    s = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', loc], capture_output=True, text=True, check=True).stdout)
    return f'{int(round(s)) // 60}:{int(round(s)) % 60:02d}'
CUTS = (("tatw-pain", "Pain", "Chapter one, the finds. Chapter two, the haul. Thirty seconds on PinkPantheress."),
        ("tatw-welcome-back", "Welcome Back", "What is in your bag, at two stores. Somebody made both."),
        ("tatw-item-call", "Item Call", "Fifteen finds, fifteen dollars a bag, one name per hit."))
cuts = []
for (slug, title, line), m in zip(CUTS, vids):
    pw, ph = m['w'], m['h']
    cuts.append({"slug": slug, "title": title, "kind": "CUT", "line": line, "src": m['src'],
                 "poster": f"../events/{SLUG}/{m['thumb']}", "w": pw, "h": ph, "dur": dur(m['src']),
                 "from": "Fifteen Dollars And Whatever Fits", "link": STORY, "date": "2026-10-17"})
vj['items'] = cuts + [x for x in vj['items'] if not x['slug'].startswith('tatw-')]
if SLUG not in vj['exclude_nights']:
    vj['exclude_nights'].append(SLUG)
open(vp, 'w').write(json.dumps(vj, indent=2, ensure_ascii=False) + ('\n' if vnl else ''))      # video.json is indent 2, utf-8
print('video.json:', len(vj['items']), 'cuts,', ', '.join(f"{c['title']} {c['dur']}" for c in cuts), '| exclude_nights', vj['exclude_nights'])
