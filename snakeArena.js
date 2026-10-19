// Snake.io : une prairie circulaire plus grande que l'écran, caméra qui suit le joueur.
// Gestion de scène uniquement (aucun steering ici) : création, nourriture, repas, collisions,
// morts et réapparitions, caméra, classement, puis dessin du monde (fond, orbes, serpents,
// mini-carte). Les serpents et les orbes calculent leurs forces et les appliquent eux-mêmes.
const SnakeArena = (() => {
  const RADIUS = 1500;
  const FOOD_TARGET = 450;
  const FOOD_SPAWN_PER_FRAME = 4;
  const MAX_FOOD = 900;
  // Images avant la réapparition du joueur ; distance minimale d'apparition aux autres têtes.
  const PLAYER_RESPAWN = 270;
  const SAFE_DISTANCE = 300;
  // Fil des éliminations : nombre d'entrées gardées et durée d'affichage (images).
  const FEED_SIZE = 6;
  const FEED_FRAMES = 300;
  // Réglages des sliders du mode (conservés entre deux parties) : nombre de bots, vitesses de
  // croisière et d'accélération, agilité (force de virage), perception des bots, nourriture.
  const SETTINGS = {
    bots: { min: 1, max: 30, step: 1, initial: 12, decimals: 0 },
    baseSpeed: { min: 1, max: 6, step: 0.1, initial: 2.6, decimals: 1 },
    boostSpeed: { min: 2, max: 12, step: 0.2, initial: 5.2, decimals: 1 },
    agility: { min: 0.1, max: 1, step: 0.05, initial: 0.4, decimals: 2 },
    perception: { min: 80, max: 700, step: 10, initial: 320, decimals: 0 },
    food: { min: 50, max: 900, step: 10, initial: 450, decimals: 0 },
  };

  function initialParams() {
    return Object.fromEntries(Object.entries(SETTINGS).map(([name, range]) => [name, range.initial]));
  }

  function formatParam(name, value) {
    return value.toFixed(SETTINGS[name].decimals);
  }

  // Les réglages s'appliquent aux paramètres lus par seek, turnOnly et la locomotion fournie.
  function applyParams(snake, params) {
    snake.baseSpeed = params.baseSpeed;
    snake.boostSpeed = params.boostSpeed;
    snake.agility = params.agility;
    if (!snake.boosting) snake.maxSpeed = snake.baseSpeed;
    snake.syncSize();
    if ('perception' in snake) {
      snake.perception = params.perception;
      snake.preyRange = params.perception * 0.78;
      snake.predatorRange = params.perception * 0.56;
    }
    return snake;
  }

  // Change un réglage ; si la partie en cours est une arène, il s'applique tout de suite.
  function setParam(params, name, value, state = null, rng = Math.random) {
    const range = SETTINGS[name];
    const valid = range && Number.isFinite(value) && value >= range.min && value <= range.max
      && (range.step !== 1 || Number.isInteger(value));
    if (!valid) throw new RangeError(`${name} doit être un nombre entre ${range?.min} et ${range?.max}.`);
    params[name] = value;
    if (!state) return;
    if (name === 'bots') resizeBots(state, value, rng);
    else if (name === 'food') {
      if (state.foods.length > value) state.foods.length = value;
    } else for (const snake of state.snakes) applyParams(snake, params);
  }

  function bindParamSlider(slider, output, name, apply) {
    const synchronize = () => {
      const value = Number(slider.value);
      apply(name, value);
      output.value = formatParam(name, value);
    };
    slider.addEventListener('input', synchronize);
    synchronize();
  }

  function randomPointInDisk(radius, rng) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * radius;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  }

  // Surtout des grillons, des œufs et des grenouilles ; parfois une souris.
  function randomFood(rng) {
    const p = randomPointInDisk(RADIUS - 40, rng);
    const value = rng() < 0.06 ? 5 : 1 + Math.floor(rng() * 3);
    return new Food(p.x, p.y, value);
  }

  function safeSpawn(state, rng) {
    let best = null;
    let bestGap = -1;
    for (let attempt = 0; attempt < 20; attempt++) {
      const p = randomPointInDisk(RADIUS * 0.75, rng);
      const gap = Math.min(Infinity, ...state.snakes.map(s => Math.hypot(s.pos.x - p.x, s.pos.y - p.y)));
      if (gap > SAFE_DISTANCE) return p;
      if (gap > bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    return best;
  }

  function aim(snake, rng) {
    const a = rng() * Math.PI * 2;
    snake.vel.set(Math.cos(a) * snake.baseSpeed, Math.sin(a) * snake.baseSpeed);
    snake.resetBody();
    return snake;
  }

  function makeBot(state, rng) {
    const i = state.nextBot++;
    const p = safeSpawn(state, rng);
    const bot = new SnakeBot(p.x, p.y, SnakeSpecies.LIST[i % SnakeSpecies.LIST.length],
      SnakeSpecies.NAMES[i % SnakeSpecies.NAMES.length]);
    bot.grow(rng() * 80);
    return aim(applyParams(bot, state.params), rng);
  }

  // Espèce choisie au menu, ou une espèce au hasard à chaque vie.
  function makePlayer(state, rng) {
    const p = state.snakes.length ? safeSpawn(state, rng) : { x: 0, y: 0 };
    const species = SnakeSpecies.byId(state.profile.species) ?? SnakeSpecies.random(rng);
    return aim(applyParams(new PlayerSnake(p.x, p.y, species, state.profile.name), state.params), rng);
  }

  function bots(state) {
    return state.snakes.filter(s => s instanceof SnakeBot);
  }

  function resizeBots(state, count, rng = Math.random) {
    let list = bots(state);
    while (list.length > count) {
      const last = list.pop();
      state.snakes.splice(state.snakes.indexOf(last), 1);
    }
    while (list.length < count) {
      const bot = makeBot(state, rng);
      state.snakes.push(bot);
      list.push(bot);
    }
  }

  // Nom et espèce du joueur (species = null : au hasard à chaque vie).
  function normalizeProfile(profile = {}) {
    const name = String(profile.name ?? '').trim().slice(0, 16) || 'Toi';
    return { name, species: SnakeSpecies.byId(profile.species) ? profile.species : null };
  }

  // Nouvelle partie : params = réglages des sliders (gardés d'une partie à l'autre).
  function create(params = initialParams(), rng = Math.random, profile = {}) {
    const state = {
      params, profile: normalizeProfile(profile), snakes: [], foods: [], player: null,
      stats: { kills: 0, deaths: 0, best: 0, eaten: 0, lives: 1, bestRank: null, frames: 0 },
      events: { hits: 0 }, feed: [],
      camera: { x: 0, y: 0, zoom: 1 }, input: { target: null, boost: false },
      respawnIn: 0, lastDeath: null, frame: 0, nextBot: 0, lastRank: null, lastMilestone: 0,
    };
    state.player = makePlayer(state, rng);
    state.snakes.push(state.player);
    resizeBots(state, state.params.bots, rng);
    while (state.foods.length < state.params.food) state.foods.push(randomFood(rng));
    return state;
  }

  // Souris (coordonnées écran) -> point visé dans le monde, à travers la caméra.
  function setInput(state, sx, sy, boost, w, h) {
    const { x, y, zoom } = state.camera;
    state.input = { target: createVector(x + (sx - w / 2) / zoom, y + (sy - h / 2) / zoom), boost: Boolean(boost) };
  }

  // Mort : le corps devient des orbes ; le tueur compte une élimination.
  function kill(state, snake, killer, rng) {
    snake.alive = false;
    for (const r of snake.remains()) {
      const a = rng() * Math.PI * 2;
      state.foods.push(new Food(r.x, r.y, r.value, Math.cos(a) * 1.5, Math.sin(a) * 1.5));
    }
    state.snakes.splice(state.snakes.indexOf(snake), 1);
    if (killer) killer.kills++;
    if (killer && killer === state.player) {
      state.stats.kills++;
      state.events.kills++;
    }
    if (snake === state.player || killer === state.player) state.events.hits++;
    // Fil des éliminations (affiché quelques secondes en haut de l'écran).
    state.feed.push({ frame: state.frame, killer: killer?.name ?? null, victim: snake.name,
      color: killer?.species.ui ?? '#ffffff', victimColor: snake.species.ui,
      mine: snake === state.player || killer === state.player });
    if (state.feed.length > FEED_SIZE) state.feed.shift();
    if (snake === state.player) {
      state.events.death = { by: killer ? killer.name : null };
      state.player = null;
      state.respawnIn = PLAYER_RESPAWN;
      state.stats.deaths++;
      state.lastDeath = { by: killer ? killer.name : 'le bord de l\'arène', length: Math.round(snake.mass),
        kills: snake.kills, x: snake.pos.x, y: snake.pos.y };
    }
  }

  function eat(state) {
    let kept = 0;
    for (const food of state.foods) {
      const eater = state.snakes.find(s => Math.hypot(s.pos.x - food.pos.x, s.pos.y - food.pos.y) < s.r + food.r * 0.5);
      if (eater) {
        eater.grow(food.value);
        if (eater === state.player) {
          state.events.eaten++;
          state.stats.eaten++;
        }
        continue;
      }
      state.foods[kept++] = food;
    }
    state.foods.length = kept;
  }

  // Tête hors de l'arène, ou tête contre le corps d'un autre serpent : mort.
  function collisions(state, rng) {
    const dead = [];
    for (const snake of state.snakes) {
      if (Math.hypot(snake.pos.x, snake.pos.y) > RADIUS - snake.r * 0.5) {
        dead.push([snake, null]);
        continue;
      }
      const killer = state.snakes.find(o => o !== snake && o.touchesBody(snake.pos, snake.r));
      if (killer) dead.push([snake, killer]);
    }
    for (const [snake, killer] of dead) kill(state, snake, killer, rng);
  }

  function updateCamera(state) {
    const cam = state.camera;
    const focus = state.player ? state.player.pos : state.lastDeath;
    if (focus) {
      cam.x += (focus.x - cam.x) * 0.12;
      cam.y += (focus.y - cam.y) * 0.12;
    }
    // Plus le serpent est gros, plus la caméra recule.
    const goal = state.player ? Math.min(1.05, Math.max(0.6, 1.05 - (state.player.r - 9) * 0.022)) : cam.zoom;
    cam.zoom += (goal - cam.zoom) * 0.03;
  }

  function step(state, w, h, rng = Math.random) {
    state.frame++;
    state.events = { hits: 0, kills: 0, death: null, respawned: false, rank: null,
      milestone: null, eaten: 0, boosting: false };
    const world = { snakes: state.snakes, foods: state.foods, arenaRadius: RADIUS, input: state.input, rng };
    for (const snake of state.snakes) {
      snake.applyBehaviors(world);
      snake.update();
      for (const d of snake.takeDrops()) state.foods.push(new Food(d.x, d.y, d.value));
    }
    for (const food of state.foods) {
      food.applyBehaviors(state.snakes, RADIUS, rng);
      food.update();
    }
    eat(state);
    collisions(state, rng);
    if (!state.player && --state.respawnIn <= 0) respawn(state, rng);
    // Un bot mort est remplacé, un par image.
    if (bots(state).length < state.params.bots) state.snakes.push(makeBot(state, rng));
    for (let i = 0; i < FOOD_SPAWN_PER_FRAME && state.foods.length < state.params.food; i++) state.foods.push(randomFood(rng));
    if (state.foods.length > MAX_FOOD) state.foods.splice(0, state.foods.length - MAX_FOOD);
    if (state.player) {
      state.stats.frames++;
      state.events.boosting = state.player.boosting;
      state.stats.best = Math.max(state.stats.best, Math.round(state.player.mass));
      // Première place gagnée, palier de 100 de longueur franchi (pour la voix).
      const current = rank(state);
      if (current === 1 && state.lastRank !== null && state.lastRank !== 1) state.events.rank = 1;
      state.lastRank = current;
      state.stats.bestRank = Math.min(state.stats.bestRank ?? Infinity, current);
      const milestone = Math.floor(state.player.mass / 100) * 100;
      if (milestone >= 100 && milestone > (state.lastMilestone ?? 0)) state.events.milestone = milestone;
      state.lastMilestone = Math.max(state.lastMilestone ?? 0, milestone);
    }
    updateCamera(state);
  }

  // Réapparition (après le délai, ou tout de suite avec le bouton « Rejouer »).
  function respawn(state, rng = Math.random) {
    if (state.player) return state.player;
    state.player = makePlayer(state, rng);
    state.snakes.push(state.player);
    state.respawnIn = 0;
    state.events.respawned = true;
    state.stats.lives++;
    state.lastMilestone = 0;
    state.lastRank = null;
    return state.player;
  }

  // Éliminations des FEED_FRAMES dernières images, les plus récentes en dernier.
  function recentFeed(state) {
    return state.feed.filter(item => state.frame - item.frame < FEED_FRAMES);
  }

  function leaderboard(state, n = 5) {
    return [...state.snakes].sort((a, b) => b.mass - a.mass).slice(0, n).map(s => ({
      name: s.name, species: s.species.name, mass: Math.round(s.mass), isPlayer: s === state.player, color: s.species.ui,
    }));
  }

  function rank(state) {
    if (!state.player) return null;
    return [...state.snakes].sort((a, b) => b.mass - a.mass).indexOf(state.player) + 1;
  }

  function summary(state) {
    if (!state.player) return `Éliminé · réapparition dans ${Math.ceil(state.respawnIn / 60)} s`;
    return `Longueur : ${Math.round(state.player.mass)} · Rang : ${rank(state)} / ${state.snakes.length}`
      + ` · Éliminations : ${state.stats.kills}`;
  }

  // Données de l'interface HTML (score, classement, écran de mort).
  function hud(state) {
    const death = state.lastDeath;
    return {
      length: state.player ? Math.round(state.player.mass) : 0,
      rankText: state.player
        ? `Rang ${rank(state)} sur ${state.snakes.length} · ${state.stats.kills} élimination${state.stats.kills > 1 ? 's' : ''}`
        : 'En attente…',
      board: leaderboard(state),
      dead: !state.player,
      deathText: death
        ? `Arrêté par ${death.by} · longueur ${death.length} · retour dans ${Math.max(0, Math.ceil(state.respawnIn / 60))} s`
        : '',
      best: state.stats.best,
      species: state.player ? state.player.species.name : '',
      feed: recentFeed(state),
      stats: { ...state.stats, seconds: Math.round(state.stats.frames / 60) },
    };
  }

  // ---------- Dessin (canvas 2D) ----------
  function visible(p, margin, view) {
    return p.x > view.left - margin && p.x < view.right + margin && p.y > view.top - margin && p.y < view.bottom + margin;
  }

  // Nom et espèce au-dessus de chaque bot, lisibles sur l'herbe.
  function drawNames(ctx, state, view) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    for (const snake of state.snakes) {
      if (snake === state.player || !visible(snake.pos, 40, view)) continue;
      const y = snake.pos.y - snake.r * 1.4 - 10;
      ctx.font = '600 12px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 250, 0.9)';
      ctx.fillText(snake.name, snake.pos.x, y - 12);
      ctx.font = '500 10px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(235, 240, 220, 0.7)';
      ctx.fillText(snake.species.name, snake.pos.x, y);
    }
    ctx.restore();
  }

  function drawMinimap(ctx, state, w, h) {
    const size = 132;
    const cx = w - size / 2 - 20;
    const cy = h - size / 2 - 20;
    const scale = (size / 2 - 8) / RADIUS;
    ctx.save();
    ctx.fillStyle = 'rgba(16, 26, 10, 0.62)';
    ctx.strokeStyle = 'rgba(255, 255, 240, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(92, 140, 52, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS * scale, 0, Math.PI * 2);
    ctx.fill();
    for (const snake of state.snakes) {
      const isPlayer = snake === state.player;
      ctx.fillStyle = isPlayer ? '#ffffff' : snake.species.ui;
      ctx.beginPath();
      ctx.arc(cx + snake.pos.x * scale, cy + snake.pos.y * scale, isPlayer ? 3.5 : 2 + snake.r * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function show(state, w = width, h = height) {
    if (typeof drawingContext === 'undefined') return false;
    const ctx = drawingContext;
    const { x, y, zoom } = state.camera;
    const view = { left: x - w / 2 / zoom, right: x + w / 2 / zoom, top: y - h / 2 / zoom, bottom: y + h / 2 / zoom };
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);
    Meadow.draw(ctx, view, RADIUS);
    for (const food of state.foods) {
      if (visible(food.pos, 30, view)) food.show(ctx, state.frame, PreySprites.get(food.kind));
    }
    // Les plus petits d'abord ; le joueur par-dessus.
    const order = [...state.snakes].sort((a, b) => (a === state.player) - (b === state.player) || a.mass - b.mass);
    for (const snake of order) {
      if (visible(snake.pos, snake.bodyLength() + 60, view)) snake.show(ctx);
    }
    Meadow.clouds(ctx, view, state.frame);
    if (DebugMode.enabled) {
      for (const snake of state.snakes) if (visible(snake.pos, snake.perception ?? 200, view)) snake.showDebug(ctx);
    } else {
      drawNames(ctx, state, view);
    }
    ctx.restore();
    // Lumière chaude au centre, bords plus sombres.
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(255, 236, 180, 0.06)');
    v.addColorStop(1, 'rgba(8, 14, 4, 0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    drawMinimap(ctx, state, w, h);
    return true;
  }

  return { RADIUS, FOOD_TARGET, MAX_FOOD, PLAYER_RESPAWN, SAFE_DISTANCE, SETTINGS, FEED_FRAMES,
    initialParams, formatParam, applyParams, setParam, bindParamSlider, normalizeProfile,
    create, step, setInput, resizeBots, kill, eat, collisions, respawn, recentFeed, leaderboard, rank, summary, hud,
    show, bots };
})();
