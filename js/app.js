/* Prelevox – application. Lecture seule : aucune fonction d'envoi n'existe dans ce code. */
(function () {
  'use strict';
  var K = self.PxKeys, V = self.PxVault, Demo = self.PxDemo, Sync = self.PxSync, Chart = self.PxChart;
  var $app = document.getElementById('app'), $tab = document.getElementById('tabbar'), $toast = document.getElementById('toast');
  var DAY = 864e5;
  var KEY_MSG = 'Ce n\u2019est pas un portefeuille, c\u2019est une télécommande qui se branche sur vos portefeuilles Monero pour une belle interface.';
  var S = { demo: false, vaultExists: false, wallets: [], results: {}, subs: [], chartPeriod: 30, settings: { provider: 'monero-ts', nodeUrl: '', lwsUrl: '' } };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function xmr(n, sign) { var s = Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }); return sign ? (n >= 0 ? '+' : '\u2212') + s : (n < 0 ? '\u2212' : '') + s; }
  function eur(n) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }
  function hm(ts) { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function dmy(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
  function sameDay(a, b) { a = new Date(a); b = new Date(b); return a.toDateString() === b.toDateString(); }
  function inDays(ts) { var a = new Date(); a.setHours(0, 0, 0, 0); var b = new Date(ts); b.setHours(0, 0, 0, 0); return Math.round((b - a) / DAY); }
  function when(ts) { var d = inDays(ts); return d === 0 ? 'aujourd\u2019hui' : d === 1 ? 'demain' : 'dans ' + d + ' jours'; }
  function toast(t) { $toast.textContent = t; $toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.classList.remove('show'); }, 2600); }
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
  function wname(id) { var w = wallets().find(function (x) { return x.id === id; }); return w ? w.label : ''; }
  function widx(id) { return Math.max(0, wallets().findIndex(function (x) { return x.id === id; })) % 3; }
  function total() { return wallets().reduce(function (a, w) { var r = S.results[w.id]; return a + (r ? r.balance.total : 0); }, 0); }
  /* Historique du solde total pour le graphique d'accueil */
  function historyPoints() {
    if (S.demo) return Demo.history();
    var ws = wallets();
    if (!ws.some(function (w) { return S.results[w.id]; })) return [];
    var bal = total();
    var list = txsAll().slice().sort(function (a, b) { return b.ts - a.ts; });
    if (!list.length) return [{ ts: Date.now() - DAY, balance: bal }, { ts: Date.now(), balance: bal }];
    var points = [{ ts: Date.now(), balance: bal }];
    for (var i = 0; i < list.length; i++) {
      bal -= list[i].amount;
      points.push({ ts: list[i].ts, balance: Math.round(Math.max(0, bal) * 1e4) / 1e4 });
    }
    return points.sort(function (a, b) { return a.ts - b.ts; });
  }

  async function loadDemo() { S.results = {}; for (var i = 0; i < Demo.wallets.length; i++) S.results[Demo.wallets[i].id] = await Sync.get('demo').sync(Demo.wallets[i]); }
  async function loadReal() {
    S.wallets = await V.list('wallet');
    S.subs = await V.list('sub');
    var cache = await V.list('cache'); S.results = {};
    cache.forEach(function (c) { S.results[c.id.replace(/^cache-/, '')] = c.data; });
  }
  async function syncAll() {
    if (S.demo) { await loadDemo(); toast('Démo actualisée (données fictives).'); return render(); }
    var p = Sync.get(S.settings.provider);
    if (!(await p.available())) { toast('Synchronisation indisponible : module « ' + p.label + ' » non installé.'); return; }
    for (var i = 0; i < S.wallets.length; i++) {
      var w = S.wallets[i];
      try { var r = await p.sync(w, S.settings); S.results[w.id] = r; await V.save('cache', 'cache-' + w.id, { data: r }); }
      catch (e) { toast(w.label + ' : ' + e.message); }
    }
    render();
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
      hm(t.ts) + ' · ' + esc(wname(t.walletId)) + ' · ' + (t.confirmations >= 10 ? t.confirmations.toLocaleString('fr-FR') + ' confirmations' : (t.confirmations || 0) + '/10 confirmations') + '</small></div><b class="' + (t.amount >= 0 ? 'in' : '') + '">' +
      xmr(t.amount, true) + (t.approx ? '<span class="approx">estimée</span>' : '') + '</b></div>';
  }
  function subRow(s, withWhen) {
    return '<div class="row"><span class="ic">' + esc(s.icon || '↻') + '</span><div class="t"><div>' + esc(s.label) + '</div><small>' +
      (withWhen ? when(s.nextTs) + ' · ' + dmy(s.nextTs) : s.period + ' · prochain le ' + dmy(s.nextTs)) + (s.source === 'détecté' ? ' · détecté' : '') + '</small></div><b>' + xmr(-s.amount, true) + '</b>' +
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
    var soon = subsAll().filter(function (s) { return inDays(s.nextTs) <= 14; }).sort(function (a, b) { return a.nextTs - b.nextTs; }).slice(0, 2);
    var synced = ws.some(function (w) { return S.results[w.id]; });
    var h = header() + '<div class="hero"><small>Solde total · ' + ws.length + ' portefeuille' + (ws.length > 1 ? 's' : '') + ' (lecture seule)</small><h1>' + (synced ? xmr(t) : '—') + ' <em>XMR</em></h1>' +
      '<p>' + (S.demo ? '≈ ' + eur(t * Demo.priceEur) + ' (exemple)' : synced ? 'Dernière synchro : ' + hm(Math.max.apply(null, ws.map(function (w) { return S.results[w.id] ? S.results[w.id].balance.syncedAt : 0; }))) : 'Pas encore synchronisé') + '</p>' +
      '<div class="chips"><span>👁 View keys</span><span>🔒 Chiffré localement</span><span>⛔ Aucun envoi</span></div></div>';
    h += Chart.cardHtml(historyPoints(), S.chartPeriod);
    h += '<h2>Soldes <a href="#/ajouter">+ Ajouter</a></h2><div class="card">' + (ws.length ? ws.map(function (w, i) {
      var r = S.results[w.id];
      return '<div class="row"><span class="ic c' + (i % 3) + '"><span class="dot"></span></span><div class="t"><div>' + esc(w.label) + '</div><small>' + esc(w.app || 'Monero') + ' · ' + esc(K.short(w.address)) + '</small></div><b>' + (r ? xmr(r.balance.total) : '<span class="small">non synchronisé</span>') + '</b></div>';
    }).join('') : '<p class="empty">Aucun portefeuille pour l\u2019instant.</p>') + '</div>';
    h += '<h2>Opérations du jour <a href="#/operations">Tout voir</a></h2><div class="card">' + (today.length ? today.map(txRow).join('') : '<p class="empty">Aucune opération aujourd\u2019hui.</p>') + '</div>';
    h += '<h2>Bientôt <a href="#/bientot">Tout voir</a></h2><div class="card">' + (soon.length ? soon.map(function (s) { return subRow(s, true); }).join('') : '<p class="empty">Rien de prévu dans les 14 prochains jours.</p>') + '</div>';
    if (!S.demo) h += '<button class="btn ghost mt" data-act="sync">Synchroniser</button>';
    return h + note();
  };
  views.operations = function () {
    var all = txsAll(), today = all.filter(function (x) { return sameDay(x.ts, Date.now()); });
    var inn = today.filter(function (t) { return t.amount > 0; }).reduce(function (a, t) { return a + t.amount; }, 0);
    var out = today.filter(function (t) { return t.amount < 0; }).reduce(function (a, t) { return a + t.amount; }, 0);
    var h = header() + '<h1 class="title">Opérations du jour</h1><p class="sub">' + new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>' +
      '<div class="kpis"><div class="kpi"><small>Entrées</small><b class="in">' + xmr(inn, true) + '</b></div><div class="kpi"><small>Sorties estimées</small><b>' + xmr(out, true) + '</b></div></div>' +
      '<h2>Aujourd\u2019hui</h2><div class="card">' + (today.length ? today.map(txRow).join('') : '<p class="empty">Aucune opération aujourd\u2019hui.</p>') + '</div>';
    var prev = all.filter(function (x) { return !sameDay(x.ts, Date.now()) && x.ts > Date.now() - 7 * DAY; });
    if (prev.length) h += '<h2>7 derniers jours</h2><div class="card">' + prev.map(txRow).join('') + '</div>';
    return h + '<div class="alert info"><b>Pourquoi « estimée » ?</b> Avec une clé de visualisation, Monero montre avec certitude ce que vous recevez. Les sorties sont déduites sans la clé de dépense : leur montant peut être approximatif.</div>';
  };
  views.bientot = function () {
    var list = subsAll().filter(function (s) { return inDays(s.nextTs) <= 30; }).sort(function (a, b) { return a.nextTs - b.nextTs; });
    var sum = list.reduce(function (a, s) { return a + s.amount; }, 0);
    return header() + '<h1 class="title">Bientôt</h1><p class="sub">Paiements attendus dans les 30 prochains jours.</p>' +
      '<div class="kpis"><div class="kpi"><small>À prévoir</small><b>' + xmr(-sum, true) + '</b></div><div class="kpi"><small>Échéances</small><b>' + list.length + '</b></div></div>' +
      '<h2>Calendrier</h2><div class="card">' + (list.length ? list.map(function (s) { return subRow(s, true); }).join('') : '<p class="empty">Rien de prévu. Ajoutez vos abonnements pour les voir ici.</p>') + '</div>' +
      '<p class="note">Prelevox vous prévient, mais ne paie rien : c\u2019est vous qui envoyez depuis votre portefeuille.</p>';
  };
  views.abonnements = function () {
    var list = subsAll().sort(function (a, b) { return a.nextTs - b.nextTs; });
    var monthly = list.reduce(function (a, s) { return a + (s.period === 'annuel' ? s.amount / 12 : s.period === 'hebdomadaire' ? s.amount * 52 / 12 : s.amount); }, 0);
    var h = header() + '<h1 class="title">Abonnements</h1><p class="sub">Détectés dans vos sorties ou ajoutés par vous.</p>' +
      '<div class="kpis"><div class="kpi"><small>Par mois (moyenne)</small><b>' + xmr(-monthly, true) + '</b></div><div class="kpi"><small>Par an</small><b>' + xmr(-monthly * 12, true) + '</b></div></div>' +
      '<h2>Vos abonnements</h2><div class="card">' + (list.length ? list.map(function (s) { return subRow(s, false); }).join('') : '<p class="empty">Aucun abonnement pour l\u2019instant.</p>') + '</div>';
    if (S.demo) return h + '<p class="note">En démo, l\u2019ajout est désactivé. Ajoutez un vrai portefeuille pour gérer vos abonnements.</p>';
    return h + '<h2>Ajouter un abonnement</h2><form id="subf" class="card" ><div class="f mt"><label for="sl">Nom</label><input id="sl" required maxlength="40" placeholder="Ex. VPN, serveur…"></div>' +
      '<div class="f"><label for="sa">Montant (XMR)</label><input id="sa" required inputmode="decimal" placeholder="0,0300"></div>' +
      '<div class="f"><label for="sp">Fréquence</label><select id="sp"><option value="mensuel">Mensuel</option><option value="annuel">Annuel</option><option value="hebdomadaire">Hebdomadaire</option></select></div>' +
      '<div class="f"><label for="sd">Prochaine échéance</label><input id="sd" type="date" required></div>' +
      '<div class="f"><label for="sw">Portefeuille</label><select id="sw">' + S.wallets.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.label) + '</option>'; }).join('') + '</select></div>' +
      '<button class="btn" ' + (S.wallets.length ? '' : 'disabled') + '>Enregistrer (chiffré)</button><div class="f"></div></form>';
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
      '<div class="f"><label for="wh">Hauteur de restauration <small>(facultatif, accélère la synchro)</small></label><input id="wh" inputmode="numeric" placeholder="Ex. 3 100 000"></div>' +
      '<div class="f"><label for="wapp">Application d\u2019origine <small>(facultatif)</small></label><select id="wapp"><option>Feather</option><option>Cake Wallet</option><option>Monero GUI</option><option>Monerujo</option><option>Stack Wallet</option><option>Autre</option></select></div>' +
      (needPass ? '<h2>Protection sur cet appareil</h2><div class="f"><label for="p1">Phrase secrète <small>(8 caractères minimum)</small></label><input id="p1" type="password" autocomplete="new-password"></div>' +
        '<div class="f" id="fp"><label for="p2">Confirmez la phrase secrète</label><input id="p2" type="password" autocomplete="new-password"><div class="msg">Elle chiffre vos clés (AES-256). Elle n\u2019est enregistrée nulle part et ne peut pas être récupérée.</div></div>' : '') +
      '<button class="btn" id="addb" disabled>Ajouter en lecture seule</button></form>' +
      '<p class="note">' + KEY_MSG + '</p>';
  };
  views.reglages = function () {
    var p = S.settings;
    var h = header() + '<h1 class="title">Réglages</h1>';
    h += '<h2>Mode</h2><div class="card"><div class="row"><div class="t"><div>Mode démo</div><small>Données fictives, aucune connexion</small></div><button class="pill' + (S.demo ? ' on' : '') + '" data-act="' + (S.demo ? 'quit-demo' : 'demo') + '">' + (S.demo ? 'Activé' : 'Désactivé') + '</button></div></div>';
    if (!S.demo && V.isOpen()) {
      h += '<h2>Portefeuilles</h2><div class="card">' + (S.wallets.map(function (w) { return '<div class="row"><div class="t"><div>' + esc(w.label) + '</div><small class="mono">' + esc(K.short(w.address)) + ' · view key chiffrée</small></div><button class="lockbtn" data-del-w="' + esc(w.id) + '" aria-label="Retirer">✕</button></div>'; }).join('') || '<p class="empty">Aucun.</p>') + '</div><a class="btn ghost mt" href="#/ajouter">Ajouter un portefeuille</a>';
      h += '<h2>Synchronisation</h2><form id="setf" class="card"><div class="f mt"><label for="pv">Source</label><select id="pv">' + Object.keys(Sync.providers).filter(function (k) { return k !== 'demo'; }).map(function (k) { return '<option value="' + k + '"' + (p.provider === k ? ' selected' : '') + '>' + esc(Sync.providers[k].label) + '</option>'; }).join('') + '</select><div class="msg">' + esc(Sync.get(p.provider).description) + '</div></div>' +
        '<div class="f"><label for="nu">Nœud Monero (monerod)</label><input id="nu" value="' + esc(p.nodeUrl) + '" placeholder="https://mon-noeud.exemple:18089"></div>' +
        '<div class="f"><label for="lu">Serveur monero-lws <small>(si choisi)</small></label><input id="lu" value="' + esc(p.lwsUrl) + '" placeholder="https://lws.exemple"></div>' +
        (Sync.get(p.provider).keysLeaveDevice ? '<div class="alert warn">Avec cette source, la view key est transmise à <b>votre</b> serveur pour qu\u2019il scanne. Elle ne permet aucun envoi, mais révèle vos entrées.</div>' : '') +
        '<button class="btn">Enregistrer</button><div class="f"></div></form>';
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
    ['wa', 'wk', 'wl', 'p1', 'p2'].forEach(function (id) { var e = document.getElementById(id); if (e) e.addEventListener('input', check); });
    document.getElementById('addf').addEventListener('submit', async function (ev) {
      ev.preventDefault(); check(); if (b.disabled) return;
      b.disabled = true; b.textContent = 'Chiffrement…';
      try {
        if (!S.vaultExists) { await V.create(p1.value); S.vaultExists = true; }
        var w = { label: document.getElementById('wl').value.trim(), address: parsed.address, viewKey: k.value.trim().toLowerCase(),
          restoreHeight: parseInt(document.getElementById('wh').value.replace(/\D/g, ''), 10) || 0, app: document.getElementById('wapp').value, added: Date.now() };
        await V.save('wallet', uid(), w);
        k.value = ''; S.demo = false; await V.setSetting('demo', false);
        await loadReal(); toast('Portefeuille ajouté et chiffré sur cet appareil.'); location.hash = '#/soldes';
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Ajouter en lecture seule'; }
    });
  }

  /* ---------- Rendu & navigation ---------- */
  var TABS = ['soldes', 'operations', 'bientot', 'abonnements', 'reglages'];
  function route() {
    var r = (location.hash.replace(/^#\/?/, '') || 'soldes').split('?')[0];
    if (!views[r]) r = 'soldes';
    if (!S.demo) {
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
  function bindUnlock() {
    document.getElementById('unlock').addEventListener('submit', async function (e) {
      e.preventDefault();
      try { await V.unlock(document.getElementById('pw').value); await loadReal(); render(); }
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
  function bindSettings() {
    var f = document.getElementById('setf'); if (!f) return;
    document.getElementById('pv').addEventListener('change', function () { S.settings.provider = this.value; render(); });
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      S.settings = { provider: document.getElementById('pv').value, nodeUrl: document.getElementById('nu').value.trim(), lwsUrl: document.getElementById('lu').value.trim() };
      await V.setSetting('sync', S.settings); toast('Réglages enregistrés.');
    });
  }
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-act],[data-del-w],[data-del-sub]'); if (!t) return;
    var a = t.dataset.act;
    if (a === 'demo') { S.demo = true; await V.setSetting('demo', true); await loadDemo(); location.hash = '#/soldes'; render(); }
    else if (a === 'quit-demo') { S.demo = false; await V.setSetting('demo', false); S.results = {}; if (V.isOpen()) await loadReal(); location.hash = '#/soldes'; render(); }
    else if (a === 'lock') { V.lock(); }
    else if (a === 'sync') { toast('Synchronisation…'); syncAll(); }
    else if (a === 'wipe') { if (confirm('Effacer le coffre, les portefeuilles et les réglages de cet appareil ? Vos fonds ne sont pas concernés.')) { await V.wipe(); location.hash = '#/bienvenue'; location.reload(); } }
    else if (t.dataset.delW) { if (confirm('Retirer ce portefeuille de Prelevox ? (Vos fonds ne bougent pas.)')) { await V.remove(t.dataset.delW); await V.remove('cache-' + t.dataset.delW); await loadReal(); render(); } }
    else if (t.dataset.delSub) { await V.remove(t.dataset.delSub); S.subs = await V.list('sub'); render(); }
  });
  V.onChange(function () { S.wallets = []; S.results = S.demo ? S.results : {}; S.subs = []; render(); });
  window.addEventListener('hashchange', render);

  (async function boot() {
    try {
      S.vaultExists = await V.exists();
      S.demo = await V.getSetting('demo', false);
      S.settings = Object.assign(S.settings, await V.getSetting('sync', {}));
      var q = new URLSearchParams(location.search);
      if (q.get('demo') === '1') { S.demo = true; await V.setSetting('demo', true); }
      if (S.demo) await loadDemo();
    } catch (e) { console.error(e); }
    render();
  })();
})();
