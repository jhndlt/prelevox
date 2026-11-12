/* Prelevox – lecture des « key images » pour un solde exact (tout se passe sur l'appareil).
   Formats acceptés :
   1. Fichier binaire wallet2 « Monero key image export\x03 » : monero-wallet-cli `export_key_images all <fichier>`
      et fichiers `*_keyImages` de Feather. Chiffré avec la view key (ChaCha20, clé = cn_slow_hash(view key)).
      Contenu : offset (4 o) · clé publique de dépense · clé publique de visualisation · N × (key image 32 o + signature 64 o).
   2. Le même fichier en hexadécimal (texte).
   3. JSON de monero-wallet-rpc `export_key_images` : { signed_key_images: [{ key_image, signature }], offset? }.
   Une key image ne permet AUCUN envoi : elle sert seulement à reconnaître les sorties déjà dépensées. */
(function (root) {
  'use strict';
  var I18 = root.PxI18n || (typeof require === 'function' ? require('./i18n.js') : null); // textes : js/i18n.js
  function T(k, v) { return I18 ? I18.t(k, v) : k; }
  var MAGIC = 'Monero key image export\u0003', ML = MAGIC.length;
  var wasm = null;
  function hex(u8) { return Array.from(u8, function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function unhex(s) { var u = new Uint8Array(s.length / 2); for (var i = 0; i < u.length; i++) u[i] = parseInt(s.substr(i * 2, 2), 16); return u; }
  function eq(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
  function err(code, msg) { return Object.assign(new Error(msg), { code: code }); }

  async function loadWasm(bytes) {
    if (wasm) return wasm;
    if (!bytes) { var r = await fetch('vendor/px-crypto/px-crypto.wasm?v=1', { credentials: 'omit' }); if (!r.ok) throw err('wasm', T('ki.wasm')); bytes = await r.arrayBuffer(); }
    var inst = null;
    var res = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: { random_get: function (p, n) { crypto.getRandomValues(new Uint8Array(inst.exports.memory.buffer, p, n)); return 0; } } });
    inst = res.instance || res; inst.exports._initialize && inst.exports._initialize();
    wasm = inst.exports; return wasm;
  }
  function call(fn, inputs, outLen) { // copie les entrées dans la mémoire WASM, appelle, relit la sortie, efface tout
    var e = wasm, ptrs = inputs.map(function (u) { var p = e.px_alloc(Math.max(1, u.length)); new Uint8Array(e.memory.buffer, p, u.length).set(u); return p; });
    var o = e.px_alloc(Math.max(1, outLen));
    try { fn(ptrs, o); return new Uint8Array(e.memory.buffer, o, outLen).slice(); }
    finally {
      ptrs.forEach(function (p, i) { new Uint8Array(e.memory.buffer, p, inputs[i].length).fill(0); e.px_free(p); });
      new Uint8Array(e.memory.buffer, o, outLen).fill(0); e.px_free(o);
    }
  }
  function chachaKey(viewKey) { return call(function (p, o) { wasm.px_cn_slow_hash_v0(p[0], 32, o); }, [viewKey], 32); }
  function chacha20(data, key, iv) { return call(function (p, o) { wasm.px_chacha20(p[0], data.length, p[1], p[2], o); }, [data, key, iv], data.length); }

  function startsWithMagic(u8) { if (u8.length < ML) return false; for (var i = 0; i < ML; i++) if (u8[i] !== MAGIC.charCodeAt(i)) return false; return true; }

  /* Déchiffre un fichier binaire wallet2. viewKeyHex : clé privée de visualisation ; pub : { spend, view } (Uint8Array 32). */
  async function decodeBinary(u8, viewKeyHex, pub) {
    await loadWasm();
    var body = u8.subarray(ML);
    if (body.length < 8 + 68 + 64) throw err('size', T('ki.short'));
    var iv = body.subarray(0, 8), ct = body.subarray(8, body.length - 64); // les 64 derniers octets = signature d'authentification
    var vk = unhex(viewKeyHex), key = chachaKey(vk); vk.fill(0);
    var pt = chacha20(ct, key, iv); key.fill(0);
    var offset = (pt[0] | (pt[1] << 8) | (pt[2] << 16) | (pt[3] << 24)) >>> 0;
    var spend = pt.subarray(4, 36), view = pt.subarray(36, 68);
    if (pub && (!eq(spend, pub.spend) || !eq(view, pub.view)))
      throw err('account', T('ki.account'));
    if ((pt.length - 68) % 96) throw err('size', T('ki.size'));
    var items = [];
    for (var i = 68; i < pt.length; i += 96) items.push([hex(pt.subarray(i, i + 32)), hex(pt.subarray(i + 32, i + 96))]);
    pt.fill(0);
    return { format: 'wallet2-binaire', offset: offset >>> 0, items: items };
  }
  function decodeJson(j) {
    var r = j && (j.result || j), list = Array.isArray(r) ? r : r && (r.signed_key_images || r.signedKeyImages || r.keyImages);
    if (!Array.isArray(list)) throw err('format', T('ki.json'));
    var items = list.map(function (k) {
      var ki = String(k.key_image || k.keyImage || k.hex || '').toLowerCase(), sig = String(k.signature || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(ki) || !/^[0-9a-f]{128}$/.test(sig)) throw err('format', T('ki.malformed'));
      return [ki, sig];
    });
    return { format: 'json-rpc', offset: Number(r.offset || 0) >>> 0, items: items };
  }
  /* Point d'entrée : octets du fichier → { format, offset, items:[[keyImageHex, signatureHex]], count }. */
  async function parse(bytes, viewKeyHex, pub) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), out;
    if (startsWithMagic(u8)) out = await decodeBinary(u8, viewKeyHex, pub);
    else {
      var text = new TextDecoder().decode(u8).trim();
      if (/^ur:xmr-keyimage\//i.test(text)) throw err('ur', T('ki.ur'));
      if (/^[0-9a-fA-F]+$/.test(text) && text.length % 2 === 0) {
        var b = unhex(text);
        if (!startsWithMagic(b)) throw err('format', T('ki.hex'));
        out = await decodeBinary(b, viewKeyHex, pub);
      } else {
        var j; try { j = JSON.parse(text); } catch (e) { throw err('format', T('ki.unknown')); }
        out = decodeJson(j);
      }
    }
    out.count = out.items.length;
    return out;
  }
  /* Fusion avec un import précédent (export partiel : seulement les nouvelles sorties, offset > 0). */
  function merge(prev, next) {
    if (!prev || !prev.items || next.offset === 0 || next.offset > prev.offset + prev.items.length || next.offset < prev.offset) return next;
    var items = prev.items.slice(0, next.offset - prev.offset).concat(next.items);
    return Object.assign({}, next, { offset: prev.offset, items: items, count: items.length, merged: true });
  }
  /* Empreinte courte d'un jeu de key images (pour savoir s'il a déjà été appliqué au portefeuille). */
  function fingerprint(ki) { var s = ki.offset + ':' + ki.items.length + ':' + (ki.items[0] ? ki.items[0][0] : '') + ':' + (ki.items.length ? ki.items[ki.items.length - 1][0] : ''); return s; }

  root.PxKeyImages = { parse: parse, merge: merge, fingerprint: fingerprint, loadWasm: loadWasm, MAGIC: MAGIC, _hex: hex, _unhex: unhex };
  if (typeof module !== 'undefined') module.exports = root.PxKeyImages;
})(typeof self !== 'undefined' ? self : this);
