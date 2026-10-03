#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""THE PARTY PACK MAKER (10/3). Every night is a full-art booster pack, and this draws it.

    /usr/bin/python3 makepack.py <slug>                  the night's pack, off its cover
    /usr/bin/python3 makepack.py <slug> --frames 17,33   pick the frames yourself (1 or 2, by number)
    /usr/bin/python3 makepack.py --all                   every night in events.json
    /usr/bin/python3 makepack.py --art art.png out.webp  wrap any tall picture (the house packs)

WHAT IT MAKES. events/<slug>/pack.webp, 520x878, the art only: the night's own photo printed edge
to edge on a foil pouch, crimped top and bottom, gloss on top. The title, the date and the count
are NOT in the picture. The page prints them over it (assets/css/pack.css, sealed.css), so a
title can change without redrawing anything.

WHICH PHOTO. The cover from events.json. A tall cover fills the whole pack. A wide cover would
lose half its people to the crop, so a wide night gets TWO frames, one over the other, and both
stay whole. Faces decide where the crop lands (YuNet, when the model is on this machine).
⛔ NEVER THE HIT. sealed.js hides exactly one frame per night as the chase; the same hash is
   computed here and that frame is never printed on the front.

NEW NIGHTS. newevent.py calls this at the end of a build, off the web-size frames still sitting in
its staging folder, so every new night ships with a pack and nobody has to draw one. Run it again
with --frames when the automatic pick is not the picture you want on the shelf.

⛔ /usr/bin/python3, same as newevent.py: it needs numpy and Pillow, and cv2 for the faces.
"""
import argparse, json, os, sys, tempfile, urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
KIT = os.path.join(ROOT, "assets", "cathedral", "pack")
W, H = 1040, 1756            # drawn at 2x
OUT_W, OUT_H = 520, 878      # what the pages expect (pack.css is built on this ratio)
SEAL = 0.062                 # the crimped band, top and bottom, as a share of the height
YUNET = [os.environ.get("OTP_YUNET") or "",
         os.path.expanduser("~/Desktop/Vamppsych/99_SYSTEM/_tools/yunet.onnx")]


# ---------- which frames ----------
def hit_index(slug, n):
    """sealed.js's hitIdx, bit for bit: FNV-1a, then the murmur3 finisher."""
    if n <= 1:
        return 0
    h = 2166136261
    for ch in slug + "|hit":
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    h ^= h >> 16; h = (h * 2246822507) & 0xFFFFFFFF
    h ^= h >> 13; h = (h * 3266489909) & 0xFFFFFFFF
    h ^= h >> 16
    return 1 + int((h / 4294967296) * (n - 1))


def night(slug):
    return json.load(open(os.path.join(EVENTS, slug, "data.json"), encoding="utf-8"))


def cover_index(slug, media):
    idx = json.load(open(os.path.join(EVENTS, "events.json"), encoding="utf-8"))
    row = next((e for e in idx.get("items", []) if e.get("slug") == slug), None)
    name = os.path.basename((row or {}).get("cover") or "")
    for i, m in enumerate(media):
        if os.path.basename(m.get("thumb", "")) == name:
            return i
    return 0


def pick_frames(slug, media):
    """[cover] for a tall cover, [cover, a second wide frame from the other half of the night] for a wide one."""
    n = len(media)
    hit = hit_index(slug, n)
    photo = lambda i: media[i].get("type", "photo") == "photo" and i != hit
    tall = lambda i: media[i].get("h", 0) > media[i].get("w", 0)
    c = cover_index(slug, media)
    if not photo(c):
        c = next((i for i in range(n) if photo(i)), 0)
    if tall(c):
        return [c]
    order = sorted((i for i in range(n) if photo(i) and i != c and not tall(i)),
                   key=lambda i: abs(((i - c) % n) - n // 2))
    return [c, order[0]] if order else [c]


def frame_file(slug, m, src_dir):
    """the best copy of a frame we can reach: staging, then the web-size file off the release, then the thumb"""
    stem = os.path.basename(m["thumb"]).replace("_t.jpg", "")
    if src_dir:
        p = os.path.join(src_dir, stem + ".jpg")
        if os.path.exists(p):
            return p
    cache = os.path.join(tempfile.gettempdir(), "otp_packsrc", slug)
    os.makedirs(cache, exist_ok=True)
    p = os.path.join(cache, stem + ".jpg")
    if os.path.exists(p) and os.path.getsize(p) > 20000:
        return p
    url = m.get("src") or ""
    if url.startswith("https://github.com/"):
        try:
            urllib.request.urlretrieve(url, p)
            if os.path.getsize(p) > 20000:
                return p
        except Exception as e:
            print(f"  could not fetch {stem} ({e}); using the thumbnail")
    return os.path.join(EVENTS, slug, m["thumb"])


# ---------- where the crop lands ----------
_det = None
def face_boxes(im):
    """[(cx, cy, w, h, score)] in 0..1, or [] when cv2 or the model is not here"""
    global _det
    try:
        import cv2
    except Exception:
        return []
    model = next((p for p in YUNET if p and os.path.exists(p)), None)
    if not model:
        return []
    small = im.copy(); small.thumbnail((960, 960))
    a = cv2.cvtColor(np.asarray(small.convert("RGB")), cv2.COLOR_RGB2BGR)
    if _det is None:
        _det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)
    _det.setInputSize((a.shape[1], a.shape[0]))
    _, f = _det.detect(a)
    out = []
    for r in (f if f is not None else []):
        x, y, w, h, s = float(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[14])
        out.append(((x + w / 2) / a.shape[1], (y + h / 2) / a.shape[0], w / a.shape[1], h / a.shape[0], s))
    return out


def cover_crop(im, w, h, focus=None, face_y=0.38):
    """scale to cover w x h, then slide the window to keep the most face in it"""
    sc = max(w / im.width, h / im.height)
    big = im.resize((max(w, round(im.width * sc)), max(h, round(im.height * sc))), Image.LANCZOS)
    fx, fy = 0.5, 0.42
    if focus:
        fx, fy = focus
    else:
        faces = face_boxes(im)
        if faces:
            if big.width > w:        # sliding sideways: take the window that holds the most face
                best, best_x = -1, 0.5
                for step in range(41):
                    x0 = (big.width - w) * step / 40
                    lo, hi = x0 / big.width, (x0 + w) / big.width
                    got = sum(fw * fh * s for cx, cy, fw, fh, s in faces if lo + fw * .3 <= cx <= hi - fw * .3)
                    mid = (lo + hi) / 2
                    cen = sum(cx * fw * fh for cx, cy, fw, fh, s in faces) / sum(fw * fh for _, _, fw, fh, _ in faces)
                    got -= abs(mid - cen) * 1e-4          # ties go to the middle of the faces
                    if got > best:
                        best, best_x = got, mid
                fx = best_x
            tot = sum(fw * fh * s for _, _, fw, fh, s in faces)
            fy = sum(cy * fw * fh * s for _, cy, fw, fh, s in faces) / tot
    x0 = min(max(0, round(fx * big.width - w / 2)), big.width - w)
    y0 = min(max(0, round(fy * big.height - h * face_y)), big.height - h)
    return big.crop((x0, y0, x0 + w, y0 + h))


# ---------- the picture ----------
def art_from(frames, focus=None):
    focus = focus or [None] * len(frames)
    if len(frames) == 1:
        return cover_crop(frames[0], W, H, focus[0], face_y=0.36)
    # two wide frames, one over the other, melted into each other across a soft seam
    # the seam sits high: the lower frame's faces have to clear the title the page prints on the bottom third
    seam, soft = int(H * 0.45), int(H * 0.05)
    top = cover_crop(frames[0], W, seam + soft, focus[0], face_y=0.52)
    bot = cover_crop(frames[1], W, H - seam + soft, focus[1], face_y=0.27)
    a = np.zeros((H, W, 3), np.float32)
    t = np.asarray(top, np.float32); b = np.asarray(bot, np.float32)
    a[:seam - soft] = t[:seam - soft]
    a[seam + soft:] = b[2 * soft:]
    ramp = np.linspace(0, 1, 2 * soft, dtype=np.float32)[:, None, None]
    ramp = ramp * ramp * (3 - 2 * ramp)
    a[seam - soft:seam + soft] = t[seam - soft:seam + soft] * (1 - ramp) + b[:2 * soft] * ramp
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")


def wrap(art, emblem=True):
    """any W x H picture onto the pouch: print treatment, room for the words, crimps, gloss"""
    a = np.asarray(art.convert("RGB").resize((W, H), Image.LANCZOS), np.float32) / 255
    # a little more ink than a photograph: packs are printed loud
    g = a.mean(axis=2, keepdims=True)
    a = np.clip(g + (a - g) * 1.16, 0, 1)
    a = np.clip((a - 0.5) * 1.07 + 0.5, 0, 1)
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    band = ((yy < SEAL) | (yy > 1 - SEAL)).astype(np.float32)
    # the crimped bands keep the picture's own colour, washed out and ridged like a heat seal.
    # Taken BEFORE the scrim, or the bottom seal goes black and the pack stops reading as a pack.
    # House pink over the top, so every pack on the shelf has the same candy crimp whatever the night looked like.
    tone = a.mean(axis=(0, 1), keepdims=True)
    pink = np.array([0.97, 0.56, 0.78], np.float32)
    seal = np.clip(a * 0.46 + tone * 0.10 + pink * 0.34 + 0.05, 0, 1)
    # room for the words the page prints on top: the title sits on the lower third
    low = np.clip((yy - 0.585) / 0.27, 0, 1) ** 1.3 * 0.8
    ink = np.array([0.045, 0.02, 0.05], np.float32)
    a = a * (1 - low) + ink * low
    # the pouch: where it is darker, where it shines, where it ends
    kit = np.asarray(Image.open(os.path.join(KIT, "pouch.png")).convert("RGBA").resize((W, H), Image.LANCZOS), np.float32) / 255
    mul, add, alpha = kit[..., 0:1], kit[..., 1:2], kit[..., 3]
    a = a * (0.30 + 0.70 * mul ** 1.5)
    # the crimped bands: fine vertical ridges, a shade lighter, one hard line where the seal ends
    xx = np.arange(W, dtype=np.float32)[None, :, None]
    ridge = 0.84 + 0.16 * np.cos(xx * (2 * np.pi / 9.0))
    a = a * (1 - band) + (seal * ridge * (0.30 + 0.70 * mul)) * band
    edge = np.exp(-((yy - SEAL) / 0.0022) ** 2) + np.exp(-((yy - (1 - SEAL)) / 0.0022) ** 2)
    a = a * (1 - 0.5 * np.clip(edge, 0, 1))
    # gloss: the pouch's own highlights, tinted by a holo sheet so the shine is colour, not grey
    holo = np.asarray(Image.open(os.path.join(KIT, "holo.jpg")).convert("RGB").resize((W, H), Image.LANCZOS), np.float32) / 255
    shine = np.clip(add * 0.34, 0, 1)
    a = 1 - (1 - a) * (1 - shine * (0.55 + 0.45 * holo))
    a = 1 - (1 - a) * (1 - holo * 0.045)
    out = np.dstack([np.clip(a, 0, 1), alpha])
    im = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
    if emblem:
        # the mark is stamped on the top seal, never on the picture: on a night's pack the top of the art is faces
        mk = Image.open(os.path.join(ROOT, "assets", "cathedral", "mark.webp")).convert("RGBA")
        mh = int(H * SEAL * 0.78); mk = mk.resize((round(mk.width * mh / mk.height), mh), Image.LANCZOS)
        im.alpha_composite(mk, ((W - mk.width) // 2, int(H * SEAL * 0.16)))
    return im.resize((OUT_W, OUT_H), Image.LANCZOS)


def save(im, path):
    im.save(path, "WEBP", quality=84, method=6)
    return os.path.getsize(path)


def build(slug, frames=None, src_dir=None, focus=None, out=None):
    d = night(slug); media = d["media"]
    if frames:
        want = {int(f) for f in frames}
        ix = [i for i, m in enumerate(media) if int(os.path.basename(m["thumb"]).split("_")[0]) in want]
        ix.sort(key=lambda i: frames.index(int(os.path.basename(media[i]["thumb"]).split("_")[0])))
    else:
        ix = pick_frames(slug, media)
    hit = hit_index(slug, len(media))
    if hit in ix:
        sys.exit(f"{slug}: frame {os.path.basename(media[hit]['thumb'])} is the night's hit, it cannot go on the pack")
    ims = [Image.open(frame_file(slug, media[i], src_dir)).convert("RGB") for i in ix[:2]]
    pack = wrap(art_from(ims, focus))
    out = out or os.path.join(EVENTS, slug, "pack.webp")
    kb = save(pack, out) // 1024
    names = ", ".join(os.path.basename(media[i]["thumb"]).split("_")[0] for i in ix[:2])
    print(f"  pack: {slug}  frames {names}  {kb} KB")
    return out


def main():
    ap = argparse.ArgumentParser(description="draw a night's party pack")
    ap.add_argument("slug", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--art", help="wrap this picture instead of a night's frames")
    ap.add_argument("--frames", help="frame numbers, e.g. 17 or 17,33")
    ap.add_argument("--src", help="folder holding NNN.jpg web-size frames (newevent.py's staging)")
    ap.add_argument("--focus", help="x,y per frame in 0..1, frames split by ';' (skips the face search)")
    ap.add_argument("--no-emblem", action="store_true")
    a = ap.parse_args()
    if a.art:
        dst = a.slug or a.out
        if not dst:
            sys.exit("--art needs an output file")
        art = Image.open(a.art).convert("RGB")
        fx, fy = (float(v) for v in a.focus.split(",")) if a.focus else (0.5, 0.40)
        pack = wrap(cover_crop(art, W, H, (fx, fy), face_y=0.40), emblem=not a.no_emblem)
        print(f"  pack: {dst}  {save(pack, dst) // 1024} KB")
        return
    frames = [int(x) for x in a.frames.split(",")] if a.frames else None
    focus = [tuple(float(v) for v in f.split(",")) if f.strip() else None for f in a.focus.split(";")] if a.focus else None
    if a.all:
        idx = json.load(open(os.path.join(EVENTS, "events.json"), encoding="utf-8"))
        for e in idx["items"]:
            build(e["slug"], src_dir=a.src)
        return
    if not a.slug:
        ap.error("give a night's slug, --all, or --art")
    build(a.slug, frames, a.src, focus, a.out)


if __name__ == "__main__":
    main()
