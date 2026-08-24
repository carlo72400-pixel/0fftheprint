#!/usr/bin/env python3
"""
Build the small derivatives the page actually renders.

The site paints card art, avatars and catalog thumbs as CSS background-images
through paintBg()/CSSOM. That is the right call for security (an inline style
attribute lets an entity-escaped quote break out of url()), but it costs the
one thing <img loading="lazy"> gives you for free: the browser will not defer
an offscreen background, and there is no srcset to pick a smaller file.

So the page was shipping a 1125x1500, 608 KB card JPEG to paint a 42x42 avatar
circle. Four of those sit near the top of the timeline. Measured 2026-08-21 on
a 375px viewport at DPR 2: 4.4 MB of transfer, 98% of it images.

This writes two sizes next to the originals. Nothing is overwritten and no
original is touched.

    assets/av/<path>.jpg      96px   timeline avatars (42 CSS px at DPR 2 = 84)
    assets/thumb/<path>.jpg  440px   catalog desk thumbs (169 CSS px = 338)
    assets/card/<path>.jpg   760px   roster + curator cards in the GRID
    assets/grid/<path>.jpg  1000px   THE WORK grid (named grid, not work: the
                                     source frames already live in assets/work/)

THE WORK frames ship at 1400px to fill a 349 CSS px column, and there is no
lightbox, so the extra pixels are never looked at by anybody. 1000px still
covers DPR 2 with room and lands within 5% of DPR 3. Kept deliberately larger
and at higher quality than the card derivative because these are the actual
photographs.

The grid card art is the one that costs real money: four full-art JPEGs at
1125x1500 were loading on every page view to fill boxes 227 CSS px wide.
Measured on a 1440 desktop at DPR 2, the grid needs 454px and the modal needs
816px. So the grid gets 760 and the ORIGINAL is kept for the modal, which only
loads when somebody actually taps a card. renderPokeCard() picks by source.

Subfolders are mirrored, so assets/work/x.jpg derives to assets/thumb/work/x.jpg.

Run it from the 0fftheprint folder after adding or swapping any card art:

    /usr/bin/python3 derive.py            # only what is missing or stale
    /usr/bin/python3 derive.py --force    # rebuild everything

Then commit assets/av/ and assets/thumb/ along with the source image.
"""

import os
import re
import sys
import json

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

# width, subfolder, jpeg quality, which files get it
#
# av and thumb are scanned off everything, because they are small enough that
# total coverage is cheaper than being clever and a missing one is a blank
# avatar on someone's phone. card is 100 KB a file, so it is scoped to the only
# thing that renders a .poke-art: roster and curator card photos, plus the
# booster tile. Building card art for 27 work frames cost 3.5 MB for nothing.
SIZES = [
    (96, "av", 82, None),
    (440, "thumb", 84, None),
    (760, "card", 86, ("roster.json", "creators.json")),
    (1000, "grid", 85, ("work.json",)),
]

# The booster tile is a static CSS background, so no JSON names it.
CARD_EXTRA = ("booster-pack.jpg",)

# Matches nested paths too. The catalog points at assets/work/<frame>.jpg, and an
# earlier flat-only pattern silently left those thumbs on the full-size frames.
REF_RE = re.compile(r"assets/([A-Za-z0-9._/-]+\.(?:jpg|jpeg|png))", re.I)


def referenced(only=None):
    """Every assets/ image named by the page, or by the named JSON files."""
    names = set()
    content = os.path.join(HERE, "content")
    if only:
        targets = [os.path.join(content, f) for f in only]
    else:
        targets = [os.path.join(HERE, "index.html")]
        if os.path.isdir(content):
            targets += [
                os.path.join(content, f)
                for f in os.listdir(content)
                if f.endswith(".json")
            ]
    for path in targets:
        try:
            with open(path, encoding="utf-8", errors="ignore") as fh:
                names.update(m.group(1) for m in REF_RE.finditer(fh.read()))
        except OSError:
            continue
    # Skip anything already living in a derivative folder, or we would build
    # assets/av/av/... on the second run.
    skip = tuple(folder + "/" for _, folder, _, _ in SIZES)
    return sorted(n for n in names if not n.startswith(skip))


def stale(src, dst):
    if not os.path.exists(dst):
        return True
    return os.path.getmtime(src) > os.path.getmtime(dst)


def build(force=False):
    made, skipped, missing = 0, 0, []
    saved_from, saved_to = 0, 0

    for width, folder, quality, only in SIZES:
        names = set(referenced(only))
        if folder == "card":
            names.update(CARD_EXTRA)

        for name in sorted(names):
            src = os.path.join(ASSETS, name)
            if not os.path.exists(src):
                missing.append(name)
                continue

            # Keep the subpath, so assets/work/x.jpg lands at
            # assets/thumb/work/x.jpg and two frames with the same basename in
            # different folders cannot overwrite each other.
            base = os.path.splitext(name)[0] + ".jpg"

            outdir = os.path.join(ASSETS, folder)
            os.makedirs(outdir, exist_ok=True)
            dst = os.path.join(outdir, base)
            os.makedirs(os.path.dirname(dst), exist_ok=True)

            if not force and not stale(src, dst):
                skipped += 1
                continue

            with Image.open(src) as im:
                # Bake orientation. sips --rotate leaves an EXIF flag browsers
                # re-apply, so a derivative built off a rotated source lands
                # sideways unless the transpose happens here.
                im = ImageOps.exif_transpose(im)
                if im.mode in ("RGBA", "LA", "P"):
                    flat = Image.new("RGB", im.size, (13, 12, 11))
                    flat.paste(im.convert("RGBA"),
                               mask=im.convert("RGBA").split()[-1])
                    im = flat
                else:
                    im = im.convert("RGB")

                if im.width > width:
                    h = round(im.height * width / im.width)
                    im = im.resize((width, h), Image.LANCZOS)

                im.save(dst, "JPEG", quality=quality, optimize=True,
                        progressive=True)

            saved_from += os.path.getsize(src)
            saved_to += os.path.getsize(dst)
            made += 1

    print("built %d, up to date %d" % (made, skipped))
    if made:
        print("  sources %.1f MB -> derivatives %.0f KB"
              % (saved_from / 1048576.0, saved_to / 1024.0))
    if missing:
        print("  referenced but not in assets/: " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(build(force="--force" in sys.argv))
