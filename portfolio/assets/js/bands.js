(function(){
  /* page-break bands: any section carrying data-band="NAME|descriptor" gets the dark film-slate
     divider in front of it, numbered in page order (REEL 01 / 04 ...). Sub-pages carry none. */
  var secs=[].slice.call(document.querySelectorAll('[data-band]')), n=secs.length;
  function two(x){ return (x<10?'0':'')+x; }
  secs.forEach(function(sec,i){
    var p=sec.getAttribute('data-band').split('|');
    var b=document.createElement('div'); b.className='pagebreak'; b.setAttribute('data-page',sec.id); b.setAttribute('aria-hidden','true');
    b.innerHTML='<span class="pb-no">REEL '+two(i+1)+' / '+two(n)+'</span><span class="pb-name">'+p[0]+'</span><span class="pb-desc">'+(p[1]||'')+'</span>';
    sec.parentNode.insertBefore(b, sec);
  });
  /* deep links from before the 2026-10-18 rebuild still land somewhere real */
  var OLD={about:'#hire',stills:'archive/#stills',archive:'archive/',design:'archive/#design',playback:'archive/#bts',feed:'#contact',standby:'#contact'};
  var h0=location.hash.slice(1);
  if(h0 && !document.getElementById(h0) && OLD[h0]){
    var t=OLD[h0];
    if(t.charAt(0)!=='#'){ location.replace(new URL(t, document.baseURI).href); return; }
    history.replaceState(null,'',location.pathname+location.search+t);
  }
  function scroller(){ return document.scrollingElement || document.documentElement; }
  function goTo(top){
    var el=scroller(), max=el.scrollHeight-el.clientHeight;
    top=Math.max(0,Math.min(top,max));
    // scrollTo can be a no-op in some engines; verify and hard-set as a fallback.
    try{ el.scrollTo({top:top,behavior:'smooth'}); }catch(err){ el.scrollTop=top; }
    setTimeout(function(){ if(Math.abs(el.scrollTop-top)>4) el.scrollTop=top; }, 700);
  }
  /* in-page links scroll to the band (or the element); a #link whose target is not on this page
     falls through to the browser, which on a sub-page means the main portfolio (via <base>) */
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var id=a.getAttribute('href').slice(1);
      if(!id || id==='top'){
        if(!document.getElementById('top') && id==='top') return;
        e.preventDefault(); goTo(0); history.replaceState(null,'',location.pathname+location.search); return;
      }
      var band=document.querySelector('.pagebreak[data-page="'+id+'"]');
      var tgt=band||document.getElementById(id);
      if(tgt){
        e.preventDefault();
        goTo(tgt.getBoundingClientRect().top + scroller().scrollTop - 58);
        history.replaceState(null,'',location.pathname+location.search+'#'+id);
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
