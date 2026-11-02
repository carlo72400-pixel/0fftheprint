#!/bin/zsh
# Live check for the Nov 1 push (THE ODD BALL, Justine's Brasserie, Oct 31: the whole set in four looks).
# Usage: verify_live_1101.sh <site-commit-sha>
# Read the JSON and check every URL against the release listing, then curl a sample: a lazy <img> never reports a 404 to the DOM
# (the 8/23 trap). 2000-odd assets would take half an hour one curl at a time, so the listing proves name and presence for all
# of them and the sample proves they really serve.
export PATH=/opt/homebrew/bin:$PATH
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl1101.$$; S=2026-10-31-the-odd-ball
for i in $(seq 1 90); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; }
echo "== $S"
chk "$B/events/$S/?cb=$SHA" 'THE ODD BALL'
chk "$B/events/$S/data.json?cb=$SHA" '"media"'
/usr/bin/python3 - $T <<'PY' || fail=1
import json,sys,subprocess,time,random
d=json.load(open(sys.argv[1])); ph=[x for x in d['media'] if x['type']=='photo']
print(f"     {len(ph)} photos, looks {d.get('looks')}, count {d['count']}")
urls=[]
for p in ph:
    for v in (p.get('looks') or [p]):
        urls += [v['src'], v['full']]
have=set()
for tag in (d['slug'],d['slug']+'-2',d['slug']+'-3'):       # release_split.py: a release stops at about 1000 assets
    out=subprocess.run(['gh','api','repos/carlo72400-pixel/0tp-media-2/releases/tags/'+tag,'--jq','.assets_url'],capture_output=True,text=True).stdout.strip()
    rid=out.split('/')[-2]
    names=subprocess.run(['gh','api','--paginate',f'repos/carlo72400-pixel/0tp-media-2/releases/{rid}/assets?per_page=100','--jq','.[]|select(.state=="uploaded")|.name'],capture_output=True,text=True).stdout.split()
    have|={tag+'/'+n for n in names}
miss=[u for u in urls if '/'.join(u.split('/')[-2:]) not in have]
print(f"     {len(urls)-len(miss)} of {len(urls)} gallery URLs are on the releases ({len(have)} assets)")
for u in miss[:10]: print('     MISSING', u)
random.seed(1101); bad=0
for u in random.sample(urls,120):
    c=subprocess.run(['curl','-sIL','-o','/dev/null','-w','%{http_code}',u],capture_output=True,text=True).stdout.strip()
    if c!='200': print(f"     FAIL {c} {u[-60:]}"); bad+=1
    time.sleep(0.2)
print(f"     {120-bad} of 120 sampled release files answer 200")
sys.exit(1 if bad or miss else 0)
PY
chk "$B/events/$S/preview.jpg"
chk "$B/events/$S/pack.webp"
chk "$B/events/$S/media/001_t.jpg"
echo "== index, work, press, map"
chk "$B/events/events.json?cb=$SHA" "$S"
chk "$B/events/?cb=$SHA" "Find yours"
chk "$B/content/frames.json?cb=$SHA" "$S"
chk "$B/content/work.json?cb=$SHA" "w10-oddball-"
WK=$(/usr/bin/python3 -c "import json;print(next(i['src'] for i in json.load(open('$(dirname $0)/content/work.json'))['items'] if 'w10-oddball-' in i['src']).split('/')[-1][:-4])")
chk "$B/assets/work/$WK.jpg"; chk "$B/assets/grid/work/$WK.jpg"
chk "$B/press/?cb=$SHA" "twenty one"
chk "$B/content/rooms.json?cb=$SHA" "Justine"
chk "$B/content/looks.json?cb=$SHA" "$S"
chk "$B/?cb=$SHA" "night-pick"
[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"; rm -f $T; exit $fail
