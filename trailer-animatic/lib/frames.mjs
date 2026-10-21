// Storyboard stills: the middle frame of each gameplay clip (clips/), and title cards rendered
// at 1920 × 1080 by headless Chrome from cards/card.html. Cards are re-rendered only when their
// text or the card page changes (frames/.cache.json).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function chromePath(env = process.env) {
  return [env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find(p => p && existsSync(p)) ?? null;
}

export function cardUrl(card, root) {
  const page = pathToFileURL(join(root, 'cards', 'card.html')).href;
  return `${page}?${new URLSearchParams(Object.entries(card).map(([k, v]) => [k, String(v)]))}`;
}

function capture(chrome, url, out, profile) {
  return new Promise(resolve => {
    const args = ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
      '--allow-file-access-from-files', '--window-size=1920,1080', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--mute-audio', '--virtual-time-budget=8000', `--screenshot=${out}`, '--dump-dom', url];
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let dom = '';
    child.stdout.on('data', chunk => { dom += chunk; });
    const timer = setTimeout(() => child.kill(), 90_000);
    child.on('close', () => {
      clearTimeout(timer);
      const title = /<title>([^<]*)<\/title>/.exec(dom)?.[1] ?? '';
      resolve({ ok: title === 'card:ready' && existsSync(out), title });
    });
  });
}

// Middle frame of a clip, as PNG.
function still(clip, out, seconds) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', seconds.toFixed(3), '-i', clip, '-frames:v', '1', out], { encoding: 'utf8' });
  return r.status === 0;
}

export async function renderFrames(cfg, shots, { root, outDir, clipsDir, force = false, log = console.log }) {
  mkdirSync(outDir, { recursive: true });
  const cacheFile = join(outDir, '.cache.json');
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const cardVersion = String(statSync(join(root, 'cards', 'card.html')).mtimeMs);
  const failures = [];
  let rendered = 0;
  const chrome = chromePath();
  const profile = mkdtempSync(join(tmpdir(), 'snake-animatic-card-'));
  try {
    for (const shot of shots) {
      const frame = shot.frames[0];
      const out = join(outDir, frame.file);
      if (shot.card) {
        if (!chrome) throw new Error('Chrome not found: set CHROME_PATH');
        const url = cardUrl(shot.card, root);
        const key = createHash('sha1').update(url + cardVersion).digest('hex');
        if (!force && cache[frame.file] === key && existsSync(out)) continue;
        const result = await capture(chrome, url, out, profile);
        if (result.ok) {
          cache[frame.file] = key;
          rendered++;
          log(`  card ${frame.file}`);
        } else {
          failures.push(`${frame.file}: ${result.title || 'no answer from the card page'}`);
        }
      } else {
        const clip = join(clipsDir, `${shot.number}_${shot.slug}.mp4`);
        const key = String(statSync(clip).mtimeMs);
        if (!force && cache[frame.file] === key && existsSync(out)) continue;
        if (still(clip, out, shot.duration / 2)) {
          cache[frame.file] = key;
          rendered++;
        } else {
          failures.push(`${frame.file}: could not read ${clip}`);
        }
      }
    }
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  return { rendered, failures };
}
