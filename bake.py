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
# ============================================================================
CONTENT = os.path.join(HERE, "content")

def esc_html(v):
    """Meta tag values are attribute content, so quotes and angles have to go."""
    return (str(v or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _base(p):
    """work.json stores assets/work/x.jpg, derive.py renders
    assets/grid/work/x.jpg. The basename is the only key both agree on."""
    return str(p or "").split("/")[-1]

sreq2 = urllib.request.Request(
    f"{URL}/rest/v1/site_overrides?select=section,item_key,patch,hidden,sort",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
try:
    site_ovs = json.load(urllib.request.urlopen(sreq2))
except Exception:
    site_ovs = []
    print("  (site_overrides not reachable; migration 014 not run yet?)")

redundant = []

def bake_list(section, filename, key_of, allow_add=False):
    """Apply the section's overrides to a {"items":[...]} content file."""
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
    # ⛔ OPT IN, and only THE WORK passes it. A row that matches nothing is
    # normally inert, but for work a row carrying its own src is an ADDITION
    # made from a phone, and folding it in is the whole point of the bake.
    if allow_add:
        for o in rows:
            k = o["item_key"]
            if k in matched or o.get("hidden"):
                continue
            patch = o.get("patch") or {}
            if not patch.get("src"):
                continue
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
    bake_list("work", "work.json", lambda it: _base(it.get("src")), allow_add=True)
    bake_list("roster", "roster.json", lambda it: str(it.get("name") or ""))
    # creators only ever has rows once migration 017 widens the section CHECK.
    # Before that this is a no-op, which is why it is safe to ship first.
    bake_list("creators", "creators.json", lambda it: str(it.get("name") or ""))

    # rotation seeds key on the spotify id inside their link, matching
    # parseSpotifyId on the page and the pencil in edit.js
    def _sp(link):
        m = re.search(r"(?:track/|spotify:track:)([A-Za-z0-9]{22})", str(link or ""))
        return m.group(1) if m else ""
    bake_list("rotation", "rotation.json", lambda it: _sp(it.get("link")))

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

        for o in site_rows:
            if o.get("hidden"):
                continue
            k = o["item_key"]
            v = (o.get("patch") or {}).get("value")
            if v is None:
                continue
            # ⛔ Same list as index.html's applier. Both split, or the baked
            # file gets a string where the page expects an array.
            if k in ("ticker_headlines", "why.bullets"):
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

    # 'latest_drop' patches the strip under the marquee, 'release:<num>' patches
    # one row of the catalog. Same overlay, same file, different item_key.
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
                if o.get("hidden"):
                    if sdoc.pop("latest_drop", None) is not None:
                        n += 1
                        print("  slate.json: latest_drop removed")
                    continue
                cur = sdoc.get("latest_drop") or {}
                if patch and not all(cur.get(k) == v for k, v in patch.items()):
                    cur.update(patch)
                    sdoc["latest_drop"] = cur
                    n += 1
                    print(f"  slate.json latest_drop patched ({', '.join(sorted(patch))})")
                elif patch:
                    redundant.append(("slate", key))
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
        img = h.get("card_photo") or "https://0fftheprint.com/assets/preview.jpg"
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
        page = page.replace("</head>",
            f'<meta property="og:url" content="https://0fftheprint.com/c/{cslug}/">\n</head>')
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
print("\n  \u26d4 RE-RUN THIS AFTER ANY display_name CHANGE **OR** ANY EDIT TO")
print("     c/index.html. A card back is a COPY of that file, so its <title>,")
print("     its og: tags AND its inline stylesheet all freeze at bake time.")
print("     Renaming somebody leaves the OLD name in every link preview, and")
print("     new CSS simply never reaches the seven baked pages, until a re-bake.")
if redundant:
    print("\n  ⛔ CLEAR THESE AT THE DESK, they now match the committed file and")
    print("     would silently re-apply on top of a later git edit:")
    for section, key in redundant:
        print(f"    - {section} / {key or '(whole section)'}")
print("  then at /desk/: tap Clear override for edited stories, and tap BAKED on each of:")
for slug in promoted:
    print(f"    - {slug}")
if not promoted:
    print("    (no member stories promoted this run)")
