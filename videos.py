#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0FF THE PRINT — THE TAPE, every piece of house video on one page.

    /usr/bin/python3 videos.py

Two sources, merged, newest first:

  CUTS   content/video.json, hand written. The authored work: montages,
         interview cuts, the films. These are the pieces, so they are curated
         and they carry their own line of copy.
         `up` (YYYY-MM-DD, optional, 10/21): the day a cut went up. A cut with no
         story `link` also lands on the homepage timeline as a 'new cuts' card,
         placed by `up` (else `date`): cathedral.js tape().
  NIGHTS events/*/data.json, walked. Every clip already published on an event
         page, reusing the poster that event already committed. Nothing here is
         hand maintained, but the page BAKES the list (ITEMS), so a clip joins
         or leaves the tape only when this runs. newevent.py and takedown.py
         call build() (10/11); after editing a night's clips by hand, run it.

⛔ VIDEO IS NEVER SERVED FROM A RELEASE ASSET. GitHub types every one of them
   application/octet-stream + content-disposition: attachment and iOS Safari
   refuses to play that. Playable clips come off the media repo's Pages site or
   out of this repo; the release URL is only ever a download.

⛔ EVERY POSTER CARRIES width/height. The grid sizes a tile from the poster's
   aspect, and a lazy image with no intrinsic size collapses to nothing, which
   is what once rendered two whole event galleries as a column of hairlines.

⚠️ Bandwidth is the real ceiling here, not disk. 37 autoplaying clips would put
   a gigabyte on the wire per visit, so every <video> is preload="none", the
   grid ships posters only, and the lightbox clears src on close. The lightbox
   is a swipe strip (10/22) with ONE <video> that moves to the slide you land on.

⛔ THIS TEMPLATE IS THE PAGE. A fix made only in video/index.html is gone on the
   next run (the 10/22 UX sweep's /video/ fixes lived only there until they were
   ported back here the same day).
"""
import html
import io
import json
import os
import re
import sys
from datetime import datetime

ROOT   = os.path.dirname(os.path.abspath(__file__))
EVENTS = os.path.join(ROOT, "events")
OUT    = os.path.join(ROOT, "video")
SITE   = "https://0fftheprint.com"


def dur_str(seconds):
    s = int(round(seconds or 0))
    return f"{s // 60}:{s % 60:02d}"


def night_items(skip=()):
    """Every clip already on an event page, pointed at that page's own poster.

    `skip` is content/video.json's exclude_nights: a night whose clips stay on its
    own dump but do not ride the tape. The tape is curated, the event page is the
    record, and those are allowed to disagree."""
    out = []
    for slug in sorted(os.listdir(EVENTS)):
        if slug in skip:
            continue
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
    cfg = json.load(open(os.path.join(ROOT, "content", "video.json")))
    cuts = cfg["items"]
    for c in cuts:
        c.setdefault("kind", "CUT")
    skip = set(cfg.get("exclude_nights", []))
    if skip:
        print(f"  nights kept off the tape: {', '.join(sorted(skip))}")
    items = cuts + night_items(skip)

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
    # the template's binder.js / binder.css tags carry no ?v=; every rebuild used
    # to strip the stamps stamp.py had put on the page
    sys.path.insert(0, ROOT)
    from stamp import stamp_text
    page = stamp_text(page)
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
  .tab{background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:999px;min-height:44px;display:inline-flex;align-items:center;
    padding:9px 16px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;
    text-transform:uppercase;cursor:pointer}
  .tab.on{color:#12070f;background:var(--pink);border-color:var(--pink);font-weight:600}
  /* A RAIL, same grammar as the homepage. 28 of the 35 pieces here are 9:16, so
     vertical is what this page actually is and the tile is 9:16 native.
     ⚠️ A horizontal scroller has to LOOK scrollable: styled scrollbar, and column
     widths that leave the next card PEEKING rather than ending flush. */
  .grid{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(180px,1fr);
    gap:12px;overflow-x:auto;scroll-snap-type:x proximity;margin-top:4px;
    padding-bottom:10px;-webkit-overflow-scrolling:touch;
    scrollbar-width:thin;scrollbar-color:var(--pink) transparent}
  .grid::-webkit-scrollbar{height:6px}
  .grid::-webkit-scrollbar-thumb{background:var(--pink);border-radius:999px}
  @media(min-width:760px){.grid{grid-auto-columns:minmax(210px,1fr)}}
  .card{background:transparent;border:0;padding:0;text-align:left;cursor:pointer;color:inherit;
    display:block;width:100%;font:inherit;scroll-snap-align:start}
  .shot{position:relative;display:block;border-radius:12px;overflow:hidden;
    border:1px solid var(--line);background:#141119}
  /* the poster's own aspect drives the tile. A lazy img with no w/h collapses
     to 2px and takes the whole column with it. */
  /* ⛔ THE TILE IS A FIXED 9:16, so a rail cannot go ragged. The 28 vertical
     posters fit it exactly. The 7 landscape night clips are LETTERBOXED, his call:
     a wide club frame centre cropped to 9:16 threw away most of the room, and the
     room is the subject of a night clip. Contain, on the page's own ground so the
     bars read as the card and not as a broken image. */
  .shot{aspect-ratio:9/16}
  .shot img{width:100%;height:100%;display:block;object-fit:cover}
  .shot img.main{width:100%;height:100%}
  .shot.wide{background:#0a0a0d}
  .shot.wide img.main{object-fit:contain;position:relative;z-index:1}
  /* A 16:9 frame contained in a 9:16 tile only fills 81/256 of it, so two thirds
     of the card was dead black and read as a broken image. The dead space gets a
     blurred, darkened copy of the SAME poster (same URL, so no second request) and
     the tile reads as a deliberate window. Kept heavy and dim on purpose: it is
     ground, not a second picture competing with the frame. */
  .shot.wide .bed{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
    filter:blur(22px) saturate(1.15) brightness(.42);transform:scale(1.15);z-index:0}
  .shot.wide::after{content:'';position:absolute;left:0;right:0;top:50%;
    height:calc(100% * 81 / 256);transform:translateY(-50%);
    box-shadow:0 0 0 1px rgba(255,255,255,.09);pointer-events:none;z-index:2}
  .card:hover .shot{border-color:var(--pink)}
  .ply{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;
    color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.65);opacity:.92}
  .dur{position:absolute;right:7px;bottom:7px;background:rgba(8,6,10,.82);
    font-family:'JetBrains Mono',monospace;font-size:11px;padding:3px 7px;border-radius:5px;color:#fff}
  .kd{position:absolute;left:7px;top:7px;font-family:'JetBrains Mono',monospace;font-size:11px;
    letter-spacing:.16em;padding:3px 7px;border-radius:5px;background:rgba(8,6,10,.82);color:var(--pink)}
  .ti{display:block;margin-top:9px;font-family:'Saira Condensed',sans-serif;font-style:italic;
    font-weight:900;text-transform:uppercase;font-size:16px;line-height:1.04}
  .fr{display:block;margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:11px;
    letter-spacing:.12em;text-transform:uppercase;color:var(--muted);line-height:1.45}
  .empty{color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:12px;padding:30px 0}
  .railnote{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--muted);margin-top:12px}
  /* ---- lightbox = THE STRIP (10/22, his ask: "scroll left and right to scroll through ... instead
     of having to go in and out of each video"). Every piece in the rail is a slide in ONE horizontal
     scroller: a finger or trackpad swipe lands on the next piece, the arrows and arrow keys step it.
     ⛔ ONE <video> for the whole strip. It moves into the slide that comes to rest, so only that
     slide ever has a src (the bandwidth rule), and a phone that let it play once lets it play on
     every slide after (iOS unlocks the element, not the page). Posters load two slides either side. */
  .lb{position:fixed;inset:0;background:#060508;display:none;z-index:60}
  .lb.on{display:block}
  .lb-track{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;
    scroll-snap-type:x mandatory;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
    touch-action:pan-x pinch-zoom;scrollbar-width:none}
  .lb-track::-webkit-scrollbar{display:none}
  .lb-s{flex:0 0 100%;min-width:0;height:100%;scroll-snap-align:center;scroll-snap-stop:always;
    display:grid;grid-template-rows:minmax(0,1fr) auto;
    padding:calc(56px + env(safe-area-inset-top,0px)) 14px calc(12px + env(safe-area-inset-bottom,0px))}
  .lb-m{min-height:0;display:grid;place-items:center;container-type:size}
  /* the frame takes the clip's own shape, as big as the slide allows (container units) */
  .lb-f{position:relative;aspect-ratio:var(--ar);width:100%;width:min(100cqw,100cqh * var(--ar));
    max-width:100%;max-height:100%;border-radius:10px;overflow:hidden;background:#000}
  .lb-f img,.lb-f video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;
    display:block;background:#000}
  .lb-bar{display:flex;gap:4px 14px;align-items:baseline;flex-wrap:wrap;padding:10px 4px 0}
  .lb-t{font-family:'Saira Condensed',sans-serif;font-style:italic;font-weight:900;
    text-transform:uppercase;font-size:20px}
  .lb-l{font-size:13px;color:var(--muted);flex:1 1 240px;line-height:1.5}
  .lb-bar a{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--pink);text-decoration:none;display:inline-flex;
    align-items:center;min-height:44px;padding:0 2px}
  /* where you are in the run that went up together: 3 / 10 · THRIFT @ THE WAREHOUSE */
  .lb-top{position:absolute;top:env(safe-area-inset-top,0px);left:0;right:64px;min-height:56px;
    display:flex;align-items:center;gap:12px;padding:0 18px;pointer-events:none;white-space:nowrap;
    overflow:hidden;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--muted)}
  .lb-c{color:var(--pink);flex:none}
  .lb-g{overflow:hidden;text-overflow:ellipsis}
  /* ⛔ the arrows and the close carry their own type: the old shared `.lb button` rule out-ranked
     .nav and .lb-x, so all three drew as 11 px pink text 12 px wide and nobody found them */
  .lb .lb-x,.lb .nav{position:absolute;display:grid;place-items:center;min-width:48px;min-height:48px;
    padding:0;border:0;background:transparent;color:#fff;cursor:pointer;line-height:1;
    font-family:Inter,system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.85)}
  .lb .lb-x{top:calc(4px + env(safe-area-inset-top,0px));right:6px;font-size:30px}
  .lb .nav{top:50%;transform:translateY(-50%);font-size:46px;opacity:.8}
  .lb .nav:hover{opacity:1}
  .lb .nav:disabled{opacity:.18;cursor:default}
  .pv{left:4px}.nx{right:4px}
  .foot{margin-top:46px;padding-top:20px;border-top:1px solid var(--line);
    font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--muted);line-height:2}
  .foot a{color:var(--pink);text-decoration:none}
</style>
<link rel="stylesheet" href="../assets/css/binder.css">
<script src="../assets/js/binder.js" defer></script>
</head>
<body>
<div class="leopard-bar"></div>
<div class="wrap">
  <a class="back" href="../">&larr; 0FF THE PRINT</a>
  <h1>The Tape</h1>
  <div class="sub">__COUNT__ pieces &nbsp;·&nbsp; __NCUT__ cuts &nbsp;·&nbsp; __NNIGHT__ off the nights</div>
  <div class="tabs" id="tabs"></div>
  <div class="grid" id="grid"></div>
  <div class="railnote" id="railnote"></div>
  <div class="foot">
    Shot by 0FF THE PRINT &nbsp;·&nbsp; <a href="https://instagram.com/vamppsych">@vamppsych</a><br>
    Every drop gets a number. <a href="../#catalog">The catalog &rarr;</a>
  </div>
</div>

<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="The Tape">
  <div class="lb-track" id="lbtrack"></div>
  <div class="lb-top" aria-live="polite"><span class="lb-c" id="lbc"></span><span class="lb-g" id="lbg"></span></div>
  <button class="lb-x" id="lbx" type="button" aria-label="Close">&times;</button>
  <button class="nav pv" id="lbp" type="button" aria-label="Previous">&#8249;</button>
  <button class="nav nx" id="lbn" type="button" aria-label="Next">&#8250;</button>
  <video id="lbv" controls playsinline preload="none" hidden></video>
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
  const note = document.getElementById('railnote');
  if (!view.length){ grid.innerHTML = '<div class="empty">nothing here yet</div>';
    if (note) note.textContent = ''; return; }
  if (note) note.textContent = view.length + ' in this rail \u00b7 scroll \u2192';
  grid.innerHTML = view.map((m,i) => {
    const p = safeUrl(m.poster);
    // landscape posters are letterboxed into the 9:16 tile, not cropped
    const wide = (m.w || 0) > (m.h || 0);
    return '<button class="card" data-i="'+i+'" type="button">'
      + '<span class="shot' + (wide ? ' wide' : '') + '">'
        + (p ? (wide ? '<img class="bed" src="'+esc(p)+'" alt="" aria-hidden="true" loading="lazy">' : '')
             + '<img class="main" src="'+esc(p)+'" alt="" loading="'+((window.__vN=(window.__vN||0)+1)<=6?'eager':'lazy')+'" width="'+(m.w||520)+'" height="'+(m.h||924)+'">' : '')
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

/* ---- lightbox = THE STRIP (10/22): swipe, trackpad, arrows or arrow keys, piece to piece ---- */
const lb = document.getElementById('lb'), track = document.getElementById('lbtrack'),
      lbv = document.getElementById('lbv'), lbc = document.getElementById('lbc'),
      lbg = document.getElementById('lbg'), lbp = document.getElementById('lbp'),
      lbn = document.getElementById('lbn');
const SMOOTH = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
let at = -1;        /* the slide holding the video */
let shown = -1;     /* the slide the counter names */
let aim = null;     /* where an arrow press is headed while the strip glides */
let built = null;   /* the rail the strip was cut for */
let held = false;   /* the video paused itself because a swipe took it off screen */
let settleT = 0;

/* one slide per piece in the rail; posters wait in data-src until the strip gets near them */
function strip(){
  lb.appendChild(lbv); lbv.hidden = true;      /* out of the old strip before it is replaced */
  track.innerHTML = view.map((m, i) => {
    const p = safeUrl(m.poster), link = safeUrl(m.link), full = safeUrl(m.full);
    const ar = (m.w > 0 && m.h > 0) ? (m.w / m.h).toFixed(4) : '0.5625';
    return '<div class="lb-s" data-i="' + i + '" style="--ar:' + ar + '">'
      + '<div class="lb-m"><div class="lb-f">' + (p ? '<img alt="" data-src="' + esc(p) + '">' : '') + '</div></div>'
      + '<div class="lb-bar"><span class="lb-t">' + esc(m.title) + '</span>'
        + '<span class="lb-l">' + esc(m.line) + '</span>'
        + (link ? '<a href="../' + esc(link) + '">' + esc(m.from || m.title) + ' →</a>' : '')
        + (full ? '<a href="' + esc(full) + '" target="_blank" rel="noopener">full res ↓</a>' : '')
      + '</div></div>';
  }).join('');
  built = view; shown = -1;
}
const W = () => track.getBoundingClientRect().width || 1;
const idx = () => Math.max(0, Math.min(view.length - 1, Math.round(track.scrollLeft / W())));

function near(i){
  for (let k = i - 2; k <= i + 2; k++){
    const im = track.children[k] && track.children[k].querySelector('img[data-src]');
    if (im){ im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); }
  }
}
/* 3 / 10: this piece inside the run of pieces that share its `from`, i.e. what went up together */
function label(i){
  if (i === shown || !view[i]) return;
  shown = i;
  const f = view[i].from;
  let a = i, b = i;
  while (a > 0 && view[a - 1].from === f) a--;
  while (b < view.length - 1 && view[b + 1].from === f) b++;
  lbc.textContent = (i - a + 1) + ' / ' + (b - a + 1);
  lbg.textContent = f || '';
  lbp.disabled = i === 0; lbn.disabled = i === view.length - 1;
  near(i);
}
/* the one <video> moves into slide i and plays it */
function play(i){
  const s = track.children[i], m = view[i];
  if (!s || !m) return;
  at = i; held = false; label(i);
  lbv.pause();
  s.querySelector('.lb-f').appendChild(lbv);
  lbv.poster = safeUrl(m.poster) || '';
  lbv.src = safeUrl(m.src);
  lbv.hidden = false;
  /* the open piece is in the address, so it can be copied and sent (replaceState: no history pile, no hashchange) */
  try { if (m.slug) history.replaceState(null, '', '#' + m.slug); } catch (e) {}
  lbv.play().catch(()=>{});          /* a blocked autoplay is fine, controls are there */
}

function show(i){
  if (!view.length) return;
  if (built !== view) strip();
  lb.classList.add('on');
  document.documentElement.style.overflow = 'hidden';      /* the page behind stays put */
  i = Math.max(0, Math.min(view.length - 1, i));
  aim = null; shown = -1;
  track.scrollLeft = i * W();
  play(i);
}
/* ⛔ clear src on close or the clip keeps downloading behind the closed lightbox */
function hide(){
  clearTimeout(settleT);
  lb.classList.remove('on'); lbv.pause(); lbv.removeAttribute('src'); lbv.load();
  document.documentElement.style.overflow = '';
  /* the rail waits on the piece the strip stopped at */
  const c = at >= 0 && grid.querySelector('.card[data-i="' + at + '"]');
  if (c) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  at = -1; aim = null; held = false;
  try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
}

/* the strip came to rest: the slide it rests on gets the video */
function settle(){
  clearTimeout(settleT);
  if (!lb.classList.contains('on')) return;
  aim = null;
  const i = idx();
  if (i !== at) play(i);
  else if (held){ held = false; lbv.play().catch(()=>{}); }
}
track.addEventListener('scroll', () => {
  if (!lb.classList.contains('on')) return;
  const i = idx();
  label(i);
  /* past halfway to the next piece: the one leaving goes quiet */
  if (i !== at && !lbv.paused){ lbv.pause(); held = true; }
  clearTimeout(settleT); settleT = setTimeout(settle, 160);
}, { passive: true });
if ('onscrollend' in window) track.addEventListener('scrollend', settle);

function go(d){
  if (!lb.classList.contains('on')) return;
  const base = aim == null ? idx() : aim;
  const i = Math.max(0, Math.min(view.length - 1, base + d));
  if (i === base) return;
  aim = i;
  track.scrollTo({ left: i * W(), behavior: SMOOTH });
}

grid.addEventListener('click', e => {
  const b = e.target.closest('.card'); if (b) show(+b.dataset.i);
});
document.getElementById('lbx').addEventListener('click', hide);
lbp.addEventListener('click', () => go(-1));
lbn.addEventListener('click', () => go(1));
/* a tap on the dark around a piece closes it */
track.addEventListener('click', e => {
  const t = e.target;
  if (t.classList && (t.classList.contains('lb-s') || t.classList.contains('lb-m'))) hide();
});
document.addEventListener('keydown', e => {
  if (!lb.classList.contains('on')) return;
  if (e.key === 'Escape') hide();
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); go(-1); }
  else if (e.key === 'ArrowRight'){ e.preventDefault(); go(1); }
});
/* a trackpad or a mouse wheel: one swipe = one piece, whichever way it leans. Left native, a laptop
   swipe had to carry half a 1280 px slide or the snap pulled it back (seen 10/22: 283 px, back to 0).
   Phones never get here (a finger sends no wheel events) and keep the native snap. A swipe glides on
   for a second, so a step waits for that glide to end, or for a fresh surge (a second swipe inside it). */
let wT = 0, wMag = 0, wStep = 0, wArmed = true;
lb.addEventListener('wheel', e => {
  if (e.ctrlKey) return;                       /* a trackpad pinch is zoom, leave it */
  e.preventDefault();
  const d = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const mag = Math.abs(d) * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
  const now = performance.now();
  if (now - wT > 220) wArmed = true;
  else if (mag > 30 && mag > wMag * 1.8 && now - wStep > 260) wArmed = true;
  wT = now; wMag = mag;
  if (wArmed && mag >= 4){ wArmed = false; wStep = now; go(d > 0 ? 1 : -1); }
}, { passive: false });
addEventListener('resize', () => {
  if (at >= 0 && lb.classList.contains('on')) track.scrollLeft = at * W();
});

/* ---- a link straight to one piece: video/#<slug> (10/4) ----
   The homepage's tape rail sends every card here by its slug, so a tap on a cut opens THAT cut
   instead of dropping somebody at the top of fifty six. Slugs are ours (video.json, or <night>-NN);
   one that matches nothing is ignored and the page is just the tape. */
function fromHash(){
  let s = '';
  try { s = decodeURIComponent((location.hash || '').slice(1)); } catch (e) { return; }
  if (!s || s.length > 96) return;
  const i = ITEMS.findIndex(m => m.slug === s);
  if (i < 0) return;
  if (view !== ITEMS) { [...tabs.children].forEach(c => c.classList.remove('on')); tAll.classList.add('on'); draw(null); }
  show(i);
}
window.addEventListener('hashchange', fromHash);
fromHash();
</script>
</body>
</html>
"""
PAGE = PAGE.replace("SITEURL", SITE)

if __name__ == "__main__":
    build()
