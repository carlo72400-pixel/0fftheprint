#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — rebuild an event's page from its data.json.

    /usr/bin/python3 repage.py                  # every event
    /usr/bin/python3 repage.py 2026-08-14-blade-rave

Use this when the PAGE TEMPLATE in newevent.py changes and the existing
galleries need the fix, without re-encoding a gigabyte of photos and video to
get it. data.json is the record of what is in an event; this just re-renders
the page around it.

It fills in a missing w/h on any item by measuring the committed thumbnail,
because without dimensions the tile has no height, and without height the lazy
loader never fires and the grid renders empty.
"""
import io
import json
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")


def load_builder():
    spec = importlib.util.spec_from_file_location("ne", os.path.join(ROOT, "newevent.py"))
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, ["newevent.py"]      # keep argparse quiet
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def backfill_dims(ne, event_dir, items):
    """Measure the thumb for anything missing w/h. Returns how many it fixed."""
    fixed = 0
    for m in items:
        if m.get("w") and m.get("h"):
            continue
        thumb = os.path.join(event_dir, m.get("thumb", ""))
        if not os.path.exists(thumb):
            continue
        try:
            with ne.Image.open(thumb) as im:
                m["w"], m["h"] = im.size
            fixed += 1
        except Exception:
            pass
    return fixed


def repage(ne, slug):
    d = os.path.join(EVENTS, slug)
    dj = os.path.join(d, "data.json")
    if not os.path.exists(dj):
        print(f"  {slug}: no data.json, skipped")
        return
    data = json.load(open(dj))
    items = data["media"]

    fixed = backfill_dims(ne, d, items)

    from datetime import datetime
    datelong = datetime.strptime(data["date"], "%Y-%m-%d").strftime("%b %-d, %Y")
    page = (ne.PAGE.replace("__MEDIA__", json.dumps(items))
                   .replace("__TITLE__", data["title"])
                   .replace("__VENUE__", data["venue"])
                   .replace("__DATELONG__", datelong)
                   .replace("__COUNT__", str(len(items)))
                   .replace("__SLUG__", slug))
    io.open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)

    data["media"] = items
    data["count"] = len(items)
    json.dump(data, io.open(dj, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"  {slug}: {len(items)} items" + (f", measured {fixed} missing dims" if fixed else ""))


def main():
    ne = load_builder()
    wanted = sys.argv[1:]
    slugs = wanted or sorted(x for x in os.listdir(EVENTS)
                             if os.path.isdir(os.path.join(EVENTS, x)))
    print(f"rebuilding {len(slugs)} event page(s)")
    for s in slugs:
        repage(ne, s)
    print("done. git add -A && git commit && git push")


if __name__ == "__main__":
    main()
