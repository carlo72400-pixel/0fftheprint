#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ONE PROFILE SEEDS: writes oneprofile-merge.sql from content/roster.json (10/11, his call 2).

    /usr/bin/python3 oneprofile_seeds.py                     # default: only the desk's own Crypt pic and song move
    /usr/bin/python3 oneprofile_seeds.py --only vamppsych,kav-man
    /usr/bin/python3 oneprofile_seeds.py --all               # every card holder's Crypt pic and song move
    /usr/bin/python3 oneprofile_seeds.py --check             # exit 1 when oneprofile-merge.sql is not what this writes

Migration 044 makes a card holder's card photo and song the same as their Crypt pic and song. The one-time merge is
two pastes in the SQL editor, after 043, 044 and 045:
    STEP 1  select * from public.face_plan('<SEEDS>'::jsonb);   writes nothing, one row per change
    STEP 2  select public.face_merge('<SEEDS>'::jsonb);         makes the changes, answers how many cards moved
SEEDS carries what the roster already shows in public, so nothing that plays today goes quiet:
    songs  {card: [spotify track id, start seconds]}   from theme_song / theme_start (22-character track ids only)
    links  {card: [{"p": "instagram", "h": handle}]}   from an instagram.com/<handle> link only
    only   [card, ...]                                 limits the Crypt pic and song copy (steps 1 and 1b) to these
                                                       cards; the songs and links go to every card either way
A card is the roster seat's card_slug, else its name run through the site's slugify.
The owner's answer was "only mine", so the default is "only": ["vamppsych"]. --all leaves "only" out.

⛔ Rerun this after any bake.py roster fold, so the seeds match the roster that is live.
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ROSTER = os.path.join(ROOT, "content", "roster.json")
OUT = os.path.join(ROOT, "oneprofile-merge.sql")
TRACK = re.compile(r"^https?://open\.spotify\.com/(?:intl-[a-z]{2}/)?track/([A-Za-z0-9]{22})(?:[/?#].*)?$")
IG = re.compile(r"^https?://(?:www\.)?instagram\.com/([A-Za-z0-9._]{1,30})/?(?:[?#].*)?$", re.I)
CARD = re.compile(r"^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$")


def slugify(t):
    """the site's slugify (index.html, and public.slugify in 002)"""
    s = re.sub(r"[^a-z0-9]+", "-", (t or "").lower()).strip("-")
    return s or None


def seeds(only):
    items = json.load(open(ROSTER, encoding="utf-8")).get("items") or []
    songs, links = {}, {}
    for it in items:
        card = (it.get("card_slug") or "").strip().lower() or slugify(it.get("name"))
        if not card or not CARD.match(card):
            continue
        m = TRACK.match((it.get("theme_song") or "").strip())
        if m:
            start = it.get("theme_start")
            start = int(start) if isinstance(start, (int, float)) and 0 <= start <= 3600 else 0
            songs[card] = [m.group(1), start]
        m = IG.match((it.get("link") or "").strip())
        if m:
            links[card] = [{"p": "instagram", "h": m.group(1).lower()}]
    out = {"songs": songs, "links": links}
    if only is not None:
        out["only"] = only
    return out


def sql_text(s):
    lit = json.dumps(s, separators=(",", ":"), ensure_ascii=True).replace("'", "''")
    scope = ("only these cards' Crypt pic and song move: " + ", ".join(s["only"])) if "only" in s else "every card holder's Crypt pic and song move"
    return "\n".join([
        "-- ============================================================",
        "-- ONE PROFILE MERGE (his call 2). Written by oneprofile_seeds.py from content/roster.json. Paste after 043, 044, 045.",
        "-- Run STEP 1, read every row, then STEP 2. Rerun oneprofile_seeds.py after any bake.py roster fold.",
        "-- ============================================================",
        "-- " + scope + ".",
        "-- The house seed songs and Instagram links below go to every card that has none, either way.",
        "-- STEP 1 writes nothing: one row per change STEP 2 would make (card, what, now, Crypt, seed, after).",
        "-- STEP 2 makes them and answers how many cards took their Crypt pic or song. A second STEP 2 answers 0.",
        "",
        "-- STEP 1",
        "select * from public.face_plan('" + lit + "'::jsonb);",
        "",
        "-- STEP 2",
        "select public.face_merge('" + lit + "'::jsonb);",
        "",
    ])


def main():
    ap = argparse.ArgumentParser(description="Write oneprofile-merge.sql from content/roster.json.")
    ap.add_argument("--only", default="vamppsych", help="comma list of cards whose Crypt pic and song move (default: vamppsych)")
    ap.add_argument("--all", action="store_true", help="every card holder's Crypt pic and song move ('only' left out)")
    ap.add_argument("--check", action="store_true", help="exit 1 when oneprofile-merge.sql differs from what this writes")
    a = ap.parse_args()
    only = None if a.all else [c.strip().lower() for c in a.only.split(",") if c.strip()]
    if only is not None:
        bad = [c for c in only if not CARD.match(c)]
        if bad or not only:
            print("not a card name: " + ", ".join(bad or ["(empty)"]), file=sys.stderr)
            return 1
    text = sql_text(seeds(only))
    if a.check:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur != text:
            print("oneprofile-merge.sql is out of date: run oneprofile_seeds.py", file=sys.stderr)
            return 1
        print("oneprofile-merge.sql matches the roster")
        return 0
    open(OUT, "w", encoding="utf-8").write(text)
    s = seeds(only)
    print("wrote %s: %d songs, %d links, %s" % (os.path.basename(OUT), len(s["songs"]), len(s["links"]),
                                                  "only " + ",".join(only) if only is not None else "every card"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
