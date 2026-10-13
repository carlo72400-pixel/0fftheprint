#!/usr/bin/env python3
"""Cache-stamp the shared scripts by CONTENT, not by a hand-typed date.

Run this after touching assets/js/desk.js, assets/js/door.js or
supabase-config.js, before you commit:

    /usr/bin/python3 stamp.py

Why it exists: a hand-typed ?v=20260820 stamp got applied to desk.js and THEN
desk.js was rewritten. Same URL, different content, so every browser that had
already loaded the page kept serving the stale file out of cache and the new
methods simply did not exist. A date you have to remember to bump is a date you
forget to bump. The hash cannot drift from the file it names.

10/4: binder.js + binder.css (the binder, the house bar) ride on the homepage, /events/
and every night page, next to sealed.js. Same rule: stamp after touching either.

10/3: the shared STYLESHEETS are stamped too (TRACKED_CSS, href="...css?v=").
sealed.js and calendar.js now build markup that only the new sealed.css /
calendar.css know how to lay out, so a fresh script next to a cached sheet is a
broken pack for as long as the cache lives. Same cure, same hash.

10/11: auth.css joins TRACKED_CSS (19 pages load it and it was never stamped),
and wall/index.html joins DOCS. wall_build.py copies the homepage's desk.js and
supabase-config.js stamps only when the Crypt is rebuilt, so a desk.js edit
stamped here left the Crypt on the old file until the next weekly build.
stamp_text() is the same rewrite for ONE page's text: repage.py, newevent.py
and videos.py run their output through it, because their templates carry bare
src="...js" tags and every page they rebuilt used to lose its stamps.

10/13 (Wave 2): board-members.js + board-members.css join the tracked files
(the board's MEMBERS tab). And THE PIN: every supabase-js tag is pinned to one
exact release with SRI. The floating @2 let the CDN swap the library under the
site with no commit (it was serving 2.117.3 while the pages were written for
2.117.2). pin_text() turns a floating @2 tag, or a 2.117.2 tag with no
integrity, into the one canonical tag; stamp_text() runs it, so every page
repage.py, newevent.py and videos.py write is pinned too. A tag pinned to some
OTHER version is left alone and named, so a later bump is never undone here.
The same URL and hash live in newstory.py (SUPABASE_JS / SUPABASE_SRI),
assets/js/sealed.js (SB_JS / SB_SRI) and flyer-sweep/wall_build_w2.py
(auth_scripts); main() warns when one of those drifts. To move to a new
release, fetch the file ONCE and hash THAT copy:
    curl -s https://cdn.jsdelivr.net/npm/@supabase/supabase-js@<v>/dist/umd/supabase.js \\
      | openssl dgst -sha384 -binary | openssl base64 -A
then change PIN_VERSION and PIN_SRI here and in the three places above.
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent

# script path (relative to ROOT)  ->  how it appears in src="..."
TRACKED = ["assets/js/desk.js", "assets/js/door.js", "assets/js/composer.js",
           "assets/js/edit.js", "assets/js/board.js", "assets/js/cardback.js",
           "assets/js/dates.js", "assets/js/calendar.js", "assets/js/sealed.js",
           "assets/js/word.js", "assets/js/cathedral.js", "assets/js/binder.js",
           "assets/js/lounge.js", "assets/js/music.js", "assets/js/people.js", "assets/js/packs.js", "assets/js/photos.js",
           "assets/js/board-members.js", "supabase-config.js"]

# stylesheet path (relative to ROOT)  ->  how it appears in href="..."
TRACKED_CSS = ["assets/css/cathedral.css", "assets/css/pack.css",
               "assets/css/sealed.css", "assets/css/calendar.css",
               "assets/css/binder.css", "assets/css/lounge.css", "assets/css/music.css", "assets/css/people.css", "assets/css/packs.css", "assets/css/photos.css",
               "assets/css/auth.css", "assets/css/board-members.css"]

# THE PIN (10/13): one exact supabase-js release, with the sha384 of that exact file (fetched once from this URL)
PIN_VERSION = "2.117.2"
PIN_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@%s/dist/umd/supabase.js" % PIN_VERSION
PIN_SRI = "sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok"
# any jsDelivr supabase-js UMD tag; group 1 = every attribute, group 2 = the version in its src
SB_TAG = re.compile(r'<script\b([^>]*?\bsrc="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@([0-9.]+)'
                    r'/dist/umd/supabase\.js"[^>]*)>\s*</script>')
FLOATING = "supabase-js@" + "2/"   # split so a repo grep for the floating tag never finds this line
# the other places that carry the pin, and how each spells it (main() warns on drift)
PIN_TWINS = {"newstory.py": (PIN_URL, PIN_SRI), "assets/js/sealed.js": (PIN_URL, PIN_SRI)}

# every document that loads them
DOCS = ["index.html", "join/index.html", "compose/index.html", "desk/index.html", "packs/index.html",
        "board/index.html", "c/index.html", "dates/index.html", "events/index.html",
        "desk/goals/index.html",
        # Any page that loads desk.js belongs here. A page left off this list
        # silently serves whatever desk.js the browser cached, which is exactly
        # the bug this script exists to prevent.
        "card/index.html", "desk/word/index.html", "reset/index.html",
        "word/new/index.html", "word/live/index.html", "my/index.html",
        # 10/4: these carry binder.js (the house bar and the binder chip)
        "word/index.html", "video/index.html", "work/index.html",
        # 10/11: the Crypt loads desk.js + supabase-config.js. wall_build.py
        # copies the homepage's stamps at build time; this keeps it current
        # between builds. Only its two script tags match, the sealed payload
        # is ciphertext and never does.
        "wall/index.html"] + [
        # every story page carries desk.js + word.js
        str(p.relative_to(ROOT)) for p in sorted(ROOT.glob("word/*/index.html"))] + [
        # every baked card back carries desk.js + cardback.js. bake.py copies
        # these out of c/index.html, so a re-bake picks the new stamp up on its
        # own, but stamping WITHOUT re-baking would leave six pages serving a
        # cached script that no longer has the methods they call.
        str(p.relative_to(ROOT)) for p in sorted(ROOT.glob("c/*/index.html"))] + [
        # every night dump carries sealed.js. newevent.py writes the tag into
        # new ones; this keeps the ones already up on the current file.
        str(p.relative_to(ROOT)) for p in sorted(ROOT.glob("events/*/index.html"))]


def short_hash(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def current(quiet=False):
    """(script stamps, stylesheet stamps) by file name, off the files as they are now."""
    stamps = {}
    for rel in TRACKED:
        f = ROOT / rel
        if not f.exists():
            if not quiet:
                print(f"  skip (missing): {rel}")
            continue
        stamps[pathlib.PurePosixPath(rel).name] = short_hash(f)

    css = {}
    for rel in TRACKED_CSS:
        f = ROOT / rel
        if not f.exists():
            if not quiet:
                print(f"  skip (missing): {rel}")
            continue
        css[pathlib.PurePosixPath(rel).name] = short_hash(f)
    return stamps, css


def pin_text(text, other=None):
    """THE PIN for one page's text: a floating @2 supabase-js tag, or a PIN_VERSION tag with no integrity, becomes
    <script src="PIN_URL" integrity="PIN_SRI" crossorigin="anonymous"[ defer|async]></script>. A tag on any other
    version is left as it is and its version is added to `other` (a list) when one is given."""
    def one(m):
        attrs, ver = m.group(1), m.group(2)
        if ver not in ("2", PIN_VERSION):
            if other is not None:
                other.append(ver)
            return m.group(0)
        tail = "".join(" " + a for a in ("defer", "async") if re.search(r'(?<![\w-])%s(?![\w=-])' % a, attrs))
        return '<script src="%s" integrity="%s" crossorigin="anonymous"%s></script>' % (PIN_URL, PIN_SRI, tail)
    return SB_TAG.sub(one, text)


def stamp_text(text, stamps=None, css=None):
    """Put the current ?v= on every tracked script and stylesheet tag in one page's text, and pin supabase-js."""
    text = pin_text(text)
    if stamps is None or css is None:
        stamps, css = current(quiet=True)
    for name, h in stamps.items():
        # src="../assets/js/desk.js"  or  src="assets/js/desk.js?v=old"
        text = re.sub(
            r'(src="(?:\.\./)*(?:assets/js/)?%s)(?:\?v=[^"]*)?"' % re.escape(name),
            r'\1?v=%s"' % h,
            text,
        )
    for name, h in css.items():
        # href="../../assets/css/sealed.css"  or  href="assets/css/sealed.css?v=old"
        text = re.sub(
            r'(href="(?:\.\./)*assets/css/%s)(?:\?v=[^"]*)?"' % re.escape(name),
            r'\1?v=%s"' % h,
            text,
        )
    return text


def main() -> int:
    stamps, css = current()

    if not stamps:
        print("nothing to stamp")
        return 1

    changed = pinned = 0
    other, left = [], []
    for doc in DOCS:
        d = ROOT / doc
        if not d.exists():
            continue
        text = original = d.read_text(encoding="utf-8")
        mine = []
        if pin_text(original, mine) != original:
            pinned += 1
        other += ["%s (@%s)" % (doc, v) for v in mine]
        text = stamp_text(text, stamps, css)
        if text != original:
            d.write_text(text, encoding="utf-8")
            changed += 1
            print(f"  stamped: {doc}")
        if FLOATING in text:
            left.append(doc)

    for name, h in {**stamps, **css}.items():
        print(f"  {name} -> ?v={h}")
    print(f"{changed} document(s) updated, {pinned} of them with supabase-js pinned to @{PIN_VERSION} + SRI")
    # ⛔ the floating @2 must never be left anywhere
    for doc in left:
        print(f"  ⛔ STILL FLOATING (a floating @2 supabase-js reference this script could not rewrite): {doc}")
    for o in other:
        print(f"  NOTE: supabase-js pinned to another version, left alone: {o}")
    for rel, (url, sri) in PIN_TWINS.items():
        f = ROOT / rel
        if f.exists() and not (url in f.read_text(encoding="utf-8") and sri in f.read_text(encoding="utf-8")):
            print(f"  ⛔ PIN DRIFT: {rel} does not carry {PIN_URL} with {PIN_SRI}")
    sw = ROOT / "wall" / "sw.js"
    if sw.exists() and FLOATING in sw.read_text(encoding="utf-8"):
        print("  NOTE: wall/sw.js still precaches the floating supabase-js@2 (a build file, never hand-edited here). "
              "The next Crypt build with flyer-sweep/wall_build_w2.py pins it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
