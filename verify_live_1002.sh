#!/bin/zsh
# Live check for the Oct 2 push (Chill & Smoke, HARAMBE 4 EVER, WAP). Usage: verify_live_1002.sh <site-commit-sha>
# Read the JSON and curl every URL: a lazy <img> never reports a 404 to the DOM (the 8/23 trap).
export PATH=/opt/homebrew/bin:$PATH
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl1002.$$
for i in $(seq 1 90); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; sleep 0.8; }
for S in 2026-09-20-chill-and-smoke 2026-09-24-harambe-4-ever 2026-09-25-wap; do
  echo "== $S"
  chk "$B/events/$S/?cb=$SHA" "lb-looks"
  chk "$B/events/$S/data.json?cb=$SHA" '"looks"'
  /usr/bin/python3 - $T <<'PY' || fail=1
import json,sys,subprocess,time,random
d=json.load(open(sys.argv[1])); ph=[x for x in d['media'] if x['type']=='photo']
print(f"     {len(ph)} photos, looks {d.get('looks')}, count {d['count']}")
random.seed(1002); bad=0; picks=[ph[0],ph[len(ph)//2],ph[-1]]+random.sample(ph,4); probes=[]
for p in picks:
    for v in p.get('looks',[{'src':p['src'],'full':p.get('full')}]):
        probes.append(v['src'])
        if v.get('full'): probes.append(v['full'])
for u in probes:
    c=subprocess.run(['curl','-sIL','-o','/dev/null','-w','%{http_code}',u],capture_output=True,text=True).stdout.strip()
    print(f"     {'PASS' if c=='200' else 'FAIL'} {c} {u[-54:]}"); bad+= c!='200'; time.sleep(0.4)
sys.exit(1 if bad else 0)
PY
  chk "$B/events/$S/preview.jpg"
  chk "$B/events/$S/media/001_t.jpg"
done
echo "== index + word + portfolio"
chk "$B/events/events.json?cb=$SHA" "2026-09-25-wap"
chk "$B/events/?cb=$SHA" "Find yours"
chk "$B/word/four-prints-of-a-wet-night/?cb=$SHA" "0TP-028"
chk "$B/word/four-bands-and-one-red-light/?cb=$SHA" "0TP-027"
chk "$B/word/emerald-cream-and-takeout-red/?cb=$SHA" "0TP-026"
chk "$B/word/four-prints-of-a-wet-night/cover.jpg"
chk "$B/word/four-bands-and-one-red-light/thumb.jpg"
chk "$B/word/emerald-cream-and-takeout-red/thumb.jpg"
chk "$B/content/desk.json?cb=$SHA" "Four Prints of a Wet Night"
chk "$B/content/site.json?cb=$SHA" "Private Park"
chk "$B/content/work.json?cb=$SHA" "w6-wap-094"
chk "$B/assets/grid/work/w6-wap-094.jpg"
chk "$B/assets/grid/work/w6-har-109.jpg"
chk "$B/assets/grid/work/w6-cs-454.jpg"
chk "$B/?cb=$SHA" "PRIVATE PARK"
chk "$B/portfolio/?cb=$SHA" "<!-- WAP -->"
chk "$B/portfolio/assets/chillsmoke/cs_01.jpg"
chk "$B/portfolio/assets/harambe/har_01.jpg"
chk "$B/portfolio/assets/wap/wap_08.jpg"
chk "$B/press/?cb=$SHA" "eighteen published"
[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"; rm -f $T; exit $fail
