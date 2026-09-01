#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — THE TAPE, every piece of house video on one page.

    /usr/bin/python3 videos.py

Two sources, merged, newest first:

  CUTS   content/video.json, hand written. The authored work: montages,
         interview cuts, the films. These are the pieces, so they are curated
         and they carry their own line of copy.
  NIGHTS events/*/data.json, walked. Every clip already published on an event
         page, reusing the poster that event already committed. Nothing here is
         hand maintained, so a new dump joins the tape the moment newevent.py
         runs and repage.py cannot drift from it.

⛔ VIDEO IS NEVER SERVED FROM A RELEASE ASSET. GitHub types every one of them
   application/octet-stream + content-disposition: attachment and iOS Safari
   refuses to play that. Playable clips come off the media repo's Pages site or
   out of this repo; the release URL is only ever a download.

⛔ EVERY POSTER CARRIES width/height. The grid sizes a tile from the poster's
   aspect, and a lazy image with no intrinsic size collapses to nothing, which
   is what once rendered two whole event galleries as a column of hairlines.

⚠️ Bandwidth is the real ceiling here, not disk. 37 autoplaying clips would put
   a gigabyte on the wire per visit, so every <video> is preload="none", the
   grid ships posters only, and the lightbox clears src on close.
"""
import html
import io
import json
import os
import re
from datetime import datetime

ROOT   = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
OUT    = os.path.join(ROOT, "video")
SITE   = "https://0fftheprint.com"


def dur_str(seconds):
    s = int(round(seconds or 0))
    return f"{s // 60}:{s % 60:02d}"


def night_items():
    """Every clip already on an event page, pointed at that page's own poster."""
    out = []
    for slug in sorted(os.listdir(EVENTS)):
        dj = os.path.join(EVENTS, slug, "data.json")
        if not os.path.isdir(os.path.join(EVENTS, slug)) or not os.path.exists(dj):
            continue
        d = json.load(open(dj))
        clips = [m for m in d.get("media", []) if m.get("type") == "video"]
        for i, m in enumerate(clips, 1):
            thumb = m.get("thumb", "")
            out.append({
                "slug":   f"{slug}-{i:02d}",
                "title":  d.get("title") or d.get("venue"),
                "kind":   "NIGHT",
                "line":   f"Clip {i} of {len(clips)}, straight off the night.",
                "src":    m["src"],
                # the event already committed this poster; do not make a second one
                "poster": f"../events/{slug}/{thumb}" if thumb else "",
                "w": m.get("w"), "h": m.get("h"),
                "dur":    "",
                # the night's name is already the title; say where and when instead
                "from":   f'{d.get("venue")} · {d.get("date_short") or d.get("date","")}',
                "link":   f"events/{slug}/",
                "date":   d.get("date", ""),
                **({"full": m["full"]} if m.get("full") else {}),
            })
    return out


def build():
    cuts = json.load(open(os.path.join(ROOT, "content", "video.json")))["items"]
    for c in cuts:
        c.setdefault("kind", "CUT")
    items = cuts + night_items()

    # Newest first, and inside a day the authored cut leads the raw clip.
    # ⛔ reverse=True flips EVERY key, so `kind == "NIGHT"` sorted True first and
    #    the raw clips led their own montages. Negate the flag instead of relying
    #    on the shared reverse.
    items.sort(key=lambda x: (x.get("date", ""), x.get("kind") != "NIGHT"), reverse=True)

    missing = [i["slug"] for i in items
               if i.get("poster") and not i["poster"].startswith("http")
               and not os.path.exists(os.path.join(OUT, i["poster"]))]
    if missing:
        print(f"  ⚠️  {len(missing)} poster(s) not on disk: {', '.join(missing[:6])}")
    thin = [i["slug"] for i in items if not i.get("w") or not i.get("h")]
    if thin:
        print(f"  ⚠️  {len(thin)} item(s) with no w/h, tiles will collapse: {', '.join(thin[:6])}")

    n_cut = sum(1 for i in items if i["kind"] == "CUT")
    n_nig = len(items) - n_cut
    os.makedirs(OUT, exist_ok=True)
    page = PAGE.replace("__ITEMS__", json.dumps(items)) \
               .replace("__COUNT__", str(len(items))) \
               .replace("__NCUT__", str(n_cut)) \
               .replace("__NNIGHT__", str(n_nig))
    left = re.findall(r"__[A-Z]+__", page)
    if left:
        raise SystemExit(f"placeholders unfilled: {sorted(set(left))}")
    io.open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
    print(f"  video/: {len(items)} pieces ({n_cut} cuts, {n_nig} night clips)")


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>The Tape · 0FF THE PRINT</title>
<meta name="description" content="Every piece of video the house has put out. Cuts, interviews and clips straight off the nights.">
<meta property="og:title" content="The Tape · 0FF THE PRINT">
<meta property="og:description" content="__COUNT__ pieces. Cuts, interviews and clips straight off the nights.">
<meta property="og:image" content="SITEURL/video/preview.jpg">
<meta name="theme-color" content="#0a0a0d">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#f2eef5;--muted:#8d8798;--line:rgba(255,255,255,.1);--pink:#ff79c6;--bg:#0a0a0d}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif}
  .leopard-bar{height:7px;background:linear-gradient(90deg,#ff79c6,#caa9ff,#2f6bff,#ff79c6);background-size:300% 100%}
  .wrap{max-width:1180px;margin:0 auto;padding:28px 18px 90px}
  a.back{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--muted);text-decoration:none}
  a.back:hover{color:var(--pink)}
  h1{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:clamp(38px,9vw,72px);line-height:.95;margin:26px 0 8px}
  .sub{font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.2em;
    text-transform:uppercase;color:var(--muted)}
  .tabs{display:flex;gap:8px;margin:24px 0 22px;flex-wrap:wrap}
  .tab{background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:999px;
    padding:9px 16px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;
    text-transform:uppercase;cursor:pointer;min-height:38px}
  .tab.on{color:#12070f;background:var(--pink);border-color:var(--pink);font-weight:600}
  /* CSS columns, not grid. The tape mixes 9:16 cuts with 16:9 night clips, and a
     grid row is as tall as its tallest tile, so every short clip beside a tall one
     leaves a hole. Columns pack by height instead. Same layout the event galleries
     use. 2 columns on a phone: one 9:16 tile per row is a whole screen. */
  .grid{columns:2 168px;column-gap:12px;margin-top:4px}
  @media(min-width:760px){.grid{columns:4 210px}}
  .card{background:transparent;border:0;padding:0;text-align:left;cursor:pointer;color:inherit;
    display:block;width:100%;font:inherit;break-inside:avoid;margin:0 0 16px}
  .shot{position:relative;display:block;border-radius:12px;overflow:hidden;
    border:1px solid var(--line);background:#141119}
  /* the poster's own aspect drives the tile. A lazy img with no w/h collapses
     to 2px and takes the whole column with it. */
  .shot img{width:100%;height:auto;display:block;aspect-ratio:9/16}
  .shot img[width][height]{aspect-ratio:auto}
  .card:hover .shot{border-color:var(--pink)}
  .ply{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;
    color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.65);opacity:.92}
  .dur{position:absolute;right:7px;bottom:7px;background:rgba(8,6,10,.82);
    font-family:'JetBrains Mono',monospace;font-size:10.5px;padding:3px 7px;border-radius:5px;color:#fff}
  .kd{position:absolute;left:7px;top:7px;font-family:'JetBrains Mono',monospace;font-size:9.5px;
    letter-spacing:.16em;padding:3px 7px;border-radius:5px;background:rgba(8,6,10,.82);color:var(--pink)}
  .ti{display:block;margin-top:9px;font-family:'Saira Condensed',sans-serif;font-style:italic;
    font-weight:900;text-transform:uppercase;font-size:16px;line-height:1.04}
  .fr{display:block;margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:9.5px;
    letter-spacing:.12em;text-transform:uppercase;color:var(--muted);line-height:1.45}
  .empty{color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:12px;padding:30px 0}
  /* ---- lightbox ---- */
  .lb{position:fixed;inset:0;background:rgba(6,5,8,.96);display:none;z-index:60;
    grid-template-rows:1fr auto;padding:14px}
  .lb.on{display:grid}
  .lb-stage{display:grid;place-items:center;min-height:0}
  .lb video{max-width:100%;max-height:100%;border-radius:10px;background:#000;display:block}
  .lb-bar{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;padding:12px 4px 2px}
  .lb-t{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:20px}
  .lb-l{font-size:13px;color:var(--muted);flex:1 1 240px;line-height:1.5}
  .lb a,.lb button{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--pink);text-decoration:none;background:transparent;
    border:0;cursor:pointer;padding:8px 2px;min-height:38px}
  .lb-x{position:absolute;top:10px;right:14px;font-size:26px;color:#fff;background:transparent;
    border:0;cursor:pointer;line-height:1;padding:6px 10px}
  .nav{position:absolute;top:50%;transform:translateY(-50%);font-size:34px;color:#fff;
    background:transparent;border:0;cursor:pointer;padding:10px 14px;opacity:.75}
  .nav:hover{opacity:1}.pv{left:2px}.nx{right:2px}
  .foot{margin-top:46px;padding-top:20px;border-top:1px solid var(--line);
    font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted);line-height:2}
  .foot a{color:var(--pink);text-decoration:none}
</style>
</head>
<body>
<div class="leopard-bar"></div>
<div class="wrap">
  <a class="back" href="../">&larr; 0FF THE PRINT</a>
  <h1>The Tape</h1>
  <div class="sub">__COUNT__ pieces &nbsp;·&nbsp; __NCUT__ cuts &nbsp;·&nbsp; __NNIGHT__ off the nights</div>
  <div class="tabs" id="tabs"></div>
  <div class="grid" id="grid"></div>
  <div class="foot">
    Shot by 0FF THE PRINT &nbsp;·&nbsp; <a href="https://instagram.com/vamppsych">@vamppsych</a><br>
    Every drop gets a number. <a href="../#catalog">The catalog &rarr;</a>
  </div>
</div>

<div class="lb" id="lb">
  <button class="lb-x" id="lbx" aria-label="Close">&times;</button>
  <button class="nav pv" id="lbp" aria-label="Previous">&#8249;</button>
  <button class="nav nx" id="lbn" aria-label="Next">&#8250;</button>
  <div class="lb-stage"><video id="lbv" controls playsinline preload="none"></video></div>
  <div class="lb-bar">
    <span class="lb-t" id="lbt"></span>
    <span class="lb-l" id="lbl"></span>
    <a id="lbfrom" href="#"></a>
    <a id="lbdl" href="#" target="_blank" rel="noopener" hidden>full res &darr;</a>
  </div>
</div>

<script>
const ITEMS = __ITEMS__;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Only http(s) and same-origin relative paths. Nothing here should ever be able
   to put javascript: in an href. */
const safeUrl = u => {
  const v = String(u == null ? '' : u).trim();
  if (!v) return '';
  return /^(https?:\\/\\/|\\.{0,2}\\/|[\\w.-]+\\/)/.test(v) && !/^javascript:/i.test(v) ? v : '';
};

const grid = document.getElementById('grid');
const tabs = document.getElementById('tabs');
let view = ITEMS;

function draw(kind){
  view = kind ? ITEMS.filter(i => i.kind === kind) : ITEMS;
  if (!view.length){ grid.innerHTML = '<div class="empty">nothing here yet</div>'; return; }
  grid.innerHTML = view.map((m,i) => {
    const p = safeUrl(m.poster);
    return '<button class="card" data-i="'+i+'" type="button">'
      + '<span class="shot">'
        + (p ? '<img src="'+esc(p)+'" alt="" loading="lazy" width="'+(m.w||520)+'" height="'+(m.h||924)+'">' : '')
        + '<span class="kd">'+esc(m.kind)+'</span>'
        + (m.dur ? '<span class="dur">'+esc(m.dur)+'</span>' : '')
        + '<span class="ply">&#9654;</span>'
      + '</span>'
      + '<span class="ti">'+esc(m.title)+'</span>'
      + '<span class="fr">'+esc(m.from)+'</span>'
      + '</button>';
  }).join('');
}

const mkTab = (label, kind) => {
  const b = document.createElement('button');
  b.className = 'tab'; b.type = 'button'; b.textContent = label;
  b.addEventListener('click', () => {
    [...tabs.children].forEach(c => c.classList.remove('on'));
    b.classList.add('on'); draw(kind);
  });
  tabs.appendChild(b); return b;
};
const tAll = mkTab('All', null); mkTab('Cuts', 'CUT'); mkTab('Off the nights', 'NIGHT');
tAll.classList.add('on');
draw(null);

/* ---- lightbox ---- */
const lb=document.getElementById('lb'), lbv=document.getElementById('lbv'),
      lbt=document.getElementById('lbt'), lbl=document.getElementById('lbl'),
      lbf=document.getElementById('lbfrom'), lbd=document.getElementById('lbdl');
let at = 0;

function show(i){
  at = (i + view.length) % view.length;
  const m = view[at];
  lbv.pause();
  lbv.src = safeUrl(m.src);
  lbv.poster = safeUrl(m.poster) || '';
  lbt.textContent = m.title || '';
  lbl.textContent = m.line || '';
  lbf.textContent = m.from ? (m.from + ' \\u2192') : '';
  lbf.href = safeUrl(m.link) ? '../' + m.link : '#';
  lbf.style.display = m.link ? '' : 'none';
  if (m.full){ lbd.href = safeUrl(m.full); lbd.hidden = false; } else { lbd.hidden = true; }
  lb.classList.add('on');
  lbv.play().catch(()=>{});          /* a blocked autoplay is fine, controls are there */
}
/* ⛔ clear src on close or the clip keeps downloading behind the closed lightbox */
function hide(){ lb.classList.remove('on'); lbv.pause(); lbv.removeAttribute('src'); lbv.load(); }

grid.addEventListener('click', e => {
  const b = e.target.closest('.card'); if (b) show(+b.dataset.i);
});
document.getElementById('lbx').addEventListener('click', hide);
document.getElementById('lbp').addEventListener('click', () => show(at - 1));
document.getElementById('lbn').addEventListener('click', () => show(at + 1));
lb.addEventListener('click', e => { if (e.target === lb) hide(); });
document.addEventListener('keydown', e => {
  if (!lb.classList.contains('on')) return;
  if (e.key === 'Escape') hide();
  if (e.key === 'ArrowLeft') show(at - 1);
  if (e.key === 'ArrowRight') show(at + 1);
});
</script>
</body>
</html>
"""
PAGE = PAGE.replace("SITEURL", SITE)

if __name__ == "__main__":
    build()
