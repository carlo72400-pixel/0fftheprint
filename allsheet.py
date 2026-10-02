#!/usr/bin/env python3
"""Contact sheets of EVERY frame of a night, chunked, numbered in shoot order.
    allsheet.py <out_prefix> [--bands bands.json] folder [folder ...]
Writes <out_prefix>_index.json ([{n, stem, path, time, band, w, h}]) and
<out_prefix>_sheetNN.jpg (96 tiles each, 8 x 12)."""
import json, os, re, sys
from datetime import datetime
from PIL import Image, ImageOps, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
STAMP = re.compile(r"_(\d{8})_(\d{6})")
args = sys.argv[1:]
prefix = args.pop(0)
bands = None
if args and args[0] == "--bands":
    args.pop(0); bands = json.load(open(args.pop(0)))["sets"]

def band_of(t):
    if not bands: return ""
    for s in bands:
        if datetime.fromisoformat(s["start"]) <= t < datetime.fromisoformat(s["end"]):
            return s["key"]
    return "?"

rows = []
for f in args:
    for dp, _, fs in os.walk(f):
        for n in fs:
            if n.startswith(".") or os.path.splitext(n)[1].lower() not in (".jpg", ".jpeg"):
                continue
            p = os.path.join(dp, n); m = STAMP.search(n)
            t = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S") if m else datetime.fromtimestamp(os.path.getmtime(p))
            rows.append((t, n, p))
rows.sort()
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
TW, COLS, PER = 230, 8, 96
index = []
for k in range(0, len(rows), PER):
    chunk = rows[k:k + PER]
    nrow = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * TW, nrow * (TW + 20)), (12, 12, 14))
    dr = ImageDraw.Draw(sheet)
    for j, (t, n, p) in enumerate(chunk):
        num = k + j + 1
        im = ImageOps.exif_transpose(Image.open(p)); w, h = im.size
        im = im.convert("RGB"); im.thumbnail((TW, TW))
        x = (j % COLS) * TW; y = (j // COLS) * (TW + 20)
        sheet.paste(im, (x + (TW - im.width) // 2, y + (TW - im.height) // 2))
        b = band_of(t)
        dr.text((x + 3, y + TW + 2), f"{num:03d} {t:%H%M%S} {b[:9]}", fill=(255, 220, 90), font=font)
        index.append({"n": num, "stem": os.path.splitext(n)[0], "path": p, "time": t.strftime("%H:%M:%S"),
                      "band": b, "w": w, "h": h})
    out = f"{prefix}_sheet{k // PER + 1:02d}.jpg"
    sheet.save(out, quality=82); print(out, len(chunk))
json.dump(index, open(prefix + "_index.json", "w"), indent=1)
print(len(index), "frames")
