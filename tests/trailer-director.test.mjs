import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.mjs';

const FILES = ['trailer/easing.js', 'trailer/actorSnake.js', 'trailer/director.js', 'trailer/eventDetector.js'];
const steps = (Director, run, n) => { for (let i = 0; i < n; i++) Director.step(run); };
const fingerprint = run => run.state.snakes.map(s => [s.name, s.pos.x.toFixed(6), s.pos.y.toFixed(6), s.mass.toFixed(4)].join(':')).join('|')
  + `#${run.state.foods.length}`;

test('prise à graine : même graine = même partie image par image ; autre graine = autre partie', () => {
  const { Director } = load(800, 600, FILES);
  const a = Director.newRun({ seed: 7, bots: 8 });
  const b = Director.newRun({ seed: 7, bots: 8 });
  steps(Director, a, 400);
  steps(Director, b, 400);
  assert.equal(fingerprint(a), fingerprint(b));
  const c = Director.newRun({ seed: 8, bots: 8 });
  steps(Director, c, 400);
  assert.notEqual(fingerprint(a), fingerprint(c));
  assert.throws(() => Director.newRun({ scenario: 'boum' }), { name: 'RangeError' });
});

test('acteur : étend Vehicle, script = seek limité à maxForce, puis l\'IA reprend après frames', () => {
  const { Director, ActorSnake, Vehicle } = load(800, 600, FILES);
  assert.ok(ActorSnake.prototype instanceof Vehicle);
  const run = Director.newRun({ seed: 3, bots: 0 });
  const actor = Director.spawnActor(run, 'x', { x: 0, y: 300, angle: 0, mass: 60, script: { kind: 'heading', angle: Math.PI / 2, frames: 3 } });
  const world = { snakes: run.state.snakes, foods: run.state.foods, arenaRadius: 1500, rng: run.rng };
  actor.applyBehaviors(world);
  assert.equal(actor.mode, 'script');
  assert.ok(actor.steering.mag() <= actor.maxForce + 1e-9);
  assert.ok(actor.steering.y > 0, 'tourne vers la direction du script');
  for (let i = 0; i < 4; i++) actor.applyBehaviors(world);
  assert.equal(actor.script, null);
  assert.notEqual(actor.mode, 'script');
  // Orbite : le point visé est sur le cercle, un peu en avant.
  actor.script = { kind: 'orbit', center: { x: 0, y: 0 }, radius: 200, dir: 1 };
  actor.pos.set(200, 0);
  const p = actor.scriptPoint();
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - 200) < 1e-9 && p.y > 0);
  actor.script = { kind: 'seek', target: () => ({ x: 5, y: 6 }) };
  assert.deepEqual({ ...actor.scriptPoint() }, { x: 5, y: 6 });
});

test('scène encerclement : anneau du géant autour de la proie, détecté, géant intouchable', () => {
  const { Director, EventDetector } = load(800, 600, FILES);
  const run = Director.newRun({ seed: 2, scenario: 'encircle', bots: 2 });
  const { hunter, prey } = run.actors;
  assert.ok(hunter && prey && hunter.invulnerable && !prey.invulnerable);
  assert.ok(Math.hypot(run.state.player.pos.x - run.focus.x, run.state.player.pos.y - run.focus.y) > 900, 'joueur écarté');
  const det = EventDetector.create();
  let seen = false;
  for (let i = 0; i < 200 && !seen; i++) {
    const before = EventDetector.snapshot(run.state);
    Director.step(run);
    seen = EventDetector.detect(det, run.state, before).some(e => e.type === 'encircle' && e.actors[0] === hunter && e.actors[1] === prey);
  }
  assert.ok(seen, 'encerclement détecté');
  // Le géant reste sur son orbite.
  const d = Math.hypot(hunter.pos.x - run.focus.x, hunter.pos.y - run.focus.y);
  assert.ok(Math.abs(d - run.ring) < run.ring * 0.25, `rayon ${d} / ${run.ring}`);
});

test('scène frôlement : les deux têtes se croisent sans mourir, frôlement détecté', () => {
  const { Director, EventDetector } = load(800, 600, FILES);
  const run = Director.newRun({ seed: 4, scenario: 'nearMiss', bots: 0 });
  const { a, b } = run.actors;
  const det = EventDetector.create();
  let near = 0;
  for (let i = 0; i < 220; i++) {
    const before = EventDetector.snapshot(run.state);
    Director.step(run);
    near += EventDetector.detect(det, run.state, before).filter(e => e.type === 'nearMiss').length;
  }
  assert.ok(run.state.snakes.includes(a) && run.state.snakes.includes(b), 'personne ne meurt');
  assert.ok(a.pos.x > b.pos.x, 'ils se sont croisés');
  assert.ok(near >= 1);
});

test('scène élimination : la victime fonce dans le corps et explose en orbes ; kill détecté', () => {
  const { Director, EventDetector } = load(800, 600, FILES);
  const run = Director.newRun({ seed: 5, scenario: 'killBurst', bots: 0, food: 0 });
  const { victim, killer } = run.actors;
  const det = EventDetector.create();
  let kill = null;
  for (let i = 0; i < 600 && !kill; i++) {
    const before = EventDetector.snapshot(run.state);
    Director.step(run);
    kill = EventDetector.detect(det, run.state, before).find(e => e.type === 'kill');
  }
  assert.ok(kill, 'élimination');
  assert.equal(kill.victim, victim);
  assert.equal(kill.killer, killer.name);
  assert.ok(run.state.foods.length > 50, `orbes : ${run.state.foods.length}`);
  assert.equal(Director.resolve(run, 'victim'), victim, 'rôle encore résolu après la mort');
});

test('scène croissance et arène bondée', () => {
  const { Director, arena } = load(800, 600, FILES);
  const run = Director.newRun({ seed: 6, scenario: 'growth', bots: 0 });
  const grower = run.actors.grower;
  const start = grower.mass;
  steps(Director, run, 900);
  assert.ok(grower.mass > start + 150, `${start} -> ${grower.mass}`);
  const crowd = Director.newRun({ seed: 6, scenario: 'crowded' });
  assert.equal(arena.bots(crowd.state).length, 30);
  const near = arena.bots(crowd.state).filter(b => Math.hypot(b.pos.x - crowd.focus.x, b.pos.y - crowd.focus.y) < 700);
  assert.equal(near.length, 30);
  assert.ok(crowd.state.foods.length >= 900);
});

test('joueur : invincible (même hors de l\'arène), piloté par l\'IA avec son corps, jamais compté comme bot', () => {
  const { Director, ActorSnake, PlayerSnake, arena } = load(800, 600, FILES);
  const run = Director.newRun({ seed: 9, bots: 3, invincible: true, autopilot: true, playerMass: 200 });
  const player = run.state.player;
  assert.ok(player instanceof ActorSnake && player.invulnerable);
  assert.equal(arena.bots(run.state).length, 3);
  assert.ok(!arena.bots(run.state).includes(player));
  const body = player.body;
  Director.setFlags(run, { autopilot: false });
  assert.ok(run.state.player instanceof PlayerSnake);
  assert.equal(run.state.player.body, body, 'même corps');
  assert.equal(Math.round(run.state.player.mass), 200);
  run.state.player.pos.set(arena.RADIUS + 50, 0);
  arena.collisions(run.state, run.rng);
  assert.ok(run.state.player, 'invincible');
  Director.setFlags(run, { invincible: false });
  arena.collisions(run.state, run.rng);
  assert.equal(run.state.player, null);
});

test('réglages de plateau : bots (acteurs gardés), proies, longueur et espèce', () => {
  const { Director, arena } = load(800, 600, FILES);
  const run = Director.newRun({ seed: 1, scenario: 'nearMiss', bots: 6 });
  Director.setBots(run, 2);
  const left = arena.bots(run.state);
  assert.equal(left.length, 2);
  assert.ok(left.includes(run.actors.a) && left.includes(run.actors.b));
  Director.setBots(run, 9);
  assert.equal(arena.bots(run.state).length, 9);
  Director.setFood(run, 10);
  assert.equal(run.state.foods.length, 10);
  Director.setLength(run.actors.a, 500);
  assert.equal(run.actors.a.mass, 500);
  Director.setSpecies(run.actors.a, 'boa');
  assert.equal(run.actors.a.species.id, 'boa');
  assert.equal(Director.resolve(run, 'leader'), run.actors.a);
  assert.equal(Director.resolve(run, 'player'), run.state.player);
});
