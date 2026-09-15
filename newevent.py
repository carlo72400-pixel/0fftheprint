#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — event photo dump builder.

Point it at a folder of photos (and optional videos), it builds a shareable
gallery page under events/<slug>/ and adds it to the events index.

    /usr/bin/python3 newevent.py "/path/to/shoot" \
        --venue "Paper Tiger" --title "Blade Rave" --date 2026-08-14 \
        --limit 60

    # include short clips too (compressed to 720p)
    /usr/bin/python3 newevent.py "/path/to/shoot" --venue "The Mix" \
        --date 2026-08-16 --videos "/path/to/clips" --limit 50

Then: git add . && git commit && git push.

WHERE THE MEDIA LIVES (changed 2026-08-20):

Only the small grid THUMBS get committed to the site repo, about 1.4MB an
event. The full quality frames go up as RELEASE ASSETS on a separate repo
(0tp-media) and the gallery points at those URLs.

⛔ VIDEO IS THE EXCEPTION AND IT IS NOT OPTIONAL. GitHub serves every release
asset as content-type: application/octet-stream with content-disposition:
attachment, whatever the file is, and iOS Safari refuses to play a source typed
and dispositioned like that. An <img> sniffs and does not care, which is why
photos were always fine and this hid for months. So the PLAYABLE clip is
committed into 0tp-media under video/<slug>/ and served by that repo's Pages
site, which types by extension. The full quality original still rides on the
release, where "attachment" is exactly what a download wants.

GitHub release assets have no total size limit and no bandwidth limit, and the
per-file ceiling is 2GiB instead of 100MB. That is what killed the old
compress-until-it-fits rules: the lightbox went from 1600px to 2560px, video
went from 720p CRF30 to 1080p CRF20, and the rule that DELETED any clip over
90MB is gone. Committed cost per event dropped from ~15MB to ~1.6MB.

Verified before building on it: GitHub serves these assets as
application/octet-stream with content-disposition attachment and nosniff, which
looks like it should break an <img>. It does not. Cross-origin <img>, <video>
and <a href> all work, and range requests return 206 so video scrubbing works.
What does NOT work is fetch(), because there is no CORS header. This gallery
never fetches media, it puts the URL straight into src/href, which is why this
is safe here and would not be safe somewhere else.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile
import numpy as np
from datetime import datetime

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".heic", ".HEIC", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".MP4", ".MOV"}

# ⛔ ONE PAGES SITE IS CAPPED AT 1 GB, and 0tp-media's video/ tree sat at 721 MiB
#    after Brainrot. So the media repo is a SHARD, picked per dump:
#      OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2 /usr/bin/python3 newevent.py ...
#    Each shard has Pages on (typed video/mp4) and its own 1 GB. Releases have no
#    size limit, so photos could go anywhere, but keeping a dump's photos and
#    clips on the same shard is the only way to reason about where a night is.
#    Shards so far: 0tp-media (Aug 14 to Sep 11), 0tp-media-2 (Sep 1, Sep 12),
#    0tp-media-3 (Sep 13). data.json carries the absolute URLs, so an old
#    gallery never notices a new shard.
MEDIA_REPO = os.environ.get("OTP_MEDIA_REPO", "carlo72400-pixel/0tp-media")
REL_BASE   = f"https://github.com/{MEDIA_REPO}/releases/download"
# ⛔ VIDEO CANNOT PLAY FROM A RELEASE ASSET. GitHub serves every one of them as
#    content-type: application/octet-stream + content-disposition: attachment,
#    whatever the file is, and iOS Safari refuses to play a source typed and
#    dispositioned like that. An <img> sniffs and does not care, which is why
#    photos were always fine and this hid for months. There is no per-asset
#    content-type control, so the PLAYABLE clip is committed to the media repo
#    and served by its Pages site, which types by extension. The full quality
#    original still rides on the release, where "attachment" is what you want.
VID_BASE   = f"https://carlo72400-pixel.github.io/{MEDIA_REPO.split('/')[-1]}/video"

THUMB_W, THUMB_Q = 520, 72          # grid tile, the ONLY thing committed
LIGHT_W, LIGHT_Q = 2560, 90         # lightbox view, on the release
NATIVE_Q         = 92               # full native export, on the release
# The web clip now lives in a REPO, which caps files at 100MB, and it is watched
# on a phone in a lightbox. 1080/crf20 produced 100 to 160MB clips; this is a
# tenth of that and indistinguishable at that size.
VIDEO_H, VIDEO_CRF = 720, 26        # web clip, committed to the media repo
VIDEO_MAXRATE      = "1600k"


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

        # THE UNTOUCHED ORIGINAL FILE, byte for byte, EXIF and all. It used to
        # be a quality-92 re-export at native size, which is a good print file
        # but not the original. copy2 keeps bytes and timestamps. A HEIC
        # original will not display in most browsers, but the full-res button
        # is a download, not a viewer, so that is fine.
        ext = os.path.splitext(fn)[1].lower() or ".jpg"
        fullname = f"{stem}_full{ext}"
        shutil.copy2(os.path.join(src, fn), os.path.join(stage_dir, fullname))

        # the only thing that gets committed
        th = im.copy()
        th.thumbnail((THUMB_W, THUMB_W), Image.LANCZOS)
        th.save(os.path.join(out_dir, f"{stem}_t.jpg"), quality=THUMB_Q, optimize=True)

        items.append({"type": "photo",
                      "src":   f"{REL_BASE}/{tag}/{stem}.jpg",
                      "full":  f"{REL_BASE}/{tag}/{fullname}",
                      "thumb": f"media/{stem}_t.jpg",
                      "w": light.width, "h": light.height})
        print(f"  [{i}/{len(chosen)}] {fn}", end="\r")
    print(f"  {len(items)} photos" + " " * 40)
    return items


def probe_dims(path):
    """(width, height) of the first video stream, or (None, None).

    ⛔ ffprobe csv over multiple streams prints a line per stream and the audio
    line has no dims, so pin it to v:0 and read exactly one line."""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height",
                        "-of", "csv=p=0:s=x", path], capture_output=True, text=True)
    line = (r.stdout or "").strip().splitlines()
    if not line:
        return None, None
    try:
        w, h = line[0].split("x")[:2]
        return int(w), int(h)
    except ValueError:
        return None, None


def build_videos(src, out_dir, stage_dir, tag, limit, vid_dir=None, want_full=True):
    """Web clip -> vid_dir (committed to the media repo, served by its Pages).
    Full quality original -> stage_dir (released). Poster -> out_dir (site repo).

    ⛔ The web clip and the original go to DIFFERENT hosts on purpose. See the
    VID_BASE note at the top: a release asset cannot be played by a <video>."""
    vid_dir = vid_dir or stage_dir
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
        os.makedirs(vid_dir, exist_ok=True)
        outv = os.path.join(vid_dir, f"{stem}.mp4")
        # ⛔ SCALE THE SHORT EDGE, NOT THE HEIGHT. "scale=-2:720" is correct for a
        #    landscape clip and wrong for a vertical one: a 1728x3072 phone clip
        #    comes out 404x720, a third of the pixels it should have. The Ink cuts
        #    established 720x1280 as the vertical web size and this matches it.
        encode_web(os.path.join(src, fn), outv)
        if not os.path.exists(outv):
            print(f"  video failed: {fn}")
            continue
        size = os.path.getsize(outv)
        # ⛔ The web clip is COMMITTED now, so GitHub's hard 100MB per-file limit
        # is back in play for this file (the original still goes to the release
        # and still gets 2GiB). At 720p/crf26 a five minute clip lands near
        # 60MB, so this only ever trips on something very long.
        if size > 95 * 1024 * 1024:
            print(f"  {fn} web clip is {human(size)}, over the 95MB repo limit, left out")
            os.remove(outv)
            continue
        # the untouched original rides along, same as photos. 1080p copy stays
        # for instant playback; the original is the real file. 2GiB ceiling.
        full_url = None
        srcsize = os.path.getsize(os.path.join(src, fn))
        if not want_full:
            # --no-video-full. A 4K HEVC master runs about a gigabyte a clip, so a
            # night of them is several hours of upload and twice that in staging
            # disk, to serve a download almost nobody takes off a phone gallery.
            # The 720p clip still PLAYS and the photos still keep their originals.
            print(f"  {fn} original held back (--no-video-full, {human(srcsize)})")
        elif srcsize <= 2 * 1024 * 1024 * 1024:
            oext = os.path.splitext(fn)[1].lower() or ".mp4"
            ofullname = f"{stem}_full{oext}"
            shutil.copy2(os.path.join(src, fn), os.path.join(stage_dir, ofullname))
            full_url = f"{REL_BASE}/{tag}/{ofullname}"
        else:
            print(f"  {fn} original is {human(srcsize)}, over 2GiB; 1080p only")

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
                      # served by the media repo's Pages site so it is typed
                      # video/mp4 and will actually play on a phone
                      "src":   f"{VID_BASE}/{tag}/{stem}.mp4",
                      **({"full": full_url} if full_url else {}),
                      "thumb": f"media/{stem}_t.jpg",
                      "w": pw, "h": ph})
        print(f"  [{i}/{len(chosen)}] {fn} -> {human(size)}")
    return items


def encode_web(src, outv):
    """The one web encode: 720 on the SHORT edge, x264 crf 26 capped at 1.6 Mbps.

    ⛔ SCALE THE SHORT EDGE, NOT THE HEIGHT. "scale=-2:720" is correct for a
       landscape clip and wrong for a vertical one: a 1728x3072 phone clip comes
       out 404x720, a third of the pixels it should have. The Ink cuts
       established 720x1280 as the vertical web size and this matches it.
    ★ Hardware decode (videotoolbox) first: a 4K HEVC master decodes in software
      at about real time, with the GPU it runs ~3.5x. Falls back to software
      if the box refuses, so a rebuild on another Mac still works."""
    vw, vh = probe_dims(src)
    scale = f"scale={VIDEO_H}:-2" if (vw and vh and vh > vw) else f"scale=-2:{VIDEO_H}"
    tail = ["-vf", scale, "-c:v", "libx264", "-crf", str(VIDEO_CRF),
            "-maxrate", VIDEO_MAXRATE, "-bufsize", "3200k", "-pix_fmt", "yuv420p",
            "-preset", "slow", "-c:a", "aac", "-b:a", "128k",
            # faststart puts the index at the front so it plays before it finishes
            # downloading. On a release asset that is the difference between
            # "instant" and "stares at a black box".
            "-movflags", "+faststart", outv]
    for pre in (["-hwaccel", "videotoolbox"], []):
        r = subprocess.run(["ffmpeg", "-y"] + pre + ["-i", src] + tail, capture_output=True)
        if r.returncode == 0 and os.path.exists(outv) and os.path.getsize(outv) > 0:
            return True
        if os.path.exists(outv):
            os.remove(outv)
    return False


def file_index(folder, exts):
    """stem -> path for every file under a look folder, HORIZONTAL/VERTICAL and all."""
    idx = {}
    for dp, _, fs in os.walk(folder):
        for f in fs:
            if f.startswith(".") or os.path.splitext(f)[1] not in exts:
                continue
            idx[os.path.splitext(f)[0]] = os.path.join(dp, f)
    return idx


def parse_looks(specs):
    """'NAME=/path' list -> [(NAME, path)], primary first. Order is the chip order."""
    out = []
    for s in specs or []:
        if "=" not in s:
            sys.exit(f"--look wants NAME=/path, got {s!r}")
        name, path = s.split("=", 1)
        if not os.path.isdir(path):
            sys.exit(f"look folder not found: {path}")
        out.append((name.strip(), path))
    return out


def build_photos_looks(looks, order, out_dir, stage_dir, tag, rotate=True):
    """The multi-look dump (Sept 2026 on). Same frames, several grades.

    looks:  [(name, folder)], the first is the primary. Every look's version of
            every frame goes on the release; the LIGHTBOX carries a chip per look.
    order:  the stems in gallery order, from curate.py, so the burst/hero problem
            never reaches this script.
    rotate: tile i LEADS with look i mod n, so the grid itself shows every grade
            instead of hiding four of five behind a tap. Off = every tile leads
            with the primary.

    Release names: primary keeps `NNN.jpg` / `NNN_full.jpg` (og_source and every
    older verify script look for that), the others are `NNN_<look-slug>.jpg`."""
    idx = [(name, file_index(folder, PHOTO_EXT)) for name, folder in looks]
    missing = [s for s in order if s not in idx[0][1]]
    if missing:
        sys.exit(f"{len(missing)} ordered stems missing from the primary look: {missing[:5]}")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(stage_dir, exist_ok=True)
    items = []
    for i, stem in enumerate(order, 1):
        n = f"{i:03d}"
        lead_name = idx[(i - 1) % len(idx) if rotate else 0][0]
        variants, paths = [], {}
        for k, (name, ix) in enumerate(idx):
            p = ix.get(stem)
            if not p:
                print(f"  {stem}: no {name} version, that chip is skipped")
                continue
            im = load_image(p)
            light = im.copy()
            light.thumbnail((LIGHT_W, LIGHT_W), Image.LANCZOS)
            suffix = "" if k == 0 else "_" + slugify(name)
            light.save(os.path.join(stage_dir, f"{n}{suffix}.jpg"), quality=LIGHT_Q, optimize=True)
            ext = os.path.splitext(p)[1].lower() or ".jpg"
            fullname = f"{n}{suffix}_full{ext}"
            shutil.copy2(p, os.path.join(stage_dir, fullname))
            variants.append({"name": name, "src": f"{REL_BASE}/{tag}/{n}{suffix}.jpg",
                             "full": f"{REL_BASE}/{tag}/{fullname}"})
            paths[name] = (p, light.width, light.height)
        lead = next((v for v in variants if v["name"] == lead_name), variants[0])
        p, w, h = paths[lead["name"]]
        th = load_image(p)
        th.thumbnail((THUMB_W, THUMB_W), Image.LANCZOS)
        th.save(os.path.join(out_dir, f"{n}_t.jpg"), quality=THUMB_Q, optimize=True)
        item = {"type": "photo", "src": lead["src"], "full": lead["full"],
                "thumb": f"media/{n}_t.jpg", "w": w, "h": h}
        if len(idx) > 1:
            item["look"] = lead["name"]
            item["looks"] = variants
        items.append(item)
        print(f"  [{i}/{len(order)}] {stem} x{len(variants)}", end="\r")
    print(f"  {len(items)} photos in {len(idx)} look(s)" + " " * 30)
    return items


def build_videos_looks(vlooks, order, out_dir, stage_dir, tag, vid_dir, rotate=True):
    """Clips in several grades. Web clip per look -> vid_dir (committed to the
    shard, served by its Pages); poster off the lead look -> out_dir (site repo).
    Originals are NOT staged here: a 4K HEVC master is a gigabyte a clip and
    the photos keep theirs, which is what the download button is for."""
    if not shutil.which("ffmpeg"):
        print("  ffmpeg not found, skipping videos")
        return []
    idx = [(name, file_index(folder, VIDEO_EXT)) for name, folder in vlooks]
    os.makedirs(vid_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    items = []
    for i, stem in enumerate(order, 1):
        vs = f"v{i:02d}"
        lead_name = idx[(i - 1) % len(idx) if rotate else 0][0]
        variants = []
        for k, (name, ix) in enumerate(idx):
            p = ix.get(stem)
            if not p:
                print(f"  {stem}: no {name} version, that chip is skipped")
                continue
            suffix = "" if k == 0 else "_" + slugify(name)
            outv = os.path.join(vid_dir, f"{vs}{suffix}.mp4")
            if not (os.path.exists(outv) and os.path.getsize(outv) > 0):   # resumable
                if not encode_web(p, outv):
                    print(f"  video failed: {p}")
                    continue
            size = os.path.getsize(outv)
            if size > 95 * 1024 * 1024:
                print(f"  {stem} {name} web clip is {human(size)}, over the 95MB repo limit, left out")
                os.remove(outv)
                continue
            variants.append({"name": name, "src": f"{VID_BASE}/{tag}/{vs}{suffix}.mp4",
                             "_file": outv})
            print(f"  [{i}/{len(order)}] {stem} {name} -> {human(size)}")
        if not variants:
            continue
        lead = next((v for v in variants if v["name"] == lead_name), variants[0])
        poster = os.path.join(out_dir, f"{vs}_t.jpg")
        subprocess.run(["ffmpeg", "-y", "-i", lead["_file"], "-vf",
                        f"thumbnail,scale={THUMB_W}:-2", "-frames:v", "1", poster],
                       capture_output=True)
        pw = ph = None
        try:
            with Image.open(poster) as pim:
                pw, ph = pim.size
        except Exception:
            pass
        for v in variants:
            v.pop("_file", None)
        item = {"type": "video", "src": lead["src"], "thumb": f"media/{vs}_t.jpg",
                "w": pw, "h": ph}
        if len(idx) > 1:
            item["look"] = lead["name"]
            item["looks"] = variants
        items.append(item)
    return items


def publish_video(tag, vid_dir):
    """Commit the web clips into the media repo under video/<tag>/ and push.

    They cannot go on the release: GitHub types every release asset
    application/octet-stream and marks it an attachment, which iOS Safari will
    not play. The media repo has Pages on, and Pages types by extension."""
    clips = sorted(f for f in os.listdir(vid_dir) if f.endswith(".mp4")) \
        if os.path.isdir(vid_dir) else []
    if not clips:
        return 0
    if not shutil.which("gh"):
        sys.exit("needs the GitHub CLI: brew install gh")
    total = sum(os.path.getsize(os.path.join(vid_dir, f)) for f in clips)
    print(f"  pushing {len(clips)} clip(s) ({human(total)}) to {MEDIA_REPO} video/{tag}/")
    work = tempfile.mkdtemp(prefix="0tp-media-")
    try:
        r = subprocess.run(["gh", "repo", "clone", MEDIA_REPO, work, "--", "--depth", "1"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"  media repo clone failed: {r.stderr.strip()}")
        dest = os.path.join(work, "video", tag)
        # Replace rather than merge, so a rebuild never leaves a stale clip.
        shutil.rmtree(dest, ignore_errors=True)
        os.makedirs(dest, exist_ok=True)
        for f in clips:
            shutil.copy2(os.path.join(vid_dir, f), os.path.join(dest, f))
        subprocess.run(["git", "-C", work, "add", "-A"], capture_output=True)
        c = subprocess.run(["git", "-C", work, "commit", "-m",
                            f"video: {tag} ({len(clips)} clips, {human(total)})"],
                           capture_output=True, text=True)
        if c.returncode != 0 and "nothing to commit" not in (c.stdout + c.stderr):
            sys.exit(f"  media commit failed: {c.stderr.strip()}")
        pu = subprocess.run(["git", "-C", work, "push", "origin", "HEAD"],
                            capture_output=True, text=True)
        if pu.returncode != 0:
            sys.exit(f"  media push failed: {pu.stderr.strip()}")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print(f"    {len(clips)} clip(s) live at {VID_BASE}/{tag}/")
    return total


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
<title>__TITLE__ · __VENUE__ · 0FF THE PRINT</title>
<meta name="description" content="__COUNT__ frames from __TITLE__ at __VENUE__, __DATELONG__. Shot by 0FF THE PRINT.">
<meta name="theme-color" content="#0a0a0d">
<meta property="og:type" content="website">
<meta property="og:title" content="__TITLE__ · __VENUE__">
<meta property="og:description" content="__COUNT__ frames, __DATELONG__. Shot by 0FF THE PRINT.">
<meta property="og:image" content="https://0fftheprint.com/events/__SLUG__/preview.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://0fftheprint.com/events/__SLUG__/preview.jpg">
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/css/sealed.css">
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
/* multi-look dumps: the tile says which grade it leads with, the lightbox switches */
.tile .lk{position:absolute;left:8px;bottom:8px;font-family:var(--f-mono);font-size:9px;
letter-spacing:.18em;text-transform:uppercase;color:var(--pink);background:rgba(10,10,13,.74);
border:1px solid rgba(255,121,198,.35);border-radius:999px;padding:4px 7px;pointer-events:none}
.looks{font-family:var(--f-mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;
color:var(--muted);margin-top:8px;line-height:1.9}
.looks b{color:var(--pink);font-weight:500}
.looks span{color:var(--ink)}
.lb-looks{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);display:flex;gap:6px;
flex-wrap:wrap;justify-content:center;max-width:92vw;z-index:11}
.lb-looks button{font-family:var(--f-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;
color:var(--pink);background:rgba(10,10,13,.8);border:1px solid rgba(255,121,198,.45);border-radius:999px;
padding:7px 11px;cursor:pointer}
.lb-looks button.on{background:var(--pink);color:#0a0a0d;border-color:var(--pink)}
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
  <a class="back" href="../">&larr; All events</a>
  <h1>__TITLE__</h1>
  <div class="meta"><b>__VENUE__</b> &nbsp;·&nbsp; __DATELONG__ &nbsp;·&nbsp; __COUNT__ frames</div>
__LOOKSLINE__
  <div class="grid" id="grid"></div>
  <div class="foot">Shot by 0FF THE PRINT &nbsp;·&nbsp;
    <a href="https://instagram.com/vamppsych" target="_blank" rel="noopener">@vamppsych</a>
    &nbsp;·&nbsp; Tagged in one of these? DM for the full-res file.<br>
    Want your own night shot? DM, or <a href="mailto:offtheprintcollective@gmail.com">offtheprintcollective@gmail.com</a>.</div>
</div>
<div class="lb" id="lb">
  <button class="lb-x" id="lbx" aria-label="Close">&times;</button>
  <button class="lb-p" id="lbp" aria-label="Previous">&#8249;</button>
  <button class="lb-n" id="lbn" aria-label="Next">&#8250;</button>
  <div id="lbstage"></div>
  <div class="lb-looks" id="lblooks" hidden></div>
  <div class="lb-count" id="lbc"></div>
  <a class="lb-dl" id="lbdl" href="#" target="_blank" rel="noopener">full res &darr;</a>
</div>
<script>
const MEDIA = __MEDIA__;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const grid = document.getElementById('grid');
grid.innerHTML = MEDIA.map((m,i) =>
  `<a class="tile${m.type==='video'?' vid':''}" data-i="${i}" href="${m.src}">
     <img src="${m.thumb}" alt="Frame ${i+1}" loading="lazy" decoding="async"
          width="${m.w||16}" height="${m.h||9}">${m.look?`<span class="lk">${esc(m.look)}</span>`:''}
   </a>`).join('');
const lb=document.getElementById('lb'), stage=document.getElementById('lbstage'), count=document.getElementById('lbc');
const chips=document.getElementById('lblooks');
let cur=0, pref=null;   // pref = the grade the viewer last tapped; it sticks across frames
function variant(m){
  if(!m.looks||!m.looks.length) return {name:m.look||'',src:m.src,full:m.full};
  return (pref && m.looks.find(v=>v.name===pref)) || m.looks.find(v=>v.name===m.look) || m.looks[0];
}
function show(i){
  cur=(i+MEDIA.length)%MEDIA.length;
  const m=MEDIA[cur], v=variant(m);
  stage.innerHTML = m.type==='video'
    ? `<video src="${v.src}" controls autoplay playsinline></video>`
    : `<img src="${v.src}" alt="Frame ${cur+1}">`;
  // The native export sits on the same release. download attr is ignored
  // cross-origin, but GitHub already sends content-disposition: attachment,
  // so it saves rather than navigating anyway.
  const dl=document.getElementById('lbdl');
  if(v.full){dl.href=v.full;dl.style.display='';}else{dl.style.display='none';}
  const multi = m.looks && m.looks.length>1;
  if(multi){
    chips.innerHTML = m.looks.map(x=>`<button type="button"${x.name===v.name?' class="on"':''} data-look="${esc(x.name)}">${esc(x.name)}</button>`).join('');
    chips.hidden=false;
  } else { chips.hidden=true; chips.innerHTML=''; }
  count.textContent=`${cur+1} / ${MEDIA.length}` + (multi ? ` · ${v.name}` : '');
  lb.classList.add('open'); document.body.style.overflow='hidden';
}
chips.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;pref=b.dataset.look;show(cur);});
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
/* LAST NIGHT, SEALED reads the night through this and nothing else. It is a
   separate deferred file, so this inline script has already run by the time it
   looks. If it never loads, the grid above is the page and always was. */
window.OTPNight = Object.assign({media:MEDIA, show:show}, __NIGHT__);
</script>
<script src="../../assets/js/sealed.js" defer></script>
</body>
</html>
"""


def looks_line(names):
    """The line under the meta on a multi-look dump. Empty string otherwise, so a
    single-look page renders byte-for-byte as before."""
    if not names or len(names) < 2:
        return ""
    import html as _h
    inner = " &nbsp;·&nbsp; ".join(f"<span>{_h.escape(n)}</span>" for n in names)
    return (f'  <div class="looks"><b>{len(names)} looks</b> &nbsp;·&nbsp; {inner}'
            f' &nbsp;·&nbsp; open a frame and switch</div>')


def og_source(stage, override=None):
    """The frame the share card is built from: the first LANDSCAPE one.

    ⛔ A portrait frame centre cropped to 1200x630 loses the face, and the share
    card is the single most seen image of a dump."""
    if override:
        return override if os.path.exists(override) else None
    frames = sorted(f for f in os.listdir(stage)
                    if re.fullmatch(r"\d+\.jpg", f)) if os.path.isdir(stage) else []
    for f in frames:
        p = os.path.join(stage, f)
        try:
            with Image.open(p) as im:
                if im.width >= im.height:
                    return p
        except Exception:
            continue
    return os.path.join(stage, frames[0]) if frames else None


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
    ap.add_argument("source", nargs="?", help="folder of photos (omit when using --look)")
    ap.add_argument("--look", action="append", default=[],
                    help="NAME=/folder, repeatable; first is the primary grade. "
                         "Every frame in --order is staged in every look")
    ap.add_argument("--order", help="json {\"order\":[stems]} in gallery order (curate.py)")
    ap.add_argument("--video-look", action="append", default=[], dest="video_look",
                    help="NAME=/folder of graded clips, repeatable, same rules as --look")
    ap.add_argument("--video-order", dest="video_order",
                    help="json {\"order\":[clip stems]} or a comma list of stems")
    ap.add_argument("--no-rotate", action="store_true", dest="no_rotate",
                    help="every tile leads with the primary look (default rotates)")
    ap.add_argument("--venue", required=True)
    ap.add_argument("--title", help="event name (defaults to the venue)")
    ap.add_argument("--date", required=True, help="YYYY-MM-DD")
    ap.add_argument("--videos", help="folder of clips (optional)")
    ap.add_argument("--limit", type=int, default=60, help="max photos (0 = all)")
    ap.add_argument("--pick", choices=["best", "even"], default="best",
                    help="best = score and keep the keepers (default); even = sample across the shoot")
    ap.add_argument("--video-limit", type=int, default=6)
    ap.add_argument("--no-video-full", action="store_true",
                    help="skip the full quality video originals on the release "
                         "(the playable 720p clip still goes up; photos unaffected)")
    ap.add_argument("--slug", help="override the url slug")
    ap.add_argument("--og", help="explicit image for the share card "
                                 "(default: the first horizontal frame)")
    ap.add_argument("--no-upload", action="store_true",
                    help="build everything but skip the release upload (dry run)")
    a = ap.parse_args()

    title = a.title or a.venue
    dt = datetime.strptime(a.date, "%Y-%m-%d")
    datelong = dt.strftime("%b %-d, %Y")
    dateshort = dt.strftime("%m.%d.%y")
    slug = a.slug or f"{a.date}-{slugify(title)}"
    out = os.path.join(EVENTS, slug)
    media_dir = os.path.join(out, "media")
    os.makedirs(media_dir, exist_ok=True)
    # Staging sits OUTSIDE the repo on purpose. Nothing in here is ever committed;
    # it exists only to be uploaded to the release and then thrown away.
    stage = os.path.join(tempfile.gettempdir(), f"otp-stage-{slug}")
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage, exist_ok=True)

    print(f"\nBuilding {slug}  (media shard {MEDIA_REPO})")
    looks = parse_looks(a.look)
    look_names = [n for n, _ in looks]
    if looks:
        if not a.order:
            sys.exit("--look needs --order (run curate.py first; the scorer keeps bursts)")
        order = json.load(open(a.order))["order"]
        items = build_photos_looks(looks, order, media_dir, stage, slug, rotate=not a.no_rotate)
    elif a.source:
        items = build_photos(a.source, media_dir, stage, slug, a.limit, a.pick)
    else:
        sys.exit("give a photo folder, or --look NAME=/folder with --order")
    vidstage = None
    vlooks = parse_looks(a.video_look)
    if vlooks:
        if not a.video_order:
            sys.exit("--video-look needs --video-order")
        vo = a.video_order
        vorder = json.load(open(vo))["order"] if vo.endswith(".json") else \
            [s.strip() for s in vo.split(",") if s.strip()]
        vidstage = os.path.join(os.path.dirname(stage), "_video_" + slug)
        items += build_videos_looks(vlooks, vorder, media_dir, stage, slug, vidstage,
                                    rotate=not a.no_rotate)
    elif a.videos:
        vidstage = os.path.join(os.path.dirname(stage), "_video_" + slug)
        items += build_videos(a.videos, media_dir, stage, slug, a.video_limit,
                              vid_dir=vidstage, want_full=not a.no_video_full)

    # OG card off a LIGHTBOX frame, which lives in staging now.
    # ⛔ IT MUST BE A HORIZONTAL FRAME. The card is 1200x630 and make_og centre
    #    crops to fill, so a portrait frame gets cut to a torso with the face
    #    outside the crop, and that torso is what every DM and link preview
    #    shows. Take the first landscape frame in shoot order; fall back to 001
    #    only if the night is entirely vertical.
    first = og_source(stage, a.og)
    if first:
        print(f"  og card from {os.path.basename(first)}")
        make_og(first, os.path.join(out, "preview.jpg"), title, a.venue, datelong)

    # NOTE: the upload happens at the END, after the page and data.json are
    # written. It used to run here, and when a release failed the whole run died
    # before writing anything, so an event that had already spent ten minutes
    # encoding video came out with no video in it.

    # ⛔ json.dumps, not raw substitution: a venue with an apostrophe in it
    # ("Papa's") would otherwise close the JS string and break the whole page.
    all_looks = look_names or []
    for n in [n for n, _ in vlooks]:
        if n not in all_looks:
            all_looks.append(n)
    night = json.dumps({"slug": slug, "title": title,
                        "venue": a.venue, "dateShort": dateshort, "looks": all_looks})
    page = (PAGE.replace("__NIGHT__", night)
                .replace("__MEDIA__", json.dumps(items))
                .replace("__LOOKSLINE__", looks_line(all_looks))
                .replace("__TITLE__", title)
                .replace("__VENUE__", a.venue)
                .replace("__DATELONG__", datelong)
                .replace("__COUNT__", str(len(items)))
                .replace("__SLUG__", slug))
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(page)
    json.dump({"slug": slug, "title": title, "venue": a.venue, "date": a.date,
               "date_short": dateshort, "count": len(items), "looks": all_looks,
               "media": items},
              open(os.path.join(out, "data.json"), "w"), indent=2)

    # update the index
    idx_path = os.path.join(EVENTS, "events.json")
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {"items": []}
    idx["items"] = [e for e in idx["items"] if e["slug"] != slug]
    idx["items"].append({"slug": slug, "title": title, "venue": a.venue,
                         "date": a.date, "date_short": dateshort,
                         "count": len(items), "cover": f"{slug}/media/001_t.jpg"})
    idx["items"].sort(key=lambda e: e["date"], reverse=True)
    json.dump(idx, open(idx_path, "w"), indent=2, ensure_ascii=False)

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
    vidstage = locals().get("vidstage")
    if a.no_upload:
        print(f"\n  --no-upload: {len(os.listdir(stage))} files left in {stage}")
        if vidstage and os.path.isdir(vidstage):
            print(f"  --no-upload: web clips left in {vidstage}")
    else:
        released = publish_release(slug, stage, f"{title} · {datelong}")
        print(f"  released {human(released)} to {MEDIA_REPO}")
        shutil.rmtree(stage, ignore_errors=True)
        # ⛔ Separate host, separate step. The clips are COMMITTED to the media
        # repo and served by its Pages site, because a release asset is typed
        # octet-stream + attachment and iOS will not play it.
        if vidstage and os.path.isdir(vidstage):
            pushed = publish_video(slug, vidstage)
            if pushed:
                print(f"  pushed {human(pushed)} of video to {MEDIA_REPO}")
            shutil.rmtree(vidstage, ignore_errors=True)

    print(f"\n  live at /0fftheprint/events/{slug}/ once pushed")
    print("  git add -A && git commit -m 'event: " + slug + "' && git push\n")


if __name__ == "__main__":
    main()
