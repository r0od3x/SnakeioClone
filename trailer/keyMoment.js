// Moment clé d'un plan : on cale la prise autour d'un événement (élimination, frôlement,
// encerclement) ou d'un pas de jeu fixe, au lieu de partir du début de la partie.
// La simulation est déterministe (graine + réglage) : une répétition à blanc trouve le pas où
// l'événement arrive, puis la prise démarre pre secondes plus tôt (pas simulés sans image).
// Utilisé par le studio (page) et par le planificateur (trailer/planner.mjs, Node).
//
// Champs d'un plan :
//   key   { event: 'kill' | 'nearMiss' | 'encircle', role?, killer? } ou { step: n }
//         role : l'acteur concerné (la victime d'une élimination, l'un des deux serpents sinon) ;
//         killer : l'élimination doit être faite par cet acteur
//   pre   secondes gardées avant le moment clé (défaut 2)
//   post  secondes gardées après (défaut 3) ; duration absente : pre + post
//   fromKey (dans camera.keys, cues, time) : instant relatif au moment clé, en secondes
//         (négatif avant). Converti en t = pre + fromKey.
//   search secondes de jeu fouillées par la répétition à blanc (défaut 30)
//   La caméra peut viser le lieu du moment clé : target: 'key' (images-clés, suivi, cues cut).
const KeyMoment = (() => {
  const STEPS_PER_SECOND = 60;
  const DEFAULTS = { pre: 2, post: 3, search: 30 };

  // Réglages de tournage par défaut du studio (joueur invincible et piloté par l'IA).
  const STUDIO_FLAGS = { invincible: true, autopilot: true };

  function hasKey(shot) {
    return Boolean(shot?.key);
  }

  // Empreinte d'un plan à moment clé (réglage complet + clé) : le studio n'utilise une entrée de
  // plan.js que si l'empreinte est la même, sinon le plan a changé depuis le planificateur.
  function signature(shot, flags = STUDIO_FLAGS) {
    return JSON.stringify({ setup: { invincible: flags.invincible, autopilot: flags.autopilot, ...(shot.setup ?? {}) }, key: shot.key });
  }

  // L'événement correspond-il au moment clé ? Élimination : role = la victime, killer = le tueur.
  // Frôlement, encerclement : role = l'un des deux serpents.
  function matches(run, event, key) {
    if (event.type !== key.event) return false;
    if (key.killer) {
      const killer = Director.resolve(run, key.killer);
      if (!killer || event.type !== 'kill' || event.killer !== killer.name) return false;
    }
    if (!key.role) return true;
    const actor = Director.resolve(run, key.role);
    if (!actor) return false;
    if (event.type === 'kill') return event.victim === actor;
    return (event.actors ?? []).includes(actor);
  }

  // Répétition à blanc : pas de jeu (après le warmup du réglage) où le moment clé arrive.
  // Renvoie { step, event: { type, x, y } } ou null s'il n'arrive pas dans maxSteps pas.
  function find(setup, key, maxSteps = DEFAULTS.search * STEPS_PER_SECOND, profile = {}) {
    if (Number.isFinite(key.step)) return { step: Math.max(0, Math.round(key.step)), event: { type: 'step' } };
    const run = Director.newRun(setup, profile);
    const det = EventDetector.create();
    for (let step = 1; step <= maxSteps; step++) {
      const before = EventDetector.snapshot(run.state);
      Director.step(run);
      const hit = EventDetector.detect(det, run.state, before).find(e => matches(run, e, key));
      if (hit) return { step, event: { type: hit.type, x: hit.x, y: hit.y }, run };
    }
    return null;
  }

  function options(shot) {
    return {
      pre: shot.pre ?? DEFAULTS.pre,
      post: shot.post ?? DEFAULTS.post,
      search: shot.search ?? DEFAULTS.search,
    };
  }

  function retime(items, pre) {
    return items?.map(item => (Number.isFinite(item.fromKey) ? { ...item, t: pre + item.fromKey } : item));
  }

  // Plan prêt à tourner : graine (éventuellement trouvée par le planificateur), warmup allongé
  // pour démarrer pre secondes avant le moment clé, durée, instants relatifs convertis.
  // found = { seed?, step } (plan.js ou find()). Renvoie le plan d'origine s'il n'a pas de clé.
  function prepare(shot, found) {
    if (!hasKey(shot)) return shot;
    if (!found) throw new Error(`plan ${shot.id} : moment clé introuvable`);
    const { pre, post } = options(shot);
    const setup = { ...(shot.setup ?? {}) };
    if (Number.isFinite(found.seed)) setup.seed = found.seed;
    const startStep = Math.max(0, found.step - Math.round(pre * STEPS_PER_SECOND));
    // Moment clé trop tôt dans la partie : on garde moins de secondes avant lui.
    const keyAt = (found.step - startStep) / STEPS_PER_SECOND;
    setup.warmup = (setup.warmup ?? 0) + startStep;
    const camera = shot.camera?.keys ? { ...shot.camera, keys: retime(shot.camera.keys, keyAt) } : shot.camera;
    return {
      ...shot, setup, camera,
      cues: retime(shot.cues, keyAt), time: retime(shot.time, keyAt),
      duration: shot.duration ?? keyAt + post,
      keyAt, keyStep: found.step, startStep,
      keyEvent: Number.isFinite(found.event?.x) ? { x: found.event.x, y: found.event.y } : null,
    };
  }

  // Carte ASCII de l'arène autour d'un point (pour placer une scène) : # bord, lettres = têtes
  // (a, b, c… dans l'ordre de la légende), . = corps, + = centre de la carte.
  function asciiMap(state, center, { cols = 72, rows = 26, span = 1600, radius = SnakeArena.RADIUS } = {}) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
    const sx = span / cols;
    const sy = sx * 2;
    const cell = (x, y) => {
      const c = Math.floor((x - center.x) / sx + cols / 2);
      const r = Math.floor((y - center.y) / sy + rows / 2);
      return c >= 0 && c < cols && r >= 0 && r < rows ? [r, c] : null;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = center.x + (c + 0.5 - cols / 2) * sx;
        const y = center.y + (r + 0.5 - rows / 2) * sy;
        if (Math.abs(Math.hypot(x, y) - radius) < sx) grid[r][c] = '#';
      }
    }
    const legend = [];
    state.snakes.forEach((snake, i) => {
      const letter = String.fromCharCode(97 + (i % 26));
      for (const seg of snake.body) {
        const at = cell(seg.x ?? seg.pos.x, seg.y ?? seg.pos.y);
        if (at && grid[at[0]][at[1]] === ' ') grid[at[0]][at[1]] = '.';
      }
      const head = cell(snake.pos.x, snake.pos.y);
      if (head) {
        grid[head[0]][head[1]] = letter;
        legend.push(`${letter} ${snake.name}${snake.role ? ` (${snake.role})` : ''} · masse ${Math.round(snake.mass)}`);
      }
    });
    const mid = cell(center.x, center.y);
    if (mid && grid[mid[0]][mid[1]] === ' ') grid[mid[0]][mid[1]] = '+';
    const border = `+${'-'.repeat(cols)}+`;
    return [border, ...grid.map(row => `|${row.join('')}|`), border,
      `1 caractère = ${Math.round(sx)} px · centre (${Math.round(center.x)}, ${Math.round(center.y)})`, ...legend].join('\n');
  }

  return { STEPS_PER_SECOND, DEFAULTS, STUDIO_FLAGS, hasKey, signature, matches, find, options, prepare, asciiMap };
})();
