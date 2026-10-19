#!/bin/zsh
# 0FF THE PRINT — FILL-A-BAG, Thrift @ The Warehouse (South Congress, then 34th Street, Austin), Sat Oct 17 2026. Built 2026-10-18.
# His ask 10/18: "also add it to 0ff the print a a pack and a story. and add the edits aswell". A FULL night (105 delivered frames),
# TWO looks off the brainstorm he picked ("4 and 7"): KAWAUCHI (primary) and DIGICAM, pulled back from Drive into the shoot's
# _web/graded (md5-checked against Drive). All 105 KAWAUCHI frames were read by four public-safety reviewers (REVIEW_BRIEF.md:
# harm x2, dignity, technical) and merged by cullmerge.py; then one frame per moment by hand (_web/order_tatw.json, shoot order).
# THE EDITS ride as the night's clips, in the order they play: PAIN (v3B, the chapter cards), WELCOME BACK v3, ITEM CALL v2.
# The 720p web copies go to the shard's Pages (video/<slug>/v01..v03.mp4), the 4K masters to the release as the downloads.
# newevent.py runs with --no-upload on shard 0tp-media-2; the release goes up after with upload_release.py, the clips with
# newevent.publish_video, and both are size-checked BEFORE the site is pushed.
# Usage: build_tatw_1018.sh      (OG=<stem> overrides the share card frame)
set -u; setopt NULL_GLOB
R=/Users/vmp/Desktop/Vamppsych/03_PROJECTS/portfolio-site/0fftheprint
T=/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-10-17_TATW-FillABag
PY=/usr/bin/python3
export OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2
SLUG=2026-10-17-fill-a-bag
OG=${OG:-IMG_20261017_113650_039}      # share card: the 34th Street storefront under the THRIFT@ sign, a shopper walking in
cd "$R"
# PUBLIC COPIES, not symlinks: the full-size file is a public download, and the delivered JPEGs carry a Software tag that names
# the whole pipeline ("RAW (Camera Raw) + camera colour merge > DaVinci Resolve (VP node tree, ...) + Photoshop (...)"). The copy
# gets the camera's own Software value back and a caption in the house style; pixels are untouched (exiftool rewrites metadata
# only). Never edit the delivered files.
for L in KAWAUCHI DIGICAM; do
  GR=("$T"/_web/graded/0?\ PHOTOS\ $L); GR=${GR[1]}
  LOOK="$T/_web/plooks/$L"; mkdir -p "$LOOK"; rm -f "$LOOK"/*.jpg
  find "$GR" -type f -name '*.jpg' -not -name '._*' -exec cp {} "$LOOK"/ \;
  /opt/homebrew/bin/exiftool -q -overwrite_original -Software="v1.1.15" \
    -ImageDescription="FILL-A-BAG, Thrift @ The Warehouse, Austin, Oct 17 2026. 0FF THE PRINT." "$LOOK"/IMG_*.jpg
  echo "  staged $(ls "$LOOK" | wc -l | tr -d ' ') $L public copies -> $LOOK"
done
$PY - "$T/_web/graded" "$T/_web/plooks" <<'PYEOF' || exit 1
# the copies must hold the delivered pixels exactly, and no file may still name the pipeline
import sys, os, glob, subprocess, numpy as np
from PIL import Image
GR, PL = sys.argv[1:3]; bad = n = 0
for f in sorted(glob.glob(PL + '/*/IMG_*.jpg')):
    look = os.path.basename(os.path.dirname(f))
    src = glob.glob(f"{GR}/0? PHOTOS {look}/*/{os.path.basename(f)}")[0]; n += 1
    if not np.array_equal(np.asarray(Image.open(f)), np.asarray(Image.open(src))): bad += 1; print('  PIXELS DIFFER', look, os.path.basename(f))
out = subprocess.run(['/opt/homebrew/bin/exiftool', '-q', '-s3', '-Software', '-r', PL], capture_output=True, text=True).stdout
leak = [l for l in out.splitlines() if any(w in l.lower() for w in ('node tree', 'resolve', 'photoshop', 'camera raw', 'merge'))]
print(f"  public copies: {n} photos pixel-identical to the delivered files: {bad == 0}; pipeline names left in Software: {len(leak)}")
sys.exit(1 if bad or leak or n != 210 else 0)
PYEOF
[ -n "${STAGE_ONLY:-}" ] && { echo "== STAGE_ONLY: public copies staged, newevent.py not run"; exit 0; }
# THE EDITS: newevent.py takes a folder and sorts it by name, so the play order is set by the link names.
V="$T/_web/edits_order"; rm -rf "$V"; mkdir -p "$V"
ln -s "$T/_web/edits/PAIN_v3B_cinematic_4K.mp4" "$V/1_PAIN.mp4"
ln -s "$T/_web/edits/WELCOME_BACK_v3_4K.mp4"    "$V/2_WELCOME_BACK.mp4"
ln -s "$T/_web/edits/ITEM_CALL_v2_4K.mp4"       "$V/3_ITEM_CALL.mp4"
$PY newevent.py --venue "Thrift @ The Warehouse SoCo · Thrift @ The Warehouse 34th St" --title "FILL-A-BAG" \
  --date 2026-10-17 --slug $SLUG --order "$T/_web/order_tatw.json" \
  --look "KAWAUCHI=$T/_web/plooks/KAWAUCHI" --look "DIGICAM=$T/_web/plooks/DIGICAM" \
  --videos "$V" --video-limit 3 --og "$T/_web/plooks/KAWAUCHI/${OG}.jpg" --no-upload
echo "== DONE $(date +%H:%M)"
