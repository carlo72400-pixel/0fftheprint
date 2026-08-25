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
    print("no story overrides in the database. nothing to bake.")
    sys.exit(0)

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

print(f"\n{baked} page(s) rewritten. Now:")
print("  git add -A && git commit -m 'bake story edits' && git push")
print("  then tap Clear override at /desk/word/ (stale ones are ignored either way)")
