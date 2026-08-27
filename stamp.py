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
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent

# script path (relative to ROOT)  ->  how it appears in src="..."
TRACKED = ["assets/js/desk.js", "assets/js/door.js", "assets/js/composer.js",
           "assets/js/edit.js", "assets/js/board.js",
           "assets/js/word.js", "supabase-config.js"]

# every document that loads them
DOCS = ["index.html", "join/index.html", "compose/index.html", "desk/index.html",
        "board/index.html",
        "desk/targets/index.html", "desk/goals/index.html",
        # Any page that loads desk.js belongs here. A page left off this list
        # silently serves whatever desk.js the browser cached, which is exactly
        # the bug this script exists to prevent.
        "card/index.html", "desk/word/index.html", "reset/index.html",
        "word/new/index.html", "word/live/index.html", "my/index.html"] + [
        # every story page carries desk.js + word.js
        str(p.relative_to(ROOT)) for p in sorted(ROOT.glob("word/*/index.html"))]


def short_hash(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def main() -> int:
    stamps = {}
    for rel in TRACKED:
        f = ROOT / rel
        if not f.exists():
            print(f"  skip (missing): {rel}")
            continue
        stamps[pathlib.PurePosixPath(rel).name] = short_hash(f)

    if not stamps:
        print("nothing to stamp")
        return 1

    changed = 0
    for doc in DOCS:
        d = ROOT / doc
        if not d.exists():
            continue
        text = original = d.read_text(encoding="utf-8")
        for name, h in stamps.items():
            # src="../assets/js/desk.js"  or  src="assets/js/desk.js?v=old"
            text = re.sub(
                r'(src="(?:\.\./)*(?:assets/js/)?%s)(?:\?v=[^"]*)?"' % re.escape(name),
                r'\1?v=%s"' % h,
                text,
            )
        if text != original:
            d.write_text(text, encoding="utf-8")
            changed += 1
            print(f"  stamped: {doc}")

    for name, h in stamps.items():
        print(f"  {name} -> ?v={h}")
    print(f"{changed} document(s) updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
