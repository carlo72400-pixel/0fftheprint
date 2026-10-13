#!/usr/bin/env python3
"""Build content/music.json for the Music tab, and run the weekly battle.

Every command is DRY until you add --write: it prints what it would build and saves nothing.

    /usr/bin/python3 _build/music/build_music.py [--write]
        rebuild music.json from the inputs and state.json
    /usr/bin/python3 _build/music/build_music.py close [--write]
        after Sunday: read the votes, record the winner (both on a tie, nobody on zero votes),
        put each winner first in content/rotation.json, rebuild
    /usr/bin/python3 _build/music/build_music.py battle <linkA> <linkB> --artists "A" "B" [--week 2026-w43] [--write]
        set next week's battle. Closes the last one first, and refuses while it is still open.
        Add --replace to fix the picks of the battle already set for this week, ONLY while nobody has
        voted in it (a vote is for a side, a or b, so it would move to the new track). It reads the votes first.
    /usr/bin/python3 _build/music/build_music.py lineup add --date 2026-11-20 --artist "X" --venue "Y" --city Austin
            --ticket <url> [--source <url>] [--bill "short line"] [--list local|anchor] [--write]
    /usr/bin/python3 _build/music/build_music.py lineup drop --date 2026-11-20 --artist "X" [--city Austin] [--write]
    /usr/bin/python3 _build/music/build_music.py drop add --date 2026-11-20 --artist "X" --title "T" --source <url>
            [--type album] [--label L] [--spotify <link>] [--fact "short line"] [--write]
    /usr/bin/python3 _build/music/build_music.py night <slug> --act 'Name|dj|<spotify link or blank>|<other link or blank>' [--act ...] [--write]
        add a night's acts to Who Played (the night must be in events/events.json)

Where things live (all beside this file, so nothing depends on a temp folder that a reboot empties):
  state.json            the battle, the winners, the rooms, the cover pin (plus built_sha and kept, for the guards)
  inputs/who_played.json   lineups per night, Spotify, our frames
  inputs/lineup.json       Texas shows with primary sources
  inputs/drops.json        dated releases with sources
  inputs/texas_lineage.json  Texas shelf, lineage pairs, rotation track facts
  vamplyfe_tracks.json  the house playlist (night shift queue), pulled off Spotify's public embed
  oembed_cache.json     Spotify oEmbed answers (title + art), so a rebuild needs no network
Every Spotify id is checked against Spotify's oEmbed (the title must match) and every image url is
filled from it when missing. No em or en dashes survive into the file.

Guards:
  - A missing or unreadable input stops the build before anything is written (load() used to turn a
    missing file into an empty section, and one run would have emptied whole sections of the tab).
  - A night on the page that the inputs do not list, or list with no acts, is KEPT and printed. Its acts
    stay watched (state.json 'kept'): a later build that would take one off is refused. `night` moves
    them into the inputs before it adds an act. To take a kept night off, delete it from music.json.
  - Hand edits: state.json remembers the hash of the music.json this script last wrote. If the file
    changed since (a hand edit, a merge), the write is refused when the rebuild would lose any of it.
    Put the change into inputs/ or state.json first, or pass --force to drop it.
  - Spotify not answering (as opposed to saying a track does not exist) refuses the write.
"""
import argparse, copy, datetime, hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
S = os.environ.get('OTP_MUSIC_INPUTS') or os.path.join(HERE, 'inputs')
INPUTS = ('who_played.json', 'lineup.json', 'drops.json', 'texas_lineage.json')
STATE = os.path.join(HERE, 'state.json')
CACHE = os.path.join(HERE, 'oembed_cache.json')
TRACKS = os.path.join(HERE, 'vamplyfe_tracks.json')
OUT = os.path.join(REPO, 'content', 'music.json')
ROTATION = os.path.join(REPO, 'content', 'rotation.json')
OEMBED = os.environ.get('OTP_MUSIC_OEMBED') or 'https://open.spotify.com/oembed'
SOON = 21          # days: warn when the lineup or the drops run out sooner than this
REL = lambda p: os.path.relpath(p, REPO)


def load(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def refuse(msg):
    sys.exit('REFUSED, nothing written. ' + msg)


def today():
    """the San Antonio clock, the same one battle_vote() uses (OTP_MUSIC_TODAY=YYYY-MM-DD for tests)"""
    t = os.environ.get('OTP_MUSIC_TODAY')
    if t: return datetime.date.fromisoformat(t)
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo('America/Chicago')).date()
    except Exception:
        return datetime.date.today()


def mon_d(d): return d.strftime('%b ') + str(d.day)          # 'Oct 12'


# ---------------- the battle's week: 'YYYY-wWW' is the ISO week, Monday to Sunday (same rule as 036)
WEEK = re.compile(r'^([0-9]{4})-w(0[1-9]|[1-4][0-9]|5[0-3])$')
def monday(bid):
    m = WEEK.match(str(bid or ''))
    if not m: return None
    try: return datetime.date.fromisocalendar(int(m.group(1)), int(m.group(2)), 1)
    except ValueError: return None
def iso_week(d):
    y, w, _ = d.isocalendar()
    return '%d-w%02d' % (y, w)


# ---------------- Spotify
cache = load(CACHE, {}) or {}
transient = []      # tracks Spotify did not answer for (network, throttle): the write is refused
def oembed(sid):
    key = 'track:' + sid
    if key in cache: return cache[key]
    url = OEMBED + '?url=' + urllib.parse.quote('https://open.spotify.com/track/' + sid, safe='')
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20) as r:
            j = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code in (400, 404): return {'error': 'Spotify has no such track (%d)' % e.code}
        transient.append(sid); return {'error': 'Spotify answered %d' % e.code}
    except Exception as e:
        transient.append(sid); return {'error': str(e)}
    time.sleep(0.15)
    if not isinstance(j, dict) or not j.get('title'): return {'error': 'no title in the answer'}
    cache[key] = {'title': j['title'], 'thumbnail_url': j.get('thumbnail_url', '')}
    return cache[key]


ID = re.compile(r'^[A-Za-z0-9]{22}$')
def spotify_id(v):
    """a track link, a spotify:track: uri or a bare id -> the 22-character id, else None"""
    v = str(v or '').strip()
    m = re.search(r'(?:track/|spotify:track:)([A-Za-z0-9]{22})', v)
    if m: return m.group(1)
    return v if ID.match(v) else None


def big_art(u):
    """oEmbed gives the 300px cover (ab67616d00001e02 + hash). The 640px one sits at the same path with
    ab67616d0000b273, which is what every rotation tile uses, so a winner's tile is as sharp as its neighbours."""
    return re.sub(r'/image/ab67616d00001e02', '/image/ab67616d0000b273', u or '')


DASH = re.compile('[\u2013\u2014]')
def clean(v):
    if isinstance(v, str): return DASH.sub(', ', v).replace(' ,', ',').strip()
    if isinstance(v, list): return [clean(x) for x in v]
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items()}
    return v


problems = []
def track_ok(sid, title=None, where=''):
    if not sid or not ID.match(sid): problems.append(f'{where}: bad id {sid!r}'); return None
    j = oembed(sid)
    if not j.get('title'): problems.append(f'{where}: oEmbed has no track {sid} ({j.get("error", "")})'); return None
    if title and title.strip().lower() not in j['title'].strip().lower() and j['title'].strip().lower() not in title.strip().lower():
        problems.append(f'{where}: title mismatch {title!r} vs Spotify {j["title"]!r} ({sid})')
    return j


# ---------------- state.json: the battle, the winners, the rooms, the cover
def load_state():
    st = load(STATE)
    if not isinstance(st, dict): sys.exit('STOPPED, nothing built: ' + REL(STATE) + ' is missing or unreadable.')
    st.setdefault('winners', [])
    st.setdefault('rooms', [])
    st.setdefault('cover', None)
    return st


def missing_inputs():
    """the research files that are not there or do not parse, plus the house playlist"""
    bad = [os.path.join(S, f) for f in INPUTS if not isinstance(load(os.path.join(S, f)), dict)]
    if not isinstance(load(TRACKS), list): bad.append(TRACKS)
    return bad


def load_inputs():
    gone = missing_inputs()
    if gone:
        sys.exit('STOPPED, nothing built: these inputs are missing or unreadable, and building without\n'
                 'them would empty whole sections of the Music tab:\n  ' + '\n  '.join(gone))
    return {'who_played': load(os.path.join(S, 'who_played.json')), 'lineup': load(os.path.join(S, 'lineup.json')),
            'drops': load(os.path.join(S, 'drops.json')), 'texas_lineage': load(os.path.join(S, 'texas_lineage.json')),
            'tracks': load(TRACKS)}


def events():
    return {e['slug']: e for e in (load(os.path.join(REPO, 'events', 'events.json'), {}) or {}).get('items', []) if e.get('slug')}


# ---------------- the build (inputs and state in memory -> music.json as a dict)
def build(inp, st, prev):
    m = {'v': 1, 'built': today().isoformat(), 'notes': {}, 'rooms': st.get('rooms') or [], 'battle': None, 'winners': [],
         'nights': [], 'texas': [], 'lineage': [], 'lineup': [], 'drops': [], 'night': None}
    if st.get('cover'): m['cover'] = st['cover']

    # battle: verified ids + art
    if st.get('battle'):
        b = copy.deepcopy(st['battle'])
        for k in ('a', 'b'):
            j = track_ok(b[k]['track'], b[k]['title'], 'battle ' + k)
            if j: b[k]['art'] = j.get('thumbnail_url', '')
        m['battle'] = b
    # past winners, newest first
    m['winners'] = copy.deepcopy(st.get('winners') or [])

    # night shift: the house playlist, playable tracks only
    m['night'] = {'name': 'VAMPLYFE', 'tracks': [{'id': t['uri'].split(':')[-1], 'title': t['title'], 'artist': t['subtitle'].replace('\xa0', ' ')}
                                                for t in inp['tracks'] if t.get('isPlayable')]}

    # rotation facts -> desk notes (the copy is written here, by hand, from the verified facts)
    tlg = inp['texas_lineage']
    m['notes'] = {r['id']: NOTES_BY_ID[r['id']] for r in tlg.get('rotation', []) or [] if NOTES_BY_ID.get(r.get('id'))}

    # who played
    ev = events()
    for n in inp['who_played'].get('nights', []) or []:
        acts = []
        for a in n.get('acts', []) or []:
            sp = a.get('spotify') or None
            if sp:
                j = track_ok(sp.get('track'), sp.get('title'), f'{n.get("slug")} {a.get("name")}')
                if j: sp = {'track': sp['track'], 'title': j['title'], 'art': j.get('thumbnail_url', '')}
                else: sp = None
            fr = a.get('frame') or None
            if fr and fr.get('thumb') and not os.path.exists(os.path.join(REPO, fr['thumb'])):
                problems.append(f'{n.get("slug")} {a.get("name")}: frame missing {fr["thumb"]}'); fr = None
            acts.append({'name': a.get('name'), 'kind': a.get('kind'), 'spotify': sp, 'alt_link': a.get('alt_link'),
                         'frame': {'thumb': fr['thumb']} if fr and fr.get('thumb') else None})
        e = ev.get(n.get('slug'), {})
        if acts:
            m['nights'].append({'slug': n.get('slug'), 'title': e.get('title') or n.get('title'), 'venue': e.get('venue') or n.get('venue'),
                                'date': e.get('date') or n.get('date'), 'date_short': e.get('date_short', ''), 'acts': acts})
    # safety net: a night already in music.json that the inputs do not have stays, and gets printed
    kept = []
    have = {n['slug'] for n in m['nights']}
    for n in (prev or {}).get('nights', []) or []:
        if isinstance(n, dict) and n.get('slug') and n['slug'] not in have:
            m['nights'].append(n); kept.append(n); have.add(n['slug'])
    m['nights'].sort(key=lambda x: x.get('date') or '', reverse=True)

    # texas shelf
    for x in tlg.get('texas', []) or []:
        j = track_ok(x.get('id'), x.get('title'), 'texas ' + str(x.get('title')))
        if not j: continue
        m['texas'].append({'id': x['id'], 'title': x.get('title') or j['title'], 'artist': x.get('artist'), 'year': x.get('year'),
                           'city': x.get('city'), 'art': x.get('art') or j.get('thumbnail_url', ''), 'fact': TEXAS_FACTS.get(x['id'], x.get('fact')), 'source': x.get('source')})
    # lineage
    for p in tlg.get('lineage', []) or []:
        p = copy.deepcopy(p)
        ok = True
        for side in ('root', 'new'):
            s_ = p.get(side) or {}
            j = track_ok(s_.get('id'), s_.get('title'), f'lineage {side} {s_.get("title")}')
            if not j: ok = False; continue
            s_['art'] = s_.get('art') or j.get('thumbnail_url', '')
        if ok and p.get('source'): m['lineage'].append({'root': p['root'], 'new': p['new'], 'link': LINEAGE_LINES.get(p['new'].get('title'), p.get('link')), 'kind': p.get('kind'), 'source': p['source']})

    # lineup + drops (dated, sourced)
    for s_ in inp['lineup'].get('shows', []) or []:
        if re.match(r'^\d{4}-\d{2}-\d{2}$', str(s_.get('date', ''))) and (s_.get('source') or s_.get('ticket')):
            y = {k: s_.get(k) for k in ('date', 'artist', 'bill', 'venue', 'city', 'ticket', 'source', 'list')}
            y['bill'] = BILLS.get((y['date'], y['artist'], y['city']), y['bill'])
            m['lineup'].append(y)
    m['lineup'].sort(key=lambda x: x['date'])
    for x in inp['drops'].get('drops', []) or []:
        if re.match(r'^\d{4}-\d{2}-\d{2}$', str(x.get('date', ''))) and x.get('source'):
            y = {k: x.get(k) for k in ('date', 'artist', 'title', 'type', 'label', 'spotify', 'source', 'fact')}
            y['fact'] = DROP_FACTS.get(y['title'], y['fact'])
            m['drops'].append(y)
    m['drops'].sort(key=lambda x: x['date'])

    # titles saved for the songs on the cards (Spotify throttles a burst of oEmbed calls in the browser).
    # The last build's titles stay too: once a card's song lives in the database, its roster.json seed
    # goes, and the card still needs the title.
    titles = {k: v for k, v in ((prev or {}).get('titles') or {}).items() if ID.match(str(k)) and isinstance(v, dict) and v.get('title')}
    for r in (load(os.path.join(REPO, 'content', 'roster.json'), {}) or {}).get('items', []):
        mm = re.search(r'track/([A-Za-z0-9]{22})', r.get('theme_song') or '')
        if mm:
            j = track_ok(mm.group(1), None, 'card song ' + str(r.get('name')))
            if j: titles[mm.group(1)] = {'title': j['title'], 'thumb': j.get('thumbnail_url', '')}
    m['titles'] = titles
    return clean(m), kept


# ---------------- what changed, and the hand-edit guard
def _norm(m):
    """music.json with the build stamp left out and nights keyed by slug (their order is the sort's job)"""
    m = dict(m or {}); m.pop('built', None)
    if isinstance(m.get('nights'), list):
        m['nights'] = {str(n.get('slug')) if isinstance(n, dict) else str(i): n for i, n in enumerate(m['nights'])}
    return m


def diff(old, new, path=''):
    out = []
    if isinstance(old, dict) and isinstance(new, dict):
        for k in list(old) + [k for k in new if k not in old]:
            p = (path + '.' if path else '') + str(k)
            if k not in new: out.append(('gone', p, old[k], None))
            elif k not in old: out.append(('new', p, None, new[k]))
            else: out += diff(old[k], new[k], p)
    elif isinstance(old, list) and isinstance(new, list) and len(old) == len(new):
        for i, (a, b) in enumerate(zip(old, new)): out += diff(a, b, '%s[%d]' % (path, i))
    elif old != new:
        out.append(('changed', path, old, new))
    return out


def short(v):
    s = json.dumps(v, ensure_ascii=False)
    return s if len(s) <= 70 else s[:67] + '...'


def say(d):
    kind, p, a, b = d
    if kind == 'new': return f'{p}: new {short(b)}'
    if kind == 'gone': return f'{p}: gone (was {short(a)})'
    return f'{p}: {short(a)} -> {short(b)}'


def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()


def kept_losses(st, cur, m):
    """acts this build would take off nights the safety net held at the last write (hand work the inputs never had)"""
    held = set(st.get('kept') or [])
    if not held: return []
    new = {n.get('slug'): n for n in m.get('nights') or [] if isinstance(n, dict)}
    out = []
    for n in (cur or {}).get('nights') or []:
        if not isinstance(n, dict) or n.get('slug') not in held: continue
        names = {str(a.get('name') or '').strip().lower() for a in (new.get(n['slug']) or {}).get('acts') or [] if isinstance(a, dict)}
        gone = [str(a.get('name')) for a in n.get('acts') or [] if isinstance(a, dict) and str(a.get('name') or '').strip().lower() not in names]
        if gone: out.append(f'nights.{n["slug"]}: ' + ', '.join(gone) + (' leaves' if len(gone) == 1 else ' leave') + ' the page')
    return out


def guard(st, cur_text, cur, m, force):
    """None when the write is safe, else the sentence that refuses it"""
    if cur_text is None or force: return None
    if st.get('built_sha') == sha(cur_text):
        # nobody touched music.json since the last build. A night the safety net kept is still hand work, though:
        # the hash covers it, so it gets its own check
        lost = kept_losses(st, cur, m)
        if not lost: return None
        return ('These acts are on the page only because the safety net kept their night (the inputs never had them),\n'
                'and this build would take them off:\n  ' + '\n  '.join(lost)
                + "\nAdd them first (build_music.py night <slug> --act 'Name|kind|spotify|other' --write), or delete the night from "
                + REL(OUT) + ' to take it off (or run again with --force).')
    lost = [d for d in diff(_norm(cur), _norm(m)) if not (d[0] == 'new' and '.' not in d[1] and not d[3])]
    if not lost: return None
    return (REL(OUT) + ' was changed by hand since this script last wrote it, and this build would lose:\n  '
            + '\n  '.join(say(d) for d in lost[:15]) + ('\n  ... and %d more' % (len(lost) - 15) if len(lost) > 15 else '')
            + '\nPut the change into _build/music/inputs/ or state.json first (or run again with --force to drop it).')


# ---------------- writing (each file whole, never half)
def dumps(o, indent=1): return json.dumps(o, indent=indent, ensure_ascii=False) + '\n'


def save(path, text):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: f.write(text)
    os.replace(tmp, path)


# ---------------- close: read the votes, record the winner, put it first on rotation
def read_tally(bid, after='Nothing was recorded.'):
    try: cfg = open(os.path.join(REPO, 'supabase-config.js'), encoding='utf-8').read()
    except OSError: cfg = ''
    u, k = re.search(r'url:\s*"([^"]+)"', cfg), re.search(r'anonKey:\s*"([^"]+)"', cfg)
    url = os.environ.get('OTP_MUSIC_SUPABASE') or (u.group(1) if u else None)
    if not (url and k):
        refuse(f'Could not read the database address or key from supabase-config.js, so the votes for {bid} were not read. {after}')
    key = k.group(1)
    req =urllib.request.Request(url.rstrip('/') + '/rest/v1/rpc/battle_tally', data=json.dumps({'p_battle': bid}).encode(),
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
                                          'Accept': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            rows = json.load(r)
        row = rows[0] if isinstance(rows, list) else rows
        a, b = row['a'], row['b']
        if not all(isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in (a, b)): raise ValueError('the counts are not numbers')
        return a, b
    except Exception as e:
        why = 'the database answered %d' % e.code if isinstance(e, urllib.error.HTTPError) else (str(getattr(e, 'reason', '') or e) or type(e).__name__)
        refuse(f'Could not read the votes for {bid} ({why}). {after} Try again in a minute.')


def close(st, rot, now, why='close'):
    """records the last battle's winner into st and rot (in memory). Refuses while the battle is open."""
    b = st.get('battle')
    if not b:
        if why == 'close': refuse('There is no battle in state.json to close.')
        return
    bid, mon = b['id'], monday(b['id'])
    if not mon: refuse(f'The battle id {bid!r} in state.json is not a week like 2026-w42.')
    if now < mon:
        if why == 'close': refuse(f'The {bid} battle has not started. Voting opens Mon {mon_d(mon)}.')
        return
    if now <= mon + datetime.timedelta(days=6):
        refuse(f'The {bid} battle is still open. Voting closes Sun {mon_d(mon + datetime.timedelta(days=6))}, '
               f'so close it (or set the next one) from Mon {mon_d(mon + datetime.timedelta(days=7))}.')
    if any(w.get('battle') == bid for w in st['winners']):
        print(f'{bid} is already recorded: ' + ', '.join(w['title'] for w in st['winners'] if w.get('battle') == bid) + '.')
        return
    a, n = read_tally(bid)
    print(f'{bid} votes: {b["a"]["title"]} {a}, {b["b"]["title"]} {n}.')
    if a == n == 0:
        print(f'Nobody voted in {bid}. Nothing to record.')
        return
    keys = ['a', 'b'] if a == n else (['a'] if a > n else ['b'])
    art = {}
    for k in keys:
        j = oembed(b[k]['track'])
        art[k] = b[k].get('art') or j.get('thumbnail_url', '')
    recs = [{'battle': bid, 'week': mon_d(mon), 'mon': mon.isoformat(), 'track': b[k]['track'], 'title': b[k]['title'],
             'artist': b[k]['artist'], 'art': art[k], 'votes': [a, n], 'tie': a == n} for k in keys]
    st['winners'] = recs + [w for w in st['winners'] if w.get('battle') != bid]
    items = rot.setdefault('items', [])
    for r in reversed(recs):
        won = {'week': bid, 'mon': r['mon'], 'tie': r['tie']}
        at = next((i for i, it in enumerate(items) if spotify_id(it.get('link')) == r['track']), None)
        if at is None:
            it = {'platform': 'spotify', 'title': r['title'], 'artist': r['artist'], 'art': big_art(r['art']),
                  'link': 'https://open.spotify.com/track/' + r['track'], 'won': won}
            print(f'  {r["title"]} ({r["artist"]}) goes on rotation, first in line.')
        else:
            it = items.pop(at); it['won'] = won
            print(f'  {r["title"]} ({r["artist"]}) was on rotation already: it moves to the front.')
        items.insert(0, it)
    print(('Dead even: both stay on rotation.' if a == n else f'{recs[0]["title"]} won the week.'))


def set_battle(args, st, rot, now):
    if not args.artists or len(args.artists) != 2 or not all(x.strip() for x in args.artists):
        refuse('Name both artists, in order: --artists "Artist A" "Artist B" (Spotify does not say who made a track).')
    ids = [spotify_id(args.link_a), spotify_id(args.link_b)]
    for v, i in zip((args.link_a, args.link_b), ids):
        if not i: refuse(f'{v!r} is not a Spotify track link.')
    if ids[0] == ids[1]: refuse('Those are the same track twice.')
    week = args.week or iso_week(now)
    mon = monday(week)
    if not mon: refuse(f'{week!r} is not a week like 2026-w43.')
    if now > mon + datetime.timedelta(days=6): refuse(f'The week {week} is already over.')
    if any(w.get('battle') == week for w in st['winners']): refuse(f'{week} already had its battle.')
    old = st.get('battle')
    same = bool(old) and old.get('id') == week
    nxt = mon_d(mon + datetime.timedelta(days=7))
    if getattr(args, 'replace', False):
        # fixing this week's picks: nothing to close, the battle in state.json is the one being fixed.
        # A vote is stored as a side (a or b), so once anyone has voted the picks stay: a swap would move their vote.
        if not same: refuse(f'--replace only fixes the battle of the same week. The battle in state.json is {(old or {}).get("id")}, not {week}.')
        if mon <= now:
            a, n = read_tally(week, after='The picks stay as they are.')
            if a or n:
                refuse(f'Votes are already in for {week} ({old["a"]["title"]} {a}, {old["b"]["title"]} {n}), so its picks stay: '
                       f'a vote is for a side, and a swap would hand it to the new track. Set next week\'s battle from Mon {nxt}.')
    else:
        if same and mon <= now:
            refuse(f'The {week} battle is still open. Voting closes Sun {mon_d(mon + datetime.timedelta(days=6))}, so set the next one '
                   f'from Mon {nxt}. To fix this week\'s picks instead, run the same command again with --replace '
                   f'(it works only while nobody has voted).')
        close(st, rot, now, why='battle')          # refuses while the last battle is open
    if old and monday(old['id']) and monday(old['id']) > now:
        print(f'Replacing {old["id"]} ({old["a"]["title"]} vs {old["b"]["title"]}): it has not started, so it had no votes.')
    elif same:
        print(f'Replacing {week} ({old["a"]["title"]} vs {old["b"]["title"]}): nobody has voted in it yet.')
    elif old and monday(old['id']) and mon <= monday(old['id']):
        refuse(f'The new battle has to come after {old["id"]}.')
    sides = {}
    for k, i, artist in (('a', ids[0], args.artists[0]), ('b', ids[1], args.artists[1])):
        j = oembed(i)
        if not j.get('title'):
            if i in transient: refuse(f'Spotify did not answer for track {i}. Try again in a minute.')
            refuse(f'Spotify does not know track {i} ({j.get("error", "")}).')
        sides[k] = {'track': i, 'title': j['title'], 'artist': artist.strip()}
    st['battle'] = {'id': week, 'a': sides['a'], 'b': sides['b']}
    print(f'Battle {week} (Mon {mon_d(mon)} to Sun {mon_d(mon + datetime.timedelta(days=6))}): '
          f'{sides["a"]["title"]} ({sides["a"]["artist"]}) vs {sides["b"]["title"]} ({sides["b"]["artist"]}).')
    if same and mon <= now:
        print('  Push it right away: a vote cast before the new picks go live counts for the new track on the same side.')


# ---------------- the lineup, the drops, the nights (they edit inputs/)
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
def a_date(v):
    try:
        if DATE.match(v or ''): return datetime.date.fromisoformat(v)
    except ValueError: pass
    refuse(f'{v!r} is not a date like 2026-11-20.')


def a_link(v, what):
    if v and not re.match(r'^https?://\S+$', v): refuse(f'The {what} has to be a full link (https://...), not {v!r}.')
    return v or None


def lineup_add(args, inp, now):
    d = a_date(args.date)
    if d < now: print(f'Heads up: {args.date} is already past.')
    if not (args.ticket or args.source): refuse('A show needs --ticket or --source, so people can check it.')
    shows = inp['lineup'].setdefault('shows', [])
    key = (args.date, args.artist.strip().lower(), args.city.strip().lower())
    if any((s.get('date'), str(s.get('artist', '')).lower(), str(s.get('city', '')).lower()) == key for s in shows):
        refuse(f'{args.artist} in {args.city} on {args.date} is already on the lineup.')
    shows.append({'date': args.date, 'artist': args.artist.strip(), 'bill': (args.bill or '').strip() or None, 'venue': args.venue.strip(),
                  'city': args.city.strip(), 'ticket': a_link(args.ticket, 'ticket'), 'source': a_link(args.source, 'source'),
                  'list': args.list})
    shows.sort(key=lambda s: str(s.get('date', '')))
    print(f'Lineup: + {args.date} {args.artist}, {args.venue}, {args.city}.')


def lineup_drop(args, inp):
    a_date(args.date)
    shows = inp['lineup'].setdefault('shows', [])
    hit = [s for s in shows if s.get('date') == args.date and str(s.get('artist', '')).lower() == args.artist.strip().lower()
           and (not args.city or str(s.get('city', '')).lower() == args.city.strip().lower())]
    if not hit: refuse(f'No show for {args.artist} on {args.date}' + (f' in {args.city}' if args.city else '') + ' on the lineup.')
    if len(hit) > 1: refuse(f'{len(hit)} shows match ({", ".join(str(s.get("city")) for s in hit)}). Add --city.')
    shows.remove(hit[0])
    print(f'Lineup: - {args.date} {hit[0].get("artist")}, {hit[0].get("city")}.')


def drop_add(args, inp, now):
    d = a_date(args.date)
    if d < now: print(f'Heads up: {args.date} is already past.')
    drops = inp['drops'].setdefault('drops', [])
    if any(x.get('date') == args.date and str(x.get('title', '')).lower() == args.title.strip().lower() for x in drops):
        refuse(f'{args.title} on {args.date} is already in the drops.')
    drops.append({'date': args.date, 'artist': args.artist.strip(), 'title': args.title.strip(), 'type': args.type, 'label': args.label,
                  'spotify': a_link(args.spotify, 'Spotify link'), 'source': a_link(args.source, 'source'), 'fact': (args.fact or '').strip() or None})
    drops.sort(key=lambda x: str(x.get('date', '')))
    print(f'Drops: + {args.date} {args.artist}, {args.title}.')


def night(args, inp, cur):
    slug = args.slug.strip()
    if not re.match(r'^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$', slug): refuse(f'{slug!r} is not a night slug like 2026-10-10-reality-mrkt.')
    e = events().get(slug)
    if not e: refuse(f'There is no night {slug} in events/events.json. Make the night first (newevent.py), then add its acts.')
    if not args.act: refuse("Add at least one act: --act 'Name|dj|<spotify link or blank>|<other link or blank>'.")
    nights = inp['who_played'].setdefault('nights', [])
    n = next((x for x in nights if x.get('slug') == slug), None)
    if n is None:
        n = {'slug': slug, 'title': e.get('title'), 'venue': e.get('venue'), 'date': e.get('date'), 'acts': []}
        nights.append(n)
        nights.sort(key=lambda x: str(x.get('date') or ''), reverse=True)
    if not n.get('acts'):
        n['acts'] = []
        # the inputs have no acts for this night, so any the page shows were written straight into music.json
        # (the safety net kept them). They join the inputs first, so the new act adds to them, never replaces them.
        old = next((x for x in (cur or {}).get('nights', []) or [] if isinstance(x, dict) and x.get('slug') == slug), None)
        for a in (old or {}).get('acts', []) or []:
            if not isinstance(a, dict): continue
            sp, fr = a.get('spotify'), a.get('frame')
            n['acts'].append({'name': a.get('name'), 'kind': a.get('kind'),
                              'spotify': {'track': sp.get('track'), 'title': sp.get('title')} if isinstance(sp, dict) and sp.get('track') else None,
                              'alt_link': a.get('alt_link'), 'frame': {'thumb': fr['thumb']} if isinstance(fr, dict) and fr.get('thumb') else None})
        k = len(n['acts'])
        if k: print(f'{slug} has acts on the page but none in the inputs: ' + ('its 1 act moves' if k == 1 else f'its {k} acts move') + ' into the inputs first.')
    for raw in args.act:
        parts = [p.strip() for p in raw.split('|')]
        if len(parts) > 4: refuse(f'{raw!r} has more than four parts. Use Name|kind|spotify|other.')
        name, kind, sp, other = (parts + ['', '', '', ''])[:4]
        if not name: refuse(f'{raw!r} has no name. Use Name|kind|spotify|other.')
        if kind and not re.match(r'^[a-z][a-z ]{0,19}$', kind.lower()): refuse(f'{kind!r} is not a kind (dj, band, rapper, or blank).')
        if any(str(a.get('name', '')).lower() == name.lower() for a in n['acts']):
            print(f'  {name} is already on {slug}: left as it is.'); continue
        spot = None
        if sp:
            i = spotify_id(sp)
            if not i: refuse(f'{sp!r} is not a Spotify track link.')
            j = oembed(i)
            if not j.get('title'):
                if i in transient: refuse(f'Spotify did not answer for track {i}. Try again in a minute.')
                refuse(f'Spotify does not know track {i} ({j.get("error", "")}).')
            spot = {'track': i, 'title': j['title']}
        n['acts'].append({'name': name, 'kind': kind.lower() or None, 'spotify': spot, 'alt_link': a_link(other, 'other link'), 'frame': None})
        print(f'  + {name}' + (f' ({kind.lower()})' if kind else '') + (f', plays {spot["title"]}' if spot else '') + f' on {slug}.')


# ---------------- main
def parse(argv):
    ap = argparse.ArgumentParser(prog='build_music.py', description='Build content/music.json and run the weekly battle. Dry until --write.')
    ap.add_argument('--write', action='store_true', help='save (default: dry, print only)')
    ap.add_argument('--force', action='store_true', help='write even when it drops a hand edit to music.json')
    sub = ap.add_subparsers(dest='cmd')
    sub.add_parser('close', help='record last week\'s winner and put it first on rotation')
    b = sub.add_parser('battle', help='set next week\'s battle (closes the last one first)')
    b.add_argument('link_a'); b.add_argument('link_b')
    b.add_argument('--artists', nargs='+', metavar='NAME')
    b.add_argument('--week', help='YYYY-wWW (default: this week on the San Antonio clock)')
    b.add_argument('--replace', action='store_true', help="fix this week's picks, only while nobody has voted in it")
    lu = sub.add_parser('lineup', help='add or drop a Texas show')
    lus = lu.add_subparsers(dest='op')
    la = lus.add_parser('add')
    for f in ('--date', '--artist', '--venue', '--city'): la.add_argument(f, required=True)
    la.add_argument('--ticket'); la.add_argument('--source'); la.add_argument('--bill')
    la.add_argument('--list', default='local', choices=('local', 'anchor'))
    ld = lus.add_parser('drop')
    ld.add_argument('--date', required=True); ld.add_argument('--artist', required=True); ld.add_argument('--city')
    dr = sub.add_parser('drop', help='add a dated release')
    drs = dr.add_subparsers(dest='op')
    da = drs.add_parser('add')
    for f in ('--date', '--artist', '--title', '--source'): da.add_argument(f, required=True)
    da.add_argument('--type', default='album'); da.add_argument('--label'); da.add_argument('--spotify'); da.add_argument('--fact')
    ni = sub.add_parser('night', help="add a night's acts to Who Played")
    ni.add_argument('slug')
    ni.add_argument('--act', action='append', metavar="'Name|kind|spotify|other'")
    for p in (b, la, ld, da, ni, sub.choices['close']):
        p.add_argument('--write', action='store_true', default=argparse.SUPPRESS)
        p.add_argument('--force', action='store_true', default=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if a.cmd in ('lineup', 'drop') and not a.op: ap.error(f'{a.cmd} needs ' + ('add or drop' if a.cmd == 'lineup' else 'add'))
    return a


def main(argv):
    args = parse(argv)
    now = today()
    inp = load_inputs()
    st = load_state()
    cur_text = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else None
    cur = json.loads(cur_text) if cur_text else None
    rot_text = open(ROTATION, encoding='utf-8').read() if os.path.exists(ROTATION) else None
    rot = json.loads(rot_text) if rot_text else {'items': []}
    inp0, st0, rot0 = copy.deepcopy(inp), copy.deepcopy(st), copy.deepcopy(rot)

    if args.cmd == 'close': close(st, rot, now)
    elif args.cmd == 'battle': set_battle(args, st, rot, now)
    elif args.cmd == 'lineup' and args.op == 'add': lineup_add(args, inp, now)
    elif args.cmd == 'lineup' and args.op == 'drop': lineup_drop(args, inp)
    elif args.cmd == 'drop': drop_add(args, inp, now)
    elif args.cmd == 'night': night(args, inp, cur)

    m, kept = build(inp, st, cur)
    print(json.dumps({k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in m.items()}, indent=1))
    listed = {x.get('slug') for x in inp['who_played'].get('nights', []) or [] if isinstance(x, dict)}
    for n in kept:
        print(f'KEPT {n["slug"]} ({n.get("title")}): '
              + ('the inputs list this night with no acts, so the acts on the page stay. To add to them:'
                 if n['slug'] in listed else 'it is in music.json but not in the inputs. To make it stick:')
              + f"\n  build_music.py night {n['slug']} --act 'Name|kind|spotify|other' --write"
              + f'\n  To take it off the page, delete it from {REL(OUT)}' + (' as well.' if n['slug'] in listed else '.'))
    if problems: print('PROBLEMS:\n  ' + '\n  '.join(problems))
    for what, verb, rows in (('lineup', 'runs', m['lineup']), ('drops', 'run', m['drops'])):
        last = max((r['date'] for r in rows), default=None)
        if not last or datetime.date.fromisoformat(last) - now < datetime.timedelta(days=SOON):
            cmd = 'lineup add --date ... --artist ... --venue ... --city ... --ticket ...' if what == 'lineup' else 'drop add --date ... --artist ... --title ... --source ...'
            d = datetime.date.fromisoformat(last) if last else None
            when = (f'{verb} out now: there is nothing dated.' if not d else f'ran out {mon_d(d)}.' if d < now
                    else f'{verb} out {mon_d(d)}, under {SOON // 7} weeks away.')
            print(f'HEADS UP: the {what} {when} Add more: build_music.py {cmd} --write')
    if m.get('battle') and monday(m['battle'].get('id')):
        end = monday(m['battle']['id']) + datetime.timedelta(days=6)
        if end < now: print(f'HEADS UP: the {m["battle"]["id"]} battle ended Sun {mon_d(end)}. Set the next one: build_music.py battle <linkA> <linkB> --artists "A" "B" --write')

    changes = diff(_norm(cur), _norm(m)) if cur is not None else []
    if changes:
        print('CHANGES to ' + REL(OUT) + ':\n  ' + '\n  '.join(say(d) for d in changes[:25]) + ('\n  ... and %d more' % (len(changes) - 25) if len(changes) > 25 else ''))
    elif cur is not None:
        print('No change to ' + REL(OUT) + ' (past the build date).')
    stop = guard(st0, cur_text, cur, m, getattr(args, 'force', False))
    if stop: refuse(stop)
    if transient: refuse(f'Spotify did not answer for {len(transient)} tracks ({", ".join(transient[:5])}). Run it again in a minute.')

    if not args.write:
        print('DRY RUN: nothing written. Add --write to save.')
        return
    out_text = dumps(m, 1)
    files = []
    if inp != inp0:
        for k, f in (('who_played', 'who_played.json'), ('lineup', 'lineup.json'), ('drops', 'drops.json'), ('texas_lineage', 'texas_lineage.json')):
            if inp[k] != inp0[k]: files.append((os.path.join(S, f), dumps(inp[k], 1)))
    if rot != rot0: files.append((ROTATION, dumps(rot, 2)))
    st['built_sha'] = sha(out_text)
    if kept: st['kept'] = sorted(n['slug'] for n in kept)      # the guard keeps watching these nights' acts
    else: st.pop('kept', None)
    files.append((STATE, dumps(st, 1)))
    files.append((CACHE, dumps(dict(sorted(cache.items())), 1)))
    files.append((OUT, out_text))
    for p, t in files:
        save(p, t)
        print('wrote', REL(p))


# ---------- the desk's lines, written from the verified facts in texas_lineage.json (sources live there)
NOTES_BY_ID = {
    '2JLzVBFFRsqgmu20e3p2Rm': 'Off EMOTIONS, out April 3. The album samples Purple Swag twice, and Purple Swag samples Houston.',
    '2rSNj3zySzJ09yWUQar6Iz': 'Single, out Aug 7 on Opium. It nods back to How U Feel?, the opener on If Looks Could Kill. He plays Austin Oct 13.',
    '0xBFIv6bYgJVKcAJbS4TCK': 'Single from August 2025. Complex calls it the song where the Toronto rapper found his sound.',
    '4dPUnCKITMG4pKIezK47NK': 'Off the three-song tour ep, out Sep 19. kimj has made beats for 2hollis and glaive.',
    '3iQzTFuQHfCEb5m50ASIyx': 'Out Aug 26 on YSL. Young Thug signed Tezzus and diamond* last October, after bada bing, bada b\u00d8\u00d8m took off.',
    '6m96Qz0SKJHFgluQAsKhFu': 'Off THE H\u00d8MEC\u00d8MING*, out April 14. diamond* started the Atlanta crew \u00d8WAY with Tezzus.',
    '0KJIm3Ukd82n0d7VOCQWWI': 'Off Fat Boi Fall, 2024. KAV-MAN holds a card here, and his card plays this from 2:03.',
    '0sKUd3PxqITdWs8NqzpCBV': 'Single, out June 29 on GateWayRecords. It plays when you open VIRGOSGATEWAY\u2019s card.',
    '1PkGP1pjnPXpi081HVv7zr': 'Single, out March 28 on GateWayRecords.',
}

TEXAS_FACTS = {
    '4sJZeavYykvwfhrXGv9Qy9': 'DJ Screw cut the original as one 35-minute freestyle tape on June 27, 1996. Yungstar was on it.',
    '1diqY2tozk63skJIQrCkq1': 'Screwed Up Click. This is the one that took Lil\u2019 Keke national in 1997.',
    '2yXxo8fiEWIoC69FWyogsO': 'Wreckshop put it out after Fat Pat was killed in Houston in 1998. He was 27.',
    '2z8tZ7BZ1GzFIlaPt5qWKx': 'Ridin\u2019 Dirty went gold with no videos and no official singles.',
    '4ns1XFP3W5JPyzvnAjMdHD': 'UGK\u2019s only Hot 100 hit. It peaked at 70.',
    '338VhnERUjSnXmIFGuxonu': 'Z-Ro made the beat himself, off the Coldcut remix of Paid in Full.',
    '7yUX0uaQhXpl2jMfHK3AUg': 'Off Crack, which made 48 on the Billboard 200.',
    '1S775nWRwKYQDKjUyIZZ8F': 'Michael 5000 Watts started Swishahouse in 1997. The north side\u2019s answer to Screw.',
    '3kZoay4ANo86ehb6s4RwS9': 'Number one on the Hot 100, then a Grammy.',
    '3xhTCpyWpZJ6z5miHy8TRF': 'A Swishahouse release. The album opened at 8 on the Billboard 200.',
    '27Wwwbdh9pKL9n23FOJH9z': 'Big Pokey was Screwed Up Click. He died in 2023 after collapsing on stage in Beaumont.',
    '5VTEfwUs0LWtbT9vBoFlFB': 'Bay City, Texas. He later hit the Hot 100 with Paul Wall on Johnny Dang.',
}

LINEAGE_LINES = {   # keyed by the NEW track's title
    'R.I.P. SCREW': 'Travis put a 1998 Houston TV interview with Screw on his Astroworld tribute.',
    'Beating Down Yo Block': 'Monaleo built it on Yungstar\u2019s 1999 Houston classic.',
    'Purple Swag': 'A$AP Rocky\u2019s Purple Swag samples Still Tippin\u2019, the Houston anthem.',
    'Magnolia': 'Carti signed to Rocky\u2019s AWGE in 2016. Magnolia came off that first tape.',
    'Jennifer\u2019s Body': 'Carti started Opium in 2019 and signed Ken Carson. A Great Chaos came out on Opium.',
    'IM FROM DA MOUND': 'Sematary samples Three 6 Mafia here, and told PAPER it was for Memphis.',
}

# the lineup's bill lines, short, from what each primary page says (sources stay in the file).
# A show added with `lineup add --bill` carries its own line and needs no entry here.
BILLS = {
    ('2026-10-13', 'Destroy Lonely', 'Austin'): 'Grey Day Tour, with $uicideboy$',
    ('2026-10-17', 'Junkie', 'San Antonio'): 'Final Texas show. Warphole, Cannon the Dealers, Pet Peeves. All ages.',
    ('2026-10-17', 'Soft Kill', 'San Antonio'): 'Only Texas date. Salt+ and VIDE. All ages.',
    ('2026-10-17', 'Streetlamp', 'Austin'): 'In-store show in West Campus',
    ('2026-10-25', 'Streetlamp', 'San Antonio'): 'The band posted it. The venue lists Max Diaz that night.',
    ('2026-10-30', 'Blade Rave', 'San Antonio'): 'Halloween vampire rave. We shot the last one here in August.',
    ('2026-10-30', 'Blade Rave', 'Fort Worth'): 'Halloween vampire rave. 18+',
    ('2026-10-30', 'Blade Rave', 'Houston'): 'Halloween vampire rave',
    ('2026-10-31', 'Blade Rave', 'Austin'): 'Halloween night, outdoor stage. All ages.',
    ('2026-10-31', 'Blade Rave', 'Dallas'): 'Third annual Dallas Halloween. 18+',
    ('2026-11-13', 'Streetlamp', 'Dallas'): 'With Caroline Carr and The Black Velvets',
}

# the drops' lines in the house voice, from the facts the research verified (sources stay in the file).
# A release added with `drop add --fact` carries its own line.
DROP_FACTS = {
    'Louder Now (20th Anniversary Edition)': 'The LP and CD add two B-sides, Brooklyn and Sleep.',
    'The Black Parade (20th Anniversary Deluxe Edition)': 'Three B-sides and three live cuts from a Hoboken show.',
    '00TWINZ': 'Complex reported Oct 30 back in July. No pre-save or tracklist yet.',
    'The Open Door (Deluxe Edition)': 'Remastered at 20, with three rarities and an unreleased demo of Good Enough.',
    'Pirouette': '16 tracks. The cover is drawn by Yoshitaka Amano, the Vampire Hunter D artist.',
    'Atrocity Exhibition (10 Year Anniversary Edition)': 'He plays it front to back at the Mohawk in Austin on Dec 3.',
}

if __name__ == '__main__':
    main(sys.argv[1:])
