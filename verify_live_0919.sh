#!/bin/zsh
# Live check for the Sept 17-19 push (bar hop, Third Friday, BAPTISM). Usage: verify_live_0919.sh <site-commit-sha>
# Read the JSON and curl every URL: a lazy <img> never reports a 404 to the DOM (the 8/23 trap).
export PATH=/opt/homebrew/bin:$PATH
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl0919.$$
for i in $(seq 1 90); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; sleep 0.8; }
for S in 2026-09-17-bar-hop 2026-09-18-zen-haus 2026-09-18-baptism; do
  echo "== $S"
  chk "$B/events/$S/?cb=$SHA" "lb-looks"
  chk "$B/events/$S/data.json?cb=$SHA" '"looks"'
  /usr/bin/python3 - $T <<'PY' || fail=1
import json,sys,subprocess,time,random
d=json.load(open(sys.argv[1])); ph=[x for x in d['media'] if x['type']=='photo']
print(f"     {len(ph)} photos, looks {d.get('looks')}, count {d['count']}")
random.seed(19); bad=0; picks=[ph[0],ph[len(ph)//2],ph[-1]]+random.sample(ph,4); probes=[]
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
chk "$B/events/events.json?cb=$SHA" "2026-09-18-baptism"
chk "$B/events/?cb=$SHA" "Find yours"
chk "$B/word/silver-blood-and-lapis/?cb=$SHA" "0TP-025"
chk "$B/word/the-trees-came-out-crimson/?cb=$SHA" "0TP-024"
chk "$B/word/the-room-was-dead-so-we-left/?cb=$SHA" "0TP-023"
chk "$B/content/desk.json?cb=$SHA" "Silver, Blood and Lapis"
chk "$B/content/site.json?cb=$SHA" "The Deco"
chk "$B/content/work.json?cb=$SHA" "w5-bap-259"
chk "$B/assets/grid/work/w5-bap-259.jpg"
chk "$B/assets/grid/work/w5-zen-069.jpg"
chk "$B/assets/grid/work/w5-bh-041.jpg"
chk "$B/portfolio/?cb=$SHA" "BAPTISM"
chk "$B/portfolio/assets/baptism/bap_01.jpg"
chk "$B/portfolio/assets/zenhaus2/zh2_01.jpg"
chk "$B/portfolio/assets/barhop/bh_01.jpg"
chk "$B/press/?cb=$SHA" "fifteen published"
[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"; rm -f $T; exit $fail
