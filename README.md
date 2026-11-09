# Prelevox

Déclinaison Monero de [Prelevo](https://github.com/jhndlt/prelevo). « Ce n'est pas un portefeuille, c'est une télécommande qui se branche sur vos portefeuilles Monero pour une belle interface. »

**Démo en ligne (données fictives) :** https://jhndlt.github.io/prelevox/?demo=1

- Lecture seule : adresse + view key uniquement. Les spend keys et phrases de récupération sont refusées.
- Clés chiffrées dans le navigateur (AES-GCM / PBKDF2). Aucun compte, aucun serveur qui les garde.
- Couleurs Monero (orange, noir, gris).

Lancer en local : `python3 -m http.server 8765 --bind 127.0.0.1` puis http://127.0.0.1:8765/?demo=1
