#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TAKE IT DOWN: one frame off one night (10/11).

    /usr/bin/python3 takedown.py 2026-10-03-pulse-angels-3 17            # frame 17, the number under the photo
    /usr/bin/python3 takedown.py 2026-10-03-pulse-angels-3 --stem 017    # or by file name (media/017_t.jpg)
    /usr/bin/python3 takedown.py 2026-10-03-pulse-angels-3 17 --dry-run  # say what would change, write nothing
    /usr/bin/python3 takedown.py --pending                               # board takedowns the public list can see

The Take It Down email (the Photos tab form, and the take it down link in a night page's lightbox)
names a night, a frame (the number the lightbox counter shows, 1 for the first) and, since Wave 2,
the photo's file name ("Photo: 017"). Prefer the file name: a frame number shifts the moment any
earlier photo on that night comes down, the file name never does. Before, a removal was five laptop
steps by hand, and the 08-25 Mix dump still shows the gaps one left behind.

The board can take a photo down too (THE NIGHTS, "Take a photo down"). That takes the tags off at
once but cannot touch the files, so the photo stays up until this runs. THE TAKEDOWNS on the board
lists every one still up, each with the command to run here. The public list this script can read
(frames_down, migration 043, the publishable key) leaves a still-up photo OFF on purpose, so a
stranger is never pointed at a photo someone asked to have removed; --pending only catches a photo
marked gone that is somehow still in its night's data.json.

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
  - THE TAGS. Since migration 043, "I'm in this one" is stored by FILE NAME (frame_tags.media), so
    nobody else's tag moves when a photo comes out; only the tags on this photo have to go. This
    script only reads the database (the publishable key), it cannot write, so it prints one line,
        select public.frame_takedown_apply('<night>', '<file name>', <position>, 'takedown.py');
    to paste into the Supabase SQL editor. It takes the tags off this photo, logs the takedown and
    marks the photo gone, which clears the board's badge. Running it twice does nothing. Paste it
    even when the board took the photo down first: the tags are already off, and the line only
    marks it gone. A photo already off its night (takedown.py ran, the line was never pasted, and
    the board still counts it): run it again with --stem and it prints the same line, nothing else.
    BEFORE 043 IS IN the tags are still kept by position. A photo still has to come down the moment
    someone asks, so it asks frames_down first and, when 043 is missing, prints Wave 1's block that
    shifts the later tags down one instead. Paste that one ONCE, before 043 (it refuses once 043 is
    in), then run framekeys.py so 043's map matches the shorter night.
  - the binder on people's phones keeps positions (localStorage). Those drift by one on this
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
import urllib.error
import urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
# the repo has no .gitignore and the closing hint is git add -A, so importing makepack, repage,
# framewall and videos must not leave a __pycache__/ behind to be committed with the takedown
sys.dont_write_bytecode = True
sys.path.insert(0, ROOT)

# frame_tags.event_slug has this CHECK (migration 037), and the SQL below quotes the slug, so the
# same pattern gates it here
SLUG = r"[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}"
# frame_tags.media and frame_takedowns.media carry this shape (043, desk.js FRAME_NAME_OK): the thumb's
# file name, lowercased, the way framekeys.py writes the FRAME MAP
STEM = r"[a-z0-9][a-z0-9_-]{0,40}"
PASTE = ("Paste this into the Supabase SQL editor. Running it twice does nothing. Paste it even if you "
         "took the photo down on the board first: that marks it gone and clears the badge.")
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


def tag_sql(slug, stem, k):
    """The one line for the SQL editor (043). Tags are keyed by file name now, so nobody else's tag
    moves: frame_takedown_apply takes the tags off this photo, logs it and marks it gone. A second
    paste finds the log row and does nothing; after a board takedown it only marks the photo gone.
    k is the photo's position as it was (0 = the first), kept on the log for the record only; None
    for a photo already off the night (the log keeps no position then)."""
    stem = str(stem or "").lower()
    if not re.fullmatch(SLUG, slug) or not re.fullmatch(STEM, stem):
        return (f"-- takedown.py: {slug} / {stem!r} is not a shape the database takes "
                f"(night YYYY-MM-DD-name, file name a-z 0-9 _ -). Nothing to paste; tell Claude.\n")
    if k is None:
        return (f"-- takedown.py: {slug}, photo {stem} is already off the night.\n"
                f"select public.frame_takedown_apply('{slug}', '{stem}', null, 'takedown.py');\n")
    return (f"-- takedown.py: {slug}, photo {stem} (frame {k + 1}) came down.\n"
            f"select public.frame_takedown_apply('{slug}', '{stem}', {int(k)}, 'takedown.py');\n")


def tag_sql_by_position(slug, k):
    """BEFORE 043 ONLY: Wave 1's block. Tags are stored by position (frame_tags.frame, 0 = the first
    frame), so the tags on the removed frame go and every later one moves down one. Twice shifts
    twice, so it is pasted ONCE. It refuses once 043 is in (tags are by file name then, and this
    would only scramble the informational position column)."""
    if not re.fullmatch(SLUG, slug):
        return f"-- takedown.py: {slug} is not a night the database takes. Nothing to paste; tell Claude.\n"
    k = int(k)
    return f"""-- takedown.py: {slug}, frame {k + 1} came down BEFORE migration 043. "I'm in this one" is still
-- stored by position (frame_tags.frame, 0 = the first frame), so every tag after it moves down one.
-- Paste into the Supabase SQL editor ONCE, as one run, BEFORE 043. Running it twice shifts the tags twice.
begin;
do $fix$
declare f integer;
begin
  if to_regclass('public.frame_takedowns') is not null then
    raise exception 'Migration 043 is in: tags are kept by file name now. Paste the frame_takedown_apply line instead.';
  end if;
  delete from public.frame_tags where event_slug = '{slug}' and frame = {k};
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


def config():
    """url and the PUBLISHABLE key, off the same file every page loads. Never printed."""
    cfg = io.open(os.path.join(ROOT, "supabase-config.js"), encoding="utf-8").read()
    return (re.search(r'url:\s*"([^"]+)"', cfg).group(1).rstrip("/"),
            re.search(r'anonKey:\s*"([^"]+)"', cfg).group(1))


def _frames_down(slug=None):
    """rpc/frames_down (043): every photo the desk took down, newest first, no names. Anyone may read
    it. The apikey header alone first; Authorization is added only on a 401, the way the Crypt build
    reads the Run. Returns ("ok", rows), ("missing", None) when 043 is not in, or (why, None)."""
    url, key = config()
    body = json.dumps({"p_slug": slug} if slug else {}).encode()
    for auth in (False, True):
        h = {"apikey": key, "Content-Type": "application/json"}
        if auth:
            h["Authorization"] = "Bearer " + key
        req = urllib.request.Request(url + "/rest/v1/rpc/frames_down", data=body, headers=h, method="POST")
        try:
            return "ok", json.load(urllib.request.urlopen(req, timeout=20))
        except urllib.error.HTTPError as e:
            if e.code == 401 and not auth:
                continue
            return ("missing" if e.code == 404 else f"HTTP {e.code}"), None
        except Exception as e:
            return f"could not reach the database ({e})", None
    return "HTTP 401", None


def frames_down(slug=None):
    state, rows = _frames_down(slug)
    if state == "missing":
        sys.exit("frames_down is not in the database yet (migration 043 not pasted). Nothing to list.")
    if state != "ok":
        sys.exit(f"could not read the board's takedowns ({state}). Nothing listed.")
    return rows


# ⛔ A TAKEDOWN NEVER WAITS FOR 043. Someone asking for their photo to come down is the most
#    urgent thing this repo does, so before 043 the photo still comes off and the shift block
#    (tag_sql_by_position) is what gets pasted. It has to go in BEFORE 043: framekeys.py builds
#    043's FRAME MAP from the shorter data.json, so tags left unshifted would be backfilled one
#    photo off. framekeys.py --check says the map is stale after any takedown; rerun it then.
PRE_043 = ("Migration 043 is not in the database yet, so tags are still kept by position. Paste this "
           "ONCE, BEFORE 043 (it refuses once 043 is in), then run framekeys.py so 043's map matches "
           "the shorter night. Tell Claude if 043 went in first.")


def pending(slug=None):
    """Every board takedown whose photo is still in its night's data.json, with the command that
    finishes it. A photo already gone from data.json is done and stays quiet."""
    rows = frames_down(slug)
    nights, waiting, odd, elsewhere, off = {}, [], 0, set(), {}
    for r in rows if isinstance(rows, list) else []:
        s, stem = str(r.get("event_slug") or ""), str(r.get("media") or "").lower()
        if not re.fullmatch(SLUG, s) or not re.fullmatch(STEM, stem):
            odd += 1
            continue
        if s not in nights:
            dj = os.path.join(EVENTS, s, "data.json")
            nights[s] = json.load(io.open(dj, encoding="utf-8"))["media"] if os.path.exists(dj) else None
        media = nights[s]
        if media is None:
            elsewhere.add(s)
            continue
        k = next((i for i, m in enumerate(media) if stem_of(m).lower() == stem), None)
        if k is None:
            # off the night already. frames_down does not say whether its line was pasted (the
            # publishable key cannot read that), so these are named, not counted as waiting
            if stem not in off.setdefault(s, []):
                off[s].append(stem)
        elif (s, stem) not in [(w[0], w[1]) for w in waiting]:
            waiting.append((s, stem, k, len(media)))
    print(f"\n{len(rows) if isinstance(rows, list) else 0} photo(s) on the public takedown list"
          + (f" for {slug}" if slug else "") + f", {len(waiting)} still up on the night.")
    for s, stem, k, n in waiting:
        print(f"\n  {s}  photo {stem}, frame {k + 1} of {n}")
        print(f"    /usr/bin/python3 takedown.py {s} --stem {stem}")
    if elsewhere:
        print(f"\n  not in this repo (no events/<night>/data.json): {', '.join(sorted(elsewhere))}")
    if odd:
        print(f"\n  {odd} row(s) skipped: not a night or file name this script takes")
    if not waiting:
        print("  Nothing waiting that this list can see. A photo the board took down that is still up is "
              "kept off the public list: THE TAKEDOWNS on the board lists each one with its command.")
    else:
        print("\n  Run each one. Each prints one line for the SQL editor; the board's badge clears "
              "when it is pasted.")
    if off:
        print(f"\n  already off their night ({sum(len(v) for v in off.values())}):")
        for s in sorted(off):
            print(f"    {s}: {', '.join(off[s])}")
        print("  If the board still counts one of these, its line was never pasted. "
              "/usr/bin/python3 takedown.py <night> --stem <file name> prints it again (twice does nothing).")
    return len(waiting)


def was_on(slug, stem):
    """Was media/<stem>_t.jpg ever committed on this night? A name git never saw is a typo, and a typo
    must not get a line: frame_takedown_apply would log a photo that never existed and clear the
    night's position map."""
    r = subprocess.run(["git", "-C", ROOT, "log", "-n", "1", "--format=%H", "--",
                        f":(icase)events/{slug}/media/{stem}_t.jpg"], capture_output=True, text=True)
    return r.returncode == 0 and bool(r.stdout.strip())


def already_off(slug, want):
    """--stem names a photo that is not in data.json. When the board took it down or git knows it was
    on the night, hand back its line (marks it gone, takes off any tag still on it; twice does
    nothing). Otherwise it is not a photo of this night."""
    stem = want.lower()
    if not re.fullmatch(STEM, stem):
        sys.exit(f"no frame named {want} on {slug}")
    state, rows = _frames_down(slug)
    on_board = state == "ok" and any(str(r.get("media") or "").lower() == stem for r in rows or [])
    if not (on_board or was_on(slug, stem)):
        sys.exit(f"no frame named {want} on {slug}")
    if state == "missing":
        sys.exit(f"photo {stem} is already off {slug}. Migration 043 is not in yet, so there is nothing "
                 f"to paste by file name: if its tags were not shifted when it came down, tell Claude.")
    print(f"\n{slug}: photo {stem} is already off the night, so nothing on the laptop changes.")
    print("  " + ("The board took it down. " if on_board else "")
          + "If the board still counts it, or its line was never pasted after takedown.py ran, paste "
            "this into the Supabase SQL editor. It marks it gone and takes off any tag still on it; "
            "twice does nothing.\n")
    if state not in ("ok", "missing"):
        print(f"  (could not check the board's list: {state}. If the line says the function does not "
              f"exist, 043 is not in yet and there is nothing to paste.)\n")
    print(tag_sql(slug, stem, None))


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
    ap.add_argument("slug", nargs="?", help="the night, e.g. 2026-10-03-pulse-angels-3")
    ap.add_argument("frame", nargs="?", type=int, help="the number under the photo, 1 = the first")
    ap.add_argument("--stem", help="or the file name: 017, 017_t.jpg or media/017_t.jpg")
    ap.add_argument("--dry-run", action="store_true", dest="dry", help="say what would change, write nothing")
    ap.add_argument("--no-redraw", action="store_true", dest="no_redraw",
                    help="never redraw pack.webp or preview.jpg (they download frames off the release)")
    ap.add_argument("--pending", action="store_true",
                    help="list the photos the board took down that are still up, with the command for each "
                         "(give a night to list only that one); writes nothing")
    a = ap.parse_args()

    if a.pending:
        if a.slug and not re.fullmatch(SLUG, a.slug):
            sys.exit("that is not a night (YYYY-MM-DD-name, the folder under events/)")
        if a.frame is not None or a.stem:
            sys.exit("--pending only lists; take one down with: takedown.py <night> --stem <file name>")
        pending(a.slug)
        return
    if not a.slug:
        sys.exit("which night? takedown.py <night> <frame>, or takedown.py --pending")
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
        want = re.sub(r"(_t)?\.jpe?g$", "", os.path.basename(a.stem), flags=re.I)
        # the database and the board keep the name lowercased (framekeys.py), so match either way
        k = next((i for i, m in enumerate(media) if stem_of(m).lower() == want.lower()), None)
        if k is None:
            already_off(a.slug, want)
            return
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
    # the one check that needs the database: is 043 in? It picks what gets pasted (see PRE_043),
    # never whether the photo comes down
    state, _ = _frames_down(a.slug)
    if a.dry:
        print("\n--dry-run: nothing written. What it would hand you for the SQL editor:\n")
        if state == "missing":
            print("  \u26d4 " + PRE_043 + "\n")
            print(tag_sql_by_position(a.slug, k))
        else:
            print(tag_sql(a.slug, stem, k))
            if state != "ok":
                print(f"  (could not check whether migration 043 is in: {state}. Before 043 it hands you "
                      f"the shift block instead.)")
        return
    if state not in ("ok", "missing"):
        print(f"\n  \u26d4 could not check whether migration 043 is in ({state}). Going ahead, since the "
              f"photo has to come down. Both lines for the SQL editor are printed at the end; each one "
              f"refuses in the wrong database.")

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
    if state == "missing":
        print("\n  ⛔ THE TAGS. " + PRE_043 + "\n")
        print(tag_sql_by_position(a.slug, k))
    elif state == "ok":
        print("\n  ⛔ THE TAGS. " + PASTE)
        print("     Tags are kept by file name since migration 043, so nobody else's tag moved.\n")
        print(tag_sql(a.slug, stem, k))
    else:
        print("\n  ⛔ THE TAGS. The database could not say whether 043 is in. Paste the first line. If it "
              "says the function does not exist, 043 is not in yet: paste the block under it instead, ONCE.\n")
        print(tag_sql(a.slug, stem, k))
        print("  " + PRE_043 + "\n")
        print(tag_sql_by_position(a.slug, k))
    print("  Phones keep the binder by position, so this night's binder drifts by one. Nothing reaches that.")
    print(f"\n  git add -A && git commit -m 'take down: {a.slug} frame {k + 1}' && git push")


if __name__ == "__main__":
    main()
