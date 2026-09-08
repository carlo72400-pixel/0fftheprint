#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — SEEN builder.

Six people at one show. Full body, one wall, their name and one line on why
they came out. No essay. The only words in the department are the six names
and the six lines, in their words.

    /usr/bin/python3 newseen.py ~/Desktop/.../01_Source/seen \
        --title "Zen Haus, Third Friday" --venue "Zen Haus" --date 2026-09-19 \
        --dek "Six people, full body, and what they came for."

The sheet (seen.txt, sitting in FRAMES_DIR) is blocks separated by blank lines.
Three positional lines, then any number of "key: value" lines:

    IMG_2214.jpg
    Marisol
    Came for the opener, stayed because her friend was DJing after.
    handle: @marisol
    consent: verbal yes, card handed, 23:41
    use: site+print

⛔ WHY consent IS A SENTENCE AND NOT A BOOLEAN. There is no signed instrument
   anywhere in this department. A field that says "release: yes" produces a file,
   authored after the fact, asserting a release that does not exist, which is
   WORSE evidence in a dispute than an honest note. So the field records what
   actually happened and when. The build refuses without it.

⛔ WHY THE SURNAME IS A WARNING. SEEN publishes name + venue + date + face, and
   that is the whole location record. The house rule is publish two of those
   three, never all. First name or handle is what street-style editorial runs
   anyway, and the surname is the only part that makes a person searchable
   forever. A two-word name warns; it does not block, because that is his call.

House rules baked in: no em dashes survive, the byline is the HOUSE, and the
page carries NO <article> element, because word.js and bake.py both write into
<article> and would replace a six-portrait grid with prose.
"""
import argparse, html, json, os, re, sys
from datetime import date

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
DESK = os.path.join(ROOT, "content", "desk.json")
WORD = os.path.join(ROOT, "word")

# Import the shared helpers rather than reimplementing them, the bake.py idiom.
# newstory owns slugify/next_num/no_dash/inline and they must not drift.
sys.path.insert(0, ROOT)
_argv, sys.argv = sys.argv, [sys.argv[0]]
from newstory import slugify, next_num, no_dash, inline   # noqa: E402
sys.argv = _argv

FRAME_W, FRAME_H = 1000, 1250      # 4:5, the department's fixed frame
THUMB_W, THUMB_H = 900, 1125       # what .desk-thumb wants, cover in a 4:5 box
USES = ("site+print", "site+print+promo")


def parse_sheet(txt, frames_dir):
    """Blocks of: file / name / line / then key: value rows."""
    people = []
    for block in re.split(r"\n\s*\n", txt.strip()):
        lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
        if not lines:
            continue
        if len(lines) < 3:
            sys.exit(f"sheet block needs at least file, name and line:\n{block}")
        fn, name, said = lines[0], lines[1], lines[2]
        meta = {}
        for l in lines[3:]:
            if ":" not in l:
                sys.exit(f"expected 'key: value', got {l!r} in block for {name}")
            k, v = l.split(":", 1)
            meta[k.strip().lower()] = v.strip()
        if not os.path.exists(os.path.join(frames_dir, fn)):
            sys.exit(f"frame not found in FRAMES_DIR: {fn}")
        if not meta.get("consent"):
            sys.exit(f"NO CONSENT LINE for {name}. Record what actually happened "
                     f"and when, e.g. 'consent: verbal yes, card handed, 23:41'. "
                     f"This department does not build without it.")
        use = meta.get("use", "site+print")
        if use not in USES:
            sys.exit(f"use for {name} must be one of {' | '.join(USES)}, got {use!r}")
        people.append({
            "file": fn,
            "name": no_dash(name),
            "line": no_dash(said),
            "handle": meta.get("handle", ""),
            "consent": no_dash(meta["consent"]),
            "use": use,
        })
    return people


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{title} · SEEN · 0FF THE PRINT</title>
<meta name="description" content="{dek}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{dek}">
<meta property="og:image" content="https://0fftheprint.com/word/{slug}/01.jpg">
<meta property="og:type" content="article">
<meta name="theme-color" content="#0a0a0d">
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{{--ink:#f2eef5;--muted:#8d8798;--line:rgba(255,255,255,.1);--pink:#ff79c6;--bg:#0a0a0d}}
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}}
  .leopard-bar{{height:7px;background:linear-gradient(90deg,#ff79c6,#caa9ff,#2f6bff,#ff79c6);background-size:300% 100%}}
  .wrap{{max-width:1100px;margin:0 auto;padding:34px 20px 90px}}
  a.back{{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--muted);text-decoration:none}}
  a.back:hover{{color:var(--pink)}}
  .kicker{{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.3em;
    text-transform:uppercase;color:var(--pink);margin:34px 0 10px}}
  h1{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:clamp(34px,7vw,56px);line-height:.98;max-width:16ch}}
  .dek{{font-size:17px;line-height:1.6;color:var(--muted);margin-top:14px;max-width:52ch}}
  .byline{{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted);margin:18px 0 30px;
    padding-bottom:18px;border-bottom:1px solid var(--line)}}
  .byline b{{color:var(--ink)}}
  /* Six full-body frames, one fixed ratio, because the whole product is that
     six strangers read as one set. Never let a frame keep its own shape here. */
  .six{{display:grid;gap:26px 20px;grid-template-columns:1fr}}
  @media(min-width:620px){{.six{{grid-template-columns:1fr 1fr}}}}
  @media(min-width:940px){{.six{{grid-template-columns:1fr 1fr 1fr}}}}
  figure.person{{margin:0}}
  .shot{{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:12px;
    border:1px solid var(--line);background:#000}}
  .shot img{{width:100%;height:100%;object-fit:cover;display:block}}
  .no{{position:absolute;left:10px;top:9px;font-family:'JetBrains Mono',monospace;
    font-size:10.5px;letter-spacing:.16em;color:var(--pink);
    text-shadow:0 1px 2px rgba(0,0,0,.98),0 0 7px rgba(0,0,0,.9)}}
  figcaption{{padding-top:11px}}
  .nm{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:23px;line-height:1.05}}
  .hd{{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;
    color:var(--muted);margin-top:3px}}
  .hd a{{color:var(--muted);text-decoration:none}}
  .hd a:hover{{color:var(--pink)}}
  .sd{{font-size:15px;line-height:1.55;color:var(--ink);margin-top:8px}}
  .sd:before{{content:'\\201C';color:var(--pink)}}
  .sd:after{{content:'\\201D';color:var(--pink)}}
  .foot{{margin-top:52px;padding-top:20px;border-top:1px solid var(--line);
    font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted);line-height:1.9}}
  .foot a{{color:var(--pink);text-decoration:none}}
  .policy{{margin-top:14px;text-transform:none;letter-spacing:0;
    font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.65;max-width:60ch}}
</style>
</head>
<body>
<div class="leopard-bar"></div>
<div class="wrap">
  <a class="back" href="../">&larr; The Issue</a>
  <div class="kicker">SEEN</div>
  <h1>{title}</h1>
  <p class="dek">{dek}</p>
  <div class="byline">{num} &nbsp;·&nbsp; <b>{author}</b> &nbsp;·&nbsp; {venue} &nbsp;·&nbsp; {datestr}</div>

  <div class="six">
{cards}
  </div>

  <div class="foot">
    Every drop gets a number. This one is {num}. <a href="../">The Issue &rarr;</a>
    <p class="policy">Everybody here was asked, said yes, and was handed a card with
    this address on it. If you are in this and you want to come off, email
    <a href="mailto:offtheprintcollective@gmail.com">offtheprintcollective@gmail.com</a>
    and it comes off the site. Print is print, so anything already handed out stays out.</p>
  </div>
</div>
</body>
</html>
"""

CARD = """    <figure class="person">
      <div class="shot"><span class="no">{no:02d}</span>
        <img src="{img}" alt="{alt}" width="{w}" height="{h}" loading="lazy"></div>
      <figcaption>
        <div class="nm">{name}</div>{handle}
        <p class="sd">{line}</p>
      </figcaption>
    </figure>"""


def render(rec, story_dir):
    """data.json in, index.html out. THE ONLY PLACE THE SEEN PAGE IS ASSEMBLED,
    so reword.py re-renders through this and the template can never fork."""
    cards = []
    for i, p in enumerate(rec["people"], 1):
        hd = ""
        if p.get("handle"):
            h_clean = p["handle"].lstrip("@")
            if re.fullmatch(r"[A-Za-z0-9._]{1,30}", h_clean):
                hd = (f'\n        <div class="hd"><a href="https://instagram.com/{h_clean}"'
                      f' target="_blank" rel="noopener">@{h_clean}</a></div>')
            else:
                hd = f'\n        <div class="hd">{html.escape(p["handle"])}</div>'
        cards.append(CARD.format(
            no=i, img=p["file"],
            alt=html.escape(f"{p['name']} at {rec['venue']}"),
            w=p["w"], h=p["h"], name=html.escape(p["name"]),
            handle=hd, line=inline(p["line"])))
    d = date.fromisoformat(rec["date"])
    page = PAGE.format(
        title=html.escape(rec.get("title", "")), dek=html.escape(rec.get("dek", "")),
        slug=rec["slug"], num=rec.get("num", ""), author=html.escape(rec.get("author", "0FF THE PRINT")),
        venue=html.escape(rec.get("venue", "")),
        datestr=d.strftime("%b %d, %Y").upper(), cards="\n".join(cards))
    with open(os.path.join(story_dir, "index.html"), "w") as f:
        f.write(page)
    return page


def crop(src, w, h, y=0.5):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    sw, sh = im.size
    scale = max(w / sw, h / sh)
    r = im.resize((max(w, round(sw * scale)), max(h, round(sh * scale))), Image.LANCZOS)
    left, top = (r.width - w) // 2, int((r.height - h) * y)
    return r.crop((left, top, left + w, top + h))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("--title", required=True)
    ap.add_argument("--venue", required=True)
    ap.add_argument("--dek", required=True)
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--sheet", default="seen.txt", help="name of the sheet inside FRAMES_DIR")
    ap.add_argument("--tile", help="frame to cut the 4:5 grid thumb from (default: person 01)")
    ap.add_argument("--tile-y", type=float, default=0.4, dest="tile_y",
                    help="vertical anchor for the thumb crop, 0 keeps the top (default 0.4, "
                         "because a full-body frame centre-crops to a torso)")
    ap.add_argument("--crop-y", type=float, default=0.42, dest="crop_y",
                    help="vertical anchor for the six 4:5 frames (default 0.42)")
    ap.add_argument("--num", help="override the auto 0TP number")
    ap.add_argument("--issue", help="issue id; normally written by issue.py, not here")
    ap.add_argument("--credit", help="cover credit line if a frame is not ours")
    ap.add_argument("--author", default="0FF THE PRINT")
    a = ap.parse_args()

    frames_dir = os.path.abspath(os.path.expanduser(a.frames_dir))
    sheet_path = os.path.join(frames_dir, a.sheet)
    if not os.path.exists(sheet_path):
        sys.exit(f"no sheet at {sheet_path}. Three lines per person, blank line between.")
    people = parse_sheet(open(sheet_path).read(), frames_dir)
    if len(people) != 6:
        print(f"  ⚠️  {len(people)} people, not 6. The department is six. Building anyway.")
    if not people:
        sys.exit("nobody in the sheet")

    for p in people:
        if len(p["name"].split()) > 1:
            print(f"  ⚠️  {p['name']!r} looks like a full name. SEEN already publishes the "
                  f"venue and the date, so a surname makes them findable forever. "
                  f"First name or handle unless they asked for this.")

    with open(DESK) as f:
        desk = json.load(f)
    num = a.num or next_num(desk["items"])
    d = date.fromisoformat(a.date)
    slug = f"seen-{d.isoformat()}-{slugify(a.venue)}"
    story_dir = os.path.join(WORD, slug)
    os.makedirs(story_dir, exist_ok=True)

    for i, p in enumerate(people, 1):
        out = f"{i:02d}.jpg"
        crop(os.path.join(frames_dir, p["file"]), FRAME_W, FRAME_H, a.crop_y).save(
            os.path.join(story_dir, out), quality=84, optimize=True)
        p["out"] = out
        p["w"], p["h"] = FRAME_W, FRAME_H
        if p["handle"] and not re.fullmatch(r"[A-Za-z0-9._]{1,30}", p["handle"].lstrip("@")):
            print(f"  ⚠️  handle {p['handle']!r} is not a plain instagram handle, printing as text")

    tile_src = os.path.join(frames_dir, a.tile) if a.tile else os.path.join(frames_dir, people[0]["file"])
    crop(tile_src, THUMB_W, THUMB_H, a.tile_y).save(
        os.path.join(story_dir, "thumb.jpg"), quality=82, optimize=True)

    record = {
        "slug": slug, "dept": "seen", "title": no_dash(a.title), "dek": no_dash(a.dek),
        "venue": no_dash(a.venue),
        "date": d.isoformat(), "date_short": d.strftime("%m.%d.%y"), "num": num,
        "issue": a.issue or "", "author": no_dash(a.author), "credit": no_dash(a.credit or ""),
        "people": [{"file": p["out"], "source": p["file"], "name": p["name"],
                    "handle": p["handle"], "line": p["line"], "consent": p["consent"],
                    "use": p["use"], "w": p["w"], "h": p["h"]} for p in people],
    }
    render(record, story_dir)
    with open(os.path.join(story_dir, "data.json"), "w") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)
        f.write("\n")

    card = {
        "title": no_dash(a.title), "kicker": "SEEN",
        "dept": "seen", "dept_name": "SEEN", "kind": "SEEN",
        "dek": no_dash(a.dek), "date": d.strftime("%m.%d.%y"),
        "lanes": ["story"], "platform": "SITE",
        "thumb": f"word/{slug}/thumb.jpg", "link": f"word/{slug}/", "num": num,
    }
    if a.issue:
        card["issue"] = a.issue
    desk["items"].insert(0, card)
    with open(DESK, "w") as f:
        json.dump(desk, f, indent=2, ensure_ascii=False)
        f.write("\n")

    total = sum(os.path.getsize(os.path.join(story_dir, f))
                for f in os.listdir(story_dir) if f.endswith(".jpg"))
    promo = sum(1 for p in people if p["use"].endswith("promo"))
    print(f"  {num} · SEEN · {a.title}")
    print(f"  {len(people)} people, {total/1e6:.1f} MB of frames at word/{slug}/")
    print(f"  {promo}/{len(people)} cleared for promotional use")
    print(f"  /usr/bin/python3 verifyword.py --local {slug}")
    print(f"  git add -A && git commit -m 'seen: {slug}' && git push")


if __name__ == "__main__":
    main()
