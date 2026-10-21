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
| `encircle` | `hunter` (géant), `prey` | `giantMass`, `preyMass`, `release` (pas de jeu avant que la proie tente de fuir), `ring` (part du cercle couverte par le corps : 1 = anneau fermé), `tighten` (px par pas : l'anneau se resserre), `minRadius` |
| `nearMiss` | `a`, `b` | `mass`, `clearance` (px entre les deux) |
| `killBurst` | `victim`, `killer` | `victimMass`, `killerMass` |
| `cutOff` | `victim`, `killer`, `scavenger1…` | le tueur accélère le long de la victime, la dépasse et se rabat : `victimMass`, `killerMass`, `lane`, `overtake`, `cutAhead`, `cutDepth`, `scavengers` |
| `underdog` | `giant`, `small`, `scavenger1…` | un petit coupe la route d'un géant, qui explose en champ de proies : `giantMass`, `smallMass`, `giantStart`, `wait`, `cut`, `lead`, `scavengers` |
| `growth` | `grower` | `growerMass`, `trail` (nombre de proies) |
| `crowded` | `player`, `leader` | `bots` (au moins 30), `food`, `spread` |

Options communes :
- `seed`, `bots`, `food` ;
- `playerMass`, `playerSpecies` ;
- `invincible`, `autopilot` (le joueur est piloté par l'IA) ;
- `warmup` (pas simulés avant le début) ;
- `at` (centre de la scène).

Les espèces se désignent par leur id, défini dans `snakeSpecies.js` (`kingCobra`, `coral`…).

Les acteurs suivent un script (orbite, cap, poursuite), éventuellement suivi d'un autre (`then`), puis leur IA reprend la main. Ils se déplacent uniquement par steering : rien n'est téléporté pendant un plan.

## Enregistrement

- **Une vidéo par plan** : coche « Enregistrer chaque plan », puis « Jouer » ou « Tout jouer ». Chaque plan est téléchargé sous `<id>.mp4`, ou `.webm` si le navigateur ne sait pas encoder le MP4. Le navigateur peut demander une fois l'autorisation de télécharger plusieurs fichiers.
- **Prise libre** : F10 pour démarrer, F10 pour arrêter.
- **Qualité** : H.264, 40 Mb/s. Le format choisi est affiché dans le panneau.
- **Taille de sortie** : panneau → Enregistrement → Sortie (1920 × 1080, 2560 × 1440, 3840 × 2160). Le canvas a alors exactement cette taille et il est affiché réduit dans la fenêtre.
- **Pas fixe** : chaque image dessinée avance le jeu et la caméra d'exactement 1/60 s, et la vidéo reçoit une image par image dessinée. Une image lente n'accélère donc jamais l'action.

  Limite : `MediaRecorder` horodate les images au moment où elles arrivent. Si l'ordinateur tombe sous 60 images/s pendant l'enregistrement, la vidéo saccade. Le panneau affiche alors les images/s en jaune. Dans ce cas, réduis la taille de sortie, ou choisis l'étalonnage « Aucun » (la lueur est le plus coûteux).
- **Captures** : F8 donne une capture 2×, Maj+F8 une capture 4×. L'image est redessinée en haute résolution, au même instant, avec le même cadrage.

## Animatique : du plan au montage

La chaîne complète, sans ouvrir de navigateur :

```sh
npm run trailer:plan        # cherche graine et moment clé des plans (trailer/plan.js)
npm run trailer:draft       # brouillons 540p de tous les plans (trailer/out/draft/)
npm run trailer:animatic    # animatique + vertical + FCPXML + CSV (trailer/out/edit/)
```

Ensuite, pour la version finale : `npm run trailer:final` (1080p, maître ProRes 4444 + H.264), puis `npm run trailer:animatic -- --source final` (la FCPXML pointe alors sur les maîtres). Un seul plan : `npm run trailer:draft -- near-miss`.

### 1. Plans calés sur un moment clé

Au lieu de partir du début de la partie, un plan peut se caler sur un événement :

```js
key: { event: 'nearMiss', role: 'a' },   // ou 'kill', 'encircle', ou { step: 300 }
pre: 1.4,                                // secondes gardées avant
post: 4.4,                               // secondes gardées après (durée = pre + post)
camera: { type: 'keyframes', keys: [{ fromKey: -1.4, target: 'a', zoom: 1.2 }, …] },
```

`fromKey` (dans `camera.keys`, `cues` et `time`) est un instant relatif au moment clé. Pour une élimination, `role` désigne la victime et `killer` le tueur. La caméra peut viser `target: 'key'`, le lieu exact du moment clé : elle s'y place avant l'impact. La partie est déterministe : une répétition à blanc trouve le pas où l'événement arrive, puis la prise démarre `pre` secondes plus tôt (`trailer/keyMoment.js`).

`npm run trailer:plan` fait ces répétitions dans Node. Il essaie les graines suivantes tant que l'action n'arrive pas, avec assez d'avance (les IA décident seules), et écrit `trailer/plan.js`. Il affiche aussi une carte ASCII de l'arène au moment clé, pour placer les scènes. Le studio relit `plan.js`. Si le plan a changé depuis (empreinte différente), il refait la répétition lui-même.

### 2. Capture image par image

`npm run trailer:draft` lance un enregistreur local (`trailer/recorder/`) qui sert le jeu en HTTP. Il ouvre ensuite Chrome sans fenêtre sur `index.html?studio&capture=<plan>&size=540p` pour chaque plan.

La page arrête la boucle de p5 et dessine chaque image avec `redraw()` (exactement 1/60 s de jeu). Elle envoie les pixels RGBA à l'enregistreur et attend sa réponse avant l'image suivante. La vidéo est donc exacte image par image, même sur une machine lente : c'est la limite de `MediaRecorder` (F10) qui disparaît. Les images vont directement dans ffmpeg, sans fichier image intermédiaire.

Le cadrage est celui d'un écran de 1920 px de large, à toutes les tailles : un brouillon 540p montre exactement ce que montrera la version 1080p. Le profil enregistré dans le navigateur n'influence pas les plans.

Dans `trailer/out/draft/<plan>/` :

| Fichier | Contenu |
| --- | --- |
| `<plan>.mp4` | H.264 4:2:0, BT.709 |
| `<plan>-master.mov` | maître ProRes 4444 (version finale seulement) |
| `<plan>-key.png` | image du moment clé |
| `<plan>-sheet.jpg` | planche contact : 12 images avec temps et numéro d'image |
| `manifest.json` | taille, images, moment clé, événements, bruitages (pour une future piste son), graine, temps de capture |
| `qc.json` | contrôle qualité |

Le contrôle qualité signale :
- les noirs et les images figées (ffmpeg) ;
- les images flash (saut de luminosité isolé) ;
- une première image blanche ;
- un moment clé absent de la prise ;
- les sujets hors champ (`subjects` du plan, sinon la cible de la caméra et l'acteur du moment clé).

### 3. Montage : `trailer/edit/table.mjs`

Le montage tient dans une table : une ligne par beat, `{ beat, clip, in, out, notes }` (secondes du plan), ou `{ beat, gap, card }` pour un noir avec un carton. Les entrées et sorties se choisissent sur les planches contact. `npm run trailer:animatic` vérifie la table, puis écrit dans `trailer/out/edit/` :
- `animatic.mp4` : 960 × 540, avec le beat, le plan, l'extrait et le timecode incrustés ;
- `animatic-vertical.mp4` : 540 × 960, recadré au centre (dans l'image utile si les plans ont des bandes noires) ;
- `timeline.fcpxml` : FCPXML 1.8 pour DaVinci Resolve. Elle utilise des `src` en `file:///` absolus (le `media-rep` de la 1.9 n'est pas lu partout) et un marqueur au moment clé. Elle est relue et vérifiée après écriture : références, fichiers, continuité, durée ;
- `shotlist.csv` : liste des plans (encodage lisible par Excel).

Les avertissements de la table sont affichés : extrait qui contient un sujet hors champ, moment clé coupé, noir en fin de timeline (ignoré par la plupart des logiciels à l'import).

### Impacts (`trailer/impact.js`)

Dans le jeu, un serpent éliminé disparaît d'un coup et ses orbes grossissent en 20 pas de jeu. Au ralenti, la victime s'évapore et les orbes restent minuscules pendant tout le moment fort. Le studio ajoute donc, en dessin seulement et en temps du film, trois effets :
- le corps de la victime qui se dissout ;
- une onde de choc à sa taille ;
- des orbes qui apparaissent en 0,3 s de film, au ralenti comme à vitesse normale.

`frame.vfx: false` les coupe.

### Pièges connus

- Ne pas modifier les fichiers du jeu pendant un lot de capture : chaque prise recharge la page.
- `noLoop()` de p5 n'annule pas l'image déjà demandée : la capture la laisse passer avant de démarrer, sinon la prise avancerait d'un pas.
- Lire les pixels directement dans le canvas du jeu à chaque image fait passer Chrome en dessin logiciel (près de 10 fois plus lent) : la capture lit une copie.
- Pas encore de son : les bruitages de chaque image sont relevés dans `manifest.json`. Les rendre en WAV demande de pouvoir lancer `snakeSounds` à une date choisie.

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
| `keyMoment.js`, `plan.js` | moment clé, préparation des prises ; plan généré par `planner.mjs` |
| `capture.js` | capture image par image côté page (`?studio&capture=…`) |
| `planner.mjs` | planificateur Node (graines, carte ASCII) |
| `recorder/` | enregistreur local (`server.mjs`), commandes ffmpeg et contrôle qualité (`media.mjs`), lot avec Chrome (`capture.mjs`) |
| `edit/` | table de montage (`table.mjs`), animatique, FCPXML et CSV (`timeline.mjs`, `build.mjs`) |

Dans le jeu, les seuls changements sont ceux-ci :
- `SnakeArena.show` accepte des options (contexte, noms, mini-carte, vignette, debug, rotation) ;
- un serpent marqué `invulnerable` ne meurt pas ;
- `SnakePainter` : l'ombre portée reste sous le serpent quand la caméra est tournée (elle partait ailleurs en tache sombre) ;
- `bots()` exclut toujours le joueur ;
- `index.html` contient le chargeur conditionnel, et `sketch.js` quatre lignes qui passent la main au studio quand il est actif.

Tests : `npm test` (fichiers `tests/trailer-*.test.mjs` ; la capture et le montage dans `tests/trailer-pipeline.test.mjs`, dont une prise réelle avec ffmpeg). Les vidéos produites (`trailer/out/`) ne sont pas versionnées.
