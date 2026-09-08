#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — issue assembler.

    /usr/bin/python3 issue.py open 01 --title "ISSUE 01" --date 2026-09-30 \
        --line "Six people, and the hour after." --departments seen,story,hourafter
    /usr/bin/python3 issue.py add 01 0TP-018 0TP-019
    /usr/bin/python3 issue.py remove 01 0TP-019
    /usr/bin/python3 issue.py status 01
    /usr/bin/python3 issue.py close 01

⛔ ONE COMMAND WRITES BOTH HALVES. `running_order` lives on the issue and
   `issue` lives on the desk item, and they are written in the same run so they
   cannot disagree. Nothing else may write either field.

⛔ running_order STORES 0TP NUMBERS, NEVER SLUGS. The number is the identity The
   Catalog already merges on, and a slug changes the moment a title changes.
   It is an explicit list and never a computed range, because the number line has
   holes: desk.json holds 006-011 and 013 onward, 012 was pulled.

`close` exists for its refusals. It will not close an issue that points at a
number with no story, that misses a story claiming to be in it, or that lists a
department with nothing in it.
"""
import argparse, json, os, sys
from datetime import date

ROOT = os.path.dirname(os.path.abspath(__file__))
DESK = os.path.join(ROOT, "content", "desk.json")
ISSUES = os.path.join(ROOT, "content", "issues.json")


def load(path, default):
    if not os.path.exists(path):
        return json.loads(json.dumps(default))
    with open(path) as f:
        return json.load(f)


def save(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def by_num(desk):
    return {x["num"]: x for x in desk["items"] if x.get("num")}


def find(issues, iid):
    return next((i for i in issues["items"] if i["id"] == iid), None)


def validate(iss, desk):
    """Every reason an issue is not ready. Returns a list of strings."""
    errs = []
    nums = by_num(desk)
    for n in iss["running_order"]:
        if n not in nums:
            errs.append(f"{n} is in the running order but there is no story with that number")
    claimed = [x["num"] for x in desk["items"] if x.get("issue") == iss["id"]]
    for n in claimed:
        if n not in iss["running_order"]:
            errs.append(f"{n} says it is in issue {iss['id']} but is not in the running order")
    present = {nums[n].get("dept", "story") for n in iss["running_order"] if n in nums}
    for d in iss.get("departments", []):
        if d not in present:
            errs.append(f"department {d!r} is listed on the issue but has nothing in it")
    if not iss["running_order"]:
        errs.append("the running order is empty")
    return errs


def cmd_open(a, issues, desk):
    if find(issues, a.id):
        sys.exit(f"issue {a.id} already exists. Use add / remove / status.")
    issues["items"].append({
        "id": a.id,
        "title": a.title or f"ISSUE {a.id}",
        "line": a.line or "",
        "date": a.date,
        "date_short": date.fromisoformat(a.date).strftime("%m.%d.%y"),
        "status": "assembling",
        "cover": "",
        "departments": [d.strip() for d in a.departments.split(",")] if a.departments else [],
        "running_order": [],
    })
    issues["items"].sort(key=lambda i: i["id"], reverse=True)
    save(ISSUES, issues)
    print(f"  issue {a.id} open, status assembling")


def cmd_add(a, issues, desk):
    iss = find(issues, a.id) or sys.exit(f"no issue {a.id}. Open it first.")
    nums = by_num(desk)
    for n in a.nums:
        if n not in nums:
            sys.exit(f"{n} is not in content/desk.json. Nothing to add.")
        other = nums[n].get("issue")
        if other and other != a.id:
            sys.exit(f"{n} is already in issue {other}. Remove it from there first.")
        if n not in iss["running_order"]:
            iss["running_order"].append(n)
        nums[n]["issue"] = a.id
    save(ISSUES, issues)
    save(DESK, desk)
    print(f"  issue {a.id} running order: {' '.join(iss['running_order'])}")


def cmd_remove(a, issues, desk):
    iss = find(issues, a.id) or sys.exit(f"no issue {a.id}")
    nums = by_num(desk)
    for n in a.nums:
        if n in iss["running_order"]:
            iss["running_order"].remove(n)
        if n in nums and nums[n].get("issue") == a.id:
            nums[n].pop("issue", None)
    save(ISSUES, issues)
    save(DESK, desk)
    print(f"  issue {a.id} running order: {' '.join(iss['running_order']) or '(empty)'}")


def cmd_status(a, issues, desk):
    iss = find(issues, a.id) or sys.exit(f"no issue {a.id}")
    nums = by_num(desk)
    print(f"  {iss['title']} · {iss['status']} · {iss['date_short']}")
    if iss.get("departments"):
        print(f"  departments: {', '.join(iss['departments'])}")
    for n in iss["running_order"]:
        it = nums.get(n)
        if not it:
            print(f"    {n}  ⛔ MISSING from desk.json")
        else:
            print(f"    {n}  {(it.get('dept') or 'story').upper():<10} {it['title']}")
    errs = validate(iss, desk)
    print("  ready to close" if not errs else f"  {len(errs)} thing(s) in the way:")
    for e in errs:
        print(f"    · {e}")


def cmd_close(a, issues, desk):
    iss = find(issues, a.id) or sys.exit(f"no issue {a.id}")
    errs = validate(iss, desk)
    if errs:
        print(f"  REFUSED, issue {a.id} is not ready:")
        for e in errs:
            print(f"    · {e}")
        sys.exit(1)
    iss["status"] = "out"
    save(ISSUES, issues)
    print(f"  {iss['title']} is OUT, {len(iss['running_order'])} pieces")
    print("  git add -A && git commit -m 'issue: " + a.id + " out' && git push")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("open"); o.add_argument("id")
    o.add_argument("--title"); o.add_argument("--line")
    o.add_argument("--date", default=date.today().isoformat())
    o.add_argument("--departments", help="comma separated, in magazine section order")
    for name in ("add", "remove"):
        s = sub.add_parser(name); s.add_argument("id"); s.add_argument("nums", nargs="+")
    for name in ("status", "close"):
        s = sub.add_parser(name); s.add_argument("id")
    a = ap.parse_args()

    issues = load(ISSUES, {"items": []})
    desk = load(DESK, {"items": []})
    {"open": cmd_open, "add": cmd_add, "remove": cmd_remove,
     "status": cmd_status, "close": cmd_close}[a.cmd](a, issues, desk)


if __name__ == "__main__":
    main()
