# Prelevox

Déclinaison Monero de [Prelevo](https://github.com/jhndlt/prelevo). « Ce n'est pas un portefeuille, c'est une télécommande qui se branche sur vos portefeuilles Monero pour une belle interface. »

**En ligne :** https://jhndlt.github.io/prelevox/ · **démo (données fictives) :** https://jhndlt.github.io/prelevox/?demo=1

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
