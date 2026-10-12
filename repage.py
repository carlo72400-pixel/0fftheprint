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

10/11: it also writes the night's count into events/events.json. It used to
write data.json only, so when Clown Church gained 20 clips its page said 60
frames while the Photos tab, the Drops and the binder all said 48. And the page
goes through stamp.stamp_text(), because the template's script and stylesheet
tags carry no ?v= and every page this rebuilt used to lose its stamps.
"""
import io
import json
import re
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
sys.path.insert(0, ROOT)
from stamp import stamp_text  # noqa: E402  (same ?v= rule as stamp.py, no drift)


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


def dump_like(path, doc):
    """Rewrite a JSON file in the indent it already uses (events.json sits at
    indent=1, newevent.py writes indent=2), so a one-number change stays a
    one-line diff instead of a whole-file one."""
    indent = 2
    try:
        old = io.open(path, encoding="utf-8").read()
        m = re.search(r"\n( +)\S", old)
        if m:
            indent = len(m.group(1))
        nl = old.endswith("\n")
    except OSError:
        nl = True
    io.open(path, "w", encoding="utf-8").write(
        json.dumps(doc, indent=indent, ensure_ascii=False) + ("\n" if nl else ""))


def sync_index(slug, count):
    """Put the night's frame count into events/events.json. Returns the old count
    when it changed, None otherwise. The cover is left alone."""
    idx_path = os.path.join(EVENTS, "events.json")
    if not os.path.exists(idx_path):
        return None
    idx = json.load(io.open(idx_path, encoding="utf-8"))
    row = next((e for e in idx.get("items", []) if e.get("slug") == slug), None)
    if row is None or row.get("count") == count:
        return None
    old = row.get("count")
    row["count"] = count
    dump_like(idx_path, idx)
    return old


def repage(ne, slug):
    d = os.path.join(EVENTS, slug)
    dj = os.path.join(d, "data.json")
    if not os.path.exists(dj):
        print(f"  {slug}: no data.json, skipped")
        return
    data = json.load(open(dj))
    before = json.dumps(data, sort_keys=True)
    items = data["media"]

    fixed = backfill_dims(ne, d, items)

    from datetime import datetime
    datelong = datetime.strptime(data["date"], "%Y-%m-%d").strftime("%b %-d, %Y")
    # ⛔ __NIGHT__ MUST BE SUBSTITUTED HERE TOO. It was added to the template with
    #    LAST NIGHT, SEALED and repage.py was never taught about it, so every page
    #    this rebuilt shipped the literal token. `__NIGHT__` is an undefined
    #    identifier, so the inline script threw a ReferenceError on its last line,
    #    window.OTPNight was never set, and the sealed pack silently vanished. The
    #    grid still rendered, which is exactly why it was easy to miss.
    # ⛔ json.dumps, not raw: a venue with an apostrophe would close the JS string.
    looks = data.get("looks") or []
    night = json.dumps({"slug": slug, "title": data["title"],
                        "venue": data["venue"],
                        "dateShort": data.get("date_short", ""), "looks": looks})
    page = (ne.PAGE.replace("__NIGHT__", night)
                   .replace("__MEDIA__", json.dumps(items))
                   .replace("__LOOKSLINE__", ne.looks_line(looks))
                   .replace("__TITLE__", data["title"])
                   .replace("__VENUE__", data["venue"])
                   .replace("__DATELONG__", datelong)
                   .replace("__COUNT__", str(len(items)))
                   .replace("__SLUG__", slug))
    left = re.findall(r"__[A-Z]+__", page)
    if left:
        print(f"  {slug}: REFUSED, template placeholders unfilled: {sorted(set(left))}")
        return
    page = stamp_text(page)
    io.open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)

    data["media"] = items
    data["count"] = len(items)
    # only when something changed: some nights' data.json is one long line, and
    # re-dumping an unchanged record turns it into a 1,500 line diff
    if json.dumps(data, sort_keys=True) != before:
        json.dump(data, io.open(dj, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    was = sync_index(slug, len(items))
    print(f"  {slug}: {len(items)} items" + (f", measured {fixed} missing dims" if fixed else "")
          + (f", events.json count {was} -> {len(items)}" if was is not None else ""))


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
