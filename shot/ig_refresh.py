#!/usr/bin/env python3
"""Rebuild the Instagram preview on /shot/ (the grid under Follow The Lens).
Inputs: shot/ig_source.json  {"handle": "vamppsych", "name": "...", "line": "...", "avatar": "<path>", "codes": ["<shortcode>", ...]}
Each code's first frame is looked up in ~/Desktop/Vamppsych/05_REFERENCE/Reference/tutorials/ (<code>_01.jpg or <code>.jpg,
pulled with ~/.claude/skills/tutorial-decoder/scripts/cobalt_dl.py). Writes assets/cathedral/shot/ig/<n>.webp (square 480),
ig/avatar.webp (round-safe square 160) and rewrites the block between <!-- ig:start --> and <!-- ig:end --> in shot/index.html.
Run from the repo root: /usr/bin/python3 shot/ig_refresh.py
"""
import json, os, re, glob
from PIL import Image, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = json.load(open(os.path.join(ROOT, 'shot', 'ig_source.json')))
TUT = os.path.expanduser('~/Desktop/Vamppsych/05_REFERENCE/Reference/tutorials/')
OUT = os.path.join(ROOT, 'assets', 'cathedral', 'shot', 'ig'); os.makedirs(OUT, exist_ok=True)
def square(im, s):
    im = ImageOps.exif_transpose(im).convert('RGB'); w, h = im.size; m = min(w, h)
    im = im.crop(((w - m) // 2, (h - m) // 2, (w - m) // 2 + m, (h - m) // 2 + m)); return im.resize((s, s), Image.LANCZOS)
tiles = []
for i, code in enumerate(SRC['codes'], 1):
    cands = sorted(glob.glob(os.path.join(TUT, code + '_01.*'))) or sorted(glob.glob(os.path.join(TUT, code + '.*')))
    cands = [c for c in cands if c.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
    if not cands: print('MISSING', code); continue
    square(Image.open(cands[0]), 480).save(os.path.join(OUT, f'{i}.webp'), quality=80, method=6); tiles.append((i, code))
av = SRC.get('avatar')
if av and os.path.exists(os.path.expanduser(av)):
    square(Image.open(os.path.expanduser(av)), 160).save(os.path.join(OUT, 'avatar.webp'), quality=85, method=6)
h = SRC['handle']
# tiles are spans, not links: an <a> inside the card's <a> would split the card apart in the parser
rows = ''.join(f'<span><img src="../assets/cathedral/shot/ig/{i}.webp" alt="" loading="lazy" decoding="async"></span>' for i, c in tiles)
block = (f'<!-- ig:start (written by shot/ig_refresh.py, do not hand-edit) -->\n'
         f'<a class="igp" id="igp" href="https://instagram.com/{h}" target="_blank" rel="noopener" aria-label="@{h} on Instagram">'
         f'<span class="igp-h"><img class="av" src="../assets/cathedral/shot/ig/avatar.webp" alt=""><span><b>@{h}</b><small>{SRC.get("line","")}</small></span><em>Follow</em></span>'
         f'<span class="igp-g">{rows}</span>'
         f'<span class="igp-f">{SRC.get("name","")} &middot; tap to open</span></a>\n<!-- ig:end -->')
p = os.path.join(ROOT, 'shot', 'index.html'); s = open(p).read()
new = re.sub(r'<!-- ig:start.*?<!-- ig:end -->', block, s, flags=re.S)
if new == s: raise SystemExit('no ig:start/ig:end markers in shot/index.html')
open(p, 'w').write(new); print('tiles', len(tiles), 'avatar', bool(av))
