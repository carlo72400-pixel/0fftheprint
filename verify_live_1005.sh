#!/bin/zsh
# Live check for the Oct 5 push (PULSE ANGELS 3 + the three story collages). Usage: verify_live_1005.sh <site-commit-sha>
# Read the JSON and curl every URL: a lazy <img> never reports a 404 to the DOM (the 8/23 trap).
export PATH=/opt/homebrew/bin:$PATH
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl1005.$$; S=2026-10-03-pulse-angels-3
for i in $(seq 1 90); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; sleep 0.8; }
echo "== $S"
chk "$B/events/$S/?cb=$SHA" "PULSE ANGELS 3"
chk "$B/events/$S/data.json?cb=$SHA" '"media"'
/usr/bin/python3 - $T <<'PY' || fail=1
import json,sys,subprocess,time
d=json.load(open(sys.argv[1])); ph=[x for x in d['media'] if x['type']=='photo']
print(f"     {len(ph)} photos, looks {d.get('looks')}, count {d['count']}")
bad=0; probes=[]
for p in ph:                       # EVERY frame, web size and full size: one night, so check them all
    probes.append(p['src'])
    if p.get('full'): probes.append(p['full'])
for u in probes:
    c=subprocess.run(['curl','-sIL','-o','/dev/null','-w','%{http_code}',u],capture_output=True,text=True).stdout.strip()
    if c!='200': print(f"     FAIL {c} {u[-60:]}"); bad+=1
    time.sleep(0.25)
print(f"     {len(probes)-bad} of {len(probes)} release files answer 200")
sys.exit(1 if bad else 0)
PY
chk "$B/events/$S/preview.jpg"
chk "$B/events/$S/pack.webp"
chk "$B/events/$S/media/001_t.jpg"
echo "== index + work + press"
chk "$B/events/events.json?cb=$SHA" "$S"
chk "$B/events/?cb=$SHA" "Find yours"
chk "$B/content/work.json?cb=$SHA" "w7-pa-story-3"
chk "$B/content/site.json?cb=$SHA" "21st Street Co-op"
for f in w7-pa-073 w7-pa-story-1 w7-pa-story-2 w7-pa-story-3; do chk "$B/assets/work/$f.jpg"; chk "$B/assets/grid/work/$f.jpg"; done
chk "$B/work/?cb=$SHA" "The Work"
chk "$B/press/?cb=$SHA" "nineteen published"
chk "$B/?cb=$SHA" "work-grid"
[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"; rm -f $T; exit $fail
