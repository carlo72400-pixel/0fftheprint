#!/bin/zsh
# Live check for the Oct 18 push (FILL-A-BAG, Thrift @ The Warehouse, Oct 17: a full night with its three edits, and the story
# 0TP-039 "Fifteen Dollars And Whatever Fits"). Usage: verify_live_1018.sh <site-commit-sha>
# Read the JSON and curl every URL: a lazy <img> never reports a 404 to the DOM (the 8/23 trap).
export PATH=/opt/homebrew/bin:$PATH
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl1018.$$; S=2026-10-17-fill-a-bag; W=word/fifteen-dollars-and-whatever-fits
for i in $(seq 1 90); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; sleep 0.8; }
echo "== $S"
chk "$B/events/$S/?cb=$SHA" 'FILL-A-BAG'
chk "$B/events/$S/data.json?cb=$SHA" '"media"'
/usr/bin/python3 - $T <<'PY' || fail=1
import json,sys,subprocess,time
d=json.load(open(sys.argv[1])); ph=[x for x in d['media'] if x['type']=='photo']; vd=[x for x in d['media'] if x['type']=='video']
print(f"     {len(ph)} photos, {len(vd)} clips, looks {d.get('looks')}, count {d['count']}")
bad=0; probes=[]
for p in ph:                       # EVERY frame in EVERY look, web size and full size
    for v in (p.get('looks') or [p]):
        probes += [v['src'], v['full']]
for v in vd:
    probes += [v['full']] if v.get('full') else []
for u in probes:
    c=subprocess.run(['curl','-sIL','-o','/dev/null','-w','%{http_code}',u],capture_output=True,text=True).stdout.strip()
    if c!='200': print(f"     FAIL {c} {u[-60:]}"); bad+=1
    time.sleep(0.25)
print(f"     {len(probes)-bad} of {len(probes)} release files answer 200")
for v in vd:                       # the playable clip must come off the shard's Pages, typed video/mp4, with range support
    h=subprocess.run(['curl','-s','-r','0-1','-o','/dev/null','-D','-',v['src']],capture_output=True,text=True).stdout.lower()   # a GET: a HEAD with a range answers 200
    ok=(' 206' in h.splitlines()[0]) and 'content-type: video/mp4' in h
    print(f"     {'PASS' if ok else 'FAIL'} clip {v['src'].split('/')[-1]} {h.splitlines()[0].strip()}"); bad+=0 if ok else 1
sys.exit(1 if bad else 0)
PY
chk "$B/events/$S/preview.jpg"
chk "$B/events/$S/pack.webp"
chk "$B/events/$S/media/001_t.jpg"
for v in v01 v02 v03; do chk "$B/events/$S/media/${v}_t.jpg"; done
echo "== the story"
chk "$B/$W/?cb=$SHA" 'Spotted: a Dragon Ball Z tee'
for f in cover.jpg thumb.jpg pain.jpg welcomeback.jpg itemcall.jpg; do chk "$B/$W/$f"; done
chk "$B/content/desk.json?cb=$SHA" '0TP-039'
echo "== index, work, press, map, tape"
chk "$B/events/events.json?cb=$SHA" "$S"
chk "$B/events/?cb=$SHA" "Find yours"
chk "$B/content/frames.json?cb=$SHA" "$S"
chk "$B/content/work.json?cb=$SHA" "w9-tatw-"
WK=$(/usr/bin/python3 -c "import json;print(next(i['src'] for i in json.load(open('$(dirname $0)/content/work.json'))['items'] if 'w9-tatw-' in i['src']).split('/')[-1][:-4])")
chk "$B/assets/work/$WK.jpg"; chk "$B/assets/grid/work/$WK.jpg"
chk "$B/press/?cb=$SHA" "twenty"
chk "$B/content/rooms.json?cb=$SHA" "Thrift @ The Warehouse 34th St"
chk "$B/content/looks.json?cb=$SHA" "DIGICAM"
chk "$B/content/video.json?cb=$SHA" "tatw-item-call"
chk "$B/video/?cb=$SHA" "Item Call"
chk "$B/?cb=$SHA" "night-pick"
[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"; rm -f $T; exit $fail
