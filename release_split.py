#!/usr/bin/env python3
"""release_split.py <slug> [frames_per_release]
A release stops at about 1000 assets, so a night bigger than that rides on several: <slug> holds the first frames, <slug>-2 the
next, and so on, every look and size of a frame together. Run it after newevent.py --no-upload, before upload_release.py.
  - moves the staged files of the later frames into otp-stage-<slug>-2, -3 ... next to otp-stage-<slug>
  - rewrites the release URLs in events/<slug>/data.json and index.html
Every reader takes the absolute URL (framewall.py carries a frame off the pattern as its own src, takedown.py reads repo, tag and
name out of each URL), so nothing else has to know. Rerun framewall.py and looks.py after it.
Usage: release_split.py 2026-10-31-the-odd-ball 124"""
import glob, json, os, re, shutil, sys, tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
slug = sys.argv[1]; per = int(sys.argv[2]) if len(sys.argv) > 2 else 124
tag_of = lambda n: slug if n <= per else f"{slug}-{(n - 1) // per + 1}"
stage = os.path.join(tempfile.gettempdir(), f"otp-stage-{slug}")
moved = {}
for f in sorted(os.listdir(stage)):
    m = re.match(r"(\d{3})", f)
    if not m:
        continue
    tag = tag_of(int(m.group(1)))
    if tag != slug:
        d = os.path.join(tempfile.gettempdir(), f"otp-stage-{tag}"); os.makedirs(d, exist_ok=True)
        shutil.move(os.path.join(stage, f), os.path.join(d, f)); moved[tag] = moved.get(tag, 0) + 1
pat = re.compile(r"(/releases/download/)" + re.escape(slug) + r"/(\d{3})")
for p in (f"events/{slug}/data.json", f"events/{slug}/index.html"):
    p = os.path.join(ROOT, p); s = open(p, encoding="utf-8").read()
    s, k = pat.subn(lambda m: f"{m.group(1)}{tag_of(int(m.group(2)))}/{m.group(2)}", s)
    open(p, "w", encoding="utf-8").write(s); print(f"  {os.path.basename(p)}: {k} urls checked")
d = json.load(open(os.path.join(ROOT, "events", slug, "data.json"), encoding="utf-8"))
for i, m in enumerate(d["media"], 1):
    for u in [m["src"], m["full"]] + [x for v in m.get("looks", []) for x in (v["src"], v["full"])]:
        assert f"/download/{tag_of(i)}/{i:03d}" in u, u
print(f"  {len(os.listdir(stage))} files stay on {slug};", ", ".join(f"{n} move to {t}" for t, n in moved.items()))
