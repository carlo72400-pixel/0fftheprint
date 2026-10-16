#!/bin/zsh
# Live check for the Oct 16 push (XBONGX, One Bee Presents, Sept 26, shipped as the first MINI PACK). Usage: verify_live_1016.sh <site-commit-sha>
# Read the JSON and curl every URL: a lazy <img> never reports a 404 to the DOM (the 8/23 trap).
export PATH=/opt/homebrew/bin:$PATH
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl1016.$$; S=2026-09-26-xbongx
for i in $(seq 1 90); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; sleep 0.8; }
echo "== $S"
chk "$B/events/$S/?cb=$SHA" '"mini": true'
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
chk "$B/events/events.json?cb=$SHA" '"mini": true'
chk "$B/events/?cb=$SHA" "Find yours"
chk "$B/content/work.json?cb=$SHA" "w8-xb-"
# a mini pack is not a night: it stays off the homepage contact sheet
code=$(curl -s -o $T -w "%{http_code}" "$B/content/frames.json?cb=$SHA"); if [ "$code" = 200 ] && ! grep -q "$S" $T; then echo "  PASS $code frames.json leaves the mini off"; else echo "  FAIL $code frames.json (the mini must not be on the sheet)"; fail=1; fi; sleep 0.8
chk "$B/assets/js/sealed.js?cb=$SHA" "var MINI = !!N.mini"
chk "$B/assets/css/pack.css?cb=$SHA" ".pp.mini"
chk "$B/assets/js/cathedral.js?cb=$SHA" "!e.mini"
W=$(/usr/bin/python3 -c "import json;print(next(i['src'] for i in json.load(open('$(dirname $0)/content/work.json'))['items'] if 'w8-xb-' in i['src']).split('/')[-1][:-4])")
chk "$B/assets/work/$W.jpg"; chk "$B/assets/grid/work/$W.jpg"
chk "$B/work/?cb=$SHA" "The Work"
chk "$B/press/?cb=$SHA" "nineteen"
chk "$B/?cb=$SHA" "night-pick"
[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"; rm -f $T; exit $fail
