#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — re-render department pages from their data.json.

    /usr/bin/python3 reword.py                          # every department page
    /usr/bin/python3 reword.py seen-2026-09-19-zen-haus  # just this one

The sibling of repage.py, not a second mode inside it. When a department
template changes, this rebuilds every page that uses it WITHOUT re-cropping a
single frame, because the crops are already on disk and data.json remembers
their dimensions.

⛔ IT RENDERS THROUGH THE BUILDER'S OWN render(), never a copy of the template.
   The moment reword.py holds its own copy of the page HTML the two forks and
   half the archive silently stops matching the other half.
"""
import argparse, importlib.util, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WORD = os.path.join(ROOT, "word")

BUILDERS = {"seen": "newseen.py", "hourafter": "newhourafter.py",
            "allnight": "newallnight.py"}


def load_builder(fname):
    spec = importlib.util.spec_from_file_location(fname.replace(".py", ""),
                                                  os.path.join(ROOT, fname))
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [fname]              # keep argparse quiet
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def dept_slugs():
    return [s for s in sorted(os.listdir(WORD))
            if os.path.exists(os.path.join(WORD, s, "data.json"))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*", help="default: every department page")
    a = ap.parse_args()
    slugs = a.slugs or dept_slugs()
    if not slugs:
        sys.exit("no department pages under word/")

    mods, done = {}, 0
    for slug in slugs:
        story_dir = os.path.join(WORD, slug)
        dpath = os.path.join(story_dir, "data.json")
        if not os.path.exists(dpath):
            print(f"  SKIP {slug}: no data.json, not a department page")
            continue
        rec = json.load(open(dpath))
        dept = rec.get("dept")
        if dept not in BUILDERS:
            print(f"  SKIP {slug}: unknown dept {dept!r}")
            continue
        if dept not in mods:
            mods[dept] = load_builder(BUILDERS[dept])
        mods[dept].render(rec, story_dir)
        # ALL NIGHT nests its frames under chapters, so a flat count reports 0.
        n = (sum(len(c.get("frames", [])) for c in rec["chapters"]) if rec.get("chapters")
             else len(rec.get("people") or rec.get("frames") or []))
        print(f"  {slug}  {dept}  {n} frames re-rendered")
        done += 1

    if done:
        print(f"  {done} page(s). Check one, then:")
        print("  /usr/bin/python3 verifyword.py --local")
        print("  git add -A && git commit -m 'word: re-render departments' && git push")


if __name__ == "__main__":
    main()
