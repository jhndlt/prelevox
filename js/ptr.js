/* Prelevox – tirer pour actualiser. Repris de Prelevo (app/app.js, « placeRadar » / « homeSync ») :
   même écart d'ouverture (92 px), même courbe de retour (.32 s cubic-bezier(.2,.7,.2,1)), même animation
   radar (pulsation 1,05 s + onde), même durée minimale d'affichage (1,8 s) ; ici avec le logo radar Prelevox
   qui « scanne » (balayage tournant) tant que l'actualisation n'est pas terminée.
   Différence assumée avec Prelevo : la page suit le doigt avec une résistance élastique jusqu'au seuil
   (Prelevo bougeait de 14 px max), pour que le geste soit lisible sur toutes les pages à onglets. */
(function (root) {
  'use strict';
  var GAP = 92, THRESHOLD = 64, MIN_MS = 1800, SLOP = 8;
  var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var opts = null, ind = null, busy = false, st = null;

  function el() { return document.getElementById('app'); }
  function make() {
    ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML = '<i class="ptr-sweep"></i><i class="ptr-logo"></i>';
    document.body.appendChild(ind);
    probe = document.createElement('div'); probe.className = 'sat-probe'; document.body.appendChild(probe);
  }
  /* résistance élastique : suit le doigt au début, de plus en plus dur ensuite (asymptote à 1,4 × GAP) */
  function rubber(d) { var max = GAP * 1.4; return max * (1 - Math.exp(-d / (max * 1.15))); }
  function topFor(shown) { var h = 44; return Math.round(safeTop() + Math.max(6, (shown - h) / 2)); }
  var probe = null;
  function safeTop() { return probe ? (parseFloat(getComputedStyle(probe).paddingTop) || 0) : 0; } // encoche / Dynamic Island
  function setPull(shown, animate) {
    var a = el(); if (!a) return;
    a.style.transition = animate ? 'transform .32s cubic-bezier(.2,.7,.2,1)' : 'none';
    a.style.transform = shown > 0 ? 'translateY(' + shown.toFixed(1) + 'px)' : '';
    var p = Math.min(1, shown / THRESHOLD);
    ind.style.transition = animate ? 'opacity .25s ease, transform .25s ease, top .32s cubic-bezier(.2,.7,.2,1)' : 'none';
    ind.style.top = topFor(shown) + 'px';
    ind.style.opacity = String(Math.min(1, p * 1.15));
    ind.style.transform = 'translate(-50%,0) scale(' + (0.6 + 0.4 * p).toFixed(3) + ') rotate(' + (reduce ? 0 : Math.round(p * 180)) + 'deg)';
    ind.classList.toggle('armed', p >= 1);
  }
  function open() {
    ind.classList.add('on'); ind.classList.remove('armed');
    var a = el(); a.style.transition = 'transform .32s cubic-bezier(.2,.7,.2,1)'; a.style.transform = 'translateY(' + GAP + 'px)';
    ind.style.transition = 'opacity .2s ease, transform .2s ease, top .32s cubic-bezier(.2,.7,.2,1)';
    ind.style.top = topFor(GAP) + 'px'; ind.style.opacity = '1'; ind.style.transform = 'translate(-50%,0) scale(1)';
  }
  function close() {
    ind.classList.remove('on', 'armed');
    var a = el(); if (a) { a.style.transition = 'transform .32s cubic-bezier(.2,.7,.2,1)'; a.style.transform = ''; }
    ind.style.transition = 'opacity .25s ease, transform .25s ease';
    ind.style.opacity = '0'; ind.style.transform = 'translate(-50%,0) scale(.72)';
  }
  async function run() {
    if (busy) return; busy = true; open();
    var t0 = Date.now();
    try { await opts.onRefresh(); } catch (e) {}
    var wait = Math.max(0, MIN_MS - (Date.now() - t0)); // comme Prelevo : le radar reste visible au moins 1,8 s
    if (wait) await new Promise(function (r) { setTimeout(r, wait); });
    busy = false; close();
  }
  function blocked(t) { return !!(t && t.closest && t.closest('.chart-svg,.sheet,input,textarea,select,[data-noptr]')); }
  function onStart(e) {
    st = null;
    if (busy || !e.touches || e.touches.length !== 1 || blocked(e.target)) return;
    if ((root.scrollY || document.documentElement.scrollTop || 0) > 0 || !opts.canStart()) return;
    st = { x: e.touches[0].clientX, y: e.touches[0].clientY, d: 0, mode: null };
  }
  function onMove(e) {
    if (!st || !e.touches) return;
    var dx = e.touches[0].clientX - st.x, dy = e.touches[0].clientY - st.y;
    if (!st.mode) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      st.mode = Math.abs(dx) > Math.abs(dy) || dy < 0 ? 'none' : 'pull'; // balayage horizontal ou vers le haut : on laisse faire
      if (st.mode === 'none') { st = null; return; }
    }
    if (e.cancelable) e.preventDefault(); // seulement une fois le geste reconnu comme « tirer vers le bas »
    st.d = Math.max(0, dy - SLOP);
    var shown = rubber(st.d), wasArmed = ind.classList.contains('armed');
    setPull(shown, false);
    if (!wasArmed && ind.classList.contains('armed') && root.navigator.vibrate) { try { root.navigator.vibrate(8); } catch (x) {} }
  }
  function onEnd() {
    if (!st) return; var s = st; st = null;
    if (s.mode === 'pull' && rubber(s.d) >= THRESHOLD) run(); else setPull(0, true);
  }
  function init(o) {
    opts = o; make();
    /* touchstart / touchend passifs ; touchmove doit pouvoir annuler le défilement natif une fois le geste reconnu */
    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd, { passive: true });
    root.addEventListener('touchcancel', function () { st = null; setPull(0, true); }, { passive: true });
    close();
  }
  root.PxPtr = { init: init, trigger: run, busy: function () { return busy; }, GAP: GAP, THRESHOLD: THRESHOLD, MIN_MS: MIN_MS, _rubber: rubber };
})(self);
