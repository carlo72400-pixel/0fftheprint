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
"""
import json
import os
import re
import sys
import urllib.request
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
WORD = os.path.join(HERE, "word")

sys.path.insert(0, HERE)
from newstory import md_to_html, no_dash  # noqa: E402  (same renderer, no drift)

cfg = open(os.path.join(HERE, "supabase-config.js")).read()
URL = re.search(r'url:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'anonKey:\s*"([^"]+)"', cfg).group(1)

req = urllib.request.Request(
    f"{URL}/rest/v1/story_pages?select=slug,body_md,stamp,updated_at",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
rows = json.load(urllib.request.urlopen(req))
if not rows:
    print("no story overrides in the database.")

baked = 0
for row in rows:
    slug = row["slug"]
    story_dir = os.path.join(WORD, slug)
    page_path = os.path.join(story_dir, "index.html")
    if not os.path.exists(page_path):
        print(f"  SKIP {slug}: no such story on disk (toss the row at the desk)")
        continue

    page = open(page_path).read()
    cur_stamp_m = re.search(r'<article data-stamp="([a-f0-9]{8})">', page)
    cur_stamp = cur_stamp_m.group(1) if cur_stamp_m else None
    if row.get("stamp") and cur_stamp and row["stamp"] != cur_stamp:
        print(f"  SKIP {slug}: override is STALE (page baked since it was written). "
              f"Clear it at /desk/word/.")
        continue

    md = no_dash(row["body_md"])
    if not md.endswith("\n"):
        md += "\n"
    body = md_to_html(md, story_dir, story_dir)
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
# ============================================================================
import subprocess
import tempfile

sreq = urllib.request.Request(
    f"{URL}/rest/v1/word_stories?select=slug,title,dek,body_md,cover_url,display_name,baked&baked=eq.false",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
try:
    stories = json.load(urllib.request.urlopen(sreq))
except Exception:
    stories = []
    print("  (word_stories view not reachable; migration 010 not run yet?)")
promoted = []
for st in stories:
    slug = st["slug"]
    if os.path.exists(os.path.join(WORD, slug)):
        print(f"  SKIP story {slug}: a page already exists there")
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
        r = subprocess.run(
            [sys.executable, os.path.join(HERE, "newstory.py"), draft,
             "--title", st["title"], "--dek", st["dek"], "--cover", cover,
             "--kicker", "FROM THE FLOOR",
             "--author", st.get("display_name") or "a card holder"],
            capture_output=True, text=True)
        if r.returncode != 0:
            print(f"  FAILED story {slug}: {r.stderr.strip().splitlines()[-1] if r.stderr else r.stdout}")
            continue
    promoted.append(slug)
    print(f"  promoted story {slug} into the catalog")

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

print("\nNow:")
print("  git add -A && git commit -m 'bake story edits' && git push")
print("  then at /desk/: tap Clear override for edited stories, and tap BAKED on each of:")
for slug in promoted:
    print(f"    - {slug}")
if not promoted:
    print("    (no member stories promoted this run)")
