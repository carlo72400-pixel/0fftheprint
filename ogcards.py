#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0FF THE PRINT — one OG card per member, into assets/og/<slug>.jpg.

    /usr/bin/python3 ogcards.py            # every holder
    /usr/bin/python3 ogcards.py sinik      # just one

WHY THIS EXISTS. /my/ tells a member to put /c/<slug>/ in their bio, and
cardback.js puts the link row above the badges for that reason. Every one of
those pastes was unfurling as assets/preview.jpg, the HOUSE's stock card,
because bake.py read cards.card_photo and that column is null for all nine
holders. The house already wrote them: roster.json carries real card art, a
seat label and a flavour line for every single one.

⛔ DO NOT "SIMPLIFY" THIS BY POINTING og:image AT THE CARD ART DIRECTLY. The art
   is 5:7 portrait, unfurlers crop to about 1.91:1, and the crop takes a band
   out of the middle: no name, no seat, half a face. This renders 1200x630 so
   the crop is the identity crop.

⛔ THE MATCH IS tight(), NOT A STRAIGHT JOIN. roster.json says 'The Ink',
   'HAZE DT', 'KAV-MAN', 'WUN MOR' against slugs theink, haze-dt, kav-man,
   wunmor. Same normaliser as cardback.js:646. A plain == leaves five of nine
   on the stock card, silently.

⛔ THE NAME ON THE CARD IS THE DB display_name, NOT THE ROSTER NAME. theink's
   roster entry says 'The Ink' but he goes by SMILEY on his page, and the OG
   card has to agree with the <title> bake.py writes two lines away.
"""
import base64, json, os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT_DIR = os.path.join(HERE, "assets", "og")
TPL = os.path.join(HERE, "og_card_src.html")

cfg = open(os.path.join(HERE, "supabase-config.js")).read()
URL = re.search(r'url:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'anonKey:\s*"([^"]+)"', cfg).group(1)


def tight(v):
    return re.sub(r"[^a-z0-9]", "", str(v or "").lower())


def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def house_people():
    """roster.json first, creators.json under it, same order cardback.js uses."""
    out = []
    for fn in ("creators.json", "roster.json"):
        p = os.path.join(HERE, "content", fn)
        if not os.path.exists(p):
            continue
        try:
            out += json.load(open(p)).get("items") or []
        except Exception as e:
            print(f"  ({fn} unreadable: {e})")
    return out


def holders():
    req = urllib.request.Request(
        f"{URL}/rest/v1/cards?select=card_slug,display_name,tagline,card_photo",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def art_uri(photo):
    """The 760px derivative derive.py already builds, base64'd in.

    Chrome will not reliably read a sibling file:// image out of a page written
    to a temp dir, and the full-size art is up to 1.1 MB for a box that is
    360px wide. Neither problem exists once the bytes are in the document.
    """
    base = os.path.basename(photo or "")
    if not base:
        return None
    for cand in (os.path.join(HERE, "assets", "card", base),
                 os.path.join(HERE, photo or "")):
        if os.path.exists(cand):
            mime = "image/png" if cand.lower().endswith(".png") else "image/jpeg"
            with open(cand, "rb") as fh:
                return f"data:{mime};base64," + base64.b64encode(fh.read()).decode()
    return None


def name_size(name):
    """One knob, because HAZE.DT NIGHTINGALE at KAV-MAN's size ran off the card."""
    n = len(str(name or ""))
    return 104 if n <= 8 else 84 if n <= 12 else 66 if n <= 16 else 52


def render(slug, name, seat, flavor, uri):
    html = open(TPL, encoding="utf-8").read()
    html = (html.replace("__ART__", uri)
                .replace("__NAMESIZE__", str(name_size(name)))
                .replace("__NAME__", esc(name))
                .replace("__SEAT__", esc(seat))
                .replace("__FLAVOR__", esc(flavor)))
    tmp_html = os.path.join(OUT_DIR, f"_{slug}.html")
    tmp_png = os.path.join(OUT_DIR, f"_{slug}.png")
    tmp_err = os.path.join(OUT_DIR, f"_{slug}.err")
    out_jpg = os.path.join(OUT_DIR, f"{slug}.jpg")
    open(tmp_html, "w", encoding="utf-8").write(html)
    for f in (tmp_png, out_jpg, tmp_err):
        if os.path.exists(f):
            os.remove(f)
    # x2 then downscale: 1200x630 straight out of Chrome renders the mono
    # letterspacing soft. virtual-time-budget lets the webfonts actually land,
    # without it the first card renders in Times.
    # ⛔ NO --default-background-color. Chrome wants a hex RGB/RGBA there and
    # rejects anything else by REFUSING TO RENDER AT ALL, exit code 0, no file,
    # nothing on stdout. The body already paints its own background, so the flag
    # bought nothing and cost the whole screenshot.
    # ⛔ And do not send stderr to DEVNULL. That error line above is the only
    # thing that says why a render produced no file.
    err = open(tmp_err, "w")
    p = subprocess.Popen([
        CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=2", "--window-size=1200,630",
        "--virtual-time-budget=6000",
        f"--screenshot={tmp_png}", "file://" + tmp_html],
        stdout=subprocess.DEVNULL, stderr=err)
    # ⛔ WATCH THE FILE, NOT THE PROCESS. Chrome headless has hung here before
    # and outlived its own screenshot.
    deadline = time.time() + 60
    while time.time() < deadline:
        if os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 0:
            time.sleep(0.4)
            break
        time.sleep(0.25)
    try:
        p.terminate()
    except Exception:
        pass
    err.close()
    if not os.path.exists(tmp_png):
        why = ""
        try:
            why = [l for l in open(tmp_err).read().splitlines() if "ERROR" in l][-1]
        except Exception:
            pass
        print(f"  ⛔ {slug}: chrome wrote nothing. {why}")
        return False
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "86",
                    "-z", "630", "1200", tmp_png, "--out", out_jpg],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for f in (tmp_html, tmp_png, tmp_err):
        if os.path.exists(f):
            os.remove(f)
    if not os.path.exists(out_jpg):
        print(f"  ⛔ {slug}: sips wrote nothing")
        return False
    print(f"  og card: /assets/og/{slug}.jpg  ({os.path.getsize(out_jpg)//1024} KB)  {name}")
    return True


def main():
    only = {a.strip().lower() for a in sys.argv[1:]}
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.exists(CHROME):
        sys.exit(f"Chrome not found at {CHROME}")
    people = house_people()
    try:
        hs = holders()
    except Exception as e:
        sys.exit(f"cards unreadable: {e}")
    made = skipped = 0
    for h in hs:
        slug = (h.get("card_slug") or "").strip()
        if not slug or (only and slug not in only):
            continue
        if h.get("card_photo"):
            # Their own upload wins and bake.py points straight at it.
            print(f"  {slug}: has an uploaded card_photo, left alone")
            skipped += 1
            continue
        hc = next((x for x in people if tight(x.get("name")) == tight(slug)), None)
        if not hc:
            print(f"  ⛔ {slug}: nothing in roster.json or creators.json matches")
            skipped += 1
            continue
        uri = art_uri(hc.get("photo"))
        if not uri:
            print(f"  ⛔ {slug}: no art on disk for {hc.get('photo')!r}")
            skipped += 1
            continue
        name = h.get("display_name") or hc.get("name") or slug
        seat = hc.get("type_label") or "CARD HOLDER"
        flavor = h.get("tagline") or hc.get("flavor") or "Holds a card at 0FF THE PRINT."
        made += render(slug, name, seat, flavor, uri)
    print(f"\n  {made} card(s) rendered, {skipped} skipped, {len(hs)} holder(s) seen")
    print("\nNow:  /usr/bin/python3 bake.py   then commit")
    print("  ⛔ bake.py is what puts these into the og:image tags. Rendering")
    print("     alone changes nothing a scraper can see.")


if __name__ == "__main__":
    main()
