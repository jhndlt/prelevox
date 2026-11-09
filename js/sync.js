/* Prelevox – synchronisation, module isolé derrière une interface unique.
   Toute source de données implémente :
     { id, label, description, keysLeaveDevice:boolean,
       available(): Promise<boolean>,
       sync(wallet, settings): Promise<{ balance:{total,unlocked,height,syncedAt}, txs:[Tx], approxOut:boolean }> }
   Tx = { id, walletId, ts, amount (XMR, + entrée / − sortie), confirmations, label, kind:'in'|'out', approx }
   Aucune source ne peut envoyer de fonds : aucune ne reçoit de clé de dépense. */
(function (root) {
  'use strict';
  var PICO = 1e12;
  function toXmr(v) { try { return Number(BigInt(String(v || 0))) / PICO; } catch (e) { return Number(v || 0) / PICO; } }

  /* 1) Démo : données fictives générées localement. */
  var DemoProvider = {
    id: 'demo', label: 'Démo (données fictives)', keysLeaveDevice: false,
    description: 'Aucune connexion réseau. Montants et opérations inventés pour présenter l’application.',
    available: function () { return Promise.resolve(true); },
    sync: function (wallet) { return Promise.resolve(root.PxDemo.forWallet(wallet.id)); }
  };

  /* 2) monero-ts (WASM) : le portefeuille en lecture seule est reconstruit DANS le navigateur
        à partir de l'adresse + view key, et scanne les blocs d'un nœud Monero (monerod) que vous choisissez.
        Les clés ne quittent pas l'appareil ; le nœud ne voit que des requêtes de blocs.
        La bibliothèque (~10 Mo WASM) n'est PAS incluse : déposez-la dans vendor/monero-ts/ pour l'activer. */
  var MoneroTsProvider = {
    id: 'monero-ts', label: 'Nœud Monero + scan local (monero-ts)', keysLeaveDevice: false,
    description: 'Scan des blocs dans votre navigateur. Les clés restent sur l’appareil. Nécessite le module monero-ts (non inclus) et un nœud acceptant les requêtes du navigateur (CORS).',
    available: async function () {
      if (root.moneroTs) return true;
      try {
        await new Promise(function (res, rej) {
          var s = document.createElement('script'); s.src = 'vendor/monero-ts/monero.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
        return !!root.moneroTs;
      } catch (e) { return false; }
    },
    sync: async function (wallet, settings) {
      if (!(await MoneroTsProvider.available())) throw new Error('Le module monero-ts n’est pas installé dans cette version.');
      var m = root.moneroTs;
      var w = await m.createWalletFull({
        networkType: m.MoneroNetworkType.MAINNET,
        primaryAddress: wallet.address,
        privateViewKey: wallet.viewKey,          // jamais de privateSpendKey
        restoreHeight: Number(wallet.restoreHeight || 0),
        server: { uri: settings.nodeUrl }
      });
      try {
        await w.sync();
        var height = await w.getHeight();
        var txs = (await w.getTxs()).map(function (t) {
          var inc = t.getIncomingAmount ? toXmr(t.getIncomingAmount() || 0) : 0;
          var out = t.getOutgoingAmount ? toXmr(t.getOutgoingAmount() || 0) : 0;
          var amount = inc - out;
          return { id: t.getHash(), walletId: wallet.id, ts: (t.getBlock() ? t.getBlock().getTimestamp() * 1000 : Date.now()),
            amount: amount, confirmations: t.getNumConfirmations() || 0, kind: amount >= 0 ? 'in' : 'out',
            label: amount >= 0 ? 'Reçu' : 'Sortie détectée', approx: amount < 0 };
        });
        return { balance: { total: toXmr(await w.getBalance()), unlocked: toXmr(await w.getUnlockedBalance()), height: height, syncedAt: Date.now() }, txs: txs, approxOut: true };
      } finally { await w.close(false); }
    }
  };

  /* 3) Serveur « light wallet » (API MyMonero / monero-lws) que VOUS hébergez.
        Plus léger, mais l'adresse et la view key sont transmises à ce serveur pour qu'il scanne.
        Désactivé par défaut ; à n'utiliser qu'avec votre propre monero-lws. */
  function post(base, path, body) {
    return fetch(base.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('Le serveur a répondu ' + r.status + '.'); return r.json(); });
  }
  var LwsProvider = {
    id: 'lws', label: 'Mon serveur monero-lws', keysLeaveDevice: true,
    description: 'Votre propre serveur light wallet scanne pour vous. La view key lui est transmise (lecture seule, aucun envoi possible).',
    available: function () { return Promise.resolve(true); },
    sync: async function (wallet, settings) {
      var base = settings.lwsUrl; if (!base) throw new Error('Indiquez l’adresse de votre serveur monero-lws dans Réglages.');
      var cred = { address: wallet.address, view_key: wallet.viewKey };
      await post(base, '/login', Object.assign({ create_account: true, generated_locally: false }, cred)).catch(function () {});
      var info = await post(base, '/get_address_info', cred);
      var list = await post(base, '/get_address_txs', cred);
      var tip = Number(list.blockchain_height || info.blockchain_height || 0);
      var txs = (list.transactions || []).map(function (t) {
        var amount = toXmr(t.total_received) - toXmr(t.total_sent);
        return { id: t.hash, walletId: wallet.id, ts: Date.parse(t.timestamp) || Date.now(), amount: amount,
          confirmations: t.mempool ? 0 : Math.max(0, tip - Number(t.height || tip) + 1), kind: amount >= 0 ? 'in' : 'out',
          label: amount >= 0 ? (t.coinbase ? 'Récompense de minage' : 'Reçu') : 'Sortie détectée', approx: amount < 0 };
      });
      var total = toXmr(info.total_received) - toXmr(info.total_sent);
      return { balance: { total: total, unlocked: total - toXmr(info.locked_funds), height: Number(info.scanned_block_height || 0), syncedAt: Date.now() }, txs: txs, approxOut: true };
    }
  };

  var providers = { demo: DemoProvider, 'monero-ts': MoneroTsProvider, lws: LwsProvider };
  root.PxSync = {
    providers: providers,
    get: function (id) { return providers[id] || DemoProvider; },
    /* Détection d'abonnements : sorties de même montant (±3 %) à intervalle régulier. */
    detectRecurring: function (txs) {
      var outs = txs.filter(function (t) { return t.amount < 0; }).sort(function (a, b) { return a.ts - b.ts; });
      var groups = [];
      outs.forEach(function (t) {
        var g = groups.find(function (g) { return g.walletId === t.walletId && Math.abs(g.amount - t.amount) <= Math.abs(g.amount) * 0.03; });
        if (g) g.items.push(t); else groups.push({ walletId: t.walletId, amount: t.amount, label: t.label, items: [t] });
      });
      var DAY = 864e5, out = [];
      groups.forEach(function (g) {
        if (g.items.length < 2) return;
        var gaps = []; for (var i = 1; i < g.items.length; i++) gaps.push((g.items[i].ts - g.items[i - 1].ts) / DAY);
        var avg = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
        var period = avg >= 6 && avg <= 8 ? 'hebdomadaire' : avg >= 26 && avg <= 34 ? 'mensuel' : avg >= 350 && avg <= 380 ? 'annuel' : null;
        if (!period) return;
        var last = g.items[g.items.length - 1];
        out.push({ id: 'det-' + last.id, walletId: g.walletId, label: g.label, amount: Math.abs(g.amount), period: period,
          nextTs: last.ts + Math.round(avg) * DAY, source: 'détecté', count: g.items.length });
      });
      return out;
    }
  };
})(self);
