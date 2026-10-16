#!/bin/zsh
# 0FF THE PRINT — XBONGX (One Bee Presents) at 21st Street Co-op (Austin), Sat Sept 26 2026. Built 2026-10-16.
# His ask 10/16: "do a light 0fftheprint update"; then, on ten frames: "dont push xbongx theres not much content u can push it as
# a mini pack" = a MINI PACK (newevent.py --mini). The one shoot not on the site: the 18 One Bee frames graded 10/4 through the
# PULSE ANGELS node tree (03_Graded/01 PULSE ANGELS LOOK, pulled back from Drive into the shoot's _web/graded, md5-checked).
# ONE look. All 18 delivered frames were read by four public-safety reviewers (REVIEW_BRIEF.md: harm x2, dignity, technical) and
# merged by cullmerge.py; then one frame per moment by hand (the shoot's _web/web_order.py).
# newevent.py runs with --no-upload on shard 0tp-media-2; the release goes up after with upload_release.py and is size-checked
# against staging BEFORE the site is pushed.
# Usage: build_ob_1016.sh      (OG=<stem> overrides the share card frame)
set -u; setopt NULL_GLOB
R=/Users/vmp/Desktop/Vamppsych/03_PROJECTS/portfolio-site/0fftheprint
OB=/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-09-26_OneBee-21stStCoop
GR="$OB/_web/graded/01 PULSE ANGELS LOOK"
PY=/usr/bin/python3
export OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2
SLUG=2026-09-26-xbongx
OG=${OG:-IMG_20260926_214040_008}      # share card: the four on the bench (all eyes open), horizontal, from the cleared set
cd "$R"
# PUBLIC COPIES, not symlinks: the full-size file is a public download, and the delivered JPEGs carry a Software tag that names
# the grade pipeline ("v1.1.15 | graded in DaVinci Resolve, VP node tree v1"). The copy gets the camera's own Software value back
# and a caption in the house style; pixels are untouched (exiftool rewrites metadata only). Never edit the delivered files.
LOOK="$OB/_web/plooks/PULSE_ANGELS"; mkdir -p "$LOOK"; rm -f "$LOOK"/*.jpg
find "$GR" -type f -name '*.jpg' -not -name '._*' -exec cp {} "$LOOK"/ \;
/opt/homebrew/bin/exiftool -q -overwrite_original -Software="v1.1.15" \
  -ImageDescription="XBONGX, 21st Street Co-op, Austin, Sept 26 2026. 0FF THE PRINT." "$LOOK"/IMG_*.jpg
echo "  staged $(ls "$LOOK" | wc -l | tr -d ' ') public copies -> $LOOK"
$PY - "$GR" "$LOOK" <<'PYEOF' || exit 1
# the copies must hold the delivered pixels exactly, and no file may still name the pipeline
import sys, os, glob, subprocess, numpy as np
from PIL import Image
GR, LOOK = sys.argv[1:3]; bad = 0
for f in sorted(glob.glob(LOOK + '/IMG_*.jpg')):
    src = glob.glob(GR + '/*/' + os.path.basename(f))[0]
    if not np.array_equal(np.asarray(Image.open(f)), np.asarray(Image.open(src))): bad += 1; print('  PIXELS DIFFER', os.path.basename(f))
out = subprocess.run(['/opt/homebrew/bin/exiftool', '-q', '-s3', '-Software', '-r', LOOK], capture_output=True, text=True).stdout
leak = [l for l in out.splitlines() if 'node tree' in l.lower() or 'resolve' in l.lower() or 'stack' in l.lower()]
print(f"  public copies: {len(glob.glob(LOOK + '/IMG_*.jpg'))} photos pixel-identical to the delivered files: {bad == 0}; pipeline names left in Software: {len(leak)}")
sys.exit(1 if bad or leak else 0)
PYEOF
# --mini (his call 10/16, "theres not much content u can push it as a mini pack"): one rip opens all ten, the smaller pouch
# with the MINI sticker, and it is not counted as a night anywhere.
$PY newevent.py --venue "21st Street Co-op" --title "XBONGX" \
  --date 2026-09-26 --slug $SLUG --order "$OB/_web/order_ob.json" \
  --look "PULSE ANGELS=$LOOK" --og "$LOOK/${OG}.jpg" --no-upload --mini
echo "== DONE $(date +%H:%M)"
