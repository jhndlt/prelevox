/* Prelevox – données de démonstration. TOUT est fictif : portefeuilles, adresses, montants, noms. */
(function (root) {
  'use strict';
  var DAY = 864e5;
  function at(daysAgo, h, m) { var d = new Date(); d.setHours(h, m || 0, 0, 0); return d.getTime() - daysAgo * DAY; }
  var WALLETS = [
    { id: 'demo-a', label: 'Portefeuille Démo A', app: 'Feather', address: '4A1xDEMOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxdemo', color: '#FF6600', demo: true },
    { id: 'demo-b', label: 'Portefeuille Démo B', app: 'Cake Wallet', address: '4B9zDEMOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxdemo', color: '#9A9CA3', demo: true },
    { id: 'demo-c', label: 'Épargne Démo C', app: 'Monero GUI', address: '89QaDEMOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxdemo', color: '#4C4C4C', demo: true }
  ];
  var BAL = { 'demo-a': 8.2100, 'demo-b': 3.9730, 'demo-c': 0.3000 };
  function monthly(walletId, label, amount, dayOfMonth, months) {
    var out = [], now = new Date();
    for (var i = 1; i <= months; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - i + (now.getDate() >= dayOfMonth ? 1 : 0), dayOfMonth, 9, 12);
      if (d.getTime() > Date.now()) continue;
      out.push({ id: walletId + '-' + label + '-' + i, walletId: walletId, ts: d.getTime(), amount: -amount, confirmations: 720 * i, kind: 'out', label: label, approx: true });
    }
    return out;
  }
  function txs() {
    var t = [
      { id: 'd1', walletId: 'demo-a', ts: at(0, 10, 42), amount: 0.85, confirmations: 10, kind: 'in', label: 'Reçu – Client fictif' },
      { id: 'd2', walletId: 'demo-b', ts: at(0, 8, 15), amount: -0.12, confirmations: 24, kind: 'out', label: 'Sortie détectée', approx: true },
      { id: 'd3', walletId: 'demo-a', ts: at(0, 7, 3), amount: 0.0421, confirmations: 31, kind: 'in', label: 'Don reçu (exemple)' },
      { id: 'd4', walletId: 'demo-c', ts: at(1, 18, 20), amount: 0.3, confirmations: 640, kind: 'in', label: 'Virement interne (exemple)' },
      { id: 'd5', walletId: 'demo-a', ts: at(3, 14, 5), amount: 1.2, confirmations: 2100, kind: 'in', label: 'Reçu – Facture fictive n° 12' }
    ];
    t = t.concat(monthly('demo-a', 'VPN Démo', 0.031, 15, 4), monthly('demo-a', 'Loyer serveur (exemple)', 0.095, 7, 4), monthly('demo-b', 'Hébergement e-mail Démo', 0.012, 22, 3));
    var y = new Date(); y = new Date(y.getFullYear() - 1, 1, 2, 11, 0).getTime();
    t.push({ id: 'd-stock', walletId: 'demo-b', ts: y, amount: -0.24, confirmations: 260000, kind: 'out', label: 'Stockage Démo (annuel)', approx: true });
    return t.sort(function (a, b) { return b.ts - a.ts; });
  }
  var SUBS = function () {
    var now = new Date();
    function next(day) { var d = new Date(now.getFullYear(), now.getMonth() + (now.getDate() >= day ? 1 : 0), day, 9, 0); return d.getTime(); }
    return [
      { id: 'demo-s1', walletId: 'demo-a', label: 'VPN Démo', amount: 0.031, period: 'mensuel', nextTs: next(15), source: 'détecté', icon: '🛰' },
      { id: 'demo-s2', walletId: 'demo-a', label: 'Loyer serveur (exemple)', amount: 0.095, period: 'mensuel', nextTs: next(7), source: 'détecté', icon: '🖥' },
      { id: 'demo-s3', walletId: 'demo-b', label: 'Hébergement e-mail Démo', amount: 0.012, period: 'mensuel', nextTs: next(22), source: 'détecté', icon: '✉' },
      { id: 'demo-s4', walletId: 'demo-b', label: 'Stockage Démo', amount: 0.24, period: 'annuel', nextTs: new Date(now.getFullYear() + 1, 1, 2).getTime(), source: 'manuel', icon: '☁' }
    ];
  };
  root.PxDemo = {
    wallets: WALLETS, subs: SUBS, priceEur: 159.2,
    forWallet: function (id) {
      return { balance: { total: BAL[id] || 0, unlocked: BAL[id] || 0, height: 3512345, syncedAt: Date.now() }, txs: txs().filter(function (t) { return t.walletId === id; }), approxOut: true };
    }
  };
})(self);
