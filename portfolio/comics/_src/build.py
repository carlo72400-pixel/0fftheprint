#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""School of Comics pitch deck -> ../index.html (one self-contained file) + ../preview.jpg.

Run with the system python (it has fontTools + brotli):
    /usr/bin/python3 build.py          # page only
    /usr/bin/python3 build.py --og     # page + the 1200x630 share card

Edit template.html, then run this. The two display fonts (Anton, Archivo Black, both OFL)
are subset and inlined so the page needs no network and looks the same on the iPad.
Spots data (shots, seconds, lines) mirrors the class scripts in
Desktop/Full Sail/Mobility & Data Management/03_Checkpoint1/_build/spots.py + LINES.md.
"""
import base64, io, os, subprocess, sys, tempfile, time, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "index.html")
FONTS = {"/*ANTON*/": "~/Library/Fonts/Anton-Regular.ttf",
         "/*ARCHIVO*/": "~/Library/Fonts/ArchivoBlack-Regular.ttf"}
UNI = list(range(0x20, 0x7F)) + [0xA0, 0xB7, 0xD7, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2039, 0x203A]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def woff2_b64(path):
    from fontTools import subset
    from fontTools.ttLib import TTFont
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga"]
    font = TTFont(os.path.expanduser(path))
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNI)
    sub.subset(font)
    font.flavor = "woff2"
    buf = io.BytesIO()
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def build():
    html = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    for key, path in FONTS.items():
        b64 = woff2_b64(path)
        assert key in html, key
        html = html.replace(key, b64)
        print(f"{os.path.basename(path)}: {len(b64) * 3 // 4 // 1024} KB woff2")
    for bad in ("—", "–"):
        assert bad not in html, "em/en dash in the page"
    open(OUT, "w", encoding="utf-8").write(html)
    print(f"index.html: {os.path.getsize(OUT) // 1024} KB")


def shot(url, png, w, h, profile, wait=25):
    """Chrome headless writes the PNG then hangs, so watch the file, not the process."""
    if os.path.exists(png):
        os.remove(png)
    p = subprocess.Popen([CHROME, "--headless=new", f"--user-data-dir={profile}", "--hide-scrollbars",
                          "--force-device-scale-factor=1", f"--window-size={w},{h}",
                          "--virtual-time-budget=2500", f"--screenshot={png}", url],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0, last, same = time.time(), -1, 0
    while time.time() - t0 < wait:
        time.sleep(0.4)
        if os.path.exists(png):
            size = os.path.getsize(png)
            same = same + 1 if size == last and size > 0 else 0
            last = size
            if same >= 2:
                break
    p.kill()
    return os.path.exists(png)


def og():
    from PIL import Image
    prof = tempfile.mkdtemp(prefix="soc-og-")
    png = os.path.join(prof, "og.png")
    ok = shot("file://" + os.path.abspath(OUT) + "?og=1#1", png, 1200, 630, prof)
    assert ok, "no screenshot"
    Image.open(png).convert("RGB").save(os.path.join(HERE, "..", "preview.jpg"), quality=88)
    shutil.rmtree(prof, ignore_errors=True)
    print("preview.jpg written")


if __name__ == "__main__":
    build()
    if "--og" in sys.argv:
        og()
