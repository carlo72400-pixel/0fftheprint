#!/usr/bin/env python3
"""Rebuild THE STREET (the front page, index.html + street/) whenever what it shows has changed.

The front page is BUILT, never hand-edited: the street kit (outside the repo, in Drive) reads this repo's stories, nights,
music, roster and videos and writes index.html and the files under street/. So the page is a snapshot, and a new night or
a pulled frame would not show on it until somebody remembered to run the kit. This helper is that somebody. Every script
that changes what the street shows calls it last (newevent.py, newstory.py, videos.py, takedown.py, framewall.py, stamp.py):

    import street_rebuild; street_rebuild.rebuild("a new night")

or by hand:  /usr/bin/python3 street_rebuild.py            (add --force to rebuild even when nothing changed)

Rules it keeps:
  - it NEVER fails the caller: no kit, a kit error, a timeout, anything, is one printed line and the page stays as it was
  - it only rebuilds when an input changed since the last good build (a fingerprint kept in the kit folder), so calling it
    twice, or from two scripts in a row, costs nothing the second time
  - it never commits and never pushes: it only writes index.html and street/ in the working tree
The kit folder comes from OTP_STREET_KIT, else KIT below. OTP_STREET_REBUILD=0 turns the whole thing off.
"""
import glob
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
KIT = "/Users/vmp/Google Drive/My Drive/03_PROJECTS/0ff-the-print/the-street/_build/site-build-2026-11-12"
PY = "/usr/bin/python3"          # the Mac's own Python: it has Pillow, which the kit needs

# what the street is built from, inside the repo
INPUTS = ["content/desk.json", "content/frames.json", "content/music.json", "content/rotation.json", "content/roster.json",
          "content/video.json", "events/events.json", "stamp.py", "supabase-config.js", "assets/js/desk.js"]
GLOBS = ["word/*/index.html", "events/*/data.json"]


def kit_dir():
    return os.environ.get("OTP_STREET_KIT") or KIT


def _mark(path):
    try:
        st = os.stat(path)
        return f"{st.st_size}:{int(st.st_mtime)}"
    except OSError:
        return "-"


def fingerprint(kit):
    """one hash over every input: the repo's data files (by content for the small ones, size and time for the many) and the kit's own code and data"""
    h = hashlib.sha256()
    for rel in INPUTS:
        p = os.path.join(ROOT, rel)
        h.update(rel.encode())
        h.update(hashlib.sha256(open(p, "rb").read()).digest() if os.path.exists(p) else b"-")
    for g in GLOBS:
        for p in sorted(glob.glob(os.path.join(ROOT, g))):
            h.update((os.path.relpath(p, ROOT) + _mark(p)).encode())
    for p in sorted(glob.glob(os.path.join(kit, "machine-tools", "*"))):
        base = os.path.basename(p)
        if os.path.isfile(p) and base.endswith((".py", ".js", ".css", ".html")) or base in ("ft_flyers.json",):
            h.update((base + _mark(p)).encode())
    h.update(_mark(os.path.join(kit, "..", "house_days.json")).encode())
    h.update(_mark(os.path.join(kit, "street", "s", "ft-flyers.webp")).encode())
    return h.hexdigest()


def _state_file(kit):
    return os.path.join(kit, ".site_build_state.json")


def rebuild(why="", force=False):
    """Rebuild the street for THIS repo if anything it shows has changed. Returns True when it rebuilt. Never raises."""
    tag = "street:"
    try:
        if os.environ.get("OTP_STREET_REBUILD") == "0":
            print(f"{tag} rebuild is switched off (OTP_STREET_REBUILD=0). The front page is as it was.")
            return False
        kit = kit_dir()
        builder = os.path.join(kit, "machine-tools", "build_street.py")
        if not os.path.exists(builder):
            print(f"{tag} NOT rebuilt, the street kit is not on this machine ({kit}). The front page is as it was.")
            return False
        fp = fingerprint(kit)
        state = {}
        try:
            state = json.load(open(_state_file(kit), encoding="utf-8"))
        except (OSError, ValueError):
            state = {}
        page = os.path.join(ROOT, "index.html")
        page_now = hashlib.sha256(open(page, "rb").read()).hexdigest() if os.path.exists(page) else ""
        last = state.get(ROOT) or {}
        if not force and last.get("inputs") == fp and last.get("page") == page_now:
            print(f"{tag} up to date, nothing it shows has changed" + (f" ({why})" if why else "") + ".")
            return False
        r = subprocess.run([PY, builder, kit, "--site", ROOT], capture_output=True, text=True, timeout=900)
        if r.returncode != 0:
            tail = (r.stderr.strip().splitlines() or ["no message"])[-1][:300]
            print(f"{tag} NOT rebuilt, the kit stopped: {tail}. The front page is as it was. Run it by hand to see: {PY} street_rebuild.py --force")
            return False
        line = next((l for l in r.stdout.splitlines() if l.startswith("site: index.html")), "site: built")
        page_now = hashlib.sha256(open(page, "rb").read()).hexdigest()
        state[ROOT] = {"inputs": fingerprint(kit), "page": page_now}
        try:
            json.dump(state, open(_state_file(kit), "w", encoding="utf-8"), indent=1)
        except OSError as e:
            print(f"{tag} rebuilt, but the kit folder would not take its note ({e}); the next call rebuilds again.")
        print(f"{tag} REBUILT the front page" + (f" ({why})" if why else "") + f". {line[6:]}. Not committed, not pushed.")
        return True
    except Exception as e:          # the caller's own work is done by now: never take it down with us
        print(f"{tag} NOT rebuilt ({type(e).__name__}: {e}). The front page is as it was.")
        return False


if __name__ == "__main__":
    rebuild("by hand", force="--force" in sys.argv)
    sys.exit(0)
