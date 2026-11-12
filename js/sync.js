/* Prelevox – synchronisation, module isolé derrière une interface unique.
   Toute source de données implémente :
     { id, label, description, keysLeaveDevice:boolean,
       available(): Promise<boolean>,
       sync(wallet, settings, hooks): Promise<{ result:{ balance:{total,unlocked,height,syncedAt}, txs:[Tx], approxOut:boolean }, state?:object }> }
   Tx = { id, walletId, ts, amount (XMR, + entrée / − sortie), confirmations, label, kind:'in'|'out', approx, pending }
   hooks = { state, onProgress(info), onCheckpoint(state), onNode(url), isCancelled(), onHandle(handle) }
   Aucune source ne peut envoyer de fonds : aucune ne reçoit de clé de dépense. */
(function (root) {
  'use strict';
  var I18 = root.PxI18n || (typeof require === 'function' ? require('./i18n.js') : null); // textes : js/i18n.js
  function T(k, v) { return I18 ? I18.t(k, v) : k; }
  var PICO = 1e12, DAY = 864e5;
  function toXmr(v) { try { return Number(BigInt(String(v == null ? 0 : v))) / PICO; } catch (e) { return Number(v || 0) / PICO; } }

  /* ---------- Nœuds publics ----------
     Testés le 9 novembre 2026 depuis un navigateur (CORS + getblocks.bin) : synchro réelle réussie.
     Liste modifiable ; votre propre nœud reste le choix le plus privé. */
  var NODES = [
    'https://node.xmr.surf',
    'https://xmr.0xrpc.io',
    'https://monero.econanon.com',
    'https://connect.xmr-node.org',
    'https://monero.definitelynotafed.com',
    'https://monero.openinternet.io',
    'https://xmr.okade.pro',
    'https://xmr.surveillance.monster',
    'https://xmr.unshakled.net'
  ];

  /* ---------- Date ↔ hauteur de bloc (interpolation sur des repères réels de la chaîne) ---------- */
  var ANCHORS = [[1, 1397818193], [1009827, 1458748658], [1400000, 1505525706], [1800000, 1553698458], [2200000, 1601703776],
    [2600000, 1649731449], [3000000, 1697813342], [3400000, 1745849558], [3700000, 1781905872], [3802800, 1794250905]];
  function heightFromDate(ts) {
    var s = Math.floor(ts / 1000), a = ANCHORS;
    if (s <= a[0][1]) return 0;
    for (var i = 1; i < a.length; i++) {
      if (s <= a[i][1]) return Math.floor(a[i - 1][0] + (s - a[i - 1][1]) * (a[i][0] - a[i - 1][0]) / (a[i][1] - a[i - 1][1]));
    }
    var l = a[a.length - 1]; return Math.floor(l[0] + (s - l[1]) / 120); // 2 min par bloc depuis 2016
  }
  function dateFromHeight(h) {
    var a = ANCHORS;
    if (h <= a[0][0]) return a[0][1] * 1000;
    for (var i = 1; i < a.length; i++) {
      if (h <= a[i][0]) return (a[i - 1][1] + (h - a[i - 1][0]) * (a[i][1] - a[i - 1][1]) / (a[i][0] - a[i - 1][0])) * 1000;
    }
    var l = a[a.length - 1]; return (l[1] + (h - l[0]) * 120) * 1000;
  }
  /* Hauteur de restauration conseillée pour une date de création : marge de 3 jours avant. */
  function restoreHeightForDate(ts) { return Math.max(0, heightFromDate(ts - 3 * DAY)); }

  /* ---------- Erreurs lisibles ---------- */
  function host(u) { try { return new URL(u).host; } catch (e) { return u || '?'; } }
  function friendlyError(e, node) {
    var m = String((e && e.message) || e || '');
    if (/annul/i.test(m) || (e && e.cancelled)) return T('sy.cancelled');
    if (/Network Error|Failed to fetch|NetworkError|Load failed|not connected to daemon|daemon error|thread pool|no connection|ERR_|CORS|timed? ?out|Timeout|abort/i.test(m))
      return T('sy.cors', { h: host(node) });
    if (/invalid.*(address|key)|address.*invalid|key.*invalid|Invalid primary/i.test(m)) return T('sy.badKey');
    if (/memory|Out of bounds|RangeError/i.test(m)) return T('sy.memory');
    if (/worker|importScripts|monero-ts/i.test(m)) return T('sy.module');
    return T('sy.generic', { m: m.slice(0, 160) });
  }

  /* ---------- Vérification d'un nœud (requête « get_info », sans aucune donnée de portefeuille) ---------- */
  function checkNodeUrl(u) {
    if (!u) throw new Error(T('sy.nodeMissing'));
    var url; try { url = new URL(u.trim()); } catch (e) { throw new Error(T('sy.nodeBad')); }
    if (/\.onion$/i.test(url.hostname)) throw new Error(T('sy.onion'));
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
    if (url.protocol === 'http:' && !local && root.location && root.location.protocol === 'https:')
      throw new Error(T('sy.http'));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(T('sy.nodeBad2'));
    return url.origin + url.pathname.replace(/\/+$/, '');
  }
  async function testNode(u, timeoutMs) {
    var base = checkNodeUrl(u);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { ctl && ctl.abort(); }, timeoutMs || 8000);
    try {
      var r = await fetch(base + '/json_rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        body: JSON.stringify({ jsonrpc: '2.0', id: '0', method: 'get_info' }), signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error(T('sy.status', { s: r.status }));
      var j = await r.json(), info = j && j.result;
      if (!info || info.status !== 'OK') throw new Error(T('sy.unexpected'));
      if (info.nettype && info.nettype !== 'mainnet') throw new Error(T('sy.nettype', { n: info.nettype }));
      if (info.synchronized === false) throw new Error(T('sy.notSynced'));
      return { url: base, height: info.height, restricted: !!info.restricted };
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error(T('sy.timeout', { h: host(base) }));
      if (e instanceof TypeError) throw new Error(T('sy.unreach', { h: host(base) }));
      throw e;
    } finally { clearTimeout(t); }
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  var lastGood = null;
  async function pickNode(settings, exclude) {
    if (settings && settings.node && settings.node !== 'auto') return (await testNode(settings.node)).url;
    exclude = exclude || [];
    var list = shuffle(NODES); if (lastGood) list.unshift(lastGood);
    list = list.filter(function (u, i) { return list.indexOf(u) === i && exclude.indexOf(u) < 0; });
    if (exclude.length && exclude.indexOf(lastGood) >= 0) lastGood = null;
    var errs = [];
    for (var i = 0; i < list.length; i++) {
      try { var r = await testNode(list[i], 6000); lastGood = r.url; return r.url; } catch (e) { errs.push(e.message); }
    }
    throw new Error(T('sy.noPublic'));
  }

  /* ---------- base64 <-> octets (pour stocker l'état du portefeuille chiffré dans le coffre) ---------- */
  function b64e(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function b64d(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function rndPass() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }

  /* 1) Démo : données fictives générées localement. */
  var DemoProvider = {
    id: 'demo', get label() { return T('sy.demoLabel'); }, keysLeaveDevice: false,
    get description() { return T('sy.demoDesc'); },
    available: function () { return Promise.resolve(true); },
    sync: function (wallet) { return Promise.resolve({ result: root.PxDemo.forWallet(wallet.id) }); }
  };

  /* 2) monero-ts (WASM, licence MIT, inclus dans vendor/monero-ts/) : un portefeuille EN LECTURE SEULE est
        reconstruit DANS le navigateur (worker) à partir de l'adresse + view key, et scanne les blocs d'un nœud
        Monero. Les clés ne quittent pas l'appareil ; le nœud ne voit que des téléchargements de blocs. */
  var libPromise = null;
  function loadLib() {
    if (root.moneroTs) return Promise.resolve(root.moneroTs);
    if (!libPromise) libPromise = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'vendor/monero-ts/monero-ts.js?v=3'; s.async = true;
      s.onload = function () { root.moneroTs ? res(root.moneroTs) : rej(new Error('monero-ts introuvable')); };
      s.onerror = function () { libPromise = null; rej(new Error(T('sy.libFail'))); };
      document.head.appendChild(s);
    }).then(function (m) {
      m.LibraryUtils.setWorkerDistPath(new URL('vendor/monero-ts/monero.worker.js?v=3', root.location.href).href);
      return m;
    });
    return libPromise;
  }
  /* ---------- iPhone / iPad : Safari met la page en pause en arrière-plan et limite la mémoire WASM ---------- */
  function isIOS() {
    try { if (/[?&]ios=1\b/.test(root.location.search)) return true; } catch (e) {}
    var n = root.navigator || {}, ua = n.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1);
  }
  /* Découpage de la synchro : à chaque tranche, l'état chiffré est sauvegardé (reprise sans perte).
     Sur iOS : tranches plus courtes (30 s ou 2 000 blocs) pour perdre peu si Safari suspend l'app,
     et worker WASM libéré à la fin (la mémoire d'un WebAssembly ne redescend jamais sinon). */
  function limits() { var ios = isIOS(); return { ios: ios, chunkMs: ios ? 30000 : 60000, chunkBlocks: ios ? 2000 : 20000, stallMs: 120000, maxFailover: 4 }; }
  function isNetErr(e) { return /Network Error|Failed to fetch|NetworkError|Load failed|not connected to daemon|no connection|ERR_|CORS|timed? ?out|Timeout|abort|daemon|bloqué|blocage/i.test(String((e && e.message) || e || '')); }
  function kiError(e) {
    var m = String((e && e.message) || e || '');
    if (/out of date|Offset larger/i.test(m)) return T('sy.kiOutdated');
    if (/Signature check failed|signature/i.test(m)) return T('sy.kiSig');
    if (/validity domain|ge_frombytes|Key image/i.test(m)) return T('sy.kiInvalid');
    if (isNetErr(e)) return T('sy.kiNet');
    return T('sy.kiGeneric', { m: m.slice(0, 140) });
  }

  var MoneroTsProvider = {
    id: 'monero-ts', get label() { return T('sy.tsLabel'); }, keysLeaveDevice: false,
    get description() { return T('sy.tsDesc'); },
    available: function () { return loadLib().then(function () { return true; }, function () { return false; }); },
    sync: async function (wallet, settings, hooks) {
      hooks = hooks || {};
      var L = limits();
      var cancelled = function () { return hooks.isCancelled && hooks.isCancelled(); };
      var m = await loadLib();
      var tried = [], node = await pickNode(settings);
      hooks.onNode && hooks.onNode(node);
      if (cancelled()) throw Object.assign(new Error('annulée'), { cancelled: true });
      var st = hooks.state, w, restore = Number(wallet.restoreHeight || 0);
      try {
        if (st && st.v === 1 && st.address === wallet.address && st.restoreHeight === restore && st.keysData) {
          w = await m.openWalletFull({ networkType: m.MoneroNetworkType.MAINNET, password: st.pw, keysData: b64d(st.keysData), cacheData: st.cacheData ? b64d(st.cacheData) : undefined, server: { uri: node } });
        } else {
          st = { v: 1, address: wallet.address, restoreHeight: restore, pw: rndPass() };
          w = await m.createWalletFull({ networkType: m.MoneroNetworkType.MAINNET, password: st.pw, primaryAddress: wallet.address,
            privateViewKey: wallet.viewKey /* jamais de privateSpendKey */, restoreHeight: restore, server: { uri: node } });
        }
      } catch (e) { throw new Error(friendlyError(e, node)); }
      var flags = { paused: false, stalled: false, chunkStop: false };
      var handle = {
        stop: function () { try { w.stopSyncing(); } catch (e) {} },
        /* Pause (app passée en arrière-plan) : on arrête proprement, l'état est sauvegardé, la reprise se fera au retour. */
        pause: function () { flags.paused = true; try { w.stopSyncing(); } catch (e) {} }
      };
      hooks.onHandle && hooks.onHandle(handle);
      var save = async function () {
        var data = await w.getData(), h = await w.getHeight();
        st.keysData = b64e(data[0]); st.cacheData = b64e(data[1]); st.height = h; st.savedAt = Date.now();
        data = null;
        if (hooks.onCheckpoint) await hooks.onCheckpoint(st, h);
        return h;
      };
      try {
        if (!(await w.isViewOnly())) throw new Error(T('sy.notVo'));
        var lastProgress = Date.now(), chunkStart = null;
        var Listener = function () {}; Listener.prototype = Object.create(m.MoneroWalletListener.prototype);
        Listener.prototype.onSyncProgress = async function (height, startHeight, endHeight) {
          lastProgress = Date.now();
          if (chunkStart == null || height < chunkStart) chunkStart = height;
          if (height - chunkStart >= L.chunkBlocks && height >= restore) { flags.chunkStop = true; try { w.stopSyncing(); } catch (e) {} } // tranche de blocs atteinte
          var base = Math.min(restore, endHeight), span = Math.max(1, endHeight - base), done = Math.max(0, height - base);
          hooks.onProgress && hooks.onProgress({ height: height, end: endHeight, pct: Math.min(1, done / span), remaining: Math.max(0, endHeight - height), preparing: height < base, node: node });
        };
        var listener = new Listener(), failovers = 0, lastH = -1, still = 0;
        for (var round = 0; round < 100000; round++) {
          flags.chunkStop = false; flags.stalled = false; chunkStart = null; lastProgress = Date.now();
          var timer = setTimeout(function () { try { w.stopSyncing(); } catch (e) {} }, L.chunkMs);
          var watchdog = setInterval(function () { if (Date.now() - lastProgress > L.stallMs) { flags.stalled = true; try { w.stopSyncing(); } catch (e) {} } }, 5000);
          var syncErr = null, tip = null, h = null;
          try { await w.sync(listener); } catch (e) { syncErr = e; } finally { clearTimeout(timer); clearInterval(watchdog); }
          if (flags.paused) { try { await save(); } catch (e) {} throw Object.assign(new Error('pause'), { paused: true }); }
          if (!syncErr && !flags.stalled) { try { tip = await w.getDaemonHeight(); } catch (e) { syncErr = e; } }
          if (!syncErr && !flags.stalled) {
            h = await save();
            if (cancelled()) throw Object.assign(new Error('annulée'), { cancelled: true });
            if (h >= tip) break;
            if (h <= lastH) { if (++still >= 3) flags.stalled = true; } else still = 0; // aucun bloc lu : nœud bloqué
            lastH = Math.max(lastH, h);
          }
          if (syncErr || flags.stalled) {
            /* Nœud tombé en cours de route : on garde la progression et on passe au nœud suivant (mode automatique). */
            var nodeDown = flags.stalled || (syncErr && isNetErr(syncErr));
            if (syncErr && !nodeDown) { try { await testNode(node, 6000); } catch (e) { nodeDown = true; } } // erreur interne (« Exception in thread pool »…) : le nœud répond-il encore ?
            if (!nodeDown || failovers >= L.maxFailover || (settings && settings.node && settings.node !== 'auto')) {
              try { await save(); } catch (e) {}
              throw syncErr || new Error('Timeout: node stopped responding');
            }
            failovers++; still = 0; tried.push(node);
            try { await save(); } catch (e) {}
            node = await pickNode(settings, tried);
            await w.setDaemonConnection(node);
            hooks.onNode && hooks.onNode(node, { failover: true });
            continue;
          }
          if (cancelled()) throw Object.assign(new Error('annulée'), { cancelled: true });
        }
        /* Solde exact : key images importées par vous (fichier Feather / monero-wallet-cli), appliquées une fois. */
        var ki = hooks.keyImages, kiInfo = null;
        if (ki && ki.items) {
          var fp = root.PxKeyImages ? root.PxKeyImages.fingerprint(ki) : String(ki.importedAt);
          kiInfo = { at: ki.exportedAt || ki.importedAt, count: ki.items.length, applied: st.kiApplied === fp };
          if (!kiInfo.applied) {
            hooks.onProgress && hooks.onProgress({ keyImages: true, node: node });
            try {
              var res = await w.importKeyImages(ki.items.map(function (x) { return new m.MoneroKeyImage(x[0], x[1]); }), ki.offset || 0);
              st.kiApplied = fp; kiInfo.applied = true; kiInfo.spent = toXmr(res.getSpentAmount()); kiInfo.unspent = toXmr(res.getUnspentAmount());
              await save();
            } catch (e) { kiInfo.error = kiError(e); }
          }
          if (kiInfo.applied) {
            try { var outs = await w.getOutputs(); kiInfo.missing = outs.filter(function (o) { var k = o.getKeyImage && o.getKeyImage(); return !(k && k.getHex && k.getHex()); }).length; } catch (e) { kiInfo.missing = null; }
          }
        }
        var exact = !!(kiInfo && kiInfo.applied && !kiInfo.error && kiInfo.missing === 0);
        var height = await w.getHeight();
        var txs = (await w.getTxs()).map(function (t) {
          var inc = toXmr(t.getIncomingAmount ? t.getIncomingAmount() || 0 : 0);
          var out = toXmr(t.getOutgoingAmount ? t.getOutgoingAmount() || 0 : 0);
          var amount = inc - out, blk = t.getBlock && t.getBlock();
          var pending = !t.getIsConfirmed();
          var known = !!(kiInfo && kiInfo.applied && amount < 0); // sortie reconnue grâce aux key images
          return { id: t.getHash(), walletId: wallet.id, ts: blk && blk.getTimestamp() ? blk.getTimestamp() * 1000 : Date.now(),
            amount: amount, confirmations: pending ? 0 : (t.getNumConfirmations() || 0), kind: amount >= 0 ? 'in' : 'out', pending: pending,
            label: amount >= 0 ? (t.getIsMinerTx && t.getIsMinerTx() ? 'Récompense de minage' : 'Reçu') : known ? 'Envoyé' : 'Sortie détectée', approx: amount < 0 && !known };
        });
        var result = { balance: { total: toXmr(await w.getBalance()), unlocked: toXmr(await w.getUnlockedBalance()), height: height, syncedAt: Date.now(),
          restoreHeight: restore, node: node, exact: exact, keyImages: kiInfo }, txs: txs, approxOut: !exact };
        return { result: result, state: st };
      } catch (e) {
        if (e && (e.cancelled || e.paused)) throw e;
        throw new Error(friendlyError(e, node));
      } finally {
        try { await w.close(false); } catch (e) {} // libère la mémoire du worker (et la view key qu'elle contient)
        if (L.ios) { try { await m.LibraryUtils.terminateWorker(); } catch (e) {} }
      }
    }
  };

  /* Fichier « outputs » (sorties reçues, chiffré avec la view key) à charger dans Feather pour obtenir les key images
     correspondant EXACTEMENT aux sorties vues par Prelevox. Aucune clé privée n'y figure. Hors ligne : aucun nœud contacté. */
  async function exportOutputs(wallet, st) {
    if (!st || !st.keysData) throw new Error(T('sy.syncFirst'));
    var m = await loadLib(), w;
    w = await m.openWalletFull({ networkType: m.MoneroNetworkType.MAINNET, password: st.pw, keysData: b64d(st.keysData), cacheData: st.cacheData ? b64d(st.cacheData) : undefined });
    try {
      if (!(await w.isViewOnly())) throw new Error(T('sy.notVo2'));
      var hex = await w.exportOutputs(true), u = new Uint8Array(hex.length / 2);
      for (var i = 0; i < u.length; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16);
      var n = (await w.getOutputs()).length;
      return { bytes: u, count: n };
    } finally { try { await w.close(false); } catch (e) {} if (isIOS()) { try { await m.LibraryUtils.terminateWorker(); } catch (e) {} } }
  }

  /* 3) Serveur « light wallet » (API MyMonero / monero-lws) que VOUS hébergez.
        Plus léger, mais l'adresse et la view key sont transmises à ce serveur pour qu'il scanne.
        Désactivé par défaut ; à n'utiliser qu'avec votre propre monero-lws. */
  function post(base, path, body) {
    return fetch(base.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (!r.ok) throw new Error(T('sy.srvStatus', { s: r.status })); return r.json(); });
  }
  var LwsProvider = {
    id: 'lws', get label() { return T('sy.lwsLabel'); }, keysLeaveDevice: true,
    get description() { return T('sy.lwsDesc'); },
    available: function () { return Promise.resolve(true); },
    sync: async function (wallet, settings) {
      var base = settings.lwsUrl; if (!base) throw new Error(T('sy.lwsMissing'));
      base = checkNodeUrl(base);
      var cred = { address: wallet.address, view_key: wallet.viewKey };
      await post(base, '/login', Object.assign({ create_account: true, generated_locally: false }, cred)).catch(function () {});
      var info = await post(base, '/get_address_info', cred);
      var list = await post(base, '/get_address_txs', cred);
      var tip = Number(list.blockchain_height || info.blockchain_height || 0);
      var txs = (list.transactions || []).map(function (t) {
        var amount = toXmr(t.total_received) - toXmr(t.total_sent);
        return { id: t.hash, walletId: wallet.id, ts: Date.parse(t.timestamp) || Date.now(), amount: amount, pending: !!t.mempool,
          confirmations: t.mempool ? 0 : Math.max(0, tip - Number(t.height || tip) + 1), kind: amount >= 0 ? 'in' : 'out',
          label: amount >= 0 ? (t.coinbase ? 'Récompense de minage' : 'Reçu') : 'Sortie détectée', approx: amount < 0 };
      });
      var total = toXmr(info.total_received) - toXmr(info.total_sent);
      return { result: { balance: { total: total, unlocked: total - toXmr(info.locked_funds), height: Number(info.scanned_block_height || 0), syncedAt: Date.now() }, txs: txs, approxOut: true } };
    }
  };

  /* ---------- Cours XMR → EUR (facultatif) : aucune adresse ni clé n'est envoyée ---------- */
  async function fetchPriceEur() {
    var opts = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };
    try {
      var r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=eur', opts);
      var j = await r.json(); if (j && j.monero && j.monero.eur > 0) return { eur: j.monero.eur, source: 'CoinGecko', at: Date.now() };
    } catch (e) {}
    var r2 = await fetch('https://api.kraken.com/0/public/Ticker?pair=XMREUR', opts);
    var j2 = await r2.json(), k = j2 && j2.result && Object.keys(j2.result)[0];
    var p = k && Number(j2.result[k].c[0]);
    if (p > 0) return { eur: p, source: 'Kraken', at: Date.now() };
    throw new Error('Cours indisponible.');
  }

  var providers = { demo: DemoProvider, 'monero-ts': MoneroTsProvider, lws: LwsProvider };
  root.PxSync = {
    providers: providers, NODES: NODES,
    get: function (id) { return providers[id] || MoneroTsProvider; },
    heightFromDate: heightFromDate, dateFromHeight: dateFromHeight, restoreHeightForDate: restoreHeightForDate,
    testNode: testNode, checkNodeUrl: checkNodeUrl, pickNode: pickNode, isIOS: isIOS, limits: limits, exportOutputs: exportOutputs, friendlyError: friendlyError, fetchPriceEur: fetchPriceEur, loadLib: loadLib,
    /* Détection d'abonnements : sorties de même montant (±3 %) à intervalle régulier. */
    detectRecurring: function (txs) {
      var outs = txs.filter(function (t) { return t.amount < 0; }).sort(function (a, b) { return a.ts - b.ts; });
      var groups = [];
      outs.forEach(function (t) {
        var g = groups.find(function (g) { return g.walletId === t.walletId && Math.abs(g.amount - t.amount) <= Math.abs(g.amount) * 0.03; });
        if (g) g.items.push(t); else groups.push({ walletId: t.walletId, amount: t.amount, label: t.label, items: [t] });
      });
      var out = [];
      groups.forEach(function (g) {
        if (g.items.length < 2) return;
        var gaps = []; for (var i = 1; i < g.items.length; i++) gaps.push((g.items[i].ts - g.items[i - 1].ts) / DAY);
        var avg = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
        var regular = gaps.every(function (x) { return Math.abs(x - avg) <= Math.max(2, avg * 0.15); });
        var period = avg >= 6 && avg <= 8 ? 'hebdomadaire' : avg >= 26 && avg <= 34 ? 'mensuel' : avg >= 350 && avg <= 380 ? 'annuel' : null;
        if (!period || !regular) return;
        var last = g.items[g.items.length - 1];
        out.push({ id: 'det-' + last.id, walletId: g.walletId, label: 'Paiement ' + period + ' (détecté)', amount: Math.abs(g.amount), period: period,
          nextTs: last.ts + Math.round(avg) * DAY, source: 'détecté', count: g.items.length, approx: true });
      });
      return out;
    },
    /* Entrées récurrentes (salaire, revenus réguliers) : même logique sur les entrées. */
    detectRecurringIn: function (txs) {
      var flipped = txs.filter(function (t) { return t.amount > 0 && !t.pending; }).map(function (t) { return Object.assign({}, t, { amount: -t.amount }); });
      return root.PxSync.detectRecurring(flipped).map(function (s) { return Object.assign(s, { id: 'in-' + s.id, label: 'Entrée ' + s.period + ' (détectée)', incoming: true }); });
    }
  };
})(self);
