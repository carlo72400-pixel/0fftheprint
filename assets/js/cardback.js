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

  var LINK_BASE = {
    instagram: 'https://instagram.com/',
    tiktok: 'https://www.tiktok.com/@',
    youtube: 'https://www.youtube.com/@',
    spotify: 'https://open.spotify.com/artist/',
    soundcloud: 'https://soundcloud.com/',
    bandcamp: 'https://bandcamp.com/'
  };
  // ⛔ The base is hardcoded and the handle is a bare word. The database will
  // not hold a host (007's CHECK pins link_platform to a known list and the
  // handle to [A-Za-z0-9._-]), so no member-supplied scheme can reach an href.
  function outLink(p, h) {
    if (!p || !h || !LINK_BASE[p]) return null;
    return { url: LINK_BASE[p] + encodeURIComponent(h), label: '@' + h, plat: p };
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

  /* ---------- paint ---------- */
  function paint() {
    var page = d.getElementById('page');
    var c = data.card;
    page.innerHTML = '';

    if (c.accent) d.body.className = 'acc-' + c.accent;

    /* header */
    var hero = d.createElement('header');
    hero.className = 'hero';
    var photo = c.card_photo || '';
    hero.innerHTML =
      '<div class="wall"></div>' +
      '<div class="in">' +
        '<div class="shot' + (photo ? '' : ' bare') + '">' + (photo ? '' : esc((c.display_name || '?').charAt(0))) + '</div>' +
        '<div class="nameblock">' +
          '<h1>' + esc(c.display_name || c.card_slug) + '</h1>' +
          '<div class="tag' + (c.tagline ? '' : ' none') + '">' +
            esc(c.tagline || (mine ? 'no tagline yet. tap edit and say who you are.' : '')) + '</div>' +
          '<div class="meta"></div>' +
        '</div>' +
      '</div>';
    if (photo) {
      hero.querySelector('.wall').style.backgroundImage = 'url("' + photo.replace(/"/g, '%22') + '")';
      hero.querySelector('.shot').style.backgroundImage = 'url("' + photo.replace(/"/g, '%22') + '")';
    }
    var meta = hero.querySelector('.meta');
    var chip = function (txt, href, hot) {
      var el = d.createElement(href ? 'a' : 'span');
      el.className = 'chip' + (hot ? ' hot' : '');
      if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; }
      el.textContent = txt;
      meta.appendChild(el);
    };
    chip('CARD HOLDER');
    if (c.card_frame) chip(String(c.card_frame).replace(/-/g, ' '));
    var out = outLink(c.link_platform, c.link_handle);
    if (out) chip(out.label + ' on ' + out.plat, out.url, true);
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
          '<a class="btn ghost sm" href="../card/">Your card</a>' +
          '<a class="btn ghost sm" href="../compose/">Post something</a>' +
          '<a class="btn ghost sm" href="../my/">Your desk</a>' +
        '</div>';
      body.appendChild(y);
      y.querySelector('#y-words').onclick = wordsSheet;
    }

    /* the bio */
    var bs = d.createElement('section');
    bs.appendChild(h2('The Words', 'in their own', true));
    var bio = d.createElement('div');
    bio.className = 'bio' + (c.bio ? '' : ' none');
    bio.textContent = c.bio || (mine ? 'Nothing written yet. Tap edit.' : 'No bio yet.');
    bs.appendChild(bio);
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
        a.href = s.baked ? '../word/' + encodeURIComponent(s.slug) + '/'
                         : '../word/live/?s=' + encodeURIComponent(s.slug);
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
    f.innerHTML = '<a href="../">&larr; 0FF THE PRINT</a>';
    page.appendChild(f);

    d.title = (c.display_name || c.card_slug) + ' · 0FF THE PRINT';
  }

  function fail(head, note, link) {
    d.getElementById('page').innerHTML =
      '<div class="pad"><div class="card" style="margin-top:26px">' +
      '<b style="font-family:var(--f-display);font-style:italic;font-size:24px;text-transform:uppercase">' +
      esc(head) + '</b><div class="note">' + esc(note) + '</div>' +
      '<div class="row" style="margin-top:14px"><a class="btn ghost sm" href="../">' +
      esc(link || 'Back to 0FF THE PRINT') + '</a></div></div></div>';
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
    try { await load(); }
    catch (e) {
      console.error(e);
      fail('That did not load.', e.message || String(e));
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window, document);
