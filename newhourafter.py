#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — THE HOUR AFTER builder.

Ten to fourteen full-bleed frames of the hour after the lights come up.
Timestamps as captions, a short lede, almost no words. No names, ever.

    /usr/bin/python3 newhourafter.py ~/Desktop/.../01_Source/after \
        --title "Deco Ballroom, 2:14am" --venue "Deco Ballroom" --date 2026-09-24 \
        --dek "The lot, the load out, and whoever was still talking at 3:30." \
        --lede "The room emptied in nine minutes. Everything after that happened outside."

The sheet (hourafter.txt in FRAMES_DIR) is one block per frame, blank line
between. Line 1 is the file, line 2 is the caption or "-" for none, then
"key: value" rows:

    IMG_1240.jpg
    -
    face: no

    IMG_1247.jpg
    The last two in the lot.
    face: yes
    consent: show and nod, 03:22

⛔ WHY THE DEPARTMENT WAS RENAMED. It was THE COMEDOWN. In ordinary use that word
   names the crash after drug intoxication, and publishing a face plus a timestamp
   plus a venue under it is a defamatory implication about an identifiable person.
   Every frame survives the rename; the exposure does not.

⛔ THE TWO OF THREE RULE. Publish the TIME, the VENUE, and an identifiable FACE:
   pick two. This department publishes time and venue, so a readable face needs a
   consent note or it does not go in. `face: yes` without `consent:` refuses.

⛔ THE HARD NO LIST is printed at the end of every run. Nobody incapacitated,
   carried, crying, sick, fighting, arrested, receiving medical attention, anybody
   who reads under 18, and nobody who is the joke of the frame. It is printed
   rather than enforced because no script can see a photograph.

The page carries NO <article> element. word.js and bake.py both write into
<article> and would replace the sequence with prose.
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

LONG_EDGE = 1400                   # full bleed on a phone, still under budget
THUMB_W, THUMB_H = 900, 1125
BUDGET_MB = 10.0

HARD_NO = [
    "incapacitated, or being carried",
    "crying, sick, or in distress",
    "fighting, or being arrested",
    "receiving medical attention",
    "anybody who reads under 18",
    "anybody who is the joke of the frame",
]


# ⛔ THE FILENAME IS THE CLOCK ON THIS CAMERA, NOT EXIF. Measured on his own disk:
#    the Luna Ultra writes IMG_YYYYMMDD_HHMMSS_NNN.jpg and carries NO
#    DateTimeOriginal at all. A graded frame has zero EXIF tags, and even the
#    untouched source has 11 tags with no 36867 among them. So an EXIF-first
#    reader prints a blank stamp on every frame the department will ever shoot.
#    Filename first, EXIF second, --start last.
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
    frames = []
    for block in re.split(r"\n\s*\n", txt.strip()):
        lines = [l.rstrip() for l in block.strip().splitlines() if l.strip()]
        if not lines:
            continue
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
        face = meta.get("face", "no").lower() in ("yes", "y", "true")
        if face and not meta.get("consent"):
            sys.exit(f"{fn} is marked face: yes with no consent line.\n"
                     f"  This department publishes the TIME and the VENUE, so a readable "
                     f"face is the third thing and needs the show-and-nod recorded, e.g.\n"
                     f"  consent: show and nod, 03:22\n"
                     f"  Or crop it to a fragment and set face: no.")
        frames.append({"file": fn, "caption": no_dash(cap), "face": face,
                       "consent": no_dash(meta.get("consent", ""))})
    return frames


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{title} · THE HOUR AFTER · 0FF THE PRINT</title>
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
  .wrap{{max-width:760px;margin:0 auto;padding:34px 20px 90px}}
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
  .lede{{font-size:18px;line-height:1.75;margin:0 0 34px}}
  /* Full bleed on a phone. The sequence IS the piece, so nothing sits beside
     anything: one frame, one beat, scroll. */
  figure.f{{margin:0 -20px 8px}}
  figure.f img{{width:100%;display:block;background:#000}}
  @media(min-width:800px){{figure.f{{margin:0 0 8px}} figure.f img{{border-radius:12px}}}}
  .stamp{{display:flex;gap:14px;align-items:baseline;
    padding:9px 20px 34px;font-family:'JetBrains Mono',monospace;font-size:10.5px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}}
  @media(min-width:800px){{.stamp{{padding:9px 0 34px}}}}
  .stamp b{{color:var(--pink);font-weight:500;letter-spacing:.2em}}
  .stamp span{{text-transform:none;letter-spacing:0;font-family:Inter,system-ui,sans-serif;
    font-size:13.5px;color:var(--ink)}}
  .foot{{margin-top:30px;padding-top:20px;border-top:1px solid var(--line);
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
  <div class="kicker">THE HOUR AFTER</div>
  <h1>{title}</h1>
  <p class="dek">{dek}</p>
  <div class="byline">{num} &nbsp;·&nbsp; <b>{author}</b> &nbsp;·&nbsp; {venue} &nbsp;·&nbsp; {datestr}</div>
  <p class="lede">{lede}</p>

{frames}

  <div class="foot">
    Every drop gets a number. This one is {num}. <a href="../">The Issue &rarr;</a>
    <p class="policy">Nobody in here is named. If you recognise yourself and you want
    the frame down, email
    <a href="mailto:offtheprintcollective@gmail.com">offtheprintcollective@gmail.com</a>
    and it comes off the site.</p>
  </div>
</div>
</body>
</html>
"""

FRAME = """  <figure class="f"><img src="{img}" alt="{alt}" width="{w}" height="{h}" loading="lazy"></figure>
  <div class="stamp"><b>{time}</b>{cap}</div>"""


def render(rec, story_dir):
    """data.json in, index.html out. THE ONLY PLACE THE PAGE IS ASSEMBLED, so
    reword.py re-renders through this and the template can never fork."""
    out_html = []
    for i, fr in enumerate(rec["frames"], 1):
        cap = f'<span>{inline(fr["caption"])}</span>' if fr.get("caption") else ""
        out_html.append(FRAME.format(
            img=fr["file"],
            alt=html.escape(fr.get("caption") or f"{rec['venue']}, frame {i}"),
            w=fr["w"], h=fr["h"], time=fr.get("time", ""), cap=cap))
    d = date.fromisoformat(rec["date"])
    page = PAGE.format(
        title=html.escape(rec.get("title", "")), dek=html.escape(rec.get("dek", "")),
        slug=rec["slug"], num=rec.get("num", ""), author=html.escape(rec.get("author", "0FF THE PRINT")),
        venue=html.escape(rec.get("venue", "")), lede=inline(rec.get("lede", "")),
        datestr=d.strftime("%b %d, %Y").upper(), frames="\n".join(out_html))
    with open(os.path.join(story_dir, "index.html"), "w") as f:
        f.write(page)
    return page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("--title", required=True)
    ap.add_argument("--venue", required=True)
    ap.add_argument("--dek", required=True)
    ap.add_argument("--lede", required=True, help="one short opening paragraph")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--sheet", default="hourafter.txt")
    ap.add_argument("--start", help="HH:MM for frame 01 when the files carry no EXIF "
                                    "(anything cut out of video)")
    ap.add_argument("--every", type=int, default=240,
                    help="seconds between synthesised stamps, used with --start")
    ap.add_argument("--tile", help="frame to cut the 4:5 grid thumb from (default: frame 01)")
    ap.add_argument("--tile-y", type=float, default=0.5, dest="tile_y")
    ap.add_argument("--num")
    ap.add_argument("--issue")
    ap.add_argument("--credit")
    ap.add_argument("--author", default="0FF THE PRINT")
    a = ap.parse_args()

    frames_dir = os.path.abspath(os.path.expanduser(a.frames_dir))
    sheet_path = os.path.join(frames_dir, a.sheet)
    if not os.path.exists(sheet_path):
        sys.exit(f"no sheet at {sheet_path}. One block per frame, blank line between.")
    frames = parse_sheet(open(sheet_path).read(), frames_dir)
    if not frames:
        sys.exit("no frames in the sheet")
    if not 10 <= len(frames) <= 14:
        print(f"  ⚠️  {len(frames)} frames. The department is 10 to 14. Building anyway.")

    # Sheet order is final order. EXIF only supplies the stamps, never the sequence,
    # because he curates the sequence and a clock does not.
    times, missing = [], 0
    base = None
    if a.start:
        hh, mm = (int(x) for x in a.start.split(":"))
        base = datetime.combine(date.fromisoformat(a.date), datetime.min.time()) \
            + timedelta(hours=hh, minutes=mm)
    for i, fr in enumerate(frames):
        t = frame_time(os.path.join(frames_dir, fr["file"]))
        if t is None:
            missing += 1
            t = base + timedelta(seconds=a.every * i) if base else None
        times.append(t)
    if missing and not a.start:
        print(f"  ⚠️  {missing}/{len(frames)} frames carry no readable time in the filename or EXIF, and no "
              f"--start was given, so those stamps print blank. Frames cut out of video "
              f"never have EXIF; pass --start HH:MM.")

    with open(DESK) as f:
        desk = json.load(f)
    num = a.num or next_num(desk["items"])
    d = date.fromisoformat(a.date)
    slug = f"hour-after-{d.isoformat()}-{slugify(a.venue)}"
    story_dir = os.path.join(WORD, slug)
    os.makedirs(story_dir, exist_ok=True)

    for i, (fr, t) in enumerate(zip(frames, times), 1):
        im = ImageOps.exif_transpose(Image.open(os.path.join(frames_dir, fr["file"]))).convert("RGB")
        im.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
        out = f"{i:02d}.jpg"
        im.save(os.path.join(story_dir, out), quality=82, optimize=True, progressive=True)
        fr["out"], fr["w"], fr["h"] = out, im.width, im.height
        fr["time"] = t.strftime("%H:%M") if t else ""

    tile_src = os.path.join(frames_dir, a.tile) if a.tile else os.path.join(frames_dir, frames[0]["file"])
    tim = ImageOps.exif_transpose(Image.open(tile_src)).convert("RGB")
    sw, sh = tim.size
    sc = max(THUMB_W / sw, THUMB_H / sh)
    r = tim.resize((max(THUMB_W, round(sw * sc)), max(THUMB_H, round(sh * sc))), Image.LANCZOS)
    left, top = (r.width - THUMB_W) // 2, int((r.height - THUMB_H) * a.tile_y)
    r.crop((left, top, left + THUMB_W, top + THUMB_H)).save(
        os.path.join(story_dir, "thumb.jpg"), quality=82, optimize=True)

    record = {
        "slug": slug, "dept": "hourafter", "title": no_dash(a.title),
        "dek": no_dash(a.dek), "venue": no_dash(a.venue),
        "date": d.isoformat(), "date_short": d.strftime("%m.%d.%y"), "num": num,
        "issue": a.issue or "", "author": no_dash(a.author), "credit": no_dash(a.credit or ""),
        "lede": no_dash(a.lede),
        "frames": [{"file": f["out"], "source": f["file"], "time": f["time"],
                    "caption": f["caption"], "face": f["face"], "consent": f["consent"],
                    "w": f["w"], "h": f["h"]} for f in frames],
    }
    render(record, story_dir)
    with open(os.path.join(story_dir, "data.json"), "w") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)
        f.write("\n")

    card = {
        "title": no_dash(a.title), "kicker": "THE HOUR AFTER",
        "dept": "hourafter", "dept_name": "THE HOUR AFTER", "kind": "HOUR AFTER",
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
    faces = sum(1 for f in frames if f["face"])
    print(f"  {num} · THE HOUR AFTER · {a.title}")
    print(f"  {len(frames)} frames, {total:.1f} MB at word/{slug}/")
    if total > BUDGET_MB:
        print(f"  ⚠️  over the {BUDGET_MB:.0f} MB budget for one committed piece. "
              f"Drop frames or lower quality before pushing.")
    print(f"  {faces} readable faces, all with a consent note")
    print("  BEFORE YOU PUSH, none of these is in the set:")
    for n in HARD_NO:
        print(f"    · {n}")
    print(f"  /usr/bin/python3 verifyword.py --local {slug}")
    print(f"  git add -A && git commit -m 'hour after: {slug}' && git push")


if __name__ == "__main__":
    main()
