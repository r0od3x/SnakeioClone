// One command for the whole Snake.io animatic (Node 18+, ffmpeg and Chrome). From 9-SnakeIO:
//
//   npm run trailer:animatic                         what changed: clips, stills, audio, videos, docs
//   npm run trailer:animatic -- --capture            film the takes first (Trailer Studio, 1080p)
//   npm run trailer:animatic -- --capture --only-takes hunt,eliminated
//   npm run trailer:animatic -- --clips              cut every clip again
//   npm run trailer:animatic -- --no-video           stills and docs only
//
// Everything comes from trailer.config.mjs (timing, text, footage, sound). The footage comes from
// takes/<id>/ : shots of trailer/shots.js filmed frame by frame by trailer/recorder/capture.mjs.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderAudio } from './lib/audio.mjs';
import { checkCuts, cutClips } from './lib/clips.mjs';
import { writeDocs } from './lib/docs.mjs';
import { renderFrames } from './lib/frames.mjs';
import { check, timeline, timecode } from './lib/timeline.mjs';
import { renderVideo } from './lib/video.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME = join(ROOT, '..');

// Films the takes used by the animatic (or the ones listed) with the game's capture tool.
function capture(cfg, list) {
  const takes = list ?? [...new Set(cfg.shots.filter(s => s.clip).map(s => s.clip.take))];
  console.log(`capture: ${takes.join(', ')}`);
  const r = spawnSync(process.execPath, [join(GAME, 'trailer', 'recorder', 'capture.mjs'), '--size', '1080p',
    '--out', join(ROOT, cfg.takesDir), '--timeout', '900', ...takes], { stdio: 'inherit' });
  return r.status === 0;
}

async function main(argv) {
  const value = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // Fresh import each run (no stale module cache).
  const { TRAILER: cfg } = await import(`${pathToFileURL(join(ROOT, 'trailer.config.mjs')).href}?t=${Date.now()}`);
  const shots = timeline(cfg);
  const { errors, warnings } = check(cfg, shots);
  if (argv.includes('--capture') && !capture(cfg, value('--only-takes')?.split(','))) return 1;
  const takesDir = join(ROOT, cfg.takesDir);
  const cuts = checkCuts(shots, takesDir);
  for (const w of [...warnings, ...cuts.warnings]) console.log(`⚠ ${w}`);
  if (errors.length || cuts.errors.length) {
    for (const e of [...errors, ...cuts.errors]) console.log(`✗ ${e}`);
    return 1;
  }
  console.log(`${cfg.title}: ${shots.length} shots, ${timecode(shots.at(-1).end, cfg.fps)} at ${cfg.bpm} BPM`);
  const clipsDir = join(ROOT, 'clips');
  const framesDir = join(ROOT, 'frames');
  const tmp = join(ROOT, '.build');
  mkdirSync(tmp, { recursive: true });
  const cut = cutClips(cfg, shots, { takesDir, outDir: clipsDir, force: argv.includes('--clips') });
  console.log(`clips: ${cut} cut`);
  const { rendered, failures } = await renderFrames(cfg, shots, { root: ROOT, outDir: framesDir, clipsDir });
  console.log(`stills: ${rendered} rendered${failures.length ? `, ${failures.length} failed` : ''}`);
  for (const f of failures) console.log(`✗ ${f}`);
  if (failures.length) return 1;
  if (!argv.includes('--no-video')) {
    const audio = join(tmp, 'audio.wav');
    renderAudio(cfg, shots, audio);
    console.log('audio: temp music and sound cues');
    const files = renderVideo(cfg, shots, { framesDir, clipsDir, outDir: ROOT, tmp, audio });
    console.log(`video: ${files.labelled}\n       ${files.clean}`);
  }
  writeDocs(cfg, shots, { outDir: ROOT, framesDir });
  console.log('docs: TRAILER_SCRIPT.md, shotlist.csv, storyboard.html');
  return 0;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
  console.error(error.message);
  process.exitCode = 1;
});
