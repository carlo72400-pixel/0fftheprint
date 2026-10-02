#!/usr/bin/env python3
"""Hand picks -> a curate dir cullmerge.py can read.
    pickcands.py <allsheet _index.json> <out_dir> <n,n,n...>   (the numbers off the allsheet contact sheets)
Writes candidates.json (curate.py's shape, forced=false so cullmerge never refuses),
review/NNN_<stem>.jpg at 700px, sheet.jpg."""
import json, os, sys
from PIL import Image, ImageOps, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
ix = {r["n"]: r for r in json.load(open(sys.argv[1]))}
out = sys.argv[2]
picks = sorted({int(x) for x in sys.argv[3].split(",") if x.strip()})
os.makedirs(os.path.join(out, "review"), exist_ok=True)
for f in os.listdir(os.path.join(out, "review")):
    os.remove(os.path.join(out, "review", f))
items = []
for i, n in enumerate(picks, 1):
    r = ix[n]
    im = ImageOps.exif_transpose(Image.open(r["path"])).convert("RGB")
    im.thumbnail((700, 700), Image.LANCZOS)
    im.save(os.path.join(out, "review", f"{i:03d}_{r['stem']}.jpg"), quality=84)
    items.append({"i": i, "stem": r["stem"], "path": r["path"], "time": r["time"], "w": r["w"], "h": r["h"],
                  "score": 0, "mean": 0, "burst": 1, "forced": False, "pick": n, "band": r.get("band", "")})
json.dump({"keep": len(items), "margin": 0, "items": items}, open(os.path.join(out, "candidates.json"), "w"), indent=1)
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
TW, COLS = 230, 8
sheet = Image.new("RGB", (COLS * TW, ((len(items) + COLS - 1) // COLS) * (TW + 20)), (12, 12, 14))
dr = ImageDraw.Draw(sheet)
for k, it in enumerate(items):
    im = Image.open(os.path.join(out, "review", f"{it['i']:03d}_{it['stem']}.jpg")); im.thumbnail((TW, TW))
    x = (k % COLS) * TW; y = (k // COLS) * (TW + 20)
    sheet.paste(im, (x + (TW - im.width) // 2, y + (TW - im.height) // 2))
    dr.text((x + 3, y + TW + 2), f"{it['i']:03d} {it['stem'][-10:]}", fill=(255, 220, 90), font=font)
sheet.save(os.path.join(out, "sheet.jpg"), quality=80)
print(len(items), "candidates ->", out)
