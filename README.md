# Snake.io — IA réactive

Un Snake.io dans une prairie, avec douze espèces de serpents réalistes. Les serpents IA sont pilotés par les *steering behaviors* de Craig W. Reynolds (« Steering Behaviors for Autonomous Characters », GDC 1999). Le jeu est en p5.js, sans dépendance à installer, avec un mode solo et un mode en réseau local.

## Jouer en solo

Ouvre `index.html` dans un navigateur, ou sers le dossier :

```sh
python -m http.server 8000
# puis http://localhost:8000
```

Au menu, choisis ton nom et ton espèce (ou « Au hasard »), puis clique sur **Jouer**.

| Commande | Effet |
| --- | --- |
| Souris | diriger la tête |
| Clic maintenu ou Espace | accélérer (coûte de la longueur et laisse des orbes) |
| P ou Échap | pause |
| D | debug : point visé, mode de décision, proie, rayon de perception et couloir d'évitement de chaque IA |
| R (après une mort) | réapparaître tout de suite |

- ⚙ ouvre les réglages : nombre d'IA, vitesses, agilité, perception, nombre de proies. Ils s'appliquent tout de suite.
- Le record et le profil sont gardés dans le navigateur.
- Quand tu meurs, « Éliminé » s'écrit avec des centaines de rats qui fuient la souris.

## Jouer en réseau local

Tu joues avec un ami, chacun sur son ordinateur, sur le même Wi-Fi. Il faut Node.js 18 ou plus :

```sh
npm run online      # ou : node online/server.mjs
```

Voir [`online/README.md`](online/README.md), notamment pour le pare-feu Windows.

## Trailer Studio (tournage)

`index.html?studio` ouvre les outils de tournage pour la bande-annonce :
- caméras cinéma ;
- ralentis ;
- scènes préparées et rejouables ;
- liste de plans ;
- enregistrement vidéo et captures haute résolution.

Sans `?studio`, rien n'est chargé. Voir [`trailer/README.md`](trailer/README.md).

## L'IA : les trois couches de Reynolds

1. **Sélection de l'action** (`snakeBot.js`) : à chaque image, le bot perçoit son voisinage (orbes, têtes et corps dans son rayon de perception) et choisit un mode, par priorité :
   - **évite** : un corps est dans le couloir devant la tête, le bot tourne du côté libre ;
   - **bord** : la tête va sortir de l'arène, il fait un *seek* vers le centre ;
   - **fuite** : une tête plus grosse est proche, il fait un *flee* et accélère ;
   - **chasse** : une tête plus petite est proche, il fait un *seek* d'un point devant elle (*pursue*) pour lui couper la route ;
   - **mange** : il fait un *seek* de la proie la plus proche ;
   - **erre** : il fait un *wander* continu.
2. **Steering** : `desired - velocity`, limité à `maxForce`. Un serpent ne freine jamais : `turnOnly` garde la composante latérale de la force (le virage) et une petite composante pour tenir la vitesse de croisière.
3. **Locomotion** : `applyForce`, puis `Vehicle.update` (`vehicle.js`).

Le **corps** est une chaîne de véhicules (`bodySegment.js`). Chaque segment fait un *arrive* vers le point situé juste derrière celui qui le précède.

Les **proies** (`food.js`) se promènent en *wander* et sont happées par un *seek* vers la bouche quand une tête approche. Les **rats** de l'écran de mort (`rat.js`) font un *arrive* vers leur place dans les lettres et un *flee* de la souris.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `vehicle.js` | véhicule de base : seek, flee, pursue, evade, wander, follow, separate, avoid, somme pondérée |
| `snake.js`, `playerSnake.js`, `snakeBot.js`, `bodySegment.js` | serpents (un fichier par entité) |
| `food.js`, `rat.js` | proies et rats |
| `snakeArena.js` | la partie : repas, collisions, morts, réapparition, classement, fil des éliminations, caméra |
| `snakeSpecies.js`, `snakePainter.js`, `meadow.js`, `preySprites.js` | espèces et dessin réaliste (canvas 2D) |
| `snakeSounds.js` | bruitages synthétisés (Web Audio) |
| `profile.js`, `menu.js`, `hud.js`, `sketch.js` | profil, menu, interface et boucle p5 |
| `online/` | serveur Node du mode réseau local et son client |

## Tests

```sh
npm test            # ou : node --test tests/ online/tests/
```

Les tests chargent le vrai code dans un contexte `vm` de Node, avec un adaptateur de vecteurs et un aléatoire fixé, sans navigateur. Ils couvrent les forces et leurs limites, les décisions des bots, la chaîne du corps, les repas, les collisions, la réapparition, le profil, les réglages, les sons et le serveur en ligne.
