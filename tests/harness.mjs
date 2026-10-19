import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Adaptateur vectoriel minimal pour exercer le vrai vehicle.js sans DOM ni p5.
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
  static dist(a, b) { return a.dist(b); }
  // Direction fixe : vitesses initiales reproductibles.
  static random2D() { return new Vector(1, 0); }
}

// Fonctions de dessin p5 factices : chaque appel est enregistré dans draws.
const DRAWING = ['push', 'pop', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight',
  'circle', 'line', 'triangle', 'translate', 'rotate', 'rect', 'arc', 'text', 'textSize', 'quad'];

const FILES = ['vehicle.js', 'debugMode.js', 'wander.js', 'snakeSpecies.js', 'snakePainter.js',
  'meadow.js', 'preySprites.js', 'bodySegment.js', 'snakeSounds.js', 'rat.js', 'ratTitle.js', 'snake.js',
  'playerSnake.js', 'snakeBot.js', 'food.js', 'snakeArena.js', 'profile.js'];

// Fichiers des outils de tournage (trailer/), chargés après le jeu.
export const TRAILER = ['trailer/easing.js', 'trailer/cameras.js', 'trailer/timeControl.js', 'trailer/interpolation.js',
  'trailer/actorSnake.js', 'trailer/director.js', 'trailer/eventDetector.js', 'trailer/grade.js', 'trailer/shots.js',
  'trailer/shotPlayer.js', 'trailer/recorder.js'];
const TRAILER_NAMES = ['Easing', 'CameraRig', 'TimeControl', 'Interpolation', 'ActorSnake', 'Director', 'EventDetector',
  'Grade', 'TrailerShots', 'ShotPlayer', 'Recorder'];

export function load(w = 800, h = 600, extra = []) {
  const draws = [];
  const stubs = Object.fromEntries(DRAWING.map(name => [name, (...args) => draws.push([name, ...args])]));
  const context = vm.createContext({ createVector: (x, y) => new Vector(x, y),
    p5: { Vector }, width: w, height: h, ...stubs });
  for (const file of FILES) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  for (const file of extra) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  const trailer = TRAILER_NAMES.filter(name => vm.runInContext(`typeof ${name} !== 'undefined'`, context));
  return { draws, context, ...vm.runInContext(
    '({ Vehicle, DebugMode, Wander, Snake, BodySegment, SnakeSounds, Rat, RatTitle, PlayerSnake, SnakeBot, Food, '
    + `SnakeSpecies, SnakePainter, Meadow, PreySprites, arena: SnakeArena, Profile, ${trailer.join(', ')} })`, context) };
}

export function seededRng(seed = 42) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
