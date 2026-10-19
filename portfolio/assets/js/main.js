/* main.js, rebuilt 2026-10-18 for the two-door portfolio + its sub-pages (nights, archive, rates).
   Every block checks its element exists first, so one file runs on all four pages.
   Dropped with the rebuild: running timecode, date stamp, picture-profile chip, AF cursor,
   scroll strip, magnetic email, monitor slideshows (the FEED section is gone). */

/* ---- testing hook: ?proof = fully revealed first paint ---- */
if(location.search.indexOf('proof')>-1) document.documentElement.classList.add('proof');

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer:coarse)').matches;
const SAVEDATA = !!(navigator.connection && navigator.connection.saveData);

/* ---- bouncy name (word-safe) ---- */
(function(){
  const h = document.getElementById('heroName');
  if(!h) return;
  const words = h.textContent.split(' '); h.textContent='';
  words.forEach((word,wi)=>{
    if(wi>0){const s=document.createElement('span');s.className='sp';h.appendChild(s);}
    const w=document.createElement('span');w.style.whiteSpace='nowrap';w.style.display='inline-block';
    [...word].forEach(ch=>{const s=document.createElement('span');s.className='l';s.textContent=ch;w.appendChild(s);});
    h.appendChild(w);
  });
})();

/* ---- the newest film: a small muted preview plays itself, one tap swaps in the full file with sound ----
   The preview is the same cut re-encoded small and silent (allyourn_preview.mp4), so the first
   screen does not pull the 13 MB film. Reduced motion or data saver = poster only, button still works. */
(function(){
  const v = document.getElementById('heroFilm'), b = document.getElementById('heroSound');
  if(!v) return;
  if(!REDUCED && !SAVEDATA){ v.muted = true; v.play().catch(()=>{}); }
  if(!b) return;
  b.addEventListener('click',()=>{
    v.pause();
    if(v.dataset.full){ v.src = v.dataset.full; }
    v.muted = false; v.loop = false; v.controls = true;
    v.setAttribute('aria-label', v.getAttribute('aria-label').replace('playing muted','with sound'));
    v.load(); v.play().catch(()=>{});
    b.hidden = true;
  });
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

/* ---- marquee seamless loop ---- */
document.querySelectorAll('.mq-track').forEach(t=>{ t.innerHTML += t.innerHTML; });

/* ---- lightbox ---- */
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lightbox-img');
if(lb){
  lb.addEventListener('click',()=>lb.close());
  document.querySelectorAll('.sacp').forEach(a=>{
    a.addEventListener('click',e=>{e.preventDefault();lbImg.src=a.href;lb.showModal();});
  });
}

/* ---- photo mode gallery (archive page) ----
   01_globe-wide.jpg and 04_moon-dome.jpg stay out: 01 was the old full-bleed hero, 04 is the
   same moon beat as 03 seconds later (Jul 30 repeat audit). */
(function(){
  const g = document.getElementById('gallery');
  if(!g || !lb) return;
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
  stills.forEach(([f,alt,look],i)=>{
    const a=document.createElement('a');a.href='assets/stills/'+f;
    const img=document.createElement('img');img.src='assets/stills/'+f;img.alt=alt;img.loading='lazy';
    const af=document.createElement('div');af.className='af';af.innerHTML='<i></i><i></i><i></i><i></i>';
    const tag=document.createElement('div');tag.className='tag';
    tag.innerHTML='FR_'+String(i+1).padStart(2,'0')+' · '+alt.toUpperCase()+' · <b>'+look+'</b>';
    a.append(img,af,tag);
    a.addEventListener('click',e=>{e.preventDefault();lbImg.src=a.href;lbImg.alt=alt+' (full size)';lb.showModal();});
    g.appendChild(a);
  });
})();

/* ---- silent tapes play themselves in view, staggered ----
   Starts are queued 220ms apart (eight at once made the archive crawl). preload="none" plus a
   poster means an off-screen tape costs nothing. .tape.play is EXCLUDED: those carry real audio
   and native controls, so the viewer starts and stops them. */
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
  if(e.isIntersecting && !REDUCED && !SAVEDATA){
    v.dataset.want='1';
    if(tapeQ.indexOf(v)<0) tapeQ.push(v);
    pumpTapes();
  } else { v.dataset.want='0'; v.pause(); }
}),{threshold:.25});
document.querySelectorAll('.tape:not(.play) video').forEach(v=>vio.observe(v));

/* ---- scroll reveal ---- */
const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);} }),{threshold:0,rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));

/* stagger reveals: children cascade when their .rv wrap comes in */
document.querySelectorAll('.rate-grid,#gallery,.tapes,.sac-photos,.credits,.steps').forEach(el=>{
  el.classList.add('stag');
  [...el.children].forEach((c,i)=>c.style.setProperty('--d',Math.min(i*55,440)+'ms'));
});

/* ---- nav follows the section you're in ---- */
(function(){
  const links=[...document.querySelectorAll('nav ul a')].filter(a=>(a.getAttribute('href')||'').charAt(0)==='#');
  if(!links.length) return;
  const map={};
  links.forEach(a=>map[a.getAttribute('href').slice(1)]=a);
  const so=new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting){links.forEach(a=>a.classList.remove('cur'));if(map[e.target.id]) map[e.target.id].classList.add('cur');}
  }),{rootMargin:'-38% 0px -55% 0px'});
  Object.keys(map).forEach(id=>{const s=document.getElementById(id);if(s)so.observe(s);});
})();

/* ---- rate cards: price odometer + tilt ---- */
(function(){
  const cards=document.querySelectorAll('.rate');
  if(!cards.length) return;
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
