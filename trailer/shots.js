// Liste des plans de la bande-annonce. À remplir depuis le script du trailer.
//
// Un plan :
//   id        identifiant (lettres, chiffres, - et _) : aussi le nom du fichier vidéo enregistré
//   notes     intention du plan (texte libre)
//   duration  durée en secondes (temps réel du film)
//   setup     prise : { seed, scenario, bots, food, playerMass, playerSpecies, invincible, autopilot, warmup, ... }
//             scenario : open | encircle | nearMiss | killBurst | growth | crowded (options : voir trailer/director.js)
//             warmup : pas de jeu simulés avant le début du plan
//   camera    { type: 'game' | 'free' | 'follow' | 'keyframes', ... }
//             follow    : target (player | leader | rôle de la scène | nom), zoom, offset {x, y}, smoothing (s), lookAhead (images)
//             free      : x, y, zoom, rotation
//             keyframes : keys [{ t, target | x, y, zoom, rotation, ease }]
//   time      courbe d'échelle de temps [{ t, scale, ease }] (absent : 1×)
//   events    { autoSlowmo: { on: ['kill', 'nearMiss', 'encircle'], scale, inDuration, hold, outDuration }, autoCut: true }
//   cues      actions datées [{ t, action: 'cut' | 'slowmo' | 'release' | 'keyframes', ... }]
//             cut : target, duration, ease, zoom, lookAhead ; slowmo : scale, inDuration, hold, outDuration
//             release : role (l'acteur passe à son IA) ; keyframes : keys
//   frame     { hud, names, minimap, debug, letterbox, preset: none | cinematic | golden | moody }
const TrailerShots = [
  {
    id: 'arena-reveal',
    notes: 'Ouverture : gros plan sur un cobra royal, puis long zoom arrière qui révèle toute l\'arène.',
    duration: 8,
    setup: { seed: 11, scenario: 'open', bots: 16, playerMass: 320, playerSpecies: 'kingCobra', warmup: 120 },
    camera: {
      type: 'keyframes',
      keys: [
        { t: 0, target: 'player', zoom: 1.7 },
        { t: 1.5, target: 'player', zoom: 1.55 },
        { t: 7.5, x: 0, y: 0, zoom: 0.24, rotation: 0.2, ease: 'inOutCubic' },
      ],
    },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'cinematic' },
  },
  {
    id: 'the-trap',
    notes: 'Le géant referme son anneau ; on passe du chasseur à la proie, ralenti quand elle tente de fuir.',
    duration: 11,
    setup: { seed: 21, scenario: 'encircle', bots: 3, release: 330 },
    camera: { type: 'follow', target: 'hunter', zoom: 0.9, lookAhead: 10, smoothing: 0.5 },
    cues: [
      { t: 3, action: 'cut', target: 'prey', duration: 1.6, zoom: 1.5, lookAhead: 6 },
      { t: 5.4, action: 'slowmo', scale: 0.3, inDuration: 0.4, hold: 2.2, outDuration: 0.8 },
    ],
    events: { autoSlowmo: { on: ['kill'], scale: 0.15, inDuration: 0.2, hold: 1.6, outDuration: 0.8 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'moody' },
  },
  {
    id: 'near-miss',
    notes: 'Deux serpents foncent tête contre tête et se frôlent : ralenti extrême au moment du croisement.',
    duration: 6,
    setup: { seed: 5, scenario: 'nearMiss', bots: 0 },
    camera: {
      type: 'keyframes',
      keys: [
        { t: 0, target: 'a', zoom: 1.2 },
        { t: 1.2, x: 420, y: -220, zoom: 1.5, ease: 'outCubic' },
        { t: 6, x: 420, y: -220, zoom: 1.9, rotation: -0.12, ease: 'linear' },
      ],
    },
    events: { autoSlowmo: { on: ['nearMiss'], scale: 0.1, inDuration: 0.15, hold: 1.8, outDuration: 0.7 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'cinematic' },
  },
  {
    id: 'kill-burst',
    notes: 'Un crotale fonce dans le corps d\'un serpent-roi et explose en orbes ; on reste sur l\'explosion.',
    duration: 7,
    setup: { seed: 8, scenario: 'killBurst', bots: 2, food: 200 },
    camera: { type: 'follow', target: 'victim', zoom: 1.25, lookAhead: 30, smoothing: 0.35 },
    events: { autoSlowmo: { on: ['kill'], scale: 0.12, inDuration: 0.1, hold: 2, outDuration: 1 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'golden' },
  },
];
