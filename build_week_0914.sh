#!/bin/zsh
# 0FF THE PRINT — the four galleries of Sept 1 to 13, built 2026-09-14.
# Usage: build_week_0914.sh <wr|cl|md|bq|all>
# Each night: stage one flat folder per LOOK (stills + video grabs together, symlinks),
# write the gallery order off cull.json (public-safety cull, four reviewers), then
# newevent.py with --look/--order (photos) and --video-look/--video-order (clips) on
# the right media SHARD. Sept 1 + Sept 12 -> 0tp-media-2, Sept 13 -> 0tp-media-3.
set -u
R=/Users/vmp/Desktop/Vamppsych/03_PROJECTS/portfolio-site/0fftheprint
S=/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots
MD=$S/2026-09-01_MikeDimes-AlbumRelease; W12=$S/2026-09-12_Wrestling-MIGX-Club; BQ=$S/2026-09-13_Burlesque-RahRahRoom
PY=/usr/bin/python3
cd "$R"

stage() {  # stage <out_dir> <src_dir>...   symlink every jpg under the sources into one flat folder
  local out=$1; shift; mkdir -p "$out"; rm -f "$out"/*.jpg "$out"/*.JPG 2>/dev/null
  for d in "$@"; do find "$d" -type f \( -name '*.jpg' -o -name '*.JPG' \) -not -name '._*' -exec ln -s {} "$out"/ \; ; done
  echo "  staged $(ls "$out" | wc -l | tr -d ' ') -> $out"
}
order() {  # order <out.json> <cull.json>...   merge kept stems, sort by capture time
  $PY - "$@" <<'EOF'
import json,sys,re
out=sys.argv[1]; stems=[]
for p in sys.argv[2:]:
    stems+=json.load(open(p))['kept']
key=lambda s: re.search(r'_(\d{8})_(\d{6})_',s).group(0) if re.search(r'_(\d{8})_(\d{6})_',s) else s
stems=sorted(dict.fromkeys(stems), key=key)
json.dump({'order':stems},open(out,'w')); print(f'  order: {len(stems)} frames -> {out}')
EOF
}

build_wr() {
  echo "== LUCHA NIGHT $(date +%H:%M)"
  for lk in "01 LUCHA NIGHT" "02 RESERVOIR DOGS" "03 DEATH PROOF"; do
    stage "$W12/_web/plooks_wr/$lk" "$W12/WRESTLING/03_Graded/$lk" "$W12/WRESTLING/05_Video_Grabs/$lk"; done
  order "$W12/_web/order_wr.json" "$W12/_web/curate_wr/cull.json"
  OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2 $PY newevent.py --venue "El Luchador Bar" --title "Lucha Night" \
    --date 2026-09-12 --slug 2026-09-12-lucha-night --order "$W12/_web/order_wr.json" \
    --look "LUCHA NIGHT=$W12/_web/plooks_wr/01 LUCHA NIGHT" --look "RESERVOIR DOGS=$W12/_web/plooks_wr/02 RESERVOIR DOGS" \
    --look "DEATH PROOF=$W12/_web/plooks_wr/03 DEATH PROOF" \
    --video-order "$W12/_web/video_order_wr.json" --video-look "LUCHA NIGHT=$W12/_web/vlooks_wr/01 LUCHA NIGHT" \
    --video-look "RESERVOIR DOGS=$W12/_web/vlooks_wr/02 RESERVOIR DOGS" --video-look "DEATH PROOF=$W12/_web/vlooks_wr/03 DEATH PROOF" \
    --og "$W12/WRESTLING/03_Graded/01 LUCHA NIGHT/HORIZONTAL/IMG_20260912_211149_018.jpg" --no-video-full
}
build_cl() {
  echo "== MIGX $(date +%H:%M)"
  for lk in "01 DEMON TIME" "02 TENET" "03 PULP FICTION" "04 HELL THERMAL" "05 BLACKLIGHT UV"; do
    stage "$W12/_web/plooks_cl/$lk" "$W12/CLUB/03_Graded/$lk" "$W12/CLUB/05_Video_Grabs/$lk"; done
  order "$W12/_web/order_cl.json" "$W12/_web/curate_cl/cull.json" "$W12/_web/curate_cl2/cull.json"
  OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2 $PY newevent.py --venue "Mi Vaquita" --title "MIGX" \
    --date 2026-09-12 --slug 2026-09-12-migx --order "$W12/_web/order_cl.json" \
    --look "DEMON TIME=$W12/_web/plooks_cl/01 DEMON TIME" --look "TENET=$W12/_web/plooks_cl/02 TENET" \
    --look "PULP FICTION=$W12/_web/plooks_cl/03 PULP FICTION" --look "HELL THERMAL=$W12/_web/plooks_cl/04 HELL THERMAL" \
    --look "BLACKLIGHT UV=$W12/_web/plooks_cl/05 BLACKLIGHT UV" \
    --video-order "$W12/_web/video_order_cl.json" --video-look "DEMON TIME=$W12/_web/vlooks_cl/01 DEMON TIME" \
    --video-look "TENET=$W12/_web/vlooks_cl/02 TENET" --video-look "PULP FICTION=$W12/_web/vlooks_cl/03 PULP FICTION" \
    --video-look "HELL THERMAL=$W12/_web/vlooks_cl/04 HELL THERMAL" --video-look "BLACKLIGHT UV=$W12/_web/vlooks_cl/05 BLACKLIGHT UV" \
    --og "$W12/CLUB/03_Graded/01 DEMON TIME/HORIZONTAL/IMG_20260913_002213_093.jpg" --no-video-full
}
build_md() {
  echo "== MIKE DIMES $(date +%H:%M)"
  for i in $(seq 1 90); do [ -f "$MD/_web/curate_md2/cull.json" ] && break; echo "  waiting on curate_md2/cull.json ($i)"; sleep 20; done
  order "$MD/_web/order_md.json" "$MD/_web/curate_md/cull.json" "$MD/_web/curate_md2/cull.json"
  OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2 $PY newevent.py --venue "Slackers" --title "B.I.L.L.Y Release Party" \
    --date 2026-09-01 --slug 2026-09-01-billy-release-party --order "$MD/_web/order_md.json" \
    --look "HERO=$MD/_web/src_hero" --look "CHARACTER=$MD/_web/src_char" \
    --video-order "$MD/_web/video_order.json" --video-look "HERO=$MD/_web/vlooks/HERO" --video-look "CHARACTER=$MD/_web/vlooks/CHARACTER" \
    --og "$MD/_web/src_hero/IMG_20260901_215440_262.jpg" --no-video-full
}
build_bq() {
  echo "== BURLESQUE $(date +%H:%M)"
  for lk in "01 RED VELVET" "02 INSOMNIA" "03 OXBLOOD" "04 OXWULF"; do
    stage "$BQ/_web/plooks/$lk" "$BQ/03_Graded/$lk" "$BQ/05_Video_Grabs/$lk"; done
  order "$BQ/_web/order_bq.json" "$BQ/_web/curate_bq/cull.json"
  OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-3 $PY newevent.py --venue "Rah Rah Room" --title "Burlesque Night" \
    --date 2026-09-13 --slug 2026-09-13-burlesque-night --order "$BQ/_web/order_bq.json" \
    --look "RED VELVET=$BQ/_web/plooks/01 RED VELVET" --look "INSOMNIA=$BQ/_web/plooks/02 INSOMNIA" \
    --look "OXBLOOD=$BQ/_web/plooks/03 OXBLOOD" --look "OXWULF=$BQ/_web/plooks/04 OXWULF" \
    --video-order "$BQ/_web/video_order.json" --video-look "RED VELVET=$BQ/_web/vlooks/01 RED VELVET" \
    --video-look "INSOMNIA=$BQ/_web/vlooks/02 INSOMNIA" --video-look "OXBLOOD=$BQ/_web/vlooks/03 OXBLOOD" \
    --video-look "OXWULF=$BQ/_web/vlooks/04 OXWULF" \
    --og "$BQ/03_Graded/01 RED VELVET/HORIZONTAL/IMG_20260913_195210_132.jpg" --no-video-full
}

case "${1:-all}" in
  wr) build_wr;; cl) build_cl;; md) build_md;; bq) build_bq;;
  shard2) build_wr; build_cl; build_md;;
  all) build_wr; build_cl; build_md; build_bq;;
esac
echo "== DONE ${1:-all} $(date +%H:%M)"
