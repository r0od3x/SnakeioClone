import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineGame, loadClasses } from '../game.mjs';

function seededRng(seed = 42) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}
const classes = loadClasses();
const newGame = (rules = {}) => new OnlineGame({ classes, rng: seededRng(), rules });

test('partie : bots et proies au départ ; deux joueurs, chacun son serpent (Vehicle)', () => {
  const game = newGame();
  assert.equal(game.bots().length, game.rules.bots);
  assert.equal(game.foods.length, game.rules.foodTarget);
  const me = game.join('Roode');
  const friend = game.join('Ami');
  assert.ok(me.snake instanceof classes.NetPlayerSnake && me.snake instanceof classes.Snake);
  assert.ok(me.snake instanceof classes.Vehicle);
  assert.notEqual(me.snake, friend.snake);
  assert.deepEqual([me.name, friend.name, game.players.size], ['Roode', 'Ami', 2]);
  assert.notEqual(me.snake.netId, friend.snake.netId);
});

test('noms nettoyés, nom par défaut, partie pleine', () => {
  const game = newGame({ maxPlayers: 2 });
  assert.equal(game.join('<b>Kaa</b>!!').name, 'bKaab');
  assert.equal(game.join('   ').name, 'Joueur 2');
  assert.equal(game.join('Trop'), null);
});

test('chaque joueur pilote son propre serpent avec sa souris', () => {
  const game = newGame({ bots: 0 });
  const a = game.join('A');
  const b = game.join('B');
  a.snake.pos.set(0, 0); a.snake.vel.set(2.6, 0); a.snake.resetBody();
  b.snake.pos.set(0, 600); b.snake.vel.set(2.6, 0); b.snake.resetBody();
  assert.equal(game.setInput(a.id, { x: 0, y: -1000, boost: false }), true);
  assert.equal(game.setInput(b.id, { x: 0, y: 1400, boost: true }), true);
  for (let i = 0; i < 60; i++) game.step();
  assert.ok(a.snake.pos.y < -20, 'A monte');
  assert.ok(b.snake.pos.y > 620, 'B descend');
  assert.ok(b.snake.boosting && !a.snake.boosting);
  assert.equal(game.setInput('inconnu', { x: 0, y: 0 }), false);
  assert.equal(game.setInput(a.id, { x: 'abc', y: 0 }), false, 'entrée invalide ignorée');
});

test('collision : tête contre corps d\'un joueur -> mort, élimination comptée, réapparition', () => {
  const game = newGame({ bots: 0, respawnFrames: 10 });
  const a = game.join('A');
  const b = game.join('B');
  const seg = a.snake.body[6];
  b.snake.pos.set(seg.x, seg.y);
  game.collisions();
  assert.equal(b.snake, null);
  assert.deepEqual([a.kills, b.deaths, b.death.by], [1, 1, 'A']);
  const snap = game.snapshot(b.id);
  assert.equal(snap.me.alive, false);
  assert.equal(snap.me.death.by, 'A');
  for (let i = 0; i < 10; i++) game.step();
  assert.ok(b.snake, 'réapparu');
  assert.equal(game.snapshot(b.id).me.alive, true);
});

test('départ d\'un joueur : son serpent quitte la partie', () => {
  const game = newGame({ bots: 2 });
  const a = game.join('A');
  const count = game.snakes.length;
  assert.equal(game.leave(a.id), true);
  assert.equal(game.snakes.length, count - 1);
  assert.equal(game.players.size, 0);
  assert.equal(game.leave(a.id), false);
  assert.equal(game.snapshot(a.id), null);
});

test('instantané : ce qui entoure le joueur, compact, classement et mini-carte', () => {
  const game = newGame();
  const a = game.join('A');
  for (let i = 0; i < 120; i++) game.step();
  const snap = game.snapshot(a.id);
  const mine = snap.snakes.filter(s => s.me);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].n, 'A');
  assert.ok(snap.snakes.every(s => Math.hypot(s.x - a.snake.pos.x, s.y - a.snake.pos.y) <= game.rules.viewRadius + 3000));
  assert.ok(snap.foods.length % 4 === 0);
  for (let i = 0; i < snap.foods.length; i += 4) {
    assert.ok(Math.hypot(snap.foods[i] - a.snake.pos.x, snap.foods[i + 1] - a.snake.pos.y) <= game.rules.viewRadius + 1);
  }
  assert.ok(snap.board.length <= 5 && snap.board.every((r, i) => i === 0 || snap.board[i - 1].m >= r.m));
  assert.equal(snap.minimap.length, game.snakes.length);
  assert.ok(JSON.stringify(snap).length < 40000, 'taille raisonnable pour le réseau');
  // Corps : un segment sur deux, coordonnées entières.
  const s = mine[0];
  assert.equal(s.body.length, Math.floor(a.snake.body.length / 2) * 2);
  assert.ok(s.body.every(Number.isInteger));
});

test('partie longue à deux joueurs : tout reste fini, bots maintenus, simulation assez rapide', () => {
  const game = newGame();
  const a = game.join('A');
  const b = game.join('B');
  const t0 = performance.now();
  for (let f = 0; f < 1200; f++) {
    if (a.snake) game.setInput(a.id, { x: Math.cos(f / 60) * 800, y: Math.sin(f / 60) * 800, boost: f % 200 < 20 });
    if (b.snake) game.setInput(b.id, { x: -400, y: 300, boost: false });
    game.step();
  }
  const ms = (performance.now() - t0) / 1200;
  for (const s of game.snakes) assert.ok([s.pos.x, s.pos.y, s.mass].every(Number.isFinite));
  assert.equal(game.bots().length, game.rules.bots);
  assert.ok(game.foods.length <= game.rules.maxFood);
  assert.ok(ms < 16, `${ms.toFixed(2)} ms par image (60 images/s)`);
});
