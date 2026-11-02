#!/bin/zsh
# 0FF THE PRINT — THE ODD BALL, Justine's Brasserie, Austin, Sat Oct 31 2026. Built 2026-11-01.
# His ask 11/1: "Go ahead and start taking the Halloween photos from last night and putting them on the website. Yeah, no, I mean, all of them."
# So the WHOLE set, no best-of and no one-per-moment: every graded frame of the night in shoot order, less the frames the
# public-safety review holds (REVIEW_BRIEF.md: harm x2, dignity; cullmerge.py) and his own 14 selfies at home (365-378, his
# 11/1 note: no photos of him on night two). FOUR looks: SUSPIRIA, GOOSEBUMPS, REC with the HALLOWEEN PASS on (his ask that
# morning: "I want there to be a Halloween pass for all the photos"), then NATURAL.
# newevent.py runs with --no-upload on shard 0tp-media-2. 255 frames x 4 looks x 2 sizes is 2040 files and a release stops at about
# 1000, so release_split.py cuts the night into three releases (124 frames each); each one goes up with upload_release.py and is
# size-checked BEFORE the site is pushed. A rebuild must run release_split.py again.
# The artist's phone number on the caricature sign (152-155) is blurred on the public copies: _web/redact_sign.py after STAGE_ONLY.
# Usage: STAGE_ONLY=1 build_oddball_1101.sh    public copies only
#        OG=<stem> build_oddball_1101.sh       the gallery (order from $T/_web/order_oddball.json)
set -u; setopt NULL_GLOB
R=/Users/vmp/Desktop/Vamppsych/03_PROJECTS/portfolio-site/0fftheprint
T=/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-10-30_Halloween-Weekend
G="$T/03_Graded/SAT 10-31"; PL="$T/_web/plooks"
PY=/usr/bin/python3; XT=/opt/homebrew/bin/exiftool
export OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-2
SLUG=2026-10-31-the-odd-ball
OG=${OG:-IMG_20261101_001550_255}      # share card: the feather wings reaching for the neon pagoda
cd "$R"
if [ -n "${STAGE_ONLY:-}" ]; then
# PUBLIC COPIES: the full-size file is a public download, and the delivered JPEGs name the whole pipeline (Software, CreatorTool,
# the Photoshop history) and the camera's serial. The copy keeps the camera basics and a caption in the house style; pixels are
# untouched (exiftool rewrites metadata only). Never edit the delivered files. Stems: the full set less 365-378.
$PY - "$T" <<'PYEOF' || exit 1
import sys, os, glob, json, shutil
T = sys.argv[1]; G = T + '/03_Graded/SAT 10-31'
LOOKS = {'SUSPIRIA': '03 SUSPIRIA/HALLOWEEN PASS', 'GOOSEBUMPS': '02 GOOSEBUMPS/HALLOWEEN PASS', 'REC': '04 REC/HALLOWEEN PASS', 'NATURAL': '01 NATURAL/PHOTOS'}
stems = [r['stem'] for r in json.load(open(T + '/_web/sheets/sat_index.json')) if not 365 <= int(r['stem'].split('_')[-1]) <= 378]
assert len(stems) == 261, len(stems)
for look, sub in LOOKS.items():
    out = f'{T}/_web/plooks/{look}'; shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    for s in stems:
        p = glob.glob(f'{G}/{sub}/**/{s}.jpg', recursive=True); assert len(p) == 1, (look, s, p)
        shutil.copy2(p[0], f'{out}/{s}.jpg')
    print(' copied', look, len(os.listdir(out)), flush=True)
PYEOF
for L in SUSPIRIA GOOSEBUMPS REC NATURAL; do
  LOOK="$PL/$L"
  $XT -q -overwrite_original -all= -tagsFromFile @ -Make -Model -DateTimeOriginal -CreateDate -ExposureTime -FNumber -ISO -FocalLength -Orientation -ICC_Profile \
    -Software="v1.1.22" -ImageDescription="THE ODD BALL, Justine's Brasserie, Austin, Oct 31 2026. 0FF THE PRINT." "$LOOK"/IMG_*.jpg
  echo "  staged $(ls "$LOOK" | wc -l | tr -d ' ') $L public copies -> $LOOK"
done
$PY - "$T" <<'PYEOF' || exit 1
# the copies must hold the delivered pixels exactly, and no file may still name the pipeline or the serial
import sys, os, glob, subprocess, json, numpy as np
from PIL import Image
T = sys.argv[1]; G = T + '/03_Graded/SAT 10-31'; PL = T + '/_web/plooks'; bad = n = 0
LOOKS = {'SUSPIRIA': '03 SUSPIRIA/HALLOWEEN PASS', 'GOOSEBUMPS': '02 GOOSEBUMPS/HALLOWEEN PASS', 'REC': '04 REC/HALLOWEEN PASS', 'NATURAL': '01 NATURAL/PHOTOS'}
for look, sub in LOOKS.items():
    for f in sorted(glob.glob(f'{PL}/{look}/IMG_*.jpg')):
        src = glob.glob(f'{G}/{sub}/**/{os.path.basename(f)}', recursive=True)[0]; n += 1
        if not np.array_equal(np.asarray(Image.open(f)), np.asarray(Image.open(src))): bad += 1; print('  PIXELS DIFFER', look, os.path.basename(f))
out = subprocess.run(['/opt/homebrew/bin/exiftool', '-q', '-j', '-G1', '-r', '-ext', 'jpg', PL], capture_output=True, text=True).stdout
leak = 0; words = ('node tree', 'resolve', 'photoshop', 'camera raw', 'merge', 'btlb3', '/users/', 'gps')
for row in json.loads(out):
    for k, v in row.items():
        if k.startswith(('System:', 'SourceFile', 'ExifTool:')) or k == 'SourceFile': continue
        if any(w in (k + ' ' + str(v)).lower() for w in words): leak += 1; print('  LEAK', row['SourceFile'].split('/')[-2:], k, str(v)[:80])
print(f'  public copies: {n} photos pixel-identical to the delivered files: {bad == 0}; leaks left: {leak}')
sys.exit(1 if bad or leak or n != 1044 else 0)
PYEOF
echo "== STAGE_ONLY: public copies staged, newevent.py not run"; exit 0
fi
$PY newevent.py --venue "Justine's Brasserie" --title "THE ODD BALL" \
  --date 2026-10-31 --slug $SLUG --order "$T/_web/order_oddball.json" \
  --look "SUSPIRIA=$PL/SUSPIRIA" --look "GOOSEBUMPS=$PL/GOOSEBUMPS" --look "REC=$PL/REC" --look "NATURAL=$PL/NATURAL" \
  --og "$PL/SUSPIRIA/${OG}.jpg" --no-upload
echo "== DONE $(date +%H:%M)"
