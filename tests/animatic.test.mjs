import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAILER as cfg } from '../trailer-animatic/trailer.config.mjs';
import { check, timeline, words } from '../trailer-animatic/lib/timeline.mjs';
import { SFX } from '../trailer-animatic/lib/audio.mjs';
import { cutOf } from '../trailer-animatic/lib/clips.mjs';
import { load, TRAILER } from './harness.mjs';

const shots = timeline(cfg);

test('animatique : 60 s sur la grille des temps, coupes sur des images entières, aucune erreur', () => {
  const { errors, warnings } = check(cfg, shots);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(shots.at(-1).end, 60);
  for (const s of shots) {
    assert.ok(Number.isInteger(s.duration * cfg.fps), `${s.slug} : coupe sur une image`);
    assert.equal(s.f0, Math.round(s.start * cfg.fps));
  }
  // La musique couvre exactement les plans, sans trou ni chevauchement.
  let at = 0;
  for (const m of cfg.music) {
    assert.equal(m.from, at);
    at = m.to;
  }
  assert.equal(at, shots.at(-1).endBeat);
});

test('animatique : textes courts, bruitages connus, cartons et plans de jeu', () => {
  for (const s of shots) {
    if (s.text) assert.ok(words(s.text) <= 6, s.slug);
    for (const fx of s.sfx ?? []) assert.ok(SFX[fx.type], `${s.slug} : bruitage ${fx.type}`);
  }
  assert.ok(shots.filter(s => s.card).length >= 3, 'cartons');
  assert.ok(shots.filter(s => s.clip).length >= 20, 'plans de jeu');
  assert.equal(shots.at(-1).card.kind, 'cta');
});

test('animatique : chaque prise est un plan du studio, et les moments clés existent', () => {
  const { TrailerShots } = load(1920, 1080, TRAILER);
  const ids = new Map(TrailerShots.map(s => [s.id, s]));
  for (const s of shots.filter(x => x.clip)) {
    const shot = ids.get(s.clip.take);
    assert.ok(shot, `${s.slug} : prise ${s.clip.take} absente de trailer/shots.js`);
    if (s.clip.fromKey !== undefined) assert.ok(shot.key, `${s.slug} : ${s.clip.take} n'a pas de moment clé`);
  }
});

test('découpe : à partir du moment clé ou d\'un instant, durée multipliée par la vitesse', () => {
  const take = { keyTime: 2, duration: 6 };
  assert.deepEqual(cutOf({ clip: { fromKey: -0.5 }, duration: 2 }, take), { start: 1.5, length: 2, speed: 1 });
  assert.deepEqual(cutOf({ clip: { at: 3, speed: 0.5 }, duration: 2 }, take), { start: 3, length: 1, speed: 0.5 });
});
