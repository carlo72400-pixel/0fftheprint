#!/usr/bin/env python3
"""THE STREET's skin on every inner page (11/12, his "Its a go": make the whole site one with the street).

Every public inner page carries the same strip at the top: one back key, top left, that goes back to the PLACE on the
street the page belongs to and names it; the place's name beside it; and, top right, the sound key (and the BAG key on
pages that keep a bag). The look is assets/css/street-skin.css, the sound and the keys are assets/js/street-skin.js.
<html data-place="..."> picks the place's colour.

    skin_text(html, rel)   one page's text, skinned. Safe to run again: it replaces its own strip, it never stacks.
    apply_all()            every inner page in PAGES below, written only when it changed. stamp.py runs this first,
                           so a page any generator writes gets the strip before the commit even if the generator forgot.

Generators call skin_text() on what they write (newevent.py, newstory.py, videos.py, maketake.py). The Kit and Sweet
Takes are offline apps with their own cache lists, so they carry the back key's few rules inline instead of the shared
files (INLINE below). kit/vlog/ is built outside the repo and is not touched here.

⛔ Never skin: portfolio/, business/, board/, desk/, goals/, hours/, seats/, shot/, snw-*/, allnight/, interview/,
   reliquary/read/, reliquary/vault/, index.html (the street itself), wall/ (the Crypt has its own build).
"""
import glob
import io
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))

# place -> (where its back key goes on the street, the key's word, the place's name, its colour: the kit's own place colours)
PLACES = {
    "booth":  ("#in-booth", "Booth", "PHOTO BOOTH", "#ff6aa8"),
    "stand":  ("#in-stand", "Stand", "THE STAND", "#ffb547"),
    "bar":    ("#in-bar", "Bar", "THE BAR", "#b892ff"),
    "door":   ("#in-door", "Door", "THE DOOR", "#5ae0d0"),
    "box":    ("#in-box", "Box Office", "BOX OFFICE", "#ffd479"),
    "kit":    ("#in-kit", "Kit", "THE KIT", "#7fd3ff"),
    "bites":  ("#in-bites", "Love Bites", "LOVE BITES", "#ff4f8b"),
    "street": ("", "Street", "0FF THE PRINT", "#ff8fd8"),
}
# which pages, and the place each belongs to (first match wins)
RULES = [
    (r"^events/(?:[^/]+/)?index\.html$", "booth"),
    (r"^c/(?:[^/]+/)?index\.html$", "booth"),
    (r"^word/(?:[^/]+/)?index\.html$", "stand"),
    (r"^(?:video|ink)/index\.html$", "box"),
    (r"^(?:dates|join|reset|my|compose|card|take)/index\.html$", "door"),
    (r"^(?:reliquary|font|wallpapers)/index\.html$", "bites"),
    (r"^(?:work|press)/index\.html$", "street"),
    (r"^404\.html$", "street"),
    (r"^(?:kit|ad)/index\.html$", "kit"),
]
INLINE = ("kit/index.html",)                          # an offline app: the key's rules ride in the page, no shared files
# Sweet Takes is a full-screen offline game with its own back key in the top left corner of its own bar. Its old "Home"
# link in that bar becomes the way back to the Kit on the street; nothing else of it is touched (AD below).
AD = "ad/index.html"
GLOBS = ["events/index.html", "events/*/index.html", "c/index.html", "c/*/index.html", "word/index.html", "word/*/index.html",
         "video/index.html", "ink/index.html", "dates/index.html", "join/index.html", "reset/index.html", "my/index.html",
         "compose/index.html", "card/index.html", "take/index.html", "reliquary/index.html", "font/index.html",
         "wallpapers/index.html", "work/index.html", "press/index.html", "404.html", "kit/index.html", "ad/index.html"]

KEY_CSS = (".sk-back{position:fixed;left:max(12px,env(safe-area-inset-left,0px));top:max(6px,env(safe-area-inset-top,0px));z-index:9000;"
           "display:inline-flex;align-items:center;gap:6px;min-width:82px;min-height:44px;padding:0 14px;border-radius:999px;"
           "background:linear-gradient(#3d3b45,#25232b);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 4px 0 #08070b,0 6px 12px rgba(0,0,0,.5);"
           "color:#f1eef6;font:700 12px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none}"
           ".sk-back span{font-size:18px;line-height:1}.sk-back:focus-visible{outline:2px solid #fff;outline-offset:2px}"
           ".sk-pad{height:calc(52px + env(safe-area-inset-top,0px))}"
           # inside a tool the Kit's own key (top left of its bar, back to the Kit's front) is the one back key: the street's
           # key steps aside, and the round key the Kit had in the bottom right corner since October is gone (his 11/12 call)
           'body[data-tool]:not([data-tool="home"]) .sk-back,body[data-tool]:not([data-tool="home"]) .sk-pad{display:none}'
           "#back-fab{display:none!important}"
           # the Kit's own title, in the Kit's colour (11/12, header only)
           ".bar .wm b{color:#7fd3ff;text-shadow:0 0 12px rgba(127,211,255,.65),0 0 2px rgba(127,211,255,.9)}")


def place_of(rel):
    for pat, place in RULES:
        if re.match(pat, rel):
            return place
    return None


def pages():
    out = []
    for g in GLOBS:
        out += [os.path.relpath(p, ROOT).replace(os.sep, "/") for p in sorted(glob.glob(os.path.join(ROOT, g)))]
    return [p for p in out if place_of(p)]


def strip(rel, text):
    """the strip's markup for one page"""
    place = place_of(rel)
    to, word, name, _ = PLACES[place]
    if rel == "404.html":
        up = "/"                                            # a missing page can be asked for at any depth
    elif '<base href="../">' in text:
        up = "./"                                           # the take page reads every address from the root
    else:
        up = "../" * rel.count("/") or "./"
    back = f'<a class="sk-back" href="{up}{to}" aria-label="Back to {name.title()} on the street"><span aria-hidden="true">&lsaquo;</span>{word}</a>'
    if rel in INLINE:
        return up, f'<!--sk-->{back}<div class="sk-pad" aria-hidden="true"></div><!--/sk-->'
    return up, f'<!--sk--><div class="sk-top">{back}<b class="sk-place">{name}</b><span class="sk-keys" id="sk-keys"></span></div><!--/sk-->'


def skin_text(text, rel):
    place = place_of(rel)
    if not place:
        return text
    if rel == AD:
        text, n = re.subn(r'<a class="home" href="[^"]*"[^>]*>.*?</a>', '<a class="home" href="../#in-kit" aria-label="Back to The Kit on the street">&lsaquo; Kit</a>', text, count=1, flags=re.S)
        assert n == 1, "ad/index.html: its Home link is not where it was"
        m = re.search(r"<html\b[^>]*>", text)
        tag = re.sub(r'\sdata-place="[^"]*"', "", m.group(0))[:-1] + ' data-place="kit">'
        return text[:m.start()] + tag + text[m.end():]
    up, bar = strip(rel, text)
    assets = "/" if rel == "404.html" else ("" if up == "./" else up)
    # 1. the place, on <html>
    m = re.search(r"<html\b[^>]*>", text)
    assert m, f"{rel}: no <html> tag"
    tag = re.sub(r'\sdata-place="[^"]*"', "", m.group(0))[:-1] + f' data-place="{place}">'
    text = text[:m.start()] + tag + text[m.end():]
    # 2. the old ways back: the "<- 0FF THE PRINT" link at the top of a page, a "Home" key in a header
    text = re.sub(r'[ \t]*<a class="back" href="[^"]*"[^>]*>.*?</a>\n?', "", text, count=1, flags=re.S)
    text = re.sub(r'[ \t]*<a class="home" href="\.\./"[^>]*>.*?</a>\n?', "", text, count=1, flags=re.S)
    # 3. our own strip and tags, taken out first so a second run changes nothing
    text = re.sub(r"<!--sk-->.*?<!--/sk-->\n?", "", text, flags=re.S)
    text = re.sub(r'<link rel="stylesheet" href="[^"]*assets/css/street-skin\.css[^"]*">\n?', "", text)
    text = re.sub(r'<script src="[^"]*assets/js/street-skin\.js[^"]*" defer></script>\n?', "", text)
    text = re.sub(r"<style data-sk>.*?</style>\n?", "", text, flags=re.S)
    m = re.search(r"<body\b[^>]*>\n?", text)
    assert m, f"{rel}: no <body> tag"
    text = text[:m.end()] + bar + "\n" + text[m.end():]
    if rel in INLINE:
        head = f"<style data-sk>{KEY_CSS}</style>\n"
    else:
        head = (f'<link rel="stylesheet" href="{assets}assets/css/street-skin.css">\n'
                f'<script src="{assets}assets/js/street-skin.js" defer></script>\n')
    assert text.count("</head>") >= 1, f"{rel}: no </head>"
    i = text.index("</head>")
    return text[:i] + head + text[i:]


def apply_all(quiet=False):
    changed = []
    for rel in pages():
        p = os.path.join(ROOT, rel)
        old = io.open(p, encoding="utf-8").read()
        new = skin_text(old, rel)
        try:
            import stamp
            new = stamp.stamp_text(new)          # so a second run changes nothing
        except Exception as e:
            print(f"  street skin: {rel} not stamped here ({e})")
        if new != old:
            io.open(p, "w", encoding="utf-8").write(new)
            changed.append(rel)
    if changed and not quiet:
        print(f"  street skin: {len(changed)} page(s) got the strip" + (": " + ", ".join(changed[:4]) + (" ..." if len(changed) > 4 else "")))
    return changed


if __name__ == "__main__":
    if not apply_all():
        print("street skin: every inner page already has it")
