# THE PORTFOLIO, bottom up (locked 2026-10-18)

Read this before changing anything on 0fftheprint.com/portfolio. SITE_STATE.md is how it's built; this is why.

## 1. FOUNDATION (what's true)

- He shoots it and cuts it fast. Almost every job on the page went out the next morning or the next day. That speed, plus being good in dark rooms, is the edge.
- Every dollar so far came from a private client: Bethel, Sari-Sari plus the 80th, Andrew E. (label + venue), the Oct 16 wedding, Thrift @ The Warehouse. Bars and clubs paid $0.
- The wedding film (ALL YOUR'N, 0:58, song only) is the piece the events lane was missing.
- Facts follow the 10/6 resume rules: three years editing (not four-plus), 0FF THE PRINT as the publication he founded, no Vamppsych as a brand or employer, Alamodome security not current, the Ye stadium credit stays off. Kit = FX6 + 2x Luna Ultra + X6 (the Ace Pro 2 and GO Ultra went to his mom 10/14, the X4 was sold in August).

## 2. PURPOSE (who it's for)

Two people pay him, so the page is built for exactly two:
- **HIRING**: someone hiring an editor, shooter or colorist. Every resume links here.
- **BOOKING**: someone with a wedding, a quince, a party or an event, or the hall, planner, photographer or DJ who sends those.

Everybody else (followers, artists, venues looking for free content) is welcome but not designed for.

## 3. WHAT IT HAS TO DO

Get a stranger from the link to a message in under a minute. That feeds the one number: $2,600 a month in camera money, three months straight.

The 10-second test, for every screen: who he is, one piece of proof for THEIR need, one button.

## THE BUILD THAT CAME OUT OF IT

- First screen: name you can read, one line, two doors (HIRING / BOOKING), the newest film playing.
- HIRING: credits, the newest job (Thrift @ The Warehouse: the scripted promos day, 10 edits, then Fill-a-Bag + its three edits), 48 HOURS, VOLUME, the color A/B, 0FF THE PRINT, the tools, both resumes.
- BOOKING: the wedding, how it works in three steps, three prices, Book a date.
- NIGHTS: the best six, then every night on /portfolio/nights/ (newest first).
- One tap deep, nothing deleted: /portfolio/archive/ (SA Current, portraits, Legion Ink, the stadium photos, design, VOLUME BTS) and /portfolio/rates/ (the full card).
- Look kept (pastel digicam palette + type). Gimmicks cut: PP chip, drag-the-window tip, AF cursor, timecode, date stamp, scroll strip, magnetic email, the FEED monitors.

## WHEN SOMETHING NEW HAPPENS

- New night or event: build its block with `nightsblock.py` (it lands at the top of /nights/). Put it in the main page's six only if it beats one of them (`"featured": true`, then drop the one it replaces).
- The 0TP homepage timeline (10/21, his rule: everything new shows up there): a block that exists ONLY on the portfolio gets a row in `content/portfolio.json` (nightsblock.py writes it when the config has `"timeline"`; add it by hand for a hand-kept block). Work that is also a Tape cut or a 0TP night already has its card, so it gets no row.
- New job, title or credit: update the HIRING credits and, if it changes the story, the resumes too, so they never disagree.
- New film that beats ALL YOUR'N: it takes the hero. Only cuts he has watched and approved go up (the montage rule).
