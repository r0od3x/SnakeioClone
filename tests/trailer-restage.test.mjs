import test from 'node:test';
import assert from 'node:assert/strict';
import { load, TRAILER } from './harness.mjs';

const game = () => load(1920, 1080, TRAILER);
const plain = value => JSON.parse(JSON.stringify(value));

// Élimination attendue d'une scène : pas de jeu, victime et tueur (par leur nom).
function killOf(g, setup, key) {
  const found = g.KeyMoment.find({ ...g.KeyMoment.STUDIO_FLAGS, ...setup }, key, 60 * 20);
  return found && { step: found.step, feed: found.run.state.feed.at(-1), run: found.run };
}

test('acteur : scripts enchaînés (then), puis l\'IA ; orbite qui se resserre jusqu\'à minRadius', () => {
  const g = game();
  const run = g.Director.newRun({ scenario: 'open', bots: 0, seed: 1 });
  const actor = g.Director.spawnActor(run, 'x', { x: 0, y: 0, mass: 40,
    script: { kind: 'heading', angle: 0, frames: 2, then: { kind: 'heading', angle: Math.PI / 2, frames: 1 } } });
  const world = { snakes: run.state.snakes, foods: [], arenaRadius: 3000, rng: () => 0.5 };
  actor.steer(world); actor.steer(world);
  assert.equal(actor.script.angle, 0);
  actor.steer(world);
  assert.equal(actor.script.angle, Math.PI / 2, 'script suivant');
  actor.steer(world); actor.steer(world);
  assert.equal(actor.script, null, 'puis l\'IA reprend');
  const orbit = g.Director.spawnActor(run, 'o', { x: 100, y: 0, mass: 40, script: { kind: 'orbit', center: { x: 0, y: 0 }, radius: 100, shrink: 30, minRadius: 45 } });
  orbit.steer(world);
  assert.equal(orbit.script.radius, 70);
  orbit.steer(world); orbit.steer(world);
  assert.equal(orbit.script.radius, 45, 'borné par minRadius');
});

test('moment clé : killer filtre le tueur, role la victime seulement', () => {
  const g = game();
  const run = g.Director.newRun({ scenario: 'cutOff', bots: 0, seed: 1 });
  const victim = run.actors.victim;
  const killer = run.actors.killer;
  const kill = (v, k) => ({ type: 'kill', victim: v, killer: k?.name ?? null });
  assert.equal(g.KeyMoment.matches(run, kill(victim, killer), { event: 'kill', role: 'victim', killer: 'killer' }), true);
  assert.equal(g.KeyMoment.matches(run, kill(victim, null), { event: 'kill', role: 'victim', killer: 'killer' }), false, 'mort contre le bord');
  assert.equal(g.KeyMoment.matches(run, kill(killer, victim), { event: 'kill', role: 'victim' }), false, 'la victime tueuse ne compte pas');
});

test('scène coupe la route : le cobra se rabat, le crotale meurt sur son corps, au même pas pour toute graine', () => {
  const g = game();
  const key = { event: 'kill', role: 'victim', killer: 'killer' };
  const steps = [1, 2, 3].map(seed => killOf(g, { scenario: 'cutOff', bots: 6, seed }, key));
  assert.ok(steps.every(k => k && k.step === steps[0].step), plain(steps.map(k => k?.step)).join());
  assert.ok(steps[0].step > 150 && steps[0].step < 300, 'assez de course avant le coup');
  assert.deepEqual([steps[0].feed.victim, steps[0].feed.killer], ['Fonceur', 'Muraille']);
  const scav = Object.keys(steps[0].run.actors).filter(r => r.startsWith('scavenger'));
  assert.equal(scav.length, 5, 'charognards autour de la scène');
});

test('scène le petit contre le géant : le géant meurt sur le corps du petit et lâche un champ de proies', () => {
  const g = game();
  const k = killOf(g, { scenario: 'underdog', bots: 6, seed: 3 }, { event: 'kill', role: 'giant', killer: 'small' });
  assert.ok(k && k.step > 120, 'le géant charge plus de 2 s');
  assert.deepEqual([k.feed.victim, k.feed.killer], ['Goliath', 'Fronde']);
  const near = k.run.state.foods.filter(f => Math.hypot(f.pos.x - 420, f.pos.y + 220) < 1500);
  assert.ok(near.length > 80, `${near.length} proies autour du lieu de l'impact`);
  const scav = Object.keys(k.run.actors).filter(r => r.startsWith('scavenger')).map(r => k.run.actors[r]);
  assert.ok(scav.every(s => s.pos.x > 0), 'charognards du côté libre, pas sur le corps du géant');
});

test('scène piège : anneau fermé qui se resserre jusqu\'à l\'élimination de la proie', () => {
  const g = game();
  const setup = { scenario: 'encircle', bots: 3, seed: 3, release: 150, tighten: 0.45, minRadius: 15, ring: 1 };
  const run = g.Director.newRun({ ...g.KeyMoment.STUDIO_FLAGS, ...setup });
  const start = run.actors.hunter.script.radius;
  assert.ok(Math.abs(start - run.actors.hunter.bodyLength() / (Math.PI * 2)) < 1, 'ring : 1 = circonférence couverte');
  const k = killOf(g, setup, { event: 'kill', role: 'prey', killer: 'hunter' });
  assert.ok(k, 'la proie finit éliminée par le géant');
  assert.deepEqual([k.feed.victim, k.feed.killer], ['Brindille', 'Titan']);
  assert.ok(k.run.actors.hunter.script.radius < start, 'l\'anneau s\'est resserré');
});

test('caméra : cible \'key\' = lieu du moment clé, gardé par la préparation du plan', () => {
  const g = game();
  const s = g.TrailerShots.find(x => x.id === 'cut-off');
  const prepared = g.KeyMoment.prepare(s, { step: 214, event: { type: 'kill', x: 453, y: -180 } });
  assert.deepEqual(plain(prepared.keyEvent), { x: 453, y: -180 });
  assert.equal(g.KeyMoment.prepare(s, { step: 214 }).keyEvent, null, 'pas fixe : pas de lieu');
  const keys = prepared.camera.keys;
  const at = g.CameraRig.evaluateKeys(keys, keys[2].t, name => (name === 'key' ? { pos: prepared.keyEvent } : null));
  assert.deepEqual([at.x, at.y], [453, -180]);
});

test('impact : fantôme et onde de choc à la taille de la victime, orbes en temps du film, nettoyage', () => {
  const g = game();
  const fx = g.Impact.create();
  const victim = { pos: { x: 10, y: 20 }, r: 20 };
  assert.equal(g.Impact.add(fx, { type: 'nearMiss' }, 0), null, 'seulement les éliminations');
  const impact = g.Impact.add(fx, { type: 'kill', victim }, 1);
  assert.deepEqual([impact.x, impact.y, impact.radius], [10, 20, 180]);
  assert.equal(g.Impact.add(g.Impact.create(), { type: 'kill', victim: { pos: { x: 0, y: 0 }, r: 100 } }, 0).radius, 340, 'borné');
  const foods = [{ age: 0 }, { age: 25 }];
  const restore = g.Impact.popFoods(fx, foods, 1);
  assert.deepEqual(foods.map(f => f.age), [0, 25], 'vue pour la première fois : rien encore');
  restore();
  const later = g.Impact.popFoods(fx, foods, 1 + g.Impact.POP / 2);
  assert.ok(Math.abs(foods[0].age - g.Impact.FULL_AGE / 2) < 1e-9, 'mi-chemin en temps du film');
  later();
  assert.equal(foods[0].age, 0, 'âge de jeu remis');
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return { addColorStop() {} }; }), set: (t, k, v) => { t[k] = v; return true; } });
  const painted = [];
  assert.equal(g.Impact.draw(ctx, fx, { x: 0, y: 0, zoom: 1 }, 960, 540, 1.1, (c, s) => painted.push(s)), 1);
  assert.deepEqual(painted, [victim], 'fantôme de la victime');
  assert.ok(calls.includes('arc') && calls.includes('stroke'), 'anneau');
  assert.equal(g.Impact.draw(ctx, fx, { x: 0, y: 0, zoom: 1 }, 960, 540, 3), 0, 'effet terminé');
});

test('ombre des serpents : juste sous le serpent même quand la caméra est tournée', () => {
  const g = game();
  for (const rotation of [0, 0.1, -0.7, 2]) {
    const zoom = 1.6;
    const m = { a: Math.cos(rotation) * zoom, b: Math.sin(rotation) * zoom, c: -Math.sin(rotation) * zoom, d: Math.cos(rotation) * zoom, e: 400, f: 300 };
    let shift = null;
    const ctx = {
      getTransform: () => m, save() {}, restore() {}, fill() {},
      translate(x, y) { shift = { x: m.a * x + m.c * y, y: m.b * x + m.d * y }; },
    };
    g.SnakePainter.castShadow(ctx, () => {}, 10);
    // Déplacement à l'écran du dessin lointain + décalage de l'ombre = petit décalage fixe.
    const dx = shift.x + ctx.shadowOffsetX;
    const dy = shift.y + ctx.shadowOffsetY;
    assert.ok(Math.abs(dx - 10 * 0.45 * zoom) < 1e-6 && Math.abs(dy - 10 * 0.7 * zoom) < 1e-6, `rotation ${rotation} : ${dx}, ${dy}`);
  }
});
