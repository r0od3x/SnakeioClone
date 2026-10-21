// Tournage en lot : lance l'enregistreur local, puis Chrome sans fenêtre pour chaque plan
// (index.html?studio&capture=<id>), attend la fin de la prise et passe au plan suivant.
//
//   node trailer/recorder/capture.mjs                    brouillons 540p de tous les plans
//   node trailer/recorder/capture.mjs near-miss          un plan
//   node trailer/recorder/capture.mjs --final            version finale 1080p + maître ProRes 4444
//   options : --size 540p|720p|1080p|1440p|4k, --out <dossier>, --timeout <s>
// Prises dans trailer/out/draft/<id>/ (ou final/) : vidéo, image clé, planche contact, manifest, qc.
// Ne pas modifier les fichiers du jeu pendant un lot : chaque page relit les fichiers au démarrage.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, TRAILER } from '../../tests/harness.mjs';
import { createRecorder } from './server.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function chromePath(env = process.env) {
  const candidates = [env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return candidates.find(path => path && existsSync(path)) ?? null;
}

export function chromeArgs(url, profileDir) {
  return ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profileDir}`,
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--mute-audio', '--window-size=1280,800', ...(process.env.CHROME_FLAGS ?? '').split(' ').filter(Boolean), url];
}

export function parseArgs(argv) {
  const value = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const final = argv.includes('--final');
  const skip = new Set(['--size', '--out', '--timeout'].flatMap(n => [n, value(n)]));
  return {
    final,
    mode: final ? 'final' : 'draft',
    size: value('--size') ?? (final ? '1080p' : '540p'),
    out: value('--out'),
    timeout: Number(value('--timeout') ?? 600),
    ids: argv.filter(a => !a.startsWith('--') && !skip.has(a)),
  };
}

function kill(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

async function main(argv) {
  const options = parseArgs(argv);
  const chrome = chromePath();
  if (!chrome) throw new Error('Chrome introuvable : définir CHROME_PATH');
  const game = load(1920, 1080, TRAILER);
  const shots = game.TrailerShots.filter(s => !options.ids.length || options.ids.includes(s.id));
  const unknown = options.ids.filter(id => !game.TrailerShots.some(s => s.id === id));
  if (unknown.length) throw new Error(`plans inconnus : ${unknown.join(', ')}`);
  const outDir = resolve(options.out ?? join(ROOT, 'trailer', 'out', options.mode));
  let finished = null;
  const recorder = createRecorder({ root: ROOT, outDir, onTake: result => finished?.(result), log: line => console.log(line) });
  recorder.server.listen(0, '127.0.0.1');
  await new Promise(done => recorder.server.once('listening', done));
  const port = recorder.server.address().port;
  const results = [];
  for (const shot of shots) {
    const profile = mkdtempSync(join(tmpdir(), 'snake-capture-'));
    const url = `http://127.0.0.1:${port}/index.html?studio&capture=${encodeURIComponent(shot.id)}&size=${options.size}&mode=${options.mode}`;
    const done = new Promise(ok => { finished = ok; });
    const browser = spawn(chrome, chromeArgs(url, profile), { stdio: 'ignore' });
    let timeout;
    const timer = new Promise(ok => { timeout = setTimeout(() => ok({ ok: false, error: `délai dépassé (${options.timeout} s)` }), options.timeout * 1000); });
    const result = await Promise.race([done, timer]);
    clearTimeout(timeout);
    kill(browser);
    await new Promise(ok => setTimeout(ok, 300));
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    results.push({ id: shot.id, ...result });
    if (!result.ok) {
      console.log(`✗ ${shot.id} : ${result.error}`);
      continue;
    }
    const m = result.manifest;
    const key = m.keyTime === null ? '' : ` · moment clé à ${m.keyTime.toFixed(2)} s`;
    const t = m.timing ? ` (ms/image : dessin ${m.timing.draw}, lecture ${m.timing.read}, envoi ${m.timing.send})` : '';
    console.log(`✓ ${m.id} : ${m.frames} images (${m.duration.toFixed(2)} s)${key} · capturé en ${m.captureSeconds.toFixed(1)} s${t}`);
    for (const w of m.qc.warnings) console.log(`   ⚠ ${w}`);
  }
  recorder.server.close();
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(results.map(r => ({
    id: r.id, ok: r.ok, error: r.error, manifest: r.ok ? join(outDir, r.id, 'manifest.json') : null,
  })), null, 2));
  return results.every(r => r.ok) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
