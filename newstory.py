#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — THE WORD story builder.

Serious pieces get a real page; outside articles get a card that links out.
Either way the story lands at the TOP of The Word on the homepage with the
next 0TP number.

    # a story of ours: markdown in, article page out at word/<slug>/
    /usr/bin/python3 newstory.py draft.md --title "The Ink, One Year Deep" \
        --kicker "SCENE REPORT" --dek "One line that sells the read." \
        --cover /path/to/cover.jpg

    # an outside article worth the reader's time: card only, links out
    /usr/bin/python3 newstory.py --link "https://..." --title "..." \
        --kicker "READ" --dek "why it matters" --cover /path/to/cover.jpg

Then: git add -A && git commit && git push.

    # after touching md_to_html below OR word.js's copy of it: both renderers
    # against every committed story, exit 1 on any difference
    /usr/bin/python3 newstory.py --parity

--slug names the folder (default: slugify(title)). bake.py passes a member
story's database slug. A slug that is already a story is refused, never
overwritten.

--shelf puts the card on one Stories tab shelf (nights, guides, dates, culture,
interviews) whatever its kicker says. Leave it off and the kicker picks the
shelf, which is the usual case. bake.py passes it for a house story filed from
the phone with a shelf picked.

--story-id writes the phone story's id into the page head (STORY_META). bake.py
passes it when it promotes a story from the phone, and reads it back on the next
run to know the page is that story's and not a git story under the same slug.

Markdown understood (deliberately small): blank-line paragraphs, "## " section
heads, "> " pull quotes, "![alt](img.jpg)" figures (local images are copied in
next to the page; any lines right under the image, same block, become its
caption, which is where a photo credit goes), **bold**, *italic*, [text](url).
Nothing else, on purpose.
The voice does the work, not the formatting.

House rules baked in: no em dashes survive (they become commas), the byline is
the HOUSE, not a person, and stories are indexable because the whole point of
an outlet is being read.
"""
import argparse, html, json, os, re, shutil, sys, zlib
from datetime import date

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
DESK = os.path.join(ROOT, "content", "desk.json")
WORD = os.path.join(ROOT, "word")

# THE SHELVES on the Stories tab (index.html SHELVES). A card's own "shelf" wins
# over its kicker; the database holds the same five (member_stories_shelf_ok).
SHELVES = ("nights", "guides", "dates", "culture", "interviews")

# ⛔ supabase-js is PINNED with SRI on every page since Wave 2. The floating @2
#    let jsdelivr swap the library under every story with no commit (it served
#    2.117.3 while the site was tested on 2.117.2). stamp.py's PIN step writes the
#    same three attributes into every other page; keep the two in step.
SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"
SUPABASE_SRI = "sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok"

# A story promoted from the phone carries its member_stories.id here, so bake.py can
# tell its own page from a git story that holds the same slug (a house row has no
# member byline to prove it). Git stories have no such line.
# ⛔ member_stories.id is a BIGINT (migration 010, generated always as identity), so
#    PostgREST sends it as a number (41), never a uuid. A uuid pattern here matched no
#    real row, and every promoted house story read as a SKIP on the next bake.
STORY_META = '<meta name="otp-story" content="{}">'
STORY_ID = r"[1-9][0-9]{0,18}"

# A story the desk pulled (bake.py) is a stub with no words, so its "This one is
# 0TP-NNN" line is gone. The stub keeps the number in this line instead, and
# next_num() counts it, so a pulled number is never handed to a new story.
NUM_META = '<meta name="otp-num" content="{}">'
HELD_NUM = re.compile(r'<meta name="otp-num" content="0TP-(\d+)">|This one is 0TP-(\d+)\.')

def slugify(t):
    s = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return s[:60] or "story"

def held_nums():
    """Every 0TP number a page under word/ still holds: a pulled stub's NUM_META, or a
    page's own 'This one is 0TP-NNN' (a page whose card is off desk.json keeps it too)."""
    out = []
    try:
        names = os.listdir(WORD)
    except OSError:
        return out
    for s in names:
        try:
            with open(os.path.join(WORD, s, "index.html"), encoding="utf-8", errors="ignore") as f:
                t = f.read()
        except OSError:
            continue
        out += [int(a or b) for a, b in HELD_NUM.findall(t)]
    return out

def next_num(items):
    # ⛔ NOT ONLY desk.json. Pulling the newest story takes its card off desk.json,
    #    and max()+1 then handed its number to the next story: two pages printed the
    #    same 0TP number for good once the pull was cleared and the card came back.
    ns = [int(m.group(1)) for it in items
          if (m := re.match(r"0TP-(\d+)", str(it.get("num", ""))))] + held_nums()
    return f"0TP-{(max(ns) + 1) if ns else 1:03d}"

def no_dash(s):
    return (s or "").replace("—", ", ").replace("–", "-")

def inline(s):
    s = html.escape(no_dash(s), quote=False)
    # ⛔ [^)\s]+ STOPS AT THE FIRST ")", AND WIKIMEDIA FILENAMES CONTAIN PARENTHESES.
    #    File:Xaviersobased_(2-2-23).jpg truncated to ..._(2-2-23 and leaked ".jpg)"
    #    as literal text next to a dead link. On a cover credit that is a broken
    #    attribution, which is a licence problem. Allow one level of balanced parens.
    # ⛔ AND NEVER A " IN THE URL. quote=False leaves quotes raw, so a member's
    #    [x](https://a/"onmouseover="...) closed href="..." and baked an
    #    attribute of their choosing into a static page. word.js matches this.
    s = re.sub(r"\[([^\]]+)\]\((https?://(?:[^()\s\"]|\([^()\s\"]*\))+)\)",
               r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", s)
    return s

def copy_in(src_path, story_dir, name):
    # ⛔ bake.py folds a phone edit back with md_to_html(md, story_dir, story_dir),
    #    so the image is ALREADY next to the page and copy2 onto itself raises
    #    SameFileError: one photo story with an override killed the whole bake.
    dst = os.path.join(story_dir, name)
    if os.path.exists(dst) and os.path.samefile(src_path, dst):
        return
    shutil.copy2(src_path, dst)

def md_to_html(md, story_dir, src_dir):
    out = []
    for block in re.split(r"\n\s*\n", md.strip()):
        b = block.strip()
        if not b:
            continue
        if b.startswith("## "):
            out.append(f"<h2>{inline(b[3:])}</h2>")
        elif b.startswith("> "):
            quote = " ".join(ln.lstrip("> ").strip() for ln in b.splitlines())
            out.append(f'<blockquote>{inline(quote)}</blockquote>')
        elif (m := re.match(r"^!\[([^\]]*)\]\(([^)\s]+)\)(?:\{poster=([^}\s]+)\})?$", b.splitlines()[0].strip())):
            alt, src, poster = m.group(1), m.group(2), m.group(3)
            # lines under the image in the same block are its caption: a CC photo inside a story
            # needs its credit right there, same as the cover (10/7, the craft series)
            cap = " ".join(ln.strip() for ln in b.splitlines()[1:] if ln.strip())
            # ⛔ A VIDEO SOURCE MUST NOT BE A GITHUB RELEASE ASSET. GitHub types every
            #    one application/octet-stream + content-disposition: attachment, and
            #    iOS Safari refuses to play that. Pass an http src from the media
            #    repo's Pages site, which types by extension. An <img> sniffs and does
            #    not care, which is why photos are fine on releases and video is not.
            if os.path.splitext(src)[1].lower() in (".mp4", ".m4v", ".mov"):
                if not src.startswith("http"):
                    sys.exit(f"video must be an http url on the media Pages site: {src}")
                pa = ""
                if poster:
                    if not poster.startswith("http"):
                        pp = os.path.join(src_dir, poster)
                        if not os.path.exists(pp):
                            sys.exit(f"poster not found next to the draft: {poster}")
                        copy_in(pp, story_dir, os.path.basename(poster))
                        poster = os.path.basename(poster)
                    pa = f' poster="{html.escape(poster)}"'
                out.append(
                    f'<figure class="clip"><video controls playsinline preload="none"'
                    f'{pa} src="{html.escape(src)}"></video>'
                    + (f"<figcaption>{inline(cap or alt)}</figcaption>" if (cap or alt) else "")
                    + "</figure>")
                continue
            if not src.startswith("http"):
                src_path = os.path.join(src_dir, src)
                if not os.path.exists(src_path):
                    sys.exit(f"image not found next to the draft: {src}")
                name = os.path.basename(src)
                copy_in(src_path, story_dir, name)
                src = name
            out.append(f'<figure><img src="{html.escape(src)}" alt="{html.escape(alt)}" loading="lazy">'
                       + (f"<figcaption>{inline(cap)}</figcaption>" if cap else "") + "</figure>")
        else:
            out.append(f"<p>{inline(' '.join(ln.strip() for ln in b.splitlines()))}</p>")
    return "\n".join(out)

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{title} · 0FF THE PRINT</title>
<meta name="description" content="{dek}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{dek}">
<meta property="og:image" content="https://0fftheprint.com/word/{slug}/cover.jpg">
<meta property="og:type" content="article">
<meta name="theme-color" content="#0a0a0d">{story_meta}
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{{--ink:#f2eef5;--muted:#8d8798;--line:rgba(255,255,255,.1);--pink:#ff79c6;--bg:#0a0a0d}}
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}}
  .leopard-bar{{height:7px;background:linear-gradient(90deg,#ff79c6,#caa9ff,#2f6bff,#ff79c6);background-size:300% 100%}}
  .wrap{{max-width:720px;margin:0 auto;padding:34px 20px 90px}}
  a.back{{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--muted);text-decoration:none}}
  a.back:hover{{color:var(--pink)}}
  .kicker{{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.3em;
    text-transform:uppercase;color:var(--pink);margin:34px 0 10px}}
  h1{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:clamp(34px,7vw,56px);line-height:.98}}
  .dek{{font-size:17px;line-height:1.6;color:var(--muted);margin-top:14px}}
  .byline{{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted);margin:18px 0 26px;
    padding-bottom:18px;border-bottom:1px solid var(--line)}}
  .byline b{{color:var(--ink)}}
  .cover{{margin:0 0 8px;border-radius:14px;overflow:hidden;border:1px solid var(--line)}}
  .cover img{{width:100%;display:block}}
  .cover-credit{{font-family:'JetBrains Mono',monospace;font-size:10px;
    letter-spacing:.06em;color:var(--muted);margin:8px 0 30px;line-height:1.5}}
  .cover-credit a{{color:var(--muted);text-decoration:underline}}
  article{{font-size:17.5px;line-height:1.85}}
  article p{{margin:0 0 22px}}
  article h2{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:27px;margin:38px 0 14px}}
  article a{{color:var(--pink);text-decoration:none}}
  article a:hover{{text-decoration:underline}}
  article blockquote{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    font-size:26px;line-height:1.2;text-transform:uppercase;color:var(--pink);
    border-left:3px solid var(--pink);padding-left:18px;margin:32px 0}}
  article figure{{margin:30px -20px}}
  article figure img,article figure video{{width:100%;display:block;border-radius:0;background:#000}}
  article figure.clip video{{width:auto;max-width:100%;max-height:82vh;aspect-ratio:9/16;margin:0 auto}}
  article figcaption{{font-family:'JetBrains Mono',monospace;font-size:10.5px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
    padding:10px 20px 0;text-align:center}}
  @media(min-width:760px){{article figure{{margin:30px 0}}
    article figure img,article figure video{{border-radius:12px}}
    article figcaption{{padding:10px 0 0}}}}
  .foot{{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);
    font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted)}}
  .foot a{{color:var(--pink);text-decoration:none}}
  .wall{{max-width:680px;margin:34px auto 0;padding-top:26px;border-top:1px solid var(--line)}}
  .wall h2{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;font-size:22px;text-transform:uppercase;margin-bottom:14px}}
  .wall-entry{{border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:10px}}
  .we-by{{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--pink);margin-bottom:6px}}
  .we-text{{font-size:15px;line-height:1.65;color:var(--ink);overflow-wrap:anywhere}}
  .we-none,.we-pending,.we-msg{{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);line-height:1.7}}
  .we-msg{{color:#ff6a7e;min-height:16px;margin-top:6px}}
  #wall-compose textarea{{width:100%;background:#111016;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:16px;font-family:Inter,sans-serif;margin-top:8px}}
  .we-row{{display:flex;align-items:center;justify-content:space-between;margin-top:8px}}
  .we-count{{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)}}
  .we-row button,.we-pending button{{background:transparent;color:var(--pink);border:1px solid var(--pink);border-radius:7px;padding:9px 16px;font-size:13px;cursor:pointer;min-height:40px}}
</style>
<link rel="stylesheet" href="../../assets/css/binder.css">
<script src="../../assets/js/binder.js" defer></script>
</head>
<body>
<div class="leopard-bar"></div>
<div class="wrap">
  <a class="back" href="../../#desk">&larr; The Word · 0FF THE PRINT</a>
  <div class="kicker">{kicker}</div>
  <h1>{title}</h1>
  <div class="dek">{dek}</div>
  <div class="byline">{num} &nbsp;·&nbsp; <b>{author}</b> &nbsp;·&nbsp; San Antonio &nbsp;·&nbsp; {datestr}</div>
  <div class="cover"><img src="cover.jpg" alt=""></div>
{credit}
  <article data-stamp="{stamp}">
{body}
  </article>
  <section class="wall" id="wall" data-story="{slug}" hidden>
    <h2>From the floor</h2>
    <div id="wall-entries"></div>
    <div id="wall-compose"></div>
  </section>
  <div class="foot">Every drop gets a number. This one is {num}. <a href="../../#desk">Back to The Word &rarr;</a></div>
</div>
<script src="../../supabase-config.js"></script>
<script src="{supabase_js}" integrity="{supabase_sri}" crossorigin="anonymous"></script>
<script src="../../assets/js/desk.js" defer></script>
<script src="../../assets/js/word.js" defer></script>
</body>
</html>
"""

# word.js repaints a story from the desk's phone edit (story_pages) with its own
# copy of md_to_html. Run this after touching EITHER renderer:
#     /usr/bin/python3 newstory.py --parity
PARITY_JS = r"""
const vm = require('vm'), fs = require('fs');
const inp = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = { window: {}, document: { querySelector: () => null, getElementById: () => null } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(inp.wordjs, 'utf8'), ctx);
const out = {};
for (const k of Object.keys(inp.mds)) out[k] = ctx.window.OTPWord.mdToHtml(inp.mds[k], { house: true });
process.stdout.write(JSON.stringify(out));
"""

def parity():
    """Every word/*/source.md through md_to_html and through word.js (house
    mode, via node), each diffed against the committed <article>. 0 = clean."""
    import subprocess, tempfile
    stories = {}
    for slug in sorted(os.listdir(WORD)):
        d = os.path.join(WORD, slug)
        if os.path.exists(os.path.join(d, "source.md")) and os.path.exists(os.path.join(d, "index.html")):
            stories[slug] = d
    mds = {s: open(os.path.join(d, "source.md"), encoding="utf-8").read() for s, d in stories.items()}
    try:
        r = subprocess.run(["node", "-e", PARITY_JS], capture_output=True, text=True, input=json.dumps(
            {"wordjs": os.path.join(ROOT, "assets", "js", "word.js"), "mds": mds}))
        js = json.loads(r.stdout) if r.returncode == 0 else None
        if js is None:
            print("  word.js did not run:", (r.stderr.strip().splitlines() or ["?"])[-1])
    except FileNotFoundError:
        js = None
        print("  no node on this machine: checking newstory.py against the pages only")
    bad = 0
    with tempfile.TemporaryDirectory() as td:
        for slug, d in stories.items():
            page = open(os.path.join(d, "index.html"), encoding="utf-8").read()
            m = re.search(r'<article data-stamp="[a-f0-9]*">\n(.*?)\n  </article>', page, re.S)
            committed = m.group(1) if m else None
            os.makedirs(os.path.join(td, slug))
            try:
                py = md_to_html(mds[slug], os.path.join(td, slug), d)
            except SystemExit as e:
                py = f"(newstory refused: {e})"
            fails = []
            if committed is not None and py != committed:
                fails.append("newstory.py != page")
            if js is not None and js.get(slug) != py:
                fails.append("word.js != newstory.py")
            if fails:
                bad += 1
                print(f"  DIFF {slug}: " + ", ".join(fails))
                other = "word.js" if fails[-1].startswith("word.js") else "page"
                a = ((js or {}).get(slug) or "" if other == "word.js" else committed).split("\n")
                b = py.split("\n")
                for i in range(max(len(a), len(b))):
                    if (a[i] if i < len(a) else None) != (b[i] if i < len(b) else None):
                        print(f"       {other + ':':10} {(a[i] if i < len(a) else '')[:200]}")
                        print(f"       newstory:  {(b[i] if i < len(b) else '')[:200]}")
                        break
    print(f"  {len(stories)} stories, {bad} differ" + ("" if js is not None else " (word.js not checked)"))
    return 1 if bad or js is None else 0

def main():
    if "--parity" in sys.argv[1:]:
        sys.exit(parity())
    ap = argparse.ArgumentParser()
    ap.add_argument("draft", nargs="?", help="markdown file (omit with --link)")
    ap.add_argument("--title", required=True)
    ap.add_argument("--kicker", default="STORY")
    ap.add_argument("--dek", required=True)
    ap.add_argument("--cover", required=True)
    ap.add_argument("--credit", help="cover credit line, REQUIRED for any photo we "
                    "did not shoot: photographer, source, licence with a markdown "
                    "link, and the word Cropped")
    ap.add_argument("--tile", help="separate source for the 4:5 grid tile "
                                   "(default: crop the cover, which is 16:9)")
    ap.add_argument("--tile-y", type=float, default=0.5, dest="tile_y",
                    help="vertical anchor for the tile crop, 0 keeps the top (default 0.5)")
    ap.add_argument("--link", help="outside article: card only, no page built")
    ap.add_argument("--num", help="override the auto 0TP number")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--author", default="0FF THE PRINT",
                    help="byline; a member story bakes with the member's name")
    ap.add_argument("--slug", help="folder under word/ (default: from the title). "
                    "bake.py passes a member story's database slug, which a desk "
                    "retitle never changes, so the page lands where its links point")
    ap.add_argument("--shelf", choices=SHELVES,
                    help="the Stories tab shelf, whatever the kicker says "
                         "(default: the kicker picks it)")
    ap.add_argument("--story-id", dest="story_id",
                    help="the phone story's id (member_stories.id, a number); bake.py "
                         "passes it so the next bake knows this page is that story's")
    a = ap.parse_args()
    if not a.draft and not a.link:
        sys.exit("either a markdown draft or --link, one of the two")
    if a.slug and not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,59}", a.slug):
        sys.exit(f"--slug must be 3 to 60 of a-z, 0-9 and -, starting with a letter or digit: {a.slug}")
    if a.story_id and not re.fullmatch(STORY_ID, a.story_id):
        sys.exit(f"--story-id is a member story's id (a number): {a.story_id}")

    with open(DESK) as f:
        desk = json.load(f)
    num = a.num or next_num(desk["items"])
    slug = a.slug or slugify(a.title)

    # ⛔ A TITLE THAT SLUGIFIES ONTO A RUNNING STORY USED TO OVERWRITE IT: its
    #    page, source.md and cover went, and desk.json got a second card. A
    #    folder holding only cover.jpg/thumb.jpg is a failed earlier run of this
    #    same story (it exits before writing the page), so that one may re-run.
    taken = os.path.exists(os.path.join(WORD, slug, "index.html")) or any(
        str(it.get("link", "")) == f"word/{slug}/"
        or str(it.get("thumb", "")).startswith(f"word/{slug}/") for it in desk["items"])
    if taken:
        sys.exit(f"word/{slug}/ is already a story. Pick another title or --slug. "
                 f"To rebuild one that is not pushed yet, remove word/{slug}/ and its "
                 f"desk.json card first.")

    # thumb for the grid card, self-contained so derive.py is not involved
    story_dir = os.path.join(WORD, slug)
    os.makedirs(story_dir, exist_ok=True)
    img = ImageOps.exif_transpose(Image.open(a.cover)).convert("RGB")
    img.save(os.path.join(story_dir, "cover.jpg"), quality=90)
    # ⛔ THE TILE IS 4:5, THE HERO IS 16:9, AND THEY ARE NOT THE SAME PICTURE.
    #    .desk-thumb is background-size:cover in a 4:5 box, so a 16:9 thumb gets
    #    centre cropped AND upscaled. This used to emit 640x360 and every tile on
    #    the grid was a blurry middle third. Cut a real 900x1125 from --tile when
    #    given (a fuller frame crops better) or from the cover otherwise.
    tile_src = ImageOps.exif_transpose(Image.open(a.tile)).convert("RGB") if a.tile else img
    TW, TH = 900, 1125
    sw, sh = tile_src.size
    scale = max(TW / sw, TH / sh)
    r = tile_src.resize((max(TW, round(sw * scale)), max(TH, round(sh * scale))), Image.LANCZOS)
    left, top = (r.width - TW) // 2, int((r.height - TH) * a.tile_y)
    r.crop((left, top, left + TW, top + TH)).save(
        os.path.join(story_dir, "thumb.jpg"), quality=82, optimize=True)

    if a.link:
        link = a.link
    else:
        with open(a.draft) as f:
            md = f.read()
        body = md_to_html(md, story_dir, os.path.dirname(os.path.abspath(a.draft)))
        datestr = date.fromisoformat(a.date).strftime("%b %d, %Y").upper()
        # The stamp locks the phone-editor loop: word.js ignores any story_pages
        # override whose stamp no longer matches the page, so a forgotten
        # "Clear override" after a bake cannot shadow newer committed content.
        md_clean = no_dash(md)
        stamp = format(zlib.crc32(md_clean.encode()) & 0xFFFFFFFF, "08x")
        # ⛔ ATTRIBUTION IS A LICENCE CONDITION, NOT A NICETY. CC BY and CC BY-SA
        #    both require the credit AND a note that the image was changed, and
        #    every cover here is cropped. The six credit lines from 8/27 were added
        #    BY HAND and this tool never learned them, so the next story would have
        #    shipped a licensed photograph with no attribution on it.
        credit = ""
        if a.credit:
            credit = ('  <p class="cover-credit">' + inline(a.credit) + "</p>")
        elif not a.link:
            print("  ⚠️  no --credit given. If this cover is not ours, that is a "
                  "licence problem, not a style one.")
        page = PAGE.format(credit=credit,
                           title=html.escape(no_dash(a.title)), dek=html.escape(no_dash(a.dek)),
                           kicker=html.escape(no_dash(a.kicker).upper()), num=num,
                           datestr=datestr, body=body, slug=slug, stamp=stamp,
                           author=html.escape(no_dash(a.author)),
                           supabase_js=SUPABASE_JS, supabase_sri=SUPABASE_SRI,
                           story_meta=("\n" + STORY_META.format(a.story_id)) if a.story_id else "")
        with open(os.path.join(story_dir, "index.html"), "w") as f:
            f.write(page)
        # source.md is the editor's base text: the phone editor seeds from it,
        # so nothing ever round-trips through HTML.
        with open(os.path.join(story_dir, "source.md"), "w") as f:
            f.write(md_clean if md_clean.endswith("\n") else md_clean + "\n")
        link = f"word/{slug}/"

    card = {
        "title": no_dash(a.title),
        "kicker": no_dash(a.kicker).upper(),
        "dek": no_dash(a.dek),
        "date": date.fromisoformat(a.date).strftime("%m.%d.%y"),
        "lanes": ["story"],
        "dept": "story",
        "platform": "SITE" if not a.link else "READ",
        "thumb": f"word/{slug}/thumb.jpg",
        "link": link,
        "num": num,
    }
    # only when picked: a card without one follows its kicker (index.html shelfOf)
    if a.shelf:
        card["shelf"] = a.shelf
    desk["items"].insert(0, card)
    with open(DESK, "w") as f:
        # indent 2 to match bake.py and every other content/*.json, or every
        # story run rewrites the whole file and buries its own one line change
        json.dump(desk, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  {num} · {a.title}")
    print(f"  card at the top of The Word" + ("" if a.link else f", page at word/{slug}/"))
    print("  git add -A && git commit -m 'word: " + slug + "' && git push")

if __name__ == "__main__":
    main()
