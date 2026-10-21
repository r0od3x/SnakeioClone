// Montage à partir d'une table (beat, plan, entrée / sortie en secondes, notes) : vérification,
// positions à l'image près, graphe ffmpeg de l'animatique (paysage + vertical recadré au centre),
// timeline FCPXML 1.8 pour DaVinci Resolve, liste des plans en CSV. Fonctions pures (testées).
import { pathToFileURL } from 'node:url';
import { drawtextEscape, fontOption } from '../recorder/media.mjs';

// Ligne de la table :
//   { beat, clip, in, out, notes }            extrait d'un plan capturé (secondes du plan)
//   { beat, gap: secondes, card?, notes }     noir (carton de texte facultatif, dans l'animatique seulement)
export function frames(seconds, fps) {
  return Math.round(seconds * fps);
}

// Positions à l'image près et problèmes. clips : { id: manifest }. Renvoie { rows, errors, warnings, total }.
export function layout(edit, clips) {
  const fps = edit.fps ?? 60;
  const errors = [];
  const warnings = [];
  let at = 0;
  const rows = edit.rows.map((row, i) => {
    const label = `ligne ${i + 1} (${row.beat ?? '?'})`;
    if (row.gap !== undefined) {
      const length = frames(row.gap, fps);
      if (!(length > 0)) errors.push(`${label} : gap doit durer au moins une image`);
      const out = { ...row, kind: 'gap', start: at, length };
      at += Math.max(0, length);
      return out;
    }
    const clip = clips[row.clip];
    if (!clip) {
      errors.push(`${label} : plan ${row.clip} non capturé`);
      return { ...row, kind: 'clip', start: at, length: 0 };
    }
    const from = frames(row.in, fps);
    const to = frames(row.out, fps);
    if (!(from >= 0 && to > from)) errors.push(`${label} : entrée ${row.in} et sortie ${row.out} invalides`);
    if (to > clip.frames) errors.push(`${label} : sortie ${row.out} s après la fin du plan (${(clip.frames / fps).toFixed(2)} s)`);
    if (clip.fps !== fps) errors.push(`${label} : plan à ${clip.fps} i/s, montage à ${fps} i/s`);
    const out = { ...row, kind: 'clip', manifest: clip, from, to, start: at, length: Math.max(0, to - from) };
    // Contrôle qualité : problèmes de la prise qui tombent dans l'extrait.
    for (const r of clip.qc?.offscreen ?? []) {
      if (r.to >= from && r.from < to) warnings.push(`${label} : ${r.roles.join(', ')} hors champ images ${r.from}-${r.to}`);
    }
    for (const f of clip.qc?.flashes ?? []) if (f >= from && f < to) warnings.push(`${label} : image flash ${f}`);
    if (clip.keyFrame !== null && clip.keyFrame !== undefined && (clip.keyFrame < from || clip.keyFrame >= to)) {
      warnings.push(`${label} : le moment clé (${(clip.keyFrame / fps).toFixed(2)} s) est hors de l'extrait`);
    }
    at += out.length;
    return out;
  });
  if (rows.length && rows[rows.length - 1].kind === 'gap') {
    warnings.push('noir en fin de timeline : la plupart des logiciels l\'ignorent à l\'import (FCPXML), le carton final reste dans l\'animatique seulement');
  }
  return { rows, errors, warnings, total: at, fps };
}

function seconds(framesCount, fps) {
  return framesCount / fps;
}

// Commande ffmpeg de l'animatique : une entrée par extrait, noirs générés, concaténation, puis
// deux sorties : paysage (beat, plan et timecode incrustés) et vertical 9:16 recadré au centre.
export function animaticArgs(plan, { landscape, vertical, width = 960, height = 540, labels = true }) {
  const { rows, fps, total } = plan;
  const inputs = [];
  const parts = [];
  rows.forEach((row, i) => {
    if (row.kind === 'gap') {
      parts.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${seconds(row.length, fps)},format=yuv420p,setsar=1[s${i}]`);
      return;
    }
    const k = inputs.length / 2;
    inputs.push('-i', row.manifest.files.delivery);
    parts.push(`[${k}:v]trim=start_frame=${row.from}:end_frame=${row.to},setpts=PTS-STARTPTS,fps=${fps},`
      + `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p[s${i}]`);
  });
  const font = fontOption();
  const at = row => `enable='between(t\\,${seconds(row.start, fps).toFixed(3)}\\,${(seconds(row.start + row.length, fps) - 1e-3).toFixed(3)})'`;
  // Carton : taille de police bornée pour que le texte tienne dans la largeur (≈ 0,62 em par caractère).
  const card = (r, w, h, share) => {
    const size = Math.floor(Math.min(h * share, (w * 0.88) / (0.62 * Math.max(1, r.card.length))));
    return `drawtext=${font}text='${drawtextEscape(r.card)}':fontsize=${size}:fontcolor=white:x=(w-tw)/2:y=(h-th)/2:${at(r)}`;
  };
  const cards = rows.filter(r => r.card).map(r => card(r, width, height, 1 / 9));
  const beatLabels = labels ? rows.map(r => {
    const what = r.kind === 'gap' ? 'noir' : `${r.clip} ${r.in.toFixed(2)}-${r.out.toFixed(2)} s`;
    return `drawtext=${font}text='${drawtextEscape(`${r.beat} · ${what}`)}':fontsize=H/28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:x=16:y=h-th-16:${at(r)}`;
  }) : [];
  const timecode = labels ? [`drawtext=${font}timecode='00\\:00\\:00\\:00':rate=${fps}:fontsize=H/28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:x=w-tw-16:y=16`] : [];
  // Vertical : bande centrale 9:16 de l'image paysage, agrandie en 540 × 960. Si tous les plans ont
  // des bandes noires 2,39:1, on recadre dans l'image utile (sinon le vertical serait à moitié noir).
  const clipRows = rows.filter(r => r.kind === 'clip');
  const boxed = clipRows.length > 0 && clipRows.every(r => r.manifest.letterbox);
  const vh = boxed ? Math.round(width / 2.39 / 2) * 2 : height;
  const vw = Math.round(vh * 9 / 16 / 2) * 2;
  const verticalCards = rows.filter(r => r.card).map(r => card(r, 540, 960, 1 / 16));
  const verticalLabels = labels ? rows.map(r => `drawtext=${font}text='${drawtextEscape(r.beat)}':fontsize=H/40:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6:x=(w-tw)/2:y=h-th-24:${at(r)}`) : [];
  const graph = [
    ...parts,
    `${rows.map((_, i) => `[s${i}]`).join('')}concat=n=${rows.length}:v=1:a=0,split=2[clean_l][clean_v]`,
    `[clean_l]${[...cards, ...beatLabels, ...timecode].join(',') || 'null'}[landscape]`,
    `[clean_v]crop=${vw}:${vh}:(iw-${vw})/2:(ih-${vh})/2,scale=540:960,setsar=1`
      + `${[...verticalCards, ...verticalLabels].map(f => `,${f}`).join('')}[vertical]`,
  ].join(';\n');
  const encode = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart'];
  return {
    args: ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph,
      '-map', '[landscape]', ...encode, '-frames:v', String(total), landscape,
      '-map', '[vertical]', ...encode, '-frames:v', String(total), vertical],
    graph,
  };
}

function xml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Timeline FCPXML 1.8 (src d'asset en file:/// absolu ; media-rep de la 1.9 n'est pas lu partout).
// source : 'delivery' (H.264) ou 'master' (ProRes 4444, captures finales). Marqueur au moment clé.
export function fcpxml(plan, { title = 'Bande-annonce', project = 'Animatique', source = 'delivery' } = {}) {
  const { rows, fps, total } = plan;
  const t = n => `${n}/${fps}s`;
  const clips = rows.filter(r => r.kind === 'clip');
  const first = clips[0]?.manifest;
  const width = first?.width ?? 1920;
  const height = first?.height ?? 1080;
  const formatName = width === 1920 && height === 1080 && fps === 60 ? ' name="FFVideoFormat1080p60"' : '';
  const assets = [];
  const ids = new Map();
  for (const row of clips) {
    if (ids.has(row.clip)) continue;
    const id = `r${ids.size + 2}`;
    ids.set(row.clip, id);
    const file = row.manifest.files[source] ?? row.manifest.files.delivery;
    assets.push(`    <asset id="${id}" name="${xml(row.clip)}" src="${pathToFileURL(file).href}" start="0s" duration="${t(row.manifest.frames)}" hasVideo="1" format="r1" videoSources="1"/>`);
  }
  const spine = rows.map(row => {
    if (row.kind === 'gap') return `            <gap name="${xml(row.card ?? row.beat ?? 'Noir')}" offset="${t(row.start)}" start="3600s" duration="${t(row.length)}"/>`;
    const key = row.manifest.keyFrame;
    const marker = key !== null && key !== undefined && key >= row.from && key < row.to
      ? `\n              <marker start="${t(key)}" duration="${t(1)}" value="Moment clé"/>` : '';
    const note = row.notes ? `\n              <note>${xml(row.notes)}</note>` : '';
    return `            <asset-clip ref="${ids.get(row.clip)}" name="${xml(`${row.beat} · ${row.clip}`)}" offset="${t(row.start)}" start="${t(row.from)}" duration="${t(row.length)}" format="r1" tcFormat="NDF">${note}${marker}\n            </asset-clip>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.8">',
    '  <resources>',
    `    <format id="r1"${formatName} frameDuration="1/${fps}s" width="${width}" height="${height}"/>`,
    ...assets,
    '  </resources>',
    '  <library>',
    `    <event name="${xml(title)}">`,
    `      <project name="${xml(project)}">`,
    `        <sequence format="r1" duration="${t(total)}" tcStart="0s" tcFormat="NDF">`,
    '          <spine>',
    ...spine,
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    '',
  ].join('\n');
}

// Relecture d'une FCPXML produite ici : références, fichiers, continuité des positions, durée.
export function readBack(text, exists = () => true) {
  const attrs = tag => Object.fromEntries([...tag.matchAll(/(\w[\w-]*)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const time = value => {
    const m = /^(\d+)(?:\/(\d+))?s$/.exec(value ?? '');
    return m ? Number(m[1]) / Number(m[2] ?? 1) : NaN;
  };
  const problems = [];
  const version = /<fcpxml version="([^"]+)"/.exec(text)?.[1];
  if (version !== '1.8') problems.push(`version ${version}`);
  const assets = new Map([...text.matchAll(/<asset\s([^>]*)\/>/g)].map(m => attrs(m[1])).map(a => [a.id, a]));
  for (const a of assets.values()) {
    if (!a.src?.startsWith('file:///')) problems.push(`asset ${a.id} : src non absolu`);
    else if (!exists(new URL(a.src))) problems.push(`asset ${a.id} : fichier absent`);
  }
  const items = [...text.matchAll(/<(asset-clip|gap)\s([^>]*?)\/?>/g)].map(m => ({ kind: m[1], ...attrs(m[2]) }));
  let at = 0;
  for (const item of items) {
    if (item.kind === 'asset-clip' && !assets.has(item.ref)) problems.push(`clip ${item.name} : ref ${item.ref} inconnue`);
    if (Math.abs(time(item.offset) - at) > 1e-9) problems.push(`${item.name} : position ${item.offset} attendue ${at}`);
    at += time(item.duration);
  }
  const sequence = attrs(/<sequence\s([^>]*)>/.exec(text)?.[1] ?? '');
  if (Math.abs(time(sequence.duration) - at) > 1e-9) problems.push(`durée de séquence ${sequence.duration}, somme ${at}`);
  return { ok: problems.length === 0, problems, clips: items.filter(i => i.kind === 'asset-clip').length, gaps: items.filter(i => i.kind === 'gap').length, duration: at };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function timecode(framesCount, fps) {
  const total = Math.max(0, framesCount);
  const f = total % fps;
  const s = Math.floor(total / fps);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

export function shotList(plan) {
  const { rows, fps } = plan;
  const header = ['n', 'beat', 'plan', 'entree_s', 'sortie_s', 'duree_s', 'tc_debut', 'tc_fin', 'moment_cle_s', 'carton', 'notes'];
  const lines = rows.map((row, i) => {
    const key = row.kind === 'clip' && row.manifest.keyFrame !== null && row.manifest.keyFrame >= row.from && row.manifest.keyFrame < row.to
      ? (row.manifest.keyFrame / fps).toFixed(3) : '';
    return [i + 1, row.beat, row.kind === 'gap' ? 'noir' : row.clip, row.kind === 'gap' ? '' : row.in, row.kind === 'gap' ? '' : row.out,
      (row.length / fps).toFixed(3), timecode(row.start, fps), timecode(row.start + row.length, fps), key, row.card ?? '', row.notes ?? ''];
  });
  return [header, ...lines].map(line => line.map(csvCell).join(',')).join('\n') + '\n';
}
