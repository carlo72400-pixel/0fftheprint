#!/usr/bin/env python3
"""content/looks.json: the nights that were printed more than one way, three frames each, every print.

    /usr/bin/python3 looks.py

Reads events/*/data.json (newevent.py writes `looks` per night and per frame). Photos only. The
strip on the Photos tab (THE LOOKS, 10/11) shows one frame in all its prints with a drag handle,
so each frame carries the 1920px release URL per look (the thumb is the first look only).
Run it after a new multi-look night lands, before the commit.
"""
import glob, json, os
ROOT = os.path.dirname(os.path.abspath(__file__))
out = {"v": 1, "nights": []}
for f in sorted(glob.glob(os.path.join(ROOT, "events", "*", "data.json"))):
    d = json.load(open(f, encoding="utf-8"))
    looks = d.get("looks") or []
    if len(looks) < 2:
        continue
    media = [m for m in d.get("media", []) if m.get("type", "photo") == "photo" and len(m.get("looks") or []) >= 2]
    if not media:
        continue
    # three frames spread through the night, each in every print
    picks = sorted({0, len(media) // 2, len(media) - 1})
    frames = []
    for i in picks:
        m = media[i]
        frames.append({
            "i": d["media"].index(m), "thumb": m.get("thumb", ""), "w": m.get("w"), "h": m.get("h"),
            "prints": [{"name": lk.get("name"), "src": lk.get("src")} for lk in m["looks"] if lk.get("src")],
        })
    out["nights"].append({"slug": d["slug"], "title": d.get("title"), "venue": d.get("venue"), "date": d.get("date"),
                          "date_short": d.get("date_short", ""), "looks": looks, "count": len(media), "frames": frames})
out["nights"].sort(key=lambda n: n["date"] or "", reverse=True)
p = os.path.join(ROOT, "content", "looks.json")
json.dump(out, open(p, "w", encoding="utf-8"), indent=1, ensure_ascii=False); open(p, "a").write("\n")
print(f"{len(out['nights'])} nights with more than one print -> {p}")
for n in out["nights"]:
    print(f"  {n['slug']}: {' / '.join(n['looks'])} ({n['count']} frames)")
