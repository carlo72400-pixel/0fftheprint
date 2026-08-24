#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT - PRIVATE client delivery gallery.

Same engine as newevent.py, different job: a branded gallery the CLIENT gets,
not the public. Full quality photos and video, one link.

    /usr/bin/python3 newclient.py "/path/to/graded" --client "Bethel UMC" \
        --title "Sunday Service" --date 2026-08-23 --videos "/path/clips" --pin 4471

What "private" means here, in plain terms:

  1. The URL is the secret. The gallery lives at clients/c-<12 random hex>/,
     ~48 bits of slug. It is linked NOWHERE, the page carries
     noindex/nofollow, and /clients/ itself has no index page, so there is
     nothing to browse. Same model as Pixieset / Pic-Time guest links.
  2. --pin adds a code gate ON THE PAGE (hashed, checked in the browser,
     remembered per tab). It keeps a forwarded link from being casually opened.
     It does NOT encrypt the media. The slug stays the real lock.
  3. Full frames and video go up as release assets on a SEPARATE repo
     (0tp-vault), tagged by the random slug, files named 001.jpg... so the
     listing shows nothing about who or what. Caveat: that listing is
     technically public, it is just anonymous and unguessable.

Do NOT add these galleries to events.json, the nav, or anything crawlable.
Send the client the printed link, that is the whole delivery.
"""
import argparse, hashlib, json, os, re, secrets, shutil, subprocess, sys, tempfile
import numpy as np
from datetime import datetime

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.abspath(__file__))
CLIENTS = os.path.join(ROOT, "clients")
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".heic", ".HEIC", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".MP4", ".MOV"}

MEDIA_REPO = "carlo72400-pixel/0tp-vault"   # client deliveries, separate from the public drops
REL_BASE   = f"https://github.com/{MEDIA_REPO}/releases/download"

THUMB_W, THUMB_Q = 520, 72          # grid tile, the ONLY thing committed
LIGHT_W, LIGHT_Q = 2560, 90         # lightbox view, on the release
NATIVE_Q         = 92               # full native export, on the release
VIDEO_H, VIDEO_CRF = 1080, 20       # clip, on the release. 4K: set 2160/22.


PINGATE = """
<div id="ping" style="position:fixed;inset:0;z-index:999;background:#0a0a0d;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;font-family:var(--f-mono)">
  <div style="font-size:11px;letter-spacing:.3em;color:#9a93a3">THIS GALLERY IS FOR YOU. ENTER THE CODE FROM YOUR MESSAGE.</div>
  <input id="pini" inputmode="numeric" autocomplete="one-time-code" style="background:#121218;border:1px solid #23222b;border-radius:8px;color:#f4eef2;font-family:inherit;font-size:22px;letter-spacing:.4em;text-align:center;padding:10px 14px;width:200px" />
  <div id="pinm" style="font-size:11px;color:#f48fc8;min-height:16px"></div>
</div>
<script>
(function(){
  var H='__PINHASH__', K='otp-pin-__SLUGK__';
  async function sha(t){var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  var g=document.getElementById('ping'), i=document.getElementById('pini'), m=document.getElementById('pinm');
  if (sessionStorage.getItem(K)===H){ g.remove(); return; }
  i.focus();
  i.addEventListener('input', async function(){
    if (i.value.length < 4) return;
    if (await sha(i.value.trim())===H){ sessionStorage.setItem(K,H); g.remove(); }
    else if (i.value.length >= 8){ m.textContent='not it, check the message'; i.value=''; }
  });
})();
</script>
"""


def slugify(s):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def human(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f}{u}"
        n /= 1024
    return f"{n:.1f}TB"


def dir_size(p):
    return sum(os.path.getsize(os.path.join(dp, f))
               for dp, _, fs in os.walk(p) for f in fs)


def score_frame(path):
    """Cheap keeper score: sharpness, minus penalties for dead or blown frames.

    Even-sampling a shoot pulls duds (lens-cap blacks, floor shots, motion mush).
    A photo dump should read like selects, so score first and keep the best.
    """
    try:
        im = load_image(path)
    except Exception:
        return -1e9
    g = im.convert("L")
    g.thumbnail((320, 320), Image.LANCZOS)
    a = np.asarray(g, dtype=np.float32)
    # Laplacian variance = focus/detail
    lap = (a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:] - 4 * a[1:-1, 1:-1])
    sharp = float(lap.var())
    mean = float(a.mean())
    dark = float((a < 12).mean())      # near-black coverage
    blown = float((a > 245).mean())
    s = sharp
    if dark > 0.55: s *= 0.15          # mostly a black frame
    elif dark > 0.40: s *= 0.5
    if mean < 26: s *= 0.35            # underexposed throwaway
    if blown > 0.22: s *= 0.5
    return s


def pick(files, limit, folder=None, mode="best"):
    """Keep the strongest frames, then restore shoot order so the night still reads."""
    if not limit or limit >= len(files):
        return files
    if mode != "best" or folder is None:
        step = len(files) / limit
        return [files[int(i * step)] for i in range(limit)]
    print("  scoring frames…", end="\r")
    scored = [(score_frame(os.path.join(folder, f)), i, f) for i, f in enumerate(files)]
    keep = sorted(scored, key=lambda t: t[0], reverse=True)[:limit]
    dropped = len(files) - len(keep)
    print(f"  scored {len(files)}, kept {len(keep)}, dropped {dropped} weak frames")
    return [f for _, _, f in sorted(keep, key=lambda t: t[1])]


def load_image(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)          # phones lie about orientation
    return im.convert("RGB")


def build_photos(src, out_dir, stage_dir, tag, limit, mode='best'):
    """Thumbs -> out_dir (committed). Lightbox + native -> stage_dir (released)."""
    files = sorted(f for f in os.listdir(src)
                   if os.path.splitext(f)[1] in PHOTO_EXT and not f.startswith("."))
    if not files:
        sys.exit(f"no photos found in {src}")
    chosen = pick(files, limit, src, mode)
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(stage_dir, exist_ok=True)
    items = []
    for i, fn in enumerate(chosen, 1):
        try:
            im = load_image(os.path.join(src, fn))
        except Exception as e:
            print(f"  skip {fn}: {e}")
            continue
        stem = f"{i:03d}"

        # lightbox copy, goes on the release
        light = im.copy()
        light.thumbnail((LIGHT_W, LIGHT_W), Image.LANCZOS)
        light.save(os.path.join(stage_dir, f"{stem}.jpg"), quality=LIGHT_Q, optimize=True)

        # the native export, untouched size, also on the release
        im.save(os.path.join(stage_dir, f"{stem}_full.jpg"), quality=NATIVE_Q, optimize=True)

        # the only thing that gets committed
        th = im.copy()
        th.thumbnail((THUMB_W, THUMB_W), Image.LANCZOS)
        th.save(os.path.join(out_dir, f"{stem}_t.jpg"), quality=THUMB_Q, optimize=True)

        items.append({"type": "photo",
                      "src":   f"{REL_BASE}/{tag}/{stem}.jpg",
                      "full":  f"{REL_BASE}/{tag}/{stem}_full.jpg",
                      "thumb": f"media/{stem}_t.jpg",
                      "w": light.width, "h": light.height})
        print(f"  [{i}/{len(chosen)}] {fn}", end="\r")
    print(f"  {len(items)} photos" + " " * 40)
    return items


def build_videos(src, out_dir, stage_dir, tag, limit):
    """Clip -> stage_dir (released). Poster frame -> out_dir (committed)."""
    if not shutil.which("ffmpeg"):
        print("  ffmpeg not found, skipping videos")
        return []
    files = sorted(f for f in os.listdir(src)
                   if os.path.splitext(f)[1] in VIDEO_EXT and not f.startswith("."))
    chosen = pick(files, limit, mode='even')
    os.makedirs(stage_dir, exist_ok=True)
    items = []
    for i, fn in enumerate(chosen, 1):
        stem = f"v{i:02d}"
        outv = os.path.join(stage_dir, f"{stem}.mp4")
        subprocess.run([
            "ffmpeg", "-y", "-i", os.path.join(src, fn),
            "-vf", f"scale=-2:{VIDEO_H}", "-c:v", "libx264", "-crf", str(VIDEO_CRF),
            "-preset", "veryfast", "-c:a", "aac", "-b:a", "160k",
            # faststart puts the index at the front so it plays before it finishes
            # downloading. On a release asset that is the difference between
            # "instant" and "stares at a black box".
            "-movflags", "+faststart", outv,
        ], capture_output=True)
        if not os.path.exists(outv):
            print(f"  video failed: {fn}")
            continue
        size = os.path.getsize(outv)
        # No size gate any more. The old one deleted anything over 90MB because
        # GitHub rejects files over 100MB inside a repo. Release assets take 2GiB,
        # which is why both shipped events contain zero video.
        if size > 2 * 1024 * 1024 * 1024:
            print(f"  {fn} is {human(size)}, over the 2GiB release ceiling, left out")
            os.remove(outv)
            continue
        poster = os.path.join(out_dir, f"{stem}_t.jpg")
        subprocess.run(["ffmpeg", "-y", "-i", outv, "-vf",
                        f"thumbnail,scale={THUMB_W}:-2", "-frames:v", "1", poster],
                       capture_output=True)
        pw = ph = None
        try:
            with Image.open(poster) as pim:
                pw, ph = pim.size
        except Exception:
            pass
        items.append({"type": "video",
                      "src":   f"{REL_BASE}/{tag}/{stem}.mp4",
                      "thumb": f"media/{stem}_t.jpg",
                      "w": pw, "h": ph})
        print(f"  [{i}/{len(chosen)}] {fn} -> {human(size)}")
    return items


def publish_release(tag, stage_dir, title):
    """Push everything in stage_dir to a release on the media repo."""
    if not shutil.which("gh"):
        sys.exit("needs the GitHub CLI: brew install gh")
    files = sorted(os.path.join(stage_dir, f) for f in os.listdir(stage_dir)
                   if not f.startswith("."))
    if not files:
        return 0
    total = sum(os.path.getsize(f) for f in files)
    print(f"  uploading {len(files)} files ({human(total)}) to {MEDIA_REPO} @ {tag}")

    # Recreate rather than append, so a rebuild never leaves stale frames behind.
    subprocess.run(["gh", "release", "delete", tag, "--repo", MEDIA_REPO,
                    "--yes", "--cleanup-tag"], capture_output=True)
    r = subprocess.run(["gh", "release", "create", tag, "--repo", MEDIA_REPO,
                        "--title", title, "--notes",
                        "Full quality assets for this dump. The gallery links here."],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"  release create failed: {r.stderr.strip()}")

    # Upload in batches. One giant argv both risks the arg limit and gives you
    # nothing to look at for several minutes.
    B = 20
    for i in range(0, len(files), B):
        batch = files[i:i + B]
        u = subprocess.run(["gh", "release", "upload", tag, "--repo", MEDIA_REPO,
                            "--clobber"] + batch, capture_output=True, text=True)
        if u.returncode != 0:
            sys.exit(f"  upload failed: {u.stderr.strip()}")
        print(f"    {min(i + B, len(files))}/{len(files)}", end="\r")
    print(f"    {len(files)}/{len(files)} uploaded" + " " * 20)
    return total


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>__TITLE__ · 0FF THE PRINT</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="Private delivery gallery.">
<meta name="theme-color" content="#0a0a0d">
<meta property="og:type" content="website">
<meta property="og:title" content="__TITLE__ · __VENUE__">
<meta property="og:description" content="__COUNT__ files, full quality, ready to save.">
<meta property="og:image" content="https://0fftheprint.com/clients/__SLUG__/preview.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://0fftheprint.com/clients/__SLUG__/preview.jpg">
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0a0d;--panel:#121218;--line:#23222b;--ink:#f4eef2;--muted:#9a93a3;
--pink:#f7b9dd;--pink-deep:#f48fc8;--pink-glow:#ff79c6;--dye-blue:#2f6bff;
--f-display:'Saira Condensed',sans-serif;--f-body:'Inter',system-ui,sans-serif;--f-mono:'JetBrains Mono',monospace;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.leopard-bar{height:14px;background:linear-gradient(90deg,var(--pink-deep),var(--pink) 25%,var(--dye-blue) 50%,var(--pink-deep) 75%,var(--pink))}
.wrap{max-width:1400px;margin:0 auto;padding:26px 18px 70px}
.back{font-family:var(--f-mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);text-decoration:none;display:inline-block;margin-bottom:22px}
.back:hover{color:var(--pink-glow)}
.prep{font-family:var(--f-mono);font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--pink-glow);margin-bottom:4px}
h1{font-family:var(--f-display);font-style:italic;font-weight:900;text-transform:uppercase;
font-size:clamp(34px,7vw,76px);line-height:.94;letter-spacing:-.01em;
background:linear-gradient(180deg,#fff 10%,var(--pink) 45%,#8f8a97 60%,var(--pink-deep) 96%);
-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 24px rgba(255,121,198,.22))}
.meta{font-family:var(--f-mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-top:10px}
.meta b{color:var(--pink-glow);font-weight:500}
.grid{columns:4 260px;column-gap:12px;margin-top:26px}
.tile{break-inside:avoid;margin:0 0 12px;position:relative;display:block;width:100%;
border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel);cursor:zoom-in}
/* width/height on the img give it an intrinsic ratio so the tile has a real
   height BEFORE the picture arrives. Without that the column collapses to 2px,
   nothing intersects the viewport, loading="lazy" never fires, and the grid
   stays empty forever. That deadlock shipped and nobody caught it. */
.tile img{width:100%;height:auto;display:block;aspect-ratio:16/9;
transition:transform .35s ease,filter .35s ease}
.tile img[width][height]{aspect-ratio:auto}
.tile:hover img{transform:scale(1.03);filter:brightness(1.08)}
.tile.vid::after{content:'▶';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
width:52px;height:52px;border-radius:50%;background:rgba(10,10,13,.72);border:1px solid var(--pink-deep);
color:var(--pink-glow);display:flex;align-items:center;justify-content:center;font-size:17px;padding-left:3px}
.foot{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);
font-family:var(--f-mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.foot a{color:var(--pink-glow);text-decoration:none}
/* lightbox */
.lb{position:fixed;inset:0;z-index:200;background:rgba(6,6,9,.96);display:none;
align-items:center;justify-content:center;padding:26px}
.lb.open{display:flex}
.lb img,.lb video{max-width:100%;max-height:88vh;border-radius:8px;box-shadow:0 20px 70px rgba(0,0,0,.7)}
.lb-x,.lb-n,.lb-p{position:absolute;background:rgba(18,18,24,.9);border:1px solid var(--line);
color:var(--ink);width:46px;height:46px;border-radius:50%;cursor:pointer;font-size:18px}
.lb-x{top:18px;right:18px}
.lb-p{left:18px;top:50%;transform:translateY(-50%)}
.lb-n{right:18px;top:50%;transform:translateY(-50%)}
.lb-x:hover,.lb-n:hover,.lb-p:hover{border-color:var(--pink-deep);color:var(--pink-glow)}
.lb-dl{position:fixed;left:18px;bottom:18px;z-index:12;font-family:var(--f-mono,monospace);
font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#f7b9dd;text-decoration:none;
border:1px solid rgba(255,121,198,.45);border-radius:999px;padding:8px 14px;background:rgba(10,10,13,.75)}
.lb-dl:hover{color:#0a0a0d;background:#f7b9dd}
.lb-count{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);
font-family:var(--f-mono);font-size:11px;letter-spacing:.2em;color:var(--muted)}
@media (max-width:640px){.grid{columns:2 150px;column-gap:8px}.tile{margin-bottom:8px}
.lb-p,.lb-n{width:40px;height:40px}}
</style>
</head>
<body>
<div class="leopard-bar"></div>
<div class="wrap">
  <a class="back" href="https://0fftheprint.com/">0FF THE PRINT</a>
  <div class="prep">PREPARED FOR</div>
  <h1>__TITLE__</h1>
  <div class="meta"><b>__VENUE__</b> &nbsp;·&nbsp; __DATELONG__ &nbsp;·&nbsp; __COUNT__ files &nbsp;·&nbsp; full quality</div>
  <div class="grid" id="grid"></div>
  <div class="foot">Everything on this page is yours in full quality. The &darr; on each one
    saves the untouched export. Want a different crop or grade on any frame, just say which one.
    &nbsp;·&nbsp; Shot by 0FF THE PRINT &nbsp;·&nbsp;
    <a href="https://instagram.com/vamppsych" target="_blank" rel="noopener">@vamppsych</a></div>
</div>
<div class="lb" id="lb">
  <button class="lb-x" id="lbx" aria-label="Close">&times;</button>
  <button class="lb-p" id="lbp" aria-label="Previous">&#8249;</button>
  <button class="lb-n" id="lbn" aria-label="Next">&#8250;</button>
  <div id="lbstage"></div>
  <div class="lb-count" id="lbc"></div>
  <a class="lb-dl" id="lbdl" href="#" target="_blank" rel="noopener">full res &darr;</a>
</div>
<script>
const MEDIA = __MEDIA__;
const grid = document.getElementById('grid');
grid.innerHTML = MEDIA.map((m,i) =>
  `<a class="tile${m.type==='video'?' vid':''}" data-i="${i}" href="${m.src}">
     <img src="${m.thumb}" alt="Frame ${i+1}" loading="lazy" decoding="async"
          width="${m.w||16}" height="${m.h||9}">
   </a>`).join('');
const lb=document.getElementById('lb'), stage=document.getElementById('lbstage'), count=document.getElementById('lbc');
let cur=0;
function show(i){
  cur=(i+MEDIA.length)%MEDIA.length;
  const m=MEDIA[cur];
  stage.innerHTML = m.type==='video'
    ? `<video src="${m.src}" controls autoplay playsinline></video>`
    : `<img src="${m.src}" alt="Frame ${cur+1}">`;
  // The native export sits on the same release. download attr is ignored
  // cross-origin, but GitHub already sends content-disposition: attachment,
  // so it saves rather than navigating anyway.
  const dl=document.getElementById('lbdl');
  if(m.full){dl.href=m.full;dl.style.display='';}else{dl.style.display='none';}
  count.textContent=`${cur+1} / ${MEDIA.length}`;
  lb.classList.add('open'); document.body.style.overflow='hidden';
}
function close(){lb.classList.remove('open');stage.innerHTML='';document.body.style.overflow='';}
grid.addEventListener('click',e=>{const t=e.target.closest('.tile');if(!t)return;e.preventDefault();show(+t.dataset.i);});
document.getElementById('lbx').onclick=close;
document.getElementById('lbn').onclick=()=>show(cur+1);
document.getElementById('lbp').onclick=()=>show(cur-1);
lb.addEventListener('click',e=>{if(e.target===lb)close();});
document.addEventListener('keydown',e=>{
  if(!lb.classList.contains('open'))return;
  if(e.key==='Escape')close(); if(e.key==='ArrowRight')show(cur+1); if(e.key==='ArrowLeft')show(cur-1);
});
</script>
__PINGATE__</body>
</html>
"""


def make_og(first_photo, out_path, title, venue, datelong):
    """Event OG card: the night's own frame, darkened, so links unfurl."""
    im = load_image(first_photo)
    W, H = 1200, 630
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im = im.crop(((im.width - W) // 2, (im.height - H) // 2,
                  (im.width - W) // 2 + W, (im.height - H) // 2 + H))
    from PIL import ImageDraw, ImageEnhance
    im = ImageEnhance.Brightness(im).enhance(0.52)
    d = ImageDraw.Draw(im)
    d.rectangle([0, H - 14, W, H], fill=(244, 143, 200))
    try:
        big = ImageFontTruetype("/System/Library/Fonts/Supplemental/Impact.ttf", 96)
    except Exception:
        big = None
    d.text((54, H - 190), title.upper(), fill=(255, 255, 255), font=big)
    d.text((56, H - 96), f"{venue.upper()}   ·   {datelong.upper()}", fill=(247, 185, 221))
    d.text((56, 44), "0FF THE PRINT", fill=(255, 121, 198))
    im.save(out_path, quality=88)


def ImageFontTruetype(path, size):
    from PIL import ImageFont
    return ImageFont.truetype(path, size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="folder of photos")
    ap.add_argument("--client", required=True, help="who this delivery is for, shown on the page")
    ap.add_argument("--title", help="shoot name (defaults to the client)")
    ap.add_argument("--date", required=True, help="YYYY-MM-DD")
    ap.add_argument("--videos", help="folder of clips (optional)")
    ap.add_argument("--limit", type=int, default=0, help="max photos (default 0 = deliver everything)")
    ap.add_argument("--pick", choices=["best", "even"], default="best",
                    help="best = score and keep the keepers (default); even = sample across the shoot")
    ap.add_argument("--video-limit", type=int, default=0, help="0 = all clips")
    ap.add_argument("--slug", help="reuse an existing slug to update a delivery")
    ap.add_argument("--pin", help="optional 4-8 digit code gate on the page")
    ap.add_argument("--no-upload", action="store_true",
                    help="build everything but skip the release upload (dry run)")
    a = ap.parse_args()

    a.venue = a.client
    title = a.title or a.client
    dt = datetime.strptime(a.date, "%Y-%m-%d")
    datelong = dt.strftime("%b %-d, %Y")
    dateshort = dt.strftime("%m.%d.%y")
    slug = a.slug or ("c-" + secrets.token_hex(6))
    out = os.path.join(CLIENTS, slug)
    media_dir = os.path.join(out, "media")
    os.makedirs(media_dir, exist_ok=True)
    # Staging sits OUTSIDE the repo on purpose. Nothing in here is ever committed;
    # it exists only to be uploaded to the release and then thrown away.
    stage = os.path.join(tempfile.gettempdir(), f"otp-stage-{slug}")
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage, exist_ok=True)

    print(f"\nBuilding {slug}")
    items = build_photos(a.source, media_dir, stage, slug, a.limit, a.pick)
    if a.videos:
        items += build_videos(a.videos, media_dir, stage, slug, a.video_limit)

    # OG card off the first LIGHTBOX frame, which lives in staging now
    first = os.path.join(stage, "001.jpg")
    if os.path.exists(first):
        make_og(first, os.path.join(out, "preview.jpg"), title, a.venue, datelong)

    # NOTE: the upload happens at the END, after the page and data.json are
    # written. It used to run here, and when a release failed the whole run died
    # before writing anything, so an event that had already spent ten minutes
    # encoding video came out with no video in it.

    gate = ""
    if a.pin:
        if not re.fullmatch(r"\d{4,8}", a.pin):
            sys.exit("--pin must be 4-8 digits")
        gate = (PINGATE.replace("__PINHASH__", hashlib.sha256(a.pin.encode()).hexdigest())
                       .replace("__SLUGK__", slug))
    page = (PAGE.replace("__PINGATE__", gate)
                .replace("__MEDIA__", json.dumps(items))
                .replace("__TITLE__", title)
                .replace("__VENUE__", a.venue)
                .replace("__DATELONG__", datelong)
                .replace("__COUNT__", str(len(items)))
                .replace("__SLUG__", slug))
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(page)
    json.dump({"slug": slug, "title": title, "venue": a.venue, "date": a.date,
               "date_short": dateshort, "count": len(items), "media": items},
              open(os.path.join(out, "data.json"), "w"), indent=2)

    # NO index update, on purpose. Private deliveries are linked nowhere.

    size = dir_size(out)
    print(f"\n  {out}")
    print(f"  {len(items)} items, {human(size)} committed (thumbs + page only)")
    # 40MB used to be the warning line because the full frames lived here. Only
    # thumbs are committed now, so anything near 10MB means something is wrong.
    if size > 10 * 1024 * 1024:
        print("  heads up: over 10MB committed. Full frames should be on the release,")
        print("  not in the repo. Check that publish_release actually ran.")
    # Page is on disk and correct at this point, so an upload failure is
    # recoverable: fix whatever broke and re-upload the same staging folder.
    if a.no_upload:
        print(f"\n  --no-upload: {len(os.listdir(stage))} files left in {stage}")
    else:
        released = publish_release(slug, stage, f"{title} · {datelong}")
        print(f"  released {human(released)} to {MEDIA_REPO}")
        shutil.rmtree(stage, ignore_errors=True)

    print(f"\n  SEND THE CLIENT THIS LINK once pushed:")
    print(f"  https://0fftheprint.com/clients/{slug}/")
    if a.pin: print(f"  and the code, separately: {a.pin}")
    print("  git add clients && git commit -m 'delivery' && git push")
    print("  (commit message stays generic on purpose, no client names in git log)\n")


if __name__ == "__main__":
    main()
