/* Prelevox – graphique d'évolution du solde (SVG fait main, zéro dépendance). */
(function (root) {
  'use strict';
  var ORANGE = '#FF6600';
  var W = 360, H = 148, PAD_T = 12, PAD_B = 8, PAD_X = 4;

  function fmtXmr(n, sign) {
    var s = Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    if (!sign) return (n < 0 ? '\u2212' : '') + s;
    return (n >= 0 ? '+' : '\u2212') + s;
  }
  function pct(n) {
    var s = Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return (n >= 0 ? '+' : '\u2212') + s + ' %';
  }
  function dmy(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  /* Courbe cubique monotone (Fritsch–Carlson) : lisse, sans dépassement ni boucle sur les marches. */
  function smoothPath(pts) {
    if (!pts.length) return '';
    var p = [pts[0]];
    for (var k = 1; k < pts.length; k++) { if (pts[k].x - p[p.length - 1].x < 0.5) p[p.length - 1] = { x: p[p.length - 1].x, y: pts[k].y }; else p.push(pts[k]); }
    if (p.length === 1) return 'M' + p[0].x.toFixed(2) + ',' + p[0].y.toFixed(2);
    var n = p.length, dx = [], m = [], t = [], i;
    for (i = 0; i < n - 1; i++) { dx[i] = p[i + 1].x - p[i].x; m[i] = (p[i + 1].y - p[i].y) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { var r = 3 / Math.sqrt(h); t[i] = r * a * m[i]; t[i + 1] = r * b * m[i]; }
    }
    var d = 'M' + p[0].x.toFixed(2) + ',' + p[0].y.toFixed(2);
    for (i = 0; i < n - 1; i++) {
      var c = dx[i] / 3;
      d += 'C' + (p[i].x + c).toFixed(2) + ',' + (p[i].y + c * t[i]).toFixed(2) + ' ' + (p[i + 1].x - c).toFixed(2) + ',' + (p[i + 1].y - c * t[i + 1]).toFixed(2) + ' ' + p[i + 1].x.toFixed(2) + ',' + p[i + 1].y.toFixed(2);
    }
    return d;
  }

  function sample(points, periodDays, noExtend) {
    if (!points || !points.length) return [];
    var sorted = points.slice().sort(function (a, b) { return a.ts - b.ts; });
    var end = sorted[sorted.length - 1].ts;
    var start = end - periodDays * 864e5;
    var out = sorted.filter(function (p) { return p.ts >= start; });
    if (!out.length) {
      /* point juste avant la fenêtre pour ancrer le début */
      var prev = null;
      for (var i = 0; i < sorted.length; i++) if (sorted[i].ts < start) prev = sorted[i];
      if (prev) out.push({ ts: start, balance: prev.balance });
      out.push(sorted[sorted.length - 1]);
    } else if (out[0].ts > start) {
      var before = null;
      for (var j = 0; j < sorted.length; j++) if (sorted[j].ts < out[0].ts) before = sorted[j];
      if (before) out.unshift({ ts: start, balance: before.balance });
      else if (!noExtend) out.unshift({ ts: start, balance: out[0].balance });
    }
    return out;
  }

  function layout(series) {
    var min = Infinity, max = -Infinity, i;
    for (i = 0; i < series.length; i++) {
      if (series[i].balance < min) min = series[i].balance;
      if (series[i].balance > max) max = series[i].balance;
    }
    if (!(max > min)) { min -= 0.05; max += 0.05; }
    var pad = (max - min) * 0.12;
    min -= pad; max += pad;
    var t0 = series[0].ts, t1 = series[series.length - 1].ts;
    var span = Math.max(1, t1 - t0);
    var innerH = H - PAD_T - PAD_B;
    var innerW = W - PAD_X * 2;
    return series.map(function (p) {
      return {
        x: PAD_X + ((p.ts - t0) / span) * innerW,
        y: PAD_T + (1 - (p.balance - min) / (max - min)) * innerH,
        ts: p.ts,
        balance: p.balance
      };
    });
  }

  function deltaInfo(series) {
    if (series.length < 2) return { abs: 0, rel: 0, up: true };
    var a = series[0].balance, b = series[series.length - 1].balance;
    var abs = b - a;
    var rel = a === 0 ? 0 : (abs / Math.abs(a)) * 100;
    return { abs: abs, rel: rel, up: abs >= 0 };
  }

  function svgMarkup(pts, uid) {
    var line = smoothPath(pts);
    var last = pts[pts.length - 1];
    var first = pts[0];
    var area = line + 'L' + last.x.toFixed(2) + ',' + (H - PAD_B) + 'L' + first.x.toFixed(2) + ',' + (H - PAD_B) + 'Z';
    var gid = 'cg-' + uid;
    return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + ORANGE + '" stop-opacity="0.35"/>' +
      '<stop offset="100%" stop-color="' + ORANGE + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="chart-area" d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path class="chart-line" d="' + line + '" fill="none" stroke="' + ORANGE + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '<circle class="chart-dot" cx="' + last.x.toFixed(2) + '" cy="' + last.y.toFixed(2) + '" r="4.5" fill="' + ORANGE + '" stroke="#0B0B0C" stroke-width="2"/>' +
      '<line class="chart-cross" x1="0" x2="0" y1="' + PAD_T + '" y2="' + (H - PAD_B) + '" stroke="rgba(255,255,255,.35)" stroke-width="1" visibility="hidden"/>' +
      '<circle class="chart-scrub" cx="0" cy="0" r="5" fill="#fff" stroke="' + ORANGE + '" stroke-width="2.5" visibility="hidden"/>' +
      '</svg>';
  }

  function periodLabel(days) {
    if (days <= 7) return '7 jours';
    if (days <= 30) return '30 jours';
    return '1 an';
  }

  function cardHtml(points, periodDays, emptyMsg, opts) {
    opts = opts || {};
    periodDays = periodDays || 30;
    if (!points || points.length < 2) {
      return '<div class="chart-card chart-empty" id="bal-chart">' +
        '<p>' + (emptyMsg || 'L\u2019historique apparaîtra après la première synchronisation.') + '</p></div>';
    }
    var series = sample(points, periodDays, opts.noExtend);
    if (series.length < 2) {
      return '<div class="chart-card chart-empty" id="bal-chart"><p>' +
        (emptyMsg || 'L\u2019historique apparaîtra après la première synchronisation.') + '</p></div>';
    }
    var pts = layout(series);
    var d = deltaInfo(series);
    var uid = String(Date.now() % 1e9);
    var aria = 'Évolution du solde sur ' + periodLabel(periodDays) + ' : ' +
      fmtXmr(d.abs, true) + ' XMR (' + pct(d.rel) + ').';
    return '<div class="chart-card' + (reduceMotion() ? ' reduce-motion' : '') + '" id="bal-chart"' + (opts.noExtend ? ' data-noext="1"' : '') + ' data-period="' + periodDays + '" aria-label="' + aria.replace(/"/g, '&quot;') + '">' +
      '<div class="chart-head"><div><small>Évolution</small>' +
      '<div class="chart-delta ' + (d.up ? 'up' : 'down') + '">' + fmtXmr(d.abs, true) + ' XMR' + (series[0].balance !== 0 ? ' · ' + pct(d.rel) : '') + '</div>' +
      (opts.noExtend && series[0].ts > series[series.length - 1].ts - periodDays * 864e5 + 864e5 ? '<small class="chart-since">depuis le ' + new Date(series[0].ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + '</small>' : '') + '</div></div>' +
      '<div class="chart-periods" role="tablist" aria-label="Période du graphique">' +
      '<button type="button" role="tab" data-period="7"' + (periodDays === 7 ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>7 j</button>' +
      '<button type="button" role="tab" data-period="30"' + (periodDays === 30 ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>30 j</button>' +
      '<button type="button" role="tab" data-period="365"' + (periodDays === 365 ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>1 an</button>' +
      '</div>' +
      '<div class="chart-body">' + svgMarkup(pts, uid) +
      '<div class="chart-tip" hidden><b></b><small></small></div></div></div>';
  }

  function bind(getPoints, rerender) {
    var root = document.getElementById('bal-chart');
    if (!root || root.classList.contains('chart-empty')) return;
    var period = parseInt(root.getAttribute('data-period'), 10) || 30;
    var tip = root.querySelector('.chart-tip');
    var svg = root.querySelector('.chart-svg');
    var cross = root.querySelector('.chart-cross');
    var scrub = root.querySelector('.chart-scrub');
    var series = sample(getPoints(), period, root.getAttribute('data-noext') === '1');
    var pts = layout(series);

    root.querySelectorAll('.chart-periods button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = parseInt(btn.getAttribute('data-period'), 10);
        if (p === period) return;
        rerender(p);
      });
    });

    function showAt(clientX) {
      if (!pts.length) return;
      var rect = svg.getBoundingClientRect();
      var x = ((clientX - rect.left) / rect.width) * W;
      var best = 0, bestDist = Infinity, i;
      for (i = 0; i < pts.length; i++) {
        var dist = Math.abs(pts[i].x - x);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      var p = pts[best];
      cross.setAttribute('x1', p.x.toFixed(2));
      cross.setAttribute('x2', p.x.toFixed(2));
      cross.setAttribute('visibility', 'visible');
      scrub.setAttribute('cx', p.x.toFixed(2));
      scrub.setAttribute('cy', p.y.toFixed(2));
      scrub.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.querySelector('b').textContent = fmtXmr(p.balance) + ' XMR';
      tip.querySelector('small').textContent = dmy(p.ts);
      var tipX = (p.x / W) * rect.width;
      tip.style.left = Math.max(8, Math.min(rect.width - tip.offsetWidth - 8, tipX - tip.offsetWidth / 2)) + 'px';
      tip.style.top = Math.max(4, (p.y / H) * rect.height - tip.offsetHeight - 10) + 'px';
    }
    function hide() {
      cross.setAttribute('visibility', 'hidden');
      scrub.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    }
    function onPointer(e) {
      e.preventDefault();
      var t = e.touches ? e.touches[0] : e;
      if (!t) return;
      showAt(t.clientX);
    }
    svg.addEventListener('pointerdown', function (e) { svg.setPointerCapture(e.pointerId); onPointer(e); });
    svg.addEventListener('pointermove', function (e) { if (e.buttons || e.pressure > 0 || tip.hidden === false && e.pointerType === 'touch') onPointer(e); });
    svg.addEventListener('pointerup', hide);
    svg.addEventListener('pointercancel', hide);
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') hide(); });
    svg.addEventListener('touchstart', onPointer, { passive: false });
    svg.addEventListener('touchmove', onPointer, { passive: false });
    svg.addEventListener('touchend', hide);
  }

  root.PxChart = { cardHtml: cardHtml, bind: bind, sample: sample, fmtXmr: fmtXmr };
})(self);
