#!/usr/bin/python3
"""bake.py — fold phone story edits (story_pages overrides) back into git.

The desk edits a story's body from a phone at /desk/word/. Those edits live in
the database, which is an OVERLAY: the committed page is still the render
floor, and a paused free-tier backend silently reverts every story to it. This
script is the loop that keeps the floor current:

    /usr/bin/python3 bake.py          # pull overrides, rewrite pages + source.md
    git add -A && git commit -m 'bake story edits' && git push
    # then tap "Clear override" in /desk/word/ (or run bake.py --clear-note)

Each rewritten page gets a NEW data-stamp. word.js ignores overrides whose
stamp no longer matches the page, so even a forgotten Clear cannot shadow the
newly committed body. That makes this script safe to run at any time.

Reads with the PUBLISHABLE key (story_pages is public-select); never needs a
secret.

Wave 2 (10/11) adds THE DESK FOLD, the board's story sheet coming home. A
site_overrides row in section 'desk' is keyed by a story's link (word/<slug>/):
  - hidden: the card leaves content/desk.json and word/<slug>/index.html becomes
    a pulled stub (noindex, no words), so view-source and crawlers lose it too,
    not just the browser. source.md, the editor's copy of the words, goes blank.
  - cleared again (no hidden row while the page is a stub): the page, source.md
    and the card come back from git, the newest revision that is not a stub.
  - title, dek, kicker, shelf: written into the card and into the page's head
    and header. Baked = REDUNDANT, so it gets cleared on the board.
House stories written from the phone (member_stories.house) bake under the
house byline with their own kicker and shelf.

    /usr/bin/python3 bake.py --seed-songs           # after the one-profile merge:
    /usr/bin/python3 bake.py --seed-songs --write   # roster seeds the database now holds
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
WORD = os.path.join(HERE, "word")

# the repo has no .gitignore and the closing hint is git add -A, so importing newstory (and
# issue, derive) must not leave a __pycache__/ behind to be committed with the bake
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)
from newstory import md_to_html, no_dash, slugify, SHELVES, STORY_META, STORY_ID, NUM_META  # noqa: E402  (same renderer, no drift)

cfg = open(os.path.join(HERE, "supabase-config.js")).read()
URL = re.search(r'url:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'anonKey:\s*"([^"]+)"', cfg).group(1)
CONTENT = os.path.join(HERE, "content")
DESK_JSON = os.path.join(CONTENT, "desk.json")


def esc_html(v):
    """Meta tag values are attribute content, so quotes and angles have to go."""
    return (str(v or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def save_json(path, doc):
    json.dump(doc, open(path, "w"), indent=2, ensure_ascii=False)
    open(path, "a").write("\n")


# ============================================================================
# THE SEED SONGS (Wave 2, owner step 6). roster.json carried a theme_song for the
# house seats because the database had none. The one-profile merge (face_merge)
# copies those seeds into profiles, and peopleMerge then plays the database song
# ALWAYS, so a seed left in git is a second copy that can only drift. This drops
# theme_song/theme_start from a roster item ONLY when the anon cards view already
# shows a song for that card_slug. Before the merge the view shows none, so this
# does nothing; run it after STEP 2, dry first.
# ⛔ JOSH FUEGO KEEPS HIS, whatever the view says (the owner's call).
# ============================================================================
SEED_KEEP = {"josh-fuego"}


def seed_songs(write):
    req = urllib.request.Request(
        f"{URL}/rest/v1/cards?select=card_slug,theme_song",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    try:
        rows = json.load(urllib.request.urlopen(req))
    except Exception as e:
        print(f"  cards view not reachable ({e}); roster.json left alone")
        return 1
    shown = {r.get("card_slug"): r.get("theme_song") for r in rows
             if r.get("card_slug") and r.get("theme_song")}
    path = os.path.join(CONTENT, "roster.json")
    doc = json.load(open(path))
    gone = []
    for it in doc.get("items", []):
        slug = it.get("card_slug") or slugify(str(it.get("name") or ""))
        if "theme_song" not in it and "theme_start" not in it:
            continue
        if slug in SEED_KEEP:
            print(f"  kept   {slug}: keeps the roster song (his call)")
            continue
        if slug not in shown:
            print(f"  kept   {slug}: the database shows no song for this card yet")
            continue
        it.pop("theme_song", None)
        it.pop("theme_start", None)
        gone.append(slug)
        print(f"  {'dropped' if write else 'drops '} {slug}: the card plays {shown[slug]} from the database")
    if gone and write:
        save_json(path, doc)
        print(f"  roster.json: {len(gone)} seed song(s) out. Rerun oneprofile_seeds.py, then commit.")
    elif gone:
        print(f"  dry run: {len(gone)} seed song(s) would go. Add --write to write roster.json.")
    else:
        print("  nothing to drop: no roster seed is in the database yet")
    return 0


# ⛔ A plain run WRITES (pages, content/*.json, card backs), so anything it does not know, --help included, stops
#    here instead of falling through to a full bake.
_args = sys.argv[1:]
if any(a in ("-h", "--help") for a in _args):
    print(__doc__)
    sys.exit(0)
if [a for a in _args if a not in ("--seed-songs", "--write")]:
    print("bake.py: unknown argument(s) " + " ".join(a for a in _args if a not in ("--seed-songs", "--write"))
          + ". Nothing baked. Run it with no arguments, or --seed-songs [--write]. --help prints the notes.")
    sys.exit(2)
if "--seed-songs" in _args:
    sys.exit(seed_songs("--write" in _args))

# ============================================================================
# THE BOARD'S OVERLAY, read ONCE and FIRST. The desk fold right below needs the
# desk's pulls before the story fold touches any page (a pulled page is a stub
# and takes no body), and the site fold further down needs every row.
# ============================================================================
sreq2 = urllib.request.Request(
    f"{URL}/rest/v1/site_overrides?select=section,item_key,patch,hidden,sort",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
try:
    site_ovs = json.load(urllib.request.urlopen(sreq2))
    site_ok = True
except Exception:
    site_ovs = []
    site_ok = False
    print("  (site_overrides not reachable; migration 014 not run yet?)")

redundant = []

# ============================================================================
# THE DESK FOLD (Wave 2, call 12): the board's story sheet (Pull it, retitle,
# reshelve) folded into content/desk.json and the page files.
#
# ⛔ A PULL HAS TO LEAVE THE FILE, NOT JUST THE BROWSER. word.js hides a pulled
#    story on load, but the words stay in word/<slug>/index.html, so view-source,
#    a crawler or a cached copy still reads them. So the bake rewrites the page to
#    a stub and blanks source.md (served right next to it). Nothing is deleted:
#    git holds every earlier version, and clearing the row brings them back. That
#    only holds for what is committed, so a folder with uncommitted changes waits.
#    The pictures beside the page stay served; the pull run names them.
# ⛔ THE STUB KEEPS THE NUMBER (NUM_META), so newstory.next_num never hands a
#    pulled story's 0TP number to the next one.
# ⛔ THE UN-PULL READS GIT, so it only runs when the overlay read worked. With the
#    database unreachable every stub would look un-pulled and come back at once.
# ============================================================================
PULLED_MARK = '<meta name="otp-pulled" content="1">'
PULLED_MD = "Pulled. The desk took this story down.\n"
PULLED_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex">
""" + PULLED_MARK + """
<title>Pulled &middot; 0FF THE PRINT</title>
<meta name="theme-color" content="#0a0a0d">
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#f2eef5;--muted:#8d8798;--line:rgba(255,255,255,.1);--pink:#ff79c6;--bg:#0a0a0d}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}
  .leopard-bar{height:7px;background:linear-gradient(90deg,#ff79c6,#caa9ff,#2f6bff,#ff79c6);background-size:300% 100%}
  .wrap{max-width:720px;margin:0 auto;padding:34px 20px 90px}
  a.back{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--muted);text-decoration:none}
  a.back:hover{color:var(--pink)}
  .kicker{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.3em;
    text-transform:uppercase;color:var(--pink);margin:34px 0 10px}
  .said{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:clamp(30px,6vw,46px);line-height:1}
  .foot{margin-top:30px;padding-top:20px;border-top:1px solid var(--line);
    font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted)}
  .foot a{color:var(--pink);text-decoration:none}
</style>
</head>
<body>
<div class="leopard-bar"></div>
<div class="wrap">
  <a class="back" href="../../#stories">&larr; The Stories &middot; 0FF THE PRINT</a>
  <div class="kicker">0FF THE PRINT</div>
  <p class="said">Pulled. The desk took this story down.</p>
  <div class="foot"><a href="../../#stories">Back to the stories &rarr;</a></div>
</div>
</body>
</html>
"""
DOT = chr(0xB7)
# what a pulled story leaves served next to its stub (bake never deletes them)
PICTURE = re.compile(r"\.(jpe?g|png|webp|gif|avif|svg|mp4|mov|webm)$", re.I)


def pulled_page(num):
    """The stub, holding the story's 0TP number (NUM_META) when it has one: newstory.next_num
    counts it, so the number stays taken while the story is down and comes back with it."""
    if not re.fullmatch(r"0TP-\d+", str(num or "")):
        return PULLED_PAGE
    return PULLED_PAGE.replace(PULLED_MARK, PULLED_MARK + "\n" + NUM_META.format(num), 1)


def word_slug(link):
    m = re.fullmatch(r"word/([a-z0-9][a-z0-9-]{0,90})/", str(link or ""))
    return m.group(1) if m else None


def _git(*args):
    return subprocess.run(["git", "-C", HERE] + list(args), capture_output=True)


def from_git(rel, ok):
    """(rev, text) of the newest of the last 30 revisions of rel that passes ok(), or (None, None)."""
    r = _git("log", "-n", "30", "--format=%H", "--", rel)
    if r.returncode != 0:
        return None, None
    for rev in r.stdout.decode().split():
        s = _git("show", f"{rev}:./{rel}")
        if s.returncode != 0:            # the file did not exist in that revision
            continue
        text = s.stdout.decode("utf-8", errors="replace")
        if ok(text):
            return rev, text
    return None, None


def card_from_git(link):
    """The desk.json card that linked here, from the newest revision that still had it."""
    r = _git("log", "-n", "30", "--format=%H", "--", "content/desk.json")
    if r.returncode != 0:
        return None, None
    for rev in r.stdout.decode().split():
        s = _git("show", f"{rev}:./content/desk.json")
        if s.returncode != 0:
            continue
        try:
            doc = json.loads(s.stdout.decode("utf-8"))
        except ValueError:
            continue
        hit = next((it for it in doc.get("items", []) if it.get("link") == link), None)
        if hit:
            return rev, hit
    return None, None


def _num(it):
    m = re.match(r"0TP-(\d+)", str(it.get("num") or ""))
    return int(m.group(1)) if m else -1


def put_card_back(items, card):
    """Newest number first, the order newstory.py keeps."""
    n = _num(card)
    at = next((i for i, it in enumerate(items) if _num(it) < n), len(items))
    items.insert(at, card)


def rehead(page, want):
    """The page's head and header block for the fields in want, through esc_html + no_dash."""
    if "title" in want:
        t = esc_html(want["title"])
        page = re.sub(r"<title>.*?</title>", lambda m: f"<title>{t} {DOT} 0FF THE PRINT</title>",
                      page, count=1, flags=re.S)
        for prop in ('property="og:title"', 'name="twitter:title"'):
            page = re.sub(r'(<meta %s content=")[^"]*(")' % re.escape(prop),
                          lambda m: m.group(1) + t + m.group(2), page, count=1)
        page = re.sub(r"(<h1[^>]*>).*?(</h1>)", lambda m: m.group(1) + t + m.group(2),
                      page, count=1, flags=re.S)
    if "dek" in want:
        d = esc_html(want["dek"])
        for prop in ('name="description"', 'property="og:description"', 'name="twitter:description"'):
            page = re.sub(r'(<meta %s content=")[^"]*(")' % re.escape(prop),
                          lambda m: m.group(1) + d + m.group(2), page, count=1)
        page = re.sub(r'(<div class="dek">).*?(</div>)', lambda m: m.group(1) + d + m.group(2),
                      page, count=1, flags=re.S)
    if "kicker" in want:
        k = esc_html(want["kicker"])
        page = re.sub(r'(<div class="kicker">).*?(</div>)', lambda m: m.group(1) + k + m.group(2),
                      page, count=1, flags=re.S)
    return page


desk_rows = [o for o in site_ovs if o.get("section") == "desk" and o.get("item_key")]
desk_doc = None
desk_changed = False
pulled_nums = []
if site_ok:
    desk_doc = json.load(open(DESK_JSON))
    ditems = desk_doc.get("items", [])
    held = {word_slug(o["item_key"]) for o in desk_rows if o.get("hidden")}

    # 1. PUT BACK FIRST: a stub with no hidden row was cleared on the board. Its card and
    #    page come back before the rows below run, so a retitle saved with the un-pull
    #    lands on the restored page instead of reading as "matches no story".
    if os.path.isdir(WORD):
        for slug in sorted(os.listdir(WORD)):
            page_path = os.path.join(WORD, slug, "index.html")
            if slug in held or not os.path.exists(page_path):
                continue
            if PULLED_MARK not in open(page_path).read():
                continue
            rev, text = from_git(f"word/{slug}/index.html", lambda t: PULLED_MARK not in t)
            if text is None:
                print(f"  ⛔ word/{slug}/ is still a pulled stub: git holds no earlier page "
                      f"in its last 30 revisions. Rebuild it with newstory.py.")
                continue
            open(page_path, "w").write(text)
            md_path = os.path.join(WORD, slug, "source.md")
            if os.path.exists(md_path) and open(md_path).read() == PULLED_MD:
                _, md = from_git(f"word/{slug}/source.md", lambda t: t != PULLED_MD)
                if md is not None:
                    open(md_path, "w").write(md)
            link = f"word/{slug}/"
            said = ""
            if not any(it.get("link") == link for it in ditems):
                crev, card = card_from_git(link)
                if card:
                    put_card_back(ditems, card)
                    desk_changed = True
                    said = f", card {card.get('num') or ''} back on the Stories tab"
                else:
                    said = ", but git has no card for it: add one by hand or it stays off the Stories tab"
            print(f"  put back word/{slug}/: the page is back from {rev[:7]}{said}")

    # 2. THE ROWS
    for o in desk_rows:
        key = o["item_key"]
        slug = word_slug(key)
        if not slug:
            redundant.append(("desk", key + "  (not a story link)"))
            continue
        page_path = os.path.join(WORD, slug, "index.html")
        card = next((it for it in ditems if it.get("link") == key), None)
        if o.get("hidden"):
            # ⛔ NEVER REDUNDANT while the page is there: the row IS the pull. Cleared, the
            #    next bake puts the story back (step 1).
            if card is None and not os.path.exists(page_path):
                redundant.append(("desk", key + "  (matches no story)"))
                continue
            num = (card or {}).get("num")
            if card is not None:
                ditems.remove(card)
                desk_changed = True
                if card.get("num"):
                    pulled_nums.append(card["num"])
                print(f"  desk dropped: {key} ({card.get('num') or 'no number'})")
            page = open(page_path).read() if os.path.exists(page_path) else None
            if page is not None and PULLED_MARK not in page:
                # ⛔ THE UN-PULL BRINGS BACK WHAT GIT HOLDS, NOTHING NEWER. A story newstory.py
                #    wrote, or a phone edit an earlier bake folded in, that is not committed yet
                #    would be gone for good under the stub. So a folder with changes git does not
                #    hold keeps its words this run; the card is off the Stories tab already.
                dirty = _git("status", "--porcelain", "--", f"word/{slug}/")
                if dirty.returncode != 0 or dirty.stdout.strip():
                    print(f"  ⛔ word/{slug}/ has changes git does not hold: commit, then bake again "
                          f"to pull it. Its words stay on the page until then.")
                    continue
                if not num:
                    m = re.search(r"This one is (0TP-\d+)\.", page)
                    num = m.group(1) if m else None
                open(page_path, "w").write(pulled_page(num))
                md_path = os.path.join(WORD, slug, "source.md")
                if os.path.exists(md_path):
                    open(md_path, "w").write(PULLED_MD)
                print(f"  pulled word/{slug}/: the words are off the page now; "
                      f"clear the row on the board to put it back")
                # only the words leave: the pictures next to the page are still served at their old
                # links. Nothing is deleted here; say which, in case a photo is the reason for the pull.
                pics = sorted(f for f in os.listdir(os.path.join(WORD, slug)) if PICTURE.search(f))
                if pics:
                    print(f"    still served at word/{slug}/: {', '.join(pics)}. Take them out by hand "
                          f"if a photo is the problem.")
            elif card is None:
                # baked in an earlier run: the card is off desk.json, so the board's catalog
                # (built from desk.json) may not list it. Say where the pull still lives.
                print(f"  still pulled: word/{slug}/ (its row on the board keeps it down; "
                      f"clear that row and bake to put it back)")
            continue
        if card is None:
            redundant.append(("desk", key + "  (matches no story)"))
            continue
        patch = o.get("patch") or {}
        want = {}
        for k in ("title", "dek", "kicker"):
            v = patch.get(k)
            if isinstance(v, str) and v.strip():
                want[k] = no_dash(v).strip().upper() if k == "kicker" else no_dash(v).strip()
        moved = []
        for k, v in want.items():
            if card.get(k) != v:
                card[k] = v
                moved.append(k)
        if "shelf" in patch:
            s = str(patch.get("shelf") or "")
            if s == "" and "shelf" in card:
                card.pop("shelf")
                moved.append("shelf")
            elif s in SHELVES and card.get("shelf") != s:
                card["shelf"] = s
                moved.append("shelf")
        if os.path.exists(page_path) and want:
            page = open(page_path).read()
            if PULLED_MARK not in page:
                new = rehead(page, want)
                if new != page:
                    open(page_path, "w").write(new)
                    moved.append("page")
        if moved:
            desk_changed = desk_changed or any(m != "page" for m in moved)
            print(f"  desk patched: {key} ({', '.join(sorted(set(moved)))})")
        elif patch:
            redundant.append(("desk", key))

    if desk_changed:
        save_json(DESK_JSON, desk_doc)
        print("  desk.json updated")

    # 3. THE ISSUE. A pulled number left in an issue's running order points at nothing,
    #    and issue.py close refuses on it. Its own check says so here instead of at close.
    if pulled_nums:
        try:
            import issue as _issue
            iss_doc = _issue.load(_issue.ISSUES, {"items": []})
            desk_now = _issue.load(_issue.DESK, {"items": []})
            for iss in iss_doc.get("items", []):
                for e in _issue.validate(iss, desk_now):
                    if any(n in e for n in pulled_nums):
                        print(f"  ⛔ issue {iss.get('id')}: {e}. "
                              f"issue.py remove {iss.get('id')} <number>, or put the story back.")
        except Exception as e:
            print(f"  (issue check skipped: {e})")

req = urllib.request.Request(
    f"{URL}/rest/v1/story_pages?select=slug,body_md,stamp,updated_at",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
rows = json.load(urllib.request.urlopen(req))
if not rows:
    print("no story overrides in the database.")

baked = 0
for row in rows:
    slug = row["slug"]
    # ⛔ BELT AND BRACES BEHIND THE /desk/word/ FILTER. bake.py never reads
    #    desk.json (it only imports two functions from newstory), so a slug
    #    prefix is the ONLY signal it has that a page is a department page.
    #    The staleness guard below does not save them either: it fires on a
    #    <article data-stamp="..."> that a department page does not have.
    #    That is why the slug convention is load bearing, not cosmetic.
    if slug.startswith(("seen-", "hour-after-", "all-night-")):
        print(f"  SKIP {slug}: department page, not a prose story")
        continue
    story_dir = os.path.join(WORD, slug)
    page_path = os.path.join(story_dir, "index.html")
    if not os.path.exists(page_path):
        print(f"  SKIP {slug}: no such story on disk (toss the row at the desk)")
        continue

    page = open(page_path).read()
    # a pulled story is a stub with no <article>, and this fold would write the words straight
    # back into source.md next to it. The edit waits; it bakes once the story is put back.
    if PULLED_MARK in page:
        print(f"  SKIP {slug}: pulled by the desk. The edit bakes once the story is put back.")
        continue
    cur_stamp_m = re.search(r'<article data-stamp="([a-f0-9]{8})">', page)
    cur_stamp = cur_stamp_m.group(1) if cur_stamp_m else None
    if row.get("stamp") and cur_stamp and row["stamp"] != cur_stamp:
        print(f"  SKIP {slug}: override is STALE (page baked since it was written). "
              f"Clear it at /desk/word/.")
        continue

    md = no_dash(row["body_md"])
    if not md.endswith("\n"):
        md += "\n"
    # md_to_html sys.exit()s on a missing local image or a local video. One bad
    # phone edit must not stop the rest of the bake, so it is a SKIP here.
    try:
        body = md_to_html(md, story_dir, story_dir)
    except SystemExit as e:
        print(f"  SKIP {slug}: {e}")
        continue
    new_stamp = format(zlib.crc32(md.encode()) & 0xFFFFFFFF, "08x")

    page = re.sub(r'<article( data-stamp="[a-f0-9]{8}")?>',
                  f'<article data-stamp="{new_stamp}">', page, count=1)
    page = re.sub(r'(<article[^>]*>)(.*?)(</article>)',
                  lambda m: m.group(1) + "\n" + body + "\n  " + m.group(3),
                  page, count=1, flags=re.S)
    open(page_path, "w").write(page)
    open(os.path.join(story_dir, "source.md"), "w").write(md)
    baked += 1
    print(f"  baked {slug}  ({len(md)} chars, stamp {new_stamp})")

print(f"\n{baked} page(s) rewritten.")

# ============================================================================
# MEMBER STORIES (migration 010): promote published, unbaked stories into real
# static catalog pages. Each one gets the next 0TP number, a cover, a thumb,
# and a desk.json card via newstory.py, with the member's name on the byline.
# Wave 2 (045): a HOUSE row (the desk's WRITE ONE from the phone) bakes under the
# house byline with its own kicker (THE WORD when it has none) and its shelf.
# ============================================================================
import html as _html
import tempfile

# ⛔ THE FOLDER IS THE DATABASE SLUG, NEVER THE TITLE. The desk can retitle a member
#    story (desk/, board.js) and the slug stays pinned (migration 010's guard), while
#    newstory.py names the folder slugify(--title) unless it is handed --slug. So a
#    retitled story baked into word/<new-title>/, the writer's card page linked
#    word/<slug>/ (a 404 with their name on it), and the next run found word/<slug>/
#    missing and promoted the same story again under a second 0TP number.
NEWSTORY = os.path.join(HERE, "newstory.py")
TAKES_SLUG = '"--slug"' in open(NEWSTORY).read()
# member_stories.id (a bigint, so a JSON number: str() it), the shape newstory.py --story-id takes
STORY_ID_OK = re.compile(STORY_ID)


def _word_stories(cols):
    return json.load(urllib.request.urlopen(urllib.request.Request(
        f"{URL}/rest/v1/word_stories?select={cols}&baked=eq.false",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})))


try:
    stories = _word_stories("id,slug,title,dek,body_md,cover_url,display_name,baked,house,kicker,shelf")
except urllib.error.HTTPError:
    # before migration 045 the view has no house/kicker/shelf, and asking for them is a 400
    try:
        stories = _word_stories("id,slug,title,dek,body_md,cover_url,display_name,baked")
    except Exception:
        stories = []
        print("  (word_stories view not reachable; migration 010 not run yet?)")
except Exception:
    stories = []
    print("  (word_stories view not reachable; migration 010 not run yet?)")
promoted = []
for st in stories:
    slug = st["slug"]
    house = bool(st.get("house"))
    kicker = no_dash(st.get("kicker") or "THE WORD").upper() if house else "FROM THE FLOOR"
    shelf = st.get("shelf") if st.get("shelf") in SHELVES else None
    link = f"word/{slug}/"
    page_path = os.path.join(WORD, slug, "index.html")
    try:
        card = next((it for it in json.load(open(DESK_JSON))["items"] if it.get("link") == link), None)
    except Exception:
        card = None
    # ALREADY PROMOTED = desk.json already carries a card for word/<slug>/ AND it is this
    # row's: an earlier run baked this story and nobody tapped BAKED yet.
    # ⛔ Member slugs are unique only among member stories, so a card there can also be a
    #    HOUSE story that owned the slug first. A member row tells them apart by kicker (no
    #    git story carries FROM THE FLOOR). A HOUSE row cannot: a git story can carry the
    #    same kicker, and calling that "already promoted" put the row on the Baked list
    #    while it never reached the catalog. So a house row needs the page to carry its
    #    story id (STORY_META, written by newstory.py --story-id at promotion). That holds
    #    through a desk retitle and a phone edit. Anything else is a SKIP.
    if card is not None:
        who = _html.escape(no_dash(st.get("display_name") or "a card holder"))
        page = open(page_path).read() if os.path.exists(page_path) else ""
        sid = str(st.get("id") or "")
        by_id = bool(STORY_ID_OK.fullmatch(sid)) and STORY_META.format(sid) in page
        if by_id or (not house and (card.get("kicker") == kicker or (
                f"<b>{who}</b>" in page and '<div class="kicker">FROM THE FLOOR</div>' in page))):
            promoted.append(slug)
            print(f"  story {slug}: already in the catalog from an earlier bake (tap BAKED for it)")
        else:
            print(f"  \u26d4 SKIP story {slug}: another story already holds word/{slug}/ "
                  f"({card.get('num') or 'no number'}, {card.get('kicker') or 'no kicker'}). "
                  f"This one cannot bake under that name, so it stays live at "
                  f"word/live/?s={slug} and unbaked.")
        continue
    if os.path.exists(page_path):
        # a page with no card: a pulled story's stub, or a house page off the Stories tab
        print(f"  \u26d4 SKIP story {slug}: a page already lives at word/{slug}/ with no card "
              f"(a pulled story?). This one stays live at word/live/?s={slug} and unbaked.")
        continue
    if not TAKES_SLUG and slugify(st["title"]) != slug:
        print(f"  \u26d4 SKIP story {slug}: retitled at the desk ({st['title']!r}), and this "
              f"newstory.py has no --slug, so it would land at word/{slugify(st['title'])}/ "
              f"while the writer's card page links word/{slug}/. Give newstory.py --slug first.")
        continue
    with tempfile.TemporaryDirectory() as td:
        draft = os.path.join(td, "draft.md")
        open(draft, "w").write(st["body_md"])
        cover = os.path.join(td, "cover.jpg")
        if st.get("cover_url"):
            try:
                urllib.request.urlretrieve(st["cover_url"], cover)
            except Exception:
                cover = None
        else:
            cover = None
        if not cover:
            # house plate when the member skipped the cover
            cover = os.path.join(HERE, "assets", "take-01-manifesto.jpg")
        # a house row takes newstory's own byline (0FF THE PRINT), so no --author
        r = subprocess.run(
            [sys.executable, NEWSTORY, draft,
             "--title", st["title"], "--dek", st["dek"], "--cover", cover,
             "--kicker", kicker]
            + ([] if house else ["--author", st.get("display_name") or "a card holder"])
            + (["--shelf", shelf] if shelf else [])
            + (["--story-id", str(st["id"])] if STORY_ID_OK.fullmatch(str(st.get("id") or "")) else [])
            + (["--slug", slug] if TAKES_SLUG else []),
            capture_output=True, text=True)
        if r.returncode != 0:
            print(f"  FAILED story {slug}: {r.stderr.strip().splitlines()[-1] if r.stderr else r.stdout}")
            continue
    promoted.append(slug)
    print(f"  promoted {'house ' if house else ''}story {slug} into the catalog")

# ============================================================================
# SEED OVERRIDES (migration 011): fold the desk's seed edits/hides into
# content/take.json. Keys are sha256(author + '|' + text)[:16], identical to
# OTP.seedKey in desk.js — once written here the hash changes and the override
# goes inert on its own (the desk lists inert ones for a clear).
# ============================================================================
import hashlib

oreq = urllib.request.Request(
    f"{URL}/rest/v1/seed_overrides?select=key,hidden,new_text",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
try:
    ovs = {o["key"]: o for o in json.load(urllib.request.urlopen(oreq))}
except Exception:
    ovs = {}
    print("  (seed_overrides not reachable; migration 011 not run yet?)")
if ovs:
    take_path = os.path.join(HERE, "content", "take.json")
    take = json.load(open(take_path))
    kept, changed = [], 0
    for item in take.get("items", []):
        k = hashlib.sha256(
            (str(item.get("author") or "") + "|" + str(item.get("text") or "")).encode()
        ).hexdigest()[:16]
        o = ovs.get(k)
        if o and o.get("hidden"):
            changed += 1
            print(f"  seed dropped: {str(item.get('text'))[:50]!r}")
            continue
        if o and o.get("new_text"):
            item["text"] = o["new_text"]
            changed += 1
            print(f"  seed rewritten: {o['new_text'][:50]!r}")
        kept.append(item)
    if changed:
        take["items"] = kept
        json.dump(take, open(take_path, "w"), indent=2, ensure_ascii=False)
        print(f"  take.json updated ({changed} seed change(s) baked in)")
    else:
        print("  no seed overrides matched the current file")

# ============================================================================
# SITE OVERRIDES (migration 014): fold the desk's front-page edits into
# content/work.json, content/roster.json and content/slate.json.
#
# ⚠️ THESE DO NOT SELF-HEAL, and that is the difference from seed_overrides
# above. A seed override is keyed on sha256(author|text), so baking the edit
# changes the hash and the row goes inert by itself. These are keyed on a
# STABLE identity (a filename, a member name, the empty string), so after a
# bake the row still matches and would silently re-apply on top of any LATER
# git edit to the same field. So: bake, then report every row that is now
# identical to the file as REDUNDANT so it gets cleared at the desk.
#
# bake.py reads with the publishable key and site_overrides is admin-write, so
# it cannot delete the rows itself. Printing them is the whole mechanism.
# The rows (site_ovs) and the redundant list were read at the top, with the
# desk fold; esc_html lives up there too.
# ============================================================================


def _base(p):
    """work.json stores assets/work/x.jpg, derive.py renders
    assets/grid/work/x.jpg. The basename is the only key both agree on."""
    return str(p or "").split("/")[-1]


# ============================================================================
# A FRAME ADDED FROM THE PHONE (board.js ADD A FRAME) is a row whose patch.src is
# its Supabase storage URL. Copying that URL into work.json was not enough: /work/
# only shows assets/... files and paints derive.py's assets/grid/ copy, so an added
# frame never reached the archive, even after a bake, and every rail link after it
# opened the wrong frame. So the bake brings the file home under the SAME basename
# (the row's item_key), which also means the row keeps matching the frame afterwards
# and reads as REDUNDANT below instead of re-pointing src at storage on every bake.
# ============================================================================
STORAGE = URL.rstrip("/") + "/storage/v1/object/public/"
WORK_DIR = os.path.join(HERE, "assets", "work")
fetched = []


def localize_work(patch, item=None):
    src = str(patch.get("src") or "")
    if not src.startswith(STORAGE):
        return patch
    name = _base(src).split("?")[0]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:jpe?g|png)", name, re.I):
        return patch                  # derive.py only builds jpg/png, so leave anything else on storage
    dst = os.path.join(WORK_DIR, name)
    if not os.path.exists(dst):
        tmp = dst + ".part"
        try:
            os.makedirs(WORK_DIR, exist_ok=True)
            urllib.request.urlretrieve(src, tmp)
            from PIL import Image
            with Image.open(tmp) as im:
                im.verify()
            os.replace(tmp, dst)
            fetched.append(name)
            print(f"  work: fetched {name} into assets/work/")
        except Exception as e:
            if os.path.exists(tmp):
                os.remove(tmp)
            print(f"  work: could not fetch {name} ({e}); it stays on storage and /work/ skips it")
            return patch
    out = dict(patch)
    out["src"] = "assets/work/" + name
    if not (out.get("w") and out.get("h")):
        try:
            from PIL import Image, ImageOps
            with Image.open(dst) as im:
                im = ImageOps.exif_transpose(im)
                out["w"], out["h"] = im.width, im.height
        except Exception:
            pass
    return out


def bake_list(section, filename, key_of, allow_add=None, localize=None):
    """Apply the section's overrides to a {"items":[...]} content file.
    allow_add: a predicate on a row's patch; a row that matches no item and
    passes it is an ADDITION made from a phone (see below)."""
    rows = [o for o in site_ovs if o.get("section") == section]
    if not rows:
        return 0
    path = os.path.join(CONTENT, filename)
    doc = json.load(open(path))
    by_key = {o["item_key"]: o for o in rows}
    out, changed = [], 0
    matched = set()
    for item in doc.get("items", []):
        k = key_of(item)                      # BEFORE the patch: a swap moves it
        o = by_key.get(k)
        if not o:
            out.append(item)
            continue
        matched.add(k)
        if o.get("hidden"):
            changed += 1
            print(f"  {section} dropped: {k}")
            continue
        patch = o.get("patch") or {}
        if localize:
            patch = localize(patch, item)
        already = all(item.get(kk) == v for kk, v in patch.items())
        if patch and not already:
            item = dict(item)
            item.update(patch)
            changed += 1
            print(f"  {section} patched: {k} ({', '.join(sorted(patch))})")
        elif patch and already:
            redundant.append((section, o["item_key"]))
        if o.get("sort") is not None:
            item = dict(item)
            item["_sort"] = o["sort"]
        out.append(item)
    # An override whose key matches nothing is INERT: either it was baked and the
    # bake changed the very field its key derives from (a swapped rotation seed
    # rewrites its own link, so the key moves), or the item is gone from the
    # file. It can never apply again, and left alone it sits on the desk looking
    # like a live edit forever.
    # ⛔ OPT IN, and only THE WORK and THE ROTATION pass it, each with its own
    # test. A row that matches nothing is normally inert, but a work row carrying
    # its own src (ADD A FRAME) or a rotation row whose link is a Spotify track
    # (ADD A TRACK) is an ADDITION made from a phone, and folding it in is the
    # whole point of the bake. The page's applyList takes the same two tests.
    if allow_add:
        for o in rows:
            k = o["item_key"]
            if k in matched or o.get("hidden"):
                continue
            patch = o.get("patch") or {}
            if not allow_add(patch):
                continue
            if localize:
                patch = localize(patch)
            item = dict(patch)
            if o.get("sort") is not None:
                item["_sort"] = o["sort"]
            out.append(item)
            matched.add(k)
            changed += 1
            print(f"  {section} ADDED: {k}")
    for o in rows:
        if o["item_key"] not in matched:
            redundant.append((section, o["item_key"] + "  (matches nothing in the file)"))
    if any("_sort" in i for i in out):
        out.sort(key=lambda i: i.get("_sort", 0))
        for i in out:
            i.pop("_sort", None)
        changed += 1
    if changed:
        doc["items"] = out
        json.dump(doc, open(path, "w"), indent=2, ensure_ascii=False)
        open(path, "a").write("\n")
        print(f"  {filename} updated ({changed} change(s) baked in)")
    return changed

if site_ovs:
    bake_list("work", "work.json", lambda it: _base(it.get("src")),
              allow_add=lambda p: bool(p.get("src")), localize=localize_work)
    if fetched:
        # the grid and /work/ paint assets/grid/work/<name>, not the 1600px file
        try:
            import derive
            derive.build()
        except Exception as e:
            print(f"  ⛔ derive.py did not run ({e}). Run it before the push, or the new "
                  f"frame shows blank on the grid and on /work/.")
    bake_list("roster", "roster.json", lambda it: str(it.get("name") or ""))
    # creators only ever has rows once migration 017 widens the section CHECK.
    # Before that this is a no-op, which is why it is safe to ship first.
    bake_list("creators", "creators.json", lambda it: str(it.get("name") or ""))

    # rotation seeds key on the spotify id inside their link, matching
    # parseSpotifyId on the page and the pencil in edit.js
    def _sp(link):
        m = re.search(r"(?:track/|spotify:track:)([A-Za-z0-9]{22})", str(link or ""))
        return m.group(1) if m else ""
    # ADD A TRACK on the board writes a row keyed on the new track's id that matches
    # nothing yet, so the rotation passes the add test too: the link has to parse to
    # a Spotify track. A patched item keeps every key the row does not name, so a
    # winner's `won` object (build_music.py close) survives a bake.
    # ⛔ The page's seed check (index.html seedIds): a row whose track is ALREADY on
    # rotation.json is not a new track. A swap row an earlier bake folded keeps the
    # old seed as its key and the folded seed as its link, so without this it came
    # back as a second tile of the same song.
    _seed_ids = {_sp(it.get("link")) for it in json.load(open(os.path.join(CONTENT, "rotation.json"))).get("items", [])} - {""}
    bake_list("rotation", "rotation.json", lambda it: _sp(it.get("link")),
              allow_add=lambda p: bool(_sp(p.get("link"))) and _sp(p.get("link")) not in _seed_ids)

    # site.json is flat key/value, not a list of items: item_key IS the field
    # name and patch.value is the new value. ticker_headlines is stored
    # pipe-separated by the editor, so it splits back into a list here.
    site_rows = [o for o in site_ovs if o.get("section") == "site" and o.get("item_key")]
    if site_rows:
        spath2 = os.path.join(CONTENT, "site.json")
        sdoc2 = json.load(open(spath2))
        n = 0
        # A DOTTED key writes into a nested block, matching what the page does
        # with setPath(): 'mic_check.vibe' and 'social.instagram' are ordinary
        # fields now, not laptop-only ones.
        def _get(doc, path):
            cur = doc
            for part in str(path).split("."):
                if not isinstance(cur, dict) or part not in cur:
                    return None
                cur = cur[part]
            return cur

        def _set(doc, path, val):
            parts = str(path).split(".")
            cur = doc
            for part in parts[:-1]:
                if not isinstance(cur.get(part), dict):
                    cur[part] = {}
                cur = cur[part]
            cur[parts[-1]] = val

        # ⛔ fields whose element left the page: a row for one bakes into a key
        #    nothing reads, so it is listed to clear instead
        dead = {"pulse_route": "the route line left the page on 8/26"}
        for o in site_rows:
            if o.get("hidden"):
                continue
            k = o["item_key"]
            if k in dead:
                redundant.append(("site", f"{k}  (nothing on the page reads it: {dead[k]})"))
                continue
            v = (o.get("patch") or {}).get("value")
            if v is None:
                continue
            # ⛔ Same list as index.html's applier. Both split, or the baked
            # file gets a string where the page expects an array.
            if k in ("ticker_headlines", "why.bullets", "rooms_box"):
                v = [x.strip() for x in str(v).split("|") if x.strip()]
            if _get(sdoc2, k) == v:
                redundant.append(("site", k))
                continue
            _set(sdoc2, k, v)
            n += 1
            print(f"  site patched: {k}")
        if n:
            json.dump(sdoc2, open(spath2, "w"), indent=2, ensure_ascii=False)
            open(spath2, "a").write("\n")
            print(f"  site.json updated ({n} field(s) baked in)")

    # slate is a single object, not a list: item_key '' patches slate.next
    sl = next((o for o in site_ovs
               if o.get("section") == "slate" and o.get("item_key") == ""), None)
    if sl:
        spath = os.path.join(CONTENT, "slate.json")
        sdoc = json.load(open(spath))
        patch = sl.get("patch") or {}
        nxt = sdoc.get("next") or {}
        if sl.get("hidden"):
            sdoc.pop("next", None)
            json.dump(sdoc, open(spath, "w"), indent=2, ensure_ascii=False)
            open(spath, "a").write("\n")
            print("  slate.json: next removed (hidden at the desk)")
        elif patch and not all(nxt.get(k) == v for k, v in patch.items()):
            nxt.update(patch)
            sdoc["next"] = nxt
            json.dump(sdoc, open(spath, "w"), indent=2, ensure_ascii=False)
            open(spath, "a").write("\n")
            print(f"  slate.json updated ({', '.join(sorted(patch))})")
        elif patch:
            redundant.append(("slate", ""))

    # 'release:<num>' patches one row of the catalog. Same overlay, same file,
    # different item_key.
    # ⛔ 'latest_drop' patched the strip under the marquee, and that strip left the
    #    page on 8/26 (751fd33). Nothing reads the key since, so baking a row only
    #    wrote a dead block back into slate.json. Such a row is listed to clear.
    slate_extra = [o for o in site_ovs
                   if o.get("section") == "slate" and o.get("item_key") not in ("", None)]
    if slate_extra:
        spath = os.path.join(CONTENT, "slate.json")
        sdoc = json.load(open(spath))
        n = 0
        for o in slate_extra:
            key = o["item_key"]
            patch = o.get("patch") or {}
            if key == "latest_drop":
                redundant.append(("slate", key + "  (nothing on the page reads it since 8/26)"))
                continue
            m = re.match(r"^release:(.+)$", key)
            if not m:
                redundant.append(("slate", key + "  (unknown key)"))
                continue
            num = m.group(1)
            rels = sdoc.get("releases") or []
            hit = next((r for r in rels if str(r.get("num") or "") == num), None)
            if hit is None:
                redundant.append(("slate", key + "  (matches no release)"))
                continue
            if o.get("hidden"):
                sdoc["releases"] = [r for r in rels if r is not hit]
                n += 1
                print(f"  slate.json release dropped: {num}")
                continue
            if patch and not all(hit.get(k) == v for k, v in patch.items()):
                hit.update(patch)
                n += 1
                print(f"  slate.json release patched: {num} ({', '.join(sorted(patch))})")
            elif patch:
                redundant.append(("slate", key))
        if n:
            json.dump(sdoc, open(spath, "w"), indent=2, ensure_ascii=False)
            open(spath, "a").write("\n")
            print(f"  slate.json updated ({n} change(s) baked in)")

# ============================================================================
# THE BACK OF THE CARD. One folder per card holder, so /c/<slug>/ is a real URL
# with its own OG card instead of a query string nobody wants to paste into a
# bio. The PAGE ITSELF is live: c/index.html reads the database on load, so this
# only has to run when the desk hands out a NEW slug, not when a member changes
# a word. Eight seats, so that is rare.
#
# ⛔ The folder is a THIN COPY of c/index.html with the OG tags rewritten, not a
#    snapshot of their content. Baking their posts in would go stale the moment
#    they posted again, and the whole point of this page is that it fills itself.
# ============================================================================
CDIR = os.path.join(HERE, "c")
try:
    creq = urllib.request.Request(
        f"{URL}/rest/v1/cards?select=card_slug,display_name,tagline,card_photo",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    holders = json.load(urllib.request.urlopen(creq))
except Exception as e:
    holders = []
    print(f"  (card backs skipped: {e})")

if holders:
    shell = open(os.path.join(CDIR, "index.html")).read()
    made = 0
    for h in holders:
        cslug = (h.get("card_slug") or "").strip()
        if not cslug or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,58}[a-z0-9]", cslug):
            continue
        name = h.get("display_name") or cslug
        desc = h.get("tagline") or f"{name} holds a card at 0FF THE PRINT. San Antonio underground media house."
        # ⛔ THE OG IMAGE, IN PRIORITY ORDER, AND THE ORDER IS THE POINT.
        # 1. card_photo, the member's own upload. Theirs always wins.
        # 2. assets/og/<slug>.jpg, rendered by ogcards.py off the card art the
        #    house already wrote into roster.json. This is what was missing:
        #    card_photo is null for every holder, so every /c/<slug>/ paste into
        #    a bio or a promoter DM unfurled as the HOUSE's stock card.
        # 3. preview.jpg, only if nobody has art at all.
        # ⛔ Checked on DISK, not assumed. A missing file here would print a
        #    broken image into somebody's link preview and nothing would say so.
        og_local = os.path.join(HERE, "assets", "og", f"{cslug}.jpg")
        img = (h.get("card_photo")
               or (f"https://0fftheprint.com/assets/og/{cslug}.jpg"
                   if os.path.exists(og_local) else None)
               or "https://0fftheprint.com/assets/preview.jpg")
        page = shell
        # The shell sits at /c/, the folder sits one deeper, so every relative
        # asset in it has to climb one more level or the page loads nothing.
        page = page.replace('href="../', 'href="../../').replace('src="../', 'src="../../')
        page = page.replace("<title>The Card Back · 0FF THE PRINT</title>",
                            f"<title>{esc_html(name)} · 0FF THE PRINT</title>")
        page = page.replace('<meta property="og:title" content="0FF THE PRINT">',
                            f'<meta property="og:title" content="{esc_html(name)} · 0FF THE PRINT">')
        page = page.replace(
            '<meta property="og:description" content="A card holder at 0FF THE PRINT. '
            'San Antonio underground media house.">',
            f'<meta property="og:description" content="{esc_html(desc)}">')
        page = page.replace(
            '<meta property="og:image" content="https://0fftheprint.com/assets/preview.jpg">',
            f'<meta property="og:image" content="{esc_html(img)}">')
        # Dimensions let an unfurler reserve the card and render it LARGE
        # instead of falling back to a thumbnail while it fetches. Only stated
        # for the cards this script generated, because those are the only ones
        # whose size is known here.
        dims = ('<meta property="og:image:width" content="1200">\n'
                '<meta property="og:image:height" content="630">\n'
                f'<meta property="og:image:alt" content="{esc_html(name)}, a card holder at 0FF THE PRINT">\n'
                ) if img.endswith(f"/assets/og/{cslug}.jpg") else ""
        page = page.replace("</head>",
            f'<meta property="og:url" content="https://0fftheprint.com/c/{cslug}/">\n{dims}</head>')
        out_dir = os.path.join(CDIR, cslug)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "index.html")
        old = open(out_path).read() if os.path.exists(out_path) else None
        if old != page:
            open(out_path, "w").write(page)
            made += 1
            print(f"  card back: /c/{cslug}/")
    print(f"  {made} card back(s) written, {len(holders)} holder(s) seen")

print("\nNow:")
print("  git add -A && git commit -m 'bake story edits' && git push")
print("  \u26d4 A NEW HOLDER, OR NEW CARD ART, NEEDS ogcards.py RUN FIRST.")
print("     bake.py only POINTS at assets/og/<slug>.jpg. It does not draw it,")
print("     and a slug with no file there falls back to the house card.")
print("\n  \u26d4 RE-RUN THIS AFTER ANY display_name CHANGE **OR** ANY EDIT TO")
print("     c/index.html. A card back is a COPY of that file, so its <title>,")
print("     its og: tags AND its inline stylesheet all freeze at bake time.")
print("     Renaming somebody leaves the OLD name in every link preview, and")
print("     new CSS simply never reaches the seven baked pages, until a re-bake.")
if redundant:
    print("\n  ⛔ CLEAR THESE ON THE BOARD, they now match the committed file and")
    print("     would silently re-apply on top of a later git edit:")
    for section, key in redundant:
        print(f"    - {section} / {key or '(whole section)'}")
print("  then tap Clear override for edited stories at /desk/word/, and on /board/ (THE WORD)")
print("  tick 'Baked into git' on each of:")
for slug in promoted:
    print(f"    - {slug}")
if not promoted:
    print("    (no member stories promoted this run)")
