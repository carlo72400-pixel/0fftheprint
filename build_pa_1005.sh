#!/bin/zsh
# 0FF THE PRINT — PULSE ANGELS 3 at 21st Street Co-op (Austin), Sat Oct 3 2026. Built 2026-10-05.
# His ask: "upload the collages and upload the night preferably the Polaroid with no border to the website."
# ONE look: ANGEL, the instant-film colour without the paper frame (03_Graded/03 ANGEL NO FRAME), the set he posted from.
# All 79 delivered frames were read by four public-safety reviewers (REVIEW_BRIEF.md: harm x2, dignity, technical) and merged by
# cullmerge.py; then one frame per moment by hand (the shoot's _web/web_order.py), his 19 posted picks first.
# newevent.py runs with --no-upload on shard 0tp-media-2; the release goes up after with upload_release.py and is size-checked
# against staging BEFORE the site is pushed.
# Usage: build_pa_1005.sh
set -u; setopt NULL_GLOB
R=/Users/vmp/Desktop/Vamppsych/03_PROJECTS/portfolio-site/0fftheprint
PA=/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-10-03_PulseAngels3-21stStCoop
PY=/usr/bin/python3
export OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2
SLUG=2026-10-03-pulse-angels-3
OG=IMG_20261004_001731_073          # share card: the wings, horizontal, from the cleared set
cd "$R"
# PUBLIC COPIES, not symlinks: the full-size file is a public download, and the delivered JPEGs carry a Software tag that names
# the grade pipeline. The copy gets the camera's own Software value back and a caption in the house style (as the Sept nights
# carry); pixels are untouched (exiftool rewrites metadata only). Never edit the delivered 03_Graded files.
LOOK="$PA/_web/plooks/ANGEL"; mkdir -p "$LOOK"; rm -f "$LOOK"/*.jpg
find "$PA/03_Graded/03 ANGEL NO FRAME" -type f -name '*.jpg' -not -name '._*' -exec cp {} "$LOOK"/ \;
# the three story collages ride at the end of the gallery (his ask 10/5: "upload the collages")
cp "$PA/05_Story_Collage/PULSE ANGELS story 1 CROSS.jpg" "$LOOK/PA3_story_1_cross.jpg"
cp "$PA/05_Story_Collage/PULSE ANGELS story 2 WEEPING.jpg" "$LOOK/PA3_story_2_weeping.jpg"
cp "$PA/05_Story_Collage/PULSE ANGELS story 3 RED STAGE.jpg" "$LOOK/PA3_story_3_red_stage.jpg"
# redacted public copies replace the plain copy (068: a bystander smoking at the left edge is cropped off, see _web/redacted/READ ME.txt)
for f in "$PA/_web/redacted/ANGEL"/*.jpg; do cp "$f" "$LOOK"/; echo "  redacted $(basename $f)"; done
/opt/homebrew/bin/exiftool -q -overwrite_original -Software="v1.1.15" \
  -ImageDescription="PULSE ANGELS 3, 21st Street Co-op, Austin, Oct 3 2026. 0FF THE PRINT." "$LOOK"/IMG_*.jpg
/opt/homebrew/bin/exiftool -q -overwrite_original -ImageDescription="PULSE ANGELS 3, 21st Street Co-op, Austin, Oct 3 2026. Story collage, 0FF THE PRINT." "$LOOK"/PA3_story_*.jpg
echo "  staged $(ls "$LOOK" | wc -l | tr -d ' ') public copies -> $LOOK"
$PY - "$PA" "$LOOK" <<'PYEOF' || exit 1
# the copies must hold the delivered pixels exactly, and no file may still name the pipeline
import sys, os, glob, hashlib, subprocess, numpy as np
from PIL import Image
PA, LOOK = sys.argv[1:3]; bad = 0
for f in sorted(glob.glob(LOOK + '/IMG_*.jpg')):
    red = PA + '/_web/redacted/ANGEL/' + os.path.basename(f)
    src = red if os.path.exists(red) else glob.glob(PA + '/03_Graded/03 ANGEL NO FRAME/*/' + os.path.basename(f))[0]
    if not np.array_equal(np.asarray(Image.open(f)), np.asarray(Image.open(src))): bad += 1; print('  PIXELS DIFFER', os.path.basename(f))
out = subprocess.run(['/opt/homebrew/bin/exiftool', '-q', '-s3', '-Software', '-r', LOOK], capture_output=True, text=True).stdout
leak = [l for l in out.splitlines() if 'node tree' in l.lower() or 'resolve' in l.lower() or 'stack' in l.lower()]
print(f"  public copies: {len(glob.glob(LOOK + '/IMG_*.jpg'))} photos pixel-identical to the delivered files (or to their redacted copy): {bad == 0}; pipeline names left in Software: {len(leak)}")
sys.exit(1 if bad or leak else 0)
PYEOF
$PY newevent.py --venue "21st Street Co-op" --title "PULSE ANGELS 3" \
  --date 2026-10-03 --slug $SLUG --order "$PA/_web/order_pa.json" \
  --look "ANGEL=$LOOK" --og "$LOOK/${OG}.jpg" --no-upload
echo "== DONE $(date +%H:%M)"
