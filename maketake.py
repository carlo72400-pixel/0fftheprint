#!/usr/bin/env python3
"""THE TAKE on its own page: take/index.html, built from home.html (11/12, his call: "just 1 timeline", "merge").

The Take and The Roll are ONE members' timeline now, behind the door, called The Take. The street's door opens it.
The timeline's code (the feed, the composer, hearts and comments, report and block, the house news rows) lives in the
old home page, so this page IS the old home with everything but the timeline switched off, one folder down:

  - <base href="../"> so every address in it still means what it meant at the root
  - <html data-take>: assets/css/take.css hides the tabs, the hero, the sidebar and every other section, and puts a
    Street key top left
  - assets/js/take.js (loaded right after desk.js) makes the feed the members' one: roll_feed(60, all posts), which is
    every post a member may see, public ones and members-only ones, newest first. A post with a photo made here is
    members only, the way the Roll's own box posts; words alone still go up in the open (the database refuses a
    members-only post with no photo). A stranger gets the Roll's door card and nothing else.

Nothing here is new SQL. home.html itself is untouched and keeps working as it did.

    /usr/bin/python3 maketake.py        (stamp.py runs it first, so the page always follows home.html)
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))


def _sub(s, a, b, what, n=1):
    assert s.count(a) == n, f"maketake: {what}: wanted {n}, found {s.count(a)} (home.html changed shape)"
    return s.replace(a, b)


def build(quiet=False):
    s = io.open(os.path.join(ROOT, "home.html"), encoding="utf-8").read()
    s = _sub(s, '<html lang="en" class="cath">', '<html lang="en" class="cath" data-take>', "the html tag")
    s = _sub(s, '<head>\n<meta charset="UTF-8">\n',
             '<head>\n<meta charset="UTF-8">\n<base href="../">\n<!-- BUILT by maketake.py from home.html: never edit this file, edit home.html and run stamp.py -->\n', "the head")
    s, n = re.subn(r"<title>.*?</title>", "<title>The Take · 0FF THE PRINT</title>", s, count=1, flags=re.S)
    assert n == 1, "maketake: the title"
    assert '<meta name="robots" content="noindex">' in s, "maketake: home.html lost its noindex"
    s = _sub(s, '<meta property="og:url" content="https://0fftheprint.com/">', '<meta property="og:url" content="https://0fftheprint.com/take/">', "og:url")
    s = _sub(s, '<link rel="canonical" href="https://0fftheprint.com/">', '<link rel="canonical" href="https://0fftheprint.com/take/">', "the canonical")
    s, n = re.subn(r'(<script src="assets/js/desk\.js[^"]*" defer></script>\n)', r'\1<script src="assets/js/take.js" defer></script>\n', s)
    assert n == 1, f"maketake: the desk.js tag ({n})"
    s = _sub(s, "</head>", '<link rel="stylesheet" href="assets/css/take.css">\n</head>', "the end of the head")
    s, n = re.subn(r"(<body[^>]*>\n)", r'\1<a class="take-street" href="./" aria-label="Back to the street"><span aria-hidden="true">&lsaquo;</span> Street</a>\n', s, count=1)
    assert n == 1, "maketake: the body tag"
    s = _sub(s, '<div class="sub">out in the open &nbsp;·&nbsp; art, thoughts, whatever</div>',
             '<div class="sub">members only &nbsp;·&nbsp; posts and photos, one timeline</div>', "the timeline's line")
    s = s.replace("join/?next=home", "join/?next=take")
    out = os.path.join(ROOT, "take", "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    old = io.open(out, encoding="utf-8").read() if os.path.exists(out) else None
    if old is not None:
        # keep the stamps the page already carries, so building it again right after stamp.py changes nothing
        try:
            import stamp
            s = stamp.stamp_text(s)
        except Exception as e:      # stamp.py runs right after this anyway
            print(f"  take/: not stamped here ({e})")
    else:
        import stamp
        s = stamp.stamp_text(s)
    if s != old:
        io.open(out, "w", encoding="utf-8").write(s)
        if not quiet:
            print("  built: take/index.html (from home.html)")
    return s != old


if __name__ == "__main__":
    if not build():
        print("take/index.html is up to date")
