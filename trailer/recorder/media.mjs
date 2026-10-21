// Commandes ffmpeg et contrôle qualité des prises (fonctions pures, testées sans ffmpeg).
import { existsSync } from 'node:fs';

// Police pour les incrustations (planche contact, animatique) ; ffmpeg prend sa police par défaut sinon.
export const FONT = ['C:/Windows/Fonts/arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(path => existsSync(path)) ?? null;

// Chemin de police dans un filtre ffmpeg (« : » du lecteur Windows échappé).
export function fontOption(font = FONT) {
  return font ? `fontfile='${font.replace(/\\/g, '/').replace(/:/g, '\\:')}':` : '';
}

// Texte dans drawtext : apostrophe typographique (évite les guillemets), « : », « % » et « \ » échappés.
export function drawtextEscape(text) {
  return String(text).replace(/\\/g, '\\\\\\\\').replace(/'/g, '’').replace(/:/g, '\\:').replace(/%/g, '\\%');
}

// RGB -> YUV en BT.709 (plage vidéo), et balises de couleur cohérentes dans le fichier.
const TO_709 = 'scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
const TAGS_709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];

// Encodage d'une prise depuis les images RGBA brutes reçues sur l'entrée standard.
// draft : H.264 4:2:0 seul (rapide) ; final : maître ProRes 4444 (4:4:4, 10 bits) + H.264 4:2:0.
export function encodeArgs({ width, height, fps = 60, mode = 'draft', delivery, master }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0'];
  if (mode === 'final') {
    args.push('-map', '0:v', '-vf', `${TO_709},format=yuv444p10le`, '-c:v', 'prores_ks', '-profile:v', '4444',
      '-vendor', 'apl0', ...TAGS_709, master);
  }
  args.push('-map', '0:v', '-vf', `${TO_709},format=yuv420p`, '-c:v', 'libx264',
    '-preset', mode === 'final' ? 'slow' : 'veryfast', '-crf', mode === 'final' ? '16' : '20',
    '-profile:v', 'high', '-movflags', '+faststart', ...TAGS_709, delivery);
  return args;
}

// Image fixe (PNG) depuis une image RGBA brute.
export function stillArgs({ width, height, out }) {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`,
    '-i', 'pipe:0', '-frames:v', '1', out];
}

// Planche contact : count images régulièrement espacées, temps incrusté, en grille.
export function contactSheetArgs({ input, frames, out, count = 12, columns = 4, width = 480 }) {
  const every = Math.max(1, Math.floor(frames / count));
  const rows = Math.ceil(count / columns);
  const label = `drawtext=${fontOption()}text='%{pts\\:hms}  #%{eif\\:n*${every}\\:d}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4`;
  const vf = `select='not(mod(n\\,${every}))',scale=${width}:-2,${label},tile=${columns}x${rows}:padding=4:color=black`;
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', vf, '-frames:v', '1', '-fps_mode', 'vfr', out];
}

// Détection des images noires et figées (sortie de ffmpeg en niveau info, à lire avec parseDetect).
export function detectArgs({ input, freeze = 1 }) {
  return ['-hide_banner', '-nostats', '-i', input, '-vf', `blackdetect=d=0.1:pix_th=0.10,freezedetect=n=0.001:d=${freeze}`,
    '-an', '-f', 'null', '-'];
}

export function parseDetect(log) {
  const black = [...log.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
    .map(m => ({ start: Number(m[1]), end: Number(m[2]), duration: Number(m[3]) }));
  const freeze = [];
  for (const m of log.matchAll(/freeze_(start|duration|end): ([\d.]+)/g)) {
    if (m[1] === 'start') freeze.push({ start: Number(m[2]) });
    else if (freeze.length) freeze[freeze.length - 1][m[1]] = Number(m[2]);
  }
  return { black, freeze };
}

// Images flash : une image dont la luminosité saute d'au moins threshold par rapport à ses deux
// voisines, dans le même sens (pic isolé). La première image blanche est vérifiée à part.
export function flashFrames(luma, threshold = 40) {
  const flashes = [];
  for (let i = 1; i < luma.length - 1; i++) {
    const a = luma[i] - luma[i - 1];
    const b = luma[i] - luma[i + 1];
    if (Math.abs(a) >= threshold && Math.abs(b) >= threshold && Math.sign(a) === Math.sign(b)) flashes.push(i);
  }
  return flashes;
}

// Suites d'images consécutives -> intervalles [{ from, to }].
export function ranges(frames) {
  const out = [];
  for (const f of [...frames].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && f === last.to + 1) last.to = f;
    else out.push({ from: f, to: f });
  }
  return out;
}

// Bilan qualité d'une prise : relevés de la page + détections ffmpeg. warnings vide : prise propre.
export function qualityReport({ luma = [], offscreen = [], detect = { black: [], freeze: [] }, keyFrame = null, expectKey = false, fps = 60 }) {
  const flashes = flashFrames(luma);
  const off = ranges(offscreen.map(o => o.frame)).map(r => ({
    ...r, roles: [...new Set(offscreen.filter(o => o.frame >= r.from && o.frame <= r.to).flatMap(o => o.roles))],
  }));
  const warnings = [];
  if (luma.length && luma[0] > 230) warnings.push('première image presque blanche : la couper au montage');
  for (const f of flashes) warnings.push(`image flash ${f} (${(f / fps).toFixed(2)} s)`);
  for (const b of detect.black) warnings.push(`noir de ${b.start.toFixed(2)} à ${b.end.toFixed(2)} s`);
  for (const z of detect.freeze) warnings.push(`image figée de ${z.start.toFixed(2)} s pendant ${(z.duration ?? 0).toFixed(2)} s`);
  for (const r of off) warnings.push(`hors champ (${r.roles.join(', ')}) images ${r.from} à ${r.to}`);
  if (expectKey && keyFrame === null) warnings.push('moment clé absent de la prise');
  return { ok: warnings.length === 0, warnings, flashes, offscreen: off, black: detect.black, freeze: detect.freeze };
}
