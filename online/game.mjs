// Partie en ligne de Snake.io, simulée sur le PC hôte. Gestion de scène seulement : les serpents
// (NetPlayerSnake, SnakeBot) et les proies (Food) sont les classes du jeu, chargées telles quelles
// (sous-classes de Vehicle) ; ils calculent et appliquent leurs forces eux-mêmes.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

// Adaptateur vectoriel (sous-ensemble de p5.Vector utilisé par vehicle.js et les serpents).
export class Vector {
  constructor(x = 0, y = 0) { this.set(x, y); }
  set(x, y) {
    if (typeof x === 'object') return this.set(x.x, x.y);
    this.x = x; this.y = y; return this;
  }
  copy() { return new Vector(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
}

const SHARED = ['vehicle.js', 'wander.js', 'snakeSpecies.js', 'bodySegment.js', 'snake.js', 'snakeBot.js',
  'food.js', 'netPlayerSnake.js'];

// Charge les classes du jeu dans un contexte isolé (pas de p5 ni de DOM côté serveur).
export function loadClasses() {
  const context = vm.createContext({ createVector: (x, y) => new Vector(x, y), p5: { Vector }, width: 0, height: 0 });
  for (const file of SHARED) {
    vm.runInContext(readFileSync(new URL(`./shared/${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return vm.runInContext('({ Vehicle, Snake, SnakeBot, Food, SnakeSpecies, NetPlayerSnake })', context);
}

export const RULES = {
  radius: 1500,
  bots: 4,
  maxPlayers: 8,
  foodTarget: 450,
  maxFood: 900,
  foodPerFrame: 4,
  respawnFrames: 180,
  safeDistance: 300,
  // Rayon (px) autour du joueur dans lequel on lui envoie serpents et proies.
  viewRadius: 1700,
};

export class OnlineGame {
  constructor({ classes = loadClasses(), rng = Math.random, rules = {} } = {}) {
    this.c = classes;
    this.rng = rng;
    this.rules = { ...RULES, ...rules };
    this.players = new Map();
    this.snakes = [];
    this.foods = [];
    this.frame = 0;
    this.nextBot = 0;
    // Identifiant réseau de chaque serpent (le navigateur suit un serpent d'un instantané à l'autre).
    this.netIds = 0;
    this.resizeBots();
    while (this.foods.length < this.rules.foodTarget) this.foods.push(this.randomFood());
  }

  randomPoint(radius) {
    const a = this.rng() * Math.PI * 2;
    const d = Math.sqrt(this.rng()) * radius;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  }

  randomFood() {
    const p = this.randomPoint(this.rules.radius - 40);
    const value = this.rng() < 0.06 ? 5 : 1 + Math.floor(this.rng() * 3);
    return new this.c.Food(p.x, p.y, value);
  }

  // Point loin des autres têtes (le meilleur de 20 essais).
  safeSpawn() {
    let best = null;
    let bestGap = -1;
    for (let i = 0; i < 20; i++) {
      const p = this.randomPoint(this.rules.radius * 0.75);
      const gap = Math.min(Infinity, ...this.snakes.map(s => Math.hypot(s.pos.x - p.x, s.pos.y - p.y)));
      if (gap > this.rules.safeDistance) return p;
      if (gap > bestGap) { best = p; bestGap = gap; }
    }
    return best;
  }

  aim(snake) {
    const a = this.rng() * Math.PI * 2;
    snake.vel.set(Math.cos(a) * snake.baseSpeed, Math.sin(a) * snake.baseSpeed);
    snake.resetBody();
    snake.netId = ++this.netIds;
    return snake;
  }

  bots() {
    return this.snakes.filter(s => s instanceof this.c.SnakeBot);
  }

  makeBot() {
    const i = this.nextBot++;
    const p = this.safeSpawn();
    const { LIST, NAMES } = this.c.SnakeSpecies;
    const bot = new this.c.SnakeBot(p.x, p.y, LIST[i % LIST.length], NAMES[i % NAMES.length]);
    bot.grow(this.rng() * 80);
    return this.aim(bot);
  }

  resizeBots(count = this.rules.bots) {
    let list = this.bots();
    while (list.length > count) {
      const last = list.pop();
      this.snakes.splice(this.snakes.indexOf(last), 1);
    }
    while (list.length < count) {
      const bot = this.makeBot();
      this.snakes.push(bot);
      list.push(bot);
    }
  }

  // ---------- Joueurs ----------
  join(name = '') {
    if (this.players.size >= this.rules.maxPlayers) return null;
    const id = randomUUID();
    const clean = String(name).replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || `Joueur ${this.players.size + 1}`;
    const player = { id, name: clean, snake: null, respawnIn: 0, kills: 0, deaths: 0, best: 0, death: null };
    this.players.set(id, player);
    this.spawnPlayer(player);
    return player;
  }

  spawnPlayer(player) {
    const p = this.safeSpawn();
    const species = this.c.SnakeSpecies.random(this.rng);
    const snake = this.aim(new this.c.NetPlayerSnake(p.x, p.y, species, player.name, player.id));
    player.snake = snake;
    player.death = null;
    this.snakes.push(snake);
    return snake;
  }

  leave(id) {
    const player = this.players.get(id);
    if (!player) return false;
    if (player.snake) this.snakes.splice(this.snakes.indexOf(player.snake), 1);
    this.players.delete(id);
    return true;
  }

  // Entrée d'un joueur : point visé (coordonnées du monde) et accélération.
  setInput(id, input) {
    const player = this.players.get(id);
    if (!player?.snake) return false;
    const x = Number(input?.x);
    const y = Number(input?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    player.snake.input = { x, y, boost: Boolean(input.boost) };
    return true;
  }

  playerOf(snake) {
    return snake instanceof this.c.NetPlayerSnake ? this.players.get(snake.playerId) : null;
  }

  // ---------- Règles ----------
  kill(snake, killer) {
    snake.alive = false;
    for (const r of snake.remains()) {
      const a = this.rng() * Math.PI * 2;
      this.foods.push(new this.c.Food(r.x, r.y, r.value, Math.cos(a) * 1.5, Math.sin(a) * 1.5));
    }
    this.snakes.splice(this.snakes.indexOf(snake), 1);
    if (killer) {
      killer.kills++;
      const killerPlayer = this.playerOf(killer);
      if (killerPlayer) killerPlayer.kills++;
    }
    const player = this.playerOf(snake);
    if (player) {
      player.snake = null;
      player.deaths++;
      player.respawnIn = this.rules.respawnFrames;
      player.death = { by: killer ? killer.name : null, length: Math.round(snake.mass), x: snake.pos.x, y: snake.pos.y };
    }
  }

  eat() {
    let kept = 0;
    for (const food of this.foods) {
      const eater = this.snakes.find(s => Math.hypot(s.pos.x - food.pos.x, s.pos.y - food.pos.y) < s.r + food.r * 0.5);
      if (eater) {
        eater.grow(food.value);
        continue;
      }
      this.foods[kept++] = food;
    }
    this.foods.length = kept;
  }

  collisions() {
    const dead = [];
    for (const snake of this.snakes) {
      if (Math.hypot(snake.pos.x, snake.pos.y) > this.rules.radius - snake.r * 0.5) {
        dead.push([snake, null]);
        continue;
      }
      const killer = this.snakes.find(o => o !== snake && o.touchesBody(snake.pos, snake.r));
      if (killer) dead.push([snake, killer]);
    }
    for (const [snake, killer] of dead) if (snake.alive !== false) this.kill(snake, killer);
  }

  step() {
    this.frame++;
    const world = { snakes: this.snakes, foods: this.foods, arenaRadius: this.rules.radius, rng: this.rng };
    for (const snake of this.snakes) {
      snake.applyBehaviors(world);
      snake.update();
      for (const d of snake.takeDrops()) this.foods.push(new this.c.Food(d.x, d.y, d.value));
    }
    for (const food of this.foods) {
      food.applyBehaviors(this.snakes, this.rules.radius, this.rng);
      food.update();
    }
    this.eat();
    this.collisions();
    for (const player of this.players.values()) {
      if (player.snake) player.best = Math.max(player.best, Math.round(player.snake.mass));
      else if (--player.respawnIn <= 0) this.spawnPlayer(player);
    }
    if (this.bots().length < this.rules.bots) this.snakes.push(this.makeBot());
    for (let i = 0; i < this.rules.foodPerFrame && this.foods.length < this.rules.foodTarget; i++) this.foods.push(this.randomFood());
    if (this.foods.length > this.rules.maxFood) this.foods.splice(0, this.foods.length - this.rules.maxFood);
  }

  ranking() {
    return [...this.snakes].sort((a, b) => b.mass - a.mass);
  }

  // ---------- Ce qu'un joueur reçoit ----------
  // Serpents et proies autour du joueur (corps : un segment sur deux, coordonnées entières),
  // classement et état du joueur. Format compact pour le réseau.
  snapshot(id) {
    const player = this.players.get(id);
    if (!player) return null;
    const center = player.snake ? player.snake.pos : (player.death ?? { x: 0, y: 0 });
    const view = this.rules.viewRadius;
    const ranking = this.ranking();
    const snakes = [];
    for (const s of this.snakes) {
      if (Math.hypot(s.pos.x - center.x, s.pos.y - center.y) > view + s.bodyLength()) continue;
      const body = [];
      for (let i = 1; i < s.body.length; i += 2) body.push(Math.round(s.body[i].x), Math.round(s.body[i].y));
      const owner = this.playerOf(s);
      snakes.push({
        k: s.netId,
        n: s.name, s: s.species.id, x: Math.round(s.pos.x * 10) / 10, y: Math.round(s.pos.y * 10) / 10,
        a: Math.round(s.vel.heading() * 1000) / 1000, r: Math.round(s.r * 100) / 100, sp: Math.round(s.spacing * 100) / 100,
        m: Math.round(s.mass), b: s.boosting ? 1 : 0, h: owner ? 1 : 0, me: s === player.snake ? 1 : 0,
        md: s.mode ?? '', lx: s.lookAt ? Math.round(s.lookAt.x) : null, ly: s.lookAt ? Math.round(s.lookAt.y) : null,
        body,
      });
    }
    const foods = [];
    const kinds = ['cricket', 'egg', 'frog', 'mouse'];
    for (const f of this.foods) {
      if (Math.hypot(f.pos.x - center.x, f.pos.y - center.y) > view) continue;
      foods.push(Math.round(f.pos.x), Math.round(f.pos.y), kinds.indexOf(f.kind), Math.round(f.angle * 100) / 100);
    }
    const rank = player.snake ? ranking.indexOf(player.snake) + 1 : null;
    return {
      t: this.frame, radius: this.rules.radius,
      me: {
        alive: Boolean(player.snake), name: player.name, mass: player.snake ? Math.round(player.snake.mass) : 0,
        species: player.snake ? player.snake.species.name : '', rank, total: this.snakes.length, kills: player.kills,
        best: player.best, respawnIn: player.respawnIn, death: player.death,
      },
      board: ranking.slice(0, 5).map(s => ({ n: s.name, m: Math.round(s.mass), c: s.species.ui, me: s === player.snake ? 1 : 0, h: this.playerOf(s) ? 1 : 0 })),
      minimap: this.snakes.map(s => [Math.round(s.pos.x), Math.round(s.pos.y), s.species.ui, s === player.snake ? 1 : (this.playerOf(s) ? 2 : 0)]),
      players: this.players.size,
      snakes, foods,
    };
  }
}
