#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TAKE IT DOWN: one frame off one night (10/11).

    /usr/bin/python3 takedown.py 2026-10-03-pulse-angels-3 17            # frame 17, the number under the photo
    /usr/bin/python3 takedown.py 2026-10-03-pulse-angels-3 --stem 017    # or by file name (media/017_t.jpg)
    /usr/bin/python3 takedown.py 2026-10-03-pulse-angels-3 17 --dry-run  # say what would change, write nothing

The Take It Down email (the Photos tab form, and the take it down link in a night page's lightbox)
names a night and a frame: the number the lightbox counter shows, 1 for the first. That number is
what this takes. Before, a removal was five laptop steps by hand, and the 08-25 Mix dump still shows
the gaps one left behind.

What it does, in order:
  1. drops the frame from events/<slug>/data.json, moves the night's cover in events.json if it was
     the cover, and rebuilds the page with repage.py (which also fixes the count in events.json)
  2. deletes the committed thumbnail (events/<slug>/media/<stem>_t.jpg), the only copy in this repo
  3. rebuilds content/frames.json (framewall.py), content/looks.json (looks.py) and /video/ (videos.py)
  4. redraws pack.webp when the frame was on the front, or when the night's hit moved onto a frame
     that is (both off the AUTOMATIC pick; a pack drawn with --frames you redraw yourself), and the
     link card preview.jpg when the frame is the one it was most likely drawn from
  5. prints what it cannot do for you, below

⛔ WHAT IT CANNOT DO, AND PRINTS INSTEAD:
  - the full size files on the GitHub release (and a clip's playable copy on the media repo's Pages).
    Until those go, the frame is still reachable by anyone holding the old link.
  - THE TAGS. "I'm in this one" is stored by POSITION (frame_tags.frame, 0 = the first frame), so
    every tag after the removed frame now points one photo too far. It prints the SQL that deletes
    the tags on the removed frame and moves the later ones down one. Paste it ONCE: twice shifts
    everybody twice. A tag keyed by file name instead of position is the real fix, and that is a
    migration (the owner's call, open).
  - the binder on people's phones keeps positions too (localStorage). Those drift by one on this
    night; nothing on the laptop can reach them.
  - git history still holds the thumbnail. Removing it from history is a force push, and not this.
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
sys.path.insert(0, ROOT)

# frame_tags.event_slug has this CHECK (migration 037), and the SQL below quotes the slug, so the
# same pattern gates it here
SLUG = r"[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}"
REL = re.compile(r"^https://github\.com/([^/]+/[^/]+)/releases/download/([^/]+)/([^/?#]+)$")
PAGES = re.compile(r"^https://([^./]+)\.github\.io/([^/]+)/(.+)$")


def stem_of(m):
    return os.path.basename(m.get("thumb") or "").replace("_t.jpg", "")


def urls_of(m):
    """every published copy of a frame: the lightbox file, the full file, and each look's pair"""
    out = []
    for u in [m.get("src"), m.get("full")] + [x for v in (m.get("looks") or []) for x in (v.get("src"), v.get("full"))]:
        if u and u not in out:
            out.append(u)
    return out


def og_guess(media):
    """newevent.og_source(): the share card is drawn off the first landscape photo, else the first photo"""
    photos = [i for i, m in enumerate(media) if m.get("type", "photo") == "photo"]
    for i in photos:
        if (media[i].get("w") or 0) >= (media[i].get("h") or 0) > 0:
            return i
    return photos[0] if photos else None


def tag_sql(slug, k):
    return f"""-- takedown.py: {slug}, frame {k + 1} came down. "I'm in this one" is stored by position
-- (frame_tags.frame, 0 = the first frame), so every tag after it moves down one.
-- Paste into the Supabase SQL editor ONCE, as one run. Running it twice shifts the tags twice.
begin;
delete from public.frame_tags where event_slug = '{slug}' and frame = {k};
do $fix$
declare f integer;
begin
  -- one frame at a time, lowest first: frame is part of the primary key, so moving them all in one
  -- update can collide with a row that has not moved yet
  for f in select distinct t.frame from public.frame_tags t
            where t.event_slug = '{slug}' and t.frame > {k} order by 1 loop
    update public.frame_tags set frame = f - 1 where event_slug = '{slug}' and frame = f;
  end loop;
end
$fix$;
commit;
"""


def gone(path):
    """the thumbnail is tracked in git, so it is never lost; the Trash keeps a local copy too"""
    if not os.path.exists(path):
        return False
    if os.path.exists("/usr/bin/trash"):
        if subprocess.run(["/usr/bin/trash", path], capture_output=True).returncode == 0:
            return True
    os.remove(path)
    return True


def main():
    ap = argparse.ArgumentParser(description="take one frame off one night")
    ap.add_argument("slug", help="the night, e.g. 2026-10-03-pulse-angels-3")
    ap.add_argument("frame", nargs="?", type=int, help="the number under the photo, 1 = the first")
    ap.add_argument("--stem", help="or the file name: 017, 017_t.jpg or media/017_t.jpg")
    ap.add_argument("--dry-run", action="store_true", dest="dry", help="say what would change, write nothing")
    ap.add_argument("--no-redraw", action="store_true", dest="no_redraw",
                    help="never redraw pack.webp or preview.jpg (they download frames off the release)")
    a = ap.parse_args()

    if not re.fullmatch(SLUG, a.slug):
        sys.exit("that is not a night (YYYY-MM-DD-name, the folder under events/)")
    d = os.path.join(EVENTS, a.slug)
    dj = os.path.join(d, "data.json")
    if not os.path.exists(dj):
        sys.exit(f"no night at events/{a.slug}/")
    if (a.frame is None) == (a.stem is None):
        sys.exit("give the frame number OR --stem, one of the two")
    data = json.load(io.open(dj, encoding="utf-8"))
    media = data["media"]
    n = len(media)
    if a.stem:
        want = os.path.basename(a.stem).replace("_t.jpg", "")
        want = re.sub(r"\.jpe?g$", "", want)
        k = next((i for i, m in enumerate(media) if stem_of(m) == want), None)
        if k is None:
            sys.exit(f"no frame named {want} on {a.slug}")
    else:
        if not 1 <= a.frame <= n:
            sys.exit(f"{a.slug} has {n} frames; {a.frame} is not one of them")
        k = a.frame - 1
    if n <= 1:
        sys.exit("that is the night's only frame; a whole night comes down by hand")
    m = media[k]
    stem = stem_of(m)
    left = media[:k] + media[k + 1:]

    import makepack
    old_hit, new_hit = makepack.hit_index(a.slug, n), makepack.hit_index(a.slug, n - 1)
    try:
        on_pack = [stem_of(media[i]) for i in makepack.pick_frames(a.slug, media)]
    except Exception:
        on_pack = []
    hit_stem = stem_of(left[new_hit])
    redraw_pack = stem in on_pack or hit_stem in on_pack
    redraw_og = og_guess(media) == k

    idx_path = os.path.join(EVENTS, "events.json")
    idx = json.load(io.open(idx_path, encoding="utf-8"))
    row = next((e for e in idx.get("items", []) if e.get("slug") == a.slug), None)
    new_cover = None
    if row and os.path.basename(row.get("cover") or "") == os.path.basename(m.get("thumb") or ""):
        pick = next((x for i, x in enumerate(left) if x.get("type", "photo") == "photo" and i != new_hit), left[0])
        new_cover = f"{a.slug}/{pick['thumb']}"

    print(f"\n{data.get('title')} ({a.slug}): frame {k + 1} of {n}, {m.get('type', 'photo')} {stem}"
          + (f", {len(m.get('looks') or [])} looks" if m.get("looks") else ""))
    print(f"  thumb   events/{a.slug}/{m.get('thumb')}")
    for u in urls_of(m):
        print(f"  online  {u}")
    print(f"  after   {n - 1} frames; frames {k + 2} to {n} each move down one")
    if new_cover:
        print(f"  cover   was this frame, moves to {new_cover}")
    if stem_of(media[old_hit]) != hit_stem:
        print(f"  the hit (the pack's chase card) moves: {stem_of(media[old_hit])} -> {hit_stem}")
    if redraw_pack:
        print("  pack    needs redrawing (" + ("this frame is on the front" if stem in on_pack else "the hit moved onto the front") + ")")
    if redraw_og:
        print("  card    preview.jpg was most likely drawn from this frame: needs redrawing")
    if a.dry:
        print("\n--dry-run: nothing written. The SQL it would hand you:\n")
        print(tag_sql(a.slug, k))
        return

    # 1. the record, the cover, the page (repage also writes the count into events.json)
    data["media"] = left
    data["count"] = len(left)
    json.dump(data, io.open(dj, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    import repage
    if new_cover:
        row["cover"] = new_cover
        repage.dump_like(idx_path, idx)
    repage.repage(repage.load_builder(), a.slug)

    # 2. the committed thumbnail
    if gone(os.path.join(d, m.get("thumb") or "")):
        print(f"  removed events/{a.slug}/{m.get('thumb')}")

    # 3. the indexes that copy frames out of data.json
    try:
        import framewall
        framewall.build()
    except BaseException as e:
        print(f"  contact sheet index not rebuilt ({e}); run framewall.py")
    try:
        r = subprocess.run([sys.executable, os.path.join(ROOT, "looks.py")], cwd=ROOT, capture_output=True, text=True)
        print("  " + (((r.stdout or "").strip().splitlines() or ["looks.json rebuilt"])[0] if r.returncode == 0
                      else f"looks not rebuilt; run looks.py"))
    except Exception as e:
        print(f"  looks not rebuilt ({e}); run looks.py")
    try:
        import videos
        videos.build()
    except BaseException as e:
        print(f"  tape not rebuilt ({e}); run videos.py")

    # 4. the pack front and the link card
    if redraw_pack:
        if a.no_redraw:
            print(f"  pack NOT redrawn (--no-redraw): /usr/bin/python3 makepack.py {a.slug}")
        else:
            try:
                makepack.build(a.slug)
            except BaseException as e:
                print(f"  pack not redrawn ({e}); /usr/bin/python3 makepack.py {a.slug} --frames N[,M]")
    if redraw_og:
        og = og_guess(left)
        if a.no_redraw or og is None:
            print("  preview.jpg NOT redrawn: it may still show this frame in every link preview")
        else:
            try:
                ne = repage.load_builder()
                src = makepack.frame_file(a.slug, left[og], None)
                datelong = datetime.strptime(data["date"], "%Y-%m-%d").strftime("%b %-d, %Y")
                ne.make_og(src, os.path.join(d, "preview.jpg"), data["title"], data["venue"], datelong)
                print(f"  preview.jpg redrawn from {stem_of(left[og])}")
            except Exception as e:
                print(f"  preview.jpg not redrawn ({e}); it may still show this frame in link previews")

    # anything else in the repo still pointing at it (a Who Played frame in music.json, a story)
    needles = [f"events/{a.slug}/{m.get('thumb')}"] + urls_of(m)
    hay = [os.path.join(ROOT, "index.html")] + \
          [os.path.join(ROOT, "content", f) for f in sorted(os.listdir(os.path.join(ROOT, "content"))) if f.endswith(".json")]
    word = os.path.join(ROOT, "word")
    if os.path.isdir(word):
        hay += [os.path.join(word, s, "index.html") for s in sorted(os.listdir(word))
                if os.path.exists(os.path.join(word, s, "index.html"))]
    still = []
    for p in hay:
        try:
            t = io.open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        if any(x in t for x in needles):
            still.append(os.path.relpath(p, ROOT))
    if still:
        print("\n  ⛔ STILL POINTS AT IT, fix by hand: " + ", ".join(still))

    # 5. what only you can do
    print("\n  ⛔ THE ONLINE COPIES. Until these go, the old link still opens the frame:")
    for u in urls_of(m):
        mr, mp = REL.match(u), PAGES.match(u)
        if mr:
            print(f"    gh release delete-asset {mr.group(2)} {mr.group(3)} -R {mr.group(1)} -y")
        elif mp:
            print(f"    the playable clip: delete {mp.group(3)} from {mp.group(1)}/{mp.group(2)}, commit, push")
        else:
            print(f"    {u}")
    print("\n  ⛔ THE TAGS. Paste this into the Supabase SQL editor once (members tagged after this frame")
    print("     are on the wrong photo until it runs):\n")
    print(tag_sql(a.slug, k))
    print("  Phones keep the binder by position too, so this night's binder drifts by one. Nothing reaches that.")
    print(f"\n  git add -A && git commit -m 'take down: {a.slug} frame {k + 1}' && git push")


if __name__ == "__main__":
    main()
