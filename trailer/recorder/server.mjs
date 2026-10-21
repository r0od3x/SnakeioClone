// Enregistreur local : sert le jeu en HTTP et reçoit les images de la page en capture
// (trailer/capture.js). Les images RGBA brutes partent directement dans ffmpeg (aucun fichier
// image intermédiaire). En fin de prise : image du moment clé (PNG), planche contact, détection
// des noirs et images figées, bilan qualité et manifest.json, dans <outDir>/<id du plan>/.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { contactSheetArgs, detectArgs, encodeArgs, parseDetect, qualityReport, stillArgs } from './media.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function run(command, args, input = null) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let log = '';
    child.stderr.on('data', chunk => { log += chunk; });
    child.on('error', fail);
    child.on('close', code => (code === 0 ? done(log) : fail(new Error(`${command} a échoué (${code}) : ${log.slice(-800)}`))));
    child.stdin.end(input ?? undefined);
  });
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function reply(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

// root : dossier du jeu servi ; outDir : dossier des prises ; onTake(résultat) à chaque fin de prise.
export function createRecorder({ root, outDir, ffmpeg = 'ffmpeg', onTake = () => {}, log = () => {} }) {
  const base = resolve(root);
  let take = null;

  function serveFile(req, res) {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(base, path === '/' ? 'index.html' : path));
    if (file !== base && !file.startsWith(base + sep)) return reply(res, 403, { error: 'interdit' });
    let stat;
    try {
      stat = statSync(file);
    } catch {
      return reply(res, 404, { error: `introuvable : ${path}` });
    }
    if (!stat.isFile()) return reply(res, 404, { error: `introuvable : ${path}` });
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  }

  async function start(info) {
    if (take) throw new Error(`prise ${take.id} déjà en cours`);
    const dir = join(outDir, info.id);
    mkdirSync(dir, { recursive: true });
    const files = { delivery: join(dir, `${info.id}.mp4`) };
    if (info.mode === 'final') files.master = join(dir, `${info.id}-master.mov`);
    const encoder = spawn(ffmpeg, encodeArgs({ ...info, ...files }), { stdio: ['pipe', 'ignore', 'pipe'] });
    let errors = '';
    encoder.stderr.on('data', chunk => { errors += chunk; });
    const closed = once(encoder, 'close');
    take = { ...info, dir, files, encoder, closed, errors: () => errors, received: 0, still: null, started: Date.now() };
    log(`● ${info.id} : ${info.width} × ${info.height}, ${info.frames} images (${info.mode})`);
  }

  async function frame(data, key) {
    if (!take) throw new Error('aucune prise en cours');
    const expected = take.width * take.height * 4;
    if (data.length !== expected) throw new Error(`image de ${data.length} octets, ${expected} attendus`);
    if (key) take.still = data;
    if (!take.encoder.stdin.write(data)) await once(take.encoder.stdin, 'drain');
    take.received++;
  }

  async function end(report) {
    if (!take) throw new Error('aucune prise en cours');
    const t = take;
    take = null;
    t.encoder.stdin.end();
    const [code] = await t.closed;
    if (code !== 0) throw new Error(`ffmpeg a échoué (${code}) : ${t.errors().slice(-800)}`);
    const files = { ...t.files };
    if (t.still) {
      files.still = join(t.dir, `${t.id}-key.png`);
      await run(ffmpeg, stillArgs({ width: t.width, height: t.height, out: files.still }), t.still);
    }
    files.sheet = join(t.dir, `${t.id}-sheet.jpg`);
    await run(ffmpeg, contactSheetArgs({ input: files.delivery, frames: t.received, out: files.sheet }));
    const detect = parseDetect(await run(ffmpeg, detectArgs({ input: files.delivery })));
    const qc = qualityReport({ ...report, detect, expectKey: Boolean(report.plan?.keyStep !== null && report.plan?.keyStep !== undefined), fps: t.fps });
    const manifest = {
      id: t.id, mode: t.mode, width: t.width, height: t.height, fps: t.fps, frames: t.received,
      letterbox: Boolean(report.plan?.letterbox),
      duration: t.received / t.fps, keyFrame: report.keyFrame, keyTime: report.keyFrame === null ? null : report.keyFrame / t.fps,
      plan: report.plan, files, events: report.events, sfx: report.sfx, qc, timing: report.timing ?? null,
      captureSeconds: (Date.now() - t.started) / 1000, createdAt: new Date().toISOString(),
    };
    writeFileSync(join(t.dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(t.dir, 'qc.json'), JSON.stringify({ ...qc, luma: report.luma }, null, 2));
    onTake({ ok: true, manifest });
    return manifest;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET') return serveFile(req, res);
      if (req.method !== 'POST') return reply(res, 405, { error: 'méthode' });
      if (url.pathname === '/take/start') {
        await start(JSON.parse(await body(req)));
        return reply(res, 200, { ok: true });
      }
      if (url.pathname === '/take/frame') {
        await frame(await body(req), url.searchParams.get('key') === '1');
        return reply(res, 200, { ok: true });
      }
      if (url.pathname === '/take/end') return reply(res, 200, await end(JSON.parse(await body(req))));
      if (url.pathname === '/take/fail') {
        const message = String(await body(req));
        if (take) {
          take.encoder.stdin.destroy();
          take = null;
        }
        onTake({ ok: false, error: message });
        return reply(res, 200, { ok: true });
      }
      return reply(res, 404, { error: 'route inconnue' });
    } catch (error) {
      onTake({ ok: false, error: error.message });
      return reply(res, 500, { error: error.message });
    }
  });

  return { server, get busy() { return Boolean(take); } };
}
