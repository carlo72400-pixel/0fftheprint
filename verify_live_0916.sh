#!/bin/zsh
# Live check for the Sadboyz Club gallery push. Usage: verify_live_0916.sh <site-commit-sha>
SHA=$1; B=https://0fftheprint.com; fail=0; T=/tmp/vl0916.$$; S=2026-09-16-sadboyz-club
for i in $(seq 1 60); do
  st=$(gh api repos/carlo72400-pixel/0fftheprint/pages/builds/latest --jq '"\(.status) \(.commit)"' 2>/dev/null)
  case "$st" in "built $SHA"*) echo "pages built for ${SHA[1,7]} after ~$((i*10))s"; break;; "errored"*) echo "PAGES BUILD ERRORED: $st"; exit 1;; esac
  sleep 10
done
chk() { code=$(curl -s -o $T -w "%{http_code}" "$1"); if [ "$code" = 200 ] && { [ -z "$2" ] || grep -q -- "$2" $T; }; then echo "  PASS $code $1"; else echo "  FAIL $code $1 ${2:+(needs: $2)}"; fail=1; fi; sleep 0.7; }
echo "== $S"
chk "$B/events/$S/?cb=$SHA" "lblooks"
chk "$B/events/$S/data.json?cb=$SHA" '"looks"'
/usr/bin/python3 - $T <<'PY' || fail=1
import json,sys,subprocess,time,random
d=json.load(open(sys.argv[1])); ph=[x for x in d['media'] if x['type']=='photo']
print(f"     {len(ph)} photos, looks {d.get('looks')}, count {d['count']}")
bad=0; picks=[ph[0],ph[len(ph)//2],ph[-1]]+random.sample(ph,4)
probes=[]
for p in picks:
    for v in p.get('looks',[{'src':p['src'],'full':p.get('full')}]):
        probes.append(v['src']); 
        if v.get('full'): probes.append(v['full'])
for u in probes:
    c=subprocess.run(['curl','-sIL','-o','/dev/null','-w','%{http_code}',u],capture_output=True,text=True).stdout.strip()
    print(f"     {'PASS' if c=='200' else 'FAIL'} {c} {u[-52:]}"); bad+= c!='200'; time.sleep(0.5)
sys.exit(1 if bad else 0)
PY
chk "$B/events/$S/preview.jpg"
chk "$B/events/$S/media/001_t.jpg"
chk "$B/events/$S/media/021_t.jpg"
chk "$B/events/events.json?cb=$SHA" "$S"
chk "$B/events/?cb=$SHA" "$S"
chk "$B/content/site.json?cb=$SHA" "Wav Room"
[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"; rm -f $T; exit $fail
