/* Prelevox – cours du XMR (onglet Prix) et alertes de prix.
   Sources publiques sans clé : CoinGecko, puis Kraken en secours. Aucune adresse ni clé n'est envoyée.
   CoinGecko public est limité à 365 jours d'historique : « Tout » utilise donc d'abord Kraken (bougies hebdomadaires). */
(function (root) {
  'use strict';
  var I18 = root.PxI18n || (typeof require === 'function' ? require('./i18n.js') : null); // textes : js/i18n.js
  function T(k, v) { return I18 ? I18.t(k, v) : k; }
  function loc() { return I18 ? I18.locale() : 'fr-FR'; }
  var DAY = 864e5, OPT = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };
  var PERIODS = {
    '24h': { days: 1, kr: 5 }, '1s': { days: 7, kr: 60 }, '1m': { days: 30, kr: 240 },
    '1a': { days: 365, kr: 1440 }, 'tout': { days: null, kr: 10080 }
  };
  Object.keys(PERIODS).forEach(function (k) { Object.defineProperty(PERIODS[k], 'label', { get: function () { return T('per.' + k); }, enumerable: true }); }); // libellé dans la langue courante
  var cache = {}; // { 'eur:24h': { at, data } }
  function j(url) { return fetch(url, OPT).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  async function cg(cur, days) {
    var d = await j('https://api.coingecko.com/api/v3/coins/monero/market_chart?vs_currency=' + cur + '&days=' + days);
    if (!d || !d.prices || d.prices.length < 2) throw new Error('CoinGecko : réponse vide');
    return d.prices.map(function (p) { return [p[0], p[1]]; });
  }
  async function kraken(cur, interval, days) {
    var d = await j('https://api.kraken.com/0/public/OHLC?pair=XMR' + cur.toUpperCase() + '&interval=' + interval);
    if (d.error && d.error.length) throw new Error('Kraken : ' + d.error[0]);
    var k = Object.keys(d.result).filter(function (x) { return x !== 'last'; })[0];
    var pts = d.result[k].map(function (c) { return [c[0] * 1000, Number(c[4])]; });
    if (days) { var from = Date.now() - days * DAY; pts = pts.filter(function (p) { return p[0] >= from; }); }
    if (pts.length < 2) throw new Error('Kraken : historique vide');
    return pts;
  }
  /* Historique d'une période : { points:[[ts, prix]], source } (cache 3 min) */
  async function history(cur, period) {
    var P = PERIODS[period] || PERIODS['24h'], key = cur + ':' + period, c = cache[key];
    if (c && Date.now() - c.at < 180000) return c.data;
    var data;
    if (period === 'tout') {
      try { data = { points: await kraken(cur, P.kr, null), source: 'Kraken' }; }
      catch (e) { data = { points: await cg(cur, 365), source: 'CoinGecko-365' }; }
    } else {
      try { data = { points: await cg(cur, P.days), source: 'CoinGecko' }; }
      catch (e) { data = { points: await kraken(cur, P.kr, P.days), source: 'Kraken' }; }
    }
    cache[key] = { at: Date.now(), data: data };
    return data;
  }
  /* Cours actuel + variation, plus haut, plus bas sur 24 h */
  var snaps = {};
  async function snapshot(cur) {
    var c = snaps[cur]; if (c && Date.now() - c.at < 60000) return c; // évite de solliciter CoinGecko (limite publique) plus d'une fois par minute
    var h = await history(cur, '24h'), pts = h.points, price = pts[pts.length - 1][1], first = pts[0][1];
    var hi = -Infinity, lo = Infinity; pts.forEach(function (p) { if (p[1] > hi) hi = p[1]; if (p[1] < lo) lo = p[1]; });
    var change = (price - first) / first * 100, src = h.source;
    try { // cours « temps réel » plus frais que le dernier point de l'historique
      var s = await j('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=' + cur + '&include_24hr_change=true');
      if (s.monero && s.monero[cur] > 0) { price = s.monero[cur]; if (isFinite(s.monero[cur + '_24h_change'])) change = s.monero[cur + '_24h_change']; src = 'CoinGecko'; }
    } catch (e) {}
    hi = Math.max(hi, price); lo = Math.min(lo, price);
    return (snaps[cur] = { cur: cur, price: price, change: change, high: hi, low: lo, at: Date.now(), source: src });
  }
  function clear() { cache = {}; snaps = {}; }
  function sourceLabel(s) { return s === 'CoinGecko-365' ? T('pr.cg365') : s; }

  /* ---------- Graphique : ligne orange + dégradé, repères temporels pointillés, prix à droite ---------- */
  function fmt(n, cur, dec) { return n.toLocaleString(loc(), { style: 'currency', currency: cur.toUpperCase(), currencyDisplay: 'narrowSymbol', minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec }); }
  function tick(ts, period) {
    var d = new Date(ts);
    if (period === '24h') return d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
    if (period === '1s' || period === '1m') return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
    if (period === '1a') return d.toLocaleDateString(loc(), { month: 'short' });
    return String(d.getFullYear());
  }
  function chartSvg(points, period, cur) {
    var W = 340, H = 190, PR = 52, PT = 12, PB = 22, w = W - PR;
    var t0 = points[0][0], t1 = points[points.length - 1][0], lo = Infinity, hi = -Infinity;
    points.forEach(function (p) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; });
    var pad = (hi - lo) * 0.08 || hi * 0.01; lo -= pad; hi += pad;
    var X = function (t) { return (t - t0) / Math.max(1, t1 - t0) * w; }, Y = function (v) { return PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB); };
    var step = Math.max(1, Math.floor(points.length / 160)), line = '';
    for (var i = 0; i < points.length; i += step) line += (line ? 'L' : 'M') + X(points[i][0]).toFixed(1) + ' ' + Y(points[i][1]).toFixed(1);
    var last = points[points.length - 1]; line += 'L' + X(last[0]).toFixed(1) + ' ' + Y(last[1]).toFixed(1);
    var area = line + 'L' + w.toFixed(1) + ' ' + (H - PB) + 'L0 ' + (H - PB) + 'Z';
    var g = '', labels = '';
    for (var k = 1; k <= 4; k++) { var x = w * k / 5, t = t0 + (t1 - t0) * k / 5; g += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + PT + '" y2="' + (H - PB) + '" class="pc-grid"/>'; labels += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="pc-t">' + tick(t, period) + '</text>'; }
    var dec = hi >= 1000 ? 0 : 2;
    for (var m = 0; m <= 3; m++) { var v = lo + (hi - lo) * (1 - m / 3) * 0.92 + (hi - lo) * 0.04; labels += '<text x="' + (W - 2) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" class="pc-y">' + fmt(v, cur, dec) + '</text>'; }
    return '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + T('pr.aria') + '">' +
      '<defs><linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FF6600" stop-opacity=".38"/><stop offset="100%" stop-color="#FF6600" stop-opacity="0"/></linearGradient></defs>' +
      g + '<path d="' + area + '" fill="url(#pcg)"/><path d="' + line + '" fill="none" stroke="#FF6600" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + X(last[0]).toFixed(1) + '" cy="' + Y(last[1]).toFixed(1) + '" r="3.5" fill="#FF6600"/>' + labels + '</svg>';
  }

  /* ---------- Alertes ---------- */
  /* alerte = { id, kind:'above'|'below'|'change', value, cur, created, firedAt }
     « au-dessus » / « en-dessous » : se déclenche une fois (puis « déclenchée », réactivable) ;
     « variation » : au plus une fois par 24 h tant que |variation 24 h| ≥ value %. */
  function check(alerts, snaps) {
    var fired = [];
    alerts.forEach(function (a) {
      var s = snaps[a.cur]; if (!s) return;
      var hit = a.kind === 'above' ? s.price >= a.value : a.kind === 'below' ? s.price <= a.value : Math.abs(s.change) >= a.value;
      if (!hit) return;
      if (a.kind === 'change' ? (a.firedAt && Date.now() - a.firedAt < DAY) : a.firedAt) return;
      a.firedAt = Date.now(); fired.push({ alert: a, snap: s });
    });
    return fired;
  }
  function describe(a) {
    return a.kind === 'above' ? T('pr.descAbove', { v: fmt(a.value, a.cur) }) : a.kind === 'below' ? T('pr.descBelow', { v: fmt(a.value, a.cur) }) :
      T('pr.descChange', { p: Number(a.value).toLocaleString(loc(), { maximumFractionDigits: 2 }), c: a.cur.toUpperCase().replace('EUR', '€').replace('USD', '$') });
  }
  function message(f) {
    var a = f.alert, s = f.snap;
    if (a.kind === 'change') return T('pr.msgChange', { p: (s.change >= 0 ? '+' : '\u2212') + Math.abs(s.change).toLocaleString(loc(), { maximumFractionDigits: 2 }), v: fmt(s.price, s.cur) });
    return T(a.kind === 'above' ? 'pr.msgAbove' : 'pr.msgBelow', { a: fmt(a.value, a.cur), v: fmt(s.price, s.cur) });
  }
  root.PxPrice = { PERIODS: PERIODS, history: history, snapshot: snapshot, chartSvg: chartSvg, fmt: fmt, check: check, describe: describe, message: message, clear: clear, sourceLabel: sourceLabel };
  if (typeof module !== 'undefined') module.exports = root.PxPrice;
})(typeof self !== 'undefined' ? self : this);
