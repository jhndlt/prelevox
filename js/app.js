/* Prelevox – application. Lecture seule : aucune fonction d'envoi n'existe dans ce code. */
(function () {
  'use strict';
  var PX = self.PxPrice, K = self.PxKeys, V = self.PxVault, Demo = self.PxDemo, Sync = self.PxSync, Chart = self.PxChart, KI = self.PxKeyImages;
  var $app = document.getElementById('app'), $tab = document.getElementById('tabbar'), $toast = document.getElementById('toast');
  var DAY = 864e5;
  var KEY_MSG = 'Ce n\u2019est pas un portefeuille, c\u2019est une télécommande qui se branche sur vos portefeuilles Monero pour une belle interface.';
  var S = { demo: false, vaultExists: false, wallets: [], results: {}, subs: [], chartPeriod: 30,
    settings: { provider: 'monero-ts', node: 'auto', customNode: '', lwsUrl: '', price: true },
    sync: null, errors: {}, price: null, nodeTest: null, kis: {}, resume: null, wake: null,
    prix: { period: '24h', cur: 'eur', snap: null, hist: null, err: null, loading: false, at: 0 }, alerts: [], sheet: { kind: 'above', cur: null } };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function xmr(n, sign) { var s = Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }); return sign ? (n === 0 ? '' : n > 0 ? '+' : '\u2212') + s : (n < 0 ? '\u2212' : '') + s; }
  function nf(n) { return Number(n).toLocaleString('fr-FR'); }
  function eur(n) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }
  function hm(ts) { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function dmy(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
  function sameDay(a, b) { a = new Date(a); b = new Date(b); return a.toDateString() === b.toDateString(); }
  function inDays(ts) { var a = new Date(); a.setHours(0, 0, 0, 0); var b = new Date(ts); b.setHours(0, 0, 0, 0); return Math.round((b - a) / DAY); }
  function when(ts) { var d = inDays(ts); return d === 0 ? 'aujourd\u2019hui' : d === 1 ? 'demain' : 'dans ' + d + ' jours'; }
  function toast(t) { $toast.textContent = t; $toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.classList.remove('show'); }, 2600); }
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return u; } }
  function dur(sec) { if (!isFinite(sec) || sec <= 0) return ''; if (sec < 60) return 'moins d\u2019une minute'; var m = Math.round(sec / 60); if (m < 60) return 'environ ' + m + ' min'; var h = Math.floor(m / 60), r = m % 60; return 'environ ' + h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : ''); }
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
  function dmyY(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }
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
    if (S.demo) { await loadDemo(); toast('Démo actualisée (données fictives).'); return render(); }
    if (S.sync) return toast('Synchronisation déjà en cours.');
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
            if (o && o.failover && job.node) { job.failover = 'Le nœud ' + hostOf(job.node) + ' ne répond plus : bascule sur ' + hostOf(u) + ', sans perte.'; toast(job.failover); }
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
    if (job.cancelled) toast('Synchronisation annulée. La progression est conservée.');
    else if (okCount === list.length) toast(okCount > 1 ? 'Portefeuilles synchronisés.' : 'Portefeuille synchronisé.');
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
    toast('Reprise de la synchronisation là où elle s\u2019était arrêtée.');
    syncAll(r.onlyId);
  }
  function syncHtml() {
    var j = S.sync; if (!j) return '';
    var pct = Math.round((j.pct || 0) * 1000) / 10;
    var eta = j.rate && j.remaining ? dur(j.remaining / j.rate) : '';
    var line = j.cancelled ? 'Arrêt en cours, sauvegarde de la progression…' :
      j.paused ? 'En pause : sauvegarde de la progression…' :
      j.ki ? 'Vérification des key images importées…' :
      !j.node ? 'Recherche d\u2019un nœud disponible…' :
      j.preparing ? 'Préparation · téléchargement des repères de la chaîne…' :
      pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' % · ' + (j.remaining != null ? nf(j.remaining) + ' bloc' + (j.remaining > 1 ? 's' : '') + ' restant' + (j.remaining > 1 ? 's' : '') : '') + (eta ? ' · ' + eta : '');
    return '<div class="synccard" id="syncbox" role="status" aria-live="polite"><div class="sync-head"><span class="spin" aria-hidden="true"></span><div class="t"><b>Synchronisation' + (S.wallets.length > 1 ? ' ' + esc(j.step || '') : '') + '</b><small>' + esc(j.label) + (j.node ? ' · nœud ' + esc(hostOf(j.node)) : '') + '</small></div>' +
      (j.cancelled ? '' : '<button class="pill" data-act="cancel-sync">Annuler</button>') + '</div>' +
      '<div class="bar"><i data-w="' + (j.preparing ? 2 : Math.max(2, pct)) + '"></i></div><small class="sync-line">' + line + '</small>' +
      (j.failover ? '<small class="sync-hint sync-warn">' + esc(j.failover) + '</small>' : '') +
      '<small class="sync-hint">' + (Sync.isIOS() ? '📱 <b>Gardez Prelevox ouvert et l\u2019écran allumé.</b> Sur iPhone, la synchronisation se met en pause dès que vous changez d\u2019app ; elle reprend toute seule au retour, sans rien perdre.'
        : 'Gardez l\u2019app ouverte : la progression est enregistrée (chiffrée) toutes les minutes.') + (S.wake ? ' · Écran maintenu allumé.' : '') + '</small></div>';
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
      (S.demo ? '<span class="badge demo">DONNÉES FICTIVES</span>' : '<span class="badge">LECTURE SEULE</span>') +
      (!S.demo && V.isOpen() ? '<button class="lockbtn" data-act="lock" aria-label="Verrouiller">' + ico.lock + '</button>' : '') + '</header>' +
      (S.demo ? '<div class="demobar">🧪 <span><b>Mode démo</b> : tout est inventé.</span><button data-act="quit-demo">Quitter</button></div>' : '');
  }
  function txRow(t) {
    return '<div class="row"><span class="ic ' + (t.amount >= 0 ? 'c0' : '') + '">' + (t.amount >= 0 ? '↓' : '↑') + '</span><div class="t"><div>' + esc(t.label) + '</div><small>' +
      (sameDay(t.ts, Date.now()) ? hm(t.ts) : dmy(t.ts) + ' ' + hm(t.ts)) + ' · ' + esc(wname(t.walletId)) + ' · ' + (t.pending ? 'en attente (mempool)' : t.confirmations >= 10 ? t.confirmations.toLocaleString('fr-FR') + ' confirmations' : (t.confirmations || 0) + '/10 confirmations') + '</small></div><b class="' + (t.amount >= 0 ? 'in' : '') + '">' +
      xmr(t.amount, true) + (t.approx ? '<span class="approx">estimée</span>' : '') + '</b></div>';
  }
  function subRow(s, withWhen) {
    return '<div class="row"><span class="ic">' + esc(s.icon || '↻') + '</span><div class="t"><div>' + esc(s.label) + '</div><small>' +
      (withWhen ? when(s.nextTs) + ' · ' + dmy(s.nextTs) : s.period + ' · prochain le ' + dmy(s.nextTs)) + (s.source === 'détecté' && !/détect/.test(s.label) ? ' · détecté' : '') + '</small></div><b' + (s.incoming ? ' class="in"' : '') + '>' + xmr(s.incoming ? s.amount : -s.amount, true) + (s.approx ? '<span class="approx">estimé</span>' : '') + '</b>' +
      (!S.demo && s.source === 'manuel' && !withWhen ? '<button class="lockbtn" data-del-sub="' + esc(s.id) + '" aria-label="Supprimer">✕</button>' : '') + '</div>';
  }
  function note() { return '<p class="note"><strong>' + KEY_MSG + '</strong><br>Aucune clé de dépense · aucun envoi possible · clés chiffrées sur cet appareil.</p>'; }

  /* ---------- Écrans ---------- */
  var views = {};
  views.bienvenue = function () {
    return '<section class="welcome"><img src="icons/mark.png" alt="Logo Prelevox"><h1>Prelevo<span>x</span></h1>' +
      '<p class="quote">Ce n\u2019est pas un portefeuille, c\u2019est une <b>télécommande</b> qui se branche sur vos portefeuilles Monero pour une belle interface.</p>' +
      '<div class="pts"><div><i>👁</i><span>Lecture seule : votre adresse et votre clé de visualisation (view key) suffisent.</span></div>' +
      '<div><i>⛔</i><span>Les clés de dépense et phrases de récupération sont détectées et refusées. Aucun envoi n\u2019est possible.</span></div>' +
      '<div><i>🔒</i><span>Vos clés sont chiffrées sur cet appareil (AES-256). Pas de compte, pas de serveur.</span></div></div>' +
      '<a class="btn" href="#/ajouter">Ajouter un portefeuille</a><button class="btn ghost" data-act="demo">Essayer la démo (données fictives)</button></section>';
  };
  views.deverrouiller = function () {
    return '<section class="welcome"><img src="icons/mark.png" alt=""><h1>Prelevo<span>x</span></h1><p class="quote">Votre coffre est verrouillé.</p>' +
      '<form id="unlock"><div class="f"><label for="pw">Phrase secrète</label><input id="pw" type="password" autocomplete="current-password" required></div><div class="msg" id="um"></div>' +
      '<button class="btn mt">Déverrouiller</button></form><p class="note">Vous l\u2019avez oubliée ? Elle n\u2019est enregistrée nulle part : effacez les données dans Réglages du navigateur et rajoutez vos portefeuilles.</p></section>';
  };
  views.soldes = function () {
    var ws = wallets(), t = total(), today = txsAll().filter(function (x) { return sameDay(x.ts, Date.now()); }).slice(0, 3);
    var soon = subsAll().concat(incomingAll()).filter(function (s) { return inDays(s.nextTs) <= 14; }).sort(function (a, b) { return a.nextTs - b.nextTs; }).slice(0, 2);
    var synced = ws.some(function (w) { return S.results[w.id]; });
    var lastSync = Math.max.apply(null, [0].concat(ws.map(function (w) { return S.results[w.id] ? S.results[w.id].balance.syncedAt : 0; })));
    var sub = S.demo ? '≈ ' + eur(t * Demo.priceEur) + ' (exemple)' :
      !synced ? 'Pas encore synchronisé' :
      (S.settings.price && S.price ? '≈ ' + eur(t * S.price.eur) + ' · ' : '') + 'Synchro ' + (sameDay(lastSync, Date.now()) ? 'à ' + hm(lastSync) : 'le ' + dmy(lastSync));
    var exact = allExact();
    var h = header() + '<div class="hero"><small>' + (S.demo ? 'Solde total' : exact ? 'Solde exact (au ' + dmy(lastSync) + ')' : 'Solde total estimé') + ' · ' + ws.length + ' portefeuille' + (ws.length > 1 ? 's' : '') + ' (lecture seule)</small><h1>' + (synced ? xmr(t) : '—') + ' <em>XMR</em></h1>' +
      '<p>' + sub + '</p>' +
      '<div class="chips">' + (exact ? '<span>✓ Key images à jour</span>' : '<span>👁 View keys</span>') + '<span>🔒 Chiffré localement</span><span>⛔ Aucun envoi</span></div></div>';
    if (!S.demo) h += '<div id="syncslot">' + syncHtml() + '</div>';
    if (!S.demo) ws.forEach(function (w) { if (S.errors[w.id] && !S.sync) h += '<div class="alert stop"><b>' + esc(w.label) + '</b> : ' + esc(S.errors[w.id]) + '<div class="alert-acts"><button class="pill on" data-act="sync">Réessayer</button><a class="pill" href="#/reglages">Choisir un nœud</a></div></div>'; });
    if (!S.demo && !S.sync) ws.forEach(function (w) {
      var r = S.results[w.id], k = r && r.balance.keyImages;
      if (k && k.error) h += '<div class="alert stop"><b>' + esc(w.label) + ' · key images</b> : ' + esc(k.error) + '<div class="alert-acts"><a class="pill on" href="#/exact">Réimporter</a></div></div>';
      else if (k && k.applied && k.missing > 0) h += '<div class="alert warn"><b>' + esc(w.label) + '</b> : ' + k.missing + ' réception' + (k.missing > 1 ? 's' : '') + ' depuis votre dernier export de key images. Le solde redevient estimé : <a href="#/exact">réimportez un fichier récent</a> pour le rendre exact.</div>';
    });
    if (!S.demo && ws.length && !synced && !S.sync && !Object.keys(S.errors).length) h += '<div class="alert info"><b>Première synchronisation</b><br>Prelevox va lire les blocs Monero depuis la date de création de votre portefeuille, directement sur cet appareil. Cela peut prendre quelques minutes.<button class="btn mt" data-act="sync">Lancer la synchronisation</button></div>';
    h += Chart.cardHtml(historyPoints(), S.chartPeriod, S.demo ? undefined : 'Le graphique apparaîtra après la première synchronisation.', S.demo ? undefined : { noExtend: true });
    h += '<h2>Soldes <a href="#/ajouter">+ Ajouter</a></h2><div class="card">' + (ws.length ? ws.map(function (w, i) {
      var r = S.results[w.id];
      var locked = r && !S.demo && r.balance.unlocked != null && r.balance.total - r.balance.unlocked > 1e-12;
      var kiTag = S.demo || !r ? '' : r.balance.exact ? ' · <span class="tag ok">exact</span>' : r.balance.keyImages && r.balance.keyImages.missing > 0 ? ' · <span class="tag">à réimporter</span>' : ' · <span class="tag">estimé</span>';
      return '<div class="row"><span class="ic c' + (i % 3) + '"><span class="dot"></span></span><div class="t"><div>' + esc(w.label) + '</div><small>' + esc(w.app || 'Monero') + ' · <span class="addr">' + esc(K.short(w.address)) + '</span>' + kiTag + '</small></div><b>' + (r ? xmr(r.balance.total) + (locked ? '<span class="approx">dont ' + xmr(r.balance.unlocked) + ' disponible</span>' : '') : '<span class="small">non synchronisé</span>') + '</b></div>';
    }).join('') : '<p class="empty">Aucun portefeuille pour l\u2019instant.</p>') + '</div>';
    h += '<h2>Opérations du jour <a href="#/operations">Tout voir</a></h2><div class="card">' + (today.length ? today.map(txRow).join('') : '<p class="empty">Aucune opération aujourd\u2019hui.</p>') + '</div>';
    h += '<h2>Bientôt <a href="#/bientot">Tout voir</a></h2><div class="card">' + (soon.length ? soon.map(function (s) { return subRow(s, true); }).join('') : '<p class="empty">Rien de prévu dans les 14 prochains jours.</p>') + '</div>';
    if (!S.demo) {
      h += '<button class="btn ghost mt" data-act="sync"' + (S.sync ? ' disabled' : '') + '>Synchroniser</button>';
      if (exact) h += '<div class="alert ok"><b>Solde exact</b><br>Vos key images ont permis de repérer chaque sortie dépensée. Prelevox suit aussi les dépenses à venir de ces fonds. Après de nouvelles réceptions, <a href="#/exact">réimportez un fichier</a> pour rester exact.</div>';
      else h += '<a class="btn ghost mt" href="#/exact">Obtenir un solde exact (key images)</a>';
      if (!exact) h += '<details class="alert info"><summary><b>Pourquoi « estimé » ?</b></summary>Avec une clé de visualisation, Monero montre avec certitude tout ce que vous <b>recevez</b>. Les <b>dépenses</b>, elles, ne sont visibles qu\u2019avec la clé de dépense, que Prelevox refuse. Si vous avez envoyé des fonds depuis ce portefeuille, le solde réel peut donc être plus bas que celui affiché. Pour un solde exact, importez vos <a href="#/exact">key images</a>.' +
        (synced ? '<br><br>Données lues depuis le bloc ' + ws.map(function (w) { var r = S.results[w.id]; return r && r.balance.restoreHeight != null ? nf(r.balance.restoreHeight) + ' (≈ ' + dmy(Sync.dateFromHeight(r.balance.restoreHeight)) + ' ' + new Date(Sync.dateFromHeight(r.balance.restoreHeight)).getFullYear() + ')' : null; }).filter(Boolean).join(', ') + ' : les opérations plus anciennes ne sont pas comptées.' : '') + '</details>';
    }
    return h + note();
  };
  views.operations = function () {
    var all = txsAll(), today = all.filter(function (x) { return sameDay(x.ts, Date.now()); });
    var inn = today.filter(function (t) { return t.amount > 0; }).reduce(function (a, t) { return a + t.amount; }, 0);
    var out = today.filter(function (t) { return t.amount < 0; }).reduce(function (a, t) { return a + t.amount; }, 0);
    var h = header() + '<h1 class="title">Opérations du jour</h1><p class="sub">' + new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>' +
      '<div class="kpis"><div class="kpi"><small>Entrées</small><b class="in">' + xmr(inn, true) + '</b></div><div class="kpi"><small>' + (allExact() ? 'Sorties' : 'Sorties estimées') + '</small><b>' + xmr(out, true) + '</b></div></div>' +
      '<h2>Aujourd\u2019hui</h2><div class="card">' + (today.length ? today.map(txRow).join('') : '<p class="empty">Aucune opération aujourd\u2019hui.</p>') + '</div>';
    if (!S.demo && !wallets().some(function (w) { return S.results[w.id]; })) h += '<p class="note">Les opérations apparaîtront après la première synchronisation (onglet Soldes).</p>';
    var prev = all.filter(function (x) { return !sameDay(x.ts, Date.now()) && x.ts > Date.now() - 7 * DAY; });
    if (prev.length) h += '<h2>7 derniers jours</h2><div class="card">' + prev.map(txRow).join('') + '</div>';
    if (allExact()) return h + '<div class="alert ok"><b>Sorties exactes</b> : vos key images importées permettent de reconnaître vos dépenses.</div>';
    return h + '<div class="alert info"><b>Pourquoi « estimée » ?</b> Avec une clé de visualisation, Monero montre avec certitude ce que vous recevez. Les sorties sont déduites sans la clé de dépense : leur montant peut être approximatif' + (S.demo ? '' : ', et certaines peuvent ne pas apparaître du tout') + '.</div>';
  };
  views.bientot = function () {
    var list = subsAll().concat(incomingAll()).filter(function (s) { return inDays(s.nextTs) <= 30; }).sort(function (a, b) { return a.nextTs - b.nextTs; });
    var sum = list.filter(function (s) { return !s.incoming; }).reduce(function (a, s) { return a + s.amount; }, 0);
    return header() + '<h1 class="title">Bientôt</h1><p class="sub">Paiements attendus dans les 30 prochains jours.</p>' +
      '<div class="kpis"><div class="kpi"><small>À prévoir</small><b>' + xmr(-sum, true) + '</b></div><div class="kpi"><small>Échéances</small><b>' + list.length + '</b></div></div>' +
      '<h2>Calendrier</h2><div class="card">' + (list.length ? list.map(function (s) { return subRow(s, true); }).join('') : (S.demo ? '<p class="empty">Rien de prévu. Ajoutez vos abonnements pour les voir ici.</p>' : '<p class="empty">Rien de prévu dans les 30 prochains jours.<br><small>Prelevox repère les montants identiques qui reviennent chaque semaine, mois ou année dans votre historique. Vous pouvez aussi ajouter vos abonnements dans l\u2019onglet Abonnements.</small></p>')) + '</div>' +
      '<p class="note">Prelevox vous prévient, mais ne paie rien : c\u2019est vous qui envoyez depuis votre portefeuille.</p>';
  };
  views.abonnements = function () {
    var list = subsAll().sort(function (a, b) { return a.nextTs - b.nextTs; });
    var monthly = list.reduce(function (a, s) { return a + (s.period === 'annuel' ? s.amount / 12 : s.period === 'hebdomadaire' ? s.amount * 52 / 12 : s.amount); }, 0);
    var h = header() + '<h1 class="title">Abonnements</h1><p class="sub">Détectés dans vos sorties ou ajoutés par vous.</p>' +
      '<div class="kpis"><div class="kpi"><small>Par mois (moyenne)</small><b>' + xmr(-monthly, true) + '</b></div><div class="kpi"><small>Par an</small><b>' + xmr(-monthly * 12, true) + '</b></div></div>' +
      '<h2>Vos abonnements</h2><div class="card">' + (list.length ? list.map(function (s) { return subRow(s, false); }).join('') : '<p class="empty">Aucun abonnement pour l\u2019instant.' + (S.demo ? '' : '<br><small>Aucun paiement régulier n\u2019a été détecté. Avec une view key, les dépenses sont peu visibles : ajoutez vos abonnements ci-dessous pour être prévenu avant chaque échéance.</small>') + '</p>') + '</div>';
    if (S.demo) return h + '<p class="note">En démo, l\u2019ajout est désactivé. Ajoutez un vrai portefeuille pour gérer vos abonnements.</p>';
    return h + '<h2>Ajouter un abonnement</h2><form id="subf" class="card" ><div class="f mt"><label for="sl">Nom</label><input id="sl" required maxlength="40" placeholder="Ex. VPN, serveur…"></div>' +
      '<div class="f"><label for="sa">Montant (XMR)</label><input id="sa" required inputmode="decimal" placeholder="0,0300"></div>' +
      '<div class="f"><label for="sp">Fréquence</label><select id="sp"><option value="mensuel">Mensuel</option><option value="annuel">Annuel</option><option value="hebdomadaire">Hebdomadaire</option></select></div>' +
      '<div class="f"><label for="sd">Prochaine échéance</label><input id="sd" type="date" required></div>' +
      '<div class="f"><label for="sw">Portefeuille</label><select id="sw">' + S.wallets.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.label) + '</option>'; }).join('') + '</select></div>' +
      '<button class="btn" ' + (S.wallets.length ? '' : 'disabled') + '>Enregistrer (chiffré)</button><div class="f"></div></form>';
  };
  /* Solde exact : import des key images (fichier Feather ou monero-wallet-cli), tout reste sur l'appareil. */
  /* ---------- Onglet Prix : cours du XMR, graphique, alertes ---------- */
  var BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
  function sym(cur) { return cur === 'usd' ? '$' : '€'; }
  function ago(ts) { var s = Math.max(0, Math.round((Date.now() - ts) / 1000)), m = Math.floor(s / 60); return m ? 'il y a ' + m + ' min et ' + (s % 60) + ' s' : 'il y a ' + s + ' s'; }
  function activeAlerts() { return S.alerts.filter(function (a) { return !(a.firedAt && a.kind !== 'change'); }).length; }
  views.prix = function () {
    var P = S.prix, sn = P.snap && P.snap.cur === P.cur ? P.snap : null, up = sn && sn.change >= 0;
    var h = '<div class="pxtop"><div class="seg pxcur" role="radiogroup" aria-label="Devise">' + ['eur', 'usd'].map(function (c) { return '<button class="' + (P.cur === c ? 'on' : '') + '" data-pcur="' + c + '" aria-checked="' + (P.cur === c) + '" role="radio">' + sym(c) + '</button>'; }).join('') + '</div>' +
      '<h1>Prix</h1><button class="bell" data-act="alerts" aria-label="Alertes de prix">' + BELL + (activeAlerts() ? '<i>' + activeAlerts() + '</i>' : '') + '</button></div>';
    h += '<div class="pxhead"><small>Monero · XMR</small><div class="pxprice">' + (sn ? PX.fmt(sn.price, P.cur) : P.err ? '—' : '<span class="sk"></span>') + '</div>' +
      (sn ? '<div class="pxchg"><span class="chg ' + (up ? 'up' : 'down') + '">' + (up ? '↗ +' : '↘ \u2212') + Math.abs(sn.change).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %</span> 24 h</div>' : '') + '</div>';
    h += '<div class="seg pxper" role="tablist">' + Object.keys(PX.PERIODS).map(function (k) { return '<button class="' + (P.period === k ? 'on' : '') + '" data-pper="' + k + '">' + PX.PERIODS[k].label + '</button>'; }).join('') + '</div>';
    var hist = P.hist && P.hist.cur === P.cur && P.hist.period === P.period ? P.hist : null;
    h += '<div class="pxchart">' + (hist ? PX.chartSvg(hist.points, P.period, P.cur) : P.err ? '<p class="empty">' + esc(P.err) + '</p>' : '<p class="empty">Chargement du cours…</p>') + '</div>';
    if (hist) { var a = hist.points[0][1], b = hist.points[hist.points.length - 1][1], d = (b - a) / a * 100; h += '<p class="pxvar">Sur la période : <b class="' + (d >= 0 ? 'in' : 'neg') + '">' + (d >= 0 ? '+' : '\u2212') + Math.abs(d).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %</b></p>'; }
    h += '<h2>Statistiques</h2><div class="kpis"><div class="kpi"><small>Plus haut 24 h</small><b class="in">' + (sn ? PX.fmt(sn.high, P.cur) : '—') + '</b></div><div class="kpi"><small>Plus bas 24 h</small><b class="neg">' + (sn ? PX.fmt(sn.low, P.cur) : '—') + '</b></div></div>';
    if (S.alerts.length) h += '<h2>Vos alertes <a href="#" data-act="alerts">Gérer</a></h2><div class="card pxalerts">' + S.alerts.map(alertRow).join('') + '</div>';
    else h += '<button class="btn ghost mt" data-act="alerts">Créer une alerte de prix</button>';
    h += '<p class="pxupd" id="pupd">' + (P.at ? 'Dernière mise à jour ' + ago(P.at) : '') + '</p><p class="note">Source : ' + esc((sn && sn.source) || 'CoinGecko') + (hist && hist.source !== (sn && sn.source) ? ' · historique : ' + esc(hist.source) : '') + '. Aucune adresse ni clé n\u2019est envoyée. Tirez l\u2019écran vers le bas pour actualiser.</p>';
    return h;
  };
  function alertRow(a, inSheet) {
    var fired = a.firedAt && a.kind !== 'change';
    return '<div class="row"><span class="ic c0">' + (a.kind === 'above' ? '↗' : a.kind === 'below' ? '↘' : '%') + '</span><div class="t"><div>' + esc(PX.describe(a)) + '</div><small>' +
      (fired ? 'déclenchée le ' + dmy(a.firedAt) + ' à ' + hm(a.firedAt) : a.firedAt ? 'active · dernière le ' + dmy(a.firedAt) + ' à ' + hm(a.firedAt) : 'active') + '</small></div>' +
      (fired ? '<button class="pill" data-al-rearm="' + esc(a.id) + '">Réactiver</button>' : '') +
      '<button class="lockbtn" data-al-del="' + esc(a.id) + '" aria-label="Supprimer l\u2019alerte">✕</button></div>';
  }
  async function loadPrice(force) {
    var P = S.prix, cur = P.cur, period = P.period;
    if (force) PX.clear();
    P.loading = true; P.err = null; if (route() === 'prix') paintPrix();
    try {
      var r = await Promise.all([PX.snapshot(cur), PX.history(cur, period)]);
      P.snap = r[0]; P.hist = { cur: cur, period: period, points: r[1].points, source: r[1].source }; P.at = Date.now();
      await checkAlerts({ [cur]: r[0] });
    } catch (e) { P.err = 'Cours indisponible pour le moment (CoinGecko et Kraken injoignables). Réessayez en tirant l\u2019écran vers le bas.'; }
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
    fired.forEach(function (f, i) { var msg = PX.message(f); setTimeout(function () { toast('🔔 ' + msg); }, i * 2800); notify('Alerte Prelevox', msg, f.alert.id); });
  }
  function notify(title, body, tag) {
    try {
      if (!('Notification' in self) || Notification.permission !== 'granted') return;
      var o = { body: body, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'px-' + tag, lang: 'fr' };
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, o); }).catch(function () { try { new Notification(title, o); } catch (e) {} });
      else new Notification(title, o);
    } catch (e) {}
  }
  function notifState() {
    if (!('Notification' in self)) return { s: 'na', t: navigator.standalone === false || /iPhone|iPad/.test(navigator.userAgent) ? 'Sur iPhone, les notifications demandent d\u2019ajouter Prelevox à l\u2019écran d\u2019accueil (Partager → « Sur l\u2019écran d\u2019accueil »), puis de l\u2019ouvrir depuis son icône.' : 'Ce navigateur ne permet pas les notifications. Les alertes s\u2019afficheront dans l\u2019app.' };
    if (Notification.permission === 'granted') return { s: 'ok', t: 'Notifications activées sur cet appareil.' };
    if (Notification.permission === 'denied') return { s: 'no', t: 'Notifications refusées : réactivez-les dans les réglages du système pour Prelevox.' };
    return { s: 'ask', t: 'Recevez aussi une notification quand une alerte se déclenche.' };
  }
  function sheetHtml() {
    var k = S.sheet.kind, cur = S.sheet.cur || S.prix.cur, ns = notifState(), sn = S.prix.snap;
    return '<div class="sheet-bg" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shtt"><div class="grab"></div>' +
      '<div class="sheet-h"><b id="shtt">Alertes de prix</b><button class="lockbtn" data-act="close-sheet" aria-label="Fermer">✕</button></div>' +
      '<form id="alf"><div class="seg" role="radiogroup">' + [['above', 'Au-dessus de'], ['below', 'En-dessous de'], ['change', 'Variation']].map(function (x) { return '<button type="button" class="' + (k === x[0] ? 'on' : '') + '" data-alk="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="f mt"><label for="alv">' + (k === 'change' ? 'Variation sur 24 h (en %, hausse ou baisse)' : 'Prix du XMR') + '</label><div class="alin"><input id="alv" inputmode="decimal" autocomplete="off" required placeholder="' + (k === 'change' ? '5' : sn ? Math.round(sn.price * (k === 'above' ? 1.05 : 0.95)) : '600') + '">' +
      (k === 'change' ? '<span class="unit">%</span>' : '<div class="seg alcur">' + ['eur', 'usd'].map(function (c) { return '<button type="button" class="' + (cur === c ? 'on' : '') + '" data-alc="' + c + '">' + sym(c) + '</button>'; }).join('') + '</div>') + '</div>' +
      '<div class="msg">' + (k === 'change' ? 'Alerte au plus une fois par 24 h quand le cours bouge d\u2019au moins ce pourcentage.' : sn && sn.cur === cur ? 'Cours actuel : ' + PX.fmt(sn.price, cur) + '.' : '') + '</div></div>' +
      '<button class="btn">Créer l\u2019alerte</button></form>' +
      (S.alerts.length ? '<h2>Vos alertes</h2><div class="card">' + S.alerts.map(function (a) { return alertRow(a, true); }).join('') + '</div>' : '') +
      '<div class="alert ' + (ns.s === 'ok' ? 'ok' : 'info') + ' mt"><b>Notifications</b><br>' + esc(ns.t) + (ns.s === 'ask' ? '<div class="alert-acts"><button class="pill on" data-act="notif">Activer les notifications</button></div>' : '') + '</div>' +
      '<p class="small sheet-note">Les alertes sont enregistrées sur cet appareil et vérifiées quand Prelevox est ouvert (toutes les 2 minutes) et à chaque lancement. App fermée, aucune alerte ne peut partir.</p></div>';
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
      if (!(v > 0) || (S.sheet.kind === 'change' && v > 100)) return toast(S.sheet.kind === 'change' ? 'Indiquez un pourcentage entre 0 et 100.' : 'Indiquez un prix valide.');
      S.alerts.push({ id: 'a' + uid().slice(1, 9), kind: S.sheet.kind, value: v, cur: S.sheet.kind === 'change' ? S.prix.cur : (S.sheet.cur || S.prix.cur), created: Date.now(), firedAt: 0 });
      await V.setSetting('alerts', S.alerts); toast('Alerte créée : ' + PX.describe(S.alerts[S.alerts.length - 1]) + '.');
      openSheet(); checkAlerts(S.prix.snap ? { [S.prix.snap.cur]: S.prix.snap } : null);
    });
  }
  views.exact = function () {

    var tab = S.kiTab || 'feather';
    var h = '<a class="back" href="#/soldes">‹ Retour</a><h1 class="title">Solde exact</h1>' +
      '<p class="sub">Avec la seule view key, Prelevox voit vos réceptions mais pas vos dépenses. Vos <b>key images</b> lui permettent de reconnaître les sorties déjà dépensées.</p>' +
      '<div class="alert ok"><b>Sans risque pour vos fonds</b><br>Une key image ne permet <b>aucun envoi</b>. Le fichier est lu et déchiffré sur cet appareil, puis gardé chiffré dans votre coffre (AES-256).</div>' +
      '<div class="seg" role="tablist"><button class="' + (tab === 'feather' ? 'on' : '') + '" data-kitab="feather">Feather Wallet</button><button class="' + (tab === 'cli' ? 'on' : '') + '" data-kitab="cli">monero-wallet-cli</button></div>';
    if (tab === 'feather') h += '<ol class="steps">' +
      '<li><b>Dans Prelevox</b>, touchez « Exporter mes sorties » ci-dessous et enregistrez le fichier (ex. dans Fichiers ou AirDrop vers votre ordinateur).</li>' +
      '<li><b>Dans Feather</b>, ouvrez votre portefeuille complet puis <span class="kbd">Tools → Offline transaction signing</span>. Choisissez la méthode « File », puis importez le fichier de sorties.</li>' +
      '<li>À l\u2019étape « Export key images », touchez <span class="kbd">Save to file</span> : Feather crée un fichier qui se termine par <span class="kbd">_keyImages</span>.</li>' +
      '<li><b>Revenez dans Prelevox</b> et touchez « Importer les key images » pour choisir ce fichier.</li></ol>';
    else h += '<ol class="steps">' +
      '<li>Ouvrez votre portefeuille complet dans <span class="kbd">monero-wallet-cli</span>, synchronisé.</li>' +
      '<li>Tapez <span class="kbd">export_key_images all prelevox_key_images</span>, puis votre mot de passe.</li>' +
      '<li>Transférez le fichier <span class="kbd">prelevox_key_images</span> sur cet appareil et touchez « Importer les key images ».</li></ol>' +
      '<p class="small">Gardez le mot <b>all</b> : sans lui, seules les nouvelles sorties sont exportées. La hauteur de restauration de Prelevox doit précéder votre première réception. En cas de refus, passez par la méthode Feather : elle part des sorties lues par Prelevox.</p>';
    h += '<h2>Vos portefeuilles</h2>';
    if (S.demo) h += '<div class="card"><p class="empty">En démo, l\u2019import est désactivé. Ajoutez un vrai portefeuille pour obtenir un solde exact.</p></div>';
    else if (!S.wallets.length) h += '<div class="card"><p class="empty">Ajoutez d\u2019abord un portefeuille.</p></div>';
    (S.demo ? [] : S.wallets).forEach(function (w) {
      var r = S.results[w.id], k = S.kis[w.id], info = r && r.balance.keyImages;
      var st = !r ? 'Pas encore synchronisé : lancez la synchronisation d\u2019abord.' :
        info && info.error ? '⚠ ' + info.error :
        r.balance.exact ? '✓ Solde exact au ' + dmyY(r.balance.syncedAt) + ' · ' + nf(k ? k.count : info.count) + ' key image' + ((k ? k.count : info.count) > 1 ? 's' : '') :
        info && info.applied && info.missing > 0 ? info.missing + ' réception' + (info.missing > 1 ? 's' : '') + ' sans key image : réimportez un fichier récent.' :
        k ? 'Fichier importé le ' + dmyY(k.importedAt) + ' : appliqué à la prochaine synchronisation.' : 'Solde estimé (aucune key image).';
      h += '<div class="card kicard"><div class="row"><span class="ic c0">' + (r && r.balance.exact ? '✓' : '◎') + '</span><div class="t"><div>' + esc(w.label) + '</div><small>' + esc(st) + '</small></div></div>' +
        '<div class="kiacts">' + (tab === 'feather' ? '<button class="btn ghost" data-ki-out="' + esc(w.id) + '"' + (r && !S.sync ? '' : ' disabled') + '>Exporter mes sorties</button>' : '') +
        '<label class="btn' + (r ? '' : ' off') + '" for="kif-' + esc(w.id) + '">Importer les key images</label><input class="hidden" type="file" id="kif-' + esc(w.id) + '" data-ki-in="' + esc(w.id) + '"' + (r ? '' : ' disabled') + '>' +
        (k ? '<button class="linkbtn" data-ki-del="' + esc(w.id) + '">Retirer les key images</button>' : '') + '</div></div>';
    });
    h += '<div class="alert info"><b>Confidentialité</b><br>Pour savoir quelles sorties sont dépensées, Prelevox demande au nœud si ces key images apparaissent dans la chaîne, comme le fait Feather. Le nœud peut alors relier ces key images à votre adresse IP. <b>Avec votre propre nœud, rien ne sort de chez vous.</b></div>' +
      '<div class="alert info"><b>Et ensuite ?</b><br>Les dépenses de ces fonds seront suivies automatiquement. Après de <b>nouvelles réceptions</b>, refaites un import pour que le solde reste exact : Prelevox vous le signalera.</div>';
    return h + note();
  };
  views.ajouter = function () {
    var needPass = !S.vaultExists;
    return '<a class="back" href="#/' + (S.demo || V.isOpen() ? 'soldes' : 'bienvenue') + '">‹ Retour</a><h1 class="title">Ajouter un portefeuille</h1>' +
      '<p class="sub">En lecture seule : l\u2019adresse et la clé de visualisation suffisent.</p>' +
      '<div class="alert warn"><b>Ne collez jamais</b> votre clé de dépense (spend key) ni votre phrase de récupération (25 mots). Prelevox les détecte et les refuse.</div>' +
      '<form id="addf" autocomplete="off">' +
      '<div class="f"><label for="wl">Nom <small>(pour vous)</small></label><input id="wl" maxlength="32" placeholder="Ex. Portefeuille principal" required></div>' +
      '<div class="f" id="fa"><label for="wa">Adresse principale <small>(commence par 4)</small></label><textarea id="wa" rows="3" spellcheck="false" autocapitalize="off" placeholder="4…"></textarea><div class="msg">Dans Feather, Cake Wallet ou Monero GUI : Recevoir → Adresse principale.</div></div>' +
      '<div class="f" id="fk"><label for="wk">Clé privée de visualisation <small>(view key, 64 caractères)</small></label><textarea id="wk" rows="2" spellcheck="false" autocapitalize="off" placeholder="Clé de visualisation privée"></textarea><div class="msg">Réglages du portefeuille → Clés → « Clé de visualisation privée » (Secret view key).</div></div>' +
      '<div class="alert stop hidden" id="stop"></div>' +
      '<div class="f" id="fd"><label for="wd">Date de création du portefeuille <small>(approximative)</small></label><input id="wd" type="date" min="2014-04-18" max="' + new Date().toISOString().slice(0, 10) + '"><div class="msg" id="wdm"></div></div>' +
      '<details class="adv"><summary>Je connais la hauteur de restauration</summary><div class="f mt"><label for="wh">Hauteur de bloc <small>(prioritaire sur la date)</small></label><input id="wh" inputmode="numeric" placeholder="Ex. 3 100 000"><div class="msg">Dans Feather ou Monero GUI : Réglages du portefeuille → « Restore height ».</div></div></details>' +
      '<div class="f"><label for="wapp">Application d\u2019origine <small>(facultatif)</small></label><select id="wapp"><option>Feather</option><option>Cake Wallet</option><option>Monero GUI</option><option>Monerujo</option><option>Stack Wallet</option><option>Autre</option></select></div>' +
      (needPass ? '<h2>Protection sur cet appareil</h2><div class="f"><label for="p1">Phrase secrète <small>(8 caractères minimum)</small></label><input id="p1" type="password" autocomplete="new-password"></div>' +
        '<div class="f" id="fp"><label for="p2">Confirmez la phrase secrète</label><input id="p2" type="password" autocomplete="new-password"><div class="msg">Elle chiffre vos clés (AES-256). Elle n\u2019est enregistrée nulle part et ne peut pas être récupérée.</div></div>' : '') +
      '<button class="btn" id="addb" disabled>Ajouter en lecture seule</button></form>' +
      '<p class="note">' + KEY_MSG + '</p>';
  };
  views.reglages = function () {
    var p = S.settings;
    var h = header() + '<h1 class="title">Réglages</h1>';
    var ui = self.PxTheme ? PxTheme.get() : 'classique';
    h += '<h2>Apparence</h2><div class="card"><div class="row"><div class="t"><div>Thème</div><small>« matrix » : police monospace et pluie de code orange en fond. « classique » : l\u2019interface d\u2019origine.</small></div></div>' +
      '<div class="opts" role="radiogroup" aria-label="Apparence">' + ['matrix', 'classique'].map(function (t) { return '<button class="opt' + (ui === t ? ' on' : '') + '" role="radio" aria-checked="' + (ui === t) + '" data-ui="' + t + '">' + t + '</button>'; }).join('') + '</div></div>';
    h += '<h2>Mode</h2><div class="card"><div class="row"><div class="t"><div>Mode démo</div><small>Données fictives, aucune connexion</small></div><button class="pill' + (S.demo ? ' on' : '') + '" data-act="' + (S.demo ? 'quit-demo' : 'demo') + '">' + (S.demo ? 'Activé' : 'Désactivé') + '</button></div></div>';
    if (!S.demo && V.isOpen()) {
      h += '<h2>Portefeuilles</h2><div class="card">' + (S.wallets.map(function (w) { return '<div class="row"><div class="t"><div>' + esc(w.label) + '</div><small><span class="addr mono">' + esc(K.short(w.address)) + '</span> · view key chiffrée</small></div><button class="lockbtn" data-del-w="' + esc(w.id) + '" aria-label="Retirer">✕</button></div>'; }).join('') || '<p class="empty">Aucun.</p>') + '</div><a class="btn ghost mt" href="#/ajouter">Ajouter un portefeuille</a>';
      var custom = p.node && p.node !== 'auto' && Sync.NODES.indexOf(p.node) < 0;
      h += '<h2>Synchronisation</h2><form id="setf" class="card"><div class="f mt"><label for="pv">Source</label><select id="pv">' + Object.keys(Sync.providers).filter(function (k) { return k !== 'demo'; }).map(function (k) { return '<option value="' + k + '"' + (p.provider === k ? ' selected' : '') + '>' + esc(Sync.providers[k].label) + '</option>'; }).join('') + '</select><div class="msg">' + esc(Sync.get(p.provider).description) + '</div></div>';
      if (p.provider !== 'lws') {
        h += '<div class="f"><label for="nd">Nœud Monero</label><select id="nd"><option value="auto"' + (!p.node || p.node === 'auto' ? ' selected' : '') + '>Automatique (nœuds publics testés)</option>' +
          Sync.NODES.map(function (u) { return '<option value="' + esc(u) + '"' + (p.node === u ? ' selected' : '') + '>' + esc(hostOf(u)) + '</option>'; }).join('') +
          '<option value="custom"' + (custom ? ' selected' : '') + '>Mon propre nœud…</option></select></div>' +
          '<div class="f' + (custom ? '' : ' hidden') + '" id="fcn"><label for="cn">Adresse de votre nœud <small>(https://)</small></label><input id="cn" inputmode="url" autocapitalize="off" spellcheck="false" value="' + esc(custom ? p.node : p.customNode || '') + '" placeholder="https://mon-noeud.exemple:18089"><div class="msg">Le nœud doit autoriser les requêtes du navigateur : lancez monerod avec <span class="mono">--rpc-access-control-origins=' + esc(location.origin) + '</span> derrière un certificat https.</div></div>' +
          '<button type="button" class="btn ghost" data-act="test-node">Tester le nœud</button><div class="msg node-test" id="ntm">' + (S.nodeTest ? esc(S.nodeTest) : '') + '</div>' +
          '<div class="alert info"><b>Confidentialité</b><br>Votre view key ne quitte jamais l\u2019appareil : le nœud ne fait que fournir des blocs. Il voit en revanche votre adresse IP et le moment où vous synchronisez. <b>Utiliser votre propre nœud est le plus privé.</b> Les nœuds .onion (Tor) ne sont pas joignables depuis un navigateur classique.</div>';
      } else {
        h += '<div class="f"><label for="lu">Serveur monero-lws</label><input id="lu" inputmode="url" autocapitalize="off" value="' + esc(p.lwsUrl) + '" placeholder="https://lws.exemple"></div>' +
          '<div class="alert warn">Avec cette source, la view key est transmise à <b>votre</b> serveur pour qu\u2019il scanne. Elle ne permet aucun envoi, mais révèle vos entrées.</div>';
      }
      h += '<button class="btn">Enregistrer</button><div class="f"></div></form>';
      h += '<h2>Solde exact</h2><div class="card"><div class="row"><div class="t"><div>Key images</div><small>' + (S.wallets.filter(function (w) { return S.kis[w.id]; }).length) + ' portefeuille' + (S.wallets.length > 1 ? 's' : '') + ' sur ' + S.wallets.length + ' avec key images importées</small></div><a class="pill" href="#/exact">Gérer</a></div></div>';
      h += '<h2>Cours du XMR</h2><div class="card"><div class="row"><div class="t"><div>Devise de l\u2019onglet Prix</div><small>Euro par défaut. Les alertes gardent la devise choisie à leur création.</small></div></div><div class="opts">' + ['eur', 'usd'].map(function (c) { return '<button class="opt' + (S.prix.cur === c ? ' on' : '') + '" data-pcur="' + c + '">' + (c === 'eur' ? 'euro (€)' : 'dollar ($)') + '</button>'; }).join('') + '</div></div>';
      h += '<h2>Contre-valeur en euros</h2><div class="card"><div class="row"><div class="t"><div>Afficher le solde en €</div><small>Cours XMR/EUR via CoinGecko (ou Kraken). Aucune adresse ni clé n\u2019est envoyée.</small></div><button class="pill' + (p.price ? ' on' : '') + '" data-act="toggle-price">' + (p.price ? 'Activé' : 'Désactivé') + '</button></div></div>';
      h += '<h2>Données de synchronisation</h2><div class="card">' + S.wallets.map(function (w) {
        var r = S.results[w.id];
        return '<div class="row"><div class="t"><div>' + esc(w.label) + '</div><small>Depuis le bloc ' + nf(w.restoreHeight || 0) + ' (≈ ' + new Date(Sync.dateFromHeight(w.restoreHeight || 0)).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) + ')' + (r ? ' · lu jusqu\u2019au bloc ' + nf(r.balance.height) : '') + '</small></div><button class="pill" data-rescan="' + esc(w.id) + '">Relire</button></div>';
      }).join('') + '</div>';
      h += '<h2>Sécurité</h2><button class="btn ghost" data-act="lock">Verrouiller maintenant</button>';
    }
    if (S.vaultExists) h += '<button class="btn danger mt" data-act="wipe">Tout effacer de cet appareil</button>';
    return h + '<h2>À propos</h2><div class="alert info"><b>Prelevox</b> est la déclinaison Monero de Prelevo. Aucune clé de dépense n\u2019est acceptée, aucune fonction d\u2019envoi n\u2019existe. Clés chiffrées par AES-GCM 256 bits (PBKDF2-SHA-256, 600 000 itérations) dans le stockage local du navigateur.</div>' + note();
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
      else setF('fa', parsed.network === 'mainnet' ? 'ok' : 'bad', parsed.network !== 'mainnet' ? 'Adresse ' + parsed.network + ' : Prelevox ne suit que le réseau principal (mainnet).' : parsed.type === 'subaddress' ? '✓ Sous-adresse valide. L\u2019adresse principale est recommandée pour voir tout le portefeuille.' : '✓ Adresse Monero valide (' + (parsed.type === 'integrated' ? 'intégrée' : 'principale') + ').');
      keyRes = null; stop.classList.add('hidden');
      if (kv) {
        keyRes = K.checkKey(parsed, kv);
        if (keyRes.kind === 'spend' || keyRes.kind === 'seed') {
          k.value = ''; setF('fk', 'bad', 'Champ effacé par sécurité.');
          stop.innerHTML = '⛔ <b>' + (keyRes.kind === 'spend' ? 'Clé de dépense détectée' : 'Phrase de récupération détectée') + '.</b> ' + esc(keyRes.error);
          stop.classList.remove('hidden');
        } else setF('fk', keyRes.ok ? 'ok' : 'bad', keyRes.ok ? '✓ Clé de visualisation : elle correspond bien à cette adresse.' : keyRes.error);
      } else setF('fk', null);
      var passOk = true;
      if (p1) { passOk = p1.value.length >= 8 && p1.value === p2.value; if (p2.value) setF('fp', passOk ? 'ok' : 'bad', passOk ? '✓ Les deux phrases correspondent.' : p1.value.length < 8 ? '8 caractères minimum.' : 'Les deux phrases ne correspondent pas.'); }
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
      var from = new Date(Sync.dateFromHeight(r.height)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      wdm.textContent = (r.src === 'default' ? 'Sans date, Prelevox lit les 30 derniers jours seulement (depuis le ' + from + '). Indiquez la date de création pour voir tout l\u2019historique.' :
        'Lecture à partir du bloc ' + nf(r.height) + ' (≈ ' + from + (r.src === 'date' ? ', avec quelques jours de marge' : '') + ').') + ' Environ ' + nf(blocks) + ' blocs à lire' + (blocks > 200000 ? ' : la première synchro peut durer longtemps.' : '.');
    }
    wd.addEventListener('input', showRestore); wh.addEventListener('input', showRestore); showRestore();
    ['wa', 'wk', 'wl', 'p1', 'p2'].forEach(function (id) { var e = document.getElementById(id); if (e) e.addEventListener('input', check); });
    document.getElementById('addf').addEventListener('submit', async function (ev) {
      ev.preventDefault(); check(); if (b.disabled) return;
      b.disabled = true; b.textContent = 'Chiffrement…';
      try {
        if (!S.vaultExists) { await V.create(p1.value); S.vaultExists = true; }
        var ri = restoreInfo();
        var w = { label: document.getElementById('wl').value.trim(), address: parsed.address, viewKey: k.value.trim().toLowerCase(),
          restoreHeight: ri.height, restoreSource: ri.src, app: document.getElementById('wapp').value, added: Date.now() };
        await V.save('wallet', uid(), w);
        k.value = ''; S.demo = false; await V.setSetting('demo', false);
        await loadReal(); toast('Portefeuille ajouté et chiffré sur cet appareil.'); location.hash = '#/soldes';
        setTimeout(function () { syncAll(); refreshPrice(); }, 50);
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Ajouter en lecture seule'; }
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
    if (r === 'prix') { tickUpdated(); if (!S.prix.snap && !S.prix.loading) loadPrice(false); }
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
        if (f.size > 20 * 1024 * 1024) return toast('Fichier trop volumineux pour des key images.');
        toast('Lecture du fichier…');
        try {
          var p = K.parseAddress(w.address);
          var parsed = await KI.parse(new Uint8Array(await f.arrayBuffer()), w.viewKey, { spend: p.publicSpend, view: p.publicView });
          var prev = await V.load('ki', 'ki-' + id);
          var merged = KI.merge(prev, parsed);
          if (merged.offset > 0 && !prev) toast('Export partiel détecté : pour un résultat fiable, refaites l\u2019export avec « all ».');
          var rec = { format: merged.format, offset: merged.offset, items: merged.items, count: merged.items.length, importedAt: Date.now(), exportedAt: f.lastModified || Date.now(), fileName: String(f.name || '').slice(0, 80) };
          await V.save('ki', 'ki-' + id, rec);
          S.kis[id] = { count: rec.count, importedAt: rec.importedAt, exportedAt: rec.exportedAt, format: rec.format, fileName: rec.fileName };
          parsed = merged = rec = prev = null;
          toast(S.kis[id].count ? nf(S.kis[id].count) + ' key image' + (S.kis[id].count > 1 ? 's' : '') + ' importée' + (S.kis[id].count > 1 ? 's' : '') + ' (chiffrées). Vérification…' : 'Fichier valide, mais il ne contient aucune key image.');
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
      if (!(amt > 0)) return toast('Montant invalide.');
      await V.save('sub', 's' + uid(), { label: document.getElementById('sl').value.trim(), amount: amt, period: document.getElementById('sp').value,
        nextTs: new Date(document.getElementById('sd').value + 'T09:00').getTime(), walletId: document.getElementById('sw').value, source: 'manuel' });
      S.subs = await V.list('sub'); toast('Abonnement enregistré (chiffré).'); render();
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
      await V.setSetting('sync', S.settings); toast('Réglages enregistrés.');
    });
  }
  async function testNodeUi() {
    var m = document.getElementById('ntm'), node = readNodeChoice();
    m.className = 'msg node-test'; m.textContent = 'Test en cours…';
    try {
      if (node === 'auto') {
        var ok = 0, res = await Promise.all(Sync.NODES.map(function (u) { return Sync.testNode(u, 8000).then(function () { ok++; return true; }, function () { return false; }); }));
        S.nodeTest = ok + ' nœud' + (ok > 1 ? 's' : '') + ' public' + (ok > 1 ? 's' : '') + ' sur ' + res.length + ' répond' + (ok > 1 ? 'ent' : '') + ' depuis ce navigateur.';
        m.classList.add(ok ? 'ok' : 'bad');
      } else {
        var r = await Sync.testNode(node);
        S.nodeTest = '✓ ' + hostOf(r.url) + ' répond : bloc ' + nf(r.height) + (r.restricted ? '' : ' · accès complet') + '.';
        m.classList.add('ok');
      }
    } catch (err) { S.nodeTest = err.message; m.classList.add('bad'); }
    m.textContent = S.nodeTest;
  }
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-act],[data-del-w],[data-del-sub],[data-rescan],[data-kitab],[data-ki-out],[data-ki-del],button[data-ui],[data-pcur],[data-pper],[data-alk],[data-alc],[data-al-del],[data-al-rearm]'); if (!t) return;
    if (t.dataset.pcur) { S.prix.cur = t.dataset.pcur; S.sheet.cur = null; await V.setSetting('priceCur', S.prix.cur); if (route() === 'prix') { paintPrix(); loadPrice(false); } else { skipScroll = true; render(); } return; }
    if (t.dataset.pper) { S.prix.period = t.dataset.pper; paintPrix(); loadPrice(false); return; }
    if (t.dataset.alk) { S.sheet.kind = t.dataset.alk; openSheet(); return; }
    if (t.dataset.alc) { S.sheet.cur = t.dataset.alc; openSheet(); return; }
    if (t.dataset.alDel) { S.alerts = S.alerts.filter(function (a) { return a.id !== t.dataset.alDel; }); await V.setSetting('alerts', S.alerts); toast('Alerte supprimée.'); if (S.sheet.open) openSheet(); else paintPrix(); return; }
    if (t.dataset.alRearm) { S.alerts.forEach(function (a) { if (a.id === t.dataset.alRearm) a.firedAt = 0; }); await V.setSetting('alerts', S.alerts); toast('Alerte réactivée.'); if (S.sheet.open) openSheet(); else paintPrix(); return; }
    if (t.dataset.ui && t.tagName === 'BUTTON') { if (self.PxTheme) PxTheme.set(t.dataset.ui); toast(t.dataset.ui === 'matrix' ? 'Apparence « matrix » activée.' : 'Apparence « classique » activée.'); skipScroll = true; var y1 = window.scrollY; render(); window.scrollTo(0, y1); return; }
    if (t.dataset.kitab) { S.kiTab = t.dataset.kitab; skipScroll = true; var y0 = window.scrollY; render(); window.scrollTo(0, y0); return; }
    if (t.dataset.kiOut) {
      if (S.sync) return toast('Attendez la fin de la synchronisation en cours.');
      var wo = S.wallets.find(function (x) { return x.id === t.dataset.kiOut; }); t.disabled = true; t.textContent = 'Préparation…';
      try {
        var ex = await Sync.exportOutputs(wo, await V.load('wstate', 'st-' + wo.id));
        download(ex.bytes, 'prelevox_' + (wo.label || 'portefeuille').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) + '_outputs');
        toast(nf(ex.count) + ' sortie' + (ex.count > 1 ? 's' : '') + ' exportée' + (ex.count > 1 ? 's' : '') + '. Ouvrez ce fichier dans Feather.');
      } catch (err) { toast(err.message || String(err)); }
      t.disabled = false; t.textContent = 'Exporter mes sorties'; return;
    }
    if (t.dataset.kiDel) {
      if (S.sync) return toast('Attendez la fin de la synchronisation en cours.');
      if (confirm('Retirer les key images de ce portefeuille ? Le solde redeviendra estimé (relecture du portefeuille).')) { var kd = t.dataset.kiDel; await V.remove('ki-' + kd); await V.remove('st-' + kd); await V.remove('cache-' + kd); delete S.kis[kd]; delete S.results[kd]; location.hash = '#/soldes'; syncAll(kd); }
      return;
    }
    if (t.dataset.rescan) {
      if (S.sync) return toast('Attendez la fin de la synchronisation en cours.');
      if (confirm('Relire ce portefeuille depuis sa hauteur de restauration ? Cela peut prendre quelques minutes.')) { await V.remove('st-' + t.dataset.rescan); await V.remove('cache-' + t.dataset.rescan); delete S.results[t.dataset.rescan]; location.hash = '#/soldes'; syncAll(t.dataset.rescan); }
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
    else if (a === 'notif') { try { await Notification.requestPermission(); } catch (err) {} if (S.sheet.open) openSheet(); }
    else if (a === 'test-node') { testNodeUi(); }
    else if (a === 'toggle-price') { S.settings.price = !S.settings.price; await V.setSetting('sync', S.settings); if (S.settings.price) refreshPrice(true); else S.price = null; skipScroll = true; render(); }
    else if (a === 'wipe') { if (confirm('Effacer le coffre, les portefeuilles et les réglages de cet appareil ? Vos fonds ne sont pas concernés.')) { await V.wipe(); location.hash = '#/bienvenue'; location.reload(); } }
    else if (t.dataset.delW) { if (confirm('Retirer ce portefeuille de Prelevox ? (Vos fonds ne bougent pas.)')) { if (S.sync) cancelSync(); await V.remove(t.dataset.delW); await V.remove('cache-' + t.dataset.delW); await V.remove('st-' + t.dataset.delW); await V.remove('ki-' + t.dataset.delW); await loadReal(); render(); } }
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
      S.prix.cur = await V.getSetting('priceCur', 'eur'); S.alerts = await V.getSetting('alerts', []);
      var q = new URLSearchParams(location.search);
      if (q.get('demo') === '1') { S.demo = true; await V.setSetting('demo', true); }
      if (S.demo) await loadDemo();
    } catch (e) { console.error(e); }
    render();
    if (S.alerts.length) checkAlerts(); // à chaque lancement
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
    if (S.demo && route() !== 'prix') toast('Démo actualisée (données fictives).');
  }
  function tickUpdated() {
    clearInterval(tickUpdated.t);
    tickUpdated.t = setInterval(function () { var el = document.getElementById('pupd'); if (!el) return clearInterval(tickUpdated.t); if (S.prix.at) el.textContent = 'Dernière mise à jour ' + ago(S.prix.at); }, 1000);
  }
  setInterval(function () { // cours et alertes toutes les 2 min tant que l'app est visible
    if (document.visibilityState !== 'visible') return;
    if (route() === 'prix') loadPrice(true); else if (S.alerts.length) checkAlerts();
  }, 120000);
})();
