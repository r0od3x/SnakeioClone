# Snake.io en ligne (réseau local)

Toi, ton ami et des serpents IA dans la même prairie, chacun sur son ordinateur. Ton PC est l'hôte : il fait tourner la partie, les navigateurs envoient seulement la souris et reçoivent ce qui les entoure.

## Jouer

Sur **ton PC (l'hôte)**, depuis ce dossier, avec Node.js 18 ou plus (aucune installation de paquet) :

```sh
node server.mjs
```

Le serveur affiche deux adresses :

```
Snake.io en ligne : http://localhost:3000
  pour ton ami (même Wi-Fi) : http://192.168.x.x:3000
```

- Toi : ouvre `http://localhost:3000`.
- Ton ami, **sur le même Wi-Fi** : il ouvre l'autre adresse (celle avec l'IP de ton PC).
- Chacun tape son nom et clique sur **Jouer**. Lien direct sans formulaire : `http://<adresse>:3000/?name=Kaa`.

**Pare-feu Windows** : au premier lancement, Windows demande s'il faut autoriser Node.js sur les réseaux ; accepte pour les **réseaux privés**. Si ton ami n'arrive pas à se connecter, vérifie que le Wi-Fi est en réseau « Privé » dans les paramètres Windows.

**Ton ami n'arrive pas à se connecter alors que `localhost` marche chez toi** : le pare-feu bloque le `node.exe` utilisé (les autorisations Windows sont par programme : chaque installation de Node a les siennes). Vérifie avec `Get-NetFirewallApplicationFilter -Program "*node.exe"` (PowerShell) quels `node.exe` sont autorisés, et lance le serveur avec l'un d'eux, ou ajoute une règle pour le port (PowerShell **administrateur**) :

```powershell
New-NetFirewallRule -DisplayName "Snake.io en ligne" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

Si ça bloque encore, le Wi-Fi isole peut-être les appareils entre eux (Wi-Fi invité, certains points d'accès) : essayez un autre réseau ou le partage de connexion d'un téléphone.

**Port déjà utilisé** : le port par défaut est 3000. Pour en prendre un autre : `PORT=3001 node server.mjs` (PowerShell : `$env:PORT=3001; node server.mjs`).

Commandes en jeu : souris = diriger ; clic maintenu ou Espace = accélérer. Le classement marque les joueurs humains d'un point vert, et leur nom est affiché en vert (★) au-dessus de leur serpent.

## Fonctionnement

- `server.mjs` : serveur HTTP (modules intégrés de Node). Il sert la page, simule la partie 60 fois par seconde et envoie à chaque joueur, 20 fois par seconde, un instantané de ce qui l'entoure (Server-Sent Events, `GET /events`). Les joueurs rejoignent avec `POST /join` et envoient leur point visé et l'accélération avec `POST /input`. Un joueur déconnecté depuis 5 s est retiré.
- `game.mjs` : la partie (gestion de scène). Elle charge les classes du jeu telles quelles (`Vehicle`, `Snake`, `BodySegment`, `SnakeBot`, `Food`…) et ajoute `NetPlayerSnake`, un serpent qui lit l'entrée de **son** joueur. Règles de Snake.io : tête contre un corps = mort, corps transformé en proies, élimination comptée, réapparition après 3 s, 4 bots maintenus, 450 proies. 8 joueurs au plus.
- `public/` : la page du joueur. Elle dessine avec les assets de Snake.io (`shared/meadow.js`, `snakePainter.js`, `snakeSpecies.js`, `preySprites.js`), avec sa propre caméra sur son serpent, et interpole entre deux instantanés (100 ms de retard d'affichage) pour un mouvement fluide.
- `shared/` : copies des fichiers de `1-Seek/page2` (rien n'y est modifié) et `netPlayerSnake.js`.

Taille d'un instantané : environ 8 Ko (corps : un segment sur deux, coordonnées entières ; seulement ce qui est à moins de 1 700 px du joueur), soit environ 150 Ko/s par joueur.

## Tests

```sh
node --test tests/*.test.mjs
```

`game.test.mjs` : joueurs et noms, chacun pilote son serpent, collisions et réapparition, départ d'un joueur, contenu et taille de l'instantané, partie longue à deux joueurs (et vitesse de la simulation). `server.test.mjs` : vrai serveur sur un port libre, page et fichiers servis (et refus des autres fichiers), deux joueurs qui rejoignent, premier instantané reçu, entrée acceptée, erreurs.
