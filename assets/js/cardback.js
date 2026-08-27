/* 0FF THE PRINT, THE BACK OF THE CARD.  /c/<card_slug>/
 *
 * His ask: "what about their own custom page they can edit? lets brainstorm on
 * what that can consist of", and then, in the same breath, "everything should
 * be easy to use for the user."
 *
 * THE WHOLE DESIGN IS IN THAT SECOND SENTENCE. A card holder types exactly two
 * things here, a tagline and a bio. Everything else on this page ASSEMBLES
 * ITSELF out of work they already did somewhere else on the site: the card they
 * built at /card/, the posts they put in The Take, the song the desk put on
 * rotation, the story they wrote, the clip they submitted. Every public view
 * already carries card_slug, so this page is five filters and no new tables.
 *
 * That is what makes it easy. The page fills up because they are USING the
 * site, not because they sat down to fill in a profile.
 *
 * WHO CAN CHANGE WHAT. The database decides, not this file. A member holds an
 * own-row UPDATE on profiles and guard_profile_privileges() pins everything
 * they must not set (approved, is_admin, card_slug, frame_grant). The desk
 * holds an is_admin() policy over all of it. So drawing a pencil here is a
 * DISPLAY decision: a forged one still gets refused server side.
 *
 * ⛔ BIO IS PLAIN TEXT AND IS ESCAPED. It renders through esc() into a
 *    white-space:pre-wrap block, never innerHTML of raw input. No markdown, no
 *    links, no embeds. The 600 cap is a comfort, the escape is the defence.
 */
(function (w, d) {
  'use strict';

  var me = null, admin = false, mine = false, slug = '', data = null;

  /* ⛔ HOW DEEP ARE WE. This file serves TWO shapes of URL: /c/?s=slug is one
     level down, and a baked /c/<slug>/ is TWO. Every relative path in here was
     hardcoded '../', so on a baked page "Your card" went to /c/card/, the back
     link went to /c/, every story link 404'd and the roster fetch this fallback
     needs resolved to /c/content/roster.json. bake.py rewrites the ../ in the
     HTML it copies; it cannot rewrite the ones built in JS.
     A trailing segment with a dot in it is a FILE (/c/index.html), not a folder. */
  var BASE = (function () {
    var segs = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    var last = segs[segs.length - 1] || '';
    return (segs.length >= 2 && last.indexOf('.') === -1) ? '../../' : '../';
  })();

  /* The rail's CSS ships from HERE, not from the page.
     Every /c/<slug>/index.html is a byte-identical copy of c/index.html with a
     different title, and the card-back CSS is inlined in each one. Nine copies
     of a new rule is nine chances to drift, so the one thing all nine already
     share, this file, carries it. */
  (function () {
    var css =
      '.shotwrap{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:6px}' +
      '.artrail{display:flex;align-items:center;justify-content:center;gap:1px;max-width:140px;' +
        'flex-wrap:wrap}' +
      '.artpip{width:22px;height:26px;padding:0;background:none;border:0;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center}' +
      '.artpip i{display:block;width:7px;height:7px;border-radius:50%;' +
        'background:rgba(255,255,255,.24);transition:all .18s}' +
      '.artpip:hover i{background:rgba(255,255,255,.5)}' +
      '.artpip[aria-current="true"] i{background:var(--pink-glow,#ff79c6);width:9px;height:9px;' +
        'box-shadow:0 0 8px rgba(255,121,198,.7)}' +
      '.artname{font-family:var(--f-mono,ui-monospace,monospace);font-size:9px;letter-spacing:.14em;' +
        'text-transform:uppercase;color:var(--muted,#8b8595);text-align:center;line-height:1;' +
        'margin-top:-2px;min-height:9px}';
    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  })();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* The slug can arrive two ways and BOTH have to work. bake.py writes a real
     folder at /c/<slug>/ so the link has a clean URL and its own OG card, but a
     member the desk has just handed a card to has no folder until the next
     bake, and telling them "your page exists after he pushes" is not a thing
     anybody should have to say. /c/?s=<slug> answers immediately. */
  function readSlug() {
    var m = /\/c\/([^\/?#]+)\/?$/.exec(location.pathname);
    if (m && m[1] && m[1] !== 'index.html') return decodeURIComponent(m[1]);
    var q = new URLSearchParams(location.search).get('s');
    return q ? String(q).trim() : '';
  }

  function when(iso) {
    var dt = new Date(iso);
    return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ⛔ The HOST is ours, never theirs. A member gives a platform and a bare
  // handle and this rebuilds the address, which is what makes a member link
  // unable to point anywhere but their own profile on a known site.
  var LINK_BASE = {
    instagram:  ['Instagram',  'https://instagram.com/'],
    tiktok:     ['TikTok',     'https://www.tiktok.com/@'],
    youtube:    ['YouTube',    'https://www.youtube.com/@'],
    x:          ['X',          'https://x.com/'],
    twitch:     ['Twitch',     'https://twitch.tv/'],
    threads:    ['Threads',    'https://www.threads.net/@'],
    spotify:    ['Spotify',    'https://open.spotify.com/artist/'],
    soundcloud: ['SoundCloud', 'https://soundcloud.com/'],
    bandcamp:   ['Bandcamp',   'https://bandcamp.com/']
  };
  // ⛔ The base is hardcoded and the handle is a bare word. The database will
  // not hold a host (007's CHECK pins link_platform to a known list and the
  // handle to [A-Za-z0-9._-]), so no member-supplied scheme can reach an href.
  function outLink(p, h) {
    var base = LINK_BASE[p];
    if (!p || !h || !base) return null;
    return { url: base[1] + encodeURIComponent(h), label: '@' + h, plat: p, name: base[0] };
  }

  /* THE LINK ROW. This page is the URL they put in their bio, so the links are
     the second thing on it after their name, not a footnote. The single
     link_platform/link_handle from 007 is folded in as one more entry so a
     member who set that before 021 does not lose it. */
  function linkRow(c) {
    var out = [], seen = {};
    var push = function (pl, hd) {
      var l = outLink(pl, hd);
      if (!l) return;
      var k = l.plat + '|' + hd;
      if (seen[k]) return;
      seen[k] = 1; out.push(l);
    };
    (Array.isArray(c.links) ? c.links : []).forEach(function (l) { push(l && l.p, l && l.h); });
    push(c.link_platform, c.link_handle);
    if (!out.length) return null;
    var row = d.createElement('div');
    row.className = 'linkrow';
    out.slice(0, 6).forEach(function (l) {
      var a = d.createElement('a');
      a.className = 'lk lk-' + l.plat;
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = '<b>' + esc(l.name) + '</b><span>' + esc(l.label) + '</span>';
      row.appendChild(a);
    });
    return row;
  }

  function trackId(v) {
    var m = /(?:track\/|spotify:track:)([A-Za-z0-9]{22})/.exec(String(v || ''));
    if (m) return m[1];
    return /^[A-Za-z0-9]{22}$/.test(String(v || '')) ? String(v) : null;
  }

  /* ---------- the sheet, two fields, nothing else ---------- */
  function wordsSheet() {
    var back = d.createElement('div');
    back.className = 'sh-back';
    var c = data.card || {};
    back.innerHTML =
      '<div class="sh">' +
        '<h3>Your words</h3>' +
        '<div class="note">The only two things on this page you type. Everything else fills ' +
        'itself in from what you post, write and put on rotation.</div>' +
        '<label>Tagline</label>' +
        '<input id="w-tag" type="text" maxlength="80" value="' + esc(c.tagline || '') + '" ' +
          'placeholder="one line. who you are in the room.">' +
        '<div class="count" id="w-tagc"></div>' +
        '<label>Bio</label>' +
        '<textarea id="w-bio" rows="7" maxlength="600" ' +
          'placeholder="a short paragraph. plain words, no links.">' + esc(c.bio || '') + '</textarea>' +
        '<div class="count" id="w-bioc"></div>' +
        '<div class="say"></div>' +
        '<div class="foot">' +
          '<button class="btn" id="w-go">Save</button>' +
          '<button class="btn ghost" id="w-x">Never mind</button>' +
        '</div>' +
      '</div>';
    d.body.appendChild(back);

    var tag = back.querySelector('#w-tag'), bio = back.querySelector('#w-bio');
    var tagc = back.querySelector('#w-tagc'), bioc = back.querySelector('#w-bioc');
    var say = back.querySelector('.say');
    function tick() {
      tagc.textContent = tag.value.length + ' / 80';
      bioc.textContent = bio.value.length + ' / 600';
      tagc.classList.toggle('over', tag.value.length >= 80);
      bioc.classList.toggle('over', bio.value.length >= 600);
    }
    tag.addEventListener('input', tick); bio.addEventListener('input', tick); tick();

    function shut() { back.remove(); d.removeEventListener('keydown', key); }
    function key(e) { if (e.key === 'Escape') shut(); }
    d.addEventListener('keydown', key);
    back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    back.querySelector('#w-x').onclick = shut;

    back.querySelector('#w-go').onclick = async function () {
      var go = this;
      go.disabled = true; say.className = 'say'; say.textContent = 'Saving…';
      try {
        await OTP.saveMyWords({ tagline: tag.value, bio: bio.value });
        shut();
        await load();
      } catch (e) {
        say.className = 'say bad';
        say.textContent = e.message || String(e);
        go.disabled = false;
      }
    };
  }

  /* ---------- a song row, embed on tap ----------
     Members' tracks carry no preview mp3 and never could: the rotation view
     holds a track id and Spotify's oEmbed does not return a preview url. So
     every song on this page opens a real player in place, the same call the
     homepage makes, instead of two buttons that mean different things. */
  function songRow(id, title, artist, art) {
    var el = d.createElement('div');
    el.className = 'song';
    el.innerHTML =
      '<span class="art"></span>' +
      '<span><span class="t">' + esc(title || 'Track') + '</span>' +
      (artist ? '<span class="a">' + esc(artist) + '</span>' : '') + '</span>' +
      '<button class="play" type="button" title="Play">&#9654;</button>';
    if (art) el.firstChild.style.backgroundImage = 'url("' + String(art).replace(/"/g, '%22') + '")';
    el.querySelector('.play').onclick = function () {
      el.classList.add('open');
      el.innerHTML = '<iframe loading="lazy" allow="encrypted-media" ' +
        'src="https://open.spotify.com/embed/track/' + encodeURIComponent(id) + '"></iframe>';
    };
    return el;
  }

  function h2(name, sub, withPen) {
    var h = d.createElement('h2');
    h.className = 'hd';
    h.innerHTML = esc(name) + (sub ? '<span>' + esc(sub) + '</span>' : '');
    if (withPen && (mine || admin)) {
      var b = d.createElement('button');
      b.type = 'button'; b.className = 'pen';
      b.textContent = mine ? 'edit' : 'edit theirs';
      b.onclick = wordsSheet;
      h.appendChild(b);
    }
    return h;
  }

  function emptyRail(msg) {
    var e = d.createElement('div');
    e.className = 'none-yet';
    e.textContent = msg;
    return e;
  }

  /* THE EXCHANGE, and it only ever renders on a member's OWN page.
     /seats/ says out loud "what it costs is nothing, what it asks is that you
     post sometimes", and until now the house asked and offered nothing back.
     That is the whole reason nobody posts twice. This is the other half in
     writing, on the page they will actually come back to.
     ⛔ MINE ONLY. On somebody else's page a house pitch is the outlet talking
        over the person whose name is at the top, which is the one thing this
        site is not for. The recruiting version of this copy lives on /seats/. */
  function exchangeBlock() {
    var coming  = (data.dates || []);
    var asked   = coming.filter(function (r) { return r.want_house && r.house_status === 'none'; });
    var onList  = coming.filter(function (r) { return r.house_status === 'on_list'; });
    var shotN   = (data.shot || []).length;

    // ⛔ On a database that has not run 022 the exchange columns come back
    //    undefined, and telling somebody to tick a box that saves nothing is a
    //    small lie on their own page. The promise still holds, the mechanism
    //    just is not wired yet, so say the true half.
    var wired = !coming.length || coming[0].house_status !== undefined;

    var state;
    if (!wired)             state = 'Ask the desk directly for now.';
    else if (onList.length) state = 'We are coming to ' + onList[0].title + '.';
    else if (asked.length)  state = 'You asked about ' + asked.length +
                              (asked.length === 1 ? ' date' : ' dates') + '. We answer by hand, so give it a day.';
    else if (shotN)         state = 'We have shot ' + shotN + (shotN === 1 ? ' night' : ' nights') +
                              ' of yours so far. Put the next one up.';
    else if (coming.length) state = 'You have dates up and none of them are asking. Open one and tick the box.';
    else                    state = 'Nothing up yet. That is the only part we cannot do for you.';

    var el = d.createElement('div');
    el.className = 'yours exch';
    el.innerHTML =
      '<b>The Exchange</b>' +
      '<div class="note">A seat is not a badge. It is a trade, and this is our half of it. ' +
      'Put your dates up. If we can make it we shoot the night, and the frames come back with ' +
      'your name on them: here, in the drops, and yours to post anywhere you want.</div>' +
      '<div class="note">We are one camera, so sometimes the answer is no. Asking costs nothing ' +
      'and the desk answers it itself.</div>' +
      '<div class="ex-state">' + esc(state) + '</div>' +
      '<div class="row">' +
        '<a class="btn sm" href="' + BASE + 'dates/">Put a date up</a>' +
        '<a class="btn ghost sm" href="' + BASE + 'events/">See the drops</a>' +
      '</div>';
    return el;
  }

  /* ---------- paint ---------- */
  function paint() {
    var page = d.getElementById('page');
    var c = data.card;
    page.innerHTML = '';

    if (c.accent) d.body.className = 'acc-' + c.accent;

    /* header */
    var hero = d.createElement('header');
    hero.className = 'hero';
    // their upload wins; the house card art is the floor
    var housePhoto = houseCard && houseCard.photo
      ? BASE + String(houseCard.photo).replace(/^\.\//, '') : '';
    var photo = c.card_photo || housePhoto;

    /* ---- THE ARTS THEY HOLD -------------------------------------------
       A member can hold more than one card (roster.json `variants`). Their own
       upload still wins and still shows first; the house cards are the floor
       underneath it, in the order the desk set them. Somebody holding one art
       gets exactly the hero this page has always rendered, and the rail is not
       built at all. */
    var artUrl = function (u) {
      // The shot is 132 CSS px and the wall is blurred at 34px, so the 760px
      // derivative is the right file for both. Remote uploads are left alone:
      // only assets/ paths have a derivative, and derive.py guarantees one for
      // everything roster.json and creators.json name.
      return /^https?:/i.test(u) ? u : u.replace(/(^|\/)assets\//, '$1assets/card/');
    };
    var arts = [];
    if (c.card_photo) arts.push({ src: c.card_photo, label: 'THEIRS' });
    if (housePhoto) {
      arts.push({ src: housePhoto, label: (houseCard && houseCard.card_label) || 'ORIGINAL' });
      ((houseCard && houseCard.variants) || []).forEach(function (v) {
        if (!v || !v.photo) return;
        arts.push({
          src: BASE + String(v.photo).replace(/^\.\//, ''),
          label: v.label || v.id || ''
        });
      });
    }
    var artAt = 0;

    var tagline = c.tagline || (houseCard && houseCard.flavor) || '';
    var bio = c.bio || (houseCard && houseCard.lore) || '';
    var bioIsTheirs = !!c.bio;
    hero.innerHTML =
      '<div class="wall"></div>' +
      '<div class="in">' +
        '<div class="shotwrap">' +
          '<div class="shot' + (photo ? '' : ' bare') + '">' + (photo ? '' : esc((c.display_name || '?').charAt(0))) + '</div>' +
          (arts.length > 1
            ? '<div class="artrail" role="group" aria-label="Cards this member holds">' +
                arts.map(function (a, n) {
                  return '<button class="artpip" type="button" data-go="' + n + '" aria-current="' +
                    (n === 0 ? 'true' : 'false') + '" aria-label="Card ' + (n + 1) + ' of ' +
                    arts.length + (a.label ? ', ' + esc(a.label) : '') + '"><i></i></button>';
                }).join('') +
              '</div><div class="artname"></div>'
            : '') +
        '</div>' +
        '<div class="nameblock">' +
          '<h1>' + esc(c.display_name || c.card_slug) + '</h1>' +
          '<div class="tag' + (tagline ? '' : ' none') + '">' +
            esc(tagline || (mine ? 'no tagline yet. tap edit and say who you are.' : '')) + '</div>' +
          '<div class="meta"></div>' +
        '</div>' +
      '</div>';
    var wallEl = hero.querySelector('.wall');
    var shotEl = hero.querySelector('.shot');
    var nameEl = hero.querySelector('.artname');
    function paintArt(n) {
      if (!arts.length) return;
      artAt = (n + arts.length) % arts.length;
      var u = artUrl(arts[artAt].src).replace(/"/g, '%22');
      wallEl.style.backgroundImage = 'url("' + u + '")';
      shotEl.style.backgroundImage = 'url("' + u + '")';
      if (nameEl) nameEl.textContent = arts.length > 1
        ? (artAt + 1) + '/' + arts.length + (arts[artAt].label ? '  ' + arts[artAt].label : '')
        : '';
      hero.querySelectorAll('.artpip').forEach(function (b) {
        b.setAttribute('aria-current', String(+b.dataset.go === artAt));
      });
    }
    if (photo) {
      paintArt(0);
      hero.querySelectorAll('.artpip').forEach(function (b) {
        b.addEventListener('click', function () { paintArt(+b.dataset.go); });
      });
      // The shot itself advances, because on a phone it is a far bigger target
      // than any pip and it is the thing somebody's thumb is already on.
      if (arts.length > 1) {
        shotEl.style.cursor = 'pointer';
        shotEl.addEventListener('click', function () { paintArt(artAt + 1); });
      }
    }
    var meta = hero.querySelector('.meta');
    // above the chips, not below them: on a link-in-bio page the links outrank
    // the badges
    var lr = linkRow(c);
    if (lr) hero.querySelector('.nameblock').insertBefore(lr, meta);
    var chip = function (txt, href, hot) {
      var el = d.createElement(href ? 'a' : 'span');
      el.className = 'chip' + (hot ? ' hot' : '');
      if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; }
      el.textContent = txt;
      meta.appendChild(el);
    };
    chip('CARD HOLDER');
    if (c.card_frame) chip(String(c.card_frame).replace(/-/g, ' '));
    // the single 007 link already rides in the link row; a chip repeating it
    // would be the same destination twice, four inches apart
    page.appendChild(hero);

    var body = d.createElement('div');
    body.className = 'pad';
    page.appendChild(body);

    /* if it is theirs, say so plainly and point at the two places that fill
       this page up, because "make a page" is a much worse instruction than
       "post something and it shows up here" */
    if (mine) {
      var y = d.createElement('div');
      y.className = 'yours';
      y.innerHTML = '<b>This one is yours</b>' +
        '<div class="note">Two things you type, a tagline and a bio. Everything else on this ' +
        'page shows up on its own when you post, write, or get a song on rotation.</div>' +
        '<div class="row">' +
          '<button class="btn sm" id="y-words">Your words</button>' +
          '<a class="btn ghost sm" href="' + BASE + 'card/">Your card</a>' +
          '<a class="btn ghost sm" href="' + BASE + 'compose/">Post something</a>' +
          '<a class="btn ghost sm" href="' + BASE + 'my/">Your desk</a>' +
        '</div>';
      body.appendChild(y);
      y.querySelector('#y-words').onclick = wordsSheet;
      body.appendChild(exchangeBlock());
    }

    /* the bio */
    var bs = d.createElement('section');
    bs.appendChild(h2('The Words', 'in their own', true));
    var bioEl = d.createElement('div');
    bioEl.className = 'bio' + (bio ? '' : ' none');
    bioEl.textContent = bio || (mine ? 'Nothing written yet. Tap edit.' : 'No bio yet.');
    bs.appendChild(bioEl);
    // Say whose words these are. Passing off the house's copy as theirs would be
    // a small lie on somebody else's page.
    if (bio && !bioIsTheirs) {
      var src = d.createElement('div');
      src.className = 'bio-src';
      src.textContent = mine ? 'From your card. Write your own and it replaces this.'
                             : 'From the back of their card.';
      bs.appendChild(src);
    }
    body.appendChild(bs);

    /* the music: their theme song, their three, and anything of theirs the
       desk put on the house grid */
    var theme = trackId(c.theme_song);
    var three = (c.featured || []).slice().sort(function (a, b) { return (a.slot || 0) - (b.slot || 0); });
    var rot = data.tracks || [];
    if (theme || three.length || rot.length) {
      var ms = d.createElement('section');
      ms.appendChild(h2('The Music', 'tap to play'));
      var songs = d.createElement('div');
      songs.className = 'songs';
      if (theme) songs.appendChild(songRow(theme, 'Their opening song', 'plays on their card', ''));
      three.forEach(function (f, i) {
        if (f && f.track) songs.appendChild(songRow(f.track, 'On repeat ' + (i + 1), '', ''));
      });
      rot.forEach(function (t) {
        songs.appendChild(songRow(trackId(t.link) || t.track, t.title, (t.artist || '') + ' · on the house grid', t.art));
      });
      ms.appendChild(songs);
      body.appendChild(ms);
    }

    /* what they have coming. Above the timeline on purpose: a date is the one
       thing on this page a reader can still act on. */
    if ((data.dates || []).length) {
      var MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      var DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
      var ds = d.createElement('section');
      ds.appendChild(h2('The Run', data.dates.length + ' coming'));
      var dr = d.createElement('div');
      dr.className = 'rows';
      data.dates.forEach(function (r) {
        // ⛔ local date, never new Date(ymd): that parses UTC MIDNIGHT and reads
        // a day early everywhere west of Greenwich, which is all of Texas.
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.on_date || ''));
        var when = '';
        if (m) {
          var dt = new Date(+m[1], +m[2] - 1, +m[3]);
          when = DOW[dt.getDay()] + ' ' + MON[+m[2] - 1] + ' ' + (+m[3]);
        }
        var href = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(String(r.link || '')) ? r.link : '';
        var a = d.createElement(href ? 'a' : 'div');
        if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener nofollow'; }
        a.className = 'row2 no-im';
        // THE EXCHANGE, on the kicker line. An unanswered ask is desk business
        // and stays off a page strangers read; "we are coming" is the part
        // worth saying out loud.
        var hx = r.house_status === 'shot' ? ' <span class="hx shot">the house shot this</span>'
               : r.house_status === 'on_list' ? ' <span class="hx onlist">the house is coming</span>'
               : (mine && r.want_house) ? ' <span class="hx asking">you asked for the house</span>' : '';
        a.innerHTML = '<div class="tt"><div class="k">' + esc(when) + ' &middot; ' + esc(r.kind || 'show') + hx + '</div>' +
          '<div class="n">' + esc(r.title || '') + '</div>' +
          ([r.venue, r.city].filter(Boolean).length
            ? '<div class="d">' + esc([r.venue, r.city].filter(Boolean).join(' \u00b7 ')) + '</div>' : '') +
          '</div>';
        dr.appendChild(a);
      });
      ds.appendChild(dr);
      body.appendChild(ds);
    }

    /* the nights the house actually shot for them. ⛔ THIS IS THE RAIL THAT
       BRINGS SOMEBODY BACK: it is the only thing on the page that fills up
       without them typing anything, because a night they played turns into
       frames with their name on them a few days later. */
    if ((data.shot || []).length) {
      var MON2 = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      var ns = d.createElement('section');
      ns.appendChild(h2('The Nights', 'shot by the house'));
      var nr = d.createElement('div');
      nr.className = 'rows';
      data.shot.forEach(function (r) {
        if (!r.event_slug) return;               // the CHECK forbids it, belt and braces
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.on_date || ''));
        var when = m ? MON2[+m[2] - 1] + ' ' + (+m[3]) + ' ' + m[1] : '';
        var a = d.createElement('a');
        a.href = BASE + 'events/' + encodeURIComponent(r.event_slug) + '/';
        a.className = 'row2 no-im';
        a.innerHTML = '<div class="tt">' +
          '<div class="k">' + esc(when) + ' <span class="hx shot">the frames</span></div>' +
          '<div class="n">' + esc(r.title || '') + '</div>' +
          ([r.venue, r.city].filter(Boolean).length
            ? '<div class="d">' + esc([r.venue, r.city].filter(Boolean).join(' \u00b7 ')) + '</div>' : '') +
          '</div>';
        nr.appendChild(a);
      });
      ns.appendChild(nr);
      body.appendChild(ns);
    }

    /* their posts */
    var ps = d.createElement('section');
    ps.appendChild(h2('The Take', (data.posts.length || 0) + ' up'));
    if (!data.posts.length) {
      ps.appendChild(emptyRail(mine ? 'nothing posted yet. anything you put in the take lands here.'
                                    : 'nothing posted yet'));
    } else {
      var g = d.createElement('div');
      g.className = 'grid';
      data.posts.forEach(function (p) {
        var el = d.createElement('article');
        el.className = 'post';
        el.innerHTML = (p.image_url ? '<span class="im"></span>' : '') +
          '<div class="tx">' + esc(p.text || '') + '</div>' +
          '<div class="when">' + (p.pinned ? '<span class="pin">pinned</span> · ' : '') +
          esc(when(p.created_at)) + '</div>';
        if (p.image_url) {
          var im = el.querySelector('.im');
          im.style.backgroundImage = 'url("' + p.image_url.replace(/"/g, '%22') + '")';
          im.setAttribute('role', 'img');
          im.setAttribute('aria-label', p.image_alt || '');
        }
        g.appendChild(el);
      });
      ps.appendChild(g);
    }
    body.appendChild(ps);

    /* their stories */
    if (data.stories.length) {
      var ss = d.createElement('section');
      ss.appendChild(h2('The Word', data.stories.length + (data.stories.length === 1 ? ' story' : ' stories')));
      var rw = d.createElement('div');
      rw.className = 'rows';
      data.stories.forEach(function (s) {
        var a = d.createElement('a');
        // ⛔ A BAKED story lives in git at word/<slug>/. An unbaked one only
        // exists in the database and is read at word/live/?s=<slug>. Sending a
        // reader to word/<slug>/ before the bake is a 404 with their name on it.
        a.href = s.baked ? BASE + 'word/' + encodeURIComponent(s.slug) + '/'
                         : BASE + 'word/live/?s=' + encodeURIComponent(s.slug);
        a.className = 'row2' + (s.cover_url ? '' : ' no-im');
        a.innerHTML = (s.cover_url ? '<span class="im"></span>' : '') +
          '<div class="tt"><div class="k">THE WORD</div>' +
          '<div class="n">' + esc(s.title || '') + '</div>' +
          (s.dek ? '<div class="d">' + esc(s.dek) + '</div>' : '') + '</div>';
        if (s.cover_url) a.querySelector('.im').style.backgroundImage =
          'url("' + s.cover_url.replace(/"/g, '%22') + '")';
        rw.appendChild(a);
      });
      ss.appendChild(rw);
      body.appendChild(ss);
    }

    /* their clips */
    if (data.videos.length) {
      var vs = d.createElement('section');
      vs.appendChild(h2('The Reel', data.videos.length + ' up'));
      var vr = d.createElement('div');
      vr.className = 'rows';
      data.videos.forEach(function (v) {
        var a = d.createElement('a');
        a.href = v.link || '#';
        a.target = '_blank'; a.rel = 'noopener';
        a.className = 'row2' + (v.cover ? '' : ' no-im');
        a.innerHTML = (v.cover ? '<span class="im"></span>' : '') +
          '<div class="tt"><div class="k">' + esc(v.provider || '') +
          (v.featured ? ' · featured' : '') + '</div>' +
          '<div class="n">' + esc(v.title || '') + '</div></div>';
        if (v.cover) a.querySelector('.im').style.backgroundImage =
          'url("' + String(v.cover).replace(/"/g, '%22') + '")';
        vr.appendChild(a);
      });
      vs.appendChild(vr);
      body.appendChild(vs);
    }

    var f = d.createElement('footer');
    f.className = 'back-foot';
    f.innerHTML = '<a href="' + BASE + '">&larr; 0FF THE PRINT</a>';
    page.appendChild(f);

    d.title = (c.display_name || c.card_slug) + ' · 0FF THE PRINT';
  }

  function fail(head, note, link) {
    d.getElementById('page').innerHTML =
      '<div class="pad"><div class="card" style="margin-top:26px">' +
      '<b style="font-family:var(--f-display);font-style:italic;font-size:24px;text-transform:uppercase">' +
      esc(head) + '</b><div class="note">' + esc(note) + '</div>' +
      '<div class="row" style="margin-top:14px"><a class="btn ghost sm" href="' + BASE + '">' +
      esc(link || 'Back to 0FF THE PRINT') + '</a></div></div></div>';
  }

  /* THE HOUSE ALREADY WROTE THESE PEOPLE. Every card holder has a lore
     paragraph, a flavor line and card art committed in roster.json or
     creators.json, rendering on the back of their card, while this page read the
     empty database columns and showed a grey "?" and nothing else. Five of seven
     pages were blank with the copy sitting right there.
     The member's own words still win. This is the floor, not the ceiling. */
  var houseCard = null;
  async function loadHouseCard() {
    var tight = function (v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    try {
      var pair = await Promise.all([
        fetch(BASE + 'content/roster.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
        fetch(BASE + 'content/creators.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
      ]);
      var all = (pair[1].items || []).concat(pair[0].items || []);
      houseCard = all.filter(function (x) { return tight(x.name) === tight(slug); })[0] || null;
    } catch (e) { houseCard = null; }
  }

  async function load() {
    data = await OTP.cardBack(slug);
    if (!data) {
      fail('No card by that name.',
           'Either nobody holds this slug, or the desk has not handed it out yet.');
      return;
    }
    // "Is this mine" is asked of the profile, not of the card row, so it is
    // still true for a member the desk has not approved yet: they can see and
    // write their own page while they are still at the door.
    mine = !!(me && me.profile && me.profile.card_slug === data.card.card_slug);
    paint();
  }

  async function boot() {
    slug = readSlug();
    if (!slug) {
      fail('Which card?', 'This page needs a card holder. Open it from a card, or add ?s=theirslug.');
      return;
    }
    if (!w.OTP || !OTP.configured) {
      fail('Backend not switched on yet.', 'supabase-config.js has not been filled in.');
      return;
    }
    try { me = await OTP.me(); } catch (e) { me = null; }
    admin = !!(me && me.profile && me.profile.is_admin);
    await loadHouseCard();
    try { await load(); }
    catch (e) {
      console.error(e);
      fail('That did not load.', e.message || String(e));
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window, document);
