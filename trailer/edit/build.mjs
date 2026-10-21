// Construit le montage depuis trailer/edit/table.mjs et les prises capturées :
//   animatic.mp4 (960 × 540, beats, plans et timecode incrustés), animatic-vertical.mp4 (9:16
//   recadré au centre), timeline.fcpxml (FCPXML 1.8 pour DaVinci Resolve, relue et vérifiée),
//   shotlist.csv. Dans trailer/out/edit/.
//
//   node trailer/edit/build.mjs                 avec les brouillons (trailer/out/draft)
//   node trailer/edit/build.mjs --source final  avec les prises finales (FCPXML sur les maîtres ProRes)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDIT } from './table.mjs';
import { animaticArgs, fcpxml, layout, readBack, shotList } from './timeline.mjs';

const OUT = fileURLToPath(new URL('../out/', import.meta.url));

export function loadClips(dir, ids) {
  const clips = {};
  for (const id of new Set(ids)) {
    const file = join(dir, id, 'manifest.json');
    if (existsSync(file)) clips[id] = JSON.parse(readFileSync(file, 'utf8'));
  }
  return clips;
}

function main(argv) {
  const at = argv.indexOf('--source');
  const source = at >= 0 ? argv[at + 1] : 'draft';
  const clips = loadClips(join(OUT, source), EDIT.rows.filter(r => r.clip).map(r => r.clip));
  const plan = layout(EDIT, clips);
  for (const w of plan.warnings) console.log(`⚠ ${w}`);
  if (plan.errors.length) {
    for (const e of plan.errors) console.log(`✗ ${e}`);
    console.log(`Capturer d'abord les plans : npm run trailer:${source === 'final' ? 'final' : 'draft'}`);
    return 1;
  }
  const dir = join(OUT, 'edit');
  mkdirSync(dir, { recursive: true });
  const files = {
    landscape: join(dir, 'animatic.mp4'), vertical: join(dir, 'animatic-vertical.mp4'),
    fcpxml: join(dir, 'timeline.fcpxml'), csv: join(dir, 'shotlist.csv'), graph: join(dir, 'animatic-filter.txt'),
  };
  const { args, graph } = animaticArgs(plan, files);
  writeFileSync(files.graph, graph);
  const ffmpeg = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (ffmpeg.status !== 0) {
    console.log(`✗ ffmpeg : ${ffmpeg.stderr || ffmpeg.error}`);
    return 1;
  }
  const xml = fcpxml(plan, { title: EDIT.title, project: EDIT.project, source: source === 'final' ? 'master' : 'delivery' });
  writeFileSync(files.fcpxml, xml);
  // BOM UTF-8 : Excel sous Windows lit alors correctement les accents.
  writeFileSync(files.csv, String.fromCharCode(0xfeff) + shotList(plan));
  const check = readBack(readFileSync(files.fcpxml, 'utf8'), url => existsSync(fileURLToPath(url)));
  console.log(`✓ animatique ${(plan.total / plan.fps).toFixed(2)} s, ${plan.rows.length} lignes : ${files.landscape}`);
  console.log(`✓ vertical : ${files.vertical}`);
  console.log(`${check.ok ? '✓' : '✗'} FCPXML 1.8 relue : ${check.clips} plans, ${check.gaps} noirs, ${check.duration.toFixed(2)} s${check.ok ? '' : ` — ${check.problems.join(' ; ')}`}`);
  console.log(`✓ liste des plans : ${files.csv}`);
  return check.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
