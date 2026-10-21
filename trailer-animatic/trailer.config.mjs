// Snake.io — trailer animatic. THE single source of truth: timing, script, footage of every shot,
// music and sound cues. Edit this file, then run (from 9-SnakeIO):
//
//   npm run trailer:animatic                      re-cut and re-render what changed
//   npm run trailer:animatic -- --capture         film the takes again first (after editing trailer/shots.js)
//
// Timing is in BEATS (bpm below). At 120 BPM, 1 beat = 0.5 s = 15 frames at 30 fps, so every cut
// lands exactly on a frame and on the music. Change a shot's `beats` and everything after it moves.
//
// Shot fields
//   slug        file name part: clips/<nn>_<slug>.mp4, frames/<nn>_<slug>.png
//   section     hook | montee | jeu | montage | climax | titre | appel
//   beats       duration
//   title       short name (labels, storyboard)
//   action      what happens on screen
//   camera      camera type and framing (the move itself is filmed in the take)
//   clip        footage: { take, at | fromKey, speed? } — a take is a shot of trailer/shots.js, filmed
//               frame by frame at 1080p by the Trailer Studio (takes/<id>/). at: seconds into the take;
//               fromKey: seconds from the take's key moment (kill, near miss…), negative = before.
//   card        title card instead of footage: { kind: black | title | cta, … } (cards/card.html), with
//               `move`: push | pull | punch | … (zoom on the still)
//   speed       written on the label (slow motion is filmed in the take, or clip.speed)
//   transition  how the shot STARTS: cut | flash | fade-in | dip (dip to black from previous)
//   fadeOut     true: fade to black at the end
//   text        on-screen French text (max 5–6 words), textAt (s into the shot), textPos lower|upper|center
//   music, sound   what the audio does (described in the script); sfx: [{ at: s, type, dur? }] actual cues
//   subject     who is on screen (shot list)
export const TRAILER = {
  title: 'Snake.io',
  titleHtml: 'Snake<span>.io</span>',
  concept: 'Personne ne les pilote. Ils chassent, fuient et grandissent tout seuls.',
  tone: 'an intimate, almost wildlife-documentary opening on a tiny snake, then the arena opens up: AIs that see, choose and hunt on their own, a fast montage, and a David-and-Goliath climax before the rats write « Éliminé ».',
  bpm: 120,
  fps: 30,
  width: 1920,
  height: 1080,
  accent: '#9be15d',
  takesDir: 'takes',
  // Music bed, by beat range (see lib/audio.mjs for the patterns).
  music: [
    { from: 0, to: 10, pattern: 'intro', note: 'Low drone under the hiss of the grass; a bite on each mouthful.' },
    { from: 10, to: 32, pattern: 'pulse', note: 'Tense pulse: kick on 1 and 3, sub bass, cold pad.' },
    { from: 32, to: 72, pattern: 'drive', note: 'Full groove: four-on-the-floor, off-beat hats, driving bass.' },
    { from: 72, to: 92, pattern: 'drive+', note: 'Same groove, doubled: claps on 2 and 4, 16th hats, octave bass.' },
    { from: 92, to: 97, pattern: 'riser', note: 'Build: accelerating kicks, noise riser, snare roll.' },
    { from: 97, to: 104, pattern: 'slowmo', note: 'Drop to slow motion on the impact: heartbeat, sub drone, everything filtered.' },
    { from: 104, to: 108, pattern: 'riser', note: 'Second build under the rats running in.' },
    { from: 108, to: 114, pattern: 'slam', note: 'Title slam: huge hit, held chord, long tail.' },
    { from: 114, to: 120, pattern: 'outro', note: 'Soft pad and a last kick per bar, fade out.' },
  ],
  shots: [
    // ---------------------------------------------------------------- HOOK (0–5 s)
    {
      slug: 'hook_eveil', section: 'hook', beats: 6, title: 'Tout petit',
      action: 'Extreme close-up on a tiny green tree python in the grass. It flicks its tongue and starts down a trail of crickets and eggs.',
      camera: 'Macro, low over the grass, slow pull back', transition: 'fade-in',
      clip: { take: 'growth-spurt', at: 0 }, subject: 'Python vert (20 de longueur)',
      text: 'Tout commence petit.', textAt: 0.8, textPos: 'lower',
      music: 'Drone only.', sound: 'Soft hiss, first bite.',
      sfx: [{ at: 0.2, type: 'hiss' }, { at: 1.6, type: 'chomp' }, { at: 2.4, type: 'chomp' }],
    },
    {
      slug: 'hook_appetit', section: 'hook', beats: 4, title: 'Appétit',
      action: 'It eats faster and faster, its body visibly growing segment after segment.',
      camera: 'Same macro, pulling back with it',
      clip: { take: 'growth-spurt', at: 3 }, subject: 'Python vert, qui grandit',
      music: 'Drone, a bite on every beat.', sound: 'Rapid bites.',
      sfx: [0.1, 0.5, 0.9, 1.3, 1.7].map(at => ({ at, type: 'chomp' })),
    },
    // ---------------------------------------------------------------- BUILD-UP (5–16 s)
    {
      slug: 'montee_vision', section: 'montee', beats: 6, title: 'Vision de l\'IA',
      action: 'Debug view: every snake shows its perception circle, the point it is steering to and its decision (hunt, flee, eat, wander).',
      camera: 'Follow the biggest snake, AI debug on', transition: 'cut',
      clip: { take: 'ai-vision', at: 0.5 }, subject: 'Le plus gros serpent et ses voisins',
      text: 'Personne ne les pilote.', textAt: 0.5, textPos: 'lower',
      music: 'Pulse starts: kick on 1 and 3.', sound: 'Digital ticks as decisions change.',
      sfx: [{ at: 0, type: 'whoosh' }, { at: 0.6, type: 'tick' }, { at: 1.4, type: 'tick' }, { at: 2.2, type: 'tick' }],
    },
    {
      slug: 'montee_choix', section: 'montee', beats: 6, title: 'Voir, choisir',
      action: 'Same debug view, closer: target lines snap from prey to prey; a smaller snake flips to « fuite » as a big one approaches.',
      camera: 'Follow, slight rotation',
      clip: { take: 'ai-vision', at: 4 }, subject: 'Chasseur et proie',
      text: 'Ils voient. Ils choisissent.', textAt: 0.3, textPos: 'upper',
      music: 'Pulse continues.', sound: 'Ticks, a hiss.',
      sfx: [{ at: 0.3, type: 'tick' }, { at: 1.1, type: 'tick' }, { at: 1.5, type: 'hiss' }, { at: 2.4, type: 'tick' }],
    },
    {
      slug: 'montee_chasse', section: 'montee', beats: 6, title: 'La chasse',
      action: 'The biggest snake carves through the crowd; smaller ones scatter out of its way.',
      camera: 'Follow with look-ahead, live HUD (score, leaderboard)',
      clip: { take: 'hunt', at: 1 }, subject: 'Le leader de l\'arène',
      text: 'Chasser. Fuir. Grandir.', textAt: 0.4, textPos: 'lower',
      music: 'Pulse, pad opens up.', sound: 'Rattle, whoosh past camera.',
      sfx: [{ at: 0.2, type: 'rattle', dur: 0.9 }, { at: 1.8, type: 'whoosh' }],
    },
    {
      slug: 'montee_carton', section: 'montee', beats: 4, title: 'Carton : survivre',
      action: 'Black card, a coiled cobra barely visible behind the word.', camera: 'Card', move: 'push', transition: 'dip',
      card: { kind: 'black' }, subject: '—',
      text: 'Survivre.', textAt: 0.15, textPos: 'center',
      music: 'Pulse holds, reverse swell into the next cut.', sound: 'Deep boom on the text, whoosh out.',
      sfx: [{ at: 0.15, type: 'boom' }, { at: 1, type: 'reverse' }],
    },
    // ---------------------------------------------------------------- GAMEPLAY (16–36 s)
    {
      slug: 'jeu_arene', section: 'jeu', beats: 8, title: 'L\'arène',
      action: 'From a royal cobra, the camera rises and turns to reveal the whole circular meadow, full of snakes.',
      camera: 'Drone, long zoom out with a slow rotation', transition: 'cut',
      clip: { take: 'arena-reveal', at: 1.6 }, subject: 'Cobra royal, puis toute l\'arène',
      text: 'Une prairie. Douze espèces.', textAt: 1.2, textPos: 'lower',
      music: 'Groove kicks in: four-on-the-floor.', sound: 'Hit and whoosh on the cut, wind.',
      sfx: [{ at: 0, type: 'hit' }, { at: 0, type: 'whoosh' }, { at: 0.5, type: 'wind', dur: 3 }],
    },
    {
      slug: 'jeu_parade', section: 'jeu', beats: 6, title: 'Les espèces',
      action: 'Low tracking shot across the crowd: coral snake, black mamba, diamondback, green tree python, king snake…',
      camera: 'Slow lateral travelling, close',
      clip: { take: 'species-parade', at: 0.5 }, subject: 'Douze espèces',
      music: 'Groove.', sound: 'Hisses left and right, a rattle.',
      sfx: [{ at: 0.3, type: 'hiss', dur: 0.8 }, { at: 1.4, type: 'rattle', dur: 0.7 }, { at: 2.2, type: 'hiss', dur: 0.8 }],
    },
    {
      slug: 'jeu_frolement', section: 'jeu', beats: 6, title: 'Frôlement',
      action: 'A coral snake and a green python rush head to head and pass within a scale of each other; time slows right at the crossing.',
      camera: 'Close, centred on the crossing point',
      clip: { take: 'near-miss', fromKey: -1.2 }, subject: 'Serpent corail, python vert', speed: 'slow-mo 10 % at the crossing (filmed)',
      text: 'Un frôlement.', textAt: 1.2, textPos: 'upper',
      music: 'Groove, filtered during the slow motion.', sound: 'Pass-by, low slowed hiss.',
      sfx: [{ at: 1, type: 'pass' }, { at: 1.2, type: 'slow', dur: 1.6 }],
    },
    {
      slug: 'jeu_piege', section: 'jeu', beats: 8, title: 'Le piège',
      action: 'A giant king cobra coils around a small corn snake and tightens the ring; the prey searches for a way out.',
      camera: 'High, the ring filling the frame, pushing in',
      clip: { take: 'the-trap', fromKey: -3.6 }, subject: 'Cobra royal géant, serpent des blés',
      text: 'Le piège se referme.', textAt: 0.6, textPos: 'lower',
      music: 'Groove.', sound: 'Long hiss, rattle building.',
      sfx: [{ at: 0.2, type: 'hiss', dur: 1.6 }, { at: 2.2, type: 'rattle', dur: 1.4 }],
    },
    {
      slug: 'jeu_explosion', section: 'jeu', beats: 4, title: 'Impact',
      action: 'A diamondback charges into a king snake\'s body and bursts into dozens of mice and eggs.',
      camera: 'Follow the attacker, slow motion on the impact', transition: 'flash',
      clip: { take: 'kill-burst', fromKey: -0.5 }, subject: 'Crotale diamantin, serpent-roi', speed: 'slow-mo 12 % (filmed)',
      music: 'Groove.', sound: 'Hit, burst of pops.',
      sfx: [{ at: 0.5, type: 'hit' }, { at: 0.5, type: 'pops' }],
    },
    {
      slug: 'jeu_charognards', section: 'jeu', beats: 4, title: 'Rien ne se perd',
      action: 'Scavengers rush in from every side to eat the remains.',
      camera: 'Same place, wider',
      clip: { take: 'kill-burst', fromKey: 2.2 }, subject: 'Charognards',
      text: 'Rien ne se perd.', textAt: 0.3, textPos: 'upper',
      music: 'Groove.', sound: 'Bites everywhere.',
      sfx: [0.2, 0.5, 0.8, 1.1, 1.4, 1.7].map(at => ({ at, type: 'chomp' })),
    },
    {
      slug: 'jeu_classement', section: 'jeu', beats: 4, title: 'Classement en direct',
      action: 'The leader keeps growing; score and leaderboard update live in the game\'s HUD.',
      camera: 'Follow, HUD visible',
      clip: { take: 'hunt', at: 4.5 }, subject: 'Le leader, interface du jeu',
      text: 'Chaque partie est unique.', textAt: 0.2, textPos: 'lower',
      music: 'Groove, last bar before the montage.', sound: 'Bites, whoosh into the montage.',
      sfx: [{ at: 0.4, type: 'chomp' }, { at: 1.2, type: 'chomp' }, { at: 2, type: 'whoosh' }],
    },
    // ---------------------------------------------------------------- MONTAGE (36–46 s), one shot per bar half
    {
      slug: 'montage_coupe', section: 'montage', beats: 2, title: 'Coupe la route',
      action: 'A king cobra boosts alongside a diamondback.', camera: 'Follow, close',
      clip: { take: 'cut-off', fromKey: -1.6 }, subject: 'Cobra royal, crotale',
      music: 'Doubled groove.', sound: 'Whoosh.', sfx: [{ at: 0.1, type: 'whoosh' }],
    },
    {
      slug: 'montage_foule', section: 'montage', beats: 2, title: 'La foule',
      action: 'A swarm of snakes seen from above.', camera: 'Drone',
      clip: { take: 'crowded-finale', at: 0.4 }, subject: 'Quarante serpents',
      text: 'Plus nombreux.', textAt: 0.1, textPos: 'lower',
      music: 'Doubled groove.', sound: 'Hiss.', sfx: [{ at: 0, type: 'hiss', dur: 0.8 }],
    },
    {
      slug: 'montage_croisement', section: 'montage', beats: 2, title: 'Croisement',
      action: 'The two heads slide past each other in slow motion.', camera: 'Close',
      clip: { take: 'near-miss', fromKey: 0.1 }, subject: 'Corail, python vert',
      music: 'Doubled groove.', sound: 'Low pass-by.', sfx: [{ at: 0, type: 'slow', dur: 1 }],
    },
    {
      slug: 'montage_cerveau', section: 'montage', beats: 2, title: 'Décisions',
      action: 'Debug lines flicker from target to target.', camera: 'Follow, debug on',
      clip: { take: 'ai-vision', at: 2.4 }, subject: 'IA en debug',
      text: 'Plus malins.', textAt: 0.1, textPos: 'upper',
      music: 'Doubled groove.', sound: 'Ticks.', sfx: [{ at: 0, type: 'tick' }, { at: 0.5, type: 'tick' }],
    },
    {
      slug: 'montage_anneau', section: 'montage', beats: 2, title: 'L\'anneau',
      action: 'The ring is almost closed around the small snake.', camera: 'High',
      clip: { take: 'the-trap', fromKey: -1.2 }, subject: 'Cobra géant',
      music: 'Doubled groove.', sound: 'Rattle.', sfx: [{ at: 0, type: 'rattle', dur: 0.9 }],
    },
    {
      slug: 'montage_croissance', section: 'montage', beats: 2, title: 'Croissance',
      action: 'The little python is now long, swallowing the end of its trail.', camera: 'Pulling back',
      clip: { take: 'growth-spurt', at: 4.6 }, subject: 'Python vert, devenu long',
      text: 'Plus gros.', textAt: 0.1, textPos: 'lower',
      music: 'Doubled groove.', sound: 'Bites.', sfx: [{ at: 0.1, type: 'chomp' }, { at: 0.5, type: 'chomp' }],
    },
    {
      slug: 'montage_rabat', section: 'montage', beats: 2, title: 'Le rabat',
      action: 'The cobra cuts in front; the diamondback hits its body and bursts.', camera: 'Close, flash on the impact', transition: 'flash',
      clip: { take: 'cut-off', fromKey: -0.2 }, subject: 'Crotale éliminé',
      music: 'Doubled groove.', sound: 'Hit, pops.', sfx: [{ at: 0.2, type: 'hit' }, { at: 0.2, type: 'pops' }],
    },
    {
      slug: 'montage_leader', section: 'montage', beats: 2, title: 'Le leader',
      action: 'The leader sweeps across the HUD-framed arena.', camera: 'Follow, HUD visible',
      clip: { take: 'hunt', at: 5.8 }, subject: 'Le leader',
      music: 'Doubled groove.', sound: 'Whoosh.', sfx: [{ at: 0.1, type: 'whoosh' }],
    },
    {
      slug: 'montage_parade', section: 'montage', beats: 2, title: 'Écailles',
      action: 'Scales and patterns sliding past: bands, diamonds, chevrons.', camera: 'Travelling, very close',
      clip: { take: 'species-parade', at: 4.6 }, subject: 'Espèces',
      text: 'Plus vite.', textAt: 0.1, textPos: 'upper',
      music: 'Doubled groove.', sound: 'Hiss.', sfx: [{ at: 0, type: 'hiss', dur: 0.8 }],
    },
    {
      slug: 'montage_envol', section: 'montage', beats: 2, title: 'Envol',
      action: 'The camera rises over the writhing crowd.', camera: 'Drone rising',
      clip: { take: 'crowded-finale', at: 3.6 }, subject: 'Toute la foule',
      music: 'Doubled groove, last hit before the build.', sound: 'Wind.', sfx: [{ at: 0, type: 'wind', dur: 1 }],
    },
    // ---------------------------------------------------------------- CLIMAX (46–53 s)
    {
      slug: 'climax_geant', section: 'climax', beats: 5, title: 'Le géant',
      action: 'A 3 000-long giant glides through the meadow; a tiny coral snake darts across its path.',
      camera: 'Follow the giant, pushing in on the small one', transition: 'cut',
      clip: { take: 'underdog', fromKey: -2.5 }, subject: 'Géant, petit corail',
      text: 'Le plus petit…', textAt: 0.4, textPos: 'upper',
      music: 'Build: accelerating kicks, riser.', sound: 'Long hiss rising.',
      sfx: [{ at: 0, type: 'hiss', dur: 2.4 }],
    },
    {
      slug: 'climax_chute', section: 'climax', beats: 7, title: 'La chute du géant',
      action: 'The giant hits the little one\'s body and explodes into a field of prey; scavengers pour in from everywhere.',
      camera: 'Close on the impact, slow motion, then pulling out', transition: 'flash',
      clip: { take: 'underdog', fromKey: -0.1 }, subject: 'Le géant éliminé', speed: 'slow-mo 12 % (filmed)',
      text: '…fait tomber le géant.', textAt: 0.9, textPos: 'lower',
      music: 'Slow-motion drop.', sound: 'Slam, pops, heartbeat.',
      sfx: [{ at: 0.1, type: 'slam' }, { at: 0.1, type: 'pops' }, { at: 0.6, type: 'slow', dur: 2.6 }],
    },
    // ---------------------------------------------------------------- TITLE (53–57 s)
    {
      slug: 'titre_elimine', section: 'titre', beats: 4, title: 'Éliminé',
      action: 'Our snake is cut off and dies; hundreds of rats run in from the edges and write « Éliminé ».',
      camera: 'Game camera, HUD visible', transition: 'cut',
      clip: { take: 'eliminated', fromKey: 1.6 }, subject: 'Le joueur, les rats',
      music: 'Second build.', sound: 'Rats squeaking and scurrying.',
      sfx: [{ at: 0, type: 'squeak', dur: 1.8 }],
    },
    {
      slug: 'titre_logo', section: 'titre', beats: 6, title: 'Titre',
      action: 'Title card: SNAKE.IO over a coiled king cobra.', camera: 'Card', move: 'punch', transition: 'flash',
      card: { kind: 'title', tagline: 'La prairie ne pardonne pas.' }, subject: '—',
      music: 'Title slam.', sound: 'Slam and long tail.', sfx: [{ at: 0, type: 'slam' }],
    },
    // ---------------------------------------------------------------- CALL TO ACTION (57–60 s)
    {
      slug: 'appel', section: 'appel', beats: 6, title: 'Appel à l\'action',
      action: 'Play free in the browser, link to the repository.', camera: 'Card', move: 'pull', transition: 'dip', fadeOut: true,
      card: { kind: 'cta', line: 'Gratuit, dans ton navigateur.', link: 'github.com/r0od3x/SnakeIO' }, subject: '—',
      music: 'Outro, fade out.', sound: 'One soft hiss.', sfx: [{ at: 0.3, type: 'hiss', dur: 1.4 }],
    },
  ],
};
