#!/bin/zsh
# 0FF THE PRINT — the three nights of Sept 20 to 25, built 2026-10-02.
# Usage: build_week_1002.sh <ext|har|wap|all>
# Frames were picked one per moment by hand off full contact sheets, then read by
# four public-safety reviewers per night (harm x2, dignity, technical) and merged by
# cullmerge.py. Each night: stage one flat folder per LOOK (symlinks), write the
# gallery order off cull.json, then newevent.py --no-upload on shard 0tp-media-2.
# The releases go up after, with the parallel uploader, and get size-checked
# against staging BEFORE the site is pushed.
set -u; setopt NULL_GLOB
R=/Users/vmp/Desktop/Vamppsych/03_PROJECTS/portfolio-site/0fftheprint
S=/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots
EXT=$S/2026-09-20_ExoticTakeout-ChillSmoke; HAR=$S/2026-09-24_Harambe-PaperTiger; WAP=$S/2026-09-25_WAP-PrivatePark
PY=/usr/bin/python3
export OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2
# share-card frames (horizontal, from the cleared set)
OG_EXT=IMG_20260920_193310_443; OG_HAR=GRB_20260924_233840_056; OG_WAP=IMG_20260925_232156_184
cd "$R"

stage() {  # stage <out_dir> <src_dir>...   symlink every jpg under the sources into one flat folder
  local out=$1; shift; mkdir -p "$out"; rm -f "$out"/*.jpg "$out"/*.JPG 2>/dev/null
  for d in "$@"; do find "$d" -type f \( -name '*.jpg' -o -name '*.JPG' \) -not -name '._*' -exec ln -s {} "$out"/ \; ; done
  echo "  staged $(ls "$out" | wc -l | tr -d ' ') -> $out"
}
order() {  # order <out.json> <cull.json>   kept stems in shoot order
  $PY - "$@" <<'EOF'
import json,sys,re
out=sys.argv[1]; stems=json.load(open(sys.argv[2]))['kept']
key=lambda s: re.search(r'_(\d{8})_(\d{6})',s).group(0) if re.search(r'_(\d{8})_(\d{6})',s) else s
stems=sorted(dict.fromkeys(stems), key=key)
json.dump({'order':stems},open(out,'w')); print(f'  order: {len(stems)} frames -> {out}')
EOF
}

# ⛔ The Sept 20 shoot is DRIVE-ONLY. _web/graded was a copy pulled off the Drive mount for this build and
#    trashed after; before a rebuild: rsync -a --exclude '._*' "<Drive>/04_PRODUCTION/Shoots/2026-09-20_ExoticTakeout-ChillSmoke/03_Graded/" "$EXT/_web/graded/"
build_ext() {
  echo "== CHILL & SMOKE $(date +%H:%M)"
  for lk in "01 NATURAL" "02 CHILL & SMOKE"; do stage "$EXT/_web/plooks/$lk" "$EXT/_web/graded/$lk"; done
  order "$EXT/_web/order_ext.json" "$EXT/_web/curate_ext/cull.json"
  $PY newevent.py --venue "Exotic Takeout" --title "Chill & Smoke" \
    --date 2026-09-20 --slug 2026-09-20-chill-and-smoke --order "$EXT/_web/order_ext.json" \
    --look "CHILL & SMOKE=$EXT/_web/plooks/02 CHILL & SMOKE" --look "NATURAL=$EXT/_web/plooks/01 NATURAL" \
    --og "$EXT/_web/plooks/02 CHILL & SMOKE/${OG_EXT}.jpg" --no-upload
}
build_har() {
  echo "== HARAMBE 4 EVER $(date +%H:%M)"
  for lk in "01 SIDE STAGE" "02 HEAVEN LIGHT"; do
    stage "$HAR/_web/plooks/$lk" "$HAR/03_Graded/$lk" "$HAR/05_Video_Grabs/$lk"; done
  order "$HAR/_web/order_har.json" "$HAR/_web/curate_har/cull.json"
  $PY newevent.py --venue "Paper Tiger" --title "HARAMBE 4 EVER" \
    --date 2026-09-24 --slug 2026-09-24-harambe-4-ever --order "$HAR/_web/order_har.json" \
    --look "SIDE STAGE=$HAR/_web/plooks/01 SIDE STAGE" --look "HEAVEN LIGHT=$HAR/_web/plooks/02 HEAVEN LIGHT" \
    --og "$HAR/_web/plooks/01 SIDE STAGE/${OG_HAR}.jpg" --no-upload
}
build_wap() {
  echo "== WAP $(date +%H:%M)"
  for lk in "01 CINEMATIC" "02 WAP" "03 RISO 2-INK" "04 FUNSAVER"; do
    stage "$WAP/_web/plooks/$lk" "$WAP/03_Graded/$lk"
    # a readable licence plate behind the singer, blurred on the public copy only
    for f in "$WAP/_web/redacted/$lk"/*.jpg; do ln -sf "$f" "$WAP/_web/plooks/$lk/"; echo "  redacted $(basename $f)"; done
  done
  order "$WAP/_web/order_wap.json" "$WAP/_web/curate_wap/cull.json"
  $PY newevent.py --venue "Private Park" --title "WAP" \
    --date 2026-09-25 --slug 2026-09-25-wap --order "$WAP/_web/order_wap.json" \
    --look "WAP=$WAP/_web/plooks/02 WAP" --look "RISO 2-INK=$WAP/_web/plooks/03 RISO 2-INK" \
    --look "FUNSAVER=$WAP/_web/plooks/04 FUNSAVER" --look "CINEMATIC=$WAP/_web/plooks/01 CINEMATIC" \
    --og "$WAP/_web/plooks/02 WAP/${OG_WAP}.jpg" --no-upload
}

case "${1:-all}" in
  ext) build_ext;; har) build_har;; wap) build_wap;;
  all) build_ext; build_har; build_wap;;
esac
echo "== DONE ${1:-all} $(date +%H:%M)"
