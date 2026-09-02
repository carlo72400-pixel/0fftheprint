/* post-review patch: video a11y + lightbox alt */
(function(){
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* .tape.play is excluded: it ships native controls, so role=button would mask them */
  document.querySelectorAll('.tape:not(.play) video').forEach(function(v){
    if(reduced){
      var c = v.cloneNode(true);           /* clone drops the autoplay observer binding */
      c.removeAttribute('autoplay'); c.setAttribute('controls','');
      v.replaceWith(c); c.pause(); v = c;
    }
    v.style.cursor = 'pointer';
    v.setAttribute('tabindex','0');
    v.setAttribute('role','button');
    v.setAttribute('aria-label','Client tape preview. Tap or press enter to play or pause.');
    function toggle(){ if(v.paused){ v.play().catch(function(){}); } else { v.pause(); } }
    v.addEventListener('click', toggle);
    v.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
  });
  var lbi = document.getElementById('lightbox-img');
  var lbx = document.getElementById('lightbox');
  document.querySelectorAll('.kitzoom, .bluep').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      lbi.src = a.getAttribute('href');
      var im = a.querySelector('img');
      lbi.alt = (im && im.alt) ? im.alt + ' (full size)' : 'Full-size image';
      lbx.showModal();
    });
  });
  document.querySelectorAll('#gallery a, .sacp').forEach(function(a){
    a.addEventListener('click', function(){
      var im = a.querySelector('img');
      lbi.alt = (im && im.alt) ? im.alt + ' (full size)' : 'Full-size photo';
    });
  });
})();
