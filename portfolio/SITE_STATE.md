# CHROME DIGICAM — site state (saved Jul 15 2026, updated Jul 30)

> NEW SESSION START HERE: read this file + the job-hunt-2026 memory. Site is LIVE and current. As of Jul 30 2026 the homepage is SPLIT-FILE (see Architecture below): CSS lives in `assets/css/`, JS in `assets/js/`, `index.html` is markup only. Edit the file that owns the thing, bump its `?v=` stamp in BOTH `index.html` and `index-kawaii.html` (or `cp index.html index-kawaii.html` after HTML edits), commit, push. Verify visual changes with HEADLESS Chrome (see Gotchas), not just the preview pane.

## ⛔ THE ARCHIVE STALL, AND THE BUG THE NEW VIDEO INTRODUCED (Sep 2 2026)

His report: "the archives had a lot of struggle loading." Two separate causes, both fixed.

**1. `#archive` fires EIGHT videos at once.** It holds two `.tapes` rows (4 SA Current + 4 Legion
Ink), and the observer played all eight the instant the section intersected. **None of them had a
`poster`**, so every tile was a black box until bytes landed: 5.2MB opening in one burst behind
eight blank rectangles. Fixed two ways:
- **Every video on the page now has a poster** (14 of 14, generated at t=0.3s). An off-screen tape
  costs nothing (`preload="none"`) and an on-screen one shows a frame before any video arrives.
- **Autoplay starts are queued 220ms apart** (`tapeQ` / `pumpTapes` in `main.js`). Measured on the
  exact queue: 8 starts, min gap 220ms, spread 1767ms, instead of 8 simultaneous sockets.
- Also gated on `navigator.connection.saveData` now, not just `prefers-reduced-motion`.

⛔ **DO NOT re-encode the tapes to save bytes. It was tried and measured, twice.** At CRF 30 +
750k cap the concert clips fall to **30.8 dB PSNR (tape3)**, which is visible mush on a portfolio.
At CRF 25 the files come back **7-9% LARGER** than the originals. They are already at their
efficient point; the fix was never the bitrate, it was the burst and the missing posters.

**2. ⛔ The new `.tape.play` videos were being hijacked by BOTH scripts.** `.tape.play` matched the
selector `.tape video`, so:
- `main.js` autoplayed them (they are UNMUTED, with controls) and **paused them on scroll**, which
  would stop an interview cut somebody was deliberately watching the moment it left the viewport.
  It also defeated `preload="none"` by forcing the fetch.
- `a11y.js` put `role="button"` + `tabindex=0` + "Client tape preview" on them, which **masks the
  native controls from a screen reader** and added a click handler fighting the real ones.

Both selectors are now **`.tape:not(.play) video`**. The four cuts carry real `aria-label`s in the
markup instead. Verified: observer watches 10 elements not 14, the 4 cuts report `role:null`, and
they request **zero bytes** until someone presses play.

⚠️ **Measuring this is genuinely hard, log the traps:** `javascript_tool` cannot scroll (scrollY
stays 0) even fronted, even inside an iframe. Headless Chrome CAN, but `html{scroll-behavior:smooth}`
in `_reset.css` means `scrollTo` never lands under `--virtual-time-budget` -> set
`scrollBehavior='auto'` first. And **media element fetches do not appear in
`performance.getEntriesByType('resource')`**, so an mp4 count of 0 there proves nothing; hook
`HTMLMediaElement.prototype.play` or read `video.paused` instead.

## NIGHTS grew three blocks and learned to play video (Sep 2 2026)

`#nights` went 5 blocks to 8, and gained the first self-hosted video with SOUND on the homepage.
Section intro gained one word ("touring rooms") because a national tour date is not a club night.

- **ANDREW E. / STABLE HALL** (`assets/stablehall/sh_01..08.jpg`) Aug 29, the concert.
- **ANDREW E. / SARI-SARI** (`assets/andrewe/ae_01..08.jpg`) Aug 30, the sit-down the next day.
  Carries a video row and the weekend montage.
- **CLOWN CHURCH** (`assets/clownchurch/cc_01..08.jpg`) Aug 30, Rah Rah Room. Frames re-pulled
  from the INSOMNIA render (his call for the public dump), NOT the Oppenheimer selects folder,
  by mapping `_grade/selects_names.json` back to source stems.

⛔ **THE REM GATE IS CLEARED, and that is why Aug 29 is publishable at all.** Niko Rivera replied
2026-09-01: "Yea please go ahead and post please tag rem page please", then asked for his Facebook
for photo credit on 9/2. The Stable Hall credits line ends "Promoter: REM Entertainment &
Productions" to honour that. Do not remove it.

### `.tape.play`, the new component in `components/_tapes.css`
`.tape` was a silent 1.7s loop. `.tape.play` is a real player: `controls`, audio, `preload="none"`
plus a `poster`, so the page only pays ~80KB per tile until someone presses play. Four videos on the
page total 16.8MB and NONE of it downloads on load.
- `.tapes.watch` widens the row to 215px minimum; `.tapes.solo` forces ONE column for the montage.
- ⛔ **The native control bar owns the bottom ~40px.** `.t-dur` was at `bottom:8px` and collided
  with the scrubber; it lives at `bottom:46px` now and is `display:none` under 640px.
- Posters are pulled at t=2.0s deliberately: the burned-in question overlay is up by then, so each
  thumbnail says what it is ("WHAT DID SAN ANTONIO SOUND LIKE LAST NIGHT?") with no title card.

### The montage rule was followed, not bypassed
He rejected 9 Clown Church montages and pulled `AndrewE_The-Next-Day` on 9/1. So all three surviving
cuts were re-encoded small, sent to him, and **he watched them and picked 48 HOURS**. ⛔ Never put a
scripted montage on this site without that step.

⚠️ **Verifying this needed the viewport set explicitly.** `javascript_tool` runs in a hidden tab whose
viewport collapses to ~22px wide, so every `getBoundingClientRect()` is garbage and every
`loading="lazy"` image reports `naturalWidth:0` (the EXISTING blocks report broken too, so a 0 is not
evidence of a bug). Call `resize_window` to 1280 first, flip lazy images to eager, THEN measure. Once
sized: all 3 new grids measured hero 662x669 against a 662 two-square stack, hole = 7px, identical to
zenhaus / legionink / mixhorror. `mix_01` still measures a 172px hole, the known `mix_02` 1120x1400 bug.
Mobile at 375: scrollWidth 356, zero overflow offenders.

## NIGHTS grew two blocks (Aug 26 2026)

`#nights` went from 3 blocks to 5. Same markup pattern as the others (clip-label, `.blue-grid`
of 8, `p.client-credits`), so nothing structural changed and the PAGES/bands array is untouched.

- **LEGION INK** (`assets/legionink/li_01..08.jpg`) — Smiley Onerr's tattoo shop on N New
  Braunfels, Aug 21. Built as a photo ESSAY, not a highlight reel: place, person, craft, tools,
  room, finished piece, out front. The 7 delivered `00 SELECTS` were NOT used, because four of
  them are near-identical "him bent over working" frames and shipping those together is exactly
  what the Jul 30 repeat audit exists to prevent. Pulled from the 27-frame graded NATURAL set
  instead.
- **THE MIX / RESIDENT EVIL VS SILENT HILL** (`assets/mixhorror/mh_01..08.jpg`) — the Aug 25
  horror night. Second Mix block, so the clip-label carries the theme, not just the venue, or
  the two read as duplicates.
- The section intro gained one clause ("and the shops that keep the same street alive in the
  daytime") because Legion Ink is a daytime shop and the old line said "club nights, bar nights,
  showcases." The h2 "I shoot the room the way it felt" already covered it.

⛔ **`.bluep.bhero` MUST BE 1:1 OR THE GRID GETS A HOLE.** The math: `.blue-grid` is 3 cols,
14px gap, max-width 1000 → col = 324px. bhero spans 2 cols = 662px wide, and the two square rows
beside it are 2*324+14 = 662px tall. So a bhero at anything but 1:1 is taller than the stack next
to it and leaves dead space. Shipped a 4:5 hero on both new blocks, saw the hole in the headless
render, rebuilt at 1400x1400. **zenhaus was right all along (1400x1400); `themix` mix_02 is
1120x1400 and still has this bug.** Sizes that work: bwide 1600x842, bhero 1400x1400, squares
1200x1200, q86 progressive.

⚠️ Verifying this needed `?proof` — a plain headless capture of the homepage renders the scroll
reveals unfired and you get a tall page of hero photo. Use `http://127.0.0.1:PORT/?proof`.
The Browser pane honours a 375 resize but **will not scroll in a hidden tab** (`scrollY` stays 0),
so measure element rects for overflow instead of trying to screenshot a scrolled position.
`body{overflow-x:hidden}` masks overflow from `scrollWidth`, so check `getBoundingClientRect()`
on the children, which is what was done here (0 offenders at 375).

## Architecture (added Jul 30 2026 — modeled on his mom's stanthony-olph.org build)

Monolith split into st-anthony-style partials. His words: "apply this type of coding and design
to our website." Byte-verified extraction (reassembly matched the old inline blocks exactly;
before/after headless captures diffed at the same-build noise floor).

- `assets/css/base/` — `_variables.css` (ALL tokens: palette, fonts, spring, shadows),
  `_reset.css`, `_base.css` (.wrap, h2, .kicker, section lace, .pxchain).
- `assets/css/layout/` — `_nav.css`, `_hero.css` (hero + marquee), `_bands.css` (page-break
  dividers), `_mobile-nav.css` (swipe chips), `_footer.css`.
- `assets/css/components/` — `_chrome.css` (soft camera chrome), `_playback.css`,
  `_photomode.css` (photo grid + A/B slider), `_kinetic.css`, `_tapes.css`, `_monitors.css`,
  `_about.css`, `_rates.css`, `_floating.css` (fab stack + share sheet), `_totop.css`
  (back-to-top + covered-text fixes).
- `assets/js/` — `main.js` (looks/PP chip, kinetic, lightbox, observers, ?proof hook),
  `a11y.js` (post-review video a11y patch), `share.js`, `bands.js` (PAGES array + section nav).
- **LINK ORDER IS THE CASCADE.** The 18 `<link>` tags in `index.html` are in the original
  source order of the old inline block; specificity ties resolve by that order. Never reorder
  or alphabetize them.
- **url() paths inside the CSS files are root-absolute** (`/assets/...`, `/steel/...`) because
  stylesheet-relative would resolve against `assets/css/...`. Keep them root-absolute; they
  work on Pages, the custom domain, and `http://localhost` — but NOT `file://` (always verify
  through a server, which was already the rule).
- **Cache-busting `?v=YYYYMMDD`** on every link/script tag, mom-style. Bump the stamp on the
  file(s) you touched or phones keep the stale cached one.
- `/dream/`, `/steel/`, `/bethel/`, `/photoshoots/`, `index-camera.html` stay standalone
  single-file faces on purpose (art pieces / client page); only the homepage got the
  architecture.

## Copy density pass (Jul 30 2026, his ask "cut this down, simpler and cleaner")

Page went 1,813 -> 1,607 visible words with ZERO facts removed. Everything cut is either
tightened prose or moved one tap deep. Rates section carried the most: 497 -> 331 words.

- **`.more` disclosure component** (`components/_disclosure.css`) = the reusable pattern for
  "detail one tap deep," lifted from how his mom's bulletin hides its PDF archive. Native
  `<details>`, no JS. Markup: `<details class="more"><summary><span><b>LABEL</b>
  <span class="n">plain-language teaser</span></span></summary><div class="more-body">…`.
  The teaser is load-bearing: a collapsed block must still say what is inside and roughly what
  it costs, or it reads as hidden rather than tidy.
- RATES now shows the **7 core packages** open; **COMMERCIAL WORK** (3 tiers) and
  **ADD-ONS + HOURLY** (9 items) collapse. Nothing was deleted, all 10 packages and every a la
  carte line are still on the page. Market-range lines stay on every card (his Jul 23 call).
- Fine print split into two lines: turnaround promise first (the thing clients actually need),
  terms second. Was one 40-word run-on.
- Prose tightened in INFO (3 paragraphs to 2), the three lane cards, and the SA Current
  paragraph. Facts, numbers, and the award phrasing untouched.
- Verified: no console errors, no horizontal overflow at 375px, disclosure bodies do not
  overflow their container open or closed, headless renders checked at 1100px and 500px.

## Repeated-image audit (Jul 30 2026, his ask "there some pics that repeat")

Hashed every image on the page (md5 + dhash/ahash), built contact sheets per gallery, then ran
a 5-lens adversarial workflow. THREE real repeats found and fixed:

1. **`assets/hero.jpg` IS `assets/stills/01_globe-wide.jpg`** (identical dhash `fcf4f4fed6caaa51`).
   The full-bleed hero was showing again as the first PHOTO MODE tile. Worst one, since it is
   the first thing anyone sees. FIX: dropped `01_globe-wide` from the `stills` array in
   `assets/js/main.js`. The hero keeps the frame.
   **This one was invisible to a DOM `<img>` scan** because the hero is a CSS background in
   `layout/_hero.css`. Any future image audit MUST include CSS `url()` refs.
2. **`03_beam-dome` vs `04_moon-dome`**: same moon, same beam, seconds apart, in ADJACENT tiles.
   FIX: dropped `04`, kept `03` (wider, shows the beam and the performer).
3. **`photo_06` vs `photo_10`** in the SA Current STILLS PULL: same guest in a crown at the gold
   sequin backdrop, two frames of one burst, sitting at both ends of the row. FIX: removed
   `photo_10.jpg` + `thumb_10.jpg` (deleted, kept `06` which is 1000px wide vs 900 and has more
   contrast). Grid is now 9. Placeholder alts ("Top Shelf event photo N of 10") replaced with
   real descriptions while in there.

**DO NOT delete `01_globe-wide.jpg` or `04_moon-dome.jpg` from disk.** `/steel/`, `/dream/`, and
`index-camera.html` all still list them in their own gallery arrays. They are unreferenced by the
homepage only. Caught this after `git rm` and restored them; check every alt face before removing
any shared asset.

Checked and found CLEAN (do not "fix" these, they are correct):
- thumb_NN matching its own photo_NN, and `_web` matching its own `_full` (kit cards, contact card)
- `grade_source` vs `grade_sludge` (deliberately one frame, two states, for the A/B slider)
- the contact card appearing in both the footer and the SHARE sheet (deliberate)
- `blue/` (8 frames, one model) and `projects/` LIT sessions (3 subjects) are portrait SERIES,
  not repeats
- `assets/feed/bw_*.jpg` and `color_*.jpg` are unreferenced leftovers on disk, only
  `tt_avatar.jpg` is used. Not shown on the page, left alone.
- decorative repeats are intentional: `ribbon_bow.png` x3, `charm.png` x2, washi tapes on most tiles

## Live
- Homepage: https://carlo72400-pixel.github.io/  (this is the front door now)
- Repo: carlo72400-pixel/carlo72400-pixel.github.io, source in this folder.
- Deploy: edit the owning file under `assets/css/` / `assets/js/` (or `index.html` for markup), bump `?v=`, `git add -A && git commit && git push`. If Pages sticks on "building", POST to `/pages/builds` via gh.
- `index-kawaii.html` is a kept-identical copy of `index.html` (the old preview link); `cp index.html index-kawaii.html` after HTML changes to keep them matched. CSS/JS edits reach both automatically (both link the same files).

## Alt faces (all reachable, not the front door)
- `/index-camera.html` — the old Camera Interface homepage, preserved.
- `/dream/` — DREAM IN LOG.
- `/steel/` — CHROME & ROSES.
- `/bethel/` — CLIENT PROPOSAL, not a theme. Live media + growth plan for Bethel United
  Methodist Church (227 S Acme Rd, SA). Standalone, `noindex`, deliberately NOT linked from the
  nav so it is shareable-by-link only. Interactive first-year cost estimator, quoted + linked
  sources, 12 Golden Hour Sanctuary plates in `bethel/img/`. Source of truth for rebuilds is the
  scratchpad template + `slideart/` `slideart2/`; the page carries its own `<head>` and OG card
  (`preview.jpg`, 1200x630) so the link previews when he texts or emails it.
- `/theink/` — SUBJECT-FACING TREATMENT for 0FF THE PRINT Interview 02 (Smiley Onerr,
  tattoo artist at Legion Ink). Same pattern as `/bethel/`: standalone, `noindex`, NOT in the
  nav, own `<head>` + OG card so it previews in an IG DM. Register is the OUTLET's, not this
  site's: 0FF THE PRINT pink/chrome/feral-black, tokens copied from
  `03_PROJECTS/0ff-the-print/index.html`. Do not decoden it, it is not a portfolio page.
  Source of truth is `03_PROJECTS/0ff-the-print/interviews/TREATMENT-02-the-ink.html`; this
  copy is that file with a `<head>` wrapped around it, so edit there and re-wrap.
- `/rise/` — THE TEXAS TAKEOVER (added Aug 18 2026): Kavman x Vamppsych plan page, same
  pattern as `/bethel/` (standalone, `noindex`, not in nav, own `<head>` + OG card
  `preview.jpg`). Register is Texas trill (Alfa Slab One + Permanent Marker + Inter/JBM,
  screwed purple + gold), NOT the site's decoden. Content: ACL 2026 reality check, Sept
  forge / Oct Austin / Nov-Dec circuit / SXSW 2027 phases, whiteboard-v2 redraw card,
  venue outreach list + pitch template. OG card source: `rise/og_rise.html` (headless
  1200x630 → `preview.jpg`). Source board photo + flat scan: `03_PROJECTS/kavman/`.
- `/gateway/` — THE 9.29 FILE (added Aug 18 2026): drop plan for VIRGOSGATEWAY (homie
  producer/engineer, IG @virgosgateway, NOT Kavman), same pattern as `/bethel/` (standalone,
  `noindex`, not in nav, own `<head>` + OG card `preview.jpg`). Register is declassified-file
  punk: manila paper, Special Elite/Courier Prime/Allerta Stencil/Permanent Marker, ransom-note
  letter chips, tap-to-unredact buttons, Zener card SVGs. Briefly lived at `/rise/929/` under
  the wrong artist (assumed Kavman) before being moved here; that URL is dead, don't revive it.
  OG card source: `gateway/og_src.html` (in-repo; render recipe in its top comment).
- `/lingers/` — THE SIDE THAT LINGERS (added Aug 29 2026): campaign plan for **$IPOR**
  (IG @fivecantell, YouTube @icohw, '99 Houston-born / SA-based, alternative underground rap).
  A THIRD homie, not Kavman and not Virgo. Same pattern as `/rise/` and `/gateway/`
  (standalone, `noindex`, not in nav, own `<head>` + OG card `preview.jpg`). Register is
  **void blue + blood red + bone**, Anton + Inter + JetBrains Mono, with the enneagram
  linework lifted off his own GHZ/SPAW cover art; structured as a **cassette: SIDE A = where
  he actually is, SIDE B = the run**, because his own release is VOIDYNT SIDE A / SIDE B.
  Content: an audited numbers table, the no-distribution blocker, the two SXSW doors
  (showcase app $35 closing Nov 20 2026; Film & TV Music Video Comp $70 by Sept 15), the
  Austin unofficial circuit, an honest "not yet" verdict on Atlanta plus the free remote ATL
  doors, the Texas triangle, a dated calendar to Mar 2027, and a "what I couldn't verify"
  section. OG card source: `lingers/og_src.html` (headless 1200x630 → `preview.jpg`).
  ⛔ **Every date, fee and venue on that page was fact-checked and several were killed**
  (A3C is dormant, Empire Control Room evicted, Elevator dormant, Hot 107.9's path is from
  2008). Do not "refresh" it from a search without re-verifying, and keep the two corrections
  noted in section 12 — his bio playlist link WORKS (an earlier audit had the ID wrong), and
  `@ic.ohw` is not a second account, it does not exist, which is why his YouTube→IG link 404s.
- `/brujas/` — same thing for 0FF THE PRINT Interview 03, THE PAGE (Angel, @avocado__papi,
  creator of the Brujas comic). Source of truth is
  `03_PROJECTS/0ff-the-print/interviews/TREATMENT-03-brujas.html`. Slug is the comic, not
  the seat, deliberately: `/thepage/` is one letter off `/theplan/` and he would send the
  wrong link. Every new interview treatment goes here the same way.

## Register
Pastel decoden / "kawaii AND professional." Ennaria pastels (blush, lilac, mint, baby blue, butter, peach) + silver chrome + white lace. Display font = Fraunces pushed to its Rogue-most axis (SOFT 100 / weight 640-680 / WONK 0). Body Inter, OSD JetBrains Mono. The real Kanye/Alamodome shot leads the hero full-bleed and regrades via the PP chip.

**BLACKLETTER = New Rocker (his pick, Jul 16).** The whole issue is the capital V in
"Vamppsych" — it keeps turning into another letter, and he has caught it twice. Render V
against W, B and U side by side before ever proposing a blackletter. Verdicts:
- `UnifrakturMaguntia` — **V reads as B** ("Bamppsych"). His words: tragic. Never use.
- `Grenze Gotisch` — a hairline splits the V's counter so it **reads as W**. He caught this
  one too. Never use.
- `Pirata One`, `Federant` — **V reads as U**.  `Ewert` — V reads as W.
  `Jacquarda Bastarda 9` — V unreadable.  `Almendra Display` — too light to read as gothic.
- **`New Rocker`** — clean unambiguous V, keeps real lowercase so the name stays a wordmark
  rather than a metal-band logo. HIS PICK.
- `Metal Mania` — also a clean V, heavy/angular/hardcore, renders small-caps. Runner-up,
  kept selectable.

He twice picked PAID Envato faces: Fayte (`fayte-blackletter-gothic-QRR868C`) then Darkgone
(`darkgone-gothic-blackletter-font-8P5HBRT`), both $16.50/mo, and both times said to find a
free one instead. If he ever buys one, drop the .otf in and wire a local `@font-face` — one
line per build.

Swap font via env: `BLACKLETTER=rocker|metal` on `contact-card/build_fullart_card.py`
(see `_BL` at the top; crest/set px are per-font because cap-heights differ). Also applied
by hand to `contact-card/build_contact_card.py` (legacy) and `card/build_front.py` +
`build_back.py` (the printable card had the identical bug).

## Sections (nav order)
INFO (Editor first + FIELD KIT camera cards) -> PHOTO MODE (concert stills + A/B grade slider) -> ARCHIVE (SA Current tapes incl. TAPE 04 lucha, STILLS PULL x10, LIT SESSIONS, EDITORIAL PORTRAIT WORK) -> PLAYBACK (VOLUME + 2 BTS, YouTube) -> FEED (2 IG reels + TikTok tile) -> RATES -> STANDBY footer.

## Interactive features (all working)
- Nav: sticky, section-aware; mobile = swipe chip row (all 7 sections). Nav tabs + in-page links route to the section's PAGE-BREAK BAND (JS in the last <script>), so tapping a tab lands on that chapter card.
- PAGE-BREAK BANDS: bold dark "film-slate" divider before each section (built by JS from a PAGES array: REEL 0N/07 + name + descriptor + lace trim). This is the "sections feel like pages" treatment (he chose full-screen breaks + keep-scroll). Band height clamp(300px,46svh,460px). NO scroll-snap (it hung the preview renderer; removed).
- Back-to-top: `#toTop` circle at top of the floating stack, `.show` toggles when scrollY > 85% of viewport.
- Hero: 100svh full-screen, PP chip cycles 6 looks, resize regrades. Hint wraps clear of the RATES/SHARE buttons on mobile; datestamp hidden < 640px.
- Floating buttons bottom-right: back-to-top + RATES (jumps to #rates) + SHARE.
- SHARE panel order CARDS -> socials -> rates. Shows the real contact card (front + back) as two `.sheet-card` tiles; tapping either opens the full-res PNG in the lightbox so the back's QR stays scannable. (Was the decoden-camera `qr_sticker.jpg`, replaced Jul 16 at his ask; that file is still on disk but unreferenced.)
- Hero PP chip is a picture-profile SELECTOR: live LED in each look's colour (`--pp-col` per `body[data-look]`), PP index, six dial ticks. `.lbl`/`.hnt` min-widths are load-bearing, the chip is right-anchored and pops without them. NOTE it sits ~50px below the fold at first paint (hero is 100svh but starts under the 59px sticky nav, so hero+nav > viewport); a small scroll reveals it. Pre-existing, left alone.
- Lightbox: centered, fits full image to screen (fixed the *{margin:0} top-left/chopped bug via margin:auto). Stills, LIT, blue grid, FIELD KIT cards open full-res.
- Photo A/B grade slider; SA Current + reel videos autoplay on scroll (viewport observer, reduced-motion aware); IG reels link to the real posts.
- `<meta color-scheme:light>` set so phone dark-mode stops darkening the pastel design.

## Key assets (assets/kawaii/ unless noted)
- Hero photo: assets/hero.jpg (Alamodome). Decoden camera: hero_camera_web.jpg + FIELD KIT cards in kit/.
- Mascots retired (kept in Reference/kawaii-src); current decor = ribbon bow, charm, pixel heart-curtain, f2u/ pastel pixel dividers, lace_trim. The `.doily` was REMOVED Jul 16 at his ask ("remove stray asset"): it was a half-doily rotated 180deg bled off the right edge (`right:-60px`), so it cropped into a grey scalloped blob that read as a mistake. `lace_doily_web.png` is still on disk, unreferenced. If adding decor that bleeds past an edge, check it does not crop into a shape that reads as broken.
- RIBBON ASSETS re-keyed Jul 16 (`ribbon_bow.png`, `ribbon_frame_clean.png`; originals in `Reference/kawaii-src/pre-rekey-backup/`). Both had 1-bit mattes with the white background still baked in opaque. Rebuilt from `Reference/kawaii-src/ribbon_frame_src.jpg` via `scratchpad/key_ribbon.py`. THE LESSON if they ever need redoing: key on CHROMA, not brightness. The cast shadow is pink-tinted and the satin HIGHLIGHTS run sat 21-32, so the flood threshold must sit BELOW them (sat<10) or the fill leaks through a highlight and bites chunks out of the bow. Pearls survive because pink encloses them. `binary_fill_holes` also seals the picture window, so punch it back out.
- `.reel-frame` border-image slice is MEASURED (108 113 110 107) off the 837x825 asset, never guessed. The old value 235 reached past the ~110px ribbon into the source's white margin and drew it as a white box. `background-clip:padding-box` is also load-bearing: `background:#fff` was painting under the transparent border.
- QR share sticker: qr_sticker.jpg.
- IG reels: reels/reel1_web.mp4 (+_poster), reels/reel2_web.mp4. Originals + all generated source PNGs archived in ~/Desktop/Vamppsych/05_REFERENCE/Reference/kawaii-src/.
- CONTACT CARD (added Jul 16): `assets/kawaii/card/card_{front,back}_full.png` (lightbox, PNG so QR scans) + `_web.jpg` (display). Shown in the #contact footer ("Let's cut something") as 2 washi-taped `.polaroid` + `.kitzoom` lightbox cards, AND in the SHARE sheet. Full-art highlighter style; built by `~/Desktop/Vamppsych/03_PROJECTS/contact-card/build_fullart_card.py` (that folder has the source PNGs). Front QR uses ERROR_CORRECT_L so it scans small.
  - BACK bg (Jul 16) = generated stained-glass filmmaking window `contact-card/glass_A.png` (lens-iris rose window, Super 8, reel, clapperboards, film-strip vine, projector, upright crosses, rose border). `glass_B.png` is the alternate. Retune with env vars: `GLASS_STRENGTH=soft|bold` (default bold) and `GLASS_PLATE=glass_B.png`.
  - Card `.panel` top is 565, NOT 600: content is ~429px and 600 only gave it 404, so it overflowed and the foot got sliced by the lacy frame (frame z-index 6 > panel 5). `justify-content:flex-end` makes any future overflow go UP into the art.
  - ALWAYS re-verify both QRs after touching the card. Real decoder, no eyeballing:
    `/usr/bin/python3 -c "import cv2,numpy as np;from PIL import Image;d=cv2.QRCodeDetector();print(d.detectAndDecode(cv2.cvtColor(np.array(Image.open('card_back_full.png').convert('RGB')),cv2.COLOR_RGB2BGR))[0])"`
    (cv2 + pyzbar are on `/usr/bin/python3`, but pyzbar's native libzbar is MISSING, so use cv2.)

## AirDrop copies (~/Desktop/VAMPPSYCH CARD/)
- `Vamppsych-Card-FRONT.png` + `Vamppsych-Card-BACK.png`, 1488x2076 (2.5x3.5in at 600dpi), QR-verified. Kept at Desktop root so he can AirDrop straight to his phone. Re-copy from `contact-card/vamppsych_contact_card_{front,back}.png` after any card rebuild.

## Printable Pokemon card  (~/Desktop/Vamppsych/card/)
- giancarlo_front.png + giancarlo_back.png, 1488x2076 = 2.5x3.5in double-sided hand-out. Back QR scan-verified (front has no QR by design).
- Reprint/iterate: build_front.py + build_back.py in that folder (run with `CARD_OUT=~/Desktop/Vamppsych/card /usr/bin/python3 build_front.py`). Swap the camera art for a face photo, add moves, or spin the full 4-card FIELD KIT set.
- Both re-rendered Jul 16 with the Grenze Gotisch swap (it had the same Bamppsych bug).
- FIXED Jul 16: `build_front.py` derived its skill root from `__file__`, which only works when the script sits INSIDE the skill. This Desktop copy resolved to `Desktop/Vamppsych/assets` and died on `starfield.b64`. It now falls back to the real skill dir (override with `SKILL_ROOT`). build_back.py never had the bug.

## Gotchas / how to verify (IMPORTANT for next session)
- ⚠️ **`--window-size=375` IS A LIE. Chrome enforces a 500px minimum window width on macOS headless.** The page lays out at `innerWidth=500` and the screenshot is then CROPPED to 375. Verified Jul 31 with a probe page that prints `innerWidth` — asked for 375, got 500. Every "verified at 375px" headless claim in this file actually measured a 500px layout, so any narrow-viewport bug below 500 was never being tested. For a REAL narrow layout use either (a) the Browser pane resized to 375, which honours it (`document.documentElement.scrollWidth` reads 375), or (b) a `width:375px` iframe inside a ≥500px headless window. Widths ≥500 are fine to capture directly.
- ⚠️ **Sandbox blocks `python3 -m http.server` from `~/Desktop`** (`PermissionError` on `getcwd`). Mirror the site into the session scratchpad with rsync and serve from there. That is why prior sessions' launch.json entries all point at scratchpad copies. Remember the mirror is a COPY — re-rsync after editing the source or you verify a stale page.
- **A 3-value `margin` shorthand silently kills `margin:0 auto` centring.** `.hero{margin:6px 0 0}` on a `.wrap` element set left/right to 0, left-aligning the photoshoots hero on every viewport wider than the 560px wrap while the rest of the page stayed centred. Shipped unnoticed because phones are narrower than the wrap. If a `.wrap` element also needs a margin, write `6px auto 0`.
- **`white-space:nowrap` + calc'd font-size clips on the font-fallback path.** The photoshoots h1 measured 389.9px of fallback Georgia inside a 331px box at 375. `display=swap` in the Google Fonts URL means this paints on EVERY cold load, not just when fonts fail. Fix is a metric-matched `@font-face` fallback with a MEASURED `size-adjust` (83% there), not a guessed one. `body{overflow-x:hidden}` hides the symptom from `scrollWidth`, so measure the inner span's rect, not the block's.
- PANE SCROLL: the old "pane cannot scroll" note is STALE. Retested Jul 16 and `el.scrollIntoView({block:'center',behavior:'instant'})` scrolls the pane fine (scrollY moved to 23898). Bare `window.scrollTo(0,120)` still does nothing, which is probably what produced the original note. Use scrollIntoView + `computer{action:"screenshot"}` — far easier than hunting y-offsets in a tall headless capture.
- HEADLESS + svh IS THE REAL TRAP: at `--window-size=412,20000` the pane and headless DISAGREE on every absolute Y, because `100svh` resolves against the giant window and the hero inflates. Do not try to crop a tall headless capture at a y-offset you measured in the pane; they will not line up. Either capture at a NORMAL window height (e.g. 1280x900) or scroll the pane and screenshot it.
- To inspect one component in isolation, write a tiny throwaway page that pastes the component's CSS verbatim over the site's dark band and screenshot that (used it to prove the reel-frame white box was gone). Much faster than locating it in a 20000px capture. Delete the harness afterwards.
- `elementsFromPoint` SKIPS `pointer-events:none` overlays, so it will happily tell you nothing is covering an element that is visibly covered. The lacy card frame hid under exactly this. Compare z-index and rects instead.
- Headless + `svh` units: in a very tall headless window (e.g. 412x24000) `svh` resolves to the WINDOW height, inflating svh-based sizes. Band height is clamped so it stays sane; if adding svh sizing, clamp it or capture at a normal window height.
- Screenshot recipe: `"/Applications/Google Chrome.app/.../Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=412,24000 --screenshot=out.png --virtual-time-budget=16000 "http://localhost:8931/index.html?proof"` then PIL-crop. `?proof` force-reveals scroll sections.
- Local server: `cd portfolio-site && python3 -m http.server 8931`.

## His source files (organized Jul 15)
- Shoot originals moved out of Downloads into `~/Desktop/Vamppsych/04_PRODUCTION/Shoots/`: blue-hair-editorial (20), lit-portraits (12), top-shelf-night (5), gear-flatlay (4), generated-art (2), footage (1), misc-photos (5).
- `~/Desktop/Vamppsych/05_REFERENCE/Reference/` loose files sorted into photos/, aesthetic-saves/, product-refs/, tutorial-grabs/; `vamppsych_holic_default_register.png` kept at Reference root.
- Site source assets + reel originals archived in `Reference/kawaii-src/` (+ reels-src/).

## Still his court (not blocking)
- A/B slider frame pick (letters A-F candidate sheet).
- Releases OK for the two portrait models (blue-hair + rooftop scene-girl) before those stay public.
- Editor REEL: the one real content gap; needs the VMP drive.
- Literal Rogue font: download from his Envato Elements, then a one-line CSS swap.

## DESIGN section + Arcade block (Aug 12 2026)

Section order is now 8 stops: INFO 01, PHOTO MODE 02, ARCHIVE 03, **DESIGN 04**,
PLAYBACK 05, FEED 06, RATES 07, STANDBY 08 (bands.js PAGES + hardcoded `/ 08`
in the pagebreak; nav `<ul>` carries the Design link after Archive).

- **DESIGN section** (`#design`, new): leads with the **The Mix "City Meets the
  Underground" event poster** (`assets/design/themix.jpg`), then 3 collage
  treatments of the arcade shoot: candy decora / y2k chrome / goth xerox
  (`assets/design/{candyclaw,chrome,xerox}.jpg`). Uses the existing
  `.sac-photos`/`.sacp` gallery (4/5 cover, opens the lightbox modal). Heading
  "I build the whole graphic" — backs the hero-sub "…and design end to end".
- **ARCADE · REDEMPTION block** added inside `#archive` after BLUE: 8 graded
  frames from the Aug 11 arcade shoot (`assets/arcade/arc_01..08.jpg`), using
  the `.blue-grid`/`.bluep` pattern (arc_06 bwide, arc_01 bhero; opens full jpg
  like the neighboring BLUE block). Source: 04_PRODUCTION/Shoots/arcade-aug11.
- No new CSS: both blocks reuse existing proven classes. Only bands.js changed
  (bumped to `?v=20260812`); HTML mirrored to index-kawaii.html.


## /0fftheprint/ — THE OUTLET IS LIVE (Aug 19 2026)

0FF THE PRINT shipped as a subfolder site: **https://carlo72400-pixel.github.io/0fftheprint/**
The repo copy is now the source of truth; the old build at `03_PROJECTS/0ff-the-print/` is the
May archive (interviews/, releases/, CAM.md still live THERE, the site does not).

- Single index.html + `content/*.json` (site/creators/take/rotation/desk/roster). Edit the JSON,
  push, done. No Decap, no Netlify, no service worker — all stripped for Pages.
- Positioning (his call, Aug 19): "We are the underground. The city pulses because we pump it."
  Pulse banner up top, SATX → ATX → HTX → DTX route strip. INSERT COIN splash is original May work.
- Roster: KAV-MAN (THE VOICE EX) + VIRGOSGATEWAY (THE ENGINEER) are NAMED members. The Ink (002,
  Smiley, unnamed on the public page until it airs) + The Page (003, no yes yet, unnamed) run
  "pending plates" — cards with `"photo": null` render a stamped classified plate
  (`pending_glyph` + `pending_stamp` keys). NO album names, NO dates on the public page until
  the artists announce; the campaign plans stay in /rise/ and /gateway/ (noindex, never linked
  from the outlet).
- The Rooms sidebar card: Zenhouse Fridays, The Mix, Rah Rah Room, Paper Tiger (his Aug 19 list).
- Pitch section = IG DM buttons (@vamppsych / @cam_dyed). The fake @0fftheprint handles and
  hello@ email are GONE — never reintroduce them.
- FONT FIX that applies everywhere: Saira Condensed has NO italic on Google Fonts. Requesting
  `ital,wght@1,900` makes Google silently omit the family (the May build always fell back to
  Inter). Correct request is `Saira+Condensed:wght@900` + `font-style:italic` (synthetic slant).
- Grid fix: .roster/.curators-grid were repeat(4,1fr) and blew out horizontally below ~1500px;
  now repeat(auto-fill,minmax(200px,1fr)) + min-width:0 on main.feed/aside.sidebar.
- OG: og_src.html → assets/preview.jpg (1200x630). Headless Chrome will NOT load Google Fonts
  from file:// or localhost here — download the woff2s and @font-face them locally to render
  (see scratchpad pattern), or reuse the existing preview.


## NIGHTS section + brand marks + 0FF THE PRINT (Aug 20 2026)

His ask: "update my main website, make sure it has updated work on it." The homepage had not
been touched since Aug 12; everything shot Aug 13-19 was missing.

**Section order is now 9 stops:** INFO 01, PHOTO MODE 02, **NIGHTS 03**, ARCHIVE 04, DESIGN 05,
PLAYBACK 06, FEED 07, RATES 08, STANDBY 09. `bands.js` PAGES updated and the hardcoded `/ 08`
in the pagebreak bumped to `/ 09` (stamp `?v=20260820`). Nav `<ul>` carries the Nights link
after Photo, which is also what draws the mobile swipe chip.

- **`#nights` (new section)** sits between PHOTO MODE and ARCHIVE, deliberately ABOVE the
  archive so the newest paying-lane work leads instead of opening on a 2024 internship.
  Two blocks, both on the existing `.blue-grid` / `.bluep` pattern (no new CSS):
  - **BLADE RAVE · PAPER TIGER** (Aug 14), `assets/bladerave/br_01..08.jpg`. br_01 `bwide`
    (crowd), br_02 `bhero` (performer). Source: the Drive vault's `client18/` set, i.e. the
    grain-18 CLIENT cut, not his personal grain-25 set.
  - **THE MIX · N ST MARY'S** (Aug 16), `assets/themix/mix_01..08.jpg`. mix_01 `bwide`
    (EVENT_136 green-flood crew, landscape so the 2:1.05 cell does not gut it), mix_02 `bhero`.
    mix_03..07 are the `08 Carousel/HALO_*` ring-flash portraits, mix_08 is EVENT_106.
  - Both sets exported by `scratchpad/export.py`: 1500px long edge q84 for Blade Rave, 1400px
    q78 for the HALO frames (they are grainy high-ISO and were 650KB each at q84).
    UnsharpMask(1.2, 95, 3) AFTER the downscale, same rule as the IG export.
- **DESIGN gained a 0FF THE PRINT block** (`assets/design/otp_01..04.jpg`): four 4:5 crops off a
  headless capture of the LIVE outlet. Recipe: `--window-size=1100,9000` full-page screenshot of
  `https://carlo72400-pixel.github.io/0fftheprint/`, then PIL-crop 1375-tall bands at y=0 (hero),
  2870 (THE WORK grid), 6150 (music + catalog), 7050 (the roster cards). 1100x1375 is exactly the
  4:5 the `.sacp` cell wants. Fragment URLs (`#roster`) do NOT work for this, headless fires the
  screenshot before the fragment scroll settles and you get a blank frame. Section kicker and
  intro copy widened from "Print + Collage" to cover sites.
- **RATES gained a BRAND MARKS disclosure** between COMMERCIAL WORK and ADD-ONS: Single Mark
  $650 / Mark + Alternates $900 / Full Set $1,200, plus Print + Stitch Pack $600, Cover Art $300,
  Logo Sting $400. **Standing rates only.** The intro column from
  `00_ADMIN/Invoices/RATE-SHEET_brand-marks.md` is deliberately NOT on the page: intro is a
  per-quote 21-day device and printing it as a tier kills it on every other sheet he owns.
  Fine print carries the three rules that matter: the unit is the SET, merch needs the stitch
  pack, working files stay with him.
- **HELD OUT on his call:** the Aug 17 Homie Night set (30 selects, Editorial Night + mono
  SCARLET). Strongest recent portraits but it is a friend's face and there is no public post of
  it. Do not put it up without asking again.
- Also not on the site and deliberately so: the Aug 16 Bethel interview stills (church
  congregants, no release), and the Looney Goon Savage marks (built on spec, nothing sent).
- Verified: bands render REEL 01/09 through 09/09 in order, nav has 9 links, zero console
  errors, every new asset 200s, and the 375px layout checked through a `width:375px` iframe
  inside a 520px headless window (the 500px-minimum trap).


## 2026-08-24 — THE OUTLET MOVED OUT + THE DOMAIN

**0FF THE PRINT no longer lives in this repo.** It is its own project repo
(`carlo72400-pixel/0fftheprint`) on its own domain, **https://0fftheprint.com**, HTTPS
enforced. The folder `0fftheprint/` on disk is that repo's working copy (gitignored here);
deploy the outlet by committing INSIDE it. Old `/0fftheprint/` URLs on this site 301 to the
domain, deep paths included, so nothing shared ever broke. DNS is 4 GitHub A records + www
CNAME at Porkbun (account "vamppsych", ⚠️ still no 2FA). Supabase auth Site URL + redirect
allowlist point at the domain.

Outlet highlights since the split, all in ITS repo: landing marquee + LATEST DROP bar, THE WORK
featured-6 + /work/ archive with venue filters, private client deliveries (newclient.py,
unguessable slug + optional PIN, vault repo 0tp-media-style on 0tp-vault), full-res =
byte-identical originals for photos AND video in both engines (all 3 old events re-released),
founder card = real photo comp (rule: never fully-AI Gianni, generate environments only),
masthead "THE CITY GOES DARK. WE CLOCK IN.", rooms strip receipts-only.

Untracked here on purpose: `.mcp.json` (local tool config) and two Operator resume PDFs in
assets/docs/ that no page links yet — commit those only when a page uses them.
