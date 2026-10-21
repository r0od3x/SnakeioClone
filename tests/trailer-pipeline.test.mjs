import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load, TRAILER } from './harness.mjs';
import { planShot, planFile, readPlan } from '../trailer/planner.mjs';
import { contactSheetArgs, drawtextEscape, encodeArgs, flashFrames, parseDetect, qualityReport, ranges } from '../trailer/recorder/media.mjs';
import { createRecorder } from '../trailer/recorder/server.mjs';
import { chromeArgs, parseArgs } from '../trailer/recorder/capture.mjs';
import { animaticArgs, fcpxml, layout, readBack, shotList } from '../trailer/edit/timeline.mjs';
import { EDIT } from '../trailer/edit/table.mjs';

const game = () => load(1920, 1080, TRAILER);
// Objets créés dans le contexte du jeu : on compare leur contenu.
const plain = value => JSON.parse(JSON.stringify(value));
const shot = (g, id) => g.TrailerShots.find(s => s.id === id);
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

// Prise rejouée comme le studio : prise préparée, puis un pas de jeu par image.
function takeUntilKey(g, prepared, maxFrames = 600) {
  const run = g.Director.newRun({ ...g.KeyMoment.STUDIO_FLAGS, ...prepared.setup }, { name: 'Toi', species: null });
  const det = g.EventDetector.create();
  for (let frame = 0; frame < maxFrames; frame++) {
    g.Director.beforeStep(run);
    const before = g.EventDetector.snapshot(run.state);
    g.arena.step(run.state, 960, 540, run.rng);
    if (g.EventDetector.detect(det, run.state, before).some(e => g.KeyMoment.matches(run, e, prepared.key))) return frame;
  }
  return null;
}

// ---------- Moment clé ----------
test('moment clé : répétition à blanc déterministe, filtre par rôle, pas fixe', () => {
  const g = game();
  const s = shot(g, 'kill-burst');
  const setup = { ...g.KeyMoment.STUDIO_FLAGS, ...s.setup };
  const a = g.KeyMoment.find(setup, s.key);
  const b = g.KeyMoment.find(setup, s.key);
  assert.ok(a && a.step > 0);
  assert.equal(a.step, b.step, 'même graine, même pas');
  assert.equal(a.event.type, 'kill');
  assert.equal(g.KeyMoment.find(setup, { event: 'kill', role: 'personne' }, 200), null, 'rôle absent : jamais trouvé');
  assert.deepEqual(plain(g.KeyMoment.find(setup, { step: 42.4 })), { step: 42, event: { type: 'step' } });
});

test('moment clé : prise préparée (warmup, durée, instants fromKey), clé trop tôt, plan sans clé', () => {
  const g = game();
  const s = shot(g, 'near-miss');
  const prepared = g.KeyMoment.prepare(s, { seed: 9, step: 200 });
  assert.equal(prepared.setup.seed, 9);
  assert.equal(prepared.startStep, 200 - Math.round(s.pre * 60));
  assert.equal(prepared.setup.warmup, prepared.startStep);
  assert.equal(prepared.keyAt, Math.round(s.pre * 60) / 60);
  assert.equal(prepared.duration, prepared.keyAt + s.post);
  assert.deepEqual(plain(prepared.camera.keys.map(k => k.t)), plain(s.camera.keys.map(k => prepared.keyAt + k.fromKey)));
  assert.equal(s.camera.keys[0].t, undefined, 'le plan d\'origine n\'est pas modifié');
  const early = g.KeyMoment.prepare(s, { step: 30 });
  assert.deepEqual([early.startStep, early.keyAt], [0, 0.5], 'on garde ce qu\'il y a avant');
  const cued = g.KeyMoment.prepare({ ...s, cues: [{ fromKey: 0.5, action: 'slowmo' }], time: [{ fromKey: -1, scale: 1 }] }, { step: 200 });
  assert.deepEqual([cued.cues[0].t, cued.time[0].t], [prepared.keyAt + 0.5, prepared.keyAt - 1]);
  const plainShot = shot(g, 'arena-reveal');
  assert.equal(g.KeyMoment.prepare(plainShot, null), plainShot);
  assert.throws(() => g.KeyMoment.prepare(s, null), /introuvable/);
});

test('moment clé : dans la prise, il tombe exactement à keyAt (image keyAt × 60 - 1)', () => {
  const g = game();
  for (const id of ['near-miss', 'kill-burst']) {
    const s = shot(g, id);
    const found = g.KeyMoment.find({ ...g.KeyMoment.STUDIO_FLAGS, ...s.setup }, s.key);
    const prepared = g.KeyMoment.prepare(s, found);
    assert.equal(takeUntilKey(g, prepared), Math.round(prepared.keyAt * 60) - 1, id);
  }
});

test('moment clé : empreinte du plan (réglage, clé, réglages de tournage)', () => {
  const g = game();
  const s = shot(g, 'near-miss');
  const base = g.KeyMoment.signature(s);
  assert.equal(base, g.KeyMoment.signature({ ...s }));
  assert.notEqual(base, g.KeyMoment.signature({ ...s, setup: { ...s.setup, bots: 3 } }));
  assert.notEqual(base, g.KeyMoment.signature({ ...s, key: { event: 'kill' } }));
  assert.notEqual(base, g.KeyMoment.signature(s, { invincible: true, autopilot: false }));
});

test('moment clé : carte ASCII (bord, têtes, légende)', () => {
  const g = game();
  const run = g.Director.newRun({ scenario: 'nearMiss', bots: 0, seed: 5 });
  const map = g.KeyMoment.asciiMap(run.state, run.focus, { cols: 40, rows: 12, span: 1400 });
  const lines = map.split('\n');
  assert.equal(lines[0], `+${'-'.repeat(40)}+`);
  assert.equal(lines.filter(l => l.startsWith('|')).length, 12);
  assert.ok(/Éclair \(a\)/.test(map) && /Tonnerre \(b\)/.test(map));
  assert.ok(lines.slice(1, 13).some(l => /[a-z]/.test(l.slice(1, -1))), 'au moins une tête dessinée');
});

test('plans : clés validées, fromKey accepté, préparation utilisée par le lecteur', () => {
  const g = game();
  const { ShotPlayer } = g;
  assert.deepEqual(plain(ShotPlayer.validateAll(g.TrailerShots)), []);
  const base = { id: 'k', setup: {}, key: { event: 'kill' }, camera: { type: 'keyframes', keys: [{ fromKey: -1, x: 0, y: 0 }] } };
  assert.deepEqual(plain(ShotPlayer.validate(base)), []);
  assert.equal(ShotPlayer.validate({ ...base, key: { event: 'boom' } }).length, 1);
  assert.equal(ShotPlayer.validate({ ...base, pre: -1, post: 0 }).length, 2);
  assert.equal(ShotPlayer.validate({ ...base, key: undefined }).length, 2, 'sans clé : duration et t obligatoires');
  const player = ShotPlayer.create([base]);
  ShotPlayer.start(player, 0);
  ShotPlayer.usePrepared(player, { ...base, duration: 0.05, cues: [{ t: 0.02, action: 'release', role: 'x' }] });
  assert.deepEqual(plain(ShotPlayer.tick(player, 0.03)), { cues: [{ t: 0.02, action: 'release', role: 'x' }], ended: false });
  assert.equal(ShotPlayer.tick(player, 0.03).ended, true, 'durée du plan préparé');
});

// ---------- Planificateur ----------
test('planificateur : graine avec assez d\'avance, repli, échec, fichier plan.js relu', () => {
  const g = game();
  const s = shot(g, 'near-miss');
  const entry = planShot(g, s, { tries: 3 });
  assert.ok(entry && entry.seed === s.setup.seed && entry.step >= Math.round(s.pre * 60));
  assert.equal(entry.signature, g.KeyMoment.signature(s));
  const greedy = planShot(g, { ...s, pre: 10 }, { tries: 2 });
  assert.ok(greedy && greedy.step < 600, 'pas assez d\'avance : première graine où le moment arrive');
  assert.equal(planShot(g, { ...s, key: { event: 'kill', role: 'a' }, search: 1 }, { tries: 2 }), null);
  const dir = mkdtempSync(join(tmpdir(), 'plan-'));
  const file = join(dir, 'plan.js');
  const { run, ...stored } = entry;
  require_write(file, planFile({ 'near-miss': stored }));
  assert.deepEqual(readPlan(file), { 'near-miss': JSON.parse(JSON.stringify(stored)) });
  assert.deepEqual(readPlan(join(dir, 'absent.js')), {});
  rmSync(dir, { recursive: true, force: true });
});

function require_write(file, text) {
  spawnSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(text)})`]);
}

test('plan.js livré : à jour avec les plans à moment clé', () => {
  const g = game();
  const plan = readPlan();
  for (const s of g.TrailerShots.filter(x => g.KeyMoment.hasKey(x))) {
    assert.ok(plan[s.id], `${s.id} planifié (npm run trailer:plan)`);
    assert.equal(plan[s.id].signature, g.KeyMoment.signature(s), `${s.id} : plan.js périmé, relancer npm run trailer:plan`);
  }
});

// ---------- Capture (page) ----------
test('capture : paramètres d\'URL, monde -> écran, sujets, hors champ, luminosité', () => {
  const g = game();
  const C = g.TrailerCapture;
  assert.equal(C.params('?studio'), null);
  assert.deepEqual(plain(C.params('?studio&capture=near-miss&size=540p')), { id: 'near-miss', size: '540p', mode: 'draft' });
  assert.deepEqual(plain(C.params('?capture=x&size=8k&mode=final')), { id: 'x', size: '1080p', mode: 'final' });
  const cam = { x: 100, y: -50, zoom: 1.7, rotation: 0.4 };
  const world = g.CameraRig.toWorld(cam, 300, 120, 960, 540);
  const back = C.toScreen(cam, 960, 540, world);
  assert.ok(Math.abs(back.x - 300) < 1e-9 && Math.abs(back.y - 120) < 1e-9, 'inverse de CameraRig.toWorld');
  assert.deepEqual(plain(C.subjectsOf(shot(g, 'near-miss'))).sort(), ['a']);
  assert.deepEqual(plain(C.subjectsOf(shot(g, 'the-trap'))), ['prey'], "la cible 'key' n'est pas un sujet");
  assert.deepEqual(plain(C.subjectsOf(shot(g, 'cut-off'))), ['victim'], 'subjects explicites');
  assert.deepEqual(plain(C.subjectsOf({ subjects: ['x'], camera: { target: 'y' } })), ['x']);
  const at = (x, y) => ({ pos: { x, y } });
  const subjects = [{ role: 'in', snake: at(0, 0) }, { role: 'out', snake: at(5000, 0) }, { role: 'bar', snake: at(0, 250) }];
  assert.deepEqual(plain(C.offscreen(subjects, { x: 0, y: 0, zoom: 1, rotation: 0 }, 960, 540, 60)), ['out', 'bar']);
  assert.ok(Math.abs(C.luma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 1) - 127.5) < 1e-9);
});

// ---------- ffmpeg et contrôle qualité ----------
test('ffmpeg : brouillon H.264 seul, final avec maître ProRes 4444, BT.709, planche contact', () => {
  const draft = encodeArgs({ width: 960, height: 540, mode: 'draft', delivery: 'd.mp4', master: 'm.mov' });
  assert.ok(!draft.includes('prores_ks') && draft.at(-1) === 'd.mp4');
  assert.ok(draft.join(' ').includes('-s 960x540 -r 60 -i pipe:0'));
  const final = encodeArgs({ width: 1920, height: 1080, mode: 'final', delivery: 'd.mp4', master: 'm.mov' });
  assert.ok(final.includes('prores_ks') && final.includes('4444') && final.includes('m.mov') && final.at(-1) === 'd.mp4');
  assert.ok(final.join(' ').includes('format=yuv444p10le') && final.join(' ').includes('format=yuv420p'));
  assert.equal(final.filter(a => a === 'bt709').length, 6, 'balises de couleur sur les deux sorties');
  const sheet = contactSheetArgs({ input: 'c.mp4', frames: 480, out: 's.jpg' }).join(' ');
  assert.ok(sheet.includes('not(mod(n\\,40))') && sheet.includes('tile=4x3'));
  assert.equal(drawtextEscape("L'arène: 50%"), 'L’arène\\: 50\\%');
});

test('contrôle qualité : noirs et figés lus dans ffmpeg, flash isolé, intervalles, bilan', () => {
  const log = '[blackdetect @ 0] black_start:0 black_end:0.5 black_duration:0.5\n'
    + '[freezedetect @ 0] lavfi.freezedetect.freeze_start: 2.5\n[freezedetect @ 0] lavfi.freezedetect.freeze_duration: 1.25\n'
    + '[freezedetect @ 0] lavfi.freezedetect.freeze_end: 3.75\n';
  assert.deepEqual(parseDetect(log), { black: [{ start: 0, end: 0.5, duration: 0.5 }], freeze: [{ start: 2.5, duration: 1.25, end: 3.75 }] });
  assert.deepEqual(flashFrames([50, 50, 200, 50, 50]), [2]);
  assert.deepEqual(flashFrames([50, 100, 150, 200, 250]), [], 'une montée régulière n\'est pas un flash');
  assert.deepEqual(flashFrames([250, 60, 60]), [], 'bords : pas de voisin des deux côtés');
  assert.deepEqual(ranges([5, 3, 4, 9]), [{ from: 3, to: 5 }, { from: 9, to: 9 }]);
  const clean = qualityReport({ luma: [80, 80, 81], offscreen: [], keyFrame: 1, expectKey: true });
  assert.deepEqual([clean.ok, clean.warnings.length], [true, 0]);
  const bad = qualityReport({ luma: [240, 80, 80], offscreen: [{ frame: 1, roles: ['a'] }, { frame: 2, roles: ['a', 'b'] }], keyFrame: null, expectKey: true });
  assert.equal(bad.ok, false);
  assert.ok(bad.warnings.some(w => w.includes('blanche')) && bad.warnings.some(w => w.includes('moment clé absent')));
  assert.deepEqual(plain(bad.offscreen), [{ from: 1, to: 2, roles: ['a', 'b'] }]);
});

test('enregistreur : sert le jeu, refuse de sortir du dossier, prise complète avec ffmpeg', { skip: !hasFfmpeg && 'ffmpeg absent' }, async () => {
  const out = mkdtempSync(join(tmpdir(), 'takes-'));
  const reports = [];
  const rec = createRecorder({ root: new URL('../', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), outDir: out, onTake: r => reports.push(r) });
  rec.server.listen(0, '127.0.0.1');
  await new Promise(ok => rec.server.once('listening', ok));
  const base = `http://127.0.0.1:${rec.server.address().port}`;
  try {
    assert.ok((await (await fetch(`${base}/index.html`)).text()).includes('Trailer Studio'));
    assert.equal((await fetch(`${base}/..%2F..%2Fpackage.json`)).status, 403);
    const post = (path, body, json = true) => fetch(base + path, { method: 'POST', body: json ? JSON.stringify(body) : body });
    const [w, h, n] = [32, 18, 12];
    assert.equal((await post('/take/start', { id: 'essai', width: w, height: h, fps: 60, frames: n, mode: 'draft' })).status, 200);
    assert.equal((await post('/take/frame', new Uint8Array(10), false)).status, 500, 'taille d\'image vérifiée');
    for (let i = 0; i < n; i++) {
      const frame = new Uint8Array(w * h * 4).fill(40 + i * 10);
      assert.equal((await post(`/take/frame?n=${i}${i === 5 ? '&key=1' : ''}`, frame, false)).status, 200);
    }
    const manifest = await (await post('/take/end', { keyFrame: 5, events: [], sfx: [], luma: Array(n).fill(80), offscreen: [], plan: { keyStep: 10, letterbox: true } })).json();
    assert.deepEqual([manifest.frames, manifest.keyFrame, manifest.letterbox], [n, 5, true]);
    for (const file of Object.values(manifest.files)) assert.ok(existsSync(file), file);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'csv=p=0', manifest.files.delivery], { encoding: 'utf8' });
    assert.equal(probe.stdout.trim(), `${w},${h},${n}`);
    assert.ok(JSON.parse(readFileSync(join(out, 'essai', 'manifest.json'), 'utf8')).qc);
    assert.deepEqual(reports.map(r => r.ok), [false, true], 'image refusée signalée, puis prise terminée');
  } finally {
    rec.server.close();
    rmSync(out, { recursive: true, force: true });
  }
});

test('lot de capture : options, arguments de Chrome', () => {
  assert.deepEqual(parseArgs(['near-miss']), { final: false, mode: 'draft', size: '540p', out: undefined, timeout: 600, ids: ['near-miss'] });
  const final = parseArgs(['--final', '--size', '4k', 'a', '--timeout', '30', 'b']);
  assert.deepEqual([final.mode, final.size, final.timeout, final.ids], ['final', '4k', 30, ['a', 'b']]);
  const args = chromeArgs('http://x/', 'C:/tmp/p');
  assert.ok(args.includes('--headless=new') && args.includes('--user-data-dir=C:/tmp/p') && args.at(-1) === 'http://x/');
});

// ---------- Montage ----------
const manifest = (id, frames, extra = {}) => ({
  id, frames, fps: 60, width: 960, height: 540, keyFrame: null, letterbox: true,
  files: { delivery: `C:/clips/${id}.mp4`, master: `C:/clips/${id}-master.mov` }, qc: { offscreen: [], flashes: [] }, ...extra,
});

test('montage : positions à l\'image près, erreurs et avertissements', () => {
  const clips = { a: manifest('a', 300, { keyFrame: 100, qc: { offscreen: [{ from: 200, to: 220, roles: ['x'] }], flashes: [] } }), b: manifest('b', 120) };
  const plan = layout({ fps: 60, rows: [
    { beat: '1', clip: 'a', in: 1, out: 3.5 },
    { beat: '2', gap: 0.5, card: 'TITRE' },
    { beat: '3', clip: 'b', in: 0, out: 2 },
  ] }, clips);
  assert.deepEqual(plain(plan.errors), []);
  assert.deepEqual(plain(plan.rows.map(r => [r.start, r.length])), [[0, 150], [150, 30], [180, 120]]);
  assert.equal(plan.total, 300);
  assert.ok(plan.warnings.some(w => w.includes('hors champ')), 'contrôle qualité dans l\'extrait');
  const bad = layout({ fps: 60, rows: [
    { beat: 'x', clip: 'inconnu', in: 0, out: 1 }, { beat: 'y', clip: 'b', in: 1, out: 1 }, { beat: 'z', clip: 'b', in: 0, out: 3 },
    { beat: 'k', clip: 'a', in: 0, out: 1 }, { beat: 'g', gap: 0 },
  ] }, { ...clips, b: manifest('b', 120, { fps: 30 }) });
  assert.equal(bad.errors.length, 6);
  assert.ok(bad.warnings.some(w => w.includes('moment clé')) && bad.warnings.some(w => w.includes('fin de timeline')));
});

test('FCPXML 1.8 : assets en file:/// absolus, positions continues, marqueur du moment clé, relecture', () => {
  const plan = layout({ fps: 60, rows: [
    { beat: 'Un', clip: 'a', in: 1, out: 2, notes: 'note <1> & "2"' }, { beat: 'Noir', gap: 1 }, { beat: 'Deux', clip: 'a', in: 3, out: 4 },
  ] }, { a: manifest('a', 300, { keyFrame: 90 }) });
  const xml = fcpxml(plan, { title: 'T', source: 'master' });
  assert.ok(xml.includes('<fcpxml version="1.8">') && !xml.includes('media-rep'));
  assert.equal((xml.match(/<asset /g) ?? []).length, 1, 'un asset par plan, même utilisé deux fois');
  assert.ok(xml.includes('src="file:///C:/clips/a-master.mov"'));
  assert.ok(xml.includes('<marker start="90/60s" duration="1/60s" value="Moment clé"/>'));
  assert.ok(xml.includes('note &lt;1&gt; &amp; &quot;2&quot;'));
  const check = readBack(xml);
  assert.deepEqual([check.ok, check.clips, check.gaps, check.duration], [true, 2, 1, 3]);
  assert.equal(readBack(xml.replace('offset="120/60s"', 'offset="121/60s"')).ok, false, 'trou détecté');
  assert.equal(readBack(xml, () => false).ok, false, 'fichier absent détecté');
});

test('liste des plans (CSV) et commande de l\'animatique', () => {
  const clips = { a: manifest('a', 300, { keyFrame: 90 }), b: manifest('b', 300, { letterbox: false }) };
  const plan = layout({ fps: 60, rows: [{ beat: 'Un, deux', clip: 'a', in: 1, out: 2 }, { beat: 'Titre', gap: 2, card: 'SNAKE.IO' }] }, clips);
  const csv = shotList(plan).split('\n');
  assert.equal(csv[1], '1,"Un, deux",a,1,2,1.000,00:00:00:00,00:00:01:00,1.500,,');
  assert.equal(csv[2], '2,Titre,noir,,,2.000,00:00:01:00,00:00:03:00,,SNAKE.IO,');
  const { args, graph } = animaticArgs(plan, { landscape: 'l.mp4', vertical: 'v.mp4' });
  assert.equal(args.filter(a => a === '-i').length, 1);
  assert.ok(graph.includes('trim=start_frame=60:end_frame=120') && graph.includes('color=c=black:s=960x540:r=60:d=2'));
  assert.ok(graph.includes('concat=n=2') && graph.includes('crop=226:402'), 'vertical recadré dans l\'image utile');
  assert.equal(args.filter(a => a === String(plan.total)).length, 2, 'durée exacte des deux sorties');
  const open = animaticArgs(layout({ fps: 60, rows: [{ beat: 'B', clip: 'b', in: 0, out: 1 }] }, clips), { landscape: 'l', vertical: 'v' });
  assert.ok(open.graph.includes('crop=304:540'), 'sans bandes noires : toute la hauteur');
});

test('table de montage : plans existants, extraits dans la durée des plans', () => {
  const g = game();
  const plan = readPlan();
  for (const row of EDIT.rows.filter(r => r.clip)) {
    const s = shot(g, row.clip);
    assert.ok(s, `plan ${row.clip}`);
    const prepared = g.KeyMoment.hasKey(s) ? g.KeyMoment.prepare(s, plan[s.id]) : s;
    assert.ok(row.in >= 0 && row.out > row.in && row.out <= prepared.duration + 1e-9, `${row.beat} : ${row.in}-${row.out} dans ${prepared.duration} s`);
  }
});

test('index.html : outils chargés seulement avec ?studio, dans le bon ordre', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const list = /for \(const file of \[([^\]]+)\]\)/.exec(html)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
  const at = name => list.indexOf(name);
  assert.ok(at('director') < at('keyMoment') && at('eventDetector') < at('keyMoment') && at('keyMoment') < at('studio'));
  assert.ok(at('shots') < at('plan') && at('plan') < at('studio') && at('studio') < at('capture'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const script of ['trailer:plan', 'trailer:draft', 'trailer:final', 'trailer:animatic']) assert.ok(pkg.scripts[script], script);
});
