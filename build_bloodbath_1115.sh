#!/bin/zsh
# 0FF THE PRINT — BLOODBATH 4, Private Park, San Marcos, Fri Nov 13 2026. Built 2026-11-15.
# His ask 11/15: "upadte 0fftheprint with the blood bath stuff". The night as a gallery, in the house formats: every graded
# photo (113) plus the 47 video stills, one strip in shoot order. The public-safety review ran (REVIEW_BRIEF.md harm x2 +
# dignity) and held 6; his answer the same evening, "Nah, don't hold anything back. Just post everything.", put those 6 and
# 279-283 (filed apart in the shoot's _HOLD folder) back in: 160 frames. SIX looks, his picks: CORN SYRUP (primary), BRUISE, DEVELOPED IN BLOOD (the hand-tinted print where one was
# made), RELIGHT (only the frames his flash lit: the chip is skipped on the rest), SHUTTER DRAG, then NATURAL. The video
# stills ride in each look in their FILM finish (his 11/14 note: the bare stills are not on par with the photos). POP-OUT
# stays off (his "so-so"). The cuts go on THE TAPE separately (content/video.json).
# newevent.py runs with --no-upload on shard 0tp-media-3 (0tp-media-2 is nearly full of Pages video). ~155 frames x up to
# 6 looks x 2 sizes is ~1,800 files and a release stops at about 1000, so release_split.py cuts the night in two (80 a release); each half
# goes up with upload_release.py and is size-checked BEFORE the site is pushed. A rebuild must run release_split.py again.
# Usage: STAGE_ONLY=1 PL=<dir> build_bloodbath_1115.sh   public copies only (into $PL, default the shoot's _web/plooks)
#        PL=<dir> OG=<stem> build_bloodbath_1115.sh       the gallery (order from $T/_web/order_bloodbath.json)
set -u; setopt NULL_GLOB
R=/Users/vmp/Desktop/Vamppsych/03_PROJECTS/portfolio-site/0fftheprint
T=/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-11-13_BLOODBATH-PrivatePark
PL=${PL:-$T/_web/plooks}
PY=/usr/bin/python3; XT=/opt/homebrew/bin/exiftool
export OTP_MEDIA_REPO=carlo72400-pixel/0tp-media-3
SLUG=2026-11-13-bloodbath-4
OG=${OG:-IMG_20261113_234623_238}      # share card: the mat, a horizontal frame
cd "$R"
if [ -n "${STAGE_ONLY:-}" ]; then
# PUBLIC COPIES: the full-size file is a public download, and the delivered JPEGs name the whole pipeline (Software) and the
# camera's serial. The copy keeps the camera basics and a caption in the house style; pixels are untouched (exiftool rewrites
# metadata only). Never edit the delivered files. Every look holds every frame in the order file that the look was made for.
$PY - "$T" "$PL" <<'PYEOF' || exit 1
import sys, os, glob, json, shutil
T, PL = sys.argv[1], sys.argv[2]; G = T + '/03_Graded'
# look -> (photo folders, video-still folders), first hit wins (the hand tint beats the plain print)
LOOKS = {'CORN SYRUP': (['02 CORN SYRUP/PHOTOS'], ['02 CORN SYRUP/VIDEO STILLS FILM']),
         'BRUISE': (['03 BRUISE/PHOTOS'], ['03 BRUISE/VIDEO STILLS FILM']),
         'DEVELOPED IN BLOOD': (['02 CORN SYRUP/DEVELOPED IN BLOOD HAND TINT', '02 CORN SYRUP/DEVELOPED IN BLOOD'],
                                ['02 CORN SYRUP/VIDEO STILLS DEVELOPED IN BLOOD HAND TINT', '02 CORN SYRUP/VIDEO STILLS DEVELOPED IN BLOOD']),
         'RELIGHT': (['04 RELIGHT/PHOTOS'], ['04 RELIGHT/VIDEO STILLS FILM']),
         'SHUTTER DRAG': (['02 CORN SYRUP/SHUTTER DRAG'], ['02 CORN SYRUP/VIDEO STILLS SHUTTER DRAG']),
         'NATURAL': (['01 NATURAL/PHOTOS'], ['01 NATURAL/VIDEO STILLS FILM'])}
OPTIONAL = {'RELIGHT'}           # only the frames his flash lit were relit
stems = json.load(open(T + '/_web/order_bloodbath.json'))['order']
# 280-283 were filed apart on 11/14 (the 360-cam guy, first read as him); his 11/15 "don't hold anything back" put them in
HOLD = (glob.glob(G + '/_HOLD*') or [G])[0]           # the shoot's hold folder, found by pattern
src_of = {}
for look, (pf, vf) in LOOKS.items():
    out = f'{PL}/{look}'; shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    n = 0
    for s in stems:
        hit = None
        for sub in (pf if s.startswith('IMG_') else vf):
            p = [q for root in (G, HOLD) for q in glob.glob(f'{root}/{sub}/HORIZONTAL/{s}.jpg') + glob.glob(f'{root}/{sub}/VERTICAL/{s}.jpg')]
            assert len(p) <= 1, (look, s, p)
            if p: hit = p[0]; break
        if not hit:
            assert look in OPTIONAL, (look, s, 'missing')
            continue
        shutil.copy2(hit, f'{out}/{s}.jpg'); src_of[f'{look}/{s}'] = hit; n += 1
    print(f' copied {look}: {n}', flush=True)
json.dump(src_of, open(f'{PL}/_sources.json', 'w'), indent=0)
PYEOF
for L in "CORN SYRUP" BRUISE "DEVELOPED IN BLOOD" RELIGHT "SHUTTER DRAG" NATURAL; do
  LOOK="$PL/$L"
  set -- "$LOOK"/IMG_*.jpg
  [ $# -gt 0 ] && $XT -q -overwrite_original -all= -tagsFromFile @ -Make -Model -DateTimeOriginal -CreateDate -ExposureTime -FNumber -ISO -FocalLength -Orientation -ICC_Profile \
    -Software="v1.1.22" -ImageDescription="BLOODBATH 4, Private Park, San Marcos, Nov 13 2026. 0FF THE PRINT." "$@"
  set -- "$LOOK"/VID_*.jpg
  [ $# -gt 0 ] && $XT -q -overwrite_original -all= -tagsFromFile @ -DateTimeOriginal -CreateDate -Orientation -ICC_Profile \
    -ImageDescription="BLOODBATH 4, Private Park, San Marcos, Nov 13 2026 (a frame of the night's video). 0FF THE PRINT." "$@"
  echo "  staged $(ls "$LOOK" | wc -l | tr -d ' ') $L public copies -> $LOOK"
done
$PY - "$PL" <<'PYEOF' || exit 1
# the copies must hold the delivered pixels exactly, and no file may still name the pipeline or the serial
import sys, os, glob, subprocess, json, numpy as np
from PIL import Image
PL = sys.argv[1]; src_of = json.load(open(f'{PL}/_sources.json')); bad = n = 0
for key, src in src_of.items():
    f = f'{PL}/{key}.jpg'; n += 1
    if not np.array_equal(np.asarray(Image.open(f)), np.asarray(Image.open(src))): bad += 1; print('  PIXELS DIFFER', key)
out = subprocess.run(['/opt/homebrew/bin/exiftool', '-q', '-j', '-G1', '-r', '-ext', 'jpg', PL], capture_output=True, text=True).stdout
leak = 0; words = ('node tree', 'resolve', 'photoshop', 'camera raw', 'merge', 'btlb3', 'serial', '/users/', 'gps')   # the sRGB profile's own "Little CMS" maker tag is not a leak
for row in json.loads(out):
    for k, v in row.items():
        if k.startswith(('System:', 'SourceFile', 'ExifTool:', 'File:')) or k == 'SourceFile': continue
        if any(w in (k + ' ' + str(v)).lower() for w in words): leak += 1; print('  LEAK', row['SourceFile'].split('/')[-2:], k, str(v)[:80])
print(f'  public copies: {n} files pixel-identical to the delivered files: {bad == 0}; leaks left: {leak}')
sys.exit(1 if bad or leak else 0)
PYEOF
echo "== STAGE_ONLY: public copies staged, newevent.py not run"; exit 0
fi
$PY newevent.py --venue "Private Park" --title "BLOODBATH 4" \
  --date 2026-11-13 --slug $SLUG --order "$T/_web/order_bloodbath.json" \
  --look "CORN SYRUP=$PL/CORN SYRUP" --look "BRUISE=$PL/BRUISE" --look "DEVELOPED IN BLOOD=$PL/DEVELOPED IN BLOOD" \
  --look "RELIGHT=$PL/RELIGHT" --look "SHUTTER DRAG=$PL/SHUTTER DRAG" --look "NATURAL=$PL/NATURAL" \
  --og "$PL/CORN SYRUP/${OG}.jpg" --no-upload
echo "== DONE $(date +%H:%M)"
