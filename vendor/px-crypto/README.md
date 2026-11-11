# px-crypto.wasm (57 Ko)

CryptoNight v0 et ChaCha20 du projet Monero (licence BSD-3-Clause, voir LICENSE-monero.txt), compilés en WebAssembly
pour lire **dans le navigateur** les fichiers « Monero key image export » (`export_key_images` de monero-wallet-cli,
fichiers `*_keyImages` de Feather). Ces fichiers sont chiffrés avec la clé de visualisation :
clé ChaCha20 = cn_slow_hash(view key) (wallet2::generate_chacha_key, 1 tour).

Reconstruction : `tools/build-px-crypto/build.sh` (zig 0.13.0). Vecteur de test officiel vérifié :
cn_slow_hash("de omnibus dubitandum") = 2f8e3df40bd11f9ac90c743ca8e32bb391da4fb98612aa3b6cdc639ee00b31f5.

SHA-256 : 6b89f9a5f47f0038202e58d64ee3d83899ea4cb4cdff1b2368e7f04195af47b3
