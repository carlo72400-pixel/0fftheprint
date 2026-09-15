#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — pick the MOMENTS of a night before newevent.py sees it.

newevent.py's own scorer keeps bursts and drops heroes (Brainrot, 9/12: five
near-identical magenta frames, two 3-frame bursts, and the corset portrait
gone). This runs first. It reads one look's folder(s), groups frames into
moments by TIME + 32px cosine similarity, keeps the sharpest frame of each
moment, cuts the dark and the empty, ranks what is left, and writes:

    <out>/candidates.json   ordered list (shoot order) of the frames to review
    <out>/review/NNN_<stem>.jpg   700px copies for the public-safety reviewers
    <out>/sheet.jpg         contact sheet, index + stem under every tile

    /usr/bin/python3 curate.py --out _web/curate --keep 60 --margin 12 \
        "03_Graded/01 LOOK/HORIZONTAL" "03_Graded/01 LOOK/VERTICAL" \
        --force IMG_20260901_215802_240 --force IMG_20260901_223311_261

--keep is how many moments the gallery wants, --margin is how many extra go to
review so a culled frame has a replacement already reviewed. --force names
stems that must survive (portfolio picks). Time comes off the Luna/GO Ultra
filename (IMG_/VID_/GRB_/GRG_ + YYYYMMDD_HHMMSS), because a graded frame has
no EXIF at all.
"""
import argparse, json, os, re, sys
import numpy as np
from datetime import datetime
from PIL import Image, ImageOps, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
STAMP = re.compile(r"_(\d{8})_(\d{6})_")


def stamp(fn):
    m = STAMP.search(fn)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
    except ValueError:
        return None


def measure(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert("L")
    w, h = im.size
    s = im.copy(); s.thumbnail((640, 640), Image.LANCZOS)
    a = np.asarray(s, dtype=np.float32)
    lap = a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:] - 4 * a[1:-1, 1:-1]
    sharp = float(lap.var())
    mean = float(a.mean()) / 255
    dark = float((a < 12).mean())
    blown = float((a > 245).mean())
    v = np.asarray(im.resize((32, 32), Image.BILINEAR), dtype=np.float32).ravel()
    v -= v.mean(); n = np.linalg.norm(v) or 1.0
    return {"w": w, "h": h, "sharp": sharp, "mean": mean, "dark": dark,
            "blown": blown, "vec": (v / n).tolist()}


def score(m):
    s = m["sharp"]
    if m["dark"] > 0.55: s *= 0.15
    elif m["dark"] > 0.40: s *= 0.5
    if m["mean"] < 0.10: s *= 0.35
    if m["blown"] > 0.22: s *= 0.6
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folders", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--keep", type=int, required=True)
    ap.add_argument("--margin", type=int, default=10)
    ap.add_argument("--force", action="append", default=[], help="stem that must survive")
    ap.add_argument("--window", type=float, default=120.0, help="seconds, same-moment window")
    ap.add_argument("--cos", type=float, default=0.93, help="cosine above this = same moment")
    ap.add_argument("--min-mean", type=float, default=0.06, help="drop frames darker than this")
    ap.add_argument("--exclude", action="append", default=[],
                    help="candidates.json or cull.json of an earlier pass; its stems are "
                         "skipped, so a top-up pass reviews only NEW frames")
    a = ap.parse_args()
    skip = set()
    for ex in a.exclude:
        j = json.load(open(ex))
        skip |= {it["stem"] for it in j.get("items", [])}
        skip |= set(j.get("kept", [])) | {k.split("_", 1)[1] for k in j.get("excluded", {})}

    files = []
    for f in a.folders:
        for dp, _, fs in os.walk(f):
            for n in fs:
                if n.startswith(".") or os.path.splitext(n)[1].lower() not in (".jpg", ".jpeg"):
                    continue
                files.append(os.path.join(dp, n))
    if not files:
        sys.exit("no frames")
    rows = []
    for i, p in enumerate(sorted(files)):
        stem = os.path.splitext(os.path.basename(p))[0]
        if stem in skip:
            continue
        t = stamp(os.path.basename(p)) or datetime.fromtimestamp(os.path.getmtime(p))
        m = measure(p)
        rows.append({"path": p, "stem": stem, "t": t, "m": m, "score": score(m)})
        print(f"  measured {i+1}/{len(files)}", end="\r")
    print()
    rows.sort(key=lambda r: (r["t"], r["stem"]))
    forced = set(a.force)

    # group into moments: chain frames within the window that look alike
    groups, cur = [], []
    for r in rows:
        if cur:
            last = cur[-1]
            dt = (r["t"] - last["t"]).total_seconds()
            cos = float(np.dot(r["m"]["vec"], last["m"]["vec"]))
            if dt <= a.window and cos >= a.cos:
                cur.append(r); continue
        if cur: groups.append(cur)
        cur = [r]
    if cur: groups.append(cur)

    moments = []
    for g in groups:
        keep = [r for r in g if r["stem"] in forced] or [max(g, key=lambda r: r["score"])]
        best = keep[0]
        best["burst"] = len(g)
        moments.append(best)
    print(f"  {len(rows)} frames -> {len(moments)} moments")

    # cut the dark and the dead
    live = [m for m in moments if m["stem"] in forced or
            (m["m"]["mean"] >= a.min_mean and m["m"]["dark"] < 0.62)]
    print(f"  {len(moments) - len(live)} dark or empty moments cut")

    want = a.keep + a.margin
    if len(live) > want:
        ranked = sorted(live, key=lambda r: (r["stem"] in forced, r["score"]), reverse=True)
        chosen = set(id(r) for r in ranked[:want])
        live = [r for r in live if id(r) in chosen]
        print(f"  ranked down to {len(live)} (keep {a.keep} + margin {a.margin})")
    missing = forced - {r["stem"] for r in live}
    if missing:
        sys.exit(f"forced stems not found in the input: {sorted(missing)}")

    os.makedirs(os.path.join(a.out, "review"), exist_ok=True)
    for f in os.listdir(os.path.join(a.out, "review")):
        os.remove(os.path.join(a.out, "review", f))
    out = []
    for i, r in enumerate(live, 1):
        im = ImageOps.exif_transpose(Image.open(r["path"])).convert("RGB")
        im.thumbnail((700, 700), Image.LANCZOS)
        rv = os.path.join(a.out, "review", f"{i:03d}_{r['stem']}.jpg")
        im.save(rv, quality=84)
        out.append({"i": i, "stem": r["stem"], "path": r["path"], "time": r["t"].strftime("%H:%M:%S"),
                    "w": r["m"]["w"], "h": r["m"]["h"], "score": round(r["score"], 1),
                    "mean": round(r["m"]["mean"], 3), "burst": r.get("burst", 1),
                    "forced": r["stem"] in forced})
    json.dump({"keep": a.keep, "margin": a.margin, "items": out},
              open(os.path.join(a.out, "candidates.json"), "w"), indent=1)

    # contact sheet
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
    except Exception:
        font = None
    TW, COLS = 230, 8
    rowsn = (len(out) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * TW, rowsn * (TW + 20)), (12, 12, 14))
    dr = ImageDraw.Draw(sheet)
    for k, r in enumerate(out):
        im = Image.open(os.path.join(a.out, "review", f"{r['i']:03d}_{r['stem']}.jpg"))
        im.thumbnail((TW, TW)); x = (k % COLS) * TW; y = (k // COLS) * (TW + 20)
        sheet.paste(im, (x + (TW - im.width) // 2, y + (TW - im.height) // 2))
        dr.text((x + 3, y + TW + 2), f"{r['i']:03d} {r['stem'][-10:]}", fill=(255, 220, 90), font=font)
    sheet.save(os.path.join(a.out, "sheet.jpg"), quality=80)
    print(f"  {len(out)} candidates -> {a.out}/review, sheet {sheet.size}")


if __name__ == "__main__":
    main()
