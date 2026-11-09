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
  var TOTAL = 12.4830; /* = 8,2100 + 3,9730 + 0,3000 */
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

  /* Historique fictif du solde total, cohérent avec les txs du jour et finissant à TOTAL. */
  function history() {
    var now = new Date(); now.setHours(12, 0, 0, 0);
    var endTs = now.getTime();
    /* Bornes (jours en arrière → solde). Les valeurs récentes collent aux opérations démo. */
    var keys = [
      [365, 8.4500],
      [330, 8.6200],
      [300, 8.9100],
      [270, 9.0500],
      [240, 9.1800],
      [210, 9.4200],
      [180, 9.7800],
      [150, 10.0500],
      [120, 10.2800],
      [100, 10.4100],
      [90, 10.5600],
      [75, 10.7200],
      [60, 11.0100],
      [50, 11.1200],
      [40, 11.2800],
      [30, 11.4500],
      [21, 11.6200],
      [14, 11.7800],
      [10, 11.8500],
      [7, 11.9500],
      [5, 11.8900],
      [3, 12.0900], /* après la facture fictive +1,2 (net des abonnements) */
      [1, 11.7109], /* avant les opérations du jour (+0,85 −0,12 +0,0421) */
      [0, TOTAL]
    ];
    var points = [];
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      var from = a[0], to = b[0];
      var steps = Math.max(1, from - to);
      for (var s = 0; s < steps; s++) {
        var daysAgo = from - s;
        var t = s / steps;
        /* Interpolation douce + légère ondulation déterministe */
        var ease = t * t * (3 - 2 * t);
        var bal = a[1] + (b[1] - a[1]) * ease;
        bal += Math.sin(daysAgo * 0.37) * 0.018 + Math.cos(daysAgo * 0.11) * 0.012;
        points.push({ ts: endTs - daysAgo * DAY, balance: Math.round(bal * 10000) / 10000 });
      }
    }
    points.push({ ts: endTs, balance: TOTAL });
    /* Garantit le dernier point exact */
    points[points.length - 1].balance = TOTAL;
    return points;
  }

  root.PxDemo = {
    wallets: WALLETS, subs: SUBS, priceEur: 159.2, total: TOTAL, history: history,
    forWallet: function (id) {
      return { balance: { total: BAL[id] || 0, unlocked: BAL[id] || 0, height: 3512345, syncedAt: Date.now() }, txs: txs().filter(function (t) { return t.walletId === id; }), approxOut: true };
    }
  };
})(self);
