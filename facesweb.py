#!/usr/bin/env python3
"""YuNet faces on the actual graded frames, in nightsblock.py's faces.json shape.
    facesweb.py <candidates.json> <out.json> <yunet.onnx>   (feeds nightsblock.py "faces")
Runs on the RGB frame and on a max-channel copy (a red wash leaves one channel),
keeps the union, drops overlaps."""
import json, sys
import cv2, numpy as np
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None
items = json.load(open(sys.argv[1]))["items"]
det = cv2.FaceDetectorYN.create(sys.argv[3], "", (320, 320), 0.72, 0.3, 5000)
out = []
for it in items:
    im = ImageOps.exif_transpose(Image.open(it["path"])).convert("RGB")
    im.thumbnail((960, 960))
    a = np.asarray(im)[:, :, ::-1].copy()
    h, w = a.shape[:2]
    det.setInputSize((w, h))
    mx = a.max(axis=2); mxi = cv2.merge([mx, mx, mx])
    found = []
    for src in (a, mxi):
        _, f = det.detect(src)
        if f is not None:
            for r in f:
                x, y, fw, fh, s = float(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[14])
                dup = any(abs(x - g["x"]) < fw * 0.5 and abs(y - g["y"]) < fh * 0.5 for g in found)
                if not dup:
                    found.append({"x": x, "y": y, "w": fw, "h": fh, "score": round(s, 3)})
    out.append({"file": it["stem"] + ".jpg", "nface": len(found), "faces": found, "dw": w, "dh": h})
json.dump(out, open(sys.argv[2], "w"), indent=1)
print(sys.argv[2], sum(1 for r in out if r["nface"]), "of", len(out), "with faces")
