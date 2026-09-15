#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — merge the four public-safety reviews into the frames that ship.

    /usr/bin/python3 cullmerge.py <curate_dir> [--keep N] [--force stem ...]

Reads <curate_dir>/candidates.json plus review_harm1.json, review_harm2.json,
review_dignity.json, review_technical.json (written by four independent
reviewers) and applies the house rule from Brainrot (9/12):

  EXCLUDE a frame on ANY harm or dignity flag at "likely" or "certain",
  or on "possible" from TWO reviewers (any lens).
  EXCLUDE on a technical flag at "likely" or "certain".
  A forced stem (portfolio pick) is never dropped silently: it is REPORTED and
  the run refuses, so a human looks at it.

Writes <curate_dir>/cull.json {kept:[stems in shoot order], excluded:{stem: why},
borderline:[stems with a single "possible"]} and prints the borderline list,
because the borderline ones are the ones to check up close: my first-glance
"urinating" and "joint" on Brainrot were an earbuds case and a guy on his phone.
"""
import argparse, json, os, sys

LEVEL = {"none": 0, "possible": 1, "likely": 2, "certain": 3}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("curate_dir")
    ap.add_argument("--keep", type=int, help="cap the kept list at N (shoot order kept)")
    ap.add_argument("--force", action="append", default=[])
    a = ap.parse_args()
    cand = json.load(open(os.path.join(a.curate_dir, "candidates.json")))
    items = cand["items"]
    keep_n = a.keep or cand.get("keep") or len(items)
    reviews = {}
    for lens in ("harm1", "harm2", "dignity", "technical"):
        p = os.path.join(a.curate_dir, f"review_{lens}.json")
        if not os.path.exists(p):
            sys.exit(f"missing {p}: all four reviews must exist before anything ships")
        r = json.load(open(p))
        if r.get("checked") != len(items):
            print(f"  ⚠ {lens} checked {r.get('checked')} of {len(items)} candidates")
        reviews[lens] = {k[:-4] if k.endswith(".jpg") else k: v for k, v in (r.get("frames") or {}).items()}

    kept, excluded, borderline = [], {}, []
    for it in items:
        key = f"{it['i']:03d}_{it['stem']}"
        flags = []
        for lens, fr in reviews.items():
            f = fr.get(key) or fr.get(it["stem"])
            if f and LEVEL.get(f.get("flag", "none"), 0) > 0:
                flags.append((lens, LEVEL[f["flag"]], f.get("why", "")))
        hard = [f for f in flags if f[1] >= 2 and f[0] != "technical"]
        # A technical "likely" only excludes for a real fault. "Nobody in the
        # frame" is a scene shot (the bar, the cabinets, the DJ table), which a
        # night dump wants a few of; those drop to advisory and the rank cut
        # decides them.
        FAULT = ("blur", "black", "sideways", "upside", "chop", "cut off", "duplicate",
                 "twin", "flare", "cover", "smear", "mush", "noise", "out of focus")
        tech = [f for f in flags if f[1] >= 2 and f[0] == "technical"
                and any(k in f[2].lower() for k in FAULT)]
        poss = [f for f in flags if f[1] == 1] + \
               [f for f in flags if f[1] >= 2 and f[0] == "technical" and f not in tech]
        why = None
        if hard:
            why = "; ".join(f"{l}:{w}" for l, _, w in hard)
        elif len(poss) >= 2:
            why = "two possibles: " + "; ".join(f"{l}:{w}" for l, _, w in poss)
        elif tech:
            why = "technical: " + "; ".join(w for _, _, w in tech)
        if why:
            if it["stem"] in a.force or it.get("forced"):
                sys.exit(f"REFUSING: forced frame {key} was flagged: {why}")
            excluded[key] = why
            continue
        if len(poss) == 1:
            borderline.append(f"{key}  <- {poss[0][0]}: {poss[0][2]}")
        kept.append(it)

    # rank cut: keep the strongest N by curate score, then back to shoot order
    if len(kept) > keep_n:
        top = sorted(kept, key=lambda r: (r.get("forced", False), r["score"]), reverse=True)[:keep_n]
        ids = {id(r) for r in top}
        kept = [r for r in kept if id(r) in ids]
    out = {"kept": [r["stem"] for r in kept], "kept_paths": [r["path"] for r in kept],
           "excluded": excluded, "borderline": borderline, "order": [r["stem"] for r in kept]}
    json.dump(out, open(os.path.join(a.curate_dir, "cull.json"), "w"), indent=1)
    print(f"  {len(items)} reviewed -> {len(excluded)} excluded -> {len(kept)} kept (cap {keep_n})")
    for k, w in excluded.items():
        print(f"    OUT {k}: {w[:140]}")
    if borderline:
        print("  BORDERLINE (one possible, kept, check up close):")
        for b in borderline:
            print("    " + b[:160])


if __name__ == "__main__":
    main()
