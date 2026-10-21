#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT: add or replace one NIGHTS block on the portfolio.

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
   "extra": "html",                       # optional, between the grid and the credits (a tapes row)
   "after": "BRAINROT",                   # optional: on the nights page, go directly BELOW this block
   "featured": true,                      # optional: also put it on the main page (top of its six)
   "timeline": {"title": "...", "line": "...", "link": "portfolio/nights/", "thumb": "portfolio/assets/..."}}
                                          # optional (10/21): a PORTFOLIO-ONLY block (no 0TP night or Tape cut of its own)
                                          # also lands on the homepage timeline: content/portfolio.json, keyed by marker,
                                          # `up` = the first day it went up (a re-run keeps it). thumb defaults to frame 01.

WHERE BLOCKS LIVE (2026-10-18 rebuild):
  portfolio/nights/index.html  every block, NEWEST FIRST. A marker it has never seen goes to
                               the top (under <!-- NIGHTS:TOP -->), or below "after".
  portfolio/index.html         the six featured blocks in #nights, plus THRIFT inside #hire.
  (+ index-kawaii.html twin)   A block is replaced in place wherever its marker already is;
                               it is only ADDED to the main page with "featured": true.
  The BOOKING copy of the wedding is <!-- BOOK:WEDDING --> on purpose (no film there, the film
  plays in the hero), so re-running WEDDING never touches it.

Crops each frame at the recipe sizes (bwide 1600x842, bhero 1400x1400, six
squares 1200x1200, q86 progressive), centred on the detected faces. Asset paths
are written as assets/<dir>/..., which the nights page resolves through its
<base href="/portfolio/">. The twins stay byte-identical.

⛔ Every frame here must come from the CLEARED set (cull.json). The builder
   does not know what was excluded; the config author does.
"""
import glob, html, json, os, sys
from PIL import Image, ImageOps

PF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio")
SLOTS = [("bluep bwide", 1600, 842), ("bluep bhero", 1400, 1400)] + [("bluep", 1200, 1200)] * 6
TOP = "  <!-- NIGHTS:TOP -->\n"
NIGHTS_PAGE = os.path.join("nights", "index.html")
HOME_PAGES = ("index.html", "index-kawaii.html")


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


def place(s, mk, block, after, may_add):
    """Replace the block in place, or add it (top / below `after`) when may_add."""
    open_, close = f"  <!-- {mk} -->", f"  <!-- /{mk} -->\n"
    if open_ in s:
        a = s.index(open_)
        b = s.index(close) + len(close)
        return s[:a] + block + s[b:], "replaced"
    if not may_add:
        return s, None
    if after and f"  <!-- /{after} -->\n" in s:
        at = s.index(f"  <!-- /{after} -->\n") + len(f"  <!-- /{after} -->\n")
        return s[:at] + block + s[at:], f"added below {after}"
    assert s.count(TOP) == 1, "NIGHTS:TOP anchor not found exactly once"
    at = s.index(TOP) + len(TOP)
    return s[:at] + block + s[at:], "added at the top"


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
             + cfg.get("extra", "") +
             f'  <p class="client-credits">{cfg["credits"]}</p>\n'
             f"  <!-- /{mk} -->\n")
    after = cfg.get("after")
    p = os.path.join(PF, NIGHTS_PAGE)
    s, how = place(open(p).read(), mk, block, after, True)
    open(p, "w").write(s)
    print(f"  {NIGHTS_PAGE}: {mk} {how}")
    for f in HOME_PAGES:
        p = os.path.join(PF, f)
        s, how = place(open(p).read(), mk, block, None, bool(cfg.get("featured")))
        if how:
            open(p, "w").write(s)
        print(f"  {f}: {mk} {how or 'not featured, left alone'}")
    a, b = (open(os.path.join(PF, f), "rb").read() for f in HOME_PAGES)
    assert a == b, "index.html and index-kawaii.html are no longer identical"
    tl = cfg.get("timeline")
    if tl:
        import datetime
        fp = os.path.join(os.path.dirname(PF), "content", "portfolio.json")
        j = json.load(open(fp)) if os.path.exists(fp) else {"items": []}
        old = next((r for r in j["items"] if r.get("key") == mk), None)
        row = {"key": mk, "up": (old or {}).get("up") or datetime.date.today().isoformat(), "title": tl["title"],
               "line": tl.get("line", ""), "link": tl.get("link", "portfolio/nights/"),
               "thumb": tl.get("thumb", f"portfolio/assets/{cfg['asset_dir']}/{pre}_01.jpg")}
        j["items"] = [row] + [r for r in j["items"] if r.get("key") != mk]
        open(fp, "w").write(json.dumps(j, indent=2, ensure_ascii=True) + "\n")
        print(f"  content/portfolio.json: {mk} on the homepage timeline (up {row['up']})")


if __name__ == "__main__":
    main()
