#!/usr/bin/env python3
"""upload_release.py <stage_dir> <tag> <repo> [title]
Parallel release upload (5 workers, one file each) in rounds until every staged file is on
the release AT THE STAGED SIZE (a 500 can leave a broken asset behind under the right
name, so a name match is not enough). Exit 0 only when all present and sized.

⛔ A RELEASE STOPS AT ABOUT 1000 ASSETS. The Odd Ball (255 frames x 4 looks x 2 sizes = 2040)
stalled at 995 + 6 half-made ones, and the old loop kept re-sending the other 1045 for eight
rounds until the hourly API quota was gone. So: over 1000 staged files is refused here (run
release_split.py first), a round that adds nothing stops the run and prints the error, and
every file costs ONE API call (a direct POST; `gh release upload` spent 2 or more per batch)."""
import json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

LIMIT = 1000
stage, tag, repo = sys.argv[1:4]
title = sys.argv[4] if len(sys.argv) > 4 else tag

def gh(*a, check=True):
    r = subprocess.run(["gh", *a], capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit(f"gh {' '.join(a[:3])} failed: {r.stderr.strip()}")
    return r

files = sorted(f for f in os.listdir(stage) if not f.startswith("."))
if len(files) > LIMIT:
    raise SystemExit(f"{len(files)} staged files, a release takes {LIMIT}: run release_split.py first")
size = {f: os.path.getsize(os.path.join(stage, f)) for f in files}

if gh("release", "view", tag, "--repo", repo, check=False).returncode:
    gh("release", "create", tag, "--repo", repo, "--title", title,
       "--notes", "Full quality assets for this dump. The gallery links here.")
rid = gh("api", f"repos/{repo}/releases/tags/{tag}", "--jq", ".id").stdout.strip()
token = gh("auth", "token").stdout.strip()
HEAD = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"}

def listing():
    out = gh("api", "--paginate", f"repos/{repo}/releases/{rid}/assets?per_page=100",
             "--jq", '.[] | [.name, .size, .state, .id] | @tsv').stdout
    d = {}
    for line in out.splitlines():
        n, s, st, i = line.split("\t"); d[n] = (int(s), st, i)
    return d

def call(req):
    """(status, reply). A spent quota waits for its reset instead of failing the file."""
    while True:
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return r.status, ""
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            if e.code in (403, 429) and "rate limit" in body.lower():
                wait = max(int(e.headers.get("x-ratelimit-reset") or 0) - int(time.time()), 60) + 5
                print(f"  rate limit, waiting {wait}s", flush=True)
                time.sleep(wait)
                continue
            return e.code, body
        except Exception as e:
            return 0, str(e)

def up(f):
    q = urllib.parse.quote(f)
    with open(os.path.join(stage, f), "rb") as fh:
        data = fh.read()
    req = urllib.request.Request(f"https://uploads.github.com/repos/{repo}/releases/{rid}/assets?name={q}", data=data,
                                 method="POST", headers={**HEAD, "Content-Type": "application/octet-stream"})
    code, body = call(req)
    return None if code in (200, 201) else f"{f}: {code} {body}"

best = -1
for rnd in range(1, 10):
    have = listing()
    done = [f for f in files if have.get(f, (None, None))[0] == size[f] and have[f][1] == "uploaded"]
    todo = [f for f in files if f not in set(done)]
    print(f"round {rnd}: {len(todo)} of {len(files)} to upload", flush=True)
    if not todo:
        break
    if len(done) <= best:
        print(f"no progress since the last round, stopping. Last errors: {errs[:3]}")
        break
    best = len(done)
    for f in todo:                       # a half-made asset holds the name and blocks the new one
        if f in have:
            call(urllib.request.Request(f"https://api.github.com/repos/{repo}/releases/assets/{have[f][2]}", method="DELETE", headers=HEAD))
    with ThreadPoolExecutor(5) as ex:
        errs = [e for e in ex.map(up, todo) if e]
have = listing()
ok = [f for f in files if have.get(f, (None, None))[0] == size[f] and have[f][1] == "uploaded"]
print(f"release {tag}: {len(ok)} of {len(files)} staged files present at the staged size")
sys.exit(0 if len(ok) == len(files) else 1)
