// Mise en scène : une « prise » (run) = une partie SnakeArena créée avec un aléatoire à graine
// (même graine + même réglage = même prise, image pour image), plus une scène préparée et les
// réglages de tournage (joueur invincible, joueur piloté par l'IA).
// Les scènes posent les serpents au départ (c'est la préparation du plateau) ; ensuite tout
// bouge par steering. Rôles nommés (run.actors) pour les caméras : hunter, prey, victim…
const Director = (() => {
  const SCENARIOS = ['open', 'encircle', 'nearMiss', 'killBurst', 'growth', 'crowded'];
  const LABELS = {
    open: 'Partie libre', encircle: 'Encerclement', nearMiss: 'Frôlement tête-à-tête',
    killBurst: 'Élimination en orbes', growth: 'Croissance express', crowded: 'Arène bondée',
  };
  const DEFAULTS = {
    seed: 1, scenario: 'open', bots: 12, food: 450, playerMass: null, playerSpecies: null,
    invincible: true, autopilot: true, warmup: 0, at: null,
  };
  // Le joueur est écarté des scènes, à cet endroit.
  const PLAYER_ASIDE = { x: -900, y: 700 };
  const ACTOR_NAMES = { hunter: 'Titan', prey: 'Brindille', a: 'Éclair', b: 'Tonnerre', victim: 'Fonceur',
    killer: 'Muraille', grower: 'Glouton' };

  // Générateur à graine (mulberry32) : tout l'aléatoire de la prise passe par lui.
  function seeded(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setMass(snake, mass) {
    snake.mass = Math.max(1, mass);
    snake.syncSize();
    snake.resetBody();
    return snake;
  }

  // Pose le serpent le long d'un chemin : path(d) = point à d px derrière la tête (d = 0 : tête).
  function layAlong(snake, path) {
    const head = path(0);
    const next = path(-1);
    const speed = snake.baseSpeed;
    const dir = (a, b) => {
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
    };
    const u = dir(head, next);
    snake.pos.set(head.x, head.y);
    snake.vel.set(u.x * speed, u.y * speed);
    snake.resetBody();
    snake.body.forEach((seg, i) => {
      const d = snake.spacing * (i + 1);
      const p = path(d);
      const v = dir(path(d), path(d - 1));
      seg.pos.set(p.x, p.y);
      seg.vel.set(v.x * speed, v.y * speed);
    });
    return snake;
  }

  function layLine(snake, x, y, angle) {
    return layAlong(snake, d => ({ x: x - Math.cos(angle) * d, y: y - Math.sin(angle) * d }));
  }

  // Sur un cercle (centre c, rayon r), tête à l'angle a0, avançant dans le sens dir (+1 : sens trigo).
  function layArc(snake, c, r, a0, dir = 1) {
    return layAlong(snake, d => {
      const a = a0 - dir * d / r;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    });
  }

  function spawnActor(run, role, { x, y, angle = 0, mass = 40, species = null, script = null, invulnerable = false, name } = {}) {
    const state = run.state;
    const kind = SnakeSpecies.byId(species) ?? SnakeSpecies.random(run.rng);
    const actor = new ActorSnake(x, y, kind, name ?? ACTOR_NAMES[role] ?? role, script);
    SnakeArena.applyParams(actor, state.params);
    setMass(actor, mass);
    layLine(actor, x, y, angle);
    actor.invulnerable = invulnerable;
    actor.role = role;
    state.snakes.push(actor);
    run.actors[role] = actor;
    return actor;
  }

  // ---------- Scènes ----------
  const SCENES = {
    open() {},

    // Un géant fait le tour d'un petit serpent, qui tourne en rond au centre puis tente de s'échapper.
    encircle(run, s) {
      const c = run.focus;
      const hunter = spawnActor(run, 'hunter', { x: c.x, y: c.y, mass: s.giantMass ?? 650, species: s.giantSpecies ?? 'kingCobra', invulnerable: true });
      const r = Math.max(140, hunter.bodyLength() * 0.8 / (Math.PI * 2));
      hunter.script = { kind: 'orbit', center: c, radius: r, dir: 1 };
      layArc(hunter, c, r, 0, 1);
      const prey = spawnActor(run, 'prey', { x: c.x + r * 0.35, y: c.y, angle: -Math.PI / 2, mass: s.preyMass ?? 45, species: s.preySpecies ?? 'corn',
        script: { kind: 'orbit', center: c, radius: r * 0.35, dir: -1, frames: s.release ?? 360 } });
      layArc(prey, c, r * 0.35, 0, -1);
      run.ring = r;
    },

    // Deux serpents foncent l'un vers l'autre et se frôlent sans se toucher.
    nearMiss(run, s) {
      const c = run.focus;
      const mass = s.mass ?? 160;
      const a = spawnActor(run, 'a', { x: c.x - 460, y: c.y, mass, species: s.speciesA ?? 'coral', script: { kind: 'heading', angle: 0, frames: 260, boost: true } });
      const b = spawnActor(run, 'b', { x: c.x + 460, y: c.y, mass, species: s.speciesB ?? 'greenTreePython',
        script: { kind: 'heading', angle: Math.PI, frames: 260, boost: true } });
      // Écart entre les deux axes : juste au-dessus du contact (tête contre corps).
      const gap = a.r * 0.8 + b.r + (s.clearance ?? 10);
      layLine(a, c.x - 460, c.y - gap / 2, 0);
      layLine(b, c.x + 460, c.y + gap / 2, Math.PI);
      run.gap = gap;
    },

    // Un gros serpent fonce dans le corps d'un autre et explose en orbes.
    killBurst(run, s) {
      const c = run.focus;
      const killer = spawnActor(run, 'killer', { x: c.x + 80, y: c.y + 300, angle: -Math.PI / 2, mass: s.killerMass ?? 220, species: s.killerSpecies ?? 'kingsnake',
        invulnerable: true, script: { kind: 'heading', angle: -Math.PI / 2, frames: 900 } });
      const middle = () => killer.body[Math.floor(killer.body.length * 0.55)] ?? killer;
      spawnActor(run, 'victim', { x: c.x - 520, y: c.y, angle: 0, mass: s.victimMass ?? 320, species: s.victimSpecies ?? 'diamondback',
        script: { kind: 'seek', target: middle, boost: true } });
    },

    // Un petit serpent avale une traînée de proies et grossit à vue d'œil.
    growth(run, s) {
      const c = run.focus;
      spawnActor(run, 'grower', { x: c.x, y: c.y, angle: 0, mass: s.growerMass ?? 20, species: s.growerSpecies ?? 'greenTreePython', invulnerable: true,
        script: { kind: 'heading', angle: 0, frames: 90 } });
      const count = s.trail ?? 160;
      for (let i = 0; i < count; i++) {
        const t = 60 + i * 13;
        run.state.foods.push(new Food(c.x + t * 0.9, c.y + Math.sin(i / 7) * 60 + t * 0.15, 3));
      }
    },

    // Beaucoup de serpents et de proies autour du point de vue.
    crowded(run, s) {
      const c = run.focus;
      // Au moins 30 serpents et 900 proies (plus si la prise le demande).
      setBots(run, Math.max(30, s.bots));
      setFood(run, Math.max(900, s.food));
      for (const bot of SnakeArena.bots(run.state)) {
        const a = run.rng() * Math.PI * 2;
        const d = Math.sqrt(run.rng()) * (s.spread ?? 650);
        layLine(bot, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, run.rng() * Math.PI * 2);
      }
      // Proies tout de suite au complet, les nouvelles autour du point de vue.
      const extra = Math.max(250, run.state.params.food - run.state.foods.length);
      for (let i = 0; i < extra; i++) {
        const a = run.rng() * Math.PI * 2;
        const d = Math.sqrt(run.rng()) * (s.spread ?? 650);
        run.state.foods.push(new Food(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 1 + Math.floor(run.rng() * 3)));
      }
      layLine(run.state.player, c.x - 40, c.y, 0);
    },
  };

  // ---------- Prise ----------
  function newRun(setup = {}, profile = {}) {
    const s = { ...DEFAULTS, ...setup };
    if (!SCENARIOS.includes(s.scenario)) throw new RangeError(`scène inconnue : ${s.scenario}`);
    const rng = seeded(s.seed);
    const params = { ...SnakeArena.initialParams(), bots: Math.max(0, Math.round(s.bots)), food: Math.max(0, Math.round(s.food)) };
    const state = SnakeArena.create(params, rng, { name: profile.name ?? 'Toi', species: s.playerSpecies ?? profile.species ?? null });
    const focus = s.at ?? (s.scenario === 'open' ? { x: 0, y: 0 } : { x: 420, y: -220 });
    const run = { setup: s, rng, state, actors: {}, focus: { ...focus }, flags: { invincible: s.invincible, autopilot: s.autopilot } };
    if (s.playerMass) setMass(state.player, s.playerMass);
    if (s.scenario !== 'open' && s.scenario !== 'crowded') layLine(state.player, PLAYER_ASIDE.x, PLAYER_ASIDE.y, -2.4);
    SCENES[s.scenario](run, s);
    applyPlayerFlags(run);
    for (let i = 0; i < s.warmup; i++) step(run);
    return run;
  }

  // Remplace le serpent du joueur par une copie pilotée autrement (même masse, même corps).
  function convertPlayer(state, toActor) {
    const from = state.player;
    const to = toActor
      ? new ActorSnake(from.pos.x, from.pos.y, from.species, from.name)
      : new PlayerSnake(from.pos.x, from.pos.y, from.species, from.name);
    SnakeArena.applyParams(to, state.params);
    to.mass = from.mass;
    to.syncSize();
    to.vel.set(from.vel.x, from.vel.y);
    to.body = from.body;
    Object.assign(to, { kills: from.kills, age: from.age, invulnerable: from.invulnerable });
    state.snakes[state.snakes.indexOf(from)] = to;
    state.player = to;
    return to;
  }

  // Joueur invincible et / ou piloté par l'IA ; réappliqué à chaque pas (après une réapparition).
  function applyPlayerFlags(run) {
    const state = run.state;
    if (!state.player) return;
    const actor = state.player instanceof ActorSnake;
    if (run.flags.autopilot && !actor) convertPlayer(state, true);
    else if (!run.flags.autopilot && actor) convertPlayer(state, false);
    state.player.invulnerable = Boolean(run.flags.invincible);
  }

  function setFlags(run, flags) {
    Object.assign(run.flags, flags);
    applyPlayerFlags(run);
  }

  function beforeStep(run) {
    applyPlayerFlags(run);
  }

  function step(run, w = 1280, h = 720) {
    beforeStep(run);
    SnakeArena.step(run.state, w, h, run.rng);
  }

  // Nombre de bots : on retire d'abord les bots ordinaires, jamais les acteurs d'une scène.
  function setBots(run, count) {
    const state = run.state;
    state.params.bots = Math.max(0, Math.round(count));
    const current = SnakeArena.bots(state);
    if (current.length < state.params.bots) SnakeArena.resizeBots(state, state.params.bots, run.rng);
    const extras = current.filter(b => !b.isActor);
    let excess = current.length - state.params.bots;
    while (excess-- > 0 && extras.length) state.snakes.splice(state.snakes.indexOf(extras.pop()), 1);
  }

  function setFood(run, count) {
    run.state.params.food = Math.max(0, Math.round(count));
    if (run.state.foods.length > run.state.params.food) run.state.foods.length = run.state.params.food;
  }

  function setLength(snake, mass) {
    snake.mass = Math.max(1, mass);
    snake.syncSize();
  }

  function setSpecies(snake, id) {
    const species = SnakeSpecies.byId(id);
    if (species) snake.species = species;
  }

  // Serpent par rôle : « player », un rôle de la scène, « leader » (le plus gros), ou un nom.
  function resolve(run, role) {
    const state = run.state;
    if (role === 'player') return state.player;
    if (role === 'leader') return [...state.snakes].sort((a, b) => b.mass - a.mass)[0] ?? null;
    // Un acteur mort est encore renvoyé : la caméra garde sa dernière position.
    if (run.actors[role]) return run.actors[role];
    return state.snakes.find(s => s.name === role) ?? null;
  }

  return { SCENARIOS, LABELS, DEFAULTS, seeded, setMass, layAlong, layLine, layArc, spawnActor, newRun, convertPlayer,
    applyPlayerFlags, setFlags, beforeStep, step, setBots, setFood, setLength, setSpecies, resolve };
})();
