import test from 'node:test';
import assert from 'node:assert/strict';
import { load, Vector } from './harness.mjs';

const FILES = ['trailer/easing.js', 'trailer/cameras.js'];
const DT = 1 / 60;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const snake = (x, y, vx = 0, vy = 0) => ({ pos: new Vector(x, y), vel: new Vector(vx, vy) });

test('easing : bornes, symétrie, courbe inconnue, angle le plus court, amortissement', () => {
  const { Easing } = load(800, 600, FILES);
  for (const name of Easing.NAMES) {
    assert.ok(close(Easing.apply(name, 0), 0) && close(Easing.apply(name, 1), 1), name);
    assert.ok(close(Easing.apply(name, -3), 0) && close(Easing.apply(name, 7), 1), `${name} borné`);
  }
  assert.ok(close(Easing.apply('inOutCubic', 0.5), 0.5));
  assert.equal(Easing.apply('nope', 0.25), Easing.apply('inOutCubic', 0.25));
  assert.ok(close(Easing.lerpAngle(3, -3, 0.5), Math.PI, 0.02), 'passe par π, pas par 0');
  assert.equal(Easing.damp(0, DT), 1);
  assert.ok(Easing.damp(0.5, DT) > 0 && Easing.damp(0.5, DT) < Easing.damp(0.1, DT));
  // Indépendant de la cadence : deux demi-pas = un pas.
  const half = Easing.damp(0.3, DT / 2);
  assert.ok(close(1 - (1 - half) ** 2, Easing.damp(0.3, DT)));
});

test('caméra libre : déplacement en pixels d\'écran, zoom sous le curseur, arrivée amortie', () => {
  const { CameraRig } = load(800, 600, FILES);
  const rig = CameraRig.create({ x: 100, y: 50, zoom: 2 });
  CameraRig.setMode(rig, 'free');
  CameraRig.pan(rig, 200, 0);
  assert.ok(close(rig.free.x, 0) && close(rig.free.y, 50), '200 px à l\'écran = 100 px au zoom 2');
  const under = CameraRig.toWorld(rig.free, 700, 100, 800, 600);
  CameraRig.zoomAt(rig, 0.5, 700, 100, 800, 600);
  const after = CameraRig.toWorld(rig.free, 700, 100, 800, 600);
  assert.ok(close(under.x, after.x) && close(under.y, after.y), 'le point sous le curseur ne bouge pas');
  CameraRig.zoomAt(rig, 1e-6, 0, 0, 800, 600);
  assert.equal(rig.free.zoom, CameraRig.ZOOM.min);
  const gap = Math.abs(100 - rig.free.x);
  CameraRig.update(rig, DT);
  const left = Math.abs(rig.cam.x - rig.free.x);
  assert.ok(left > 0 && left < gap, 'amorti : en route, pas encore arrivée');
  for (let i = 0; i < 600; i++) CameraRig.update(rig, DT);
  assert.ok(close(rig.cam.x, rig.free.x, 1e-3) && close(rig.cam.zoom, rig.free.zoom, 1e-4));
  // Rotation : toWorld est l'inverse du dessin (le centre de l'écran reste le centre de la vue).
  rig.free.rotation = Math.PI / 2;
  const c = CameraRig.toWorld(rig.free, 400, 300, 800, 600);
  assert.ok(close(c.x, rig.free.x) && close(c.y, rig.free.y));
  assert.throws(() => CameraRig.setMode(rig, 'drone'), { name: 'RangeError' });
});

test('caméra de suivi : anticipation, décalage, cible disparue gardée, mode jeu', () => {
  const { CameraRig } = load(800, 600, FILES);
  const rig = CameraRig.create();
  const target = snake(500, 0, 3, 0);
  const state = { snakes: [target], camera: { x: 7, y: 8, zoom: 0.9 } };
  CameraRig.follow(rig, target, { zoom: 1.5, lookAhead: 20, offset: { x: 0, y: -40 }, smoothing: 0.1 });
  for (let i = 0; i < 300; i++) CameraRig.update(rig, DT, state);
  assert.ok(close(rig.cam.x, 560, 1e-3) && close(rig.cam.y, -40, 1e-3) && close(rig.cam.zoom, 1.5, 1e-4));
  // La cible meurt : la caméra reste sur sa dernière position.
  state.snakes = [];
  target.pos.set(9999, 9999);
  for (let i = 0; i < 60; i++) CameraRig.update(rig, DT, state);
  assert.ok(close(rig.cam.x, 560, 1e-3));
  CameraRig.setMode(rig, 'game');
  CameraRig.update(rig, DT, state);
  assert.deepEqual([rig.cam.x, rig.cam.y, rig.cam.zoom], [7, 8, 0.9]);
});

test('transition (cutTo) : part de la vue actuelle, arrive sur la nouvelle cible à la fin, courbe douce', () => {
  const { CameraRig } = load(800, 600, FILES);
  const rig = CameraRig.create({ x: 0, y: 0, zoom: 1 });
  const hunter = snake(0, 0);
  const prey = snake(1000, 0);
  const state = { snakes: [hunter, prey] };
  CameraRig.follow(rig, hunter, { lookAhead: 0 });
  CameraRig.cutTo(rig, prey, 1, 'inOutCubic', { lookAhead: 0, zoom: 2 });
  CameraRig.update(rig, DT, state);
  assert.ok(rig.cam.x > 0 && rig.cam.x < 5, 'démarrage lent');
  for (let i = 0; i < 29; i++) CameraRig.update(rig, DT, state);
  assert.ok(close(rig.cam.x, 500, 1), `mi-parcours ${rig.cam.x}`);
  for (let i = 0; i < 30; i++) CameraRig.update(rig, DT, state);
  assert.ok(close(rig.cam.x, 1000, 1e-6) && close(rig.cam.zoom, 2, 1e-9));
  assert.equal(rig.transition, null);
});

test('images-clés : points fixes et serpents, courbes, zoom logarithmique, fin tenue', () => {
  const { CameraRig } = load(800, 600, FILES);
  const hero = snake(300, 300);
  const keys = [
    { t: 0, target: 'hero', zoom: 2 },
    { t: 4, x: 0, y: 0, zoom: 0.125, rotation: 0.4, ease: 'linear' },
  ];
  const resolve = name => (name === 'hero' ? hero : null);
  const start = CameraRig.evaluateKeys(keys, 0, resolve);
  assert.deepEqual([start.x, start.y, start.zoom], [300, 300, 2]);
  const mid = CameraRig.evaluateKeys(keys, 2, resolve);
  assert.ok(close(mid.x, 150) && close(mid.zoom, 0.5), 'zoom géométrique : 2 -> 0,5 -> 0,125');
  assert.ok(close(mid.rotation, 0.2));
  const end = CameraRig.evaluateKeys(keys, 99, resolve);
  assert.deepEqual([end.x, end.y, end.zoom, end.rotation], [0, 0, 0.125, 0.4]);
  // La première image-clé suit le serpent s'il bouge.
  hero.pos.set(1000, 0);
  assert.equal(CameraRig.evaluateKeys(keys, 0, resolve).x, 1000);
  const rig = CameraRig.create();
  CameraRig.playKeyframes(rig, [...keys].reverse(), resolve);
  assert.equal(rig.keys[0].t, 0, 'triées');
  assert.equal(CameraRig.keysDuration(rig), 4);
  for (let i = 0; i < 120; i++) CameraRig.update(rig, DT);
  assert.ok(close(rig.cam.zoom, 0.5, 1e-6));
  assert.throws(() => CameraRig.playKeyframes(rig, []), { name: 'RangeError' });
});
