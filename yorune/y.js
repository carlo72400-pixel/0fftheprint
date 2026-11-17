/* 夜音 YORUNE lore pages: the three small toys + the empty discography. No audio here (the street's skin owns the click sounds). */
(function () {
  function $(id) { return document.getElementById(id); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var don = $('don');
  if (don) {
    var n = parseInt(get('yor-don') || '0', 10) || 0, lines = ['Thank you.', 'She will not be returning the favor.', 'Again.', 'The bank is still empty.', 'Universal donor. Has never donated.', 'You look O neg.'];
    $('don-n').textContent = n;
    if (n) $('don-m').textContent = 'Welcome back. The bank is still empty.';
    don.addEventListener('click', function () { n += 1; set('yor-don', String(n)); $('don-n').textContent = n; $('don-m').textContent = lines[(n - 1) % lines.length]; });
  }
  var vis = $('vis');
  if (vis) {
    var mark = function (first) { document.body.classList.add('visited'); vis.textContent = 'VISITED'; $('vis-m').textContent = first ? 'Visited. She remembers.' : 'You came back. She noticed.'; };
    if (get('yor-vis')) mark(false);
    vis.addEventListener('click', function () { var was = !!get('yor-vis'); set('yor-vis', '1'); mark(!was); if (was) $('vis-m').textContent = "Don't close the tab."; });
    var h = $('hero'); if (h) h.addEventListener('click', function () { vis.click(); });
  }
  var pk = $('pg-k');
  if (pk) {
    var code = '', d = $('pg-d'), m = $('pg-m');
    var show = function () { var s = code.split(''); while (s.length < 4) s.push('_'); d.textContent = s.join(' '); };
    pk.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-k');
      if (k === 'c') { code = ''; m.textContent = 'Missed calls: 0. Try her pager code.'; }
      else if (k === 'call') { m.textContent = 'Ringing... no answer. Nobody has the number. Missed calls: 0.'; }
      else if (code.length < 4) {
        code += b.textContent;
        if (code.length === 4) m.textContent = code === '4649' ? '4649 = nice to meet you \u2661' : 'Wrong number. Look at her. The code is on her.';
      }
      show();
    });
  }
  var play = $('play');
  if (play) {
    var t = 0, pl = ['There are zero songs.', 'Still zero.', 'They are on tour anyway.', 'Encore or else.'];
    play.addEventListener('click', function () { $('play-m').textContent = pl[t % pl.length]; t += 1; });
  }
})();
