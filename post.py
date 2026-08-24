#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — post to THE TAKE timeline.

    /usr/bin/python3 post.py "we peaked at 2am again" --as vamppsych
    /usr/bin/python3 post.py "new one loading" --as kav-man --img ~/Desktop/shot.jpg
    /usr/bin/python3 post.py --list          # who can post
    /usr/bin/python3 post.py --pull 3        # delete post #3

--as takes any card holder's slug (vamppsych, kav-man, virgosgateway, wrathfol,
the-ink). The avatar, handle and seat come off their card automatically, so a
card art swap updates every post they've ever made.

POST IN THEIR ACTUAL WORDS. When a member texts you something, paste what they
said. Do not write posts for people.
"""
import argparse, json, os, re, shutil, subprocess, sys
from datetime import datetime

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("needs Pillow:  /usr/bin/python3 -m pip install --user Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
TAKE = os.path.join(ROOT, "content", "take.json")
UPLOADS = os.path.join(ROOT, "assets", "posts")


def slugify(s):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower()))


def card_holders():
    out = {}
    for fn in ("roster.json", "creators.json"):
        p = os.path.join(ROOT, "content", fn)
        if not os.path.exists(p):
            continue
        for c in json.load(open(p)).get("items", []):
            out[slugify(c["name"])] = c["name"]
    return out


def add_image(path):
    os.makedirs(UPLOADS, exist_ok=True)
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    im.thumbnail((1400, 1400), Image.LANCZOS)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    rel = f"assets/posts/{stamp}.jpg"
    im.save(os.path.join(ROOT, rel), quality=84, optimize=True)
    return rel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text", nargs="?", help="the post")
    ap.add_argument("--as", dest="author", help="card holder slug")
    ap.add_argument("--img", help="attach a photo")
    ap.add_argument("--alt", default="", help="alt text for the photo")
    ap.add_argument("--pin", action="store_true", help="pin to the top")
    ap.add_argument("--list", action="store_true", help="show who can post")
    ap.add_argument("--pull", type=int, help="delete a post by number")
    ap.add_argument("--push", action="store_true", help="commit and push after posting")
    a = ap.parse_args()

    holders = card_holders()
    if a.list:
        print("\ncard holders who can post:")
        for slug, name in holders.items():
            print(f"  --as {slug:16} {name}")
        print()
        return

    data = json.load(open(TAKE))
    items = data.get("items", [])

    if a.pull is not None:
        if not 0 <= a.pull < len(items):
            sys.exit(f"no post #{a.pull} (there are {len(items)})")
        gone = items.pop(a.pull)
        json.dump({"items": items}, open(TAKE, "w"), indent=2, ensure_ascii=False)
        print(f"pulled: {gone.get('text','')[:60]}")
        return

    if not a.text or not a.author:
        sys.exit('need text and --as. Try: post.py "something" --as vamppsych')

    slug = slugify(a.author)
    if slug not in holders:
        print(f"'{slug}' has no card. Card holders:")
        for s2, n in holders.items():
            print(f"  {s2}  ({n})")
        sys.exit(1)

    if "—" in a.text:
        print("note: em-dash replaced, it reads as AI in his voice")
        a.text = a.text.replace("—", ",")

    post = {"author": slug, "date": datetime.now().isoformat(timespec="seconds"),
            "text": a.text, "likes": 0}
    if a.pin:
        post["pinned"] = True
        for it in items:
            it.pop("pinned", None)
    if a.img:
        post["image"] = add_image(os.path.expanduser(a.img))
        post["image_alt"] = a.alt or ""
        print(f"  image -> {post['image']}")

    items.insert(0, post)
    items.sort(key=lambda p: (not p.get("pinned"), ), reverse=False)
    json.dump({"items": items}, open(TAKE, "w"), indent=2, ensure_ascii=False)
    print(f"\nposted as {holders[slug]}:\n  {a.text[:90]}\n")

    if a.push:
        subprocess.run(["git", "add", "-A", "."], cwd=ROOT)
        subprocess.run(["git", "commit", "-m", f"take: post from {holders[slug]}"], cwd=ROOT)
        subprocess.run(["git", "push"], cwd=ROOT)
        print("pushed. live in about a minute.")
    else:
        print("  git add -A && git commit -m 'take: new post' && git push")


if __name__ == "__main__":
    main()
