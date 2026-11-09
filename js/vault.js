/* Prelevox – coffre local. Les clés (adresse + view key) sont chiffrées dans le
   navigateur avec AES-GCM 256 bits, clé dérivée de votre phrase secrète par
   PBKDF2-SHA-256 (600 000 itérations). Stockage : IndexedDB. Rien ne part sur un serveur.
   La clé AES n'est jamais exportable et ne vit qu'en mémoire tant que le coffre est ouvert. */
(function (root) {
  'use strict';
  var DB = 'prelevox', VER = 1, ITER = 600000, CHECK = 'prelevox-coffre-ok';
  var key = null, lockTimer = null, AUTOLOCK_MS = 5 * 60 * 1000, listeners = [];

  function open() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { db.close(); res(out && 'result' in out ? out.result : out); };
        t.onerror = function () { db.close(); rej(t.error); };
      });
    });
  }
  var get = function (store, id) { return tx(store, 'readonly', function (s) { return s.get(id); }); };
  var put = function (store, v) { return tx(store, 'readwrite', function (s) { return s.put(v); }); };
  var del = function (store, id) { return tx(store, 'readwrite', function (s) { return s.delete(id); }); };
  var all = function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); };

  var enc = new TextEncoder(), dec = new TextDecoder();
  async function derive(pass, salt, iter) {
    var base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(k, obj, aad) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(aad) }, k, enc.encode(JSON.stringify(obj)));
    return { iv: iv, ct: new Uint8Array(ct) };
  }
  async function unseal(k, rec, aad) {
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv, additionalData: enc.encode(aad) }, k, rec.ct);
    return JSON.parse(dec.decode(pt));
  }
  function touch() {
    if (!key) return;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(lock, AUTOLOCK_MS);
  }
  function lock() { key = null; clearTimeout(lockTimer); listeners.forEach(function (f) { f('locked'); }); }

  var Vault = {
    exists: async function () { return !!(await get('meta', 'vault')); },
    isOpen: function () { return !!key; },
    onChange: function (f) { listeners.push(f); },
    create: async function (pass) {
      if (typeof pass !== 'string' || pass.length < 8) throw new Error('Votre phrase secrète doit compter au moins 8 caractères.');
      if (await Vault.exists()) throw new Error('Un coffre existe déjà.');
      var salt = crypto.getRandomValues(new Uint8Array(16));
      var k = await derive(pass, salt, ITER);
      var chk = await seal(k, CHECK, 'check');
      await put('meta', { id: 'vault', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: salt, check: chk, created: Date.now() });
      key = k; touch(); return true;
    },
    unlock: async function (pass) {
      var m = await get('meta', 'vault');
      if (!m) throw new Error('Aucun coffre.');
      var k = await derive(pass, m.salt, m.iter);
      try { if (await unseal(k, m.check, 'check') !== CHECK) throw 0; }
      catch (e) { throw new Error('Phrase secrète incorrecte.'); }
      key = k; touch(); return true;
    },
    lock: lock,
    touch: touch,
    /* Enregistre un objet chiffré (portefeuille, abonnement…). L'identifiant sert de donnée authentifiée. */
    save: async function (kind, id, obj) {
      if (!key) throw new Error('Coffre verrouillé.');
      touch();
      var s = await seal(key, obj, kind + ':' + id);
      await put('items', { id: id, kind: kind, iv: s.iv, ct: s.ct, updated: Date.now() });
    },
    list: async function (kind) {
      if (!key) throw new Error('Coffre verrouillé.');
      touch();
      var rows = (await all('items')).filter(function (r) { return r.kind === kind; });
      var out = [];
      for (var i = 0; i < rows.length; i++) { var o = await unseal(key, rows[i], kind + ':' + rows[i].id); o.id = rows[i].id; out.push(o); }
      return out;
    },
    remove: function (id) { touch(); return del('items', id); },
    /* Efface tout : coffre, portefeuilles, réglages. */
    wipe: function () { lock(); return new Promise(function (res) { var r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; }); },
    /* Réglages non sensibles (mode démo, nœud choisi) : en clair. */
    getSetting: async function (id, dflt) { var r = await get('meta', 'set:' + id); return r ? r.value : dflt; },
    setSetting: function (id, value) { return put('meta', { id: 'set:' + id, value: value }); }
  };
  ['pointerdown', 'keydown'].forEach(function (e) { root.addEventListener && root.addEventListener(e, touch, { passive: true }); });
  root.PxVault = Vault;
})(self);
