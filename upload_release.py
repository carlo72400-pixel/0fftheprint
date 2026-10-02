#!/usr/bin/env python3
"""upload_release.py <stage_dir> <tag> <repo> [title]
Parallel release upload (5 workers x 3 files) in rounds until every staged file is on
the release AT THE STAGED SIZE (a 500 can leave a broken asset behind under the right
name, so a name match is not enough). Exit 0 only when all present and sized."""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

stage, tag, repo = sys.argv[1:4]
title = sys.argv[4] if len(sys.argv) > 4 else tag

def gh(*a, check=True):
    r = subprocess.run(["gh", *a], capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit(f"gh {' '.join(a[:3])} failed: {r.stderr.strip()}")
    return r

if gh("release", "view", tag, "--repo", repo, check=False).returncode:
    gh("release", "create", tag, "--repo", repo, "--title", title,
       "--notes", "Full quality assets for this dump. The gallery links here.")
rid = gh("api", f"repos/{repo}/releases/tags/{tag}", "--jq", ".id").stdout.strip()

def listing():
    out = gh("api", "--paginate", f"repos/{repo}/releases/{rid}/assets?per_page=100",
             "--jq", '.[] | [.name, .size, .state] | @tsv').stdout
    d = {}
    for line in out.splitlines():
        n, s, st = line.split("\t"); d[n] = (int(s), st)
    return d

files = sorted(f for f in os.listdir(stage) if not f.startswith("."))
size = {f: os.path.getsize(os.path.join(stage, f)) for f in files}

def up(batch):
    return gh("release", "upload", tag, "--repo", repo, "--clobber",
              *[os.path.join(stage, f) for f in batch], check=False).returncode

for rnd in range(1, 10):
    have = listing()
    todo = [f for f in files if have.get(f, (None, None))[0] != size[f] or have[f][1] != "uploaded"]
    print(f"round {rnd}: {len(todo)} of {len(files)} to upload", flush=True)
    if not todo:
        break
    batches = [todo[i:i + 3] for i in range(0, len(todo), 3)]
    with ThreadPoolExecutor(5) as ex:
        list(ex.map(up, batches))
have = listing()
ok = [f for f in files if have.get(f, (None, None))[0] == size[f] and have[f][1] == "uploaded"]
print(f"release {tag}: {len(ok)} of {len(files)} staged files present at the staged size")
sys.exit(0 if len(ok) == len(files) else 1)
