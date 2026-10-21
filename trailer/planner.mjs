// Planificateur (Node, sans navigateur) : pour chaque plan à moment clé de trailer/shots.js,
// répète la prise à blanc avec la graine du plan, puis les suivantes, jusqu'à ce que l'action
// arrive vraiment (les IA décident seules). Écrit trailer/plan.js (graine, pas du moment clé,
// empreinte du plan) que le studio relit, et affiche une carte ASCII de l'arène au moment clé.
//
//   node trailer/planner.mjs                 tous les plans à moment clé
//   node trailer/planner.mjs near-miss       un plan
//   options : --tries 40 (graines essayées), --no-map
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load, TRAILER } from '../tests/harness.mjs';

export const PLAN_FILE = new URL('./plan.js', import.meta.url);

// Cherche une graine où le moment clé arrive, avec assez de temps avant lui pour garder pre
// secondes ; à défaut, la première graine où il arrive. Renvoie { seed, step, signature, event, run }.
export function planShot(game, shot, { tries = 40 } = {}) {
  const { KeyMoment, Director } = game;
  const { pre, search } = KeyMoment.options(shot);
  const first = shot.setup?.seed ?? Director.DEFAULTS.seed;
  const lead = Math.round(pre * KeyMoment.STEPS_PER_SECOND);
  let fallback = null;
  for (let seed = first; seed < first + tries; seed++) {
    const setup = { ...KeyMoment.STUDIO_FLAGS, ...(shot.setup ?? {}), seed };
    const found = KeyMoment.find(setup, shot.key, search * KeyMoment.STEPS_PER_SECOND);
    if (!found) continue;
    const entry = { seed, step: found.step, signature: KeyMoment.signature(shot), event: found.event, run: found.run };
    if (found.step >= lead || Number.isFinite(shot.key.step)) return entry;
    fallback ??= entry;
  }
  return fallback;
}

// Plan déjà écrit (les plans non replanifiés sont gardés).
export function readPlan(file = PLAN_FILE) {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8');
  const json = text.slice(text.indexOf('=') + 1, text.lastIndexOf(';'));
  return json.trim() ? JSON.parse(json) : {};
}

export function planFile(plan) {
  return [
    '// Généré par trailer/planner.mjs (npm run trailer:plan) : ne pas modifier à la main.',
    '// Pour chaque plan à moment clé : graine retenue, pas de jeu du moment clé, empreinte du plan.',
    `const TrailerPlan = ${JSON.stringify(plan, null, 2)};`,
    '',
  ].join('\n');
}

function main(argv) {
  const ids = argv.filter(a => !a.startsWith('--'));
  const triesAt = argv.indexOf('--tries');
  const tries = triesAt >= 0 ? Number(argv[triesAt + 1]) : 40;
  const game = load(1920, 1080, TRAILER);
  const shots = game.TrailerShots.filter(s => game.KeyMoment.hasKey(s) && (!ids.length || ids.includes(s.id)));
  if (!shots.length) {
    console.log('Aucun plan à moment clé à planifier.');
    return 0;
  }
  const plan = readPlan();
  for (const id of Object.keys(plan)) if (!game.TrailerShots.some(s => s.id === id)) delete plan[id];
  let failures = 0;
  for (const shot of shots) {
    const started = Date.now();
    const entry = planShot(game, shot, { tries });
    if (!entry) {
      failures++;
      delete plan[shot.id];
      console.log(`✗ ${shot.id} : ${JSON.stringify(shot.key)} n'arrive avec aucune graine de ${shot.setup?.seed ?? 1} à ${(shot.setup?.seed ?? 1) + tries - 1}`);
      continue;
    }
    const { run, ...stored } = entry;
    plan[shot.id] = stored;
    const { pre } = game.KeyMoment.options(shot);
    const short = entry.step < pre * 60 && !Number.isFinite(shot.key.step) ? ` (seulement ${(entry.step / 60).toFixed(2)} s avant)` : '';
    console.log(`✓ ${shot.id} : graine ${entry.seed}, moment clé ${entry.event.type} au pas ${entry.step} (${(entry.step / 60).toFixed(2)} s)${short} · ${Date.now() - started} ms`);
    if (run && !argv.includes('--no-map')) {
      const at = Number.isFinite(entry.event.x) ? { x: entry.event.x, y: entry.event.y } : run.focus;
      console.log(game.KeyMoment.asciiMap(run.state, at, { span: 1400 }));
      console.log('');
    }
  }
  writeFileSync(PLAN_FILE, planFile(plan));
  console.log(`trailer/plan.js : ${Object.keys(plan).length} plan(s) à moment clé`);
  return failures ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
