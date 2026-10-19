import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, seededRng } from './harness.mjs';

const FILES = ['trailer/easing.js', 'trailer/cameras.js', 'trailer/timeControl.js', 'trailer/actorSnake.js', 'trailer/director.js',
  'trailer/grade.js', 'trailer/canvasHud.js', 'trailer/shots.js', 'trailer/shotPlayer.js', 'trailer/recorder.js'];

// Faux contexte 2D : enregistre les appels et les réglages.
function fakeContext(width = 1920, height = 1080) {
  const calls = [];
  const target = { calls, canvas: { width, height } };
  const ctx = new Proxy(target, {
    get(t, name) {
      if (name in t) return t[name];
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (name === 'measureText') return text => ({ width: String(text).length * 7 });
      return (...args) => calls.push([name, ...args]);
    },
    set(t, name, value) {
      calls.push([`set:${String(name)}`, value]);
      return true;
    },
  });
  return { ctx, calls };
}

test('bandes noires : format 2,39:1, entrée progressive, rien si l\'écran est déjà plus large', () => {
  const { Grade } = load(800, 600, FILES);
  assert.ok(Math.abs(Grade.letterboxBar(1920, 1080) - (1080 - 1920 / 2.39) / 2) < 1e-9);
  assert.ok(Math.abs(Grade.letterboxBar(1920, 1080, 0.5) - Grade.letterboxBar(1920, 1080) / 2) < 1e-9);
  assert.equal(Grade.letterboxBar(1920, 1080, 0), 0);
  assert.equal(Grade.letterboxBar(3000, 1000), 0);
  const { ctx, calls } = fakeContext();
  const bar = Grade.letterbox(ctx, 1);
  const rects = calls.filter(c => c[0] === 'fillRect');
  assert.equal(rects.length, 2);
  assert.deepEqual(rects[1].slice(1), [0, 1080 - Math.ceil(bar), 1920, Math.ceil(bar)]);
});

test('étalonnage : préréglages valides, filtre, lueur, rien pour « none » ou sans canvas de travail', () => {
  const { Grade } = load(800, 600, FILES);
  assert.deepEqual([...Grade.NAMES], ['none', 'cinematic', 'golden', 'moody']);
  assert.equal(Grade.filterString({ contrast: 1.1, saturate: 1.2, brightness: 0.9 }), 'contrast(1.1) saturate(1.2) brightness(0.9)');
  const { ctx, calls } = fakeContext(1280, 720);
  const scratch = { width: 0, height: 0, getContext: () => fakeContext().ctx };
  assert.equal(Grade.apply(ctx, 'none', scratch), false);
  assert.equal(Grade.apply(ctx, 'cinematic', null), false);
  assert.equal(Grade.apply(ctx, 'cinematic', scratch), true);
  assert.deepEqual([scratch.width, scratch.height], [1280, 720], 'canvas de travail à la taille réelle');
  const filters = calls.filter(c => c[0] === 'set:filter').map(c => c[1]);
  assert.match(filters[0], /^contrast\(/);
  assert.ok(filters.some(f => f.startsWith('blur(')), 'lueur');
  assert.equal(filters.at(-1), 'none', 'filtre remis');
  assert.ok(calls.some(c => c[0] === 'set:globalCompositeOperation' && c[1] === 'lighter'));
});

test('plans : les exemples de trailer/shots.js sont valides ; erreurs signalées', () => {
  const { TrailerShots, ShotPlayer } = load(800, 600, FILES);
  assert.ok(TrailerShots.length >= 3);
  assert.deepEqual([...ShotPlayer.validateAll(TrailerShots)], []);
  const bad = [
    { id: 'a b', duration: 0, setup: { scenario: 'boum' }, camera: { type: 'drone' } },
    { id: 'k', duration: 2, camera: { type: 'keyframes', keys: [{ t: 2 }, { t: 1 }] }, cues: [{ t: 1, action: 'explode' }],
      events: { autoSlowmo: { on: ['sneeze'] } }, time: [{ t: 0, scale: 0 }] },
    { id: 'f', duration: 2, camera: { type: 'follow' } },
    { id: 'f', duration: 2 },
  ];
  const errors = ShotPlayer.validateAll(bad).join('\n');
  for (const part of ['id invalide', 'duration', 'scène inconnue boum', 'caméra inconnue drone', 'non triées', 'action invalide explode',
    'événement inconnu sneeze', 'point de temps invalide', 'follow sans target', 'id en double : f']) {
    assert.ok(errors.includes(part), part);
  }
});

test('lecture des plans : horloge, actions datées dans l\'ordre, fin, suivant / précédent en boucle', () => {
  const { ShotPlayer } = load(800, 600, FILES);
  const shots = [
    { id: 'one', duration: 1, cues: [{ t: 0.5, action: 'release' }, { t: 0.2, action: 'cut' }] },
    { id: 'two', duration: 2 },
  ];
  const player = ShotPlayer.create(shots);
  assert.equal(ShotPlayer.start(player, 0).id, 'one');
  let cues = [];
  let ended = false;
  for (let i = 0; i < 59 && !ended; i++) {
    const r = ShotPlayer.tick(player, 1 / 60);
    cues.push(...r.cues.map(c => c.action));
    ended = r.ended;
  }
  assert.deepEqual(cues, ['cut', 'release']);
  assert.equal(ended, false);
  assert.equal(ShotPlayer.tick(player, 1 / 60).ended, true);
  assert.equal(player.playing, false);
  assert.deepEqual({ ...ShotPlayer.tick(player, 1) }.cues.length, 0);
  assert.equal(ShotPlayer.next(player).id, 'two');
  assert.equal(ShotPlayer.next(player).id, 'one', 'boucle');
  assert.equal(ShotPlayer.previous(player).id, 'two');
  // Rejouer : les actions reviennent.
  ShotPlayer.start(player, 0);
  assert.equal(player.pending.length, 2);
  ShotPlayer.stop(player);
  assert.equal(player.playing, false);
});

test('les plans d\'exemple se préparent et tournent sans erreur (prise, rôles des caméras)', () => {
  const { TrailerShots, Director, CameraRig, TimeControl, arena } = load(800, 600, FILES);
  for (const shot of TrailerShots) {
    const run = Director.newRun(shot.setup, {});
    const resolve = name => Director.resolve(run, name);
    for (const name of [shot.camera.target, ...(shot.camera.keys ?? []).map(k => k.target), ...(shot.cues ?? []).map(c => c.target)]) {
      if (name) assert.ok(resolve(name), `${shot.id} : cible ${name}`);
    }
    const rig = CameraRig.create();
    if (shot.camera.type === 'keyframes') CameraRig.playKeyframes(rig, shot.camera.keys, resolve);
    else CameraRig.follow(rig, resolve(shot.camera.target));
    const tc = TimeControl.create();
    TimeControl.setCurve(tc, shot.time);
    for (let f = 0; f < 120; f++) {
      const { steps } = TimeControl.advance(tc, 1 / 60);
      for (let i = 0; i < steps; i++) Director.step(run);
      CameraRig.update(rig, 1 / 60, run.state);
    }
    assert.ok([rig.cam.x, rig.cam.y, rig.cam.zoom].every(Number.isFinite), shot.id);
    assert.ok(run.state.snakes.length > 0 && run.state.snakes.every(s => Math.hypot(s.pos.x, s.pos.y) < arena.RADIUS + 60), shot.id);
  }
});

test('enregistreur : format choisi, nom de fichier par plan, une image vidéo par image dessinée', async () => {
  const { Recorder } = load(800, 600, FILES);
  assert.equal(Recorder.pickType(t => t.startsWith('video/webm')), 'video/webm;codecs=vp9');
  assert.equal(Recorder.pickType(t => t === 'video/mp4'), 'video/mp4');
  assert.equal(Recorder.pickType(() => false), '');
  assert.deepEqual([Recorder.extension('video/mp4;codecs=avc1'), Recorder.extension('video/webm')], ['mp4', 'webm']);
  assert.equal(Recorder.fileName('the-trap', 'mp4'), 'the-trap.mp4');
  assert.equal(Recorder.fileName('../plan 1/é', 'webm'), 'plan-1.webm');
  assert.equal(Recorder.fileName('', 'mp4'), 'plan.mp4');
  // Faux MediaRecorder et faux canvas.
  const log = { frames: 0, downloads: [], options: null };
  class FakeRecorder {
    static isTypeSupported(t) { return t === 'video/webm;codecs=vp9'; }
    constructor(stream, options) { log.options = options; }
    start() {}
    stop() { this.ondataavailable({ data: { size: 5 } }); this.onstop(); }
  }
  const track = { requestFrame() { log.frames++; }, stop() {} };
  const canvas = { captureStream: fps => { log.fps = fps; return { getVideoTracks: () => [track] }; } };
  const blobs = [];
  const FakeBlob = class { constructor(parts, o) { this.size = parts.length; this.type = o.type; } };
  const rec = Recorder.create(canvas, { MediaRecorder: FakeRecorder, Blob: FakeBlob, download: (blob, name) => { blobs.push(blob); log.downloads.push(name); } });
  assert.equal(rec.supported, true);
  assert.equal(rec.start('near-miss'), true);
  assert.equal(rec.start('again'), false, 'déjà en cours');
  assert.equal(log.fps, 0, 'flux à la demande');
  assert.equal(log.options.videoBitsPerSecond, Recorder.BITRATE);
  for (let i = 0; i < 90; i++) rec.frame();
  const result = await rec.stop();
  assert.deepEqual([result.name, result.frames, log.frames], ['near-miss.webm', 90, 90]);
  assert.deepEqual(log.downloads, ['near-miss.webm']);
  rec.frame();
  assert.equal(log.frames, 90, 'plus d\'images après l\'arrêt');
  assert.equal(await rec.stop(), null);
  assert.equal(Recorder.create({}, { MediaRecorder: null }).supported, false);
});

test('interface dans le canvas : longueur, classement, fil, sous les bandes noires', () => {
  const { CanvasHud, arena } = load(800, 600, FILES);
  const state = arena.create(arena.initialParams(), seededRng(), { name: 'Rood' });
  arena.setParam(state.params, 'bots', 3, state, seededRng(2));
  const seg = state.player.body[6];
  arena.bots(state)[0].pos.set(seg.x, seg.y);
  arena.collisions(state, seededRng());
  const { ctx, calls } = fakeContext(1280, 720);
  const hud = CanvasHud.draw(ctx, state, 1280, 720, 40);
  const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
  assert.ok(texts.includes(String(hud.length)));
  assert.ok(texts.includes('Rood'));
  assert.ok(texts.some(t => /Rood a éliminé/.test(t)));
  const firstCardY = calls.find(c => c[0] === 'roundRect' || c[0] === 'rect')[2];
  assert.ok(firstCardY >= 40, 'sous la bande noire');
});

test('studio : aucun fichier de trailer/ chargé sans ?studio ; crochets du jeu inactifs', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/^\s*<script src="trailer\//m.test(html), 'pas de balise script vers trailer/ dans la page');
  assert.match(html, /has\('studio'\)/);
  const sketch = readFileSync(new URL('../sketch.js', import.meta.url), 'utf8');
  assert.match(sketch, /typeof TrailerStudio !== 'undefined' && TrailerStudio\.active/);
});
