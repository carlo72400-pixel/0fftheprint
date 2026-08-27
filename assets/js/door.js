/* 0FF THE PRINT, the door. One OTP.me() call paints the nav key, the footer link,
   and the TAKE cta. Static markup already ships the signed-out state, so if this
   file never runs the page is still correct. */
(async () => {
  const S = {
    out:  {label:'Log in',  href:'join/',    on:false,
           title:'Card holders log in here.',
           b:'Got a card? Log in.',
           s:'Card holders post straight to the timeline. The desk hands out the cards in person, and the DMs are always open.',
           foot:'Card holders: log in →'},
    wait: {label:'Pending', href:'join/',    on:false,
           title:"You're in the queue. The desk approves by hand.",
           b:"You're in the queue.",
           s:"The desk approves by hand. Nobody's ignoring you, it just moves when it moves.",
           foot:"You're in the queue →"},
    // 023. A refused person used to read "you're in the queue" forever, on
    // eight surfaces, which is a promise the desk had already decided not to
    // keep. No reason is given and no appeal is offered: /seats/ says "that is
    // a fair answer and there is no follow up", and this is the same answer
    // pointed the other way.
    refused:{label:'Log in', href:'join/', on:false,
           title:'The desk has looked at this one.',
           b:'This one is not going forward.',
           s:'The desk looked and said no. Nothing else is coming, and there is no queue to wait in.',
           foot:'Log in →'},
    in:   {label:'Your desk', href:'my/', on:true,
           title:'Your side of the desk.',
           b:'Your desk.',
           s:'Your card, your posts, your songs, what the desk still owes you an answer on. Posting is one tap from there.',
           foot:'Your side of the desk →'},
    admin:{label:'Desk',    href:'desk/',    on:true,
           title:'Approvals and pulls.',
           b:'Open the desk.',
           s:'Approvals, pulls, the whole back room.',
           foot:'Open the desk →'}
  };

  const key  = document.getElementById('nav-key');
  const foot = document.getElementById('footer-key');
  const cta  = document.getElementById('take-cta');

  function paint(s){
    if (!s) return;
    if (key){
      key.href = s.href;
      key.title = s.title;
      key.textContent = s.label;           // also clears any old count chip
      key.classList.toggle('on', !!s.on);
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
    } else if (me && me.profile && me.profile.denied) {
      s = S.refused;
    } else if (me) {
      s = S.wait;
    }
  } catch(e) { s = S.out; }

  paint(s);
  try { localStorage.setItem('otp_door', JSON.stringify(s)); } catch(e){}
})();
