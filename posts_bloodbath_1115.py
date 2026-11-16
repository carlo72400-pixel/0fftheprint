#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BLOODBATH 4: THE POSTS (11/15, his "Nah, don't hold anything back. Just post everything."): the night's Instagram
carousels and stories on one page beside the gallery, events/2026-11-13-bloodbath-4/posts/.
  - FOLLOW THE BLOOD: the 7 slides back to back, so it swipes as the one seamless strip it was made as
  - THE BURSTS: the 7 burst slides (each one also plays as a video on THE TAPE, "Bloodbath 4 · The Bursts")
  - THE STORIES: GESTURES and the FOLLOW THE BLOOD story
Pictures are the posted files (04_EDITS), re-saved as 1080 px webp for the page; no title in VP Deadeye (his 11/14 rule:
never on photo content). The page carries its own back key to the night (the street skin dresses top-level night pages
only). Also: a "the posts" line under the night page's looks line (re-run this after any newevent.py rebuild of the night)
and a row in content/drops.json, so the timeline gets a "new drop" card. Idempotent: run it again and nothing doubles.
Usage: /usr/bin/python3 posts_bloodbath_1115.py"""
import html, json, os, re
from PIL import Image
ROOT = os.path.dirname(os.path.abspath(__file__)); SLUG = '2026-11-13-bloodbath-4'
E = '/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-11-13_BLOODBATH-PrivatePark/04_EDITS'
OUT = os.path.join(ROOT, 'events', SLUG, 'posts'); os.makedirs(OUT, exist_ok=True)
FTB = [f'{E}/4 CAROUSEL - FOLLOW THE BLOOD/POST/follow-the-blood_{i:02d}.jpg' for i in range(1, 8)]
BURSTS = [('THE MIX', 1), ('BOB GIRLS', 2), ('STICKER GIRL', 3), ('THE MAT', 4), ('SCENE QUEENS', 5), ('THE PIT', 6), ('TONGUE DUO', 7)]
STORIES = [('GESTURES', f'{E}/1 STORIES/GESTURES/gestures_story.jpg'), ('FOLLOW THE BLOOD', f'{E}/1 STORIES/FOLLOW THE BLOOD/follow-the-blood_story.jpg')]

def webp(src, name, size):
    im = Image.open(src).convert('RGB'); assert im.size == size, (src, im.size)
    im.save(os.path.join(OUT, name), 'WEBP', quality=80, method=6)
    return name

ftb = [webp(f, f'ftb-{i:02d}.webp', (1080, 1440)) for i, f in enumerate(FTB, 1)]
bursts = [(t, webp(f'{E}/2 CAROUSEL - THE BURSTS/POST/the-bursts_{n:02d}.jpg', f'bursts-{n:02d}.webp', (1080, 1440))) for t, n in BURSTS]
stories = [(t, webp(f, f"story-{t.lower().replace(' ', '-')}.webp", (1080, 1920))) for t, f in STORIES]

# the timeline card (16:9) and the share card: the start of the strip, the 6:51 PM bucket and the Miku girl
strip = Image.open(f'{E}/4 CAROUSEL - FOLLOW THE BLOOD/follow-the-blood_full-strip.jpg').convert('RGB'); assert strip.size == (7560, 1440)
strip.crop((0, 0, 2560, 1440)).resize((1280, 720), Image.LANCZOS).save(os.path.join(OUT, 'card.jpg'), 'JPEG', quality=84, optimize=True, progressive=True)
strip.crop((0, 0, 2743, 1440)).resize((1200, 630), Image.LANCZOS).save(os.path.join(OUT, 'preview.jpg'), 'JPEG', quality=86, optimize=True, progressive=True)

E_ = html.escape
def img(name, alt, w, h, eager=False):
    lazy = '' if eager else ' loading="lazy"'       # outside the f-string: /usr/bin/python3 is 3.9
    return (f'<a href="{name}" target="_blank" rel="noopener"><img src="{name}" alt="{E_(alt)}" width="{w}" height="{h}"'
            f'{lazy} decoding="async"></a>')

ftb_html = '\n'.join(f'      {img(n, f"Follow The Blood, slide {i} of 7", 1080, 1440, eager=i <= 2)}' for i, n in enumerate(ftb, 1))
bursts_html = '\n'.join(f'      <figure>{img(n, f"The Bursts, slide {i} of 7: {t.title()}", 1080, 1440)}<figcaption>{i:02d} · {E_(t)}</figcaption></figure>'
                        for i, (t, n) in enumerate(bursts, 1))
stories_html = '\n'.join(f'      <figure>{img(n, f"The {t.title()} story", 1080, 1920)}<figcaption>{E_(t)}</figcaption></figure>' for t, n in stories)
DESC = 'BLOODBATH 4 at Private Park, San Marcos: the night\'s carousels and stories, Follow The Blood as one strip, The Bursts and both stories.'
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>BLOODBATH 4 · The posts · 0FF THE PRINT</title>
<meta name="description" content="{E_(DESC)}">
<link rel="canonical" href="https://0fftheprint.com/events/{SLUG}/posts/">
<meta name="theme-color" content="#0a0a0d">
<meta property="og:type" content="website">
<meta property="og:site_name" content="0FF THE PRINT">
<meta property="og:title" content="BLOODBATH 4 · The posts">
<meta property="og:description" content="{E_(DESC)}">
<meta property="og:url" content="https://0fftheprint.com/events/{SLUG}/posts/">
<meta property="og:image" content="https://0fftheprint.com/events/{SLUG}/posts/preview.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The start of the Follow The Blood strip: a bucket of fake blood spilling over, and the girl dressed as Miku in teal.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="../../../assets/favicon.svg">
<link rel="apple-touch-icon" href="../../../assets/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<!-- Built by posts_bloodbath_1115.py (repo root) from the posted files in the shoot's 04_EDITS. Self-contained: no shared CSS/JS. -->
<style>
:root{{--bg:#0a0a0d;--line:#23222b;--ink:#f4eef2;--muted:#9a93a3;--pink:#f7b9dd;--pink-glow:#ff79c6;--blood:#c2121c;
--f-display:'Saira Condensed',sans-serif;--f-body:'Inter',system-ui,sans-serif;--f-mono:'JetBrains Mono',monospace}}
*{{box-sizing:border-box}}
html{{background:var(--bg);-webkit-text-size-adjust:100%;text-size-adjust:100%}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--f-body);-webkit-font-smoothing:antialiased}}
a{{color:inherit}}
.key{{position:fixed;left:max(12px,env(safe-area-inset-left,0px));top:max(6px,env(safe-area-inset-top,0px));z-index:50;display:inline-flex;align-items:center;gap:6px;
  min-width:82px;min-height:44px;padding:0 14px;border-radius:999px;background:linear-gradient(#3d3b45,#25232b);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 4px 0 #08070b,0 6px 12px rgba(0,0,0,.5);color:#f1eef6;font:700 12px/1 system-ui,sans-serif;
  letter-spacing:.08em;text-transform:uppercase;text-decoration:none}}
.key span{{font-size:18px;line-height:1}}
.key:focus-visible,a:focus-visible,.row:focus-visible{{outline:2px solid #fff;outline-offset:3px}}
.wrap{{max-width:1180px;margin:0 auto;padding:calc(70px + env(safe-area-inset-top,0px)) 16px 40px}}
.kick{{font-family:var(--f-mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--pink-glow);margin:0}}
h1{{font-family:var(--f-display);font-weight:900;font-size:clamp(52px,14vw,120px);line-height:.88;letter-spacing:-.01em;margin:6px 0 10px;text-transform:uppercase}}
.lede{{max-width:640px;color:var(--muted);margin:0}}
h2{{font-family:var(--f-display);font-weight:900;font-size:clamp(30px,7vw,52px);line-height:.95;text-transform:uppercase;margin:46px 0 4px}}
.note{{font-family:var(--f-mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}}
.note a{{color:var(--pink-glow);text-decoration:none}}
.row{{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:var(--blood) transparent;
  margin:0 -16px;padding:0 16px 10px;gap:12px;scroll-padding-inline:16px}}
.row img{{display:block;width:min(84vw,460px);height:auto;aspect-ratio:3/4;background:#16141a}}
.row a,.row figure{{flex:none;scroll-snap-align:start;margin:0}}
.row.seam{{gap:0}}
.row.seam a{{scroll-snap-align:none}}
.row.seam a:first-child{{scroll-snap-align:start}}
figcaption{{font-family:var(--f-mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);padding-top:8px}}
.stories{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:760px}}
.stories figure{{margin:0}}
.stories img{{display:block;width:100%;height:auto;aspect-ratio:9/16;background:#16141a}}
.foot{{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);font-family:var(--f-mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}}
.foot a{{color:var(--pink-glow);text-decoration:none}}
@media (prefers-reduced-motion:reduce){{.row{{scroll-behavior:auto}}}}
</style>
</head>
<body>
<a class="key" href="../" aria-label="Back to the BLOODBATH 4 night"><span aria-hidden="true">&lsaquo;</span>Night</a>
<main class="wrap">
  <p class="kick">Private Park &nbsp;·&nbsp; Nov 13, 2026</p>
  <h1>BLOODBATH 4</h1>
  <p class="lede">Two carousels and two stories from the night. Tap any slide to open it full size.</p>

  <h2>Follow The Blood</h2>
  <p class="note">7 slides, one strip &nbsp;·&nbsp; swipe it: the 6:51 PM bucket spills and runs through the night into the 12:12 AM one</p>
  <div class="row seam" role="region" aria-label="Follow The Blood, 7 slides" tabindex="0">
{ftb_html}
  </div>

  <h2>The Bursts</h2>
  <p class="note">7 slides, each one a burst &nbsp;·&nbsp; every slide plays with its song on <a href="../../../video/">the tape</a></p>
  <div class="row" role="region" aria-label="The Bursts, 7 slides" tabindex="0">
{bursts_html}
  </div>

  <h2>The stories</h2>
  <p class="note">2 stories</p>
  <div class="stories">
{stories_html}
  </div>

  <div class="foot"><a href="../">The whole night: all the photos &rarr;</a> &nbsp;·&nbsp; <a href="../../../video/">The cuts on the tape &rarr;</a><br><br>
    Shot by 0FF THE PRINT &nbsp;·&nbsp; <a href="https://instagram.com/vamppsych">@vamppsych</a></div>
</main>
</body>
</html>
'''
assert '–' not in page and '—' not in page, 'no en or em dashes on the site'
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)

# the night page: one line under the looks line (newevent.py rewrites the page, so this runs again after a rebuild)
np = os.path.join(ROOT, 'events', SLUG, 'index.html'); s = open(np, encoding='utf-8').read()
LINE = ('  <div class="looks"><b>the posts</b> &nbsp;·&nbsp; <a href="posts/" style="color:var(--pink-glow);text-decoration:none">'
        'Follow The Blood, The Bursts and the stories &rarr;</a></div>\n')
if 'href="posts/"' not in s:
    m = re.search(r'  <div class="looks">.*?</div>\n', s); assert m, 'no looks line on the night page'
    s = s[:m.end()] + LINE + s[m.end():]; open(np, 'w', encoding='utf-8').write(s)

# the timeline: a "new drop" card (cathedral.js drops())
dp = os.path.join(ROOT, 'content', 'drops.json'); d = json.load(open(dp, encoding='utf-8'))
row = {"up": "2026-11-15", "title": "BLOODBATH 4: the posts",
       "line": "The night's carousels and stories: Follow The Blood as one strip, The Bursts slide by slide, and both stories.",
       "link": f"events/{SLUG}/posts/", "thumb": f"events/{SLUG}/posts/card.jpg", "go": "swipe the posts"}
d['items'] = [row] + [it for it in d['items'] if it.get('link') != row['link']]
open(dp, 'w', encoding='utf-8').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'posts page: {len(ftb)} + {len(bursts)} slides, {len(stories)} stories, {size // 1024} KB in {os.path.relpath(OUT, ROOT)}; night page linked; drops.json {len(d["items"])} rows')
