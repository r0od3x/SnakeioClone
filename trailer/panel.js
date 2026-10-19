// Panneau du Trailer Studio (F9) : plans, caméra, temps, mise en scène, image, enregistrement.
// Interface seulement : chaque commande appelle TrailerStudio.act ; refresh() relit l'état.
// Le panneau est du HTML : il n'apparaît jamais dans les vidéos (seul le canvas est capturé).
const StudioPanel = (() => {
  let root = null;
  let ctx = null;
  const live = {};

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [type, fn] of Object.entries(v)) node.addEventListener(type, fn);
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v);
    }
    node.append(...children.filter(c => c !== null && c !== undefined));
    return node;
  }

  function section(title, open, ...rows) {
    return el('details', { open }, el('summary', {}, title), ...rows);
  }

  function row(label, ...controls) {
    return el('div', { class: 'row' }, el('span', { class: 'label' }, label), ...controls);
  }

  function button(text, onClick, title = '') {
    return el('button', { type: 'button', title, on: { click: onClick } }, text);
  }

  function select(options, value, onChange) {
    const node = el('select', { on: { change: e => onChange(e.target.value) } },
      ...options.map(([v, text]) => el('option', { value: v }, text)));
    node.value = value;
    return node;
  }

  function check(label, checked, onChange) {
    const input = el('input', { type: 'checkbox', checked, on: { change: e => onChange(e.target.checked) } });
    return el('label', { class: 'check' }, input, label);
  }

  // Curseur avec valeur affichée ; format(v) pour l'affichage.
  function slider(min, max, step, value, onInput, format = v => String(v)) {
    const out = el('output', {}, format(value));
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
      on: { input: e => { const v = Number(e.target.value); out.value = format(v); onInput(v); } } });
    return { input, out, node: el('span', { class: 'slider' }, input, out) };
  }

  function build(parent, context) {
    ctx = context;
    const { state: s, act } = ctx;
    const shots = s.shots.shots;

    live.status = el('div', { class: 'status' });
    live.rec = el('span', { class: 'rec-dot', title: 'Enregistrement' });
    live.shot = select(shots.map((shot, i) => [String(i), shot.id]), '0', v => { s.shots.index = Number(v); live.notes.textContent = shots[Number(v)]?.notes ?? ''; });
    live.notes = el('p', { class: 'notes' }, shots[0]?.notes ?? 'Aucun plan dans trailer/shots.js.');
    live.problems = ctx.problems.length ? el('p', { class: 'problems' }, ctx.problems.join(' · ')) : null;

    live.cameraMode = select(CameraRig.MODES.map(m => [m, { game: 'Jeu', free: 'Libre', follow: 'Suivi', keyframes: 'Images-clés' }[m]]), s.rig.mode,
      v => (v === 'keyframes' ? act.reveal() : act.setCameraMode(v)));
    live.target = el('select', { on: { change: e => act.followTarget(live.targets[Number(e.target.value)]) } });
    live.targets = [];
    const zoom = slider(0.1, 3, 0.05, 1, v => act.setFollow({ zoom: v }), v => `${v.toFixed(2)}×`);
    const smooth = slider(0, 2, 0.05, 0.25, v => act.setFollow({ smoothing: v }), v => `${v.toFixed(2)} s`);
    const look = slider(0, 60, 1, 25, v => act.setFollow({ lookAhead: v }), v => `${v} im.`);
    live.followSliders = { zoom, smooth, look };

    const time = slider(0.05, 4, 0.05, 1, v => act.setScale(v), v => `${v.toFixed(2)}×`);
    live.time = time;
    live.pause = button('Pause', () => act.togglePause(), 'K');
    live.events = el('ul', { class: 'events' });

    const seed = el('input', { type: 'number', min: '1', value: String(s.sandbox.seed), class: 'seed' });
    const scenario = select(Director.SCENARIOS.map(id => [id, Director.LABELS[id]]), s.sandbox.scenario, () => {});
    const bots = slider(0, 40, 1, s.sandbox.bots, v => act.setBots(v));
    const food = slider(0, 900, 10, s.sandbox.food, v => act.setFood(v));
    const length = slider(20, 2000, 10, 120, () => {}, v => String(v));
    const species = select([['', 'Au hasard'], ...SnakeSpecies.LIST.map(sp => [sp.id, sp.name])], s.profile.species ?? '', v => act.setPlayerSpecies(v));
    live.invincible = check('Joueur invincible', s.flags.invincible, v => act.setFlags({ invincible: v }));
    live.autopilot = check('Pilote automatique (IA)', s.flags.autopilot, v => act.setFlags({ autopilot: v }));

    const frameChecks = ['hud', 'names', 'minimap', 'vignette', 'debug', 'letterbox'].map(name => {
      const labels = { hud: 'Interface', names: 'Noms', minimap: 'Mini-carte', vignette: 'Vignette du jeu', debug: 'Debug IA', letterbox: 'Bandes 2,39:1' };
      const c = check(labels[name], s.frame[name], v => act.setFrame(name, v));
      live[`frame-${name}`] = c.querySelector('input');
      return c;
    });
    live.preset = select(Grade.NAMES.map(n => [n, { none: 'Aucun', cinematic: 'Cinéma', golden: 'Heure dorée', moody: 'Sombre' }[n] ?? n]), s.frame.preset, v => act.setFrame('preset', v));
    live.recordButton = button('● Enregistrer', () => act.toggleRecording(), 'F10');
    live.format = el('span', { class: 'hint' });

    root = el('aside', { id: 'studio-panel', 'aria-label': 'Trailer Studio' },
      el('header', {}, live.rec, el('strong', {}, 'Trailer Studio'), button('×', () => toggle(false), 'F9')),
      live.status,
      section('Plans', true,
        row('Plan', live.shot),
        el('div', { class: 'buttons' },
          button('◀', () => act.previousShot(), '['), button('Jouer', () => act.playShot(s.shots.index), 'Entrée'),
          button('▶', () => act.nextShot(), ']'), button('Tout jouer', () => act.playAll(), 'Maj+Entrée'), button('Stop', () => act.stopShot(), 'Échap')),
        check('Enregistrer chaque plan (un fichier par id)', s.recordShots, v => act.setRecordShots(v)),
        live.notes, live.problems),
      section('Caméra', true,
        row('Mode', live.cameraMode, el('span', { class: 'hint' }, 'C')),
        row('Cible', live.target, button('Tab', () => act.nextTarget(), 'Cible suivante')),
        row('Zoom', zoom.node), row('Amorti', smooth.node), row('Anticipation', look.node),
        el('div', { class: 'buttons' }, button('Révéler l\'arène', () => act.reveal(), 'R')),
        el('p', { class: 'hint' }, 'Libre : molette = zoom, clic droit glissé = déplacer, flèches, Z/X zoom, Q/E rotation.')),
      section('Temps', true,
        row('Échelle', time.node),
        el('div', { class: 'buttons' }, live.pause, button('Image +1', () => act.step(), 'L'),
          ...ctx.TIME_PRESETS.map((v, i) => button(`${v}×`, () => act.setScale(v), String(i + 1)))),
        check('Ralenti auto (élimination, frôlement, encerclement)', s.auto.slowmo, v => act.setAuto('slowmo', v)),
        check('Caméra auto sur ces moments', s.auto.cut, v => act.setAuto('cut', v)),
        live.events),
      section('Mise en scène', false,
        row('Graine', seed, button('Au hasard', () => { seed.value = String(1 + Math.floor(Math.random() * 99999)); })),
        row('Scène', scenario),
        el('div', { class: 'buttons' }, button('Lancer la prise', () => act.sandbox({ seed: Number(seed.value) || 1, scenario: scenario.value }))),
        row('Bots', bots.node), row('Proies', food.node),
        row('Longueur joueur', length.node, button('Appliquer', () => act.setPlayerLength(Number(length.input.value)))),
        row('Espèce joueur', species),
        live.invincible, live.autopilot),
      section('Image', false, ...frameChecks, row('Étalonnage', live.preset, el('span', { class: 'hint' }, 'G')),
        el('p', { class: 'hint' }, 'H : image propre (sans interface, noms, mini-carte) · B : bandes noires.')),
      section('Enregistrement', true,
        row('Sortie', select(ctx.OUTPUTS.map(o => [o, { window: 'Fenêtre', '1080p': '1920 × 1080', '1440p': '2560 × 1440', '4k': '3840 × 2160' }[o]]), s.output, v => act.setOutput(v))),
        el('div', { class: 'buttons' }, live.recordButton, button('Capture 2×', () => act.screenshot(2), 'F8'), button('Capture 4×', () => act.screenshot(4), 'Maj+F8')),
        live.format));
    parent.append(root);
    refresh();
  }

  function snakeLabel(snake, state) {
    const role = snake.role ? ` · ${snake.role}` : '';
    return `${snake === state.player ? '★ ' : ''}${snake.name} (${Math.round(snake.mass)})${role}`;
  }

  function refresh() {
    if (!root || root.hidden) return;
    const s = ctx.state;
    const state = s.run.state;
    const fps = Math.round(s.fps);
    const lowFps = s.rec.recording && fps < 55;
    live.status.textContent = `${s.message || ''}\n${s.shot ? `Plan ${s.shot.id} · ${s.shots.time.toFixed(1)} / ${s.shot.duration} s` : 'Bac à sable'}`
      + ` · ${s.tc.paused ? 'pause' : `${s.tc.scale.toFixed(2)}×`} · ${fps} im/s${lowFps ? ' (lent : la vidéo saccadera)' : ''}`;
    live.status.classList.toggle('warn', lowFps);
    live.rec.classList.toggle('on', s.rec.recording);
    live.recordButton.textContent = s.rec.recording ? `■ Arrêter (${s.rec.frames} im.)` : '● Enregistrer';
    live.format.textContent = s.rec.supported
      ? `Format : ${Recorder.extension(Recorder.pickType(t => MediaRecorder.isTypeSupported(t))).toUpperCase()} · ${Recorder.BITRATE / 1e6} Mb/s · ${width * pixelDensity()} × ${height * pixelDensity()}`
      : 'Vidéo indisponible ici (MediaRecorder) ; captures possibles.';
    live.pause.textContent = s.tc.paused ? 'Lecture' : 'Pause';
    if (document.activeElement !== live.time.input) {
      live.time.input.value = String(s.tc.base);
      live.time.out.value = `${s.tc.base.toFixed(2)}×`;
    }
    if (document.activeElement !== live.cameraMode) live.cameraMode.value = s.rig.mode;
    if (document.activeElement !== live.shot) live.shot.value = String(s.shots.index);
    for (const name of ['hud', 'names', 'minimap', 'vignette', 'debug', 'letterbox']) live[`frame-${name}`].checked = s.frame[name];
    live.preset.value = s.frame.preset;
    live.invincible.querySelector('input').checked = s.flags.invincible;
    live.autopilot.querySelector('input').checked = s.flags.autopilot;
    // Liste des cibles (les plus gros d'abord), reconstruite seulement si elle change.
    const list = [...state.snakes].sort((a, b) => b.mass - a.mass).slice(0, 40);
    const key = list.map(sn => sn.name + Math.round(sn.mass / 10)).join();
    if (key !== live.targetsKey && document.activeElement !== live.target) {
      live.targetsKey = key;
      live.targets = list;
      live.target.replaceChildren(...list.map((sn, i) => el('option', { value: String(i) }, snakeLabel(sn, state))));
    }
    const current = live.targets.indexOf(s.rig.follow.target);
    if (current >= 0 && document.activeElement !== live.target) live.target.value = String(current);
    live.events.replaceChildren(...s.events.map(e => el('li', {}, `${{ kill: 'Élimination', nearMiss: 'Frôlement', encircle: 'Encerclement' }[e.type]} · image ${e.frame}`)));
  }

  function toggle(open = root?.hidden) {
    if (!root) return;
    root.hidden = !open;
    if (open) refresh();
  }

  return { build, refresh, toggle };
})();
