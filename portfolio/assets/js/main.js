/* ---- testing hook: ?proof = fully revealed first paint ---- */
if(location.search.indexOf('proof')>-1) document.documentElement.classList.add('proof');

/* ---- bouncy name (word-safe) ---- */
(function(){
  const h = document.getElementById('heroName');
  const words = h.textContent.split(' '); h.textContent='';
  words.forEach((word,wi)=>{
    if(wi>0){const s=document.createElement('span');s.className='sp';h.appendChild(s);}
    const w=document.createElement('span');w.style.whiteSpace='nowrap';w.style.display='inline-block';
    [...word].forEach(ch=>{const s=document.createElement('span');s.className='l';s.textContent=ch;w.appendChild(s);});
    h.appendChild(w);
  });
})();

/* ---- running timecode (24fps) ---- */
(function(){
  const el = document.getElementById('timecode');
  let f=0;
  setInterval(()=>{
    if(document.hidden) return;
    f++;
    if(window.__shuttle){ f+=Math.min(96,Math.round(window.__shuttle/6)); window.__shuttle=0; }
    const fr=f%24, s=Math.floor(f/24)%60, m=Math.floor(f/1440)%60, hh=Math.floor(f/86400);
    const p=n=>String(n).padStart(2,'0');
    el.innerHTML='<b>'+p(hh)+':'+p(m)+':'+p(s)+':'+p(fr)+'</b>';
  },1000/24);
})();

/* ---- amber date stamp ---- */
(function(){
  const d=new Date();
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  document.getElementById('datestamp').textContent = months[d.getMonth()]+' '+String(d.getDate()).padStart(2,'0')+' '+d.getFullYear();
})();

/* ---- grade A/B slider ---- */
(function(){
  const ab=document.getElementById('abwrap');
  if(!ab) return;
  let cut=50;
  const apply=()=>{ab.style.setProperty('--cut',cut+'%');ab.setAttribute('aria-valuenow',Math.round(cut));};
  const fromX=x=>{const r=ab.getBoundingClientRect();cut=Math.max(2,Math.min(98,(x-r.left)/r.width*100));apply();};
  ab.addEventListener('pointerdown',e=>{ab.setPointerCapture(e.pointerId);fromX(e.clientX);});
  ab.addEventListener('pointermove',e=>{if(e.buttons)fromX(e.clientX);});
  ab.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'){cut=Math.max(2,cut-4);apply();e.preventDefault();}
    if(e.key==='ArrowRight'){cut=Math.min(98,cut+4);apply();e.preventDefault();}
  });
  apply();
})();

/* ---- picture profiles: resize = regrade (tap chip to cycle) ---- */
const LOOKS = [
  ['night-city','NIGHT CITY'],
  ['editorial-dream','EDITORIAL DREAM'],
  ['darkroom','DARKROOM'],
  ['chrome','CHROME'],
  ['sleaze','SLEAZE'],
  ['super8','SUPER 8']
];
const chip = document.getElementById('lookChip');
const nameEl = document.getElementById('lookName');
const hintEl = document.getElementById('lookHint');
const idxEl = document.getElementById('lookIdx');
const dots = [...document.querySelectorAll('#lookDots i')];
let manual = -1;
function bandFromWidth(w){
  if(w>=1500) return 0;
  if(w>=1250) return 1;
  if(w>=1000) return 2;
  if(w>=800)  return 3;
  if(w>=600)  return 4;
  return 5;
}
function applyLook(i,src){
  document.body.dataset.look = LOOKS[i][0];
  nameEl.textContent = LOOKS[i][1];
  idxEl.textContent = i+1;
  dots.forEach((d,n)=>d.classList.toggle('on', n===i));
  chip.setAttribute('aria-label','Picture profile '+(i+1)+' of '+LOOKS.length+': '+LOOKS[i][1]+'. Tap to cycle the grade.');
  hintEl.textContent = src==='chip' ? 'tap to cycle' : (matchMedia('(pointer:coarse)').matches ? 'tap to cycle' : 'resize me');
}
applyLook(bandFromWidth(innerWidth));
if(matchMedia('(pointer:coarse)').matches){ const hp=document.getElementById('ppHint'); if(hp) hp.innerHTML='psst. <b>tap the PP chip</b> below and the picture profile regrades.'; }
addEventListener('resize',()=>{ if(manual<0) applyLook(bandFromWidth(innerWidth)); });
chip.addEventListener('click',()=>{
  manual = manual<0 ? (bandFromWidth(innerWidth)+1)%LOOKS.length : (manual+1)%LOOKS.length;
  applyLook(manual,'chip');
});

/* ---- marquee seamless loop ---- */
document.querySelectorAll('.mq-track').forEach(t=>{ t.innerHTML += t.innerHTML; });

/* ---- photo mode gallery ---- */
/* 01_globe-wide.jpg is NOT in this list on purpose: it is the same frame as the full-bleed
   hero (assets/hero.jpg), so showing it here read as the page repeating itself. Same reason
   04_moon-dome.jpg is out, it was the same moon beat as 03 seconds later. */
const stills = [
  ["02_red-dome.jpg","Red dome","EDITORIAL SLUDGE"],
  ["03_beam-dome.jpg","Beam dome","EDITORIAL SLUDGE"],
  ["05_at-the-mic.jpg","At the mic","EDITORIAL SLUDGE"],
  ["06_pov-armup.jpg","From the pit","EDITORIAL SLUDGE"],
  ["07_red-crowd.jpg","Red crowd","SLEAZE"],
  ["08_negative-space.jpg","Negative space","AVANT EDITORIAL"],
  ["09_lone-profile.jpg","Lone profile","AVANT EDITORIAL"],
  ["10_molten-dome.jpg","Molten dome","NIGHT CITY"],
  ["11_beam-ring.jpg","Beam ring","EDITORIAL SLUDGE"],
  ["12_finale.jpg","Finale","NIGHT CITY"]
];
const g = document.getElementById('gallery');
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lightbox-img');
stills.forEach(([f,alt,look],i)=>{
  const a=document.createElement('a');a.href='assets/stills/'+f;
  const img=document.createElement('img');img.src='assets/stills/'+f;img.alt=alt;img.loading='lazy';
  const af=document.createElement('div');af.className='af';af.innerHTML='<i></i><i></i><i></i><i></i>';
  const tag=document.createElement('div');tag.className='tag';
  tag.innerHTML='FR_'+String(i+1).padStart(2,'0')+' · '+alt.toUpperCase()+' · <b>'+look+'</b>';
  a.append(img,af,tag);
  a.addEventListener('click',e=>{e.preventDefault();lbImg.src=a.href;lb.showModal();});
  g.appendChild(a);
});
lb.addEventListener('click',()=>lb.close());
document.querySelectorAll('.sacp').forEach(a=>{
  a.addEventListener('click',e=>{e.preventDefault();lbImg.src=a.href;lb.showModal();});
});

/* ---- monitor slideshows ---- */
document.querySelectorAll('.m-view[data-slides]').forEach(v=>{
  const pre=v.dataset.slides, n=+v.dataset.n, imgs=[];
  const count=document.createElement('div');count.className='m-count';
  for(let i=1;i<=n;i++){
    const im=document.createElement('img');im.src='assets/feed/'+pre+'_'+String(i).padStart(2,'0')+'.jpg';
    im.alt='';im.loading='lazy';v.appendChild(im);imgs.push(im);
  }
  v.appendChild(count);
  let cur=0;imgs[0].classList.add('on');count.textContent='01 / '+String(n).padStart(2,'0');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setInterval(()=>{
    if(document.hidden) return;
    imgs[cur].classList.remove('on');
    cur=(cur+1)%n;
    imgs[cur].classList.add('on');
    count.textContent=String(cur+1).padStart(2,'0')+' / '+String(n).padStart(2,'0');
  },2600);
});

/* ---- silent tapes play themselves in view, staggered ----
   #archive shows EIGHT tapes at once. Firing them together opened eight video
   requests in the same instant, which is what made that section crawl, so starts
   are queued 220ms apart instead. preload="none" plus a poster means an off-screen
   tape costs nothing and an on-screen one shows a frame before any video arrives.
   .tape.play is EXCLUDED on purpose: those carry real audio and native controls,
   so the viewer starts and stops them. Autoplaying them would blast sound, and
   pausing them off-screen would stop a clip somebody is deliberately watching. */
const vioReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const vioSave = !!(navigator.connection && navigator.connection.saveData);
const tapeQ=[]; let tapePump=null;
function pumpTapes(){
  if(tapePump) return;
  tapePump=setInterval(()=>{
    const v=tapeQ.shift();
    if(!v){clearInterval(tapePump);tapePump=null;return;}
    if(v.isConnected && v.dataset.want==='1') v.play().catch(()=>{});
  },220);
}
const vio = new IntersectionObserver(es=>es.forEach(e=>{
  const v=e.target;
  if(e.isIntersecting && !vioReduce && !vioSave){
    v.dataset.want='1';
    if(tapeQ.indexOf(v)<0) tapeQ.push(v);
    pumpTapes();
  } else { v.dataset.want='0'; v.pause(); }
}),{threshold:.25});
document.querySelectorAll('.tape:not(.play) video, .mon-vid').forEach(v=>vio.observe(v));

/* ---- scroll reveal ---- */
const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);} }),{threshold:0,rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));

/* ---- magnetic email ---- */
(function(){
  const m = document.getElementById('magnetMail');
  if(matchMedia('(pointer:coarse)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  addEventListener('mousemove',e=>{
    const r = m.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const dx=e.clientX-cx, dy=e.clientY-cy;
    const d=Math.hypot(dx,dy);
    if(d<220){ const p=(220-d)/220; m.style.transform=`translate(${dx*p*.18}px,${dy*p*.18}px)`; }
    else m.style.transform='';
  });
})();

/* ---- kinetic layer ---- */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer:coarse)').matches;

/* stagger reveals: children cascade when their .rv wrap comes in */
document.querySelectorAll('.rate-grid,#gallery,.tapes,.monitors,.social-row,.sac-photos,.credits').forEach(el=>{
  el.classList.add('stag');
  [...el.children].forEach((c,i)=>c.style.setProperty('--d',Math.min(i*55,440)+'ms'));
});

/* AF-target cursor: brackets follow the mouse, expand + lock onto anything interactive */
(function(){
  if(COARSE || REDUCED) return;
  const af=document.getElementById('af-cursor');
  const SEL='a,button,.rate,.tape,.mon,#abwrap,input,summary';
  let tx=innerWidth/2,ty=innerHeight/2,tw=26,th=26, x=tx,y=ty,w=tw,h=th, seen=false;
  addEventListener('mousemove',e=>{
    seen=true; if(!window.__afLoop){window.__afLoop=true;requestAnimationFrame(window.__afTick);} af.style.opacity=1;
    const el=e.target.closest(SEL);
    if(el && !el.closest('nav ul')){
      const r=el.getBoundingClientRect();
      if(r.width<innerWidth*.8 && r.height<innerHeight*.7){
        tx=r.left-7; ty=r.top-7; tw=r.width+14; th=r.height+14; af.classList.add('lock');
      } else { tx=e.clientX-13; ty=e.clientY-13; tw=26; th=26; af.classList.remove('lock'); }
    } else {
      tx=e.clientX-13; ty=e.clientY-13; tw=26; th=26; af.classList.remove('lock');
    }
  },{passive:true});
  document.documentElement.addEventListener('mouseleave',()=>{af.style.opacity=0;});
  window.__afTick=function(){
    x+=(tx-x)*.22; y+=(ty-y)*.22; w+=(tw-w)*.22; h+=(th-h)*.22;
    af.style.transform=`translate(${x}px,${y}px)`;
    af.style.width=w+'px'; af.style.height=h+'px';
    requestAnimationFrame(window.__afTick);
  };
})();

/* scroll progress strip + timecode shuttle */
(function(){
  const bar=document.getElementById('scrollbar');
  let lastY=scrollY, ticking=false;
  addEventListener('scroll',()=>{
    window.__shuttle=(window.__shuttle||0)+Math.abs(scrollY-lastY); lastY=scrollY;
    if(ticking) return; ticking=true;
    requestAnimationFrame(()=>{
      const max=document.documentElement.scrollHeight-innerHeight;
      bar.style.width=(max>0?scrollY/max*100:0)+'%';
      ticking=false;
    });
  },{passive:true});
})();

/* nav follows the section you're in */
(function(){
  const links=[...document.querySelectorAll('nav ul a')];
  const map={};
  links.forEach(a=>map[a.getAttribute('href').slice(1)]=a);
  const so=new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting){links.forEach(a=>a.classList.remove('cur'));(map[e.target.id]||{classList:{add(){}}}).classList.add('cur');}
  }),{rootMargin:'-38% 0px -55% 0px'});
  ['about','stills','nights','archive','design','playback','feed','rates','contact'].forEach(id=>{const s=document.getElementById(id);if(s)so.observe(s);});
})();

/* rate cards: price odometer + tilt */
(function(){
  const cards=document.querySelectorAll('.rate');
  if(!REDUCED){
    const po=new IntersectionObserver(es=>es.forEach(e=>{
      if(!e.isIntersecting) return; po.unobserve(e.target);
      const pr=e.target.querySelector('.pr'); if(!pr) return;
      const txt=pr.firstChild.textContent, n=parseInt(txt.replace(/[^0-9]/g,''),10);
      if(!n) return;
      const t0=performance.now(), dur=750;
      (function tick(t){
        const p=Math.min(1,(t-t0)/dur), ease=1-Math.pow(1-p,3);
        pr.firstChild.textContent='$'+Math.round(n*ease).toLocaleString();
        if(p<1) requestAnimationFrame(tick); else pr.firstChild.textContent=txt;
      })(t0);
    }),{threshold:.4});
    cards.forEach(c=>po.observe(c));
  }
  if(COARSE || REDUCED) return;
  cards.forEach(c=>{
    c.addEventListener('pointerenter',()=>{c.style.transition='transform .12s ease-out';});
    c.addEventListener('pointermove',e=>{
      const r=c.getBoundingClientRect();
      const px=(e.clientX-r.left)/r.width-.5, py=(e.clientY-r.top)/r.height-.5;
      c.style.transform=`perspective(700px) translateY(-4px) rotateX(${-py*4}deg) rotateY(${px*4}deg)`;
    });
    c.addEventListener('pointerleave',()=>{c.style.transition='';c.style.transform='';});
  });
})();
