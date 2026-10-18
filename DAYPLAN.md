# DAYPLAN: the schedule engine

One engine for any event with a schedule. First used on the Sick New World family page
(Oct 2026). Reuse it for the next festival, a wedding run of show, a client
shoot day, a family trip: anything where people need to know where to be and when.

## What it does

- **Now panel**: reads the clock and says, in one big line, where to be (BLUE STAGE), what is on
  (Knocked Loose, till 5:55, 35 min left), what is next, and when to start walking.
  Two giant keys under it (All stages, My plan). Built drunk-simple on purpose.
- **All stages**: what is on right now (or next) at every stage.
- **Time slider**: preview any time of the day before it happens. "Back to live" returns to the clock.
- **Lineup grid**: every set in stage columns. Tap once = Want, twice = Must, three times = clear.
  A red NOW line runs across it on the day.
- **The plan builds itself**: it plans around clashes and the walks between stages.
  - Split mode (default): leave a set early or join one late. Catching 15 minutes of a set pays a
    one-time bonus (big for a Must), so two clashing Musts get split instead of one dropped.
    You only ever walk TO a set you picked, so it never hops out of a set and back in.
  - Full sets only (toggle): whole sets, best chain by weight x minutes with walks in between.
- **The day**: logistics (leave, park, gates, sunset, curfew) merged with the planned sets, with
  NOW and done states.
- **Sharing**: Copy my plan (plain text for a group chat) and Send my picks (a link with
  `#picks=...` that offers the same picks to whoever opens it).
- **Pack list**: keys that stay pressed, saved per phone. Add your own items, hide the ones you don't need.
- **Everyone can edit their own copy** (built for handing one link to a whole family):
  - *Add to my day*: their own stops (day, time, where, note). They show in the day list with a Yours tag and
    get a "Heads up" line in the Now panel 30 minutes before.
  - *Edit my day*: change the time, title or note of any logistics row, hide rows that don't fit them, bring them back.
  - *Fix set times*: tap a set to change its time if the festival moves it (a star dot marks a fixed set),
    or *Add a set*. Back to official is one key.
  - *Send my plan*: one link with their name, picks, own stops and added sets (`#plan=...`). Whoever opens it gets
    "Mom sent you their plan" and can use it (their picks, plus the stops merged into their own) or keep their own.
  - On its own, all of it lives in that phone's browser (localStorage).
- **One shared plan** (pages with `shared: { event }` in the config, needs migration 047): *Make it a shared plan*
  turns this phone's plan into one plan for the whole group, then *Invite people* sends a link
  (`#join=<64 hex code>.<their name>`). Everybody on it sees the same day: the stops, the logistics edits, the set
  time fixes, the added sets, the Full sets switch, and everybody's picks. Picks add up: each person's Want and Must
  count, so the plan follows what the most people want most (the grid tags each set with who picked it, initials).
  Each change is one row in the database (`dayplan_items`), synced every 15 s while the page is open and when it comes
  back to the screen. No signal: changes wait on the phone and go up on their own later. *Leave* takes your picks out
  of the group and back to your own plan. A dead invite link drops the person back to their own plan with a message.
  The pack list always stays per phone.
  - The code is the only key. It lives in the link after the `#` (never sent to a server or a log) and on the phones
    that opened it; the database keeps only its sha256. Anyone with the link can see and change that plan.
  - Caps (migration 047): 1,000 rows a plan, 2,000 plans an event, 5,000 plans in all, data up to 2,000 characters a
    row, and near 250,000 rows in all the table stops taking NEW rows. Nobody can fill the site's database through it.

## Files

- `assets/js/dayplan.js`: the engine. Shared by every event page.
- Each event page: its own folder with `index.html` (theme, copy, maps) plus a
  `window.DAYPLAN = {...}` config right before the engine's script tag.
- `migration-047-the-family-plan.sql`: the shared plan's two tables and its three doors (`dayplan_start`,
  `dayplan_pull`, `dayplan_push`). Only needed for `shared` pages.
- The page loads the engine as `../assets/js/dayplan.js?v=<first 8 of its sha1>`. **Change the
  engine, change the stamp on every page that loads it**, or phones keep the old copy.
  `shasum assets/js/dayplan.js | cut -c1-8`

## Make a new event page

1. Copy the newest event folder to a new unlisted slug (`<name>-<6 random hex>`), keep
   `noindex, nofollow`, link it nowhere.
2. Rewrite the theme (CSS tokens at the top), the copy, the maps, the pack list, `preview.jpg`.
3. Rewrite the config:

```js
window.DAYPLAN = {
  key: 'snw',                 // localStorage prefix, unique per event
  date: '2026-10-24',         // the event day
  tz: '-05:00',               // its UTC offset that day (CDT -05:00, CST -06:00)
  mainDay: 'sat',             // which day key the sets belong to
  dayOffsets: { fri: -1440, sat: 0, sun: 1440 }, // minutes from the main day, for the Add to my day picker
  dayStart: 660, dayEnd: 1440,// grid window, minutes after midnight (11:00 AM to 12:00 AM)
  doors: 660,                 // when the panel switches from "today" to live
  previewStart: 1020,         // where the slider sits before the day
  stageWord: 'stage',         // "BLUE STAGE"; use '' for rooms, '' for a single venue
  pickable: true,             // false = run of show: everything is in the plan, no picking
  stages: [{ id: 'blue', name: 'Blue', area: 'north' }],   // id doubles as the CSS color class
  walks: { 'north|south': 15 },                            // minutes between areas, names sorted, joined by |
  acts: [{ n: 'AFI', st: 'blue', s: '16:10', e: '16:50' }],// 24h times; past midnight = 24:30 style
  logistics: [{ m: 360, day: 'sat', b: 'Leave SA', s: 'I-35 north...' }],  // m = minutes after midnight, can be negative (day before)
  days: { fri: 'Fri 10/23', sat: 'Sat 10/24', sun: 'Sun 10/25' },
  presets: [{ label: "Use the host's picks", picks: { 'afi': 2 } }],      // ids = slugged names
  packKey: 'snw-family-pack-v1',
  shared: { event: 'snw' },   // optional: one shared plan per group (a-z, 0-9, dashes); leave it out for per-phone only
  text: { beforeDoors: 'Gates at 11', doorsNote: '...', after: ["That's the night", '...', '...'],
          planTitle: 'My plan', shareWhat: 'Sick New World plan', inviteWhat: 'the Sick New World plan',
          noPicks: '...', lastSet: '...', freeTime: '...',
          namePlaceholder: 'Type your name', stopPlaceholder: 'Meet at the entrance' }   // both optional, these are the defaults
};
```

A `shared` page also loads the database client before the engine, the same two tags every member page uses:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js" integrity="sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok" crossorigin="anonymous"></script>
<script src="../supabase-config.js?v=f1348482"></script>
```

4. Check it before pushing: open it locally, drag the slider through the day, tap picks,
   watch the plan, the clashes, the NOW card. Headless check used on SNW: load the page in an
   iframe, click `#kPreset`, set `#scrubIn` and read `#nowBig` back.
   The shared plan was checked against the local database replica (`99_SYSTEM/_tools/otp_dbtest`, test `t_047.py`)
   with two "phones" on two local ports, so each had its own storage. ⛔ Give a local test copy its own
   `supabase-config.js` cache-buster: a browser can hold the real config from an older preview on the same port.

⛔ Engine text stays generic: no people's names and no one-event examples in `dayplan.js` (it is the base for
every event page). Event flavor goes in the page's `text` config or the page's own HTML.

## Element ids the engine looks for

All optional except the Now card ones; a page can drop a block it does not need.

- Now: `nowCard`, `nowEye`, `nowBig`, `nowAct`, `nowNext`, `stagesNow`, `scrubIn`, `scrubTime`, `liveKey`, `status` (hero pill)
- Picks: `grid`, `kPreset`, `kFull`, `kClear`, `kEditSets`, `kAddSet`, `planSum`, `planList`, `missed`, `myName`, `kCopy`, `kShare`
- Shared link banner: `sharedPicks`, `sharedMsg`, `kUseShared`, `kKeepMine`
- Shared plan: `shareBox` (the engine fills it: start, invite, join, sync, leave), `syncLine` (one line under the
  Now card); the engine creates `shName`, `kShareStart`, `kInvite`, `kSyncNow`, `kLeave`, `kJoin`, `kNoJoin` inside the box
- Day: `dayList`, `kAddItem`, `kEditDay`, `hiddenDay`
- Pack: `.pack input[type=checkbox]`, `packcount`, `packreset`, `packEdit`, `packCustom`, `packNew`, `packAdd`; any `[data-copy]` button copies its text
- The edit sheet is created by the engine (`.sheet`, `.sheet-bg`, `.fld`); the page styles it
- Styling hooks: `.lb` (grid blocks), `.sn` (stage tiles), `.blk` / `.pl.walk` (plan rows),
  `.lu-head span` (column heads), all colored by the stage id as a class. Shared plan: `.lineup.group`,
  `.lb.myvote` (you picked it), `em.who` (who picked a planned set), `.sh-big`, `.sh-sub`, `.sh-msg`, `.sync-line`.
- ⛔ The page needs `[hidden] { display: none !important; }`: `.key` is `inline-flex`, which beats the hidden
  attribute, so keys the engine hides (Add a set, Back to live, Send my plan) would still show.

## Ideas for later

- A run-of-show template for private events (wedding, quinceanera, launch party): `pickable: false`,
  one stage per room, the couple's timeline as the acts, the vendor list as logistics.
- A shoot-day template next to the Thrift shoot plan: call times, locations as stages, walk or
  drive minutes between them.
- Pull lineups from a JSON file per event instead of inline, once there are a few.
