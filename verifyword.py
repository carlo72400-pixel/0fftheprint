#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — department page verifier.

    /usr/bin/python3 verifyword.py --local seen-2026-09-19-zen-haus
    /usr/bin/python3 verifyword.py --live  seen-2026-09-19-zen-haus
    /usr/bin/python3 verifyword.py --live --all

⛔ WHY THIS EXISTS AND WHY IT DOES NOT TOUCH THE DOM.
   On 2026-08-23 the grid was checked with

       imgs.filter(i => i.complete && i.naturalWidth === 0)

   which reported ZERO broken images while five frames were in fact 404ing.
   Department grids are loading="lazy", and an offscreen lazy image never
   reaches `complete`, so the && filtered every real failure out.
   DOM STATE IS NOT A VALID CHECK FOR THESE PAGES. This resolves every URL out
   of the SOURCE (data.json plus the src attributes in the page) and asks the
   filesystem or the server about each one.

⛔ GITHUB PAGES SERVES STALE HTML FOR A FEW MINUTES AFTER A PUSH, so --live
   polls for a marker string from the new page before it believes any 404. The
   attempt count is printed so a stale result is visibly different from a real
   failure.

⛔ CURLING ~50 PAGES URLS BACK TO BACK RETURNS A SPURIOUS 503 on a random one,
   so --live sleeps between requests and retries a single failure once.
"""
import argparse, json, os, re, sys, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

try:
    from PIL import Image
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
WORD = os.path.join(ROOT, "word")
DESK = os.path.join(ROOT, "content", "desk.json")
SITE = "https://0fftheprint.com"

EXPECT = {                       # dept -> (frame w, frame h) or None for free
    "seen": (1000, 1250),
    "hourafter": None,
    "allnight": None,
}
THUMB = (900, 1125)
SRC_RE = re.compile(r'<img[^>]+src="([^"]+)"')


def dept_slugs():
    out = []
    for s in sorted(os.listdir(WORD)):
        if os.path.exists(os.path.join(WORD, s, "data.json")):
            out.append(s)
    return out


def load(slug):
    p = os.path.join(WORD, slug, "data.json")
    if not os.path.exists(p):
        sys.exit(f"{slug} has no data.json, so it is not a department page")
    return json.load(open(p))


def units(d):
    """The frames of any department, flat. SEEN keys them `people`, THE HOUR
    AFTER keys them `frames`, and ALL NIGHT nests them under `chapters`."""
    if d.get("chapters"):
        return [fr for ch in d["chapters"] for fr in ch.get("frames", [])]
    return d.get("people") or d.get("frames") or []


def check_local(slug):
    d = load(slug)
    story_dir = os.path.join(WORD, slug)
    fails = []
    page_path = os.path.join(story_dir, "index.html")
    if not os.path.exists(page_path):
        return [f"{slug}/index.html missing"]
    page = open(page_path).read()

    # ⛔ A department page must NOT carry <article>. bake.py and word.js both
    #    rewrite whatever sits inside it, which would replace the grid with prose.
    if "<article" in page:
        fails.append(f"{slug}/index.html contains <article>, bake.py will overwrite it")

    items = units(d)
    if not items:
        fails.append(f"{slug}: data.json lists no people, frames or chapters")

    want = EXPECT.get(d.get("dept"))
    for it in items:
        f = os.path.join(story_dir, it["file"])
        if not os.path.exists(f):
            fails.append(f"{slug}/{it['file']} in data.json but not on disk")
            continue
        w, h = Image.open(f).size
        if (w, h) != (it.get("w"), it.get("h")):
            fails.append(f"{slug}/{it['file']} is {w}x{h}, data.json says {it.get('w')}x{it.get('h')}")
        if want and (w, h) != want:
            fails.append(f"{slug}/{it['file']} is {w}x{h}, the department frame is {want[0]}x{want[1]}")

    th = os.path.join(story_dir, "thumb.jpg")
    if not os.path.exists(th):
        fails.append(f"{slug}/thumb.jpg missing, the catalog card will be blank")
    elif Image.open(th).size != THUMB:
        fails.append(f"{slug}/thumb.jpg is {Image.open(th).size}, must be {THUMB[0]}x{THUMB[1]}")

    # every src in the page must exist next to it
    for src in SRC_RE.findall(page):
        if src.startswith(("http://", "https://", "data:", "../")):
            continue
        if not os.path.exists(os.path.join(story_dir, src)):
            fails.append(f"{slug}/index.html references {src}, not on disk")

    # the catalog card has to point at this page
    desk = json.load(open(DESK))["items"]
    card = next((x for x in desk if (x.get("link") or "").rstrip("/") == f"word/{slug}"), None)
    if not card:
        fails.append(f"{slug} has no card in content/desk.json, so nothing links to it")
    else:
        if not card.get("dept"):
            fails.append(f"{slug}: its desk card has no dept, it will filter under Story")
        if card.get("thumb") != f"word/{slug}/thumb.jpg":
            fails.append(f"{slug}: desk card thumb is {card.get('thumb')!r}")

    # consent, the thing that must never silently go missing
    for it in items:
        if d.get("dept") == "seen" and not it.get("consent"):
            fails.append(f"{slug}: {it.get('name')} has no consent note")
        if d.get("dept") == "hourafter" and it.get("face") and not it.get("consent"):
            fails.append(f"{slug}: {it['file']} is a readable face with no consent note")
        # ⛔ ALL NIGHT: the subject signed. Nobody else in the frame did.
        if d.get("dept") == "allnight" and it.get("others") and not it.get("consent"):
            fails.append(f"{slug}: {it['file']} carries third parties with no consent note")
    if d.get("dept") == "allnight":
        if not d.get("agreement"):
            fails.append(f"{slug}: no agreement recorded. A named subject in a long piece is "
                         f"not candid, and this is the field that says she agreed.")
        if not d.get("subject"):
            fails.append(f"{slug}: no subject recorded")
        names = [c.get("name") for c in d.get("chapters", [])]
        # ⛔ MUST MATCH newallnight.THESIS. This is a fails.append, so it exits 1:
        #    a three-act page under the old pair BUILDS and then cannot be pushed.
        for t in ("GETTING READY", "3AM"):
            if t not in names:
                fails.append(f"{slug}: missing act {t}, which is half the thesis")
    return fails


def fetch(url, tries=2):
    for i in range(tries):
        try:
            with urlopen(Request(url, headers={"User-Agent": "0tp-verify"}), timeout=20) as r:
                return r.status, r.read()
        except HTTPError as e:
            if e.code == 503 and i + 1 < tries:
                time.sleep(2); continue
            return e.code, b""
        except URLError as e:
            return f"ERR {e.reason}", b""
        finally:
            time.sleep(1)      # Pages rate limits a fast run into spurious 503s
    return "ERR", b""


def check_live(slug):
    d = load(slug)
    base = f"{SITE}/word/{slug}/"
    marker = d["num"]                      # the 0TP number is on every page
    status = None
    for attempt in range(1, 13):
        status, body = fetch(base)
        if status == 200 and marker.encode() in body:
            print(f"  {slug}: page live, marker {marker} found on attempt {attempt}")
            break
        time.sleep(5)
    else:
        return [f"{slug}: {base} never served a page containing {marker} "
                f"(last status {status}). Pages may still be stale, or the push did not land."]

    fails = []
    items = units(d)
    for it in items + [{"file": "thumb.jpg"}]:
        u = base + it["file"]
        st, _ = fetch(u)
        if st != 200:
            fails.append(f"{u} -> {st}")
    return fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?")
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if not a.local and not a.live:
        a.local = True
    slugs = dept_slugs() if a.all else ([a.slug] if a.slug else dept_slugs())
    if not slugs:
        sys.exit("no department pages found under word/")

    fails = []
    for s in slugs:
        if a.local:
            fails += check_local(s)
        if a.live:
            fails += check_live(s)

    if fails:
        print(f"\n  FAIL, {len(fails)} problem(s):")
        for f in fails:
            print(f"    · {f}")
        sys.exit(1)
    print(f"  PASS · {len(slugs)} page(s) · {'live' if a.live else 'local'}")


if __name__ == "__main__":
    main()
