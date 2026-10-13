#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FRAME KEYS: writes migration 043's FRAME MAP block from the nights on disk (10/11, call 15).

    /usr/bin/python3 framekeys.py            # rewrite the block in migration-043-frames-by-name.sql
    /usr/bin/python3 framekeys.py --check    # say whether the block still matches; exit 1 if it drifted

"I'm in this one" is keyed by the photo's name since 043: the stem of its thumbnail, 'media/017_t.jpg' -> '017'.
Night pages cached before the push still send a POSITION (0 = the first frame), so 043 carries a private map,
public.frame_positions, one row per media[i] of every events/<slug>/data.json. This writes that map between the two
marker lines, and nothing else in the file:

    -- >>> FRAME MAP (framekeys.py writes this, do not hand-edit)
    delete from public.frame_positions where event_slug in (<every night in the block>);
    insert into public.frame_positions (event_slug, frame, media) values (...), ...;
    -- <<< FRAME MAP

It refuses (exit 1, writes nothing) a night folder whose name is not a night, a frame with no thumbnail or an odd
one, a stem the database would refuse, two frames with the same stem on one night, and more than 1000 frames.

⛔ Run --check right before pasting 043. A night added or a frame taken out since the last run means the block is
   stale: run it without --check, then paste.
"""
import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
SQL = os.path.join(ROOT, "migration-043-frames-by-name.sql")
BEGIN = "-- >>> FRAME MAP (framekeys.py writes this, do not hand-edit)"
END = "-- <<< FRAME MAP"
# the same checks the tables carry in 037 / 043, so nothing written here can be refused by the paste
SLUG = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$")
STEM = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")
THUMB = re.compile(r"^media/([^/]+)_t\.jpg$", re.I)
PER_LINE = 8


def nights():
    """[(slug, [stem, ...])] in slug order, or exit naming the first thing that is wrong"""
    out, bad = [], []
    for path in sorted(glob.glob(os.path.join(EVENTS, "*", "data.json"))):
        slug = os.path.basename(os.path.dirname(path))
        if not SLUG.match(slug):
            bad.append(f"{slug}: the folder name is not a night (YYYY-MM-DD-name)")
            continue
        try:
            d = json.load(open(path, encoding="utf-8"))
        except (OSError, ValueError) as e:
            bad.append(f"{slug}: data.json does not read ({e})")
            continue
        media = (d.get("media") if isinstance(d, dict) else None) or []
        if not isinstance(d, dict) or not isinstance(media, list):
            bad.append(f"{slug}: data.json is not {{\"media\": [...]}}")
            continue
        if len(media) > 1000:
            bad.append(f"{slug}: {len(media)} frames, the map holds 1000 a night")
        stems, seen = [], {}
        for i, m in enumerate(media):
            t = (m.get("thumb") if isinstance(m, dict) else None) or ""
            t = t if isinstance(t, str) else ""
            hit = THUMB.match(t)
            stem = hit.group(1).lower() if hit else ""
            if not hit:
                bad.append(f"{slug} frame {i + 1}: thumb {t!r} is not media/<name>_t.jpg")
            elif not STEM.match(stem):
                bad.append(f"{slug} frame {i + 1}: {stem!r} is not a name the database takes (a-z 0-9 _ -, up to 41)")
            elif stem in seen:
                bad.append(f"{slug} frames {seen[stem] + 1} and {i + 1}: both are {stem!r}")
            else:
                seen[stem] = i
            stems.append(stem)
        out.append((slug, stems))
    if not out and not bad:
        bad.append(f"no events/*/data.json under {EVENTS}")
    if bad:
        sys.exit("framekeys.py: refused, nothing written\n  " + "\n  ".join(bad))
    return out


def block(ns):
    """the block text and how many frames it maps; one night per run of lines, eight frames a line"""
    rows = []
    for s, stems in ns:
        mine = [f"('{s}',{i},'{m}')" for i, m in enumerate(stems)]
        rows += ["  " + ",".join(mine[k:k + PER_LINE]) for k in range(0, len(mine), PER_LINE)]
    lines = [BEGIN, "delete from public.frame_positions where event_slug in (" + ", ".join(f"'{s}'" for s, _ in ns) + ");"]
    if rows:
        lines += ["insert into public.frame_positions (event_slug, frame, media) values", ",\n".join(rows) + ";"]
    lines.append(END)
    return "\n".join(lines), sum(len(stems) for _, stems in ns)


def split(text):
    """(before, current block, after); exit unless each marker is there exactly once, in order"""
    b, e = text.count(BEGIN + "\n"), text.count("\n" + END + "\n")
    if b != 1 or e != 1:
        sys.exit(f"framekeys.py: {os.path.basename(SQL)} needs each marker line exactly once "
                 f"(found {b} and {e}):\n  {BEGIN}\n  {END}")
    i = text.index(BEGIN + "\n")
    j = text.index("\n" + END + "\n", i) + 1 + len(END)
    return text[:i], text[i:j], text[j:]


def nights_in(cur):
    """{slug: [stem by position]} read back from a block, to name what drifted"""
    out = {}
    for s, i, m in re.findall(r"\('([^']+)',(\d+),'([^']+)'\)", cur):
        out.setdefault(s, {})[int(i)] = m
    return {s: [d[k] for k in sorted(d)] for s, d in out.items()}


def main():
    ap = argparse.ArgumentParser(description="write migration 043's FRAME MAP block from events/*/data.json")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if the block drifted from the nights on disk")
    a = ap.parse_args()
    if not os.path.isfile(SQL):
        sys.exit(f"framekeys.py: {SQL} is not there")
    ns = nights()
    want, n = block(ns)
    text = open(SQL, encoding="utf-8").read()
    head, cur, tail = split(text)
    if cur == want:
        print(f"frame map current: {n} frames on {len(ns)} nights")
        return 0
    if a.check:
        had, now = nights_in(cur), dict(ns)
        diff = sorted(s for s in set(had) | set(now) if had.get(s) != now.get(s))
        print(f"frame map DRIFTED from events/*/data.json: {', '.join(diff) or 'the block layout'}")
        print("run: /usr/bin/python3 framekeys.py   (then paste 043)")
        return 1
    with open(SQL, "w", encoding="utf-8") as f:
        f.write(head + want + tail)
    print(f"frame map written: {n} frames on {len(ns)} nights -> {os.path.basename(SQL)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
