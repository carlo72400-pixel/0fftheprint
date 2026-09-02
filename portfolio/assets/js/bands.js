(function(){
  var PAGES=[['about','01','INFO','the studio'],['stills','02','PHOTO MODE','frames from the floor'],
    ['nights','03','NIGHTS','venue + event'],['archive','04','ARCHIVE','client work'],
    ['design','05','DESIGN','posters, collage, sites'],['playback','06','PLAYBACK','the film'],
    ['feed','07','FEED','on the grid'],['rates','08','RATES','the rate card'],
    ['contact','09','STANDBY','let us cut something']];
  PAGES.forEach(function(pg){
    var sec=document.getElementById(pg[0]); if(!sec) return;
    var b=document.createElement('div'); b.className='pagebreak'; b.setAttribute('data-page',pg[0]); b.setAttribute('aria-hidden','true');
    b.innerHTML='<span class="pb-no">REEL '+pg[1]+' / 09</span><span class="pb-name">'+pg[2]+'</span><span class="pb-desc">'+pg[3]+'</span>';
    sec.parentNode.insertBefore(b, sec);
  });
  function scroller(){ return document.scrollingElement || document.documentElement; }
  function goTo(top){
    var el=scroller(), max=el.scrollHeight-el.clientHeight;
    top=Math.max(0,Math.min(top,max));
    // scrollTo can be a no-op in some engines; verify and hard-set as a fallback.
    try{ el.scrollTo({top:top,behavior:'smooth'}); }catch(err){ el.scrollTop=top; }
    setTimeout(function(){ if(Math.abs(el.scrollTop-top)>4) el.scrollTop=top; }, 700);
  }
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var id=a.getAttribute('href').slice(1);
      if(!id || id==='top'){ e.preventDefault(); goTo(0); history.replaceState(null,'',location.pathname+location.search); return; }
      var band=document.querySelector('.pagebreak[data-page="'+id+'"]');
      var tgt=band||document.getElementById(id);
      if(tgt){
        e.preventDefault();
        goTo(tgt.getBoundingClientRect().top + scroller().scrollTop - 58);
        history.replaceState(null,'','#'+id);
      }
    });
  });
  // honour a #hash the visitor arrives with, once layout has settled
  if(location.hash.length>1){
    window.addEventListener('load', function(){
      var id=location.hash.slice(1);
      var t=document.querySelector('.pagebreak[data-page="'+id+'"]')||document.getElementById(id);
      if(t) setTimeout(function(){ goTo(t.getBoundingClientRect().top + scroller().scrollTop - 58); }, 120);
    });
  }
  var tb=document.getElementById('toTop');
  if(tb){
    var onScroll=function(){ tb.classList.toggle('show', window.scrollY > window.innerHeight*0.85); };
    window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
    tb.addEventListener('click', function(){ window.scrollTo({top:0,behavior:'smooth'}); });
  }
})();
