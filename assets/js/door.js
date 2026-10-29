/* 0FF THE PRINT, the door. One OTP.me() call paints the nav key, the footer link,
   and the TAKE cta. Static markup already ships the signed-out state, so if this
   file never runs the page is still correct. ⛔ Keep index.html's static copy and
   S.out below saying the same thing: the static one is the first frame and what a
   link preview reads.
   Wave 2: it also says where What's coming goes (`cal`, every a[data-cal]: the Run
   on dates/ for a stranger, the Crypt's calendar for a member, call 6), shows who
   is signed in with Your account and Log out (call 7), and knows a closed account. */
(async () => {
  const S = {
    // 033: everybody on The Wall posts to the timeline now, not only card holders.
    // 035: the door is an Instagram (one account each, no member code). `st` names the state for
    // the stylesheet (cathedral.js copies it onto <html>), so a label can change without breaking it.
    // `cal` is where What's coming opens: the Run on dates/ until they are in the Crypt, its calendar after.
    out:  {st:'out', label:'Log in',  href:'join/?next=home', cal:'dates/', on:false,
           title:'Members and card holders log in here.',
           b:'Log in to post.',
           s:'Everybody in the Crypt posts to this timeline, reacts and comments. No login yet? Join the Crypt. All it takes is an Instagram.',
           foot:'Log in →'},
    // 035: who is still here? A login with no Instagram on it. Everybody who has one is let onto
    // The Wall below, so nobody is "in the queue" just to get in any more.
    wait: {st:'wait', label:'Almost in', href:'wall/', cal:'dates/', on:false,
           title:'One more step: your Instagram.',
           b:'One more step.',
           s:'Put your Instagram in at the Crypt and you can post, react and comment. One account per Instagram.',
           foot:'One more step →'},
    // 049: the door looks first. A new @ waits until the desk has looked at it (a no is never announced, so
    // somebody turned away reads the same). `st` stays 'wait' for the stylesheet; `at` tells the Roll apart.
    door: {st:'wait', at:'door', label:'At the door', href:'wall/', cal:'dates/', on:false,
           title:'Your Instagram is waiting to be looked at.',
           b:'You are at the door.',
           s:'Every Instagram gets looked at before the Crypt opens. Once you are in, you post, react and comment here.',
           foot:'At the door →'},
    // Wave 2 naming: /my/ is 'Your account' for every role (W1's 'Your desk' label is gone)
    in:   {st:'in', label:'Your account', href:'my/#account', cal:'wall/#cal', on:true,
           title:'Your account.',
           b:'Your account.',
           s:'Your card, your posts, your songs, what the desk still owes you an answer on. Posting is one tap from there.',
           foot:'Your account →'},
    wall: {st:'in', label:'Member', href:'wall/', cal:'wall/#cal', on:true,
           title:'Every flyer this week, one night at a time.',
           b:'Open the Crypt.',
           s:'Every flyer in SA, San Marcos and Austin, one night at a time. See who is going and vote the vibe. You can post up top, too.',
           foot:'Open the Crypt →'},
    // Wave 2: the board is the one control room (/desk/ only sends you there). The badge is everything waiting
    // on him, the same number the board's own strip adds up (desk_waiting).
    admin:{st:'in', label:'Desk',    href:'board/', cal:'wall/#cal', on:true,
           title:'Everything waiting on you.',
           b:'Open the desk.',
           s:'Card asks, packs, rooms, reports, the whole back room.',
           foot:'Open the desk →'},
    // A closed account (closed by them: wall_join says 'closed'; by the desk: 'shut'). Your account opens it again
    // or logs out. Never says who closed it.
    closed:{st:'wait', label:'Closed', href:'my/#account', cal:'dates/', on:false,
           title:'This account is closed.',
           b:'This account is closed.',
           s:'Open it again or log out from Your account.',
           foot:'Your account →'}
  };

  const key  = document.getElementById('nav-key');
  const foot = document.getElementById('footer-key');
  const cta  = document.getElementById('take-cta');
  // The Wall (the weekly flyer page) is a members link: approved card holders and the desk only.
  const wall = document.getElementById('nav-wall');
  // Wave 2 (call 7): who is signed in, on More and in the footer, with Your account and Log out
  const strip = document.getElementById('acct-strip');
  const facct = document.getElementById('footer-acct');
  const aname = document.getElementById('acct-name');
  const CALS = ['dates/', 'wall/#cal'];

  // Log out: the session and this phone's remembered door go (OTP.signOut clears otp_door), then the page
  // comes back as a stranger's. Wired once, whichever state painted first.
  ['acct-out', 'footer-out'].forEach(id => {
    const b = document.getElementById(id);
    if (!b || b.dataset.wired) return;
    b.dataset.wired = '1';
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { if (window.OTP && OTP.signOut) await OTP.signOut(); } catch(e){}
      try { localStorage.removeItem('otp_door'); } catch(e){}
      location.reload();
    });
  });

  function paint(s){
    if (!s) return;
    // a door saved before Wave 2 carries no cal: on is a member, off is not
    const cal = CALS.indexOf(s.cal) >= 0 ? s.cal : (s.on ? 'wall/#cal' : 'dates/');
    document.querySelectorAll('a[data-cal]').forEach(a => { a.href = cal; });
    const inside = s.st !== 'out';
    if (strip) strip.hidden = !inside;
    if (facct) facct.hidden = !inside;
    if (aname) aname.textContent = inside ? (String(s.name || '').trim() || 'you') : '';
    if (wall) wall.hidden = !s.on || s.crypt === false;
    if (key){
      key.href = s.href;
      key.title = s.title;
      key.textContent = s.label;           // also clears any old count chip
      key.classList.toggle('on', !!s.on);
      if (s.st) key.setAttribute('data-st', s.st);
      if (s.at) key.setAttribute('data-at', s.at); else key.removeAttribute('data-at');
      if (s.n > 0){
        const n = document.createElement('span');
        n.className = 'n'; n.textContent = s.n;
        key.appendChild(n);
      }
    }
    if (foot){ foot.href = s.href; foot.textContent = s.foot; }
    if (cta){
      cta.href = s.href;
      cta.removeAttribute('target'); cta.removeAttribute('rel');
      const b = cta.querySelector('b'), sp = cta.querySelector('span');
      if (b)  b.textContent  = s.b;
      if (sp) sp.textContent = s.s;
    }
  }

  // Repaint the last known state on the first frame so his nav says DESK on load
  // instead of flickering from LOG IN ten times a day.
  try { const c = localStorage.getItem('otp_door'); if (c) paint(JSON.parse(c)); } catch(e){}

  if (!window.OTP || !OTP.configured) return;

  let s = S.out, keep = true, name = '';
  try {
    const me = await OTP.me();
    name = (me && me.profile && me.profile.display_name) || '';
    // my_profile would not answer (desk.js asked twice): the login is real, WHO it is is not known. Painting
    // on would turn a card holder or the desk into a plain member for this load and save that over the right
    // answer, so the state this phone last knew stays (already painted above). With none, paint the best guess
    // below and do not keep it.
    if (me && me.failed) {
      let had = null; try { had = JSON.parse(localStorage.getItem('otp_door') || 'null'); } catch(e){}
      if (had && had.st && had.st !== 'out') return;   // a signed-in state; a saved 'Log in' is plainly wrong now
      keep = false;
    }
    if (me && me.profile && me.profile.is_admin) {
      s = Object.assign({}, S.admin);
      // deskWaiting never throws (zeros on any trouble), so a slow answer is a quiet badge, never a broken key
      try { s.n = ((await OTP.deskWaiting()) || {}).total || 0; } catch(e){}
    } else if (me && me.profile && me.profile.approved) {
      s = S.in;
      // 032 kept a Crypt-banned card holder here. Since 044 a ban or a close is a gate: my_profile reports
      // approved false for them, so they read as not approved and land on the quiet 'Almost in' like any banned
      // login. This stays for an approved login the Crypt still refuses: the key stays 'Your account', and the
      // CRYPT link, which would only open on a door that refuses them, goes. Only a plain false hides it: a
      // failed ask leaves it where it was.
      try {
        const r = await OTP.sb().rpc('is_wall_member');
        if (r && !r.error && r.data === false) s = Object.assign({}, S.in, {crypt: false});
      } catch(e){}
    } else if (me) {
      // 023: a refused member lands here too, and that is deliberate. The no is
      // the desk's filter, not a notice. Same nav, same copy, same everything
      // they saw yesterday.
      s = S.wait;
      // 029: a casual member gets The Wall, not the queue
      try {
        const r = await OTP.sb().rpc('is_wall_member');
        if (r && r.data === true) s = S.wall;
        else {
          // 035: a login that already carries an Instagram (it knocked on /join/ before 10/4, say)
          // is let onto The Wall here, quietly. One with none gets 'need' and stays "Almost in".
          // A banned login is refused by the database, and a database without 035 has no such door.
          const j = await OTP.sb().rpc('wall_join', {p_ig: null});
          if (j && !j.error && j.data === 'in') s = S.wall;
          // 049: waiting for the desk to look at their @
          else if (j && !j.error && j.data === 'wait') s = S.door;
          // Wave 2 (044): a closed account. 'closed' they can open again, 'shut' the desk closed; one lock for both.
          else if (j && !j.error && (j.data === 'closed' || j.data === 'shut')) s = S.closed;
        }
      } catch(e){}
    }
  } catch(e) { s = S.out; }

  // the name rides along so the first frame next time says who is signed in (signOut clears it with the rest)
  if (s !== S.out) s = Object.assign({}, s, {name: String(name).slice(0, 40)});
  paint(s);
  if (keep) try { localStorage.setItem('otp_door', JSON.stringify(s)); } catch(e){}
})();
