# monero-ts 0.11.22 (vendorisé)

Bibliothèque Monero de woodser, licence MIT (voir LICENSE.txt). Le WASM embarque du code du projet Monero (licence BSD-3-Clause) ; les licences des dépendances JavaScript sont dans monero.worker.js.LICENSE.txt et en fin de monero-ts.js.

- `monero.worker.js` : worker officiel publié sur npm (`monero-ts@0.11.22/dist/monero.worker.js`), WASM inclus en base64 : aucun fichier .wasm séparé à servir.
- `monero-ts.js` : API JavaScript regroupée pour le navigateur avec esbuild (voir `tools/build-monero-ts/`). Le WASM n'est jamais chargé dans la page, seulement dans le worker.

Empreintes SHA-256 :
```
1ff271e3025cb8284c3ae3091ba19ee1dd1610cd984fddb98b582776de960127  LICENSE.txt
3613470f16813c974ed3df1a088412daf88fb08d868b2567953dc82074922a89  monero-ts.js
a118abf560ecbba372fc41a0c41cef468feb4c5e3f732598d1316c4c06a78b84  monero.worker.js
b56b6cbccbd5a0370d840ea4000f0267499febfdf00897d50e948aceb71d5d87  monero.worker.js.LICENSE.txt
```
