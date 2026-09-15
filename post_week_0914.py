#!/usr/bin/python3
"""After build_week_0914.sh: point each new gallery's index cover at a strong frame
(the default is frame 001, shoot order, which is a doorway or a bar wall), check the
counts, and print what shipped. Idempotent."""
import json, os, sys
R = os.path.dirname(os.path.abspath(__file__))
EV = os.path.join(R, "events")
# slug -> (stem of the cover frame, expected photo count, expected clip count)
WANT = {
    "2026-09-01-billy-release-party": ("IMG_20260901_224010_337", 58, 6),
    "2026-09-12-lucha-night":         ("IMG_20260912_211149_018", 25, 4),
    "2026-09-12-migx":                ("IMG_20260912_232137_041", 37, 5),
    "2026-09-13-burlesque-night":     ("GRB_20260913_192837_063", 44, 6),
}
ORDERS = {
    "2026-09-01-billy-release-party": "/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-09-01_MikeDimes-AlbumRelease/_web/order_md.json",
    "2026-09-12-lucha-night":         "/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-09-12_Wrestling-MIGX-Club/_web/order_wr.json",
    "2026-09-12-migx":                "/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-09-12_Wrestling-MIGX-Club/_web/order_cl.json",
    "2026-09-13-burlesque-night":     "/Users/vmp/Desktop/Vamppsych/04_PRODUCTION/Shoots/2026-09-13_Burlesque-RahRahRoom/_web/order_bq.json",
}
idx_path = os.path.join(EV, "events.json")
idx = json.load(open(idx_path))
ok = True
for slug, (stem, nphotos, nclips) in WANT.items():
    dj = os.path.join(EV, slug, "data.json")
    if not os.path.exists(dj):
        print(f"  {slug}: NOT BUILT YET"); ok = False; continue
    d = json.load(open(dj))
    photos = [m for m in d["media"] if m["type"] == "photo"]
    clips = [m for m in d["media"] if m["type"] == "video"]
    order = json.load(open(ORDERS[slug]))["order"]
    if stem in order:
        n = order.index(stem) + 1
        cover = f"{slug}/media/{n:03d}_t.jpg"
        assert os.path.exists(os.path.join(EV, cover)), cover
        for e in idx["items"]:
            if e["slug"] == slug:
                e["cover"] = cover
    else:
        print(f"  {slug}: cover stem {stem} not in order, cover left at 001"); ok = False
    looks = d.get("looks") or []
    flag = "" if (len(photos) == nphotos and len(clips) == nclips) else "  <-- COUNT MISMATCH"
    print(f"  {slug}: {len(photos)} photos, {len(clips)} clips, {len(looks)} looks {looks}{flag}")
    if flag: ok = False
    # every look chip must resolve to a URL on the right shard
    shard = {"2026-09-13-burlesque-night": "0tp-media-3"}.get(slug, "0tp-media-2")
    bad = [v["src"] for m in d["media"] for v in (m.get("looks") or []) if shard not in v["src"]]
    if bad:
        print(f"    {len(bad)} variant urls NOT on {shard}: {bad[:2]}"); ok = False
json.dump(idx, open(idx_path, "w"), indent=2, ensure_ascii=False)
print("covers set" if ok else "CHECK THE LINES ABOVE")
