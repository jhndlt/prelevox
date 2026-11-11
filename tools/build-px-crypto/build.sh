#!/bin/sh
# Reconstruit vendor/px-crypto/px-crypto.wasm : CryptoNight v0 (generate_chacha_key) + ChaCha20,
# extraits tels quels de monero-project/monero (src/crypto, branche master du 11/11/2026, licence BSD-3).
# Seuls warnings.h (sans Boost) et px_wrap.c (points d'entrée) sont écrits pour Prelevox.
# Compilateur : zig 0.13.0 (pip install ziglang==0.13.0).
set -e
cd "$(dirname "$0")/src"
ZIG=${ZIG:-"python3 -m ziglang"}
SRCS="slow-hash.c oaes_lib.c aesb.c keccak.c blake256.c groestl.c jh.c skein.c hash-extra-blake.c hash-extra-groestl.c hash-extra-jh.c hash-extra-skein.c hash.c chacha.c px_wrap.c"
$ZIG cc -target wasm32-wasi -O2 -s -DNO_AES -DFORCE_USE_HEAP -I. -mexec-model=reactor \
  -Wl,--export=px_alloc -Wl,--export=px_free -Wl,--export=px_cn_slow_hash_v0 -Wl,--export=px_cn_fast_hash -Wl,--export=px_chacha20 \
  -o ../../../vendor/px-crypto/px-crypto.wasm $SRCS
sha256sum ../../../vendor/px-crypto/px-crypto.wasm
