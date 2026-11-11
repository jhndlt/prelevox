/* Prelevox : point d'entrée minimal (CryptoNight v0 + ChaCha20) pour déchiffrer
   les fichiers « Monero key image export » de wallet2 (Feather, monero-wallet-cli). */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "hash-ops.h"
#include "chacha.h"
void *px_alloc(size_t n) { return malloc(n); }
void px_free(void *p) { free(p); }
/* hash = cn_slow_hash(data) variante 0, non pré-haché (= generate_chacha_key, kdf_rounds = 1) */
void px_cn_slow_hash_v0(const void *data, size_t len, char *out) { cn_slow_hash(data, len, out, 0, 0, 0); }
void px_cn_fast_hash(const void *data, size_t len, char *out) { cn_fast_hash(data, len, out); }
void px_chacha20(const void *data, size_t len, const uint8_t *key, const uint8_t *iv, char *out) { chacha20(data, len, key, iv, out); }
/* Dépendances non utilisées par la variante 0 (JIT CryptonightR, RandomX) et effacement mémoire. */
void *memwipe(void *p, size_t n) { volatile uint8_t *v = (volatile uint8_t *)p; while (n--) *v++ = 0; return p; }
int v4_generate_JIT_code(const void *code, void *machine_code, const size_t code_size) { (void)code; (void)machine_code; (void)code_size; return -1; }
void rx_slow_hash_allocate_state(void) {}
void rx_slow_hash_free_state(void) {}
