#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — add or replace one NIGHTS block on /portfolio/.

Generalised from the Brainrot builder that lived in the Austin shoot's
_scripts/ (9/12). One JSON config per night:

    /usr/bin/python3 nightsblock.py config.json

config:
  {"marker": "MIKEDIMES",                 # <!-- MIKEDIMES --> ... <!-- /MIKEDIMES -->
   "asset_dir": "mikedimes",              # portfolio/assets/<asset_dir>/xx_01..08.jpg
   "prefix": "md",                        # file prefix
   "frames": ["IMG_20260901_215802_240", ...8 stems...],
   "sources": ["/folder/of/look", ...],   # searched recursively for <stem>.jpg
   "faces": "/path/faces.json",           # YuNet output, list of {file, faces[], dw, dh}
   "alts": [8 strings], "left": "html", "right": "html", "credits": "html",
   "after": "BRAINROT"}                   # insert after this block (or "archive" = last)

Crops each frame at the recipe sizes (bwide 1600x842, bhero 1400x1400, six
squares 1200x1200, q86 progressive), centred on the detected faces, and writes
the block into BOTH index.html and index-kawaii.html so the twins stay
byte-identical. Re-running replaces the block in place.

⛔ Every frame here must come from the CLEARED set (cull.json). The builder
   does not know what was excluded; the config author does.
"""
import glob, html, json, os, sys
from PIL import Image, ImageOps

PF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio")
SLOTS = [("bluep bwide", 1600, 842), ("bluep bhero", 1400, 1400)] + [("bluep", 1200, 1200)] * 6


def find(stem, sources):
    for s in sources:
        hits = glob.glob(os.path.join(s, "**", stem + ".jpg"), recursive=True) \
            or glob.glob(os.path.join(s, "**", stem + ".JPG"), recursive=True)
        if hits:
            return hits[0]
    sys.exit(f"frame not found under sources: {stem}")


def crop(im, rec, tw, th):
    W, H = im.size
    r = tw / th
    cw, ch = (W, int(W / r)) if W / H < r else (int(H * r), H)
    cx, cy = W / 2, H / 2
    fs = (rec or {}).get("faces") or []
    if fs:
        amax = max(d["w"] * d["h"] for d in fs)
        k = [d for d in fs if d["w"] * d["h"] >= 0.25 * amax]
        dw, dh = rec.get("dw") or W, rec.get("dh") or H
        sx, sy = W / dw, H / dh
        cx = sum((d["x"] + d["w"] / 2) * sx for d in k) / len(k)
        cy = sum((d["y"] + d["h"] / 2) * sy for d in k) / len(k) + ch * 0.12
    x0 = int(min(max(cx - cw / 2, 0), W - cw))
    y0 = int(min(max(cy - ch / 2, 0), H - ch))
    return im.crop((x0, y0, x0 + cw, y0 + ch)).resize((tw, th), Image.LANCZOS)


def main():
    cfg = json.load(open(sys.argv[1]))
    assert len(cfg["frames"]) == 8 and len(cfg["alts"]) == 8, "eight frames, eight alts"
    faces = {}
    if cfg.get("faces") and os.path.exists(cfg["faces"]):
        faces = {os.path.splitext(r["file"])[0]: r for r in json.load(open(cfg["faces"]))}
    out = os.path.join(PF, "assets", cfg["asset_dir"])
    os.makedirs(out, exist_ok=True)
    pre, mk = cfg["prefix"], cfg["marker"]
    rows = []
    for i, (stem, alt, (cls, tw, th)) in enumerate(zip(cfg["frames"], cfg["alts"], SLOTS), 1):
        src = find(stem, cfg["sources"])
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        fn = f"{pre}_{i:02d}.jpg"
        crop(im, faces.get(stem), tw, th).save(os.path.join(out, fn), quality=86,
                                               progressive=True, optimize=True)
        rel = f"assets/{cfg['asset_dir']}/{fn}"
        rows.append(f'    <a class="{cls}" href="{rel}"><img src="{rel}" '
                    f'alt="{html.escape(cfg.get("alt_prefix", "") + alt)}" loading="lazy"></a>')
        print(f"  {fn}  {stem}  {tw}x{th}  {os.path.getsize(os.path.join(out, fn)) // 1024} KB")
    block = (f"  <!-- {mk} -->\n"
             f'  <div class="clip-label" style="margin-top:40px"><span>{cfg["left"]}</span>'
             f'<span class="r">{cfg["right"]}</span></div>\n'
             '  <div class="blue-grid">\n' + "\n".join(rows) + "\n  </div>\n"
             f'  <p class="client-credits">{cfg["credits"]}</p>\n'
             f"  <!-- /{mk} -->\n")
    after = cfg.get("after", "archive")
    ANCHOR = "</div></section>\n\n<section id=\"archive\""
    for f in ("index.html", "index-kawaii.html"):
        p = os.path.join(PF, f)
        s = open(p).read()
        if f"<!-- {mk} -->" in s:
            a = s.index(f"  <!-- {mk} -->")
            b = s.index(f"  <!-- /{mk} -->\n") + len(f"  <!-- /{mk} -->\n")
            s = s[:a] + block + s[b:]
        elif after != "archive" and f"  <!-- /{after} -->\n" in s:
            at = s.index(f"  <!-- /{after} -->\n") + len(f"  <!-- /{after} -->\n")
            s = s[:at] + block + s[at:]
        else:
            assert s.count(ANCHOR) == 1, f"{f}: archive anchor not found exactly once"
            s = s.replace(ANCHOR, block + ANCHOR)
        open(p, "w").write(s)
        print(f"  {f}: {mk} block in place")


if __name__ == "__main__":
    main()
