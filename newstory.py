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

Markdown understood (deliberately small): blank-line paragraphs, "## " section
heads, "> " pull quotes, "![alt](img.jpg)" figures (local images are copied in
next to the page), **bold**, *italic*, [text](url). Nothing else, on purpose.
The voice does the work, not the formatting.

House rules baked in: no em dashes survive (they become commas), the byline is
the HOUSE, not a person, and stories are indexable because the whole point of
an outlet is being read.
"""
import argparse, html, json, os, re, shutil, sys
from datetime import date

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
DESK = os.path.join(ROOT, "content", "desk.json")
WORD = os.path.join(ROOT, "word")

def slugify(t):
    s = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return s[:60] or "story"

def next_num(items):
    ns = [int(m.group(1)) for it in items
          if (m := re.match(r"0TP-(\d+)", str(it.get("num", ""))))]
    return f"0TP-{(max(ns) + 1) if ns else 1:03d}"

def no_dash(s):
    return (s or "").replace("—", ", ").replace("–", "-")

def inline(s):
    s = html.escape(no_dash(s), quote=False)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
               r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", s)
    return s

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
        elif (m := re.match(r"^!\[([^\]]*)\]\(([^)\s]+)\)$", b)):
            alt, src = m.group(1), m.group(2)
            if not src.startswith("http"):
                src_path = os.path.join(src_dir, src)
                if not os.path.exists(src_path):
                    sys.exit(f"image not found next to the draft: {src}")
                name = os.path.basename(src)
                shutil.copy2(src_path, os.path.join(story_dir, name))
                src = name
            out.append(f'<figure><img src="{html.escape(src)}" alt="{html.escape(alt)}" loading="lazy"></figure>')
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
<meta name="theme-color" content="#0a0a0d">
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
  .cover{{margin:0 0 30px;border-radius:14px;overflow:hidden;border:1px solid var(--line)}}
  .cover img{{width:100%;display:block}}
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
  article figure img{{width:100%;display:block;border-radius:0}}
  @media(min-width:760px){{article figure{{margin:30px 0}}article figure img{{border-radius:12px}}}}
  .foot{{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);
    font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted)}}
  .foot a{{color:var(--pink);text-decoration:none}}
</style>
</head>
<body>
<div class="leopard-bar"></div>
<div class="wrap">
  <a class="back" href="../../#desk">&larr; The Word · 0FF THE PRINT</a>
  <div class="kicker">{kicker}</div>
  <h1>{title}</h1>
  <div class="dek">{dek}</div>
  <div class="byline">{num} &nbsp;·&nbsp; <b>0FF THE PRINT</b> &nbsp;·&nbsp; San Antonio &nbsp;·&nbsp; {datestr}</div>
  <div class="cover"><img src="cover.jpg" alt=""></div>
  <article>
{body}
  </article>
  <div class="foot">Every drop gets a number. This one is {num}. <a href="../../#desk">Back to The Word &rarr;</a></div>
</div>
</body>
</html>
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("draft", nargs="?", help="markdown file (omit with --link)")
    ap.add_argument("--title", required=True)
    ap.add_argument("--kicker", default="STORY")
    ap.add_argument("--dek", required=True)
    ap.add_argument("--cover", required=True)
    ap.add_argument("--link", help="outside article: card only, no page built")
    ap.add_argument("--num", help="override the auto 0TP number")
    ap.add_argument("--date", default=date.today().isoformat())
    a = ap.parse_args()
    if not a.draft and not a.link:
        sys.exit("either a markdown draft or --link, one of the two")

    with open(DESK) as f:
        desk = json.load(f)
    num = a.num or next_num(desk["items"])
    slug = slugify(a.title)

    # thumb for the grid card, self-contained so derive.py is not involved
    story_dir = os.path.join(WORD, slug)
    os.makedirs(story_dir, exist_ok=True)
    img = ImageOps.exif_transpose(Image.open(a.cover)).convert("RGB")
    img.save(os.path.join(story_dir, "cover.jpg"), quality=90)
    t = img.copy(); t.thumbnail((640, 640 * 3))
    t.save(os.path.join(story_dir, "thumb.jpg"), quality=78)

    if a.link:
        link = a.link
    else:
        with open(a.draft) as f:
            md = f.read()
        body = md_to_html(md, story_dir, os.path.dirname(os.path.abspath(a.draft)))
        datestr = date.fromisoformat(a.date).strftime("%b %d, %Y").upper()
        page = PAGE.format(title=html.escape(no_dash(a.title)), dek=html.escape(no_dash(a.dek)),
                           kicker=html.escape(no_dash(a.kicker).upper()), num=num,
                           datestr=datestr, body=body, slug=slug)
        with open(os.path.join(story_dir, "index.html"), "w") as f:
            f.write(page)
        link = f"word/{slug}/"

    desk["items"].insert(0, {
        "title": no_dash(a.title),
        "kicker": no_dash(a.kicker).upper(),
        "dek": no_dash(a.dek),
        "date": date.fromisoformat(a.date).strftime("%m.%d.%y"),
        "lanes": ["story"],
        "platform": "SITE" if not a.link else "READ",
        "thumb": f"word/{slug}/thumb.jpg",
        "link": link,
        "num": num,
    })
    with open(DESK, "w") as f:
        json.dump(desk, f, indent=1)
        f.write("\n")

    print(f"  {num} · {a.title}")
    print(f"  card at the top of The Word" + ("" if a.link else f", page at word/{slug}/"))
    print("  git add -A && git commit -m 'word: " + slug + "' && git push")

if __name__ == "__main__":
    main()
