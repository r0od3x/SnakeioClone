import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRng } from './harness.mjs';

const FILES = ['trailer/easing.js', 'trailer/timeControl.js', 'trailer/interpolation.js'];
const DT = 1 / 60;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

function run(TimeControl, tc, frames) {
  let steps = 0;
  const alphas = [];
  for (let i = 0; i < frames; i++) {
    const r = TimeControl.advance(tc, DT);
    steps += r.steps;
    alphas.push(r.alpha);
  }
  return { steps, alphas };
}

test('temps : 1× = un pas par image, 0,25× = un pas toutes les 4 images, accéléré borné', () => {
  const { TimeControl } = load(800, 600, FILES);
  const tc = TimeControl.create();
  assert.equal(run(TimeControl, tc, 60).steps, 60);
  TimeControl.setScale(tc, 0.25);
  const slow = run(TimeControl, tc, 8);
  assert.equal(slow.steps, 2);
  assert.deepEqual(slow.alphas.map(a => Math.round(a * 100) / 100), [0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75, 0]);
  TimeControl.setScale(tc, 2);
  assert.equal(run(TimeControl, tc, 30).steps, 60);
  TimeControl.setScale(tc, 99);
  assert.equal(tc.base, TimeControl.MAX);
  assert.ok(TimeControl.advance(tc, 1).steps <= TimeControl.MAX_STEPS, 'pas de rattrapage infini');
  TimeControl.setScale(tc, 0);
  assert.equal(tc.base, TimeControl.MIN);
  TimeControl.setScale(tc, NaN);
  assert.equal(tc.base, 1);
});

test('pause et pas à pas : aucun pas, sauf ceux demandés', () => {
  const { TimeControl } = load(800, 600, FILES);
  const tc = TimeControl.create();
  TimeControl.setPaused(tc, true);
  assert.equal(run(TimeControl, tc, 30).steps, 0);
  TimeControl.stepFrame(tc);
  TimeControl.stepFrame(tc, 2);
  assert.deepEqual({ ...TimeControl.advance(tc, DT) }, { steps: 3, alpha: 1 });
  assert.equal(TimeControl.advance(tc, DT).steps, 0);
  TimeControl.setPaused(tc, false);
  TimeControl.stepFrame(tc);
  assert.equal(tc.pending, 0, 'pas à pas ignoré hors pause');
});

test('rampe : glisse vers le ralenti, le tient, revient à l\'échelle de base', () => {
  const { TimeControl } = load(800, 600, FILES);
  const tc = TimeControl.create();
  TimeControl.rampTo(tc, 0.1, { inDuration: 0.5, hold: 1, outDuration: 0.5, ease: 'linear' });
  run(TimeControl, tc, 15);
  assert.ok(close(tc.scale, 0.55, 0.02), `mi-descente ${tc.scale}`);
  run(TimeControl, tc, 45);
  assert.ok(close(tc.scale, 0.1));
  run(TimeControl, tc, 25);
  assert.ok(close(tc.scale, 0.1), 'tenu');
  run(TimeControl, tc, 36);
  assert.equal(tc.ramp, null);
  assert.ok(close(tc.scale, 1));
  // Le curseur annule la rampe.
  TimeControl.rampTo(tc, 0.2);
  TimeControl.setScale(tc, 0.5);
  assert.equal(tc.ramp, null);
});

test('courbe d\'un plan : échelle en fonction du temps, tenue après le dernier point', () => {
  const { TimeControl } = load(800, 600, FILES);
  const points = [{ t: 0, scale: 1 }, { t: 2, scale: 0.2, ease: 'linear' }, { t: 3, scale: 1 }];
  assert.equal(TimeControl.evaluateCurve(points, -1), 1);
  assert.ok(close(TimeControl.evaluateCurve(points, 1), 0.6));
  assert.equal(TimeControl.evaluateCurve(points, 9), 1);
  const tc = TimeControl.create();
  TimeControl.setCurve(tc, points);
  run(TimeControl, tc, 120);
  assert.ok(close(tc.scale, 0.2, 0.01));
  // Pendant la pause, la courbe avance quand même (le plan continue).
  TimeControl.setPaused(tc, true);
  run(TimeControl, tc, 60);
  assert.ok(close(tc.curveTime, 3, 1e-6));
});

test('interpolation : affichage entre deux pas, puis vraies positions remises', () => {
  const { arena, Interpolation } = load(800, 600, FILES);
  const state = arena.create(arena.initialParams(), seededRng());
  const prev = Interpolation.capture(state);
  arena.step(state, 800, 600, seededRng(2));
  const s = state.player;
  const now = { x: s.pos.x, y: s.pos.y, seg: s.body[3].pos.x, food: state.foods[0].pos.x };
  const before = prev.snakes.get(s);
  const restore = Interpolation.apply(state, prev, 0.25);
  assert.ok(close(s.pos.x, before.x + (now.x - before.x) * 0.25));
  assert.ok(close(s.body[3].pos.x, before.body[6] + (now.seg - before.body[6]) * 0.25));
  restore();
  assert.deepEqual([s.pos.x, s.pos.y, s.body[3].pos.x, state.foods[0].pos.x], [now.x, now.y, now.seg, now.food]);
  // alpha = 1 ou pas d'état précédent : rien ne bouge.
  Interpolation.apply(state, prev, 1)();
  Interpolation.apply(state, null, 0.3)();
  assert.equal(s.pos.x, now.x);
});
