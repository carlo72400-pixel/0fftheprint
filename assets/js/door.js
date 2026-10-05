/* 0FF THE PRINT, the door. One OTP.me() call paints the nav key, the footer link,
   and the TAKE cta. Static markup already ships the signed-out state, so if this
   file never runs the page is still correct. ⛔ Keep index.html's static copy and
   S.out below saying the same thing: the static one is the first frame and what a
   link preview reads. */
(async () => {
  const S = {
    // 033: everybody on The Wall posts to the timeline now, not only card holders.
    // 035: the door is an Instagram (one account each, no member code). `st` names the state for
    // the stylesheet (cathedral.js copies it onto <html>), so a label can change without breaking it.
    out:  {st:'out', label:'Log in',  href:'join/?next=home', on:false,
           title:'Members and card holders log in here.',
           b:'Log in to post.',
           s:'Everybody on The Wall posts to this timeline, reacts and comments. No login yet? Join The Wall. All it takes is an Instagram.',
           foot:'Log in →'},
    // 035: who is still here? A login with no Instagram on it. Everybody who has one is let onto
    // The Wall below, so nobody is "in the queue" just to get in any more.
    wait: {st:'wait', label:'Almost in', href:'wall/',    on:false,
           title:'One more step: your Instagram.',
           b:'One more step.',
           s:'Put your Instagram in on The Wall and you can post, react and comment. One account per Instagram.',
           foot:'One more step →'},
    in:   {st:'in', label:'Your desk', href:'my/', on:true,
           title:'Your side of the desk.',
           b:'Your desk.',
           s:'Your card, your posts, your songs, what the desk still owes you an answer on. Posting is one tap from there.',
           foot:'Your side of the desk →'},
    wall: {st:'in', label:'Member', href:'wall/', on:true,
           title:'Every flyer this week, one night at a time.',
           b:'Open The Wall.',
           s:'Every flyer in SA, San Marcos and Austin, one night at a time. See who is going and vote the vibe. You can post up top, too.',
           foot:'Open The Wall →'},
    admin:{st:'in', label:'Desk',    href:'desk/',    on:true,
           title:'Approvals and pulls.',
           b:'Open the desk.',
           s:'Approvals, pulls, the whole back room.',
           foot:'Open the desk →'}
  };

  const key  = document.getElementById('nav-key');
  const foot = document.getElementById('footer-key');
  const cta  = document.getElementById('take-cta');
  // The Wall (the weekly flyer page) is a members link: approved card holders and the desk only.
  const wall = document.getElementById('nav-wall');

  function paint(s){
    if (!s) return;
    if (wall) wall.hidden = !s.on;
    if (key){
      key.href = s.href;
      key.title = s.title;
      key.textContent = s.label;           // also clears any old count chip
      key.classList.toggle('on', !!s.on);
      if (s.st) key.setAttribute('data-st', s.st);
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

  let s = S.out;
  try {
    const me = await OTP.me();
    if (me && me.profile && me.profile.is_admin) {
      s = Object.assign({}, S.admin);
      try { s.n = (await OTP.pending()).length || 0; } catch(e){}
    } else if (me && me.profile && me.profile.approved) {
      s = S.in;
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
        }
      } catch(e){}
    }
  } catch(e) { s = S.out; }

  paint(s);
  try { localStorage.setItem('otp_door', JSON.stringify(s)); } catch(e){}
})();
