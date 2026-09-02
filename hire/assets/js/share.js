(function(){
  var sh=document.getElementById('share'), open=document.getElementById('shareBtn');
  if(!sh||!open) return;
  open.addEventListener('click',function(){ sh.showModal(); });
  document.getElementById('shareX').addEventListener('click',function(){ sh.close(); });
  sh.addEventListener('click',function(e){ if(e.target===sh) sh.close(); });
  var lbi=document.getElementById('lightbox-img'), lbx=document.getElementById('lightbox');
  document.querySelectorAll('.sheet-card').forEach(function(c){
    c.addEventListener('click',function(e){
      e.preventDefault();
      lbi.src=c.getAttribute('href');
      var im=c.querySelector('img'); lbi.alt=im?im.alt:'Vamppsych contact card';
      sh.close(); lbx.showModal();
    });
  });
  document.getElementById('shareRates').addEventListener('click',function(){ sh.close(); });
  var cp=document.getElementById('shareCopy'), URL='https://0fftheprint.com/hire/';
  cp.addEventListener('click',function(){
    function ok(){ cp.textContent='Link copied ♥'; cp.classList.add('done'); }
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(URL).then(ok,fb); } else fb();
    function fb(){ var t=document.createElement('textarea'); t.value=URL; t.style.position='fixed'; t.style.opacity='0'; document.body.appendChild(t); t.focus(); t.select(); try{document.execCommand('copy'); ok();}catch(e){ cp.textContent=URL; } t.remove(); }
  });
})();
