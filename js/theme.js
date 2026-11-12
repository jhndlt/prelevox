/* Prelevox – apparence. « matrix » (par défaut) : fond noir uni, typographie monospace, cartes et badges façon terminal.
   « classique » : l'interface d'origine.
   Préférence non sensible, gardée dans localStorage pour s'appliquer avant le premier affichage. */
(function (root) {
  'use strict';
  var KEY = 'px-ui', THEMES = ['matrix', 'classique'];
  var html = root.document.documentElement;
  function get() { try { var v = root.localStorage.getItem(KEY); return THEMES.indexOf(v) >= 0 ? v : 'matrix'; } catch (e) { return 'matrix'; } }
  function apply(t) { html.setAttribute('data-ui', t); }
  function set(t) { if (THEMES.indexOf(t) < 0) return; try { root.localStorage.setItem(KEY, t); } catch (e) {} apply(t); }
  apply(get()); // avant le premier rendu : pas de flash
  root.PxTheme = { get: get, set: set, THEMES: THEMES };
})(self);
