#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — ALL NIGHT builder. The cover story.

One subject, seven chapters, getting ready through to the end of the night.
Each piece is "ALL NIGHT WITH ___".

    /usr/bin/python3 newallnight.py FRAMES_DIR --subject "Marisol" \
        --date 2026-09-24 --venue "Wav Room" \
        --dek "Seven hours, one night, from the mirror to the parking lot." \
        --lede "She started getting ready at seven for a room that opened at ten." \
        --agreement "appearance agreement signed 2026-09-24, 19:10, before the first frame"

The sheet (allnight.txt in FRAMES_DIR) is chapters, then frame blocks:

    ## GETTING READY
    IMG_1234.jpg
    Three on the bed. She went with the second one.
    quote: I decided at four. The rest of it was just proving it.

    IMG_1235.jpg
    -

    ## THE PREGAME
    IMG_1240.jpg
    Her friends arrive in the order they always do.
    others: yes
    consent: all four asked at the door, verbal yes, 20:15

⛔ THE THESIS IS CHAPTER 6 AGAINST CHAPTER 1. He photographed the version being CONSTRUCTED at
   7pm, so the piece has a control to compare the 3am face against. A build missing either one
   warns loudly, because without both it is a slideshow.

⛔ THE SUBJECT IS NAMED AND CONSENTS IN WRITING. That is what separates this from
   THE HOUR AFTER, which is candid and never names anyone. `--agreement` records the instrument
   and the time it was signed, and the build REFUSES without it.

⛔ EVERYONE WHO IS NOT THE SUBJECT IS A THIRD PARTY. Chapters 2 and 7 are group scenes and
   chapter 6 is a room with strangers in it. Any frame with an identifiable person who is not
   the subject is `others: yes` and needs its own `consent:` line, or it does not build.

⛔ TWO OF THREE, SAME AS EVERY OTHER DEPARTMENT. Publishing her NAME plus the real VENUE plus a
   per-minute TIMELINE plus her bedroom is a map of one woman's night: where she lives, who she
   is with, which door she uses, what time she is on the street. She is named, because that is
   the piece, so the other two give: `--place` prints the city and `--venue` stays in data.json,
   and `--stamps` defaults to one span per chapter instead of every minute. Her name is not in
   the URL either.

⛔ CAPACITY. Consent given sober at 7pm covers the night. Consent asked for at 1am does not mean
   the same thing, so nothing is ADDED to the scope after the first drink. If a frame needed a
   new permission late, it waits for the morning and gets `consent: confirmed next day`.

The page carries NO <article> element. word.js and bake.py both write into <article> and would
replace the sequence with prose.
"""
import argparse, html, json, os, re, sys
from datetime import date, datetime, timedelta

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
DESK = os.path.join(ROOT, "content", "desk.json")
WORD = os.path.join(ROOT, "word")

sys.path.insert(0, ROOT)
_argv, sys.argv = sys.argv, [sys.argv[0]]
from newstory import slugify, next_num, no_dash, inline   # noqa: E402
sys.argv = _argv

LONG_EDGE = 1500
THUMB_W, THUMB_H = 900, 1125
BUDGET_MB = 22.0                 # a cover story is longer than a department

# The agreed seven. Any chapter name is allowed, but these two carry the thesis.
CANON = ["GETTING READY", "THE PREGAME", "THE RIDE", "THE DOOR",
         "THE ROOM", "THE BATHROOM MIRROR", "THE HOUR AFTER"]
THESIS = ("GETTING READY", "THE BATHROOM MIRROR")

HARD_NO = [
    "incapacitated, or being carried",
    "crying, sick, or in distress",
    "fighting, or being arrested",
    "receiving medical attention",
    "anybody who reads under 18",
    "anybody who is the joke of the frame",
    "asleep, or unaware and identifiable",
    "anything she would not want a family member to open",
    "any frame wide enough to identify her building, her street or her door",
    "anyone who has not answered the group chat before the night starts",
]

# The Luna Ultra writes no EXIF DateTimeOriginal. The filename is the clock.
NAME_TIME = re.compile(r"(?:^|[^0-9])(20\d{6})[_-]?(\d{6})(?:[^0-9]|$)")


def frame_time(path):
    m = NAME_TIME.search(os.path.basename(path))
    if m:
        try:
            return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
        except ValueError:
            pass
    try:
        raw = Image.open(path).getexif().get(36867)
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S") if raw else None
    except Exception:
        return None


def parse_sheet(txt, frames_dir):
    """`## CHAPTER` heads, then blocks of: file / caption or '-' / key: value."""
    chapters, cur = [], None
    for block in re.split(r"\n\s*\n", txt.strip()):
        lines = [l.rstrip() for l in block.strip().splitlines() if l.strip()]
        if not lines:
            continue
        if lines[0].startswith("##"):
            name = no_dash(lines[0].lstrip("#").strip()).upper()
            cur = {"name": name, "frames": []}
            chapters.append(cur)
            lines = lines[1:]
            if not lines:
                continue
        if cur is None:
            sys.exit("the sheet must open with a chapter head, e.g. '## GETTING READY'")
        fn = lines[0].strip()
        cap = "" if len(lines) < 2 or lines[1].strip() == "-" else lines[1].strip()
        meta = {}
        for l in lines[2:]:
            if ":" not in l:
                sys.exit(f"expected 'key: value', got {l!r} in block for {fn}")
            k, v = l.split(":", 1)
            meta[k.strip().lower()] = v.strip()
        if not os.path.exists(os.path.join(frames_dir, fn)):
            sys.exit(f"frame not found in FRAMES_DIR: {fn}")
        others = meta.get("others", "no").lower() in ("yes", "y", "true")
        if others and not meta.get("consent"):
            sys.exit(f"{fn} is marked others: yes with no consent line.\n"
                     f"  The subject signed an agreement. Nobody else in the frame did.\n"
                     f"  Record who was asked and when, e.g.\n"
                     f"  consent: all four asked at the door, verbal yes, 20:15\n"
                     f"  Or crop the third parties out and set others: no.")
        cur["frames"].append({
            "file": fn, "caption": no_dash(cap),
            "quote": no_dash(meta.get("quote", "")),
            "others": others, "consent": no_dash(meta.get("consent", "")),
        })
    return [c for c in chapters if c["frames"]]


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{title} · ALL NIGHT · 0FF THE PRINT</title>
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
  .wrap{{max-width:780px;margin:0 auto;padding:34px 20px 90px}}
  a.back{{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--muted);text-decoration:none}}
  a.back:hover{{color:var(--pink)}}
  .kicker{{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.3em;
    text-transform:uppercase;color:var(--pink);margin:34px 0 10px}}
  h1{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:clamp(38px,8.4vw,72px);line-height:.94}}
  .dek{{font-size:17px;line-height:1.6;color:var(--muted);margin-top:14px;max-width:52ch}}
  .byline{{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted);margin:18px 0 26px;
    padding-bottom:18px;border-bottom:1px solid var(--line)}}
  .byline b{{color:var(--ink)}}
  .lede{{font-size:18.5px;line-height:1.75;margin:0 0 30px}}
  /* A chapter head is the only navigation this piece has, so it is a full stop:
     a rule, the hour, and the name. It has to survive being scrolled past fast. */
  .ch{{margin:46px 0 22px;padding-top:26px;border-top:1px solid var(--line)}}
  .ch-n{{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.28em;
    text-transform:uppercase;color:var(--muted)}}
  .ch-name{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:clamp(26px,5vw,42px);line-height:1;color:var(--pink);margin-top:5px}}
  figure.f{{margin:0 -20px 8px}}
  figure.f img{{width:100%;display:block;background:#000}}
  @media(min-width:820px){{figure.f{{margin:0 0 8px}} figure.f img{{border-radius:12px}}}}
  .stamp{{display:flex;gap:14px;align-items:baseline;
    padding:9px 20px 30px;font-family:'JetBrains Mono',monospace;font-size:10.5px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}}
  @media(min-width:820px){{.stamp{{padding:9px 0 30px}}}}
  .stamp b{{color:var(--pink);font-weight:500;letter-spacing:.2em}}
  .stamp span{{text-transform:none;letter-spacing:0;font-family:Inter,system-ui,sans-serif;
    font-size:13.5px;color:var(--ink)}}
  blockquote{{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    font-size:clamp(24px,4.6vw,34px);line-height:1.12;text-transform:uppercase;color:var(--pink);
    border-left:3px solid var(--pink);padding-left:18px;margin:16px 0 36px}}
  .foot{{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);
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
  <div class="kicker">ALL NIGHT</div>
  <h1>{title}</h1>
  <p class="dek">{dek}</p>
  <div class="byline">{num} &nbsp;·&nbsp; <b>{author}</b> &nbsp;·&nbsp; {venue} &nbsp;·&nbsp; {datestr}</div>
  <p class="lede">{lede}</p>

{chapters}

  <div class="foot">
    Every drop gets a number. This one is {num}. <a href="../">The Issue &rarr;</a>
    <p class="policy">{subject} agreed to this before the first frame and saw it before it went
    up. Anyone else in here was asked ahead of the night. If you are in this and you want a frame
    down, email <a href="mailto:offtheprintcollective@gmail.com">offtheprintcollective@gmail.com</a>
    and it is off the site within a day. Being straight with you about the limit: this site is
    built in the open, so a removed file stays in the code history until the history itself is
    rewritten. Ask and that gets done too, it just takes longer than a day.</p>
  </div>
</div>
</body>
</html>
"""

CHAPTER = """  <div class="ch"><div class="ch-n">Chapter {n}{hours}</div>
    <div class="ch-name">{name}</div></div>
{frames}"""

FRAME = """  <figure class="f"><img src="{img}" alt="{alt}" width="{w}" height="{h}" loading="lazy"></figure>
  <div class="stamp"><b>{time}</b>{cap}</div>{quote}"""


def render(rec, story_dir):
    """data.json in, index.html out. THE ONLY PLACE THE PAGE IS ASSEMBLED, so
    reword.py re-renders through this and the template can never fork."""
    out = []
    mode = rec.get("stamps", "chapter")
    for ci, ch in enumerate(rec["chapters"], 1):
        fr_html = []
        for i, fr in enumerate(ch["frames"], 1):
            cap = f'<span>{inline(fr["caption"])}</span>' if fr.get("caption") else ""
            q = (f'\n  <blockquote>{inline(fr["quote"])}</blockquote>'
                 if fr.get("quote") else "")
            fr_html.append(FRAME.format(
                img=fr["file"],
                alt=html.escape(fr.get("caption") or f"{rec.get('subject','')}, {ch['name'].lower()}"),
                w=fr["w"], h=fr["h"],
                time=(fr.get("time", "") if mode == "frame" else ""), cap=cap, quote=q))
        times = [f["time"] for f in ch["frames"] if f.get("time")]
        span = ""
        if times and mode != "none":
            span = (f" &nbsp;·&nbsp; {times[0]}" if times[0] == times[-1]
                    else f" &nbsp;·&nbsp; {times[0]} to {times[-1]}")
        out.append(CHAPTER.format(n=ci, hours=span,
                                  name=html.escape(ch["name"]), frames="\n".join(fr_html)))
    d = date.fromisoformat(rec["date"])
    page = PAGE.format(
        title=html.escape(rec.get("title", "")), dek=html.escape(rec.get("dek", "")),
        slug=rec["slug"], num=rec.get("num", ""),
        author=html.escape(rec.get("author", "0FF THE PRINT")),
        venue=html.escape(rec.get("place") or "San Antonio"),
        lede=inline(rec.get("lede", "")),
        subject=html.escape(rec.get("subject", "The subject")),
        datestr=d.strftime("%b %d, %Y").upper(), chapters="\n".join(out))
    with open(os.path.join(story_dir, "index.html"), "w") as f:
        f.write(page)
    return page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("--subject", required=True, help="how she wants to be named, first name or handle")
    ap.add_argument("--agreement", required=True,
                    help="the instrument and when it was signed, e.g. "
                         "'appearance agreement signed 2026-09-24, 19:10, before the first frame'")
    ap.add_argument("--venue", required=True,
                    help="the real room, RECORDED in data.json for his own ledger, NEVER printed")
    ap.add_argument("--place", default="San Antonio",
                    help="what the page actually prints as the location (default: San Antonio). "
                         "Naming the real venue alongside her name and the date publishes the "
                         "whole location record, which is the thing the two-of-three rule exists "
                         "to stop.")
    ap.add_argument("--dek", required=True)
    ap.add_argument("--lede", required=True)
    ap.add_argument("--title", help="default: ALL NIGHT WITH <subject>")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--sheet", default="allnight.txt")
    ap.add_argument("--stamps", choices=("none", "chapter", "frame"), default="chapter",
                    help="how precisely the page prints time. chapter (default) prints one span "
                         "per chapter, frame prints every minute and is a movement log, none "
                         "prints nothing.")
    ap.add_argument("--start", help="HH:MM for frame 01 if the files carry no readable time")
    ap.add_argument("--every", type=int, default=300)
    ap.add_argument("--tile", help="frame to cut the 4:5 grid thumb from (default: frame 01)")
    ap.add_argument("--tile-y", type=float, default=0.42, dest="tile_y")
    ap.add_argument("--num")
    ap.add_argument("--issue")
    ap.add_argument("--credit")
    ap.add_argument("--author", default="0FF THE PRINT")
    a = ap.parse_args()

    frames_dir = os.path.abspath(os.path.expanduser(a.frames_dir))
    sheet_path = os.path.join(frames_dir, a.sheet)
    if not os.path.exists(sheet_path):
        sys.exit(f"no sheet at {sheet_path}. Open it with '## GETTING READY'.")
    chapters = parse_sheet(open(sheet_path).read(), frames_dir)
    if not chapters:
        sys.exit("no chapters in the sheet")

    names = [c["name"] for c in chapters]
    total_frames = sum(len(c["frames"]) for c in chapters)
    missing_thesis = [t for t in THESIS if t not in names]
    if missing_thesis:
        print(f"  ⚠️  MISSING {' and '.join(missing_thesis)}. The piece is chapter 6 read against "
              f"chapter 1. Without both it is a slideshow, not a story. Building anyway.")
    # ⛔ CHAPTER 6 IS HERS. The agreement she signs says she shoots the mirror on
    #    the GO Ultra, reviews it first, and decides what he ever sees. He does
    #    not enter a restroom, and the rejected alternative (a closed car in a lot
    #    at 1am) is worse by every measure. If the spec and the paper ever
    #    disagree about who holds the camera, the paper wins.
    if "THE BATHROOM MIRROR" in names:
        print("  ⛔ THE BATHROOM MIRROR is HER footage, shot by her, reviewed by her first. "
              "If any frame in that chapter came off his camera, pull it before you push.")
    for n in names:
        if n not in CANON:
            print(f"  ⚠️  chapter {n!r} is not one of the seven. Fine if deliberate.")
    if total_frames < 18:
        print(f"  ⚠️  {total_frames} frames across {len(chapters)} chapters. A cover story that "
              f"spans a whole night wants roughly 24 to 40. Building anyway.")

    with open(DESK) as f:
        desk = json.load(f)
    num = a.num or next_num(desk["items"])
    d = date.fromisoformat(a.date)
    title = a.title or f"All Night With {a.subject}"
    # ⛔ HER NAME IS NOT IN THE URL. A slug of name + exact date is a permanent,
    #    indexed, searchable record of where one woman was on one night. The page
    #    names her; the address does not have to.
    slug = f"all-night-{d.isoformat()}"
    story_dir = os.path.join(WORD, slug)
    os.makedirs(story_dir, exist_ok=True)

    base = None
    if a.start:
        hh, mm = (int(x) for x in a.start.split(":"))
        base = datetime.combine(d, datetime.min.time()) + timedelta(hours=hh, minutes=mm)

    i, missing = 0, 0
    flat = [(c, fr) for c in chapters for fr in c["frames"]]
    for c, fr in flat:
        i += 1
        src = os.path.join(frames_dir, fr["file"])
        t = frame_time(src)
        if t is None:
            missing += 1
            t = base + timedelta(seconds=a.every * (i - 1)) if base else None
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        im.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
        out = f"{i:02d}.jpg"
        im.save(os.path.join(story_dir, out), quality=82, optimize=True, progressive=True)
        fr["source"], fr["file"] = fr["file"], out
        fr["w"], fr["h"] = im.width, im.height
        fr["time"] = t.strftime("%H:%M") if t else ""
    if missing and not a.start:
        print(f"  ⚠️  {missing}/{total_frames} frames have no readable time and no --start was "
              f"given, so those stamps print blank. A chapter with no hour loses the spine.")

    tile_src = os.path.join(frames_dir, a.tile) if a.tile else os.path.join(frames_dir, flat[0][1]["source"])
    tim = ImageOps.exif_transpose(Image.open(tile_src)).convert("RGB")
    sw, sh = tim.size
    sc = max(THUMB_W / sw, THUMB_H / sh)
    r = tim.resize((max(THUMB_W, round(sw * sc)), max(THUMB_H, round(sh * sc))), Image.LANCZOS)
    left, top = (r.width - THUMB_W) // 2, int((r.height - THUMB_H) * a.tile_y)
    r.crop((left, top, left + THUMB_W, top + THUMB_H)).save(
        os.path.join(story_dir, "thumb.jpg"), quality=82, optimize=True)

    record = {
        "slug": slug, "dept": "allnight", "title": no_dash(title),
        "subject": no_dash(a.subject), "agreement": no_dash(a.agreement),
        "dek": no_dash(a.dek), "lede": no_dash(a.lede),
        # `venue` is his ledger. `place` is what the page prints. Never swap them.
        "venue": no_dash(a.venue), "place": no_dash(a.place), "stamps": a.stamps,
        "date": d.isoformat(), "date_short": d.strftime("%m.%d.%y"), "num": num,
        "issue": a.issue or "", "author": no_dash(a.author), "credit": no_dash(a.credit or ""),
        "chapters": [{"name": c["name"], "frames": c["frames"]} for c in chapters],
    }
    render(record, story_dir)
    with open(os.path.join(story_dir, "data.json"), "w") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)
        f.write("\n")

    card = {
        "title": no_dash(title), "kicker": "ALL NIGHT",
        "dept": "allnight", "dept_name": "ALL NIGHT", "kind": "ALL NIGHT",
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
                for f in os.listdir(story_dir) if f.endswith(".jpg")) / 1e6
    others = sum(1 for _, fr in flat if fr["others"])
    print(f"  {num} · ALL NIGHT · {title}")
    print(f"  {len(chapters)} chapters, {total_frames} frames, {total:.1f} MB at word/{slug}/")
    if total > BUDGET_MB:
        print(f"  ⚠️  over the {BUDGET_MB:.0f} MB budget for one committed piece. Cut frames.")
    print(f"  agreement: {a.agreement}")
    print(f"  WHAT THIS PUBLISHES ABOUT HER:")
    print(f"    name    {a.subject}")
    print(f"    place   {a.place}      (real room {a.venue!r} stays in data.json only)")
    print(f"    time    {a.stamps}" + ("   ⛔ per-minute across a whole night is a movement log"
                                        if a.stamps == "frame" else ""))
    print(f"    url     /word/{slug}/   (her name is deliberately not in it)")
    print(f"  {others} frames carry third parties, all with a consent note")
    print("  BEFORE YOU PUSH, none of these is in the set:")
    for n in HARD_NO:
        print(f"    · {n}")
    print(f"  ⛔ SHE SEES IT BEFORE IT GOES UP. That is the deal, not a courtesy.")
    print(f"  /usr/bin/python3 verifyword.py --local {slug}")
    print(f"  git add -A && git commit -m 'all night: {slug}' && git push")


if __name__ == "__main__":
    main()
