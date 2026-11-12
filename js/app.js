/* Prelevox – application. Lecture seule : aucune fonction d'envoi n'existe dans ce code. */
(function () {
  'use strict';
  var PX = self.PxPrice, K = self.PxKeys, V = self.PxVault, Demo = self.PxDemo, Sync = self.PxSync, Chart = self.PxChart, KI = self.PxKeyImages, I = self.PxI18n;
  var $app = document.getElementById('app'), $tab = document.getElementById('tabbar'), $toast = document.getElementById('toast');
  var DAY = 864e5;
  /* Textes : tous dans js/i18n.js (fr / en). Formats de nombres et de dates selon la langue (fr-FR / en-US). */
  var T = I.t, Tn = I.tn, lbl = I.label;
  function loc() { return I.locale(); }
  var S = { demo: false, vaultExists: false, wallets: [], results: {}, subs: [], chartPeriod: 30,
    settings: { provider: 'monero-ts', node: 'auto', customNode: '', lwsUrl: '', price: true },
    sync: null, errors: {}, price: null, nodeTest: null, kis: {}, resume: null, wake: null,
    prix: { period: '24h', cur: 'eur', snap: null, hist: null, err: null, loading: false, at: 0 }, alerts: [], sheet: { kind: 'above', cur: null }, push: { on: false, busy: false, err: null } };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function xmr(n, sign) { var s = Math.abs(n).toLocaleString(loc(), { minimumFractionDigits: 4, maximumFractionDigits: 4 }); return sign ? (n === 0 ? '' : n > 0 ? '+' : '\u2212') + s : (n < 0 ? '\u2212' : '') + s; }
  function nf(n) { return Number(n).toLocaleString(loc()); }
  function eur(n) { return n.toLocaleString(loc(), { style: 'currency', currency: 'EUR' }); }
  function hm(ts) { return new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }); }
  function dmy(ts) { return new Date(ts).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }); }
  function sameDay(a, b) { a = new Date(a); b = new Date(b); return a.toDateString() === b.toDateString(); }
  function inDays(ts) { var a = new Date(); a.setHours(0, 0, 0, 0); var b = new Date(ts); b.setHours(0, 0, 0, 0); return Math.round((b - a) / DAY); }
  function when(ts) { var d = inDays(ts); return d === 0 ? T('when.today') : d === 1 ? T('when.tomorrow') : T('when.in', { n: d }); }
  function toast(s) { $toast.textContent = s; $toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.classList.remove('show'); }, 2600); }
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return u; } }
  function dur(sec) { if (!isFinite(sec) || sec <= 0) return ''; if (sec < 60) return T('dur.lt1'); var m = Math.round(sec / 60); if (m < 60) return T('dur.min', { m: m }); var h = Math.floor(m / 60), r = m % 60; return r ? T('dur.hm', { h: h, mm: String(r).padStart(2, '0') }) : T('dur.h', { h: h }); }
  function pctFmt(n, opts) { return T('pct', { n: n.toLocaleString(loc(), opts) }); }
  function uid() { return 'w' + Array.from(crypto.getRandomValues(new Uint8Array(8)), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  var ico = { lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' };
  /* ---------- Données ---------- */
  function wallets() { return S.demo ? Demo.wallets : S.wallets; }
  function txsAll() { var o = []; wallets().forEach(function (w) { var r = S.results[w.id]; if (r) o = o.concat(r.txs); }); return o.sort(function (a, b) { return b.ts - a.ts; }); }
  function subsAll() {
    if (S.demo) return Demo.subs();
    var manual = S.subs, det = Sync.detectRecurring(txsAll()).filter(function (d) { return !manual.some(function (m) { return Math.abs(m.amount - d.amount) < d.amount * 0.03 && m.walletId === d.walletId; }); });
    return manual.concat(det).map(function (s) { var n = s.nextTs, step = s.period === 'annuel' ? 365 : s.period === 'hebdomadaire' ? 7 : 30; while (n < Date.now() - DAY / 2) n += step * DAY; return Object.assign({}, s, { nextTs: n }); });
  }
  function incomingAll() {
    if (S.demo) return [];
    return Sync.detectRecurringIn(txsAll()).map(function (s) { var n = s.nextTs, step = s.period === 'annuel' ? 365 : s.period === 'hebdomadaire' ? 7 : 30; while (n < Date.now() - DAY / 2) n += step * DAY; return Object.assign({}, s, { nextTs: n }); });
  }
  function unlockedTotal() { return wallets().reduce(function (a, w) { var r = S.results[w.id]; return a + (r ? (r.balance.unlocked != null ? r.balance.unlocked : r.balance.total) : 0); }, 0); }
  function wname(id) { var w = wallets().find(function (x) { return x.id === id; }); return w ? w.label : ''; }
  function widx(id) { return Math.max(0, wallets().findIndex(function (x) { return x.id === id; })) % 3; }
  function isExact(id) { var r = S.results[id]; return !!(r && r.balance && r.balance.exact); }
  function allExact() { var ws = wallets().filter(function (w) { return S.results[w.id]; }); return !S.demo && ws.length > 0 && ws.every(function (w) { return isExact(w.id); }); }
  function dmyY(ts) { return new Date(ts).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' }); }
  function total() { return wallets().reduce(function (a, w) { var r = S.results[w.id]; return a + (r ? r.balance.total : 0); }, 0); }
  /* Historique du solde total pour le graphique d'accueil */
  function historyPoints() {
    if (S.demo) return Demo.history();
    var ws = wallets();
    if (!ws.some(function (w) { return S.results[w.id]; })) return [];
    /* Courbe en marches : solde connu depuis la hauteur de restauration (avant : inconnu, non tracé). */
    var since = Math.min.apply(null, ws.map(function (w) { var r = S.results[w.id]; return r && r.balance.restoreHeight != null ? Sync.dateFromHeight(r.balance.restoreHeight) : Date.now(); }));
    var list = txsAll().filter(function (t) { return !t.pending; }).sort(function (a, b) { return a.ts - b.ts; });
    var bal = total() - list.reduce(function (a, t) { return a + t.amount; }, 0) - txsAll().filter(function (t) { return t.pending; }).reduce(function (a, t) { return a + t.amount; }, 0);
    var points = [{ ts: Math.min(since, list.length ? list[0].ts - 60000 : since), balance: Math.max(0, bal) }];
    for (var i = 0; i < list.length; i++) {
      points.push({ ts: list[i].ts - 1000, balance: Math.max(0, bal) });
      bal += list[i].amount;
      points.push({ ts: list[i].ts, balance: Math.round(Math.max(0, bal) * 1e4) / 1e4 });
    }
    points.push({ ts: Date.now(), balance: total() });
    return points;
  }

  async function loadDemo() { S.results = {}; for (var i = 0; i < Demo.wallets.length; i++) S.results[Demo.wallets[i].id] = (await Sync.get('demo').sync(Demo.wallets[i])).result; }
  async function loadReal() {
    S.wallets = await V.list('wallet');
    for (var i = 0; i < S.wallets.length; i++) { // anciens ajouts sans hauteur : jamais toute la chaîne, 30 jours avant l'ajout
      var w = S.wallets[i];
      if (!w.restoreHeight && !w.restoreSource) { w.restoreHeight = Sync.restoreHeightForDate((w.added || Date.now()) - 30 * DAY); w.restoreSource = 'default'; var id = w.id; delete w.id; await V.save('wallet', id, w); w.id = id; }
    }
    S.subs = await V.list('sub');
    S.kis = {}; (await V.list('ki')).forEach(function (k) { S.kis[k.id.replace(/^ki-/, '')] = { count: k.count, exportedAt: k.exportedAt, importedAt: k.importedAt, format: k.format, fileName: k.fileName }; });
    var cache = await V.list('cache'); S.results = {};
    cache.forEach(function (c) { S.results[c.id.replace(/^cache-/, '')] = c.data; });
  }
  /* Synchronisation réelle : un portefeuille après l'autre, reprise incrémentale depuis l'état chiffré. */
  async function syncAll(onlyId) {
    if (S.demo) { await loadDemo(); toast(T('toast.demoRefreshed')); return render(); }
    if (S.sync) return toast(T('toast.syncBusy'));
    if (!V.isOpen() || !S.wallets.length) return;
    var p = Sync.get(S.settings.provider);
    var job = S.sync = { cancelled: false, paused: false, handle: null, walletId: null, label: '', pct: 0, remaining: null, preparing: true, node: '', started: Date.now(), rate: null, samples: [], onlyId: onlyId };
    S.resume = null;
    wakeLock(true);
    paintSync();
    var list = S.wallets.filter(function (w) { return !onlyId || w.id === onlyId; });
    var okCount = 0;
    for (var i = 0; i < list.length && !job.cancelled; i++) {
      var w = list[i];
      job.walletId = w.id; job.label = w.label; job.pct = 0; job.remaining = null; job.preparing = true; job.samples = []; job.step = (i + 1) + '/' + list.length;
      paintSync();
      try {
        var state = p.id === 'monero-ts' ? await V.load('wstate', 'st-' + w.id) : null;
        var kis = p.id === 'monero-ts' ? await V.load('ki', 'ki-' + w.id) : null;
        var out = await p.sync(w, S.settings, {
          state: state, keyImages: kis,
          isCancelled: function () { return job.cancelled; },
          onHandle: function (h) { job.handle = h; if (job.paused) h.pause(); },
          onNode: function (u, o) {
            if (o && o.failover && job.node) { job.failover = T('sync.failover', { a: hostOf(job.node), b: hostOf(u) }); toast(job.failover); }
            job.node = u; paintSync();
          },
          onProgress: function (info) {
            V.touch(); // le coffre reste ouvert pendant une synchro active
            if (info.keyImages) { job.ki = true; return paintSync(); }
            job.ki = false;
            job.pct = info.pct; job.remaining = info.remaining; job.preparing = info.preparing; job.end = info.end;
            var now = Date.now(); job.samples.push([now, info.height]); while (job.samples.length > 2 && now - job.samples[0][0] > 30000) job.samples.shift();
            var a = job.samples[0], b = job.samples[job.samples.length - 1];
            if (b[0] - a[0] > 3000 && b[1] > a[1]) job.rate = (b[1] - a[1]) / ((b[0] - a[0]) / 1000);
            paintSync();
          },
          onCheckpoint: function (st) { return V.save('wstate', 'st-' + w.id, st); }
        });
        S.results[w.id] = out.result; delete S.errors[w.id]; okCount++;
        await V.save('cache', 'cache-' + w.id, { data: out.result });
      } catch (e) {
        if (e && e.cancelled) { job.cancelled = true; break; }
        if (e && e.paused) { job.paused = true; break; }
        S.errors[w.id] = (e && e.message) || String(e);
        if (!V.isOpen()) break;
      }
    }
    kis = null;
    S.sync = null; wakeLock(false);
    if (job.paused) { S.resume = { onlyId: onlyId, at: Date.now() }; paintSync(); if (document.visibilityState === 'visible') resumeSync(); return; }
    if (job.cancelled) toast(T('toast.syncCancelled'));
    else if (okCount === list.length) toast(okCount > 1 ? T('toast.synced_other') : T('toast.synced_one'));
    if (V.isOpen()) render();
  }
  function cancelSync() {
    var j = S.sync; if (!j) return;
    j.cancelled = true; if (j.handle) j.handle.stop();
    paintSync();
  }
  /* Écran allumé pendant la synchro (Wake Lock, si le navigateur le permet : Safari iOS 16.4+, Chrome). */
  async function wakeLock(on) {
    try {
      if (on && !S.wake && navigator.wakeLock && document.visibilityState === 'visible') {
        S.wake = await navigator.wakeLock.request('screen');
        S.wake.addEventListener('release', function () { S.wake = null; if (S.sync) paintSync(); });
        if (S.sync) paintSync();
      } else if (!on && S.wake) { var w = S.wake; S.wake = null; await w.release(); }
    } catch (e) { S.wake = null; }
  }
  /* App en arrière-plan (iOS suspend la page) : pause propre, progression chiffrée sauvegardée. */
  function pauseSync() {
    var j = S.sync; if (!j || j.cancelled || j.paused) return;
    j.paused = true; if (j.handle && j.handle.pause) j.handle.pause();
  }
  function resumeSync() {
    if (!S.resume || S.sync || S.demo || !V.isOpen() || document.visibilityState !== 'visible') return;
    var r = S.resume; S.resume = null;
    toast(T('toast.resume'));
    syncAll(r.onlyId);
  }
  function syncHtml() {
    var j = S.sync; if (!j) return '';
    var pct = Math.round((j.pct || 0) * 1000) / 10;
    var eta = j.rate && j.remaining ? dur(j.remaining / j.rate) : '';
    var line = j.cancelled ? T('sync.stopping') :
      j.paused ? T('sync.pausing') :
      j.ki ? T('sync.ki') :
      !j.node ? T('sync.findNode') :
      j.preparing ? T('sync.preparing') :
      pctFmt(pct, { maximumFractionDigits: 1 }) + ' · ' + (j.remaining != null ? Tn('sync.blocksLeft', j.remaining) : '') + (eta ? ' · ' + eta : '');
    return '<div class="synccard" id="syncbox" role="status" aria-live="polite"><div class="sync-head"><span class="spin" aria-hidden="true"></span><div class="t"><b>' + T('sync.title') + (S.wallets.length > 1 ? ' ' + esc(j.step || '') : '') + '</b><small>' + esc(j.label) + (j.node ? ' · ' + T('sync.node', { h: esc(hostOf(j.node)) }) : '') + '</small></div>' +
      (j.cancelled ? '' : '<button class="pill" data-act="cancel-sync">' + T('btn.cancel') + '</button>') + '</div>' +
      '<div class="bar"><i data-w="' + (j.preparing ? 2 : Math.max(2, pct)) + '"></i></div><small class="sync-line">' + line + '</small>' +
      (j.failover ? '<small class="sync-hint sync-warn">' + esc(j.failover) + '</small>' : '') +
      '<small class="sync-hint">' + (Sync.isIOS() ? T('sync.ios') : T('sync.keepOpen')) + (S.wake ? T('sync.wake') : '') + '</small></div>';
  }
  function paintSync() {
    var box = document.getElementById('syncbox'), html = syncHtml();
    if (box && html) { // mise à jour sur place (pas de clignotement de la barre)
      var tmp = document.createElement('div'); tmp.innerHTML = html; var nb = tmp.firstChild;
      box.querySelector('.sync-head').innerHTML = nb.querySelector('.sync-head').innerHTML;
      box.querySelector('.sync-line').textContent = nb.querySelector('.sync-line').textContent;
      var hints = box.querySelectorAll('.sync-hint'), nh = nb.querySelectorAll('.sync-hint');
      if (hints.length !== nh.length || hints[hints.length - 1].innerHTML !== nh[nh.length - 1].innerHTML) { box.innerHTML = nb.innerHTML; }
      box.querySelector('.bar i').dataset.w = nb.querySelector('.bar i').dataset.w;
    } else if (box) box.remove();
    else { var slot = document.getElementById('syncslot'); if (slot) slot.innerHTML = html; }
    applyBars();
  }
  /* La CSP interdit les attributs style : la largeur des barres est posée en JS. */
  function applyBars() { document.querySelectorAll('.bar i[data-w]').forEach(function (i) { i.style.width = i.dataset.w + '%'; }); }
  async function refreshPrice(force) {
    if (S.demo || !S.settings.price) return;
    if (!force && S.price && Date.now() - S.price.at < 10 * 60 * 1000) return;
    try { S.price = await Sync.fetchPriceEur(); await V.setSetting('price', S.price); if (route() === 'soldes') { skipScroll = true; var y = window.scrollY; render(); window.scrollTo(0, y); } } catch (e) {}
  }

  /* ---------- Gabarits ---------- */
  function header() {
    return '<header class="top"><img src="icons/mark.png" alt=""><div class="brand">Prelevo<span>x</span></div>' +
      (S.demo ? '<span class="badge demo">' + T('badge.demo') + '</span>' : '<span class="badge">' + T('badge.ro') + '</span>') +
      (!S.demo && V.isOpen() ? '<button class="lockbtn" data-act="lock" aria-label="' + T('aria.lock') + '">' + ico.lock + '</button>' : '') + '</header>' +
      (S.demo ? '<div class="demobar">🧪 <span>' + T('demobar') + '</span><button data-act="quit-demo">' + T('btn.quit') + '</button></div>' : '');
  }
  function txRow(x) {
    return '<div class="row"><span class="ic ' + (x.amount >= 0 ? 'c0' : '') + '">' + (x.amount >= 0 ? '↓' : '↑') + '</span><div class="t"><div>' + esc(lbl(x.label)) + '</div><small>' +
      (sameDay(x.ts, Date.now()) ? hm(x.ts) : dmy(x.ts) + ' ' + hm(x.ts)) + ' · ' + esc(lbl(wname(x.walletId))) + ' · ' + (x.pending ? T('tx.pending') : x.confirmations >= 10 ? T('tx.conf', { n: nf(x.confirmations) }) : T('tx.confPart', { n: x.confirmations || 0 })) + '</small></div><b class="' + (x.amount >= 0 ? 'in' : '') + '">' +
      xmr(x.amount, true) + (x.approx ? '<span class="approx">' + T('approx.f') + '</span>' : '') + '</b></div>';
  }
  function subRow(s, withWhen) {
    return '<div class="row"><span class="ic">' + esc(s.icon || '↻') + '</span><div class="t"><div>' + esc(lbl(s.label)) + '</div><small>' +
      (withWhen ? when(s.nextTs) + ' · ' + dmy(s.nextTs) : T('sub.next', { p: T('period.' + s.period), d: dmy(s.nextTs) })) + (s.source === 'détecté' && !/détect/.test(s.label) ? T('sub.detected') : '') + '</small></div><b' + (s.incoming ? ' class="in"' : '') + '>' + xmr(s.incoming ? s.amount : -s.amount, true) + (s.approx ? '<span class="approx">' + T('approx.m') + '</span>' : '') + '</b>' +
      (!S.demo && s.source === 'manuel' && !withWhen ? '<button class="lockbtn" data-del-sub="' + esc(s.id) + '" aria-label="' + T('aria.delete') + '">✕</button>' : '') + '</div>';
  }
  function note() { return '<p class="note"><strong>' + T('key') + '</strong><br>' + T('note.line') + '</p>'; }

  /* ---------- Écrans ---------- */
  var views = {};
  views.bienvenue = function () {
    return '<section class="welcome"><img src="icons/mark.png" alt="' + T('welcome.logoAlt') + '"><h1>Prelevo<span>x</span></h1>' +
      '<p class="quote">' + T('welcome.quote') + '</p>' +
      '<div class="pts"><div><i>👁</i><span>' + T('welcome.p1') + '</span></div>' +
      '<div><i>⛔</i><span>' + T('welcome.p2') + '</span></div>' +
      '<div><i>🔒</i><span>' + T('welcome.p3') + '</span></div></div>' +
      '<a class="btn" href="#/ajouter">' + T('btn.addWallet') + '</a><button class="btn ghost" data-act="demo">' + T('btn.tryDemo') + '</button></section>';
  };
  views.deverrouiller = function () {
    return '<section class="welcome"><img src="icons/mark.png" alt=""><h1>Prelevo<span>x</span></h1><p class="quote">' + T('unlock.locked') + '</p>' +
      '<form id="unlock"><div class="f"><label for="pw">' + T('unlock.pass') + '</label><input id="pw" type="password" autocomplete="current-password" required></div><div class="msg" id="um"></div>' +
      '<button class="btn mt">' + T('btn.unlock') + '</button></form><p class="note">' + T('unlock.forgot') + '</p></section>';
  };
  views.soldes = function () {
    var ws = wallets(), tot = total(), today = txsAll().filter(function (x) { return sameDay(x.ts, Date.now()); }).slice(0, 3);
    var soon = subsAll().concat(incomingAll()).filter(function (s) { return inDays(s.nextTs) <= 14; }).sort(function (a, b) { return a.nextTs - b.nextTs; }).slice(0, 2);
    var synced = ws.some(function (w) { return S.results[w.id]; });
    var lastSync = Math.max.apply(null, [0].concat(ws.map(function (w) { return S.results[w.id] ? S.results[w.id].balance.syncedAt : 0; })));
    var sub = S.demo ? T('bal.example', { v: eur(tot * Demo.priceEur) }) :
      !synced ? T('bal.notSynced') :
      (S.settings.price && S.price ? '≈ ' + eur(tot * S.price.eur) + ' · ' : '') + (sameDay(lastSync, Date.now()) ? T('bal.syncAt', { t: hm(lastSync) }) : T('bal.syncOn', { d: dmy(lastSync) }));
    var exact = allExact();
    var h = header() + '<div class="hero"><small>' + (S.demo ? T('bal.total') : exact ? T('bal.exactAt', { d: dmy(lastSync) }) : T('bal.estimated')) + ' · ' + Tn('bal.wallets', ws.length) + '</small><h1>' + (synced ? xmr(tot) : '—') + ' <em>XMR</em></h1>' +
      '<p>' + sub + '</p>' +
      '<div class="chips">' + (exact ? '<span>' + T('chip.ki') + '</span>' : '<span>' + T('chip.vk') + '</span>') + '<span>' + T('chip.enc') + '</span><span>' + T('chip.nosend') + '</span></div></div>';
    if (!S.demo) h += '<div id="syncslot">' + syncHtml() + '</div>';
    if (!S.demo) ws.forEach(function (w) { if (S.errors[w.id] && !S.sync) h += '<div class="alert stop"><b>' + esc(w.label) + '</b>' + T('colon') + esc(S.errors[w.id]) + '<div class="alert-acts"><button class="pill on" data-act="sync">' + T('btn.retry') + '</button><a class="pill" href="#/reglages">' + T('btn.pickNode') + '</a></div></div>'; });
    if (!S.demo && !S.sync) ws.forEach(function (w) {
      var r = S.results[w.id], k = r && r.balance.keyImages;
      if (k && k.error) h += '<div class="alert stop"><b>' + esc(w.label) + ' · key images</b>' + T('colon') + esc(k.error) + '<div class="alert-acts"><a class="pill on" href="#/exact">' + T('btn.reimport') + '</a></div></div>';
      else if (k && k.applied && k.missing > 0) h += '<div class="alert warn"><b>' + esc(w.label) + '</b>' + T('colon') + Tn('ki.missing', k.missing) + '</div>';
    });
    if (!S.demo && ws.length && !synced && !S.sync && !Object.keys(S.errors).length) h += '<div class="alert info"><b>' + T('first.title') + '</b><br>' + T('first.body') + '<button class="btn mt" data-act="sync">' + T('first.btn') + '</button></div>';
    h += Chart.cardHtml(historyPoints(), S.chartPeriod, S.demo ? undefined : T('chart.emptyAfter'), S.demo ? undefined : { noExtend: true });
    h += '<h2>' + T('h.balances') + ' <a href="#/ajouter">' + T('link.add') + '</a></h2><div class="card">' + (ws.length ? ws.map(function (w, i) {
      var r = S.results[w.id];
      var locked = r && !S.demo && r.balance.unlocked != null && r.balance.total - r.balance.unlocked > 1e-12;
      var kiTag = S.demo || !r ? '' : r.balance.exact ? ' · <span class="tag ok">' + T('tag.exact') + '</span>' : r.balance.keyImages && r.balance.keyImages.missing > 0 ? ' · <span class="tag">' + T('tag.reimport') + '</span>' : ' · <span class="tag">' + T('tag.estimated') + '</span>';
      return '<div class="row"><span class="ic c' + (i % 3) + '"><span class="dot"></span></span><div class="t"><div>' + esc(lbl(w.label)) + '</div><small>' + esc(lbl(w.app || 'Monero')) + ' · <span class="addr">' + esc(K.short(w.address)) + '</span>' + kiTag + '</small></div><b>' + (r ? xmr(r.balance.total) + (locked ? '<span class="approx">' + T('bal.available', { v: xmr(r.balance.unlocked) }) + '</span>' : '') : '<span class="small">' + T('bal.unsynced') + '</span>') + '</b></div>';
    }).join('') : '<p class="empty">' + T('empty.wallets') + '</p>') + '</div>';
    h += '<h2>' + T('h.today') + ' <a href="#/operations">' + T('link.seeAll') + '</a></h2><div class="card">' + (today.length ? today.map(txRow).join('') : '<p class="empty">' + T('empty.today') + '</p>') + '</div>';
    h += '<h2>' + T('h.soon') + ' <a href="#/bientot">' + T('link.seeAll') + '</a></h2><div class="card">' + (soon.length ? soon.map(function (s) { return subRow(s, true); }).join('') : '<p class="empty">' + T('empty.soon14') + '</p>') + '</div>';
    if (!S.demo) {
      h += '<button class="btn ghost mt" data-act="sync"' + (S.sync ? ' disabled' : '') + '>' + T('btn.sync') + '</button>';
      if (exact) h += '<div class="alert ok">' + T('exact.okBox') + '</div>';
      else h += '<a class="btn ghost mt" href="#/exact">' + T('btn.getExact') + '</a>';
      if (!exact) h += '<details class="alert info"><summary><b>' + T('why.title') + '</b></summary>' + T('why.body') +
        (synced ? T('why.from', { list: ws.map(function (w) { var r = S.results[w.id]; return r && r.balance.restoreHeight != null ? nf(r.balance.restoreHeight) + ' (≈ ' + dmyY(Sync.dateFromHeight(r.balance.restoreHeight)) + ')' : null; }).filter(Boolean).join(', ') }) : '') + '</details>';
    }
    return h + note();
  };
  views.operations = function () {
    var all = txsAll(), today = all.filter(function (x) { return sameDay(x.ts, Date.now()); });
    var inn = today.filter(function (x) { return x.amount > 0; }).reduce(function (a, x) { return a + x.amount; }, 0);
    var out = today.filter(function (x) { return x.amount < 0; }).reduce(function (a, x) { return a + x.amount; }, 0);
    var h = header() + '<h1 class="title">' + T('h.today') + '</h1><p class="sub">' + new Date().toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>' +
      '<div class="kpis"><div class="kpi"><small>' + T('kpi.in') + '</small><b class="in">' + xmr(inn, true) + '</b></div><div class="kpi"><small>' + (allExact() ? T('kpi.out') : T('kpi.outEst')) + '</small><b>' + xmr(out, true) + '</b></div></div>' +
      '<h2>' + T('h.todayShort') + '</h2><div class="card">' + (today.length ? today.map(txRow).join('') : '<p class="empty">' + T('empty.today') + '</p>') + '</div>';
    if (!S.demo && !wallets().some(function (w) { return S.results[w.id]; })) h += '<p class="note">' + T('ops.afterSync') + '</p>';
    var prev = all.filter(function (x) { return !sameDay(x.ts, Date.now()) && x.ts > Date.now() - 7 * DAY; });
    if (prev.length) h += '<h2>' + T('h.last7') + '</h2><div class="card">' + prev.map(txRow).join('') + '</div>';
    if (allExact()) return h + '<div class="alert ok">' + T('ops.exact') + '</div>';
    return h + '<div class="alert info">' + T('ops.why') + (S.demo ? '' : T('ops.whyMore')) + '.</div>';
  };
  views.bientot = function () {
    var list = subsAll().concat(incomingAll()).filter(function (s) { return inDays(s.nextTs) <= 30; }).sort(function (a, b) { return a.nextTs - b.nextTs; });
    var sum = list.filter(function (s) { return !s.incoming; }).reduce(function (a, s) { return a + s.amount; }, 0);
    return header() + '<h1 class="title">' + T('soon.title') + '</h1><p class="sub">' + T('soon.sub') + '</p>' +
      '<div class="kpis"><div class="kpi"><small>' + T('kpi.toPlan') + '</small><b>' + xmr(-sum, true) + '</b></div><div class="kpi"><small>' + T('kpi.dues') + '</small><b>' + list.length + '</b></div></div>' +
      '<h2>' + T('h.calendar') + '</h2><div class="card">' + (list.length ? list.map(function (s) { return subRow(s, true); }).join('') : (S.demo ? '<p class="empty">' + T('soon.emptyDemo') + '</p>' : '<p class="empty">' + T('soon.empty30') + '</p>')) + '</div>' +
      '<p class="note">' + T('soon.note') + '</p>';
  };
  views.abonnements = function () {
    var list = subsAll().sort(function (a, b) { return a.nextTs - b.nextTs; });
    var monthly = list.reduce(function (a, s) { return a + (s.period === 'annuel' ? s.amount / 12 : s.period === 'hebdomadaire' ? s.amount * 52 / 12 : s.amount); }, 0);
    var h = header() + '<h1 class="title">' + T('subs.title') + '</h1><p class="sub">' + T('subs.sub') + '</p>' +
      '<div class="kpis"><div class="kpi"><small>' + T('kpi.perMonth') + '</small><b>' + xmr(-monthly, true) + '</b></div><div class="kpi"><small>' + T('kpi.perYear') + '</small><b>' + xmr(-monthly * 12, true) + '</b></div></div>' +
      '<h2>' + T('h.yourSubs') + '</h2><div class="card">' + (list.length ? list.map(function (s) { return subRow(s, false); }).join('') : '<p class="empty">' + T('empty.subs') + (S.demo ? '' : T('subs.noneDetected')) + '</p>') + '</div>';
    if (S.demo) return h + '<p class="note">' + T('subs.demoNote') + '</p>';
    return h + '<h2>' + T('h.addSub') + '</h2><form id="subf" class="card" ><div class="f mt"><label for="sl">' + T('f.name') + '</label><input id="sl" required maxlength="40" placeholder="' + T('ph.subName') + '"></div>' +
      '<div class="f"><label for="sa">' + T('f.amount') + '</label><input id="sa" required inputmode="decimal" placeholder="' + T('ph.amount') + '"></div>' +
      '<div class="f"><label for="sp">' + T('f.freq') + '</label><select id="sp">' + ['mensuel', 'annuel', 'hebdomadaire'].map(function (p) { return '<option value="' + p + '">' + T('opt.' + p) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label for="sd">' + T('f.nextDue') + '</label><input id="sd" type="date" required></div>' +
      '<div class="f"><label for="sw">' + T('f.wallet') + '</label><select id="sw">' + S.wallets.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.label) + '</option>'; }).join('') + '</select></div>' +
      '<button class="btn" ' + (S.wallets.length ? '' : 'disabled') + '>' + T('btn.saveEnc') + '</button><div class="f"></div></form>';
  };
  /* Solde exact : import des key images (fichier Feather ou monero-wallet-cli), tout reste sur l'appareil. */
  /* ---------- Onglet Prix : cours du XMR, graphique, alertes ---------- */
  var BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
  function sym(cur) { return cur === 'usd' ? '$' : '€'; }
  function ago(ts) { var s = Math.max(0, Math.round((Date.now() - ts) / 1000)), m = Math.floor(s / 60); return m ? T('ago.ms', { m: m, s: s % 60 }) : T('ago.s', { s: s }); }
  function activeAlerts() { return S.alerts.filter(function (a) { return !(a.firedAt && a.kind !== 'change'); }).length; }
  views.prix = function () {
    var P = S.prix, sn = P.snap && P.snap.cur === P.cur ? P.snap : null, up = sn && sn.change >= 0;
    var h = '<div class="pxtop"><div class="seg pxcur" role="radiogroup" aria-label="' + T('aria.currency') + '">' + ['eur', 'usd'].map(function (c) { return '<button class="' + (P.cur === c ? 'on' : '') + '" data-pcur="' + c + '" aria-checked="' + (P.cur === c) + '" role="radio">' + sym(c) + '</button>'; }).join('') + '</div>' +
      '<h1>' + T('prix.title') + '</h1><button class="bell" data-act="alerts" aria-label="' + T('aria.priceAlerts') + '">' + BELL + (activeAlerts() ? '<i>' + activeAlerts() + '</i>' : '') + '</button></div>';
    h += '<div class="pxhead"><small>Monero · XMR</small><div class="pxprice">' + (sn ? PX.fmt(sn.price, P.cur) : P.err ? '—' : '<span class="sk"></span>') + '</div>' +
      (sn ? '<div class="pxchg"><span class="chg ' + (up ? 'up' : 'down') + '">' + (up ? '↗ +' : '↘ \u2212') + pctFmt(Math.abs(sn.change), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span> ' + T('prix.h24') + '</div>' : '') + '</div>';
    h += '<div class="seg pxper" role="tablist">' + Object.keys(PX.PERIODS).map(function (k) { return '<button class="' + (P.period === k ? 'on' : '') + '" data-pper="' + k + '">' + PX.PERIODS[k].label + '</button>'; }).join('') + '</div>';
    var hist = P.hist && P.hist.cur === P.cur && P.hist.period === P.period ? P.hist : null;
    h += '<div class="pxchart">' + (hist ? PX.chartSvg(hist.points, P.period, P.cur) : P.err ? '<p class="empty">' + esc(T(P.err)) + '</p>' : '<p class="empty">' + T('prix.loading') + '</p>') + '</div>';
    if (hist) { var a = hist.points[0][1], b = hist.points[hist.points.length - 1][1], d = (b - a) / a * 100; h += '<p class="pxvar">' + T('prix.over') + '<b class="' + (d >= 0 ? 'in' : 'neg') + '">' + (d >= 0 ? '+' : '\u2212') + pctFmt(Math.abs(d), { maximumFractionDigits: 1 }) + '</b></p>'; }
    h += '<h2>' + T('h.stats') + '</h2><div class="kpis"><div class="kpi"><small>' + T('kpi.high') + '</small><b class="in">' + (sn ? PX.fmt(sn.high, P.cur) : '—') + '</b></div><div class="kpi"><small>' + T('kpi.low') + '</small><b class="neg">' + (sn ? PX.fmt(sn.low, P.cur) : '—') + '</b></div></div>';
    if (S.alerts.length) h += '<h2>' + T('h.yourAlerts') + ' <a href="#" data-act="alerts">' + T('link.manage') + '</a></h2><div class="card pxalerts">' + S.alerts.map(alertRow).join('') + '</div>';
    else h += '<button class="btn ghost mt" data-act="alerts">' + T('btn.createAlertLong') + '</button>';
    h += '<p class="pxupd" id="pupd">' + (P.at ? T('prix.updated', { ago: ago(P.at) }) : '') + '</p><p class="note">' + T('prix.source', { s: esc(PX.sourceLabel((sn && sn.source) || 'CoinGecko')) }) + (hist && hist.source !== (sn && sn.source) ? T('prix.hist', { s: esc(PX.sourceLabel(hist.source)) }) : '') + T('prix.noteTail') + '</p>';
    return h;
  };
  function alertRow(a, inSheet) {
    var fired = a.firedAt && a.kind !== 'change';
    return '<div class="row"><span class="ic c0">' + (a.kind === 'above' ? '↗' : a.kind === 'below' ? '↘' : '%') + '</span><div class="t"><div>' + esc(PX.describe(a)) + '</div><small>' +
      (fired ? T('al.firedOn', { d: dmy(a.firedAt), t: hm(a.firedAt) }) : a.firedAt ? T('al.activeLast', { d: dmy(a.firedAt), t: hm(a.firedAt) }) : T('al.active')) + '</small></div>' +
      (fired ? '<button class="pill" data-al-rearm="' + esc(a.id) + '">' + T('btn.rearm') + '</button>' : '') +
      '<button class="lockbtn" data-al-del="' + esc(a.id) + '" aria-label="' + T('aria.delAlert') + '">✕</button></div>';
  }
  async function loadPrice(force) {
    var P = S.prix, cur = P.cur, period = P.period;
    if (force) PX.clear();
    P.loading = true; P.err = null; P.tried = Date.now(); if (route() === 'prix') paintPrix();
    try {
      var r = await Promise.all([PX.snapshot(cur), PX.history(cur, period)]);
      P.snap = r[0]; P.hist = { cur: cur, period: period, points: r[1].points, source: r[1].source }; P.at = Date.now();
      await checkAlerts({ [cur]: r[0] });
    } catch (e) { P.err = 'prix.err'; } // clé de traduction : le message suit la langue
    P.loading = false; if (route() === 'prix') paintPrix();
  }
  function paintPrix() { if (S.sheet.open) return; skipScroll = true; var y = window.scrollY; render(); window.scrollTo(0, y); }
  /* Vérifie toutes les alertes (dans chaque devise utilisée) : à l'ouverture, toutes les 2 min et à chaque actualisation. */
  async function checkAlerts(snaps) {
    if (!S.alerts.length) return;
    snaps = snaps || {};
    var curs = S.alerts.map(function (a) { return a.cur; }).filter(function (c, i, l) { return l.indexOf(c) === i && !snaps[c]; });
    for (var i = 0; i < curs.length; i++) { try { snaps[curs[i]] = await PX.snapshot(curs[i]); } catch (e) {} }
    var fired = PX.check(S.alerts, snaps);
    if (!fired.length) return;
    await V.setSetting('alerts', S.alerts);
    if (S.sheet.open) { var inp = document.getElementById('alv'), keep = inp ? inp.value : ''; openSheet(); if (keep) document.getElementById('alv').value = keep; }
    else if (route() === 'prix') paintPrix();
    fired.forEach(function (f, i) { var msg = PX.message(f); setTimeout(function () { toast('🔔 ' + msg); }, i * 2800); if (!S.push.on) notify(T('notif.title'), msg, f.alert.id); });
    pushSync();
  }
  function notify(title, body, tag) {
    try {
      if (!('Notification' in self) || Notification.permission !== 'granted') return;
      var o = { body: body, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'px-' + tag, lang: I.lang() };
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, o); }).catch(function () { try { new Notification(title, o); } catch (e) {} });
      else new Notification(title, o);
    } catch (e) {}
  }
  /* ---------- Alertes envoyées même app fermée : Web Push via le Worker prelevox-push (Cloudflare, offre gratuite) ---------- */
  var PUSH = { url: 'https://prelevox-push.jhn-dlt.workers.dev', key: 'BBZLnWSAiXHCOSmeXT-ff7vgXEm-C4o43NCmToRXF-Zqp1w93rz_R9aM675M53koI_6MGOEsbUztYVr0cAGM3a8' };
  /* Ce qui est stocké sur le serveur : texte « server.txt » (js/i18n.js). */
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in self && 'Notification' in self; }
  function b64uBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function alertsForServer() { return S.alerts.map(function (a) { return { id: a.id, kind: a.kind, value: a.value, cur: a.cur, armedAt: a.armedAt || a.created || 0, firedAt: a.firedAt || 0 }; }); }
  async function pushCall(method, path, body) {
    var r = await fetch(PUSH.url + path, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    var d = {}; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error(T(r.status === 429 ? 'push.e429' : r.status === 503 ? 'push.e503' : r.status === 404 ? 'push.e404' : 'push.eHttp', { s: r.status })); err.status = r.status; throw err; } // messages du serveur : traduits côté app
    return d;
  }
  async function applyServerAlerts(list) { // l'état « déclenchée » du serveur revient dans l'app
    if (!list) return; var m = {}; list.forEach(function (a) { m[a.id] = a; });
    var changed = false; S.alerts.forEach(function (a) { var x = m[a.id]; if (x && x.firedAt && x.firedAt !== a.firedAt) { a.firedAt = x.firedAt; changed = true; } });
    if (changed) await V.setSetting('alerts', S.alerts);
  }
  async function currentSub() { var reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
  async function enablePush() { // appelé depuis un toucher (exigé par iOS)
    S.push.busy = true; S.push.err = null; if (S.sheet.open) openSheet();
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(perm === 'denied' ? T('push.denied') : T('push.notGranted'));
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription() || await Promise.race([reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(PUSH.key) }),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error(T('push.timeout'))); }, 30000); })]);
      var secret = (S.pushCfg && S.pushCfg.secret) || btoa(String.fromCharCode.apply(null, crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      var d = await pushCall('POST', '/subscribe', { subscription: sub.toJSON(), secret: secret, alerts: alertsForServer(), lang: I.lang() });
      S.pushCfg = { secret: secret, endpoint: sub.endpoint, since: Date.now() }; await V.setSetting('push', S.pushCfg); S.push.on = true;
      await applyServerAlerts(d.alerts); toast(T('toast.pushOn'));
    } catch (e) { S.push.err = e.message || T('push.failed'); }
    S.push.busy = false; if (S.sheet.open) openSheet();
  }
  async function disablePush() {
    S.push.busy = true; if (S.sheet.open) openSheet();
    try {
      var sub = await currentSub().catch(function () { return null; });
      var ep = (sub && sub.endpoint) || (S.pushCfg && S.pushCfg.endpoint);
      if (ep && S.pushCfg) await pushCall('DELETE', '/unsubscribe', { subscription: { endpoint: ep }, secret: S.pushCfg.secret }).catch(function () {});
      if (sub) await sub.unsubscribe().catch(function () {});
      S.pushCfg = null; S.push.on = false; await V.setSetting('push', null); toast(T('toast.pushOff'));
    } catch (e) { S.push.err = e.message; }
    S.push.busy = false; if (S.sheet.open) openSheet(); else if (route() === 'reglages') { skipScroll = true; render(); }
  }
  async function pushSync() { // à chaque changement d'alerte et au lancement
    if (!S.push.on || !S.pushCfg || !pushSupported()) return;
    try {
      var sub = await currentSub();
      if (!sub) { S.push.on = false; S.pushCfg = null; await V.setSetting('push', null); S.push.err = T('push.removed'); return; }
      var body = { subscription: sub.toJSON(), secret: S.pushCfg.secret, alerts: alertsForServer(), lang: I.lang() }, d; // la langue des notifications suit celle de l'app
      try { d = await pushCall('POST', '/alerts', body); }
      catch (e) { if (e.status === 404) d = await pushCall('POST', '/subscribe', body); else throw e; }
      if (sub.endpoint !== S.pushCfg.endpoint) { S.pushCfg.endpoint = sub.endpoint; await V.setSetting('push', S.pushCfg); }
      S.push.err = null; await applyServerAlerts(d.alerts);
    } catch (e) { S.push.err = T('push.unreach', { e: e.message || T('push.errWord') }); }
  }
  async function applyFired() { // alertes déclenchées par le serveur, notées par le service worker
    try {
      if (!self.caches) return;
      var c = await caches.open('prelevox-fired'), r = await c.match('./fired'); if (!r) return;
      var list = await r.json(), changed = false;
      list.forEach(function (f) { S.alerts.forEach(function (a) { if (a.id === f.id && f.at > (a.armedAt || a.created || 0) && f.at > (a.firedAt || 0)) { a.firedAt = f.at; changed = true; } }); });
      await c.delete('./fired');
      if (changed) { await V.setSetting('alerts', S.alerts); if (S.sheet.open) openSheet(); else if (route() === 'prix') paintPrix(); }
    } catch (e) {}
  }
  function pushBlock() {
    if (S.push.on) return '<div class="alert ok mt pushst"><b>' + T('push.onTitle') + '</b><br>' + T('push.onBody') +
      (S.push.err ? '<br><span class="warnline">' + esc(S.push.err) + '</span>' : '') +
      '<details class="mt"><summary>' + T('push.stored') + '</summary><p class="small">' + esc(T('server.txt')) + '</p></details>' +
      '<div class="alert-acts"><button class="pill" data-act="push-off"' + (S.push.busy ? ' disabled' : '') + '>' + T('btn.turnOff') + '</button></div></div>';
    var ns = notifState();
    if (ns.s === 'na' || !pushSupported()) return '<div class="alert info mt"><b>' + T('push.notifs') + '</b><br>' + esc(ns.t) + '</div>';
    if (ns.s === 'no') return '<div class="alert info mt"><b>' + T('push.notifs') + '</b><br>' + esc(ns.t) + '</div>';
    return '<div class="alert info mt pushst"><b>' + T('push.notifs') + '</b><br>' + T('push.offer') +
      (S.push.err ? '<br><span class="warnline">' + esc(S.push.err) + '</span>' : '') +
      '<details class="mt"><summary>' + T('push.willStore') + '</summary><p class="small">' + esc(T('server.txt')) + '</p></details>' +
      '<div class="alert-acts"><button class="pill on" data-act="notif"' + (S.push.busy ? ' disabled' : '') + '>' + (S.push.busy ? T('push.enabling') : T('push.enable')) + '</button></div></div>';
  }
  function notifState() {
    if (!('Notification' in self)) return { s: 'na', t: navigator.standalone === false || /iPhone|iPad/.test(navigator.userAgent) ? T('ns.ios') : T('ns.na') };
    if (Notification.permission === 'granted') return { s: 'ok', t: T('ns.ok') };
    if (Notification.permission === 'denied') return { s: 'no', t: T('push.denied') };
    return { s: 'ask', t: T('ns.ask') };
  }
  function sheetHtml() {
    var k = S.sheet.kind, cur = S.sheet.cur || S.prix.cur, ns = notifState(), sn = S.prix.snap;
    return '<div class="sheet-bg" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shtt"><div class="grab"></div>' +
      '<div class="sheet-h"><b id="shtt">' + T('sheet.title') + '</b><button class="lockbtn xbtn" data-act="close-sheet" aria-label="' + T('aria.close') + '">✕</button></div>' +
      '<form id="alf"><div class="seg" role="radiogroup">' + [['above', T('al.above')], ['below', T('al.below')], ['change', T('al.change')]].map(function (x) { return '<button type="button" class="' + (k === x[0] ? 'on' : '') + '" data-alk="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="f mt"><label for="alv">' + (k === 'change' ? T('al.changeLabel') : T('al.priceLabel')) + '</label><div class="alin"><input id="alv" inputmode="decimal" autocomplete="off" required placeholder="' + (k === 'change' ? '5' : sn ? Math.round(sn.price * (k === 'above' ? 1.05 : 0.95)) : '600') + '">' +
      (k === 'change' ? '<span class="unit">%</span>' : '<div class="seg alcur">' + ['eur', 'usd'].map(function (c) { return '<button type="button" class="' + (cur === c ? 'on' : '') + '" data-alc="' + c + '">' + sym(c) + '</button>'; }).join('') + '</div>') + '</div>' +
      '<div class="msg">' + (k === 'change' ? T('al.changeHint') : sn && sn.cur === cur ? T('al.current', { p: PX.fmt(sn.price, cur) }) : '') + '</div></div>' +
      '<button class="btn">' + T('btn.createAlert') + '</button></form>' +
      (S.alerts.length ? '<h2>' + T('h.yourAlerts') + '</h2><div class="card">' + S.alerts.map(function (a) { return alertRow(a, true); }).join('') + '</div>' : '') +
      pushBlock() +
      '<p class="small sheet-note">' + (S.push.on ? T('sheet.noteOn') : T('sheet.noteOff')) + '</p></div>';
  }
  function openSheet() {
    S.sheet.open = true; S.sheet.cur = S.sheet.cur || S.prix.cur;
    var w = document.getElementById('sheet'); if (!w) { w = document.createElement('div'); w.id = 'sheet'; w.className = 'sheet-wrap'; document.body.appendChild(w); }
    w.innerHTML = sheetHtml(); document.documentElement.classList.add('sheet-open');
    requestAnimationFrame(function () { w.classList.add('show'); });
    bindSheet();
  }
  function closeSheet() {
    S.sheet.open = false; var w = document.getElementById('sheet'); document.documentElement.classList.remove('sheet-open');
    if (w) { w.classList.remove('show'); setTimeout(function () { if (!S.sheet.open) w.remove(); }, 260); }
    if (route() === 'prix') paintPrix();
  }
  function bindSheet() {
    var f = document.getElementById('alf'); if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var v = parseFloat(String(document.getElementById('alv').value).replace(/\s/g, '').replace(',', '.'));
      if (!(v > 0) || (S.sheet.kind === 'change' && v > 100)) return toast(S.sheet.kind === 'change' ? T('toast.pct') : T('toast.price'));
      S.alerts.push({ id: 'a' + uid().slice(1, 9), kind: S.sheet.kind, value: v, cur: S.sheet.kind === 'change' ? S.prix.cur : (S.sheet.cur || S.prix.cur), created: Date.now(), armedAt: Date.now(), firedAt: 0 });
      await V.setSetting('alerts', S.alerts); toast(T('toast.alCreated', { d: PX.describe(S.alerts[S.alerts.length - 1]) }));
      openSheet(); await checkAlerts(S.prix.snap ? { [S.prix.snap.cur]: S.prix.snap } : null); pushSync();
    });
  }
  views.exact = function () {

    var tab = S.kiTab || 'feather';
    var h = '<a class="back" href="#/soldes">' + T('back') + '</a><h1 class="title">' + T('exact.title') + '</h1>' +
      '<p class="sub">' + T('exact.sub') + '</p>' +
      '<div class="alert ok">' + T('exact.safe') + '</div>' +
      '<div class="seg" role="tablist"><button class="' + (tab === 'feather' ? 'on' : '') + '" data-kitab="feather">Feather Wallet</button><button class="' + (tab === 'cli' ? 'on' : '') + '" data-kitab="cli">monero-wallet-cli</button></div>';
    if (tab === 'feather') h += '<ol class="steps">' + ['exact.f1', 'exact.f2', 'exact.f3', 'exact.f4'].map(function (k) { return '<li>' + T(k) + '</li>'; }).join('') + '</ol>';
    else h += '<ol class="steps">' + ['exact.c1', 'exact.c2', 'exact.c3'].map(function (k) { return '<li>' + T(k) + '</li>'; }).join('') + '</ol>' +
      '<p class="small">' + T('exact.cNote') + '</p>';
    h += '<h2>' + T('h.yourWallets') + '</h2>';
    if (S.demo) h += '<div class="card"><p class="empty">' + T('exact.demo') + '</p></div>';
    else if (!S.wallets.length) h += '<div class="card"><p class="empty">' + T('exact.addFirst') + '</p></div>';
    (S.demo ? [] : S.wallets).forEach(function (w) {
      var r = S.results[w.id], k = S.kis[w.id], info = r && r.balance.keyImages;
      var st = !r ? T('ki.notSynced') :
        info && info.error ? '⚠ ' + info.error :
        r.balance.exact ? Tn('ki.exactAt', k ? k.count : info.count, { d: dmyY(r.balance.syncedAt) }) :
        info && info.applied && info.missing > 0 ? Tn('ki.missingShort', info.missing) :
        k ? T('ki.importedOn', { d: dmyY(k.importedAt) }) : T('ki.none');
      h += '<div class="card kicard"><div class="row"><span class="ic c0">' + (r && r.balance.exact ? '✓' : '◎') + '</span><div class="t"><div>' + esc(w.label) + '</div><small>' + esc(st) + '</small></div></div>' +
        '<div class="kiacts">' + (tab === 'feather' ? '<button class="btn ghost" data-ki-out="' + esc(w.id) + '"' + (r && !S.sync ? '' : ' disabled') + '>' + T('btn.exportOut') + '</button>' : '') +
        '<label class="btn' + (r ? '' : ' off') + '" for="kif-' + esc(w.id) + '">' + T('btn.importKi') + '</label><input class="hidden" type="file" id="kif-' + esc(w.id) + '" data-ki-in="' + esc(w.id) + '"' + (r ? '' : ' disabled') + '>' +
        (k ? '<button class="linkbtn" data-ki-del="' + esc(w.id) + '">' + T('btn.removeKi') + '</button>' : '') + '</div></div>';
    });
    h += '<div class="alert info">' + T('exact.privacy') + '</div>' +
      '<div class="alert info">' + T('exact.next') + '</div>';
    return h + note();
  };
  views.ajouter = function () {
    var needPass = !S.vaultExists;
    return '<a class="back" href="#/' + (S.demo || V.isOpen() ? 'soldes' : 'bienvenue') + '">' + T('back') + '</a><h1 class="title">' + T('add.title') + '</h1>' +
      '<p class="sub">' + T('add.sub') + '</p>' +
      '<div class="alert warn">' + T('add.warn') + '</div>' +
      '<form id="addf" autocomplete="off">' +
      '<div class="f"><label for="wl">' + T('add.name') + '</label><input id="wl" maxlength="32" placeholder="' + T('ph.wname') + '" required></div>' +
      '<div class="f" id="fa"><label for="wa">' + T('add.addr') + '</label><textarea id="wa" rows="3" spellcheck="false" autocapitalize="off" placeholder="4…"></textarea><div class="msg">' + T('add.addrHint') + '</div></div>' +
      '<div class="f" id="fk"><label for="wk">' + T('add.vk') + '</label><textarea id="wk" rows="2" spellcheck="false" autocapitalize="off" placeholder="' + T('ph.vk') + '"></textarea><div class="msg">' + T('add.vkHint') + '</div></div>' +
      '<div class="alert stop hidden" id="stop"></div>' +
      '<div class="f" id="fd"><label for="wd">' + T('add.date') + '</label><input id="wd" type="date" min="2014-04-18" max="' + new Date().toISOString().slice(0, 10) + '"><div class="msg" id="wdm"></div></div>' +
      '<details class="adv"><summary>' + T('add.knowHeight') + '</summary><div class="f mt"><label for="wh">' + T('add.height') + '</label><input id="wh" inputmode="numeric" placeholder="' + T('ph.height') + '"><div class="msg">' + T('add.heightHint') + '</div></div></details>' +
      '<div class="f"><label for="wapp">' + T('add.app') + '</label><select id="wapp"><option>Feather</option><option>Cake Wallet</option><option>Monero GUI</option><option>Monerujo</option><option>Stack Wallet</option><option value="Autre">' + T('opt.other') + '</option></select></div>' +
      (needPass ? '<h2>' + T('add.protect') + '</h2><div class="f"><label for="p1">' + T('add.p1') + '</label><input id="p1" type="password" autocomplete="new-password"></div>' +
        '<div class="f" id="fp"><label for="p2">' + T('add.p2') + '</label><input id="p2" type="password" autocomplete="new-password"><div class="msg">' + T('add.p2Hint') + '</div></div>' : '') +
      '<button class="btn" id="addb" disabled>' + T('btn.addRo') + '</button></form>' +
      '<p class="note">' + T('key') + '</p>';
  };
  /* Icônes au trait (22 px, couleur du texte) pour les listes Réglages / Infos */
  var LI = (function () {
    var P = {
      palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/><path d="M12 21a3 3 0 0 1 0-6h2a3 3 0 0 0 3-3"/>',
      flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
      wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2M6 6l9-3 2 3"/>',
      key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
      coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/>',
      bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
      refresh: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
      eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
      cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
      chart: '<path d="M3 17l5-5 4 3 8-8M15 7h5v5"/>',
      lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
      server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
      hand: '<path d="M12 2v6M5 12h14M12 16v6"/><circle cx="12" cy="12" r="9"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
      plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
      pull: '<path d="M12 4v13M7 12l5 5 5-5M5 21h14"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
    };
    var o = {}; Object.keys(P).forEach(function (k) { o[k] = '<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">' + P[k] + '</svg></span>'; });
    return o;
  })();
  function irow(icon, title, desc, href) { // ligne d'information : icône, titre, description ; chevron si cliquable
    var inner = icon + '<div class="t"><div>' + title + '</div><small>' + desc + '</small></div>';
    return href ? '<a class="row go" href="' + href + '">' + inner + '</a>' : '<div class="row">' + inner + '</div>';
  }
  function cyHead(tab) {
    return '<div class="cyhead"><h1>prelevox</h1><p>' + T('cy.sub') + '</p></div>' +
      '<div class="seg regseg" role="tablist">' + [['reglages', T('cy.settings')], ['infos', T('cy.infos')]].map(function (x) { return '<button role="tab" aria-selected="' + (tab === x[0]) + '" class="' + (tab === x[0] ? 'on' : '') + '" data-regtab="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  }
  function serverTxtInline() { var s = T('server.txt'); return esc(s.charAt(0).toLowerCase() + s.slice(1)); }
  views.infos = function () {
    var open = !S.demo && V.isOpen();
    var h = cyHead('infos');
    h += '<h2>' + T('h.howto') + '</h2><div class="card">' +
      irow(LI.plus, T('i.add.t'), T('i.add.d'), S.demo ? '' : '#/ajouter') +
      irow(LI.pull, T('i.pull.t'), T('i.pull.d')) +
      irow(LI.key, T('i.exact.t'), T('i.exact.d'), open ? '#/exact' : '') +
      irow(LI.bell, T('i.alerts.t'), T('i.alerts.d'), '#/prix') + '</div>';
    h += '<h2>' + T('h.features') + '</h2><div class="card">' +
      irow(LI.list, T('i.ops.t'), T('i.ops.d'), '#/operations') +
      irow(LI.cal, T('i.soon.t'), T('soon.sub'), '#/bientot') +
      irow(LI.refresh, T('i.subs.t'), T('subs.sub'), '#/abonnements') +
      irow(LI.chart, T('i.price.t'), T('i.price.d'), '#/prix') + '</div>';
    h += '<h2>' + T('h.privacy') + '</h2><div class="card">' +
      irow(LI.hand, T('i.nospend.t'), T('i.nospend.d')) +
      irow(LI.shield, T('i.enc.t'), T('i.enc.d')) +
      irow(LI.server, T('i.node.t'), T('i.node.d')) +
      irow(LI.bell, T('i.srv.t'), T('i.srv.d', { txt: serverTxtInline() })) + '</div>';
    h += '<h2>' + T('h.symbols') + '</h2><div class="card">' +
      irow('<span class="ic">↓</span>', T('sym.in.t'), T('sym.in.d')) +
      irow('<span class="ic">↑</span>', T('sym.out.t'), T('sym.out.d')) +
      irow('<span class="ic">≈</span>', T('sym.est.t'), T('sym.est.d')) +
      irow('<span class="ic">⧗</span>', T('sym.pend.t'), T('sym.pend.d')) +
      irow(LI.lock, T('sym.lock.t'), T('sym.lock.d')) + '</div>';
    h += '<h2>' + T('h.about') + '</h2><div class="card">' + irow(LI.info, 'Prelevox', T('about.infos')) + '</div>';
    return h + note();
  };
  views.reglages = function () {
    var p = S.settings;
    if (S.regTab === 'infos') return views.infos();
    var h = cyHead('reglages');
    var ui = self.PxTheme ? PxTheme.get() : 'classique', lp = I.pref();
    h += '<h2>' + T('h.appearance') + '</h2><div class="card"><div class="row">' + LI.palette + '<div class="t"><div>' + T('set.theme') + '</div><small>' + T('set.themeD') + '</small></div></div>' +
      '<div class="opts" role="radiogroup" aria-label="' + T('aria.appearance') + '">' + ['matrix', 'classique'].map(function (x) { return '<button class="opt' + (ui === x ? ' on' : '') + '" role="radio" aria-checked="' + (ui === x) + '" data-ui="' + x + '">' + T('theme.' + x) + '</button>'; }).join('') + '</div>' +
      '<div class="row" id="langrow">' + LI.globe + '<div class="t"><div>' + T('set.lang') + '</div><small>' + T('set.langD', { cur: T('langName.' + I.detect()) }) + '</small></div></div>' +
      '<div class="opts" role="radiogroup" aria-label="' + T('aria.language') + '">' + I.PREFS.map(function (x) { return '<button class="opt' + (lp === x ? ' on' : '') + '" role="radio" aria-checked="' + (lp === x) + '" data-lang="' + x + '"' + (x === 'auto' ? '' : ' lang="' + x + '"') + '>' + T('lang.' + x) + '</button>'; }).join('') + '</div></div>';
    h += '<h2>' + T('h.mode') + '</h2><div class="card"><div class="row">' + LI.flask + '<div class="t"><div>' + T('set.demo') + '</div><small>' + T('set.demoD') + '</small></div><button class="pill' + (S.demo ? ' on' : '') + '" data-act="' + (S.demo ? 'quit-demo' : 'demo') + '">' + (S.demo ? T('on') : T('off')) + '</button></div></div>';
    if (!S.demo && V.isOpen()) {
      h += '<h2>' + T('h.wallets') + '</h2><div class="card">' + (S.wallets.map(function (w) { return '<div class="row">' + LI.wallet + '<div class="t"><div>' + esc(w.label) + '</div><small><span class="addr mono">' + esc(K.short(w.address)) + '</span>' + T('set.vkEnc') + '</small></div><button class="lockbtn" data-del-w="' + esc(w.id) + '" aria-label="' + T('aria.remove') + '">✕</button></div>'; }).join('') || '<p class="empty">' + T('empty.none') + '</p>') + '</div><a class="btn ghost mt" href="#/ajouter">' + T('btn.addWallet') + '</a>';
      var custom = p.node && p.node !== 'auto' && Sync.NODES.indexOf(p.node) < 0;
      h += '<h2>' + T('h.sync') + '</h2><form id="setf" class="card"><div class="f mt"><label for="pv">' + T('f.source') + '</label><select id="pv">' + Object.keys(Sync.providers).filter(function (k) { return k !== 'demo'; }).map(function (k) { return '<option value="' + k + '"' + (p.provider === k ? ' selected' : '') + '>' + esc(Sync.providers[k].label) + '</option>'; }).join('') + '</select><div class="msg">' + esc(Sync.get(p.provider).description) + '</div></div>';
      if (p.provider !== 'lws') {
        h += '<div class="f"><label for="nd">' + T('f.node') + '</label><select id="nd"><option value="auto"' + (!p.node || p.node === 'auto' ? ' selected' : '') + '>' + T('opt.autoNode') + '</option>' +
          Sync.NODES.map(function (u) { return '<option value="' + esc(u) + '"' + (p.node === u ? ' selected' : '') + '>' + esc(hostOf(u)) + '</option>'; }).join('') +
          '<option value="custom"' + (custom ? ' selected' : '') + '>' + T('opt.customNode') + '</option></select></div>' +
          '<div class="f' + (custom ? '' : ' hidden') + '" id="fcn"><label for="cn">' + T('f.nodeUrl') + '</label><input id="cn" inputmode="url" autocapitalize="off" spellcheck="false" value="' + esc(custom ? p.node : p.customNode || '') + '" placeholder="' + T('ph.node') + '"><div class="msg">' + T('node.cors', { flag: '<span class="mono">--rpc-access-control-origins=' + esc(location.origin) + '</span>' }) + '</div></div>' +
          '<button type="button" class="btn ghost" data-act="test-node">' + T('btn.testNode') + '</button><div class="msg node-test" id="ntm">' + (S.nodeTest ? esc(S.nodeTest) : '') + '</div>' +
          '<div class="alert info">' + T('node.privacy') + '</div>';
      } else {
        h += '<div class="f"><label for="lu">' + T('f.lws') + '</label><input id="lu" inputmode="url" autocapitalize="off" value="' + esc(p.lwsUrl) + '" placeholder="' + T('ph.lws') + '"></div>' +
          '<div class="alert warn">' + T('lws.warn') + '</div>';
      }
      h += '<button class="btn">' + T('btn.save') + '</button><div class="f"></div></form>';
      h += '<h2>' + T('h.exact') + '</h2><div class="card"><div class="row">' + LI.key + '<div class="t"><div>Key images</div><small>' + Tn('set.kiCount', S.wallets.length, { k: S.wallets.filter(function (w) { return S.kis[w.id]; }).length }) + '</small></div><a class="pill" href="#/exact">' + T('btn.manage') + '</a></div></div>';
      h += '<h2>' + T('h.xmrPrice') + '</h2><div class="card"><div class="row">' + LI.coins + '<div class="t"><div>' + T('set.cur') + '</div><small>' + T('set.curD') + '</small></div></div><div class="opts">' + ['eur', 'usd'].map(function (c) { return '<button class="opt' + (S.prix.cur === c ? ' on' : '') + '" data-pcur="' + c + '">' + T('cur.' + c) + '</button>'; }).join('') + '</div></div>';
      h += '<h2>' + T('h.priceAlerts') + '</h2><div class="card"><div class="row">' + LI.bell + '<div class="t"><div>' + (S.push.on ? T('set.pushOn') : T('set.pushOff')) + '</div><small>' + (S.push.on ? T('set.pushOnD') : T('set.pushOffD')) + '</small></div>' + (S.push.on ? '<button class="pill" data-act="push-off">' + T('btn.turnOff') + '</button>' : '') + '</div><p class="small pad">' + T('set.stored', { txt: serverTxtInline() }) + '</p></div>';
      h += '<h2>' + T('h.fiat') + '</h2><div class="card"><div class="row">' + LI.euro + '<div class="t"><div>' + T('set.showEur') + '</div><small>' + T('set.showEurD') + '</small></div><button class="pill' + (p.price ? ' on' : '') + '" data-act="toggle-price">' + (p.price ? T('on') : T('off')) + '</button></div></div>';
      h += '<h2>' + T('h.syncData') + '</h2><div class="card">' + S.wallets.map(function (w) {
        var r = S.results[w.id];
        return '<div class="row">' + LI.refresh + '<div class="t"><div>' + esc(w.label) + '</div><small>' + T('set.since', { h: nf(w.restoreHeight || 0), d: new Date(Sync.dateFromHeight(w.restoreHeight || 0)).toLocaleDateString(loc(), { month: 'short', year: 'numeric' }) }) + (r ? T('set.readTo', { h: nf(r.balance.height) }) : '') + '</small></div><button class="pill" data-rescan="' + esc(w.id) + '">' + T('btn.rescan') + '</button></div>';
      }).join('') + '</div>';
      h += '<h2>' + T('h.security') + '</h2><button class="btn ghost" data-act="lock">' + T('btn.lockNow') + '</button>';
    }
    if (S.vaultExists) h += '<button class="btn danger mt" data-act="wipe">' + T('btn.wipe') + '</button>';
    return h + '<h2>' + T('h.about') + '</h2><div class="card">' + irow(LI.info, 'Prelevox', T('about.reg')) + '</div>' + note();
  };

  /* ---------- Formulaire d'ajout : validation en direct ---------- */
  function bindAdd() {
    var a = document.getElementById('wa'), k = document.getElementById('wk'), b = document.getElementById('addb'), stop = document.getElementById('stop');
    var p1 = document.getElementById('p1'), p2 = document.getElementById('p2'), parsed = null, keyRes = null;
    function setF(id, state, msg) { var f = document.getElementById(id); if (!f) return; f.classList.remove('ok', 'bad'); if (state) f.classList.add(state); if (msg != null) f.querySelector('.msg').textContent = msg; }
    function check() {
      var av = a.value.replace(/\s+/g, ''), kv = k.value.trim();
      parsed = av ? K.parseAddress(av) : null;
      if (!parsed) setF('fa', null);
      else if (!parsed.ok) setF('fa', 'bad', parsed.error);
      else setF('fa', parsed.network === 'mainnet' ? 'ok' : 'bad', parsed.network !== 'mainnet' ? T('add.netBad', { net: parsed.network }) : parsed.type === 'subaddress' ? T('add.subOk') : T('add.addrOk', { type: parsed.type === 'integrated' ? T('addr.integrated') : T('addr.primary') }));
      keyRes = null; stop.classList.add('hidden');
      if (kv) {
        keyRes = K.checkKey(parsed, kv);
        if (keyRes.kind === 'spend' || keyRes.kind === 'seed') {
          k.value = ''; setF('fk', 'bad', T('add.cleared'));
          stop.innerHTML = '⛔ <b>' + (keyRes.kind === 'spend' ? T('add.spendDet') : T('add.seedDet')) + '.</b> ' + esc(keyRes.error);
          stop.classList.remove('hidden');
        } else setF('fk', keyRes.ok ? 'ok' : 'bad', keyRes.ok ? T('add.vkOk') : keyRes.error);
      } else setF('fk', null);
      var passOk = true;
      if (p1) { passOk = p1.value.length >= 8 && p1.value === p2.value; if (p2.value) setF('fp', passOk ? 'ok' : 'bad', passOk ? T('add.passOk') : p1.value.length < 8 ? T('add.pass8') : T('add.passNo')); }
      b.disabled = !(parsed && parsed.ok && parsed.network === 'mainnet' && keyRes && keyRes.ok && passOk && document.getElementById('wl').value.trim());
    }
    var wd = document.getElementById('wd'), wh = document.getElementById('wh'), wdm = document.getElementById('wdm');
    function restoreInfo() {
      var hv = parseInt((wh.value || '').replace(/\D/g, ''), 10);
      if (hv > 0) return { height: hv, src: 'height' };
      if (wd.value) { var ts = new Date(wd.value + 'T00:00').getTime(); if (ts > 0) return { height: Sync.restoreHeightForDate(ts), src: 'date' }; }
      return { height: Sync.restoreHeightForDate(Date.now() - 30 * DAY), src: 'default' };
    }
    function showRestore() {
      var r = restoreInfo(), tip = Sync.heightFromDate(Date.now()), blocks = Math.max(0, tip - r.height);
      var from = new Date(Sync.dateFromHeight(r.height)).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' });
      wdm.textContent = (r.src === 'default' ? T('add.restoreDefault', { d: from }) :
        T('add.restoreFrom', { h: nf(r.height), d: from, margin: r.src === 'date' ? T('add.margin') : '' })) + T('add.blocks', { n: nf(blocks) }) + (blocks > 200000 ? T('add.long') : '.');
    }
    wd.addEventListener('input', showRestore); wh.addEventListener('input', showRestore); showRestore();
    ['wa', 'wk', 'wl', 'p1', 'p2'].forEach(function (id) { var e = document.getElementById(id); if (e) e.addEventListener('input', check); });
    document.getElementById('addf').addEventListener('submit', async function (ev) {
      ev.preventDefault(); check(); if (b.disabled) return;
      b.disabled = true; b.textContent = T('add.encrypting');
      try {
        if (!S.vaultExists) { await V.create(p1.value); S.vaultExists = true; }
        var ri = restoreInfo();
        var w = { label: document.getElementById('wl').value.trim(), address: parsed.address, viewKey: k.value.trim().toLowerCase(),
          restoreHeight: ri.height, restoreSource: ri.src, app: document.getElementById('wapp').value, added: Date.now() };
        await V.save('wallet', uid(), w);
        k.value = ''; S.demo = false; await V.setSetting('demo', false);
        await loadReal(); toast(T('toast.added')); location.hash = '#/soldes';
        setTimeout(function () { syncAll(); refreshPrice(); }, 50);
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = T('btn.addRo'); }
    });
  }

  /* ---------- Rendu & navigation ---------- */
  var TABS = ['soldes', 'prix', 'operations', 'bientot', 'abonnements', 'reglages'];
  function route() {
    var r = (location.hash.replace(/^#\/?/, '') || 'soldes').split('?')[0];
    if (!views[r]) r = 'soldes';
    if (!S.demo) {
      if (r === 'prix') return r; // cours public : accessible sans coffre
      if (!S.vaultExists && r !== 'ajouter' && r !== 'reglages') r = 'bienvenue';
      else if (S.vaultExists && !V.isOpen()) r = 'deverrouiller';
    } else if (r === 'bienvenue' || r === 'deverrouiller') r = 'soldes';
    return r;
  }
  var skipScroll = false;
  function render() {
    var r = route();
    $app.innerHTML = views[r]();
    $tab.hidden = TABS.indexOf(r) < 0;
    $tab.querySelectorAll('a').forEach(function (a) { a.classList.toggle('on', a.dataset.tab === r); });
    if (r === 'ajouter') bindAdd();
    if (r === 'deverrouiller') bindUnlock();
    if (r === 'abonnements') bindSub();
    if (r === 'reglages') bindSettings();
    if (r === 'soldes') bindChart();
    if (r === 'exact') bindExact();
    if (r === 'prix') { tickUpdated(); if (!S.prix.snap && !S.prix.loading && Date.now() - (S.prix.tried || 0) > 30000) loadPrice(false); } // pas de boucle si les deux sources sont injoignables
    applyBars();
    if (!skipScroll) window.scrollTo(0, 0);
    skipScroll = false;
  }
  function bindChart() {
    if (!Chart) return;
    Chart.bind(historyPoints, function (period) {
      S.chartPeriod = period;
      var y = window.scrollY;
      skipScroll = true;
      render();
      window.scrollTo(0, y);
    });
  }
  function download(bytes, name) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function bindExact() {
    document.querySelectorAll('input[data-ki-in]').forEach(function (inp) {
      inp.addEventListener('change', async function () {
        var f = inp.files && inp.files[0], id = inp.dataset.kiIn; inp.value = ''; if (!f) return;
        var w = S.wallets.find(function (x) { return x.id === id; }); if (!w) return;
        if (f.size > 20 * 1024 * 1024) return toast(T('toast.kiBig'));
        toast(T('toast.reading'));
        try {
          var p = K.parseAddress(w.address);
          var parsed = await KI.parse(new Uint8Array(await f.arrayBuffer()), w.viewKey, { spend: p.publicSpend, view: p.publicView });
          var prev = await V.load('ki', 'ki-' + id);
          var merged = KI.merge(prev, parsed);
          if (merged.offset > 0 && !prev) toast(T('toast.partial'));
          var rec = { format: merged.format, offset: merged.offset, items: merged.items, count: merged.items.length, importedAt: Date.now(), exportedAt: f.lastModified || Date.now(), fileName: String(f.name || '').slice(0, 80) };
          await V.save('ki', 'ki-' + id, rec);
          S.kis[id] = { count: rec.count, importedAt: rec.importedAt, exportedAt: rec.exportedAt, format: rec.format, fileName: rec.fileName };
          parsed = merged = rec = prev = null;
          toast(S.kis[id].count ? Tn('toast.kiImported', S.kis[id].count) : T('toast.kiEmpty'));
          if (S.results[id] && S.results[id].balance) S.results[id].balance.keyImages = null;
          location.hash = '#/soldes'; S.errors = {}; setTimeout(function () { syncAll(id); }, 50);
        } catch (e) { toast(e.message || String(e)); }
      });
    });
  }
  function bindUnlock() {
    document.getElementById('unlock').addEventListener('submit', async function (e) {
      e.preventDefault();
      try { await V.unlock(document.getElementById('pw').value); await loadReal(); render(); setTimeout(function () { syncAll(); refreshPrice(); }, 50); }
      catch (err) { document.getElementById('um').textContent = err.message; }
    });
  }
  function bindSub() {
    var f = document.getElementById('subf'); if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var amt = parseFloat(document.getElementById('sa').value.replace(',', '.'));
      if (!(amt > 0)) return toast(T('toast.badAmount'));
      await V.save('sub', 's' + uid(), { label: document.getElementById('sl').value.trim(), amount: amt, period: document.getElementById('sp').value,
        nextTs: new Date(document.getElementById('sd').value + 'T09:00').getTime(), walletId: document.getElementById('sw').value, source: 'manuel' });
      S.subs = await V.list('sub'); toast(T('toast.subSaved')); render();
    });
  }
  function readNodeChoice() {
    var nd = document.getElementById('nd'); if (!nd) return S.settings.node;
    if (nd.value === 'custom') return (document.getElementById('cn').value || '').trim();
    return nd.value;
  }
  function bindSettings() {
    var f = document.getElementById('setf'); if (!f) return;
    document.getElementById('pv').addEventListener('change', function () { S.settings.provider = this.value; skipScroll = true; render(); });
    var nd = document.getElementById('nd');
    if (nd) nd.addEventListener('change', function () { document.getElementById('fcn').classList.toggle('hidden', nd.value !== 'custom'); S.nodeTest = null; document.getElementById('ntm').textContent = ''; });
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var node = readNodeChoice();
      if (node !== 'auto') { try { node = Sync.checkNodeUrl(node); } catch (err) { document.getElementById('ntm').textContent = err.message; return; } }
      S.settings = Object.assign({}, S.settings, { provider: document.getElementById('pv').value, node: node || 'auto',
        customNode: nd && nd.value === 'custom' ? node : S.settings.customNode, lwsUrl: document.getElementById('lu') ? document.getElementById('lu').value.trim() : S.settings.lwsUrl });
      await V.setSetting('sync', S.settings); toast(T('toast.settingsSaved'));
    });
  }
  async function testNodeUi() {
    var m = document.getElementById('ntm'), node = readNodeChoice();
    m.className = 'msg node-test'; m.textContent = T('node.testing');
    try {
      if (node === 'auto') {
        var ok = 0, res = await Promise.all(Sync.NODES.map(function (u) { return Sync.testNode(u, 8000).then(function () { ok++; return true; }, function () { return false; }); }));
        S.nodeTest = Tn('node.auto', ok, { ok: ok, n: res.length });
        m.classList.add(ok ? 'ok' : 'bad');
      } else {
        var r = await Sync.testNode(node);
        S.nodeTest = T('node.ok', { h: hostOf(r.url), b: nf(r.height), full: r.restricted ? '' : T('node.full') });
        m.classList.add('ok');
      }
    } catch (err) { S.nodeTest = err.message; m.classList.add('bad'); }
    m.textContent = S.nodeTest;
  }
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-act],[data-del-w],[data-del-sub],[data-rescan],[data-kitab],[data-ki-out],[data-ki-del],button[data-ui],button[data-lang],[data-pcur],[data-pper],[data-alk],[data-alc],[data-al-del],[data-al-rearm],[data-regtab]'); if (!t) return;
    if (t.dataset.regtab) { S.regTab = t.dataset.regtab; render(); return; }
    if (t.dataset.pcur) { S.prix.cur = t.dataset.pcur; S.sheet.cur = null; await V.setSetting('priceCur', S.prix.cur); if (route() === 'prix') { paintPrix(); loadPrice(false); } else { skipScroll = true; render(); } return; }
    if (t.dataset.pper) { S.prix.period = t.dataset.pper; paintPrix(); loadPrice(false); return; }
    if (t.dataset.alk) { S.sheet.kind = t.dataset.alk; openSheet(); return; }
    if (t.dataset.alc) { S.sheet.cur = t.dataset.alc; openSheet(); return; }
    if (t.dataset.alDel) { S.alerts = S.alerts.filter(function (a) { return a.id !== t.dataset.alDel; }); await V.setSetting('alerts', S.alerts); pushSync(); toast(T('toast.alDeleted')); if (S.sheet.open) openSheet(); else paintPrix(); return; }
    if (t.dataset.alRearm) { S.alerts.forEach(function (a) { if (a.id === t.dataset.alRearm) { a.firedAt = 0; a.armedAt = Date.now(); } }); await V.setSetting('alerts', S.alerts); pushSync(); toast(T('toast.alRearmed')); if (S.sheet.open) openSheet(); else paintPrix(); return; }
    if (t.dataset.ui && t.tagName === 'BUTTON') { if (self.PxTheme) PxTheme.set(t.dataset.ui); toast(T('toast.theme', { t: T('theme.' + t.dataset.ui) })); skipScroll = true; var y1 = window.scrollY; render(); window.scrollTo(0, y1); return; }
    if (t.dataset.lang && t.tagName === 'BUTTON') { I.set(t.dataset.lang); toast(t.dataset.lang === 'auto' ? T('toast.langAuto') : T('toast.lang')); return; } // re-rendu via I.onChange
    if (t.dataset.kitab) { S.kiTab = t.dataset.kitab; skipScroll = true; var y0 = window.scrollY; render(); window.scrollTo(0, y0); return; }
    if (t.dataset.kiOut) {
      if (S.sync) return toast(T('toast.waitSync'));
      var wo = S.wallets.find(function (x) { return x.id === t.dataset.kiOut; }); t.disabled = true; t.textContent = T('ki.preparing');
      try {
        var ex = await Sync.exportOutputs(wo, await V.load('wstate', 'st-' + wo.id));
        download(ex.bytes, 'prelevox_' + (wo.label || T('file.wallet')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) + '_outputs');
        toast(Tn('toast.exported', ex.count));
      } catch (err) { toast(err.message || String(err)); }
      t.disabled = false; t.textContent = T('btn.exportOut'); return;
    }
    if (t.dataset.kiDel) {
      if (S.sync) return toast(T('toast.waitSync'));
      if (confirm(T('confirm.removeKi'))) { var kd = t.dataset.kiDel; await V.remove('ki-' + kd); await V.remove('st-' + kd); await V.remove('cache-' + kd); delete S.kis[kd]; delete S.results[kd]; location.hash = '#/soldes'; syncAll(kd); }
      return;
    }
    if (t.dataset.rescan) {
      if (S.sync) return toast(T('toast.waitSync'));
      if (confirm(T('confirm.rescan'))) { await V.remove('st-' + t.dataset.rescan); await V.remove('cache-' + t.dataset.rescan); delete S.results[t.dataset.rescan]; location.hash = '#/soldes'; syncAll(t.dataset.rescan); }
      return;
    }
    var a = t.dataset.act;
    if (a === 'demo') { cancelSync(); S.demo = true; await V.setSetting('demo', true); await loadDemo(); location.hash = '#/soldes'; render(); }
    else if (a === 'quit-demo') { S.demo = false; await V.setSetting('demo', false); S.results = {}; if (V.isOpen()) await loadReal(); location.hash = '#/soldes'; render(); }
    else if (a === 'lock') { cancelSync(); V.lock(); }
    else if (a === 'sync') { S.errors = {}; syncAll(); if (!S.demo) { skipScroll = true; render(); } }
    else if (a === 'cancel-sync') { cancelSync(); }
    else if (a === 'alerts') { e.preventDefault(); openSheet(); }
    else if (a === 'close-sheet') { closeSheet(); }
    else if (a === 'notif') { await enablePush(); }
    else if (a === 'push-off') { await disablePush(); }
    else if (a === 'test-node') { testNodeUi(); }
    else if (a === 'toggle-price') { S.settings.price = !S.settings.price; await V.setSetting('sync', S.settings); if (S.settings.price) refreshPrice(true); else S.price = null; skipScroll = true; render(); }
    else if (a === 'wipe') { if (confirm(T('confirm.wipe'))) { await V.wipe(); location.hash = '#/bienvenue'; location.reload(); } }
    else if (t.dataset.delW) { if (confirm(T('confirm.delW'))) { if (S.sync) cancelSync(); await V.remove(t.dataset.delW); await V.remove('cache-' + t.dataset.delW); await V.remove('st-' + t.dataset.delW); await V.remove('ki-' + t.dataset.delW); await loadReal(); render(); } }
    else if (t.dataset.delSub) { await V.remove(t.dataset.delSub); S.subs = await V.list('sub'); render(); }
  });
  V.onChange(function () { cancelSync(); S.resume = null; S.wallets = []; S.results = S.demo ? S.results : {}; S.subs = []; S.kis = {}; S.errors = {}; render(); });
  window.addEventListener('hashchange', render);
  window.addEventListener('pagehide', pauseSync); // iOS : fermeture ou mise en veille de la PWA
  window.addEventListener('pageshow', function (e) { if (e.persisted) resumeSync(); });
  /* Retour au premier plan (iOS met les PWA en pause) : synchro incrémentale si la dernière date de plus de 10 min. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { pauseSync(); return; }
    if (S.sync && S.sync.paused) return; // la pause se termine, la reprise suivra
    if (S.resume) return resumeSync();
    if (S.sync) { wakeLock(true); return; } // le verrou d'écran est relâché par le navigateur en arrière-plan
    if (S.demo || !V.isOpen() || !S.wallets.length) return;
    var last = Math.min.apply(null, S.wallets.map(function (w) { return S.results[w.id] ? S.results[w.id].balance.syncedAt : 0; }));
    if (Date.now() - last > 10 * 60 * 1000) { S.errors = {}; syncAll(); refreshPrice(); }
  });

  (async function boot() {
    try {
      S.vaultExists = await V.exists();
      S.demo = await V.getSetting('demo', false);
      S.settings = Object.assign(S.settings, await V.getSetting('sync', {}));
      if (S.settings.nodeUrl && (!S.settings.node || S.settings.node === 'auto')) { S.settings.node = S.settings.nodeUrl; } delete S.settings.nodeUrl;
      if (S.settings.provider === 'demo' || !Sync.providers[S.settings.provider]) S.settings.provider = 'monero-ts';
      S.price = await V.getSetting('price', null);
      S.prix.cur = await V.getSetting('priceCur', 'eur'); S.alerts = await V.getSetting('alerts', []); S.pushCfg = await V.getSetting('push', null); S.push.on = !!S.pushCfg;
      var q = new URLSearchParams(location.search);
      if (q.get('demo') === '1') { S.demo = true; await V.setSetting('demo', true); }
      if (S.demo) await loadDemo();
    } catch (e) { console.error(e); }
    applyStatic(); render();
    if (S.alerts.length) checkAlerts(); // à chaque lancement
    if (S.push.on) applyFired().then(pushSync).then(function () { if (route() === 'prix') paintPrix(); });
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'px-fired') applyFired(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.push.on) applyFired(); });
    if (self.PxPtr) PxPtr.init({
      canStart: function () { var r = route(); return !S.sheet.open && ['soldes', 'prix', 'operations', 'bientot', 'abonnements'].indexOf(r) >= 0; },
      onRefresh: refreshAll
    });
  })();
  /* Tirer pour actualiser : synchro (vrai portefeuille) ou données de démo, puis cours et alertes. */
  async function refreshAll() {
    var jobs = [loadPrice(true)];
    if (S.demo) { jobs.push(loadDemo().then(function () { if (route() !== 'prix') { skipScroll = true; render(); } })); }
    else if (V.isOpen() && S.wallets.length && route() !== 'prix') {
      jobs.push(refreshPrice(true));
      if (!S.sync) { S.errors = {}; jobs.push(syncAll()); }
    }
    await Promise.all(jobs.map(function (p) { return Promise.resolve(p).catch(function () {}); }));
    if (S.demo && route() !== 'prix') toast(T('toast.demoRefreshed'));
  }
  function tickUpdated() {
    clearInterval(tickUpdated.t);
    tickUpdated.t = setInterval(function () { var el = document.getElementById('pupd'); if (!el) return clearInterval(tickUpdated.t); if (S.prix.at) el.textContent = T('prix.updated', { ago: ago(S.prix.at) }); }, 1000);
  }
  /* Langue : textes fixes de index.html (barre d'onglets), puis re-rendu immédiat sans rechargement. */
  function applyStatic() {
    $tab.setAttribute('aria-label', T('nav.aria'));
    $tab.querySelectorAll('a[data-tab]').forEach(function (a) { var sp = a.querySelector('span'); if (sp) sp.textContent = T('tab.' + a.dataset.tab); });
  }
  I.onChange(function (lang, changed) {
    applyStatic();
    skipScroll = true; var y = window.scrollY; render(); window.scrollTo(0, y);
    if (S.sheet.open) openSheet();
    if (changed && S.push.on) pushSync(); // notifications envoyées par le serveur dans la nouvelle langue
  });
  setInterval(function () { // cours et alertes toutes les 2 min tant que l'app est visible
    if (document.visibilityState !== 'visible') return;
    if (route() === 'prix') loadPrice(true); else if (S.alerts.length) checkAlerts();
  }, 120000);
})();