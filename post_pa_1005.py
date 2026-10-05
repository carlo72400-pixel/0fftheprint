#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""After build_pa_1005.sh (PULSE ANGELS 3, Oct 3 2026): everything around the gallery, in the house formats.
  1. events.json: the cover goes to the wings frame, and the file is re-dumped at indent=1 ascii (newevent.py writes indent=2,
     which churns the whole file).
  2. The pack is redrawn off the cover + a second wide frame (makepack.py --frames).
  3. THE WORK: the wings frame + the three story collages he asked to put up (10/5), newest first.
  4. site.json: 21st Street Co-op joins the_rooms. press/: the gallery and frame counts.
Run derive.py and stamp.py after. Usage: post_pa_1005.py"""
import json, os, re, subprocess, sys
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__)); EV = os.path.join(ROOT, 'events'); SLUG = '2026-10-03-pulse-angels-3'
PA = '/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-10-03_PulseAngels3-21stStCoop'
COVER = 'IMG_20261004_001731_073'; PACK2 = os.environ.get('PACK2', 'IMG_20261004_002713_099')
order = json.load(open(PA + '/_web/order_pa.json'))['order']
num = lambda stem: order.index(stem) + 1

# 1. cover + format
p = os.path.join(EV, 'events.json'); idx = json.load(open(p)); row = [e for e in idx['items'] if e['slug'] == SLUG][0]
cover = f'{SLUG}/media/{num(COVER):03d}_t.jpg'; assert os.path.exists(os.path.join(EV, cover)), cover
row['cover'] = cover; had_nl = open(p).read().endswith('\n'); open(p, 'w').write(json.dumps(idx, indent=1, ensure_ascii=True) + ('\n' if had_nl else ''))
print(f"events.json: {len(idx['items'])} nights, {SLUG} count {row['count']} cover {cover}")

# 2. the pack
stage = os.path.join(__import__('tempfile').gettempdir(), f'otp-stage-{SLUG}')
r = subprocess.run([sys.executable, 'makepack.py', SLUG, '--frames', f'{num(COVER)},{num(PACK2)}'], cwd=ROOT, capture_output=True, text=True)
print('pack:', (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else r.returncode)

# 3. THE WORK
W = os.path.join(ROOT, 'assets', 'work'); wp = os.path.join(ROOT, 'content', 'work.json'); work = json.load(open(wp))
def photo(stem, name, long_side=1400, q=88):
    src = [os.path.join(dp, f) for dp, _, fs in os.walk(PA + '/03_Graded/03 ANGEL NO FRAME') for f in fs if f == stem + '.jpg'][0]
    im = Image.open(src).convert('RGB'); im.thumbnail((long_side, long_side), Image.LANCZOS); out = os.path.join(W, name); im.save(out, 'JPEG', quality=q, optimize=True, progressive=True); return out, im.size
def collage(src, name):
    im = Image.open(src).convert('RGB'); out = os.path.join(W, name); im.save(out, 'JPEG', quality=86, optimize=True, progressive=True, subsampling=0); return out, im.size
C = PA + '/05_Story_Collage/'
new = []
o, (w, h) = photo(COVER, 'w7-pa-073.jpg')
new.append({"src": "assets/work/w7-pa-073.jpg", "label": "PULSE ANGELS 3 · 21st st co-op · 10.03", "alt": "Someone in black feathered angel wings seen from behind, facing a packed room under a ceiling of projected light", "w": w, "h": h})
for src, name, alt in ((C + 'PULSE ANGELS story 1 CROSS.jpg', 'w7-pa-story-1.jpg', "Story collage in magenta and teal: a stone angel carrying a cross glows white over photos of a dancer in black wings, three friends and a peace sign, with Cabanel’s Fallen Angel in the corner"),
                       (C + 'PULSE ANGELS story 2 WEEPING.jpg', 'w7-pa-story-2.jpg', "Story collage in violet and ice blue: a weeping stone angel beside photos of a dancer, three friends at a stone wall and hands up at the booth, with a curled marble angel below"),
                       (C + 'PULSE ANGELS story 3 RED STAGE.jpg', 'w7-pa-story-3.jpg', "Story collage in oxblood and rose: a white statue with spread wings across photos of the red stage, a guest carried in someone’s arms, a DJ and an embrace")):
    o, (w, h) = collage(src, name)
    new.append({"src": "assets/work/" + name, "label": "PULSE ANGELS 3 · story collage · 10.03", "alt": alt, "w": w, "h": h})
have = {it['src'] for it in work['items']}; work['items'] = [n for n in new if n['src'] not in have] + work['items']
nl = open(wp).read().endswith('\n'); open(wp, 'w').write(json.dumps(work, indent=1, ensure_ascii=True) + ('\n' if nl else ''))
print(f"work.json: {len(work['items'])} items (+{len([n for n in new if n['src'] not in have])})", [os.path.getsize(os.path.join(ROOT, n['src'])) // 1000 for n in new], 'KB')

# 4. rooms + press
sp = os.path.join(ROOT, 'content', 'site.json'); raw = open(sp).read()
m = re.search(r'("the_rooms": ")([^"]*)(")', raw); assert m, 'the_rooms not found in site.json'      # nested, so edit the line itself and keep the file's own formatting
if '21st Street Co-op' not in m.group(2):
    raw = raw[:m.end(2)] + ' \u00b7 21st Street Co-op' + raw[m.end(2):]; json.loads(raw); open(sp, 'w').write(raw)
print('site.json the_rooms:', re.search(r'"the_rooms": "([^"]*)"', open(sp).read()).group(1)[-64:])
pp = os.path.join(ROOT, 'press', 'index.html'); s = open(pp).read()
for a, b in (('Full night galleries, eighteen published.', 'Full night galleries, nineteen published.'), ('Forty seven frames from nights', 'Forty eight frames from nights')):
    if a in s: s = s.replace(a, b)
    else: assert b in s, a
open(pp, 'w').write(s); print('press counts: nineteen galleries, forty eight frames')
