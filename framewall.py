#!/usr/bin/env python3
"""THE CONTACT SHEET's index (10/7): every published frame of every night, small enough for the homepage.

    /usr/bin/python3 framewall.py          # rewrites content/frames.json from events/*/data.json

newevent.py calls build() at the end of a night, after the pack. Run it by hand after editing a night.
Photos only (a clip is not a frame). Each night's HIT is left out on purpose: it is the chase card inside
the pack (sealed.js), and a homepage that deals it face up spoils the tear. The hash is makepack.hit_index,
which is sealed.js's, bit for bit.

Shape, kept tiny because the homepage pays for every byte:
  {"v": 1, "total": <frames>, "nights": [{"s": slug, "t": title, "v": venue, "d": "10.03.26", "n": <media count>,
    "b": "<release url up to the slash>", "f": [[index, "stem", w, h], ...]}]}
  thumb = events/<s>/media/<stem>_t.jpg   big = <b><stem>.jpg   (a frame off that pattern carries its own src as a 5th item)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "content", "frames.json")


def build(quiet=False):
    sys.path.insert(0, ROOT)
    from makepack import hit_index
    idx = json.load(open(os.path.join(ROOT, "events", "events.json"), encoding="utf-8"))
    nights, total = [], 0
    for ev in idx.get("items", []):
        slug = ev.get("slug", "")
        p = os.path.join(ROOT, "events", slug, "data.json")
        if not re.fullmatch(r"[a-z0-9-]{4,80}", slug) or not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        media = d.get("media") or []
        n = len(media)
        hit = hit_index(slug, n)
        base, frames = None, []
        for i, m in enumerate(media):
            if m.get("type") != "photo" or i == hit:
                continue
            mt = re.fullmatch(r"media/([A-Za-z0-9_.-]+)_t\.jpg", m.get("thumb") or "")
            src = m.get("src") or ""
            if not mt or not src.startswith("https://"):
                continue
            stem = mt.group(1)
            row = [i, stem, int(m.get("w") or 0), int(m.get("h") or 0)]
            b = src.rsplit("/", 1)[0] + "/"
            if base is None:
                base = b
            if src != base + stem + ".jpg":
                row.append(src)                  # off the night's pattern: carry the full url
            frames.append(row)
        if frames:
            nights.append({"s": slug, "t": d.get("title") or ev.get("title") or slug, "v": d.get("venue") or ev.get("venue") or "",
                           "d": d.get("date_short") or ev.get("date_short") or "", "n": n, "b": base, "f": frames})
            total += len(frames)
    out = {"v": 1, "total": total, "nights": nights}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    if not quiet:
        print(f"  content/frames.json: {total} frames from {len(nights)} nights, {os.path.getsize(OUT) // 1024} KB")
    return out


if __name__ == "__main__":
    build()
