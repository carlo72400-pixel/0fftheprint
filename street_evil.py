#!/usr/bin/env python3
"""FRUTIGER EVIL on the inner pages (his 11/17 calls: "do a full pass, make sure it passes the Frutiger evil ... all the
assets", "make sure everything blends together and is cohesive and nothing is out of place", then "Not yet, inner pages").

Every page street_skin.py skins, plus wall/ and take/, gets:
  1. its own <style> blocks re-coloured by ROLE: a surface goes deep glass in its own colour family, text goes light, dark
     ink lines go gunmetal, shadows stay as they are. Each block is marked /*fe*/, so a second run changes nothing.
  2. the shared stylesheets it links swapped for re-coloured copies in assets/css/fe/. The originals stay as they were for
     /board/, /shot/, /portfolio/ and /business/, which keep their look (his 11/12 call).
  3. assets/css/evil.css after everything else: the street's pixel night behind the top of the page, chrome page titles
     like the 3D title, the strip and the keys as black glass.
Colour variables are split by role: --x stays the surface, --x-t (text) and --x-l (lines) are written beside it, and a
color: or border: that reads var(--x) reads var(--x-t, var(--x)) or var(--x-l, var(--x)) instead, so a variable defined
somewhere this never sees still works.
Pictures are never touched here (photos, covers and lock screens stay as shot and drawn).

stamp.py runs apply_all() right after the strip (street_skin.apply_all), so every builder that stamps keeps it.
To take it off: drop the hook in stamp.py, delete assets/css/fe/ and assets/css/evil.css, rebuild the pages.
    /usr/bin/python3 street_evil.py
"""
import colorsys
import hashlib
import io
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
EXTRA = ["wall/index.html", "take/index.html"]
SKIP = ("ad/",)          # Sweet Takes: a pixel-pastel game with its own art direction (his 10/21 pick), left exactly as it is
SKIP_SHEETS = {"assets/css/street-skin.css", "assets/css/evil.css"}   # the strip's sheet (evil.css restyles the strip) and this one
FE_CSS, FE_JS = "assets/css/fe", "assets/js/fe"
# scripts that write CSS of their own at run time: a re-coloured copy each, plus the edits listed (word.js: stories open dark,
# the paper is still one tap away on the page's own key)
SCRIPTS = {"assets/js/word.js": [("load('otp-paper', 1)", "load('otp-paper', 0)")]}
BRAND = ("reliquary/", "yorune/", "wallpapers/", "font/")   # these keep their own display type (the comic's and the singers' logos, his VP Deadeye specimen)
MARK = "/*fe*/"

NAMED = {"white": (255, 255, 255), "black": (0, 0, 0), "red": (255, 0, 0), "pink": (255, 192, 203), "gold": (255, 215, 0)}
COL = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?<![-\w#])(?:white|black|red|pink|gold)(?![-\w])")
TEXT_P = {"color", "-webkit-text-fill-color", "fill", "stroke", "text-decoration", "text-decoration-color", "accent-color", "text-emphasis-color"}
SURF_P = {"background", "background-color", "background-image", "border-image", "border-image-source", "stop-color"}
KEEP_P = {"box-shadow", "text-shadow", "filter", "-webkit-filter", "-webkit-text-stroke", "-webkit-text-stroke-color", "caret-color",
          "mask", "-webkit-mask", "-webkit-tap-highlight-color", "backdrop-filter", "-webkit-backdrop-filter"}


# ---------------------------------------------------------------- colour roles
def parse(tok):
    t = tok.lower()
    if t.startswith("#"):
        h = t[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else None
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a
    if t.startswith("hsl"):
        n = re.findall(r"[\d.]+", t)
        h, s, l = float(n[0]) / 360, float(n[1]) / 100, float(n[2]) / 100
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return int(r * 255), int(g * 255), int(b * 255), (float(n[3]) if len(n) > 3 else None)
    if t.startswith("rgb"):
        n = re.findall(r"[\d.]+%?", t)
        v = [float(x[:-1]) * 2.55 if x.endswith("%") else float(x) for x in n[:3]]
        a = None
        if len(n) > 3:
            a = float(n[3][:-1]) / 100 if n[3].endswith("%") else float(n[3])
        return int(v[0]), int(v[1]), int(v[2]), a
    r, g, b = NAMED[t]
    return r, g, b, None


def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, int(round(x)))) for x in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}" if a is None else f"rgba({r},{g},{b},{a:.3g})"


def hls(r, g, b):
    return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)


def out(h, l, s, a):
    r, g, b = colorsys.hls_to_rgb(h, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return fmt(r * 255, g * 255, b * 255, a)


def famhue(h, s):
    """the evil palette's families"""
    d = h * 360
    if s < .14:
        return h, s
    if d >= 300 or d < 22:
        d = d if (d >= 318 or d < 8) else (340 if d >= 300 else 352)     # pinks and reds: raspberry, crimson
    elif d < 36:
        d = 18                                                            # orange: blood orange
    elif d < 72:
        d = 42                                                            # yellow, gold: amber gold
    elif d < 200:
        d = 182                                                           # greens, mint, teal: evil teal
    elif d < 250:
        d = 218                                                           # blues: steel blue
    else:
        d = 274                                                           # lilac, purple: violet
    return (d % 360) / 360, s


def surface(tok):
    r, g, b, a = parse(tok)
    h, l, s = hls(r, g, b)
    if l < .1:
        return tok                                                        # already deep
    if l > .88 or s < .14:                                                # paper, cream, white, greys: dark gunmetal glass
        return out(228 / 360, .05 + .15 * (l ** 1.2), .1, a)
    h, s = famhue(h, s)
    gold = abs(h * 360 - 42) < 1 and s > .3
    return out(h, .05 + .26 * (l ** 1.1) + (.1 if gold else 0), min(.85, s * .9), a)


def text(tok):
    r, g, b, a = parse(tok)
    h, l, s = hls(r, g, b)
    h, s = famhue(h, s)
    if l < .5:
        return out(h, .9 - .06 * min(s, 1), min(s, .55), a)               # dark ink: light, a breath of its hue
    return out(h, max(l, .8), min(s, .9), a)


def line(tok):
    r, g, b, a = parse(tok)
    h, l, s = hls(r, g, b)
    if l < .25:
        return fmt(58, 63, 76, a)                                         # ink lines: gunmetal
    h, s = famhue(h, s)
    return out(h, .2 + .45 * l, min(1, s), a)


def sub(val, fn):
    def one(m):
        try:
            return fn(m.group(0))
        except (ValueError, IndexError, KeyError):
            return m.group(0)                 # rgba(var(--rgb), .5) and the like: left as written
    return COL.sub(one, val)


def wrap_vars(val, suffix):
    """var(--x ...) -> var(--x-<suffix>,var(--x ...)), balanced"""
    res, i = [], 0
    while True:
        j = val.find("var(--", i)
        if j < 0:
            res.append(val[i:])
            return "".join(res)
        res.append(val[i:j])
        depth, k = 0, j
        while k < len(val):
            if val[k] == "(":
                depth += 1
            elif val[k] == ")":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        whole = val[j:k + 1]
        name = re.match(r"var\((--[\w-]+)", whole).group(1)
        res.append(whole if name.endswith(("-t", "-l")) else f"var({name}-{suffix},{whole})")
        i = k + 1


def decl(prop, val):
    p = prop.strip().lower()
    if p.startswith("--"):
        if not (COL.search(val) or "var(" in val):
            return f"{prop}:{val}"
        n = prop.strip()
        return (f"{prop}:{sub(val, surface)};{n}-t:{wrap_vars(sub(val, text), 't')};"
                f"{n}-l:{wrap_vars(sub(val, line), 'l')}")
    if p in KEEP_P:
        return f"{prop}:{val}"
    if p in TEXT_P:
        return f"{prop}:{wrap_vars(sub(val, text), 't')}"
    if p.startswith(("border", "outline", "column-rule")) and p not in ("border-radius", "border-collapse", "border-spacing") and "radius" not in p:
        if "image" in p:
            return f"{prop}:{sub(val, surface)}"
        return f"{prop}:{wrap_vars(sub(val, line), 'l')}"
    if p in SURF_P or p.startswith("background"):
        return f"{prop}:{sub(val, surface)}"
    return f"{prop}:{val}"


def body_map(body):
    parts = re.split(r";(?![^()]*\))", body)
    res = []
    for d in parts:
        if ":" not in d or d.strip().startswith("@"):
            res.append(d)
            continue
        prop, val = d.split(":", 1)
        res.append(decl(prop, val))
    return ";".join(res)


def walk(css):
    """rules and at-rules, recursing into @media / @supports / @container / @layer; @font-face kept"""
    res, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            res.append(css[i:])
            break
        sel = css[i:j]
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == "{":
                depth += 1
            elif css[k] == "}":
                depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        s = sel.strip()
        if s.startswith(("@media", "@supports", "@container", "@layer", "@document")):
            res.append(sel + "{" + walk(body) + "}")
        elif s.startswith(("@keyframes", "@-webkit-keyframes")):
            res.append(sel + "{" + re.sub(r"([^{}]+)\{([^{}]*)\}", lambda m: m.group(1) + "{" + body_map(m.group(2)) + "}", body) + "}")
        elif s.startswith("@font-face") or s.startswith("@page"):
            res.append(sel + "{" + body + "}")
        else:
            res.append(sel + "{" + body_map(body) + "}")
        i = k
    return "".join(res)


def recolour(css, url_prefix=None):
    """mask comments and url(...) first (a data: SVG can hold ; and colours of its own), walk, unmask"""
    keep = []
    def hold(m):
        v = m.group(0)
        if url_prefix is not None and v.startswith("url("):
            inner = v[4:-1].strip().strip("'\"")
            if inner and not inner.startswith(("/", "data:", "http:", "https:", "#")):
                q = v[4] if v[4] in "'\"" else ""
                v = f"url({q}{url_prefix}{inner}{q})"
        keep.append(v)
        return f"\x00{len(keep) - 1}\x00"
    masked = re.sub(r"/\*.*?\*/|url\((?:\"[^\"]*\"|'[^']*'|[^)]*)\)", hold, css, flags=re.S)
    done = walk(masked)
    return re.sub(r"\x00(\d+)\x00", lambda m: keep[int(m.group(1))], done)


# ---------------------------------------------------------------- pages and shared sheets
def sha8(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def pages():
    try:
        import street_skin
        out_ = list(street_skin.pages())
    except Exception as e:
        print(f"  street evil: page list not read ({e})")
        out_ = []
    out_ = [p for p in out_ if not p.startswith(SKIP)]
    return out_ + [p for p in EXTRA if p not in out_ and os.path.exists(os.path.join(ROOT, p))]


def prefix(rel, text_):
    if rel == "404.html":
        return "/"
    if '<base href="../">' in text_:
        return ""
    return "../" * rel.count("/")


def resolve(rel, text_, href):
    """a stylesheet or script address on a page -> its path from the repo root (None for anything not ours)"""
    h = re.sub(r"[?#].*", "", href)
    if not h or h.startswith(("http:", "https:", "//", "data:")):
        return None
    if h.startswith("/"):
        return h.lstrip("/")
    base = "" if '<base href="../">' in text_ else os.path.dirname(rel)
    return os.path.normpath(os.path.join(base, h)).replace(os.sep, "/")


def fe_path(path, folder):
    """assets/css/sealed.css -> assets/css/fe/sealed.css, yorune/y.css -> assets/css/fe/yorune--y.css"""
    for pre in ("assets/css/", "assets/js/"):
        if path.startswith(pre):
            return f"{folder}/{path[len(pre):].replace('/', '--')}"
    return f"{folder}/{path.replace('/', '--')}"


def source_of(fe_rel):
    """the sheet a re-coloured copy was made from (its first line says)"""
    p = os.path.join(ROOT, fe_rel)
    if not os.path.exists(p):
        return None
    m = re.match(r"/\*fe\*//\* re-coloured copy of (\S+) src=", io.open(p, encoding="utf-8").readline())
    return m.group(1) if m else None


def copy_sheet(path):
    """a re-coloured copy in assets/css/fe/, rebuilt when its source changes; relative url()s re-pointed from there"""
    src = os.path.join(ROOT, path)
    s = io.open(src, encoding="utf-8").read()
    dst_rel = fe_path(path, FE_CSS)
    dst = os.path.join(ROOT, dst_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    head = f"{MARK}/* re-coloured copy of {path} src={sha8(s)} (street_evil.py) */\n"
    if not (os.path.exists(dst) and io.open(dst, encoding="utf-8").read().startswith(head)):
        up = os.path.relpath(os.path.dirname(src), os.path.dirname(dst)).replace(os.sep, "/") + "/"
        io.open(dst, "w", encoding="utf-8").write(head + recolour(s, url_prefix=up))
    return dst_rel, sha8(io.open(dst, encoding="utf-8").read())


def copy_script(path):
    """a copy whose CSS (the template strings it writes into <style>) is re-coloured, with the listed edits"""
    src = os.path.join(ROOT, path)
    s = io.open(src, encoding="utf-8").read()
    dst_rel = fe_path(path, FE_JS)
    dst = os.path.join(ROOT, dst_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    head = f"{MARK}/* re-coloured copy of {path} src={sha8(s)} (street_evil.py) */\n"
    if not (os.path.exists(dst) and io.open(dst, encoding="utf-8").read().startswith(head)):
        def tpl(m):
            keep = []
            body = re.sub(r"\$\{[^}]*\}", lambda x: (keep.append(x.group(0)), f"\x01{len(keep) - 1}\x01")[1], m.group(2))
            body = recolour(body)
            body = re.sub(r"\x01(\d+)\x01", lambda x: keep[int(x.group(1))], body)
            return m.group(1) + body + "`"
        t = re.sub(r"(textContent\s*=\s*`)(.*?)`", tpl, s, flags=re.S)
        for a, b in SCRIPTS.get(path, []):
            assert t.count(a) == 1, f"{path}: the edit {a!r} no longer matches, look again"
            t = t.replace(a, b)
        io.open(dst, "w", encoding="utf-8").write(head + t)
    return dst_rel, sha8(io.open(dst, encoding="utf-8").read())


def decls(style):
    """one inline style="" value, re-coloured by role (url()s masked)"""
    keep = []
    masked = re.sub(r"url\((?:\"[^\"]*\"|'[^']*'|[^)]*)\)", lambda m: (keep.append(m.group(0)), f"\x00{len(keep) - 1}\x00")[1], style)
    done = body_map(masked)
    return re.sub(r"\x00(\d+)\x00", lambda m: keep[int(m.group(1))], done)


def inline_styles(html):
    """style="" attributes outside scripts, style blocks and the strip, each tag once (marked data-fes)"""
    parts = re.split(r"(<script\b.*?</script>|<style\b.*?</style>|<!--sk-->.*?<!--/sk-->|<!--.*?-->)", html, flags=re.S)
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r"(<[a-zA-Z][\w-]*\b[^<>]*?)\s(style)=(\"|')(.*?)\3([^<>]*>)", lambda m: fix_m(m), parts[i])
    return "".join(parts)


def fix_m(m):
    tag = m.group(0)
    if " data-fes" in tag:
        return tag
    q = m.group(3)
    new = f"{m.group(1)} style={q}{decls(m.group(4))}{q}{m.group(5)}"
    return new[:-2] + " data-fes/>" if new.endswith("/>") else new[:-1] + " data-fes>"


def evil_page(rel, t, sheets, scripts, evil_hash):
    # 1. the page's own style blocks (never the strip's own block, the skin redraws that one every run)
    def blk(m):
        attrs, css = m.group(1), m.group(2)
        if "data-sk" in attrs or css.startswith(MARK) or not css.strip():
            return m.group(0)
        return f"<style{attrs}>{MARK}{recolour(css)}</style>"
    t = re.sub(r"<style([^>]*)>(.*?)</style>", blk, t, flags=re.S)
    # 2. inline style="" colours (lane colours on the comic shelf, a card's own colour), each tag once
    t = inline_styles(t)
    pre = prefix(rel, t)
    # 3. the page's own sheets and scripts: their re-coloured copies
    def link(m):
        path = resolve(rel, t, m.group(2))
        if path is None:
            return m.group(0)
        if path.startswith(FE_CSS + "/"):
            path = source_of(path) or path
        if path in sheets:
            return f'{m.group(1)}{pre}{sheets[path][0]}?v={sheets[path][1]}"'
        return m.group(0)
    t = re.sub(r'(<link\b[^>]*rel="stylesheet"[^>]*href=")([^"]+)"', link, t)
    def scr(m):
        path = resolve(rel, t, m.group(2))
        if path is None:
            return m.group(0)
        if path.startswith(FE_JS + "/"):
            src_path = next((k for k, v in scripts.items() if v[0] == path), None)
            return f'{m.group(1)}{pre}{path}?v={scripts[src_path][1]}"' if src_path else m.group(0)
        if path in scripts:
            return f'{m.group(1)}{pre}{scripts[path][0]}?v={scripts[path][1]}"'
        return m.group(0)
    t = re.sub(r'(<script\b[^>]*src=")([^"]+)"', scr, t)
    # 4. evil.css, last in <head>; the night sky right inside <body>
    link_tag = f'<link rel="stylesheet" data-fe href="{pre}assets/css/evil.css?v={evil_hash}">'
    if "data-fe href=" in t:
        t = re.sub(r'<link rel="stylesheet" data-fe href="[^"]*">', link_tag, t, count=1)
    else:
        i = t.index("</head>")
        t = t[:i] + link_tag + "\n" + t[i:]
    if 'class="fe-sky"' not in t:
        m = re.search(r"<body\b[^>]*>\n?", t)
        t = t[:m.end()] + '<i class="fe-sky" aria-hidden="true"></i>\n' + t[m.end():]
    if rel.startswith(BRAND) and 'data-fe="brand"' not in t:
        t = re.sub(r"<html\b", '<html data-fe="brand"', t, count=1)
    return t


def apply_all(quiet=False):
    evil = os.path.join(ROOT, "assets", "css", "evil.css")
    if not os.path.exists(evil):
        print("  street evil: assets/css/evil.css is missing, nothing done")
        return []
    evil_hash = sha8(io.open(evil, encoding="utf-8").read())
    texts = {}
    for rel in pages():
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            t = io.open(p, encoding="utf-8").read()
            if "</head>" in t and re.search(r"<body\b", t):
                texts[rel] = t
    # every sheet and script these pages load that has colours of its own (the strip's sheet and evil.css aside)
    sheets, scripts = {}, {}
    for rel, t in texts.items():
        for m in re.finditer(r'<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"', t):
            path = resolve(rel, t, m.group(1))
            if path and path.startswith(FE_CSS + "/"):
                path = source_of(path)                    # a page already on a copy: the copy follows its source
            if path and path.endswith(".css") and path not in SKIP_SHEETS and not path.startswith(FE_CSS + "/") \
                    and path not in sheets and os.path.exists(os.path.join(ROOT, path)):
                sheets[path] = copy_sheet(path)
    for path in SCRIPTS:
        if os.path.exists(os.path.join(ROOT, path)):
            scripts[path] = copy_script(path)
    changed = []
    for rel, old in texts.items():
        new = evil_page(rel, old, sheets, scripts, evil_hash)
        if new != old:
            io.open(os.path.join(ROOT, rel), "w", encoding="utf-8").write(new)
            changed.append(rel)
    if changed and not quiet:
        print(f"  street evil: {len(changed)} page(s) re-skinned Frutiger evil ({len(sheets)} sheets, {len(scripts)} scripts re-coloured)")
    return changed


def apply_one(rel):
    """one page (wall_build.py calls this for wall/index.html before it pushes): True when the page changed"""
    evil = os.path.join(ROOT, "assets", "css", "evil.css")
    p = os.path.join(ROOT, rel)
    if not (os.path.exists(evil) and os.path.exists(p)):
        return False
    t = io.open(p, encoding="utf-8").read()
    if "</head>" not in t or not re.search(r"<body\b", t):
        return False
    sheets = {}
    for m in re.finditer(r'<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"', t):
        path = resolve(rel, t, m.group(1))
        if path and path.startswith(FE_CSS + "/"):
            path = source_of(path)
        if path and path.endswith(".css") and path not in SKIP_SHEETS and not path.startswith(FE_CSS + "/") \
                and path not in sheets and os.path.exists(os.path.join(ROOT, path)):
            sheets[path] = copy_sheet(path)
    scripts = {path: copy_script(path) for path in SCRIPTS if os.path.exists(os.path.join(ROOT, path))}
    new = evil_page(rel, t, sheets, scripts, sha8(io.open(evil, encoding="utf-8").read()))
    if new != t:
        io.open(p, "w", encoding="utf-8").write(new)
    return new != t


if __name__ == "__main__":
    if not apply_all():
        print("street evil: every inner page already has it")
