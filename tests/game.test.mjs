import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRng } from './harness.mjs';

const W = 1200;
const H = 800;

// Stockage factice (localStorage) ; broken = lève une erreur comme en navigation privée.
function memoryStorage(broken = false) {
  const data = new Map();
  return {
    data,
    getItem(key) { if (broken) throw new Error('bloqué'); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { if (broken) throw new Error('bloqué'); data.set(key, String(value)); },
  };
}

test('profil : vide par défaut, sauvegardé puis relu, record seulement s\'il est battu', () => {
  const { Profile } = load();
  const storage = memoryStorage();
  assert.deepEqual({ ...Profile.load(storage) }, { name: '', species: null, record: 0 });
  const profile = { name: 'Rood', species: 'kingCobra', record: 0 };
  assert.equal(Profile.save(profile, storage), true);
  assert.deepEqual({ ...Profile.load(storage) }, profile);
  assert.equal(Profile.submitScore(profile, 120.6, storage), true);
  assert.equal(Profile.load(storage).record, 121);
  assert.equal(Profile.submitScore(profile, 80, storage), false, 'plus petit : pas de record');
  assert.equal(Profile.submitScore(profile, NaN, storage), false);
  assert.equal(Profile.load(storage).record, 121);
});

test('profil : stockage absent, illisible ou bloqué sans erreur', () => {
  const { Profile } = load();
  assert.deepEqual({ ...Profile.load(null) }, { name: '', species: null, record: 0 });
  const garbage = memoryStorage();
  garbage.setItem(Profile.KEY, '{pas du json');
  assert.equal(Profile.load(garbage).record, 0);
  garbage.setItem(Profile.KEY, JSON.stringify({ name: 42, species: 7, record: -5 }));
  assert.deepEqual({ ...Profile.load(garbage) }, { name: '', species: null, record: 0 });
  const broken = memoryStorage(true);
  assert.equal(Profile.save({ name: 'a', species: null, record: 1 }, broken), false);
  assert.equal(Profile.load(broken).record, 0);
});

test('partie : nom et espèce choisis au menu, sinon « Toi » et une espèce au hasard', () => {
  const { arena, SnakeSpecies } = load();
  assert.deepEqual({ ...arena.normalizeProfile({ name: '   ', species: 'inconnue' }) }, { name: 'Toi', species: null });
  assert.equal(arena.normalizeProfile({ name: 'x'.repeat(30) }).name.length, 16);
  const chosen = arena.create(arena.initialParams(), seededRng(), { name: 'Rood', species: 'coral' });
  assert.deepEqual([chosen.player.name, chosen.player.species], ['Rood', SnakeSpecies.byId('coral')]);
  // L'espèce choisie est gardée à la réapparition.
  chosen.player.pos.set(arena.RADIUS + 50, 0);
  arena.collisions(chosen, seededRng());
  arena.respawn(chosen, seededRng(3));
  assert.equal(chosen.player.species.id, 'coral');
  const random = arena.create(arena.initialParams(), seededRng(), {});
  assert.equal(random.player.name, 'Toi');
  assert.ok(SnakeSpecies.LIST.includes(random.player.species));
});

test('fil des éliminations : tueur, victime, mort contre le bord, effacé après FEED_FRAMES images', () => {
  const { arena } = load();
  const state = arena.create(arena.initialParams(), seededRng(), { name: 'Rood' });
  arena.setParam(state.params, 'bots', 2, state, seededRng(2));
  const [a, b] = arena.bots(state);
  const seg = state.player.body[6];
  a.pos.set(seg.x, seg.y);
  arena.collisions(state, seededRng());
  b.pos.set(arena.RADIUS + 40, 0);
  arena.collisions(state, seededRng());
  const feed = arena.recentFeed(state);
  assert.equal(feed.length, 2);
  assert.deepEqual([feed[0].killer, feed[0].victim, feed[0].mine], ['Rood', a.name, true]);
  assert.deepEqual([feed[1].killer, feed[1].victim, feed[1].mine], [null, b.name, false]);
  assert.equal(feed[0].color, state.player.species.ui);
  state.frame += arena.FEED_FRAMES;
  assert.equal(arena.recentFeed(state).length, 0);
  assert.equal(arena.hud(state).feed.length, 0);
  // Le fil garde au plus 6 entrées.
  for (let i = 0; i < 10; i++) {
    arena.resizeBots(state, 1, seededRng(i + 1));
    arena.kill(state, arena.bots(state)[0], null, seededRng());
  }
  assert.ok(state.feed.length <= 6);
});

test('réapparition immédiate (bouton Rejouer) et statistiques de la partie', () => {
  const { arena, PlayerSnake, Food } = load();
  const state = arena.create(arena.initialParams(), seededRng(), { name: 'Rood' });
  arena.setParam(state.params, 'bots', 1, state, seededRng(2));
  const first = state.player;
  assert.equal(arena.respawn(state), first, 'vivant : rien ne change');
  state.foods.length = 0;
  state.foods.push(new Food(first.pos.x, first.pos.y, 2));
  arena.eat(state);
  arena.step(state, W, H, seededRng(4));
  first.pos.set(arena.RADIUS + 50, 0);
  arena.collisions(state, seededRng());
  assert.equal(state.player, null);
  const hud = arena.hud(state);
  assert.equal(hud.dead, true);
  assert.equal(hud.stats.eaten, 1);
  assert.ok(hud.stats.bestRank >= 1 && hud.stats.bestRank <= 2, 'meilleur rang parmi 2 serpents');
  arena.respawn(state, seededRng(7));
  assert.ok(state.player instanceof PlayerSnake && state.player !== first);
  assert.deepEqual([state.respawnIn, state.stats.lives, state.stats.deaths], [0, 2, 1]);
  assert.equal(state.snakes.filter(s => s === state.player).length, 1);
  // La réapparition automatique ne double pas le joueur.
  for (let f = 0; f < arena.PLAYER_RESPAWN + 5; f++) arena.step(state, W, H, seededRng(f + 20));
  assert.equal(state.snakes.filter(s => s instanceof PlayerSnake).length, 1);
});
