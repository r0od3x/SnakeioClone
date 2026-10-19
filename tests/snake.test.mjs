import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRng, near, Vector } from './harness.mjs';

const W = 1200;
const H = 800;
const still = () => 0.5;
const plain = value => JSON.parse(JSON.stringify(value));
const head = (x, y, mass = 20, vx = 0, vy = 0, r = 10) => ({ pos: new Vector(x, y), vel: new Vector(vx, vy), mass, r, alive: true, body: [], bodyLength: () => 0 });

test('entités : serpents et proies étendent Vehicle ; 12 espèces aux couleurs valides', () => {
  const { Vehicle, Snake, PlayerSnake, SnakeBot, Food, SnakeSpecies } = load();
  const species = SnakeSpecies.LIST[0];
  assert.ok(new PlayerSnake(0, 0, species) instanceof Snake);
  assert.ok(new SnakeBot(0, 0, species, 'Kaa') instanceof Snake);
  assert.ok(new Snake(0, 0, species) instanceof Vehicle);
  assert.ok(new Food(0, 0, 1) instanceof Vehicle);
  assert.ok(SnakeSpecies.LIST.length >= 12);
  assert.equal(new Set(SnakeSpecies.LIST.map(sp => sp.id)).size, SnakeSpecies.LIST.length);
  const hex = /^#[0-9a-f]{6}$/i;
  for (const sp of SnakeSpecies.LIST) {
    assert.ok([sp.base, sp.head, sp.ui, sp.eye].every(c => hex.test(c)), sp.name);
    assert.ok(SnakeSpecies.KINDS.includes(sp.pattern.kind), sp.name);
    assert.ok(['slit', 'round'].includes(sp.pupil) && ['round', 'triangular', 'coffin'].includes(sp.headShape));
  }
  assert.equal(new Set(SnakeSpecies.LIST.map(sp => sp.pattern.kind)).size, SnakeSpecies.KINDS.length,
    'chaque motif est utilisé');
  assert.equal(SnakeSpecies.shade('#ff8000', 0.5), 'rgb(128, 64, 0)');
  assert.equal(SnakeSpecies.rgba('#00ff00', 0.25), 'rgba(0, 255, 0, 0.25)');
  assert.equal(SnakeSpecies.mix('#000000', '#ffffff', 0.5), 'rgb(128, 128, 128)');
  assert.equal(SnakeSpecies.byId('kingCobra').hood, true);
  assert.equal(SnakeSpecies.byId('diamondback').rattle, true);
  assert.equal(SnakeSpecies.random(() => 0.999), SnakeSpecies.LIST.at(-1));
});

test('espèces : anneaux du serpent corail dans l\'ordre rouge, jaune, noir, jaune, en boucle', () => {
  const { SnakeSpecies } = load();
  const coral = SnakeSpecies.byId('coral');
  const colors = Array.from({ length: 18 }, (_, i) => SnakeSpecies.bandColor(coral, i));
  assert.equal(colors.join(','), ['#c62828', '#c62828', '#c62828', '#c62828', '#f6cf3a', '#121212', '#121212',
    '#121212', '#f6cf3a', '#c62828', '#c62828', '#c62828', '#c62828', '#f6cf3a', '#121212', '#121212',
    '#121212', '#f6cf3a'].join(','));
});

test('dessin : corps qui s\'affine vers la queue, contour fermé, normales unitaires', () => {
  const { SnakePainter: paint, Snake, SnakeSpecies } = load();
  const n = 60;
  const r = 12;
  const widths = Array.from({ length: n }, (_, i) => paint.widthAt(i, n, r));
  assert.ok(widths[0] < r && widths[3] <= r, 'cou un peu plus fin');
  assert.ok(Math.abs(Math.max(...widths) - r) < 1e-9);
  const taper = widths.slice(Math.ceil(n * paint.TAPER_START));
  assert.ok(taper.every((w, i) => i === 0 || w <= taper[i - 1]), 'décroissant dans la queue');
  assert.ok(Math.abs(widths[n - 1] - r * paint.TAIL_WIDTH) < 1e-9);
  const s = new Snake(0, 0, SnakeSpecies.LIST[0]);
  const pts = paint.points(s);
  const nrm = paint.normals(pts);
  assert.equal(pts.length, s.body.length + 1);
  assert.ok(nrm.every(v => Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9));
  const poly = paint.outline(pts, nrm, pts.map((_, i) => paint.widthAt(i, pts.length, s.r)));
  assert.equal(poly.length, pts.length * 2 + 1, 'deux bords + pointe de la queue');
  assert.ok(poly.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(paint.hash(3) >= 0 && paint.hash(3) < 1 && paint.hash(3) === paint.hash(3));
});

test('prairie : décor fixe dans l\'arène, pierres sur tout le bord', () => {
  const { Meadow } = load();
  const deco = Meadow.decorations(1500);
  assert.equal(deco, Meadow.decorations(1500), 'tiré une seule fois');
  assert.ok(deco.length > 500);
  assert.ok(deco.every(d => Math.hypot(d.x, d.y) <= 1500 - 60 + 1e-9));
  assert.deepEqual([...new Set(deco.map(d => d.kind))].sort(), ['flowers', 'leaf', 'rock', 'tuft']);
  const ring = Meadow.stones(1500);
  assert.equal(ring.length, Math.ceil(Math.PI * 2 * 1500 / Meadow.STONE_GAP));
  assert.ok(ring.every(st => Math.abs(Math.hypot(st.x, st.y) - 1506) <= 5));
  const a = Meadow.seeded(5);
  const b = Meadow.seeded(5);
  assert.equal(a(), b());
});

test('serpent : la masse fait grossir, allonger et tourner plus large', () => {
  const { Snake, SnakeSpecies } = load();
  const s = new Snake(0, 0, SnakeSpecies.LIST[0]);
  const small = { r: s.r, segments: s.targetSegments(), force: s.maxForce };
  assert.equal(s.body.length, small.segments);
  s.grow(400);
  assert.ok(s.r > small.r && s.targetSegments() > small.segments && s.maxForce < small.force);
  assert.ok(s.targetSegments() <= Snake.MAX_SEGMENTS);
  s.update();
  assert.equal(s.body.length, s.targetSegments(), 'le corps grandit');
  // Corps initial : en ligne derrière la tête, à espacement constant.
  const t = new Snake(100, 100, SnakeSpecies.LIST[0]);
  t.vel.set(0, 2); t.resetBody();
  assert.ok(near(t.body[0].x, 100) && near(t.body[0].y, 100 - t.spacing));
});

test('serpent : le corps est une chaîne de véhicules qui suivent chacun celui de devant', () => {
  const { PlayerSnake, SnakeSpecies, BodySegment, Vehicle } = load();
  const s = new PlayerSnake(0, 0, SnakeSpecies.LIST[0]);
  s.grow(200);
  for (const boost of [false, true]) {
    const world = { input: { target: new Vector(0, 0), boost } };
    for (let f = 0; f < 300; f++) {
      world.input.target = new Vector(Math.cos(f / 20) * 300, Math.sin(f / 15) * 300);
      s.applyBehaviors(world);
      s.update();
      if (f < 120) continue; // le temps que les nouveaux segments se déroulent
      assert.equal(s.body.length, s.targetSegments());
      let prev = s.pos;
      for (const seg of s.body) {
        assert.ok(seg instanceof BodySegment && seg instanceof Vehicle);
        const gap = Math.hypot(seg.x - prev.x, seg.y - prev.y);
        assert.ok(Math.abs(gap - s.spacing) < 0.05 * s.spacing, `écart ${gap} pour ${s.spacing}`);
        assert.ok(seg.vel.mag() <= seg.maxSpeed + 1e-9);
        prev = seg;
      }
    }
  }
});

test('segment : steering arrive vers le point à spacing px derrière son meneur, borné par maxForce', () => {
  const { BodySegment } = load();
  const seg = new BodySegment(0, 0);
  // Meneur à 14 px devant, écart voulu 8 px : le point visé est à 6 px, atteint en une image.
  const force = seg.follow({ x: 14, y: 0 }, new Vector(3, 0), 8);
  assert.ok(Math.abs(force.x - 6) < 1e-9 && force.y === 0);
  seg.applyForce(force);
  seg.update();
  assert.ok(Math.abs(seg.pos.x - 6) < 1e-9, 'rejoint le point en une image');
  // Né sur son meneur : il se place derrière lui, à l'opposé de sa vitesse.
  const born = new BodySegment(50, 50);
  const f2 = born.follow({ x: 50, y: 50 }, new Vector(0, 2), 6);
  assert.ok(Math.abs(f2.x) < 1e-9 && f2.y < 0);
  assert.equal(new BodySegment(0, 0).follow({ x: 0, y: 0 }, new Vector(0, 0), 6).mag(), 0, 'meneur immobile');
  const far = new BodySegment(0, 0);
  assert.ok(far.follow({ x: 500, y: 0 }, new Vector(0, 0), 6).mag() <= far.maxForce + 1e-9);
});

test('arène : événements pour les bruitages (repas, accélération, élimination, mort, réapparition, première place, palier)', () => {
  const { arena } = load();
  const state = arena.create(arena.initialParams(), seededRng());
  arena.setParam(state.params, 'bots', 1, state, seededRng(2));
  const player = state.player;
  const bot = arena.bots(state)[0];
  state.events = { hits: 0, kills: 0, death: null, respawned: false, rank: null,
    milestone: null, eaten: 0, boosting: false };
  bot.pos.set(player.body[6].x, player.body[6].y);
  arena.collisions(state, seededRng());
  assert.equal(state.events.kills, 1);
  // Repas du joueur seulement, et accélération.
  state.foods.length = 0;
  state.foods.push(new (load().Food)(0, 0, 1));
  state.foods[0].pos.set(player.pos.x, player.pos.y);
  arena.eat(state);
  assert.equal(state.events.eaten, 1);
  state.input = { target: new Vector(player.pos.x + 500, player.pos.y), boost: true };
  arena.step(state, W, H, seededRng(8));
  assert.equal(state.events.boosting, true);
  state.input = { target: null, boost: false };
  // Palier et première place détectés pendant l'image.
  player.mass = 250; player.syncSize();
  state.lastRank = 2;
  arena.step(state, W, H, seededRng(3));
  assert.deepEqual([state.events.rank, state.events.milestone], [1, 200]);
  arena.step(state, W, H, seededRng(4));
  assert.deepEqual([state.events.rank, state.events.milestone], [null, null], 'une seule fois');
  // Mort contre le bord, puis réapparition.
  state.player.pos.set(arena.RADIUS + 50, 0);
  arena.step(state, W, H, seededRng(5));
  assert.equal(state.events.death.by, null, 'mort contre le bord');
  let respawned = false;
  for (let f = 0; f < arena.PLAYER_RESPAWN + 2 && !respawned; f++) {
    arena.step(state, W, H, seededRng(10 + f));
    respawned = state.events.respawned;
  }
  assert.ok(respawned);
});

test('serpent : il tourne sans freiner (pas de demi-tour sur place)', () => {
  const { PlayerSnake, SnakeSpecies } = load();
  const s = new PlayerSnake(0, 0, SnakeSpecies.LIST[0]);
  s.vel.set(s.baseSpeed, 0);
  const world = { input: { target: new Vector(-500, 0), boost: false } };
  let minSpeed = Infinity;
  let turned = false;
  for (let f = 0; f < 200; f++) {
    s.applyBehaviors(world);
    assert.ok(s.acc.mag() <= s.maxForce + 1e-12);
    s.update();
    minSpeed = Math.min(minSpeed, s.vel.mag());
    if (s.vel.x < 0) turned = true;
  }
  assert.ok(turned, 'demi-tour en arc, même avec la cible pile derrière');
  assert.ok(minSpeed > s.baseSpeed * 0.8, `vitesse minimale ${minSpeed}`);
});

test('joueur : seek du point visé, accélération coûteuse qui lâche des orbes, limite basse', () => {
  const { PlayerSnake, SnakeSpecies } = load();
  const s = new PlayerSnake(0, 0, SnakeSpecies.LIST[0]);
  s.vel.set(s.baseSpeed, 0);
  assert.equal(s.steer({}).mag(), 0, 'sans souris, pas de force');
  const target = new Vector(0, 300);
  const twin = new PlayerSnake(0, 0, SnakeSpecies.LIST[0]); twin.vel.set(twin.baseSpeed, 0);
  const expected = twin.seek(target);
  const force = s.steer({ input: { target } });
  assert.ok(near(force.x, expected.x) && near(force.y, expected.y));
  const world = { input: { target: new Vector(1000, 0), boost: true } };
  const mass = s.mass;
  for (let f = 0; f < 12; f++) { s.applyBehaviors(world); s.update(); }
  assert.ok(s.boosting && s.vel.mag() > s.baseSpeed);
  assert.ok(near(s.mass, mass - 12 * s.boostCost));
  assert.equal(s.takeDrops().length, 2, 'une orbe toutes les 6 images');
  assert.equal(s.takeDrops().length, 0, 'vidées à la lecture');
  s.mass = s.minBoostMass;
  s.applyBehaviors(world);
  assert.equal(s.boosting, false, 'trop petit pour accélérer');
  assert.equal(s.maxSpeed, s.baseSpeed);
});

test('bot : priorités évite > bord > fuite > chasse > mange > erre', () => {
  const { SnakeBot, Food, SnakeSpecies } = load();
  const make = () => { const b = new SnakeBot(0, 0, SnakeSpecies.LIST[1], 'Kaa'); b.vel.set(b.baseSpeed, 0); return b; };
  const food = new Food(100, 0, 2);
  // Corps juste devant, légèrement au-dessus : virage vers le bas (côté libre).
  const wall = head(40, -60, 20); wall.body = [{ x: 40, y: -5 }]; wall.bodyLength = () => 10;
  const bot = make();
  const avoid = bot.steer({ snakes: [bot, wall], foods: [food], arenaRadius: 1500, rng: still });
  assert.equal(bot.mode, 'évite');
  assert.ok(avoid.y > 0);
  // Tête vers le bord : retour au centre.
  const edgy = make(); edgy.pos.set(1450, 0);
  edgy.steer({ snakes: [edgy], foods: [], arenaRadius: 1500, rng: still });
  assert.equal(edgy.mode, 'bord');
  // Gros serpent proche : fuite (flee fourni).
  const prey = make();
  const big = head(100, 0, prey.mass * 2);
  const flee = prey.steer({ snakes: [prey, big], foods: [food], arenaRadius: 1500, rng: still });
  assert.equal(prey.mode, 'fuite');
  const twin = make();
  const expected = twin.flee(big);
  assert.ok(near(flee.x, expected.x) && near(flee.y, expected.y));
  assert.equal(prey.wantsBoost(), prey.mass > 30);
  // Petit serpent proche : on coupe sa route (point devant lui).
  const hunter = make(); hunter.mass = 100;
  const small = head(150, 100, 20, 0, -2);
  hunter.steer({ snakes: [hunter, small], foods: [food], arenaRadius: 1500, rng: still });
  assert.equal(hunter.mode, 'chasse');
  assert.deepEqual(plain(hunter.lookAt), { x: 150, y: 100 - 2 * hunter.lead });
  assert.equal(hunter.wantsBoost(), false, 'proie à plus de 160 px');
  // Orbe la plus proche, sinon errance.
  const eater = make();
  eater.steer({ snakes: [eater], foods: [new Food(250, 0, 1), food], arenaRadius: 1500, rng: still });
  assert.deepEqual([eater.mode, eater.lookAt], ['mange', food.pos]);
  const lost = make();
  const wander = lost.steer({ snakes: [lost], foods: [new Food(1000, 0, 1)], arenaRadius: 1500, rng: still });
  assert.equal(lost.mode, 'erre');
  assert.ok(Number.isFinite(wander.x));
});

test('proies : espèce selon la valeur, œuf immobile, souris qui se promène, happée par une tête', () => {
  const { Food } = load();
  assert.deepEqual([1, 2, 3, 5].map(v => Food.kindFor(v)), ['cricket', 'egg', 'frog', 'mouse']);
  const egg = new Food(100, 100, 2, 3, 0);
  egg.applyBehaviors([]);
  assert.ok(near(egg.acc.x, -egg.brakeForce), 'freinage');
  for (let i = 0; i < 100; i++) { egg.applyBehaviors([]); egg.update(); }
  assert.equal(egg.vel.mag(), 0);
  const { x, y } = egg.pos;
  const far = head(x + 10 + egg.attractRange + 1, y);
  egg.applyBehaviors([far]);
  assert.equal(egg.acc.mag(), 0, 'trop loin : pas d\'attraction');
  const close = head(x + 40, y);
  egg.applyBehaviors([far, close]);
  assert.ok(egg.acc.x > 0 && egg.acc.mag() <= egg.maxForce + 1e-12);
  // Souris : promenade lente, sans sortir de l'arène.
  const mouse = new Food(0, 0, 5);
  const rng = seededRng(4);
  let moved = 0;
  for (let i = 0; i < 600; i++) {
    const before = mouse.pos.copy();
    mouse.applyBehaviors([], 200, rng);
    mouse.update();
    moved += Math.hypot(mouse.pos.x - before.x, mouse.pos.y - before.y);
    assert.ok(mouse.vel.mag() <= mouse.walkSpeed + 1e-9);
    assert.ok(Math.hypot(mouse.pos.x, mouse.pos.y) < 200);
  }
  assert.ok(moved > 50, `distance parcourue ${moved}`);
  // Une proie happée file vers la bouche, plus vite qu'en se promenant.
  mouse.applyBehaviors([head(mouse.pos.x + 20, mouse.pos.y)], 200, rng);
  assert.equal(mouse.maxSpeed, mouse.snapSpeed);
  assert.ok(mouse.fadeIn() === 1 && new Food(0, 0, 1).fadeIn() === 0);
});

test('arène : joueur au centre, bots du slider, nourriture, caméra et visée', () => {
  const { arena, PlayerSnake, SnakeBot } = load();
  const state = arena.create(arena.initialParams(), seededRng());
  assert.ok(state.player instanceof PlayerSnake);
  assert.deepEqual([state.player.pos.x, state.player.pos.y], [0, 0]);
  assert.equal(arena.bots(state).length, 12);
  assert.ok(arena.bots(state).every(b => b instanceof SnakeBot));
  assert.equal(state.foods.length, arena.FOOD_TARGET);
  assert.ok(state.foods.every(f => Math.hypot(f.pos.x, f.pos.y) < arena.RADIUS));
  // Souris au centre de l'écran = point sous la caméra ; à droite = plus loin selon le zoom.
  state.camera = { x: 100, y: 50, zoom: 0.5 };
  arena.setInput(state, W / 2, H / 2, false, W, H);
  assert.deepEqual([state.input.target.x, state.input.target.y], [100, 50]);
  arena.setInput(state, W / 2 + 100, H / 2, true, W, H);
  assert.deepEqual([state.input.target.x, state.input.boost], [300, true]);
  // Slider « Serpents IA » : nombre de bots.
  arena.setParam(state.params, 'bots', 3, state, seededRng(5));
  assert.equal(arena.bots(state).length, 3);
  assert.equal(state.snakes.includes(state.player), true);
});

test('réglages Snake.io : bornes, appliqués tout de suite aux serpents, gardés pour la partie suivante', () => {
  const { arena, SnakeBot } = load();
  const params = arena.initialParams();
  const state = arena.create(params, seededRng());
  assert.equal(state.params, params, 'mêmes réglages que les sliders');
  const set = (name, value) => arena.setParam(state.params, name, value, state, seededRng(3));
  set('baseSpeed', 4); set('boostSpeed', 9); set('agility', 0.8);
  for (const s of state.snakes) {
    assert.deepEqual([s.baseSpeed, s.boostSpeed, s.agility, s.maxSpeed], [4, 9, 0.8, 4]);
    assert.ok(Math.abs(s.maxForce - 0.8 * Math.min(1, Math.max(0.45, 10 / s.r))) < 1e-12);
  }
  set('perception', 500);
  const bot = state.snakes.find(s => s instanceof SnakeBot);
  assert.deepEqual([bot.perception, bot.preyRange, bot.predatorRange], [500, 390, 280]);
  set('food', 100);
  assert.equal(state.foods.length, 100);
  arena.step(state, W, H, seededRng(4));
  assert.ok(state.foods.length <= 100, 'plus de réapprovisionnement au-delà du réglage');
  // Une nouvelle partie reprend les réglages.
  const next = arena.create(params, seededRng(9));
  assert.ok(next.snakes.every(s => s.baseSpeed === 4 && s.boostSpeed === 9 && s.agility === 0.8));
  assert.equal(next.foods.length, 100);
  // Sans partie, le réglage est seulement mémorisé.
  arena.setParam(params, 'bots', 2);
  assert.equal(params.bots, 2);
  for (const [name, value] of [['bots', 0], ['bots', 31], ['bots', 1.5], ['baseSpeed', 0.5], ['agility', 2],
    ['food', NaN], ['nope', 1]]) {
    assert.throws(() => arena.setParam(params, name, value), { name: 'RangeError' }, `${name} = ${value}`);
  }
  assert.equal(arena.formatParam('agility', 0.4), '0.40');
});

test('HTML : sliders de Snake.io synchronisés avec SnakeArena.SETTINGS', async () => {
  const { arena } = load();
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ids = { bots: 'snake-bots', baseSpeed: 'snake-speed', boostSpeed: 'snake-boost', agility: 'snake-agility',
    perception: 'snake-perception', food: 'snake-food' };
  assert.deepEqual(Object.keys(ids), Object.keys(arena.SETTINGS));
  for (const [name, id] of Object.entries(ids)) {
    const input = html.match(new RegExp(`<input id="${id}"[^>]*>`))[0];
    const attr = key => Number(input.match(new RegExp(`${key}="([^"]+)"`))[1]);
    const range = arena.SETTINGS[name];
    assert.deepEqual([attr('min'), attr('max'), attr('step'), attr('value')],
      [range.min, range.max, range.step, range.initial], id);
  }
});

// Faux contexte 2D : enregistre les appels de dessin et les couleurs utilisées.
function fakeContext() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(target, name) {
      if (name in target) return target[name];
      return (...args) => calls.push([name, ...args]);
    },
    set(target, name, value) {
      calls.push([`set:${String(name)}`, value]);
      return true;
    },
  });
  return { ctx, calls };
}

test('debug : point visé, mode et force mémorisés à chaque décision', () => {
  const { PlayerSnake, SnakeBot, Food, SnakeSpecies } = load();
  const player = new PlayerSnake(0, 0, SnakeSpecies.LIST[0]);
  player.applyBehaviors({ input: { target: new Vector(0, 200), boost: false } });
  assert.deepEqual([player.mode, player.target.x, player.target.y], ['joueur', 0, 200]);
  assert.ok(player.steering.mag() > 0 && player.steering.mag() <= player.maxForce + 1e-12);
  assert.deepEqual([player.acc.x, player.acc.y], [player.steering.x, player.steering.y], 'force appliquée = force mémorisée');
  const bot = new SnakeBot(0, 0, SnakeSpecies.LIST[1], 'Kaa'); bot.vel.set(bot.baseSpeed, 0);
  const food = new Food(120, 30, 2);
  bot.applyBehaviors({ snakes: [bot], foods: [food], arenaRadius: 1500, rng: still });
  assert.deepEqual([bot.mode, bot.target], ['mange', food.pos]);
  const wanderer = new SnakeBot(0, 0, SnakeSpecies.LIST[1], 'Nala'); wanderer.vel.set(wanderer.baseSpeed, 0);
  wanderer.applyBehaviors({ snakes: [wanderer], foods: [], arenaRadius: 1500, rng: still });
  assert.equal(wanderer.mode, 'erre');
  assert.equal(wanderer.target, wanderer.wanderTarget, 'point du wander');
  const edge = new SnakeBot(1450, 0, SnakeSpecies.LIST[1], 'Ruban'); edge.vel.set(edge.baseSpeed, 0);
  edge.applyBehaviors({ snakes: [edge], foods: [], arenaRadius: 1500, rng: still });
  assert.deepEqual([edge.mode, edge.target.x, edge.target.y], ['bord', 0, 0]);
});

test('debug : le bot montre perception, couloir, cible et proie ; le joueur sa visée', () => {
  const { SnakeBot, PlayerSnake, Snake, SnakeSpecies, draws } = load();
  const hunter = new SnakeBot(0, 0, SnakeSpecies.LIST[2], 'Kaa'); hunter.vel.set(hunter.baseSpeed, 0); hunter.grow(200);
  const prey = new PlayerSnake(150, 60, SnakeSpecies.LIST[0]); prey.vel.set(0, -2);
  hunter.applyBehaviors({ snakes: [hunter, prey], foods: [], arenaRadius: 1500, rng: still });
  assert.equal(hunter.mode, 'chasse');
  const { ctx, calls } = fakeContext();
  draws.length = 0;
  hunter.showDebug(ctx);
  const arcs = calls.filter(([name]) => name === 'arc');
  assert.ok(arcs.some(([, x, y, r]) => x === 0 && y === 0 && r === hunter.perception), 'cercle de perception');
  assert.ok(arcs.some(([, x, y]) => x === prey.pos.x && y === prey.pos.y), 'anneau autour de la proie');
  assert.ok(arcs.some(([, x, y]) => x === hunter.target.x && y === hunter.target.y), 'point visé');
  assert.ok(calls.some(([name, color]) => name === 'set:strokeStyle' && color === Snake.MODE_COLORS.chasse));
  const texts = calls.filter(([name]) => name === 'fillText').map(([, t]) => t);
  assert.ok(texts.some(t => t.startsWith('chasse')), texts.join(' | '));
  assert.ok(texts.some(t => t.startsWith('v ')), 'vitesse et masse');
  // Flèches dessinées avec les fonctions de vehicle.js (drawVector et drawArrow, via p5).
  assert.ok(draws.some(([name]) => name === 'line') && draws.some(([name]) => name === 'triangle'));
  // Le joueur : visée de la souris.
  const { ctx: c2, calls: calls2 } = fakeContext();
  prey.applyBehaviors({ input: { target: new Vector(400, 400) } });
  prey.showDebug(c2);
  assert.ok(calls2.some(([name, x, y]) => name === 'arc' && x === 400 && y === 400));
});

test('arène : manger fait grandir, tête contre un corps = mort, corps en orbes, élimination comptée', () => {
  const { arena, Food } = load();
  const state = arena.create(arena.initialParams(), seededRng());
  arena.setParam(state.params, 'bots', 1, state, seededRng(2));
  const player = state.player;
  const bot = arena.bots(state)[0];
  state.foods.length = 0;
  state.foods.push(new Food(player.pos.x, player.pos.y, 3));
  const mass = player.mass;
  arena.eat(state);
  assert.deepEqual([player.mass, state.foods.length], [mass + 3, 0]);
  // La tête du bot touche le corps du joueur.
  const seg = player.body[5];
  bot.pos.set(seg.x, seg.y);
  const botMass = bot.mass;
  arena.collisions(state, seededRng());
  assert.equal(state.snakes.includes(bot), false);
  assert.deepEqual([player.kills, state.stats.kills, state.events.hits], [1, 1, 1]);
  const dropped = state.foods.reduce((sum, f) => sum + f.value, 0);
  assert.ok(Math.abs(dropped - botMass * 0.8) < 1e-6, `${dropped} ≈ 80 % de ${botMass}`);
  // Le bot est remplacé à l'image suivante.
  arena.step(state, W, H, seededRng(4));
  assert.equal(arena.bots(state).length, 1);
});

test('arène : sortir de l\'arène tue ; le joueur réapparaît après un délai', () => {
  const { arena, PlayerSnake } = load();
  const state = arena.create(arena.initialParams(), seededRng());
  arena.setParam(state.params, 'bots', 2, state, seededRng(2));
  const player = state.player;
  player.pos.set(arena.RADIUS + 10, 0);
  arena.collisions(state, seededRng());
  assert.deepEqual([state.player, state.stats.deaths], [null, 1]);
  assert.match(arena.summary(state), /^Éliminé/);
  const hud = arena.hud(state);
  assert.equal(hud.dead, true);
  assert.match(hud.deathText, /bord de l'arène/);
  for (let f = 0; f < arena.PLAYER_RESPAWN - 1; f++) arena.step(state, W, H, seededRng(f + 1));
  assert.equal(state.player, null);
  arena.step(state, W, H, seededRng(999));
  assert.ok(state.player instanceof PlayerSnake && state.player !== player);
});

test('arène : classement trié, joueur repéré, caméra qui suit et recule quand on grossit', () => {
  const { arena } = load();
  const state = arena.create(arena.initialParams(), seededRng());
  arena.setParam(state.params, 'bots', 4, state, seededRng(2));
  state.player.mass = 1000; state.player.syncSize();
  const board = arena.leaderboard(state);
  assert.equal(board.length, 5);
  assert.ok(board.every((row, i) => i === 0 || board[i - 1].mass >= row.mass));
  assert.deepEqual([board[0].isPlayer, arena.rank(state)], [true, 1]);
  assert.match(arena.summary(state), /^Longueur : 1000 · Rang : 1 \/ 5/);
  state.player.pos.set(400, -200);
  const zoom = state.camera.zoom;
  for (let f = 0; f < 120; f++) arena.step(state, W, H, seededRng(f + 7));
  assert.ok(Math.hypot(state.camera.x - state.player.pos.x, state.camera.y - state.player.pos.y) < 40);
  assert.ok(state.camera.zoom < zoom, 'caméra recule');
  assert.ok(state.camera.zoom >= 0.6);
});

test('arène : partie longue, tout reste fini et borné, des éliminations ont lieu', () => {
  const { arena } = load();
  const rng = seededRng(21);
  const state = arena.create(arena.initialParams(), rng);
  let killed = 0;
  for (let f = 0; f < 2400; f++) {
    // Le joueur vise un point qui tourne lentement.
    arena.setInput(state, W / 2 + Math.cos(f / 90) * 200, H / 2 + Math.sin(f / 90) * 200, f % 300 < 30, W, H);
    const before = state.snakes.length;
    arena.step(state, W, H, rng);
    killed += Math.max(0, before - state.snakes.length);
  }
  for (const s of state.snakes) {
    assert.ok([s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.mass].every(Number.isFinite));
    assert.ok(Math.hypot(s.pos.x, s.pos.y) <= arena.RADIUS);
  }
  assert.ok(state.foods.length <= arena.MAX_FOOD);
  assert.equal(arena.bots(state).length, 12);
  assert.ok(killed > 0 || state.stats.deaths > 0, 'des serpents sont morts');
});

// Faux AudioContext : enregistre les nœuds créés et leurs réglages.
function fakeAudio() {
  const log = { contexts: 0, resumed: 0, nodes: [], context: null };
  const param = value => ({ value, events: [],
    setValueAtTime(v, t) { this.events.push(['set', v, t]); },
    exponentialRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); },
    setTargetAtTime(v, t) { this.events.push(['target', v, t]); } });
  const node = (kind, extra = {}) => {
    const n = { kind, connect() {}, start(t) { this.started = t ?? 'maintenant'; }, stop(t) { this.stopped = t; }, ...extra };
    log.nodes.push(n);
    return n;
  };
  class AudioContext {
    constructor() { log.contexts++; log.context = this; this.currentTime = 1; this.sampleRate = 1000; this.destination = {}; }
    resume() { log.resumed++; }
    createGain() { return node('gain', { gain: param(1) }); }
    createOscillator() { return node('osc', { type: 'sine', frequency: param(440) }); }
    createBiquadFilter() { return node('filter', { type: 'lowpass', frequency: param(350) }); }
    createBufferSource() { return node('noise', { buffer: null, loop: false }); }
    createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  }
  return { AudioContext, log };
}

test('bruitages : muets tant que le son est coupé, puis un bruitage par événement', () => {
  const { SnakeSounds } = load();
  const { AudioContext, log } = fakeAudio();
  const sounds = SnakeSounds.create(AudioContext, () => 0.5);
  const all = { kills: 1, death: { by: 'Kaa' }, eaten: 3, rank: 1, milestone: 200, respawned: true, boosting: false };
  assert.equal(sounds.react(all).length, 0);
  assert.equal(log.contexts, 0, 'pas de contexte audio avant activation');
  assert.equal(sounds.setEnabled(true), true);
  assert.equal(sounds.setEnabled(true), true);
  assert.deepEqual([log.contexts, log.resumed], [1, 1], 'activation une seule fois');
  assert.equal(sounds.react(all).join(','), 'death,kill,eat,firstPlace,milestone,respawn');
  assert.equal(sounds.react({ kills: 0, eaten: 0 }).length, 0, 'rien à jouer');
  // Mort : plainte descendante (fréquence qui chute).
  log.nodes.length = 0;
  sounds.play('death');
  const saw = log.nodes.find(n => n.kind === 'osc' && n.type === 'sawtooth');
  assert.ok(saw.frequency.events[0][1] > saw.frequency.events[1][1]);
  // Réapparition : trois notes montantes.
  log.nodes.length = 0;
  sounds.play('respawn');
  const notes = log.nodes.filter(n => n.kind === 'osc').map(n => n.frequency.events[0][1]);
  assert.equal(notes.join(','), SnakeSounds.RESPAWN.join(','));
  assert.equal(sounds.play('nope'), false);
});

test('bruitages : souffle continu pendant l\'accélération, coupé au relâchement et quand le son est coupé', () => {
  const { SnakeSounds } = load();
  const { AudioContext, log } = fakeAudio();
  const sounds = SnakeSounds.create(AudioContext, () => 0.5);
  assert.equal(sounds.setBoost(true), false, 'pas de contexte : rien');
  sounds.setEnabled(true);
  sounds.react({ boosting: true });
  assert.equal(sounds.boosting, true);
  const loop = log.nodes.find(n => n.kind === 'noise' && n.loop);
  assert.ok(loop && loop.started !== undefined);
  sounds.react({ boosting: true });
  assert.equal(log.nodes.filter(n => n.kind === 'noise' && n.loop).length, 1, 'un seul souffle');
  sounds.react({ boosting: false });
  assert.equal(sounds.boosting, false);
  assert.ok(loop.stopped > 1);
  sounds.react({ boosting: true });
  sounds.setEnabled(false);
  assert.equal(sounds.boosting, false, 'son coupé : souffle arrêté');
  const none = SnakeSounds.create(undefined);
  assert.deepEqual([none.supported, none.setEnabled(true), none.play('eat')], [false, false, false]);
});

test('rat : rejoint sa place (arrive), fuit la souris proche, revient ensuite', () => {
  const { Rat, Vehicle } = load();
  const rat = new Rat(0, 0, { x: 200, y: 0 });
  assert.ok(rat instanceof Vehicle);
  for (let i = 0; i < 400; i++) { rat.applyBehaviors(null); rat.update(); }
  assert.ok(Math.hypot(rat.pos.x - 200, rat.pos.y) < 2, 'arrivé à sa place');
  assert.ok(rat.vel.mag() < 0.3, 'arrêté (arrive)');
  // Souris tout près : il s'enfuit.
  rat.applyBehaviors({ x: 210, y: 0 });
  assert.equal(rat.scared, true);
  assert.ok(rat.acc.x < 0, 'loin de la souris');
  assert.ok(rat.acc.mag() <= rat.maxForce * rat.fleeWeight + 1e-12);
  rat.update();
  // Souris loin : pas de peur, il revient.
  rat.applyBehaviors({ x: 900, y: 900 });
  assert.equal(rat.scared, false);
  for (let i = 0; i < 400; i++) { rat.applyBehaviors({ x: 900, y: 900 }); rat.update(); }
  assert.ok(Math.hypot(rat.pos.x - 200, rat.pos.y) < 2);
});

test('écran Éliminé : points des lettres, rats depuis les bords, fuite et départ à la réapparition', () => {
  const { RatTitle, Rat } = load();
  // Image 20 × 10 : un rectangle opaque de 8 × 4 pixels.
  const data = new Uint8ClampedArray(20 * 10 * 4);
  for (let y = 3; y < 7; y++) for (let x = 6; x < 14; x++) data[(y * 20 + x) * 4 + 3] = 255;
  const points = RatTitle.sample({ width: 20, height: 10, data }, 2);
  assert.equal(points.length, 4 * 2);
  assert.ok(points.every(p => p.x >= 6 && p.x < 14 && p.y >= 3 && p.y < 7));
  assert.equal(RatTitle.thin(Array.from({ length: 1000 }, (_, i) => i), 100).length, 100);
  const title = RatTitle.create();
  const homes = Array.from({ length: 30 }, (_, i) => ({ x: 300 + i * 10, y: 300 }));
  RatTitle.update(title, true, null, 800, 600, seededRng(), homes);
  assert.equal(title.rats.length, 30);
  assert.ok(title.rats.every(r => r instanceof Rat));
  assert.ok(title.rats.every(r => r.pos.x <= 0 || r.pos.x >= 800 || r.pos.y <= 0 || r.pos.y >= 600), 'arrivent des bords');
  for (let i = 0; i < 400; i++) RatTitle.update(title, true, null, 800, 600);
  assert.ok(title.rats.every(r => Math.hypot(r.pos.x - r.home.x, r.pos.y - r.home.y) < 3), 'lettres formées');
  // La souris disperse ceux qui sont tout près.
  RatTitle.update(title, true, { x: 400, y: 300 }, 800, 600);
  assert.ok(title.rats.some(r => r.scared) && title.rats.some(r => !r.scared));
  // Réapparition : ils s'enfuient hors de l'écran puis disparaissent.
  for (let i = 0; i < 600 && title.rats.length; i++) RatTitle.update(title, false, { x: 400, y: 300 }, 800, 600);
  assert.equal(title.rats.length, 0);
  assert.equal(title.active, false);
});
