#!/usr/bin/env python3
"""THE STREET's skin on every inner page (11/12, his "Its a go": make the whole site one with the street).

Every public inner page carries the same strip at the top: one back key, top left, that goes back to the PLACE on the
street the page belongs to and names it; the place's name beside it; and, top right, the sound key (and the BAG key on
pages that keep a bag). The look is assets/css/street-skin.css, the sound and the keys are assets/js/street-skin.js.
<html data-place="..."> picks the place's colour.
One page is not a place on the street: THE TAKE (take/) is the eighth card of the Coven (11/13). Its key says Table and goes
to the table (wall/), and its strip is the cloth the card's own files dress (assets/css/take-card.css, assets/js/take-card.js).

    skin_text(html, rel)   one page's text, skinned. Safe to run again: it replaces its own strip, it never stacks.
    apply_all()            every inner page in PAGES below, written only when it changed. stamp.py runs this first,
                           so a page any generator writes gets the strip before the commit even if the generator forgot.

Generators call skin_text() on what they write (newevent.py, newstory.py, videos.py). The Kit is an offline app with
its own cache list, so it carries the back key's few rules inline instead of the shared files (INLINE below). Sweet
Takes (ad/) is offline too and takes the WHOLE strip inline: the key, the place's name, the one sound switch, on every
one of its screens (OFFLINE below, his 11/12 "lets not forget about sweet takes"). After a change to ad/ run its own
stamper too (the-ad-tests/stamp_ad.py <repo>/ad): it gives the page's offline worker a new cache name.
The vlog kit (kit/vlog/) is BUILT outside the repo (03_PROJECTS/vlogs/kit/build.py) and takes the same inline strip
here, after its build: a fresh build comes out without it, and the next stamp.py puts it back.

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
    "door":   ("#in-door", "Coven", "THE COVEN", "#5ae0d0"),      # 11/13: no place is called THE DOOR. The club building is THE COVEN (its address on the street is still #in-door)
    "box":    ("#in-box", "Box Office", "BOX OFFICE", "#ffd479"),
    "kit":    ("#in-kit", "Kit", "THE KIT", "#7fd3ff"),
    "bites":  ("#in-bites", "Love Bites", "LOVE BITES", "#ff4f8b"),
    "street": ("", "Street", "0FF THE PRINT", "#ff8fd8"),
    # 11/13: THE TAKE is the eighth card of the Coven. Its back key is Table and goes to the table (wall/), not to a place on
    # the street; the fifth item is the key's spoken name. Its colour is THE TAKE's pink (assets/css/take.css sets it).
    "coven":  ("wall/", "Table", "THE COVEN", "#ec6ea4", "Back to the table. The Reading."),
}
# which pages, and the place each belongs to (first match wins)
RULES = [
    (r"^events/(?:[^/]+/)?index\.html$", "booth"),
    (r"^word/(?:[^/]+/)?index\.html$", "stand"),
    (r"^(?:video|ink)/index\.html$", "box"),
    (r"^take/index\.html$", "coven"),
    (r"^(?:dates|join|reset|my|compose)/index\.html$", "door"),
    (r"^(?:reliquary|font|wallpapers)/index\.html$", "bites"),
    (r"^(?:work|press)/index\.html$", "street"),
    (r"^404\.html$", "street"),
    (r"^(?:kit|ad)/index\.html$", "kit"),
    (r"^kit/vlog/index\.html$", "kit"),
]
INLINE = ("kit/index.html",)                          # an offline app: the key's rules ride in the page, no shared files
GLOBS = ["events/index.html", "events/*/index.html", "word/index.html", "word/*/index.html",
         "video/index.html", "ink/index.html", "dates/index.html", "join/index.html", "reset/index.html", "my/index.html",
         "compose/index.html", "take/index.html", "reliquary/index.html", "font/index.html",
         "wallpapers/index.html", "work/index.html", "press/index.html", "404.html", "kit/index.html", "ad/index.html",
         "kit/vlog/index.html"]

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


# ---- an offline app that takes the whole strip inline (no shared file to cache, nothing to fall out of step) ----
# The strip is the same pill in the same spot, the place's name in the place's colour, and the one sound switch
# (localStorage 'st-snd', the street's own setting). It stays at the top of the page while the page scrolls, on a dark
# plate of its own so it reads the same on a light page, and it sits UNDER the app's own pop ups (z-index 30), so it
# covers nothing. --skh is its height: the app's fit rules below start everything that used the top of the screen
# under it. {up} is the way to the site's root from the page.
FULL_CSS = (
    '@font-face{font-family:"Potta One";src:url({up}reliquary/fonts/pottaone.woff2) format("woff2");font-display:swap}'
    ":root{--sk:{colour};--skh:calc(56px + env(safe-area-inset-top,0px))}"
    ".sk-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;min-height:var(--skh);"
    "padding:max(6px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) 6px calc(max(12px,env(safe-area-inset-left,0px)) + 92px);"
    "background:#150b14;box-shadow:inset 0 -2px 0 #08070b;color-scheme:dark}"
    ".sk-back{position:fixed;left:max(12px,env(safe-area-inset-left,0px));top:max(6px,env(safe-area-inset-top,0px));z-index:31;"
    "display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;min-width:82px;min-height:44px;padding:0 14px;border-radius:999px;"
    "background:linear-gradient(#3d3b45,#25232b);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 4px 0 #08070b,0 6px 12px rgba(0,0,0,.5);"
    'color:#f1eef6;font:700 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;'
    "-webkit-tap-highlight-color:transparent;touch-action:manipulation}"
    ".sk-back span{font-size:18px;line-height:1}"
    ".sk-back:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 2px 0 #08070b}"
    ".sk-back:focus-visible,.sk-snd:focus-visible{outline:2px solid #fff;outline-offset:2px}"
    '.sk-place{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:400 15px/1 "Potta One",system-ui,sans-serif;'
    "letter-spacing:.03em;color:var(--sk);text-shadow:0 0 10px color-mix(in srgb,var(--sk) 55%,transparent),0 1px 0 #000}"
    ".sk-keys{flex:none;display:inline-flex;align-items:center;gap:8px}"
    ".sk-snd{display:inline-flex;align-items:center;justify-content:center;gap:5px;box-sizing:border-box;min-width:44px;min-height:44px;margin:0;padding:0 10px;"
    "border:0;border-radius:12px;background:linear-gradient(#3d3b45,#25232b);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 4px 0 #08070b;"
    'color:#f1eef6;font:700 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}'
    ".sk-snd svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
    ".sk-snd small{font-size:11px}"      # 11/14: the word (On, Off) was 9.2 px; nothing a person reads is under 11 (street-skin.css says the same)
    '.sk-snd[aria-pressed="false"]{color:#a79fb3}.sk-snd[aria-pressed="false"] .on{display:none}'
    ".sk-snd:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 2px 0 #08070b}"
    "@media (prefers-reduced-motion:reduce){.sk-back:active,.sk-snd:active{transform:none}}"
)
# the sound key, the same one street-skin.js draws: one setting for the whole site, ON unless he turned it off. The
# app's own sounds ask the same setting (ad/: its beep at the redline reads 'st-snd' itself).
FULL_JS = (
    "(function(w,d){var K='st-snd',h=d.getElementById('sk-keys');if(!h)return;"
    "function on(){try{return w.localStorage.getItem(K)!=='off'}catch(e){return true}}"
    "var b=d.createElement('button');b.type='button';b.className='sk-snd';"
    """b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="on" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg><small></small>';"""
    "function paint(){var v=on();b.setAttribute('aria-pressed',String(v));b.setAttribute('aria-label',v?'Sound on. Tap to mute the whole site.':'Sound off. Tap to turn it on.');b.querySelector('small').textContent=v?'On':'Off'}"
    "function hello(){try{var C=w.AudioContext||w.webkitAudioContext;if(!C)return;var a=new C(),t=a.currentTime;[[1047,0],[1568,.07]].forEach(function(p){var o=a.createOscillator(),g=a.createGain();"
    "o.type='sine';o.frequency.value=p[0];g.gain.setValueAtTime(0,t+p[1]);g.gain.linearRampToValueAtTime(.05,t+p[1]+.008);g.gain.exponentialRampToValueAtTime(.0001,t+p[1]+.14);"
    "o.connect(g);g.connect(a.destination);o.start(t+p[1]);o.stop(t+p[1]+.18)});setTimeout(function(){a.close()},700)}catch(e){console.warn('street skin: no sound on this phone',e)}}"
    "b.addEventListener('click',function(){var v=!on();try{w.localStorage.setItem(K,v?'on':'off')}catch(e){console.warn('street skin: the sound setting would not save',e)}paint();if(v)hello()});"
    "w.addEventListener('storage',function(e){if(e.key===K)paint()});h.appendChild(b);paint()})(window,document);"
)
# Sweet Takes: where its own layout used the top of the screen, it starts under the strip instead (the title still fits
# a 375x667 phone with no scroll, the set still fills the screen exactly); its own "Kit" link leaves its bar, the strip's
# key is the one way out. The Kit's colour is its accent where it already had a sky blue (focus rings, the blue end of
# its bar); its screen headings take the street's face. Its keys, its pixel art and what every control does are its own.
AD_FIT = (
    '@font-face{font-family:"VP Deadeye";src:url({up}reliquary/fonts/vpdeadeye.woff2) format("woff2");font-display:swap}'
    ":root{--sky:{colour}}"
    ".app{min-height:calc(100vh - var(--skh));min-height:calc(100dvh - var(--skh))}"
    ".bar{top:var(--skh);padding-top:8px;background:linear-gradient(180deg,rgba(255,255,255,.6),rgba(255,255,255,0) 55%),linear-gradient(90deg,#ffa8d6,#d8b8ff 55%,{colour})}"
    'body[data-scr="run"] .app{height:calc(100vh - var(--skh));height:calc(100dvh - var(--skh));padding-top:10px}'
    'body[data-scr="run"] .toast{top:calc(var(--skh) + 8px)}'
    "#pop{top:calc(var(--skh) + 70px)}"
    "#s-home{min-height:calc(100vh - var(--skh));min-height:calc(100dvh - var(--skh))}"
    ".t-hero{padding-top:0}"
    '.intro h1,.intro h2{font-family:"VP Deadeye",var(--f-pop)}'
)
# The vlog kit: its two small chips (Home, Kit) give way to the one key. The page keeps a 16 px gutter on the body, so
# the strip reaches out over it; its banner drops under the strip. While the phone is handed to a guest (body.hand) the
# page already hid its ways out on purpose, and the strip hides with them. Its own sounds ask the one setting first
# (a line put into its sfx() here, between the two marks, because its builder lives outside the repo).
VLOG_FIT = (
    ":root{padding-top:0}"
    "html body{padding-top:0}"                       # the page's own sheet sits in its body, after this one: one step more exact
    ".sk-top{width:auto;margin:0 calc(-1 * max(16px,env(safe-area-inset-right,0px))) 16px calc(-1 * max(16px,env(safe-area-inset-left,0px)))}"
    "body.hand .sk-top,body.hand .sk-back{display:none}"
    "html body.hand{padding-top:calc(16px + env(safe-area-inset-top,0px))}"
    "html .banner{top:calc(var(--skh) + 8px)}"
)
MUTE = "/*sk*/try{if(localStorage.getItem('st-snd')==='off')return}catch(e){}/*/sk*/"
# rel -> (its fit rules, the old way back it gives up, the start of its own sound function or None)
OFFLINE = {
    "ad/index.html": (AD_FIT, r'[ \t]*<a class="home" href="[^"]*"[^>]*>.*?</a>\n?', None),      # its beep asks 'st-snd' in its own source
    "kit/vlog/index.html": (VLOG_FIT, r'[ \t]*<div class="kithomes">.*?</div>\n?', "function sfx(kind) {"),
}


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
    to, word, name = PLACES[place][:3]
    label = PLACES[place][4] if len(PLACES[place]) > 4 else f"Back to {name.title()} on the street"
    if rel == "404.html":
        up = "/"                                            # a missing page can be asked for at any depth
    elif '<base href="../">' in text:
        up = "./"                                           # the take page reads every address from the root
    else:
        up = "../" * rel.count("/") or "./"
    back = f'<a class="sk-back" href="{up}{to}" aria-label="{label}"><span aria-hidden="true">&lsaquo;</span>{word}</a>'
    if rel in INLINE:
        return up, f'<!--sk-->{back}<div class="sk-pad" aria-hidden="true"></div><!--/sk-->'
    if rel in OFFLINE:
        return up, (f'<!--sk--><div class="sk-top">{back}<b class="sk-place">{name}</b><span class="sk-keys" id="sk-keys"></span></div>'
                    f'<script data-sk>{FULL_JS}</script><!--/sk-->')
    return up, f'<!--sk--><div class="sk-top">{back}<b class="sk-place">{name}</b><span class="sk-keys" id="sk-keys"></span></div><!--/sk-->'


def skin_text(text, rel):
    place = place_of(rel)
    if not place:
        return text
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
    if rel in OFFLINE:
        text = re.sub(OFFLINE[rel][1], "", text, count=1, flags=re.S)
        fn = OFFLINE[rel][2]
        if fn:
            text = text.replace(MUTE, "")
            if text.count(fn) == 1:
                text = text.replace(fn, fn + MUTE, 1)
            else:
                print(f"  street skin: {rel} has no '{fn}' any more, so its sounds do not ask the sound key (tell its builder)")
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
    elif rel in OFFLINE:
        css = (FULL_CSS + OFFLINE[rel][0]).replace("{up}", up).replace("{colour}", PLACES[place][3])
        head = f"<style data-sk>{css}</style>\n"
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
