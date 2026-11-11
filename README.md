# Prelevox

Déclinaison Monero de Prelevo. « Ce n'est pas un portefeuille, c'est une télécommande qui se branche sur vos portefeuilles Monero pour une belle interface. »

En ligne : https://jhndlt.github.io/prelevox/ (démo : `?demo=1`).

## Lancer et tester

```
python3 -m http.server 8765 --bind 127.0.0.1      # puis http://127.0.0.1:8765/
node tests/keys.test.js                            # adresses, view key, refus spend key / phrase
python3 tests/e2e.py                               # parcours démo + ajout + coffre (Chrome)
python3 tests/e2e-sync.py [blocs]                  # VRAIE synchro mainnet (wallet public du Monero General Fund)
```

## Comment ça marche

1. Vous ajoutez l'adresse principale et la **clé privée de visualisation** (view key). `js/keys.js` vérifie que la clé correspond à l'adresse, et **détecte et refuse** une clé de dépense ou une phrase de récupération.
2. Les clés sont chiffrées sur l'appareil (`js/vault.js` : AES-GCM 256, PBKDF2-SHA-256 600 000 itérations, IndexedDB, verrouillage auto après 5 min d'inactivité ; le coffre reste ouvert pendant une synchro active).
3. La synchro (`js/sync.js`) charge **monero-ts** (WASM, vendorisé dans `vendor/monero-ts/`, aucun CDN). Un portefeuille **en lecture seule** (`createWalletFull` avec `primaryAddress` + `privateViewKey` + `restoreHeight`, mainnet) est recréé en mémoire dans un worker et scanne les blocs fournis par un nœud Monero public. La view key ne quitte jamais l'appareil.
4. La progression (état complet du portefeuille, ~1,4 Mo) est enregistrée **chiffrée** dans le coffre environ chaque minute : à la réouverture, seuls les nouveaux blocs sont lus. Annulable à tout moment.
5. Le portefeuille WASM est fermé (mémoire libérée) à la fin de chaque synchro.

Il n'existe aucune fonction d'envoi : le portefeuille est view-only (monero-ts refuse même de renvoyer une spend key), et l'app vérifie `isViewOnly()` avant toute synchro.

## Hauteur de restauration

Formulaire d'ajout : « date de création du portefeuille » convertie en hauteur de bloc (interpolation sur des repères réels de la chaîne, marge de 3 jours), ou hauteur exacte (champ avancé). Sans rien : 30 derniers jours seulement. Vitesse mesurée sur un ordinateur : ~40 blocs/s, soit ~1 min pour 4 jours, ~8 min pour un mois ; probablement plus lent sur iPhone.

## Nœuds

Une page https ne peut parler qu'à des nœuds **https** qui autorisent le CORS (y compris la requête binaire `getblocks.bin`). Liste par défaut (testée le 9 novembre 2026, synchro réelle réussie depuis Chrome) :
node.xmr.surf, xmr.0xrpc.io, monero.econanon.com, connect.xmr-node.org, monero.definitelynotafed.com, monero.openinternet.io, xmr.okade.pro, xmr.surveillance.monster, xmr.unshakled.net.
Mode « Automatique » : premier nœud qui répond (ordre aléatoire). Réglages → « Mon propre nœud… » : le plus privé (monerod avec `--rpc-access-control-origins=https://jhndlt.github.io` derrière https). Les nœuds .onion ne sont pas joignables depuis un navigateur. Alternative avancée : votre propre serveur monero-lws (la view key lui est alors transmise ; non testé).

Ce que voit le nœud : votre adresse IP, l'heure de synchro et les plages de blocs demandées. Jamais la view key ni l'adresse.

## iPhone (Safari / PWA)

- Pause propre quand l'app passe en arrière-plan (`visibilitychange` / `pagehide`) : la synchro s'arrête, l'état chiffré est sauvegardé, puis elle reprend seule au retour.
- Tranches courtes sur iOS : 30 s ou 2 000 blocs, avec sauvegarde chiffrée à chaque tranche. Le worker WASM est libéré à la fin de chaque portefeuille.
- Wake Lock (écran allumé) quand le navigateur le permet. Un message demande de garder l'app ouverte.
- Nœud qui tombe en cours de synchro (mode Automatique) : bascule sur le nœud suivant sans perdre la progression, 4 fois au maximum. Un nœud bloqué plus de 2 min est traité comme tombé.

## Apparence

Le réglage « Apparence » propose deux choix : « matrix » (par défaut) et « classique ».
- « matrix » s'inspire de l'écran de réglages de Bitchat : police monospace (`ui-monospace`, donc SF Mono sur iPhone et Mac, sans fichier de police à charger), tout en minuscules sauf les titres de section et les badges, cartes teintées à bord fin et coins de 12 px, et badges à bord orange. Le fond est noir `#0A0A0A` avec l'orange Monero `#FF6600`.
- Une pluie de caractères orange défile en fond (`js/theme.js`) : opacité 16 %, environ 14 images/s, arrêtée en arrière-plan. Elle reste fixe si le système demande de réduire les animations.
- Le choix est gardé dans `localStorage` (`px-ui`) et appliqué avant le premier affichage. Il ne contient aucune donnée sensible.
- Les adresses, les commandes, les saisies et le montant principal gardent leur casse d'origine.

## Solde exact (key images)

Écran `#/exact`. Les key images sont lues et déchiffrées dans le navigateur, gardées chiffrées dans le coffre, puis appliquées avec `importKeyImages` de monero-ts après la synchro.
- **Feather** : Prelevox exporte ses sorties (`exportOutputs`, fichier « Monero output export »). Dans Feather, on passe par Tools → Offline transaction signing → import du fichier, puis « Export key images » → fichier `*_keyImages`, qu'on importe dans Prelevox. Les key images correspondent ainsi exactement aux sorties lues par Prelevox.
- **monero-wallet-cli** : `export_key_images all <fichier>`. Il faut que la hauteur de restauration de Prelevox précède la première réception.
- Formats acceptés : binaire wallet2 « Monero key image export\x03 » (déchiffré par `vendor/px-crypto/px-crypto.wasm`), le même fichier en hexadécimal, et le JSON `signed_key_images` de monero-wallet-rpc.
- Formats refusés : les QR animés UR. Un fichier d'un autre compte est refusé avant tout appel au nœud.
- Confidentialité : comme dans Feather, le nœud reçoit les key images (`is_key_image_spent`). Votre propre nœud est donc recommandé.

## Tests

- `node tests/keys.test.js`
- `node tests/keyimages.test.js` : vrai fichier CLI d'un portefeuille jetable, fichier synthétique, JSON, erreurs, fusion.
- `python3 tests/e2e.py`
- `python3 tests/e2e-sync.py`
- `python3 tests/e2e-theme.py` : apparences « matrix » et « classique », persistance du choix, captures 31 à 41.
- `python3 tests/e2e-ios.py [blocs]` : iPhone 390×844, pause et reprise, bascule de nœud, export des sorties, refus de fausses key images, puis « Solde exact » avec le vrai fichier CLI.

## Limites (à lire)

- **Les dépenses ne sont pas visibles avec une view key seule.** Le solde affiché (« estimé ») est la somme des fonds reçus non connus comme dépensés : si des fonds ont été envoyés depuis ce portefeuille, le solde réel est plus bas. Les sorties ne sont donc qu'« estimées » et, en pratique, souvent absentes.
- Seules les opérations postérieures à la hauteur de restauration sont visibles.
- Abonnements / Bientôt : détection de montants identiques (±3 %) à intervalle régulier (hebdo, mensuel, annuel) ; comme les sorties sont peu visibles, l'ajout manuel reste le plus fiable. Les entrées régulières détectées apparaissent aussi dans « Bientôt ».
- Contre-valeur € : CoinGecko (repli Kraken), désactivable dans Réglages ; seule la requête de cours part, sans adresse ni clé.
- iOS met les apps en pause en arrière-plan : la synchro reprend au dernier point enregistré au retour (automatique si la dernière synchro date de plus de 10 min).

## Fichiers

- `js/keys.js` adresses Monero (base58 + Keccak), vérification view key ↔ adresse (Ed25519), refus spend key / phrase.
- `js/vault.js` coffre chiffré. `js/sync.js` sources de synchro (démo, monero-ts, monero-lws), nœuds, date ↔ hauteur, cours €, détection de récurrences.
- `js/chart.js` graphique d'évolution (courbe monotone). `js/demo.js` données fictives. `js/app.js` écrans.
- `vendor/monero-ts/` bibliothèque Monero (MIT) : ~4,3 Mo (≈ 2,2 Mo compressés), chargée seulement à la première synchro puis mise en cache par le service worker.
- `tools/build-monero-ts/` reconstruction du bundle navigateur (esbuild). `sw.js` cache hors ligne (version `prelevox-v3`).

## v6 (local) : tirer pour actualiser, onglet Prix, alertes

- **Tirer pour actualiser** (`js/ptr.js`) : repris de Prelevo (écart 92 px, radar `px-radar` + onde `px-ping`, durée minimale 1,8 s), avec élastique et seuil à 64 px. Vrai portefeuille : synchro + cours ; démo : données rechargées ; onglet Prix : cours relu. Ignoré si la page n'est pas tout en haut, si le geste est horizontal, sur le graphique interactif de l'accueil et dans la feuille d'alertes. `prefers-reduced-motion` : pas d'animation.
- **Onglet Prix** (`js/price.js`) : cours XMR en € (ou $), variation 24 h, périodes 24 h / 1 S / 1 M / 1 A / Tout, plus haut / plus bas 24 h. CoinGecko puis Kraken en secours, sans clé ni adresse envoyée. « Tout » vient de Kraken (CoinGecko public est limité à 365 jours).
- **Alertes de prix** : au-dessus / en-dessous d'un prix (€ ou $), ou variation de X % en 24 h. Elles sont enregistrées sur l'appareil et vérifiées à l'ouverture puis toutes les 2 min tant que l'app est ouverte. Elles s'affichent dans l'app et, si vous l'autorisez, en notification. Sur iPhone, la notification demande d'avoir ajouté l'app à l'écran d'accueil. **Une fois l'app fermée, aucune alerte ne part** (il faudrait un serveur Web Push, non déployé).
- Tests : `node tests/price.test.js`, `python3 tests/e2e-ptr-prix.py` (captures 43 à 51).
