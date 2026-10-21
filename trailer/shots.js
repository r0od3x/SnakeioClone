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
//   frame     { hud, names, minimap, debug, letterbox, preset: none | cinematic | golden | moody, vfx }
//             vfx (défaut true) : effets d'impact sur les éliminations, orbes qui apparaissent en temps du film
//   key       moment clé (voir trailer/keyMoment.js) : { event: 'kill' | 'nearMiss' | 'encircle', role? } ou
//             { step } ; la prise démarre pre s avant lui et dure pre + post s (duration absente).
//             Dans camera.keys, cues et time, fromKey (s, négatif avant) remplace t.
//             Graine et pas : npm run trailer:plan (trailer/plan.js).
//   subjects  rôles qui doivent rester à l'image (contrôle qualité de la capture)
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
    notes: 'Le géant s\'enroule et resserre son anneau ; la proie cherche une sortie, touche le corps et explose.',
    setup: { seed: 3, scenario: 'encircle', bots: 3, release: 150, tighten: 0.45, minRadius: 15, ring: 1 },
    key: { event: 'kill', role: 'prey', killer: 'hunter' },
    pre: 4,
    post: 3.5,
    camera: {
      type: 'keyframes',
      keys: [
        { fromKey: -4, x: 420, y: -220, zoom: 1.5, rotation: -0.08 },
        { fromKey: -0.6, target: 'key', zoom: 2.3, rotation: 0.04, ease: 'inOutCubic' },
        { fromKey: 3.5, target: 'key', zoom: 1.6, rotation: 0.1, ease: 'inOutSine' },
      ],
    },
    events: { autoSlowmo: { on: ['kill'], scale: 0.15, inDuration: 0.1, hold: 1, outDuration: 0.7 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'moody' },
  },
  {
    id: 'near-miss',
    notes: 'Deux serpents foncent tête contre tête et se frôlent : ralenti extrême au moment du croisement.',
    setup: { seed: 5, scenario: 'nearMiss', bots: 0 },
    key: { event: 'nearMiss', role: 'a' },
    pre: 1.4,
    post: 4.4,
    camera: {
      type: 'keyframes',
      keys: [
        { fromKey: -1.4, target: 'a', zoom: 1.7 },
        { fromKey: -0.4, target: 'key', zoom: 2.2, ease: 'outCubic' },
        { fromKey: 4.4, target: 'key', zoom: 2.6, rotation: -0.12, ease: 'linear' },
      ],
    },
    events: { autoSlowmo: { on: ['nearMiss'], scale: 0.1, inDuration: 0.15, hold: 1.8, outDuration: 0.7 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'cinematic' },
  },
  {
    id: 'kill-burst',
    notes: 'Un crotale fonce dans le corps d\'un serpent-roi et explose en orbes ; on reste sur l\'explosion.',
    setup: { seed: 8, scenario: 'killBurst', bots: 2, food: 200 },
    key: { event: 'kill', role: 'victim' },
    pre: 2,
    post: 4.5,
    camera: { type: 'follow', target: 'victim', zoom: 1.25, lookAhead: 30, smoothing: 0.35 },
    events: { autoSlowmo: { on: ['kill'], scale: 0.12, inDuration: 0.1, hold: 2, outDuration: 1 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'golden' },
  },
  {
    id: 'cut-off',
    notes: 'Un cobra royal accélère le long d\'un crotale, le dépasse et se rabat : le crotale s\'écrase et explose en proies, les charognards se ruent dessus.',
    setup: { seed: 1, scenario: 'cutOff', bots: 6 },
    key: { event: 'kill', role: 'victim', killer: 'killer' },
    subjects: ['victim'],
    pre: 3,
    post: 4,
    camera: {
      type: 'keyframes',
      keys: [
        { fromKey: -3, target: 'killer', zoom: 1.5 },
        { fromKey: -1, target: 'key', zoom: 1.9, ease: 'inOutCubic' },
        { fromKey: 0.8, target: 'key', zoom: 2.1, ease: 'outSine' },
        { fromKey: 4, target: 'key', zoom: 1.15, rotation: 0.08, ease: 'inOutSine' },
      ],
    },
    events: { autoSlowmo: { on: ['kill'], scale: 0.15, inDuration: 0.08, hold: 0.9, outDuration: 0.6 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'cinematic' },
  },
  {
    id: 'underdog',
    notes: 'Climax : un petit corail coupe la route d\'un géant de 3 000 px, qui s\'écrase et se répand en champ de proies ; les charognards arrivent de partout.',
    setup: { seed: 3, scenario: 'underdog', bots: 6 },
    key: { event: 'kill', role: 'giant', killer: 'small' },
    pre: 2.6,
    post: 4.5,
    camera: {
      type: 'keyframes',
      keys: [
        { fromKey: -2.6, target: 'giant', zoom: 1.1 },
        { fromKey: -0.8, target: 'key', zoom: 1.7, ease: 'inOutCubic' },
        { fromKey: 0.6, target: 'key', zoom: 1.9, ease: 'outSine' },
        { fromKey: 4.5, target: 'key', zoom: 0.7, rotation: -0.1, ease: 'inOutSine' },
      ],
    },
    events: { autoSlowmo: { on: ['kill'], scale: 0.12, inDuration: 0.08, hold: 1.2, outDuration: 0.8 } },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'golden' },
  },
  {
    id: 'growth-spurt',
    notes: 'Un petit python avale une traînée de proies et s\'allonge à vue d\'œil ; la caméra recule avec lui.',
    duration: 6,
    setup: { seed: 3, scenario: 'growth', bots: 0, food: 0, growerMass: 20, trail: 200 },
    camera: {
      type: 'keyframes',
      keys: [
        { t: 0, target: 'grower', zoom: 2.2 },
        { t: 6, target: 'grower', zoom: 1.1, ease: 'inOutSine' },
      ],
    },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'cinematic' },
  },
  {
    id: 'crowded-finale',
    notes: 'Final : l\'arène grouille de serpents, lente montée en hauteur avant le titre.',
    duration: 6,
    setup: { seed: 17, scenario: 'crowded', bots: 40, food: 1200, spread: 700, warmup: 60 },
    camera: {
      type: 'keyframes',
      keys: [
        { t: 0, x: 420, y: -220, zoom: 1.4, rotation: -0.1 },
        { t: 6, x: 420, y: -220, zoom: 0.55, rotation: 0.08, ease: 'inOutCubic' },
      ],
    },
    frame: { hud: false, names: false, minimap: false, letterbox: true, preset: 'cinematic' },
  },
];
