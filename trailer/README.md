# Trailer Studio

Ce sont des outils de tournage pour filmer des plans de bande-annonce. Ils ne changent pas les règles du jeu.

## Lancer

Ouvre le jeu avec le paramètre `?studio` :

```
http://localhost:8000/index.html?studio
```

Sans ce paramètre, aucun fichier de `trailer/` n'est chargé et le jeu est strictement le même. Pour le servir :

```sh
python -m http.server 8000
```

Le menu est sauté et une prise « bac à sable » démarre. **F9** affiche ou cache le panneau. Le panneau est en HTML : il n'apparaît jamais dans les vidéos.

## Raccourcis

| Touche | Effet |
| --- | --- |
| F9 | panneau |
| F10 | enregistrer / arrêter (une vidéo) |
| F8 / Maj+F8 | capture PNG 2× / 4× |
| K | pause / lecture (la caméra continue de bouger) |
| L | une image de jeu (pas à pas) |
| 1 à 5 | temps 0,1× · 0,25× · 0,5× · 1× · 2× |
| - / = | ralentir / accélérer |
| C | mode de caméra : jeu → libre → suivi → révélation |
| Tab | caméra de suivi sur le serpent suivant (les plus gros d'abord) |
| R | révéler l'arène (long zoom arrière) |
| [ / ] | plan précédent / suivant |
| Entrée / Maj+Entrée | rejouer le plan / jouer tous les plans |
| Échap | arrêter le plan |
| H | image propre (sans interface, noms ni mini-carte) |
| B | bandes noires 2,39:1 |
| G | étalonnage suivant (aucun, cinéma, heure dorée, sombre) |
| D | debug IA |
| N | nouvelle graine |

La caméra libre se commande ainsi :
- molette : zoom sous le curseur ;
- clic droit ou molette glissés : déplacer la vue ;
- flèches : déplacer la vue ;
- Z / X : zoomer / dézoomer ;
- Q / E : rotation.

## Plans : `trailer/shots.js`

Les plans sont des données. Le format complet est décrit en tête du fichier, et quatre exemples sont fournis :
- `arena-reveal` : gros plan puis révélation de l'arène ;
- `the-trap` : encerclement, puis passage du chasseur à la proie ;
- `near-miss` : frôlement en ralenti extrême ;
- `kill-burst` : élimination qui explose en orbes.

Les plans sont vérifiés au chargement. Les problèmes s'affichent dans le panneau et dans la console.

Pour ajouter un plan, copie un exemple, change son `id` (qui devient le nom du fichier vidéo) et règle les champs suivants :
- `setup` : graine, scène, bots, longueurs ;
- `camera` ;
- `time` : courbe de ralenti ;
- `events` : ralenti automatique sur une élimination, un frôlement ou un encerclement ;
- `cues` : changement de cible, ralenti ou libération d'un acteur à un instant donné ;
- `frame` : interface, bandes noires, étalonnage.

Une même graine avec le même `setup` donne la même prise, image par image : un plan rejoué est identique.

## Scènes (`setup.scenario`)

| Scène | Rôles pour la caméra | Options |
| --- | --- | --- |
| `open` | `player`, `leader` | — |
| `encircle` | `hunter` (géant), `prey` | `giantMass`, `preyMass`, `release` (pas de jeu avant que la proie tente de fuir) |
| `nearMiss` | `a`, `b` | `mass`, `clearance` (px entre les deux) |
| `killBurst` | `victim`, `killer` | `victimMass`, `killerMass` |
| `growth` | `grower` | `growerMass`, `trail` (nombre de proies) |
| `crowded` | `player`, `leader` | `bots` (au moins 30), `food`, `spread` |

Options communes :
- `seed`, `bots`, `food` ;
- `playerMass`, `playerSpecies` ;
- `invincible`, `autopilot` (le joueur est piloté par l'IA) ;
- `warmup` (pas simulés avant le début) ;
- `at` (centre de la scène).

Les espèces se désignent par leur id, défini dans `snakeSpecies.js` (`kingCobra`, `coral`…).

Les acteurs suivent un script (orbite, cap, poursuite), puis leur IA reprend la main. Ils se déplacent uniquement par steering : rien n'est téléporté pendant un plan.

## Enregistrement

- **Une vidéo par plan** : coche « Enregistrer chaque plan », puis « Jouer » ou « Tout jouer ». Chaque plan est téléchargé sous `<id>.mp4`, ou `.webm` si le navigateur ne sait pas encoder le MP4. Le navigateur peut demander une fois l'autorisation de télécharger plusieurs fichiers.
- **Prise libre** : F10 pour démarrer, F10 pour arrêter.
- **Qualité** : H.264, 40 Mb/s. Le format choisi est affiché dans le panneau.
- **Taille de sortie** : panneau → Enregistrement → Sortie (1920 × 1080, 2560 × 1440, 3840 × 2160). Le canvas a alors exactement cette taille et il est affiché réduit dans la fenêtre.
- **Pas fixe** : chaque image dessinée avance le jeu et la caméra d'exactement 1/60 s, et la vidéo reçoit une image par image dessinée. Une image lente n'accélère donc jamais l'action.

  Limite : `MediaRecorder` horodate les images au moment où elles arrivent. Si l'ordinateur tombe sous 60 images/s pendant l'enregistrement, la vidéo saccade. Le panneau affiche alors les images/s en jaune. Dans ce cas, réduis la taille de sortie, ou choisis l'étalonnage « Aucun » (la lueur est le plus coûteux).
- **Captures** : F8 donne une capture 2×, Maj+F8 une capture 4×. L'image est redessinée en haute résolution, au même instant, avec le même cadrage.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `studio.js` | chef d'orchestre : boucle, plans, événements, rendu, raccourcis |
| `panel.js`, `panel.css` | panneau (F9) |
| `cameras.js`, `easing.js` | caméras libre, de suivi et par images-clés ; transitions ; courbes |
| `timeControl.js`, `interpolation.js` | pause, pas à pas, ralenti, rampes ; affichage fluide entre deux pas |
| `director.js`, `actorSnake.js` | prises à graine, scènes, acteurs scriptés, joueur invincible ou piloté |
| `eventDetector.js` | éliminations, frôlements, encerclements |
| `grade.js`, `canvasHud.js` | étalonnage, lueur, vignette, bandes noires ; interface dessinée dans le canvas (donc enregistrée) |
| `shots.js`, `shotPlayer.js` | liste des plans et lecture |
| `recorder.js` | vidéo (MediaRecorder) et captures |

Dans le jeu, les seuls changements sont ceux-ci :
- `SnakeArena.show` accepte des options (contexte, noms, mini-carte, vignette, debug, rotation) ;
- un serpent marqué `invulnerable` ne meurt pas ;
- `bots()` exclut toujours le joueur ;
- `index.html` contient le chargeur conditionnel, et `sketch.js` quatre lignes qui passent la main au studio quand il est actif.

Tests : `npm test` (fichiers `tests/trailer-*.test.mjs`).
