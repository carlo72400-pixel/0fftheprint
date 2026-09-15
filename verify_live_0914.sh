#!/bin/zsh
# Live check for the 9/14 push: four galleries, five stories, four NIGHTS blocks, the work rail.
# Usage: verify_live_0914.sh <site-commit-sha>
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl0914.$$
for i in $(seq 1 60); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; sleep 0.7; }
head_ok() { c=$(curl -sIL -o /dev/null -w "%{http_code}" "$1"); [ "$c" = 200 ] && echo "  PASS $c $1" || { echo "  FAIL $c $1"; fail=1; }; sleep 0.7; }
for S in 2026-09-01-billy-release-party 2026-09-12-lucha-night 2026-09-12-migx 2026-09-13-burlesque-night; do
  echo "== $S"
  chk "$B/events/$S/?cb=$SHA" "lblooks"
  chk "$B/events/$S/data.json?cb=$SHA" '"looks"'
  /usr/bin/python3 - $T $S <<'EOF' || fail=1
import json,sys,subprocess,time
d=json.load(open(sys.argv[1])); m=d['media']; ph=[x for x in m if x['type']=='photo']; vd=[x for x in m if x['type']=='video']
print(f"     {len(ph)} photos, {len(vd)} clips, looks {d.get('looks')}, count {d['count']}")
bad=0
# one lightbox url + one full url per look on the first photo, and the first clip in every look
probes=[v['src'] for v in ph[0].get('looks',[{'src':ph[0]['src']}])]+[v['full'] for v in ph[0].get('looks',[]) if v.get('full')]
if vd: probes+=[v['src'] for v in vd[0].get('looks',[{'src':vd[0]['src']}])]
for u in probes:
    c=subprocess.run(['curl','-sIL','-o','/dev/null','-w','%{http_code}',u],capture_output=True,text=True).stdout.strip()
    print(f"     {'PASS' if c=='200' else 'FAIL'} {c} {u[-60:]}"); bad+= c!='200'; time.sleep(0.7)
sys.exit(1 if bad else 0)
EOF
  chk "$B/events/$S/preview.jpg"
  chk "$B/events/$S/media/001_t.jpg"
done
echo "== index + stories + portfolio + work"
chk "$B/events/events.json?cb=$SHA" "2026-09-13-burlesque-night"
chk "$B/content/desk.json?cb=$SHA" "0TP-022"
for W in the-afterparty-is-the-san-antonio-date the-night-before-b-i-l-l-y every-room-a-different-colour bull-madrid-then-everyone-in-black red-on-red-on-red; do
  chk "$B/word/$W/?cb=$SHA" "data-stamp"; chk "$B/word/$W/thumb.jpg"; done
chk "$B/word/the-afterparty-is-the-san-antonio-date/?cb=$SHA" "CC BY-SA 4.0"
chk "$B/portfolio/?cb=$SHA" "<!-- BURLESQUE -->"
chk "$B/portfolio/?cb=$SHA" "<!-- LUCHA -->"
chk "$B/portfolio/assets/mikedimes/md_02.jpg"
chk "$B/portfolio/assets/lucha/lu_01.jpg"
chk "$B/portfolio/assets/migx/mx_03.jpg"
chk "$B/portfolio/assets/burlesque/bq_02.jpg"
chk "$B/content/work.json?cb=$SHA" "w4-md-337"
chk "$B/assets/grid/work/w4-md-337.jpg"
chk "$B/press/?cb=$SHA" "Sixteen published"
chk "$B/video/?cb=$SHA" "2026-09-13-burlesque-night"
rm -f $T
[ $fail = 0 ] && echo "LIVE: ALL PASS" || echo "LIVE: FAILURES ABOVE"
