// Gameplay clips: every shot with a `clip` is cut from a take captured frame by frame by the
// game's Trailer Studio (trailer/recorder/capture.mjs, 1080p, 60 fps, see takes/<id>/).
//   clip: { take: '<shot id in trailer/shots.js>', at: s }        from `at` seconds into the take
//   clip: { take, fromKey: s }                                    relative to the take's key moment
//   clip: { ..., speed: 0.5 }                                     extra slow motion (or > 1: faster)
// A clip is cut again only when its plan or its take changes (clips/.cache.json).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function readTake(takesDir, id) {
  const file = join(takesDir, id, 'manifest.json');
  if (!existsSync(file)) return null;
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const video = join(takesDir, id, `${id}.mp4`);
  return existsSync(video) ? { ...manifest, video } : null;
}

// Where the shot's cut starts in the take, and how many take seconds it uses.
export function cutOf(shot, take) {
  const speed = shot.clip.speed ?? 1;
  const keyTime = take.keyTime ?? 0;
  const start = shot.clip.fromKey !== undefined ? keyTime + shot.clip.fromKey : shot.clip.at;
  return { start, length: shot.duration * speed, speed };
}

// Takes that are missing, or too short for the cuts asked of them.
export function checkCuts(shots, takesDir) {
  const errors = [];
  const warnings = [];
  for (const shot of shots.filter(s => s.clip)) {
    const take = readTake(takesDir, shot.clip.take);
    if (!take) {
      errors.push(`shot ${shot.number} (${shot.slug}): take ${shot.clip.take} not captured (npm run trailer:animatic -- --capture)`);
      continue;
    }
    const { start, length } = cutOf(shot, take);
    if (shot.clip.fromKey !== undefined && take.keyTime === null) errors.push(`shot ${shot.number}: take ${take.id} has no key moment`);
    if (start < 0) errors.push(`shot ${shot.number} (${shot.slug}): starts ${(-start).toFixed(2)} s before take ${take.id}`);
    if (start + length > take.duration + 1e-6) {
      errors.push(`shot ${shot.number} (${shot.slug}): needs ${(start + length).toFixed(2)} s of take ${take.id}, which lasts ${take.duration.toFixed(2)} s`);
    }
    if (take.width !== 1920 || take.height !== 1080) warnings.push(`take ${take.id} is ${take.width} × ${take.height} (expected 1920 × 1080)`);
  }
  return { errors, warnings };
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr || r.error}`);
}

export function cutClips(cfg, shots, { takesDir, outDir, force = false, only = null, log = console.log }) {
  mkdirSync(outDir, { recursive: true });
  const cacheFile = join(outDir, '.cache.json');
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  let cut = 0;
  for (const shot of shots.filter(s => s.clip)) {
    const take = readTake(takesDir, shot.clip.take);
    const { start, length, speed } = cutOf(shot, take);
    const file = `${shot.number}_${shot.slug}.mp4`;
    const out = join(outDir, file);
    const key = createHash('sha1').update(JSON.stringify({ start, length, speed, fps: cfg.fps, w: cfg.width, take: statSync(take.video).mtimeMs })).digest('hex');
    const wanted = only ? only.includes(shot.number) || only.includes(shot.slug) : force || cache[file] !== key || !existsSync(out);
    if (!wanted) continue;
    // Accurate seek (after -i), speed change, resample to the animatic's frame rate and size.
    ffmpeg(['-i', take.video, '-ss', start.toFixed(4), '-t', length.toFixed(4),
      '-vf', `setpts=(PTS-STARTPTS)/${speed},fps=${cfg.fps},scale=${cfg.width}:${cfg.height}:flags=lanczos,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-r', String(cfg.fps), out]);
    cache[file] = key;
    cut++;
    log(`  clip ${file} ← ${take.id} ${start.toFixed(2)}–${(start + length).toFixed(2)} s${speed !== 1 ? ` × ${speed}` : ''}`);
  }
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  return cut;
}
