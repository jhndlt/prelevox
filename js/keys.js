/* Prelevox – vérification des clés Monero, 100 % locale.
   Adresse (base58 Monero + somme de contrôle Keccak-256) et view key (Ed25519).
   Une clé privée de dépense (spend key) est détectée et REFUSÉE : on vérifie
   mathématiquement à quelle clé publique de l'adresse correspond la clé collée. */
(function (root) {
  'use strict';
  var I18 = root.PxI18n || (typeof require === 'function' ? require('./i18n.js') : null); // textes : js/i18n.js
  function T(k, v) { return I18 ? I18.t(k, v) : k; }

  /* ---------- Keccak-256 (variante Monero, padding 0x01) ---------- */
  var RC = ['0x1','0x8082','0x800000000000808a','0x8000000080008000','0x808b','0x80000001','0x8000000080008081','0x8000000000008009','0x8a','0x88','0x80008009','0x8000000a','0x8000808b','0x800000000000008b','0x8000000000008089','0x8000000000008003','0x8000000000008002','0x8000000000000080','0x800a','0x800000008000000a','0x8000000080008081','0x8000000000008080','0x80000001','0x8000000080008008'].map(BigInt);
  var ROT = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
  var M64 = (1n << 64n) - 1n;
  function rotl(x, n) { n = BigInt(n); return n === 0n ? x : ((x << n) | (x >> (64n - n))) & M64; }
  function keccakF(s) {
    for (var r = 0; r < 24; r++) {
      var C = [], D = [], x, y, B = new Array(25);
      for (x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
      for (x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (x = 0; x < 25; x++) s[x] ^= D[x % 5];
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) s[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & M64) & B[(x + 2) % 5 + 5 * y]);
      s[0] ^= RC[r];
    }
  }
  function keccak256(bytes) {
    var rate = 136, s = new Array(25).fill(0n);
    var len = bytes.length, padLen = rate - (len % rate);
    var m = new Uint8Array(len + padLen); m.set(bytes);
    m[len] |= 0x01; m[m.length - 1] |= 0x80;
    for (var off = 0; off < m.length; off += rate) {
      for (var i = 0; i < rate / 8; i++) {
        var lane = 0n;
        for (var b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(m[off + i * 8 + b]);
        s[i] ^= lane;
      }
      keccakF(s);
    }
    var out = new Uint8Array(32);
    for (var j = 0; j < 32; j++) out[j] = Number((s[j >> 3] >> BigInt(8 * (j & 7))) & 0xffn);
    return out;
  }

  /* ---------- Base58 Monero (blocs de 8 octets -> 11 caractères) ---------- */
  var ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  var ENC_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];
  function b58decode(str) {
    var full = Math.floor(str.length / 11), rest = str.length % 11;
    var lastSize = ENC_SIZES.indexOf(rest);
    if (lastSize < 0) throw new Error('longueur');
    var out = [];
    function block(chunk, size) {
      var n = 0n;
      for (var i = 0; i < chunk.length; i++) {
        var v = ALPHA.indexOf(chunk[i]);
        if (v < 0) throw new Error('caractère');
        n = n * 58n + BigInt(v);
      }
      if (n >> BigInt(8 * size)) throw new Error('débordement');
      for (var k = size - 1; k >= 0; k--) out.push(Number((n >> BigInt(8 * k)) & 0xffn));
    }
    for (var i = 0; i < full; i++) block(str.substr(i * 11, 11), 8);
    if (rest) block(str.substr(full * 11), lastSize);
    return new Uint8Array(out);
  }
  function b58encode(bytes) {
    var s = '';
    function block(chunk) {
      var n = 0n; for (var i = 0; i < chunk.length; i++) n = (n << 8n) | BigInt(chunk[i]);
      var size = ENC_SIZES[chunk.length], t = '';
      for (var k = 0; k < size; k++) { t = ALPHA[Number(n % 58n)] + t; n /= 58n; }
      s += t;
    }
    for (var i = 0; i < bytes.length; i += 8) block(bytes.subarray(i, Math.min(i + 8, bytes.length)));
    return s;
  }

  /* ---------- Ed25519 minimal (BigInt) ---------- */
  var P = (1n << 255n) - 19n;
  var L = (1n << 252n) + 27742317777372353535851937790883648493n;
  function mod(a, m) { m = m || P; var r = a % m; return r < 0n ? r + m : r; }
  function pow(b, e) { var r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; }
  function inv(a) { return pow(a, P - 2n); }
  var D = mod(-121665n * inv(121666n));
  var SQRTM1 = pow(2n, (P - 1n) / 4n);
  var GY = mod(4n * inv(5n));
  var G = decompress(encodeInt(GY));
  function encodeInt(n) { var o = new Uint8Array(32); for (var i = 0; i < 32; i++) { o[i] = Number(n & 0xffn); n >>= 8n; } return o; }
  function decodeInt(b) { var n = 0n; for (var i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; }
  function add(p, q) {
    var A = mod((p[1] - p[0]) * (q[1] - q[0])), B = mod((p[1] + p[0]) * (q[1] + q[0]));
    var C = mod(2n * p[3] * q[3] * D), Dd = mod(2n * p[2] * q[2]);
    var E = B - A, F = Dd - C, Gg = Dd + C, H = B + A;
    return [mod(E * F), mod(Gg * H), mod(F * Gg), mod(E * H)];
  }
  function mul(k, pt) {
    var r = [0n, 1n, 1n, 0n], q = pt;
    while (k > 0n) { if (k & 1n) r = add(r, q); q = add(q, q); k >>= 1n; }
    return r;
  }
  function compress(pt) {
    var zi = inv(pt[2]), x = mod(pt[0] * zi), y = mod(pt[1] * zi);
    var o = encodeInt(y); o[31] |= Number(x & 1n) << 7; return o;
  }
  function decompress(b) {
    var bb = b.slice(); var sign = bb[31] >> 7; bb[31] &= 0x7f;
    var y = decodeInt(bb); if (y >= P) return null;
    var u = mod(y * y - 1n), v = mod(D * y * y + 1n);
    var x = mod(u * pow(v, 3n) * pow(u * pow(v, 7n), (P - 5n) / 8n));
    if (mod(v * x * x) !== u) { if (mod(v * x * x) === mod(-u)) x = mod(x * SQRTM1); else return null; }
    if (Number(x & 1n) !== sign) x = mod(-x);
    if (x === 0n && sign) return null;
    return [x, y, 1n, mod(x * y)];
  }
  function eq(a, b) { if (a.length !== b.length) return false; var n = 0; for (var i = 0; i < a.length; i++) n |= a[i] ^ b[i]; return n === 0; }
  function hex(b) { return Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }
  function unhex(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function scalarPub(skBytes) { return compress(mul(decodeInt(skBytes), G)); }

  /* ---------- Adresses ---------- */
  var NETS = {
    18: ['mainnet', 'standard'], 19: ['mainnet', 'integrated'], 42: ['mainnet', 'subaddress'],
    53: ['testnet', 'standard'], 54: ['testnet', 'integrated'], 63: ['testnet', 'subaddress'],
    24: ['stagenet', 'standard'], 25: ['stagenet', 'integrated'], 36: ['stagenet', 'subaddress']
  };
  function parseAddress(addr) {
    addr = String(addr || '').trim();
    if (!addr) return { ok: false, error: T('k.pasteAddr') };
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)) return { ok: false, error: T('k.badChars') };
    if (addr.length !== 95 && addr.length !== 106) return { ok: false, error: T('k.length', { n: addr.length }) };
    var raw; try { raw = b58decode(addr); } catch (e) { return { ok: false, error: T('k.unreadable') }; }
    var body = raw.subarray(0, raw.length - 4), sum = raw.subarray(raw.length - 4);
    if (!eq(keccak256(body).subarray(0, 4), sum)) return { ok: false, error: T('k.checksum') };
    var net = NETS[raw[0]];
    if (!net) return { ok: false, error: T('k.unknownNet') };
    return {
      ok: true, address: addr, network: net[0], type: net[1],
      publicSpend: raw.subarray(1, 33), publicView: raw.subarray(33, 65),
      paymentId: net[1] === 'integrated' ? hex(raw.subarray(65, 73)) : null
    };
  }

  /* Mots d'une phrase de récupération : 25 (Monero), 16 (Polyseed), 12/13/24 (autres). */
  function looksLikeSeed(s) {
    var w = String(s || '').trim().split(/\s+/).filter(Boolean);
    return w.length >= 12 && w.every(function (x) { return /^[\p{L}'-]+$/u.test(x); });
  }

  /* Vérifie la clé collée contre l'adresse.
     Résultat : { ok, kind: 'view' | 'spend' | 'unknown' | 'seed' | 'invalid', error } */
  function checkKey(parsed, keyInput) {
    var k = String(keyInput || '').trim();
    if (looksLikeSeed(k)) return { ok: false, kind: 'seed', error: T('k.seed') };
    if (!/^[0-9a-fA-F]{64}$/.test(k)) return { ok: false, kind: 'invalid', error: T('k.hex') };
    var kb = unhex(k.toLowerCase());
    var n = decodeInt(kb);
    if (n === 0n || n >= L) return { ok: false, kind: 'invalid', error: T('k.invalid') };
    if (!parsed || !parsed.ok) return { ok: false, kind: 'unknown', error: T('k.addrFirst') };
    var pub = scalarPub(kb);
    if (parsed.type === 'subaddress') {
      // Sous-adresse : C = a·D (D = clé publique de dépense de la sous-adresse)
      var Dp = decompress(parsed.publicSpend);
      if (Dp && eq(compress(mul(n, Dp)), parsed.publicView)) return { ok: true, kind: 'view' };
      return { ok: false, kind: 'unknown', error: T('k.subMismatch') };
    }
    if (eq(pub, parsed.publicSpend)) return { ok: false, kind: 'spend', error: T('k.spend') };
    if (eq(pub, parsed.publicView)) return { ok: true, kind: 'view' };
    return { ok: false, kind: 'unknown', error: T('k.mismatch') };
  }

  function short(addr) { return addr ? addr.slice(0, 4) + '…' + addr.slice(-4) : ''; }

  var api = { keccak256: keccak256, b58decode: b58decode, b58encode: b58encode, parseAddress: parseAddress, checkKey: checkKey,
    looksLikeSeed: looksLikeSeed, scalarPub: scalarPub, hex: hex, unhex: unhex, short: short, L: L };
  root.PxKeys = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
