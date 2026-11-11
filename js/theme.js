/* Prelevox – apparence. « matrix » (par défaut) : typographie monospace, cartes et badges façon terminal,
   pluie de caractères orange en fond. « classique » : l'interface d'origine.
   Préférence non sensible, gardée dans localStorage pour s'appliquer avant le premier affichage. */
(function (root) {
  'use strict';
  var KEY = 'px-ui', THEMES = ['matrix', 'classique'];
  var doc = root.document, html = doc.documentElement;
  function get() { try { var v = root.localStorage.getItem(KEY); return THEMES.indexOf(v) >= 0 ? v : 'matrix'; } catch (e) { return 'matrix'; } }
  function apply(t) { html.setAttribute('data-ui', t); Rain[t === 'matrix' ? 'start' : 'stop'](); }
  function set(t) { if (THEMES.indexOf(t) < 0) return; try { root.localStorage.setItem(KEY, t); } catch (e) {} apply(t); }

  /* Pluie numérique : discrète (opacité faible), ~14 images/s, arrêtée quand l'app est cachée.
     Mouvement réduit demandé par le système : une seule image fixe. */
  var Rain = (function () {
    var cv = null, cx = null, cols = [], timer = null, on = false, FS = 14, last = 0;
    var CH = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFXMR';
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function size() {
      if (!cv) return;
      var dpr = Math.min(2, root.devicePixelRatio || 1), w = root.innerWidth, h = root.innerHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.ceil(w / FS); cols = [];
      for (var i = 0; i < n; i++) cols.push({ y: Math.random() * -h / FS, v: 0.35 + Math.random() * 0.65 });
      cx.fillStyle = '#0A0A0A'; cx.fillRect(0, 0, w, h);
      if (reduce) for (var k = 0; k < 40; k++) frame(true);
    }
    function frame(still) {
      var w = root.innerWidth, h = root.innerHeight;
      cx.fillStyle = 'rgba(10,10,10,0.14)'; cx.fillRect(0, 0, w, h);
      cx.font = FS + 'px ui-monospace, "SF Mono", Menlo, monospace';
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i], y = c.y * FS;
        if (y > 0) {
          cx.fillStyle = Math.random() < 0.06 ? 'rgba(255,170,110,0.9)' : 'rgba(255,102,0,0.75)';
          cx.fillText(CH[(Math.random() * CH.length) | 0], i * FS, y);
        }
        c.y += c.v;
        if (y > h && Math.random() > 0.975) c.y = Math.random() * -20;
      }
    }
    function loop(t) {
      if (!on) return;
      timer = root.requestAnimationFrame(loop);
      if (t - last < 70) return; last = t; frame();
    }
    function start() {
      if (on) return;
      if (!doc.body) return doc.addEventListener('DOMContentLoaded', start, { once: true });
      cv = doc.getElementById('rain');
      if (!cv) { cv = doc.createElement('canvas'); cv.id = 'rain'; cv.className = 'rain'; cv.setAttribute('aria-hidden', 'true'); doc.body.insertBefore(cv, doc.body.firstChild); }
      cx = cv.getContext('2d'); on = true; size();
      if (!reduce && doc.visibilityState !== 'hidden') timer = root.requestAnimationFrame(loop);
    }
    function stop() { on = false; if (timer) root.cancelAnimationFrame(timer); timer = null; if (cv) { cv.remove(); cv = null; } }
    root.addEventListener('resize', function () { if (on) size(); });
    doc.addEventListener('visibilitychange', function () {
      if (!on || reduce) return;
      if (doc.visibilityState === 'hidden') { root.cancelAnimationFrame(timer); timer = null; } else if (!timer) timer = root.requestAnimationFrame(loop);
    });
    return { start: start, stop: stop, running: function () { return on && !!timer; } };
  })();

  html.setAttribute('data-ui', get()); // avant le premier rendu : pas de flash
  if (get() === 'matrix') Rain.start();
  root.PxTheme = { get: get, set: set, THEMES: THEMES, rain: Rain };
})(self);
