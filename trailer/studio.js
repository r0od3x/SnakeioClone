// Trailer Studio : outils de tournage de Snake.io, chargés seulement avec index.html?studio.
// Prend la main sur la boucle de sketch.js (une ligne dans draw) et enchaîne, à chaque image :
// plan en cours (actions datées), temps (pas de jeu fixes, ralenti, pause), simulation de la
// prise (Director + SnakeArena, sans changement de règles), moments forts, caméra, rendu
// (interpolé, interface dans le canvas, étalonnage, bandes noires), enregistrement.
// L'horloge avance d'exactement 1/60 s par image : un plan rejoué est identique image par image.
const TrailerStudio = (() => {
  const DT = 1 / 60;
  const TIME_PRESETS = [0.1, 0.25, 0.5, 1, 2];
  const OUTPUTS = { window: null, '1080p': [1920, 1080], '1440p': [2560, 1440], '4k': [3840, 2160] };
  const SANDBOX_SLOWMO = { on: ['kill', 'nearMiss', 'encircle'], scale: 0.2, inDuration: 0.3, hold: 1.2, outDuration: 0.8 };

  const s = {
    active: false, profile: { name: 'Toi', species: null }, canvas: null,
    run: null, rig: null, tc: null, det: null, shots: null, rec: null, scratch: null, ratTitle: null,
    prev: null, alpha: 1, letterbox: 0, output: 'window', fps: 60, lastTime: 0,
    sandbox: { seed: 1, scenario: 'open', bots: 12, food: 450 },
    flags: { invincible: true, autopilot: true },
    frame: { hud: true, names: true, minimap: true, vignette: true, debug: false, letterbox: false, preset: 'none' },
    auto: { slowmo: false, cut: false },
    shot: null, recordShots: false, events: [], message: '', drag: null,
  };

  function resolver(name) {
    return Director.resolve(s.run, name);
  }

  function say(text) {
    s.message = text;
    s.messageAt = performance.now();
  }

  // ---------- Prises ----------
  function newRun(setup) {
    // Les réglages du panneau (invincible, pilote auto) s'appliquent sauf si la prise les fixe.
    s.run = Director.newRun({ ...s.flags, ...setup }, s.profile);
    s.flags = { ...s.run.flags };
    s.tc = TimeControl.create();
    s.det = EventDetector.create();
    s.prev = null;
    s.ratTitle = RatTitle.create();
    s.events = [];
  }

  // Bac à sable : la scène et la graine du panneau, caméra du jeu.
  function sandbox(overrides = {}) {
    stopShot();
    Object.assign(s.sandbox, overrides);
    newRun({ ...s.sandbox });
    CameraRig.setMode(s.rig, 'game');
    if (s.sandbox.scenario !== 'open') {
      // Caméra libre sur la scène, cadrée large.
      Object.assign(s.rig.free, { x: s.run.focus.x, y: s.run.focus.y, zoom: 0.8, rotation: 0 });
      Object.assign(s.rig.cam, s.rig.free);
      s.rig.mode = 'free';
    }
    say(`Prise : ${Director.LABELS[s.sandbox.scenario]} · graine ${s.sandbox.seed}`);
  }

  // ---------- Plans ----------
  function setupCamera(cam = {}) {
    const rig = s.rig;
    const type = cam.type ?? 'game';
    if (type === 'follow') {
      CameraRig.follow(rig, resolver(cam.target), {
        zoom: cam.zoom ?? 1, offset: cam.offset ?? { x: 0, y: 0 }, smoothing: cam.smoothing ?? 0.25,
        lookAhead: cam.lookAhead ?? 20, rotation: cam.rotation ?? 0,
      });
      Object.assign(rig.cam, CameraRig.followGoal(rig.follow, s.run.state));
    } else if (type === 'free') {
      CameraRig.setMode(rig, 'free');
      Object.assign(rig.free, { x: cam.x ?? 0, y: cam.y ?? 0, zoom: cam.zoom ?? 1, rotation: cam.rotation ?? 0 });
      Object.assign(rig.cam, rig.free);
    } else if (type === 'keyframes') {
      CameraRig.playKeyframes(rig, cam.keys, resolver);
      CameraRig.update(rig, 0);
    } else {
      CameraRig.setMode(rig, 'game');
      Object.assign(rig.cam, s.run.state.camera, { rotation: 0 });
    }
  }

  function applyFrame(frame = {}) {
    s.frame = { hud: true, names: true, minimap: true, vignette: true, debug: false, letterbox: false, preset: 'none', ...frame };
    s.letterbox = s.frame.letterbox ? 1 : 0;
  }

  function loadShot(shot) {
    if (!shot) return;
    newRun(shot.setup ?? {});
    applyFrame(shot.frame);
    TimeControl.setCurve(s.tc, shot.time);
    setupCamera(shot.camera);
    s.shot = shot;
    if (s.recordShots && s.rec.supported) s.rec.start(shot.id);
    say(`Plan ${shot.id}${s.rec.recording ? ' · enregistrement' : ''}`);
  }

  function playShot(index, all = false) {
    const shot = ShotPlayer.start(s.shots, index);
    s.shots.all = all;
    loadShot(shot);
  }

  function stopShot() {
    if (s.shot && s.rec?.recording && s.recordShots) finishRecording();
    ShotPlayer.stop(s.shots);
    s.shot = null;
  }

  function endShot() {
    const all = s.shots.all;
    const last = s.shots.index === s.shots.shots.length - 1;
    if (s.rec.recording && s.recordShots) finishRecording();
    s.shot = null;
    if (all && !last) playShot(s.shots.index + 1, true);
    else {
      s.shots.all = false;
      say('Fin du plan');
    }
  }

  function execCue(cue) {
    if (cue.action === 'cut') {
      const f = s.rig.follow;
      CameraRig.cutTo(s.rig, resolver(cue.target), cue.duration ?? 1.2, cue.ease ?? 'inOutCubic', {
        zoom: cue.zoom ?? f.zoom, lookAhead: cue.lookAhead ?? f.lookAhead, smoothing: cue.smoothing ?? f.smoothing,
        offset: cue.offset ?? { x: 0, y: 0 },
      });
    } else if (cue.action === 'slowmo') {
      TimeControl.rampTo(s.tc, cue.scale ?? 0.25, cue);
    } else if (cue.action === 'release') {
      const actor = s.run.actors[cue.role];
      if (actor) actor.script = null;
    } else if (cue.action === 'keyframes') {
      CameraRig.playKeyframes(s.rig, cue.keys, resolver);
    }
  }

  // ---------- Moments forts ----------
  function handleEvents(events) {
    if (!events.length) return;
    const slowmo = s.shot ? s.shot.events?.autoSlowmo : (s.auto.slowmo ? SANDBOX_SLOWMO : null);
    const cut = s.shot ? s.shot.events?.autoCut : s.auto.cut;
    for (const e of events) {
      s.events.unshift({ type: e.type, frame: s.run.state.frame });
      if (slowmo && slowmo.on.includes(e.type) && !s.tc.ramp) TimeControl.rampTo(s.tc, slowmo.scale, slowmo);
      if (cut) {
        const target = e.type === 'kill' ? { x: e.x, y: e.y } : e.actors[1];
        CameraRig.cutTo(s.rig, target, 0.8, 'inOutCubic', { zoom: Math.max(1, s.rig.cam.zoom), lookAhead: 10 });
      }
    }
    s.events.length = Math.min(s.events.length, 6);
  }

  // ---------- Image ----------
  function simulate(w, h) {
    const state = s.run.state;
    Director.beforeStep(s.run);
    if (state.player instanceof PlayerSnake) {
      // Joueur aux commandes (pilote automatique coupé) : la souris vise à travers la caméra de tournage.
      const p = CameraRig.toWorld(s.rig.cam, mouseX, mouseY, w, h);
      state.input = { target: createVector(p.x, p.y), boost: keyIsDown(32) };
    }
    s.prev = s.tc.scale < 1 ? Interpolation.capture(state) : null;
    const before = EventDetector.snapshot(state);
    SnakeArena.step(state, w, h, s.run.rng);
    handleEvents(EventDetector.detect(s.det, state, before));
  }

  // Dessin complet d'une image dans ctx (pixels CSS w × h) : écran, capture haute résolution.
  function render(ctx, w, h, live) {
    const state = s.run.state;
    const restore = Interpolation.apply(state, s.prev, s.alpha);
    const gameCamera = state.camera;
    state.camera = { ...s.rig.cam };
    SnakeArena.show(state, w, h, { ctx, names: s.frame.names, minimap: s.frame.minimap, vignette: s.frame.vignette, debug: s.frame.debug });
    state.camera = gameCamera;
    restore();
    if (s.frame.hud) {
      CanvasHud.draw(ctx, state, w, h, Grade.letterboxBar(w, h, s.letterbox));
      if (live) {
        RatTitle.update(s.ratTitle, !state.player, null, w, h);
        RatTitle.draw(ctx, s.ratTitle, w, h);
      }
    }
    Grade.apply(ctx, s.frame.preset, live ? s.scratch : Grade.createScratch());
    Grade.letterbox(ctx, s.letterbox);
  }

  function freeCameraKeys() {
    if (s.rig.mode !== 'free') return;
    const speed = 14;
    const dx = (keyIsDown(RIGHT_ARROW) ? 1 : 0) - (keyIsDown(LEFT_ARROW) ? 1 : 0);
    const dy = (keyIsDown(DOWN_ARROW) ? 1 : 0) - (keyIsDown(UP_ARROW) ? 1 : 0);
    if (dx || dy) CameraRig.pan(s.rig, -dx * speed, -dy * speed);
    if (keyIsDown(90)) CameraRig.zoomAt(s.rig, 1.02, width / 2, height / 2, width, height);
    if (keyIsDown(88)) CameraRig.zoomAt(s.rig, 1 / 1.02, width / 2, height / 2, width, height);
    if (keyIsDown(81)) CameraRig.rotate(s.rig, -0.01);
    if (keyIsDown(69)) CameraRig.rotate(s.rig, 0.01);
  }

  function frame() {
    const w = width;
    const h = height;
    const now = performance.now();
    if (s.lastTime) s.fps += (1000 / Math.max(1, now - s.lastTime) - s.fps) * 0.05;
    s.lastTime = now;
    if (s.shot) {
      const { cues, ended } = ShotPlayer.tick(s.shots, DT);
      cues.forEach(execCue);
      if (ended) endShot();
    }
    freeCameraKeys();
    const { steps, alpha } = TimeControl.advance(s.tc, DT);
    for (let i = 0; i < steps; i++) simulate(w, h);
    s.alpha = alpha;
    CameraRig.update(s.rig, DT, s.run.state);
    s.letterbox += ((s.frame.letterbox ? 1 : 0) - s.letterbox) * Easing.damp(0.35, DT);
    render(drawingContext, w, h, true);
    s.rec.frame();
    if (frameCount % 6 === 0) StudioPanel.refresh();
  }

  // ---------- Enregistrement ----------
  function takeName() {
    return s.shot ? s.shot.id : `prise-${s.sandbox.scenario}-${s.sandbox.seed}-${String(Date.now()).slice(-5)}`;
  }

  function finishRecording() {
    s.rec.stop().then(result => {
      if (result) say(`Vidéo ${result.name} · ${result.frames} images · ${(result.size / 1e6).toFixed(1)} Mo`);
    });
  }

  function toggleRecording() {
    if (!s.rec.supported) {
      say('Enregistrement vidéo indisponible dans ce navigateur (MediaRecorder).');
      return;
    }
    if (s.rec.recording) finishRecording();
    else {
      s.rec.start(takeName());
      say(`Enregistrement : ${s.rec.name}`);
    }
  }

  function screenshot(scale = 2) {
    const name = `${takeName()}-${s.run.state.frame}@${scale}x.png`;
    Recorder.screenshot((ctx, w, h) => render(ctx, w, h, false), width, height, scale, name)
      .then(r => say(`Capture ${r.name} (${r.width} × ${r.height})`));
  }

  // Taille de sortie fixe (1080p…) : le canvas a exactement cette taille en pixels, affiché réduit.
  function setOutput(name) {
    if (!(name in OUTPUTS)) return;
    s.output = name;
    const size = OUTPUTS[name];
    document.body.classList.toggle('studio-fixed', Boolean(size));
    if (size) {
      pixelDensity(1);
      resizeCanvas(size[0], size[1]);
    } else {
      pixelDensity(typeof displayDensity === 'function' ? displayDensity() : 1);
      resizeCanvas(windowWidth, windowHeight);
    }
    say(size ? `Sortie ${size[0]} × ${size[1]}` : 'Sortie : taille de la fenêtre');
  }

  function windowResized() {
    return s.output !== 'window';
  }

  // ---------- Commandes (panneau et raccourcis) ----------
  const act = {
    sandbox, playShot, stopShot, toggleRecording, screenshot, setOutput,
    nextShot: () => playShot(s.shots.index + 1, false),
    previousShot: () => playShot(s.shots.index - 1, false),
    replayShot: () => playShot(s.shots.index, false),
    playAll: () => playShot(0, true),
    setRecordShots: on => { s.recordShots = Boolean(on); },
    setCameraMode: mode => {
      if (mode === 'follow') CameraRig.follow(s.rig, s.rig.follow.target ?? s.run.state.player ?? resolver('leader'));
      else CameraRig.setMode(s.rig, mode);
    },
    setFollow: options => Object.assign(s.rig.follow, options),
    followTarget: (snake, smooth = true) => {
      if (!snake) return;
      if (smooth) CameraRig.cutTo(s.rig, snake, 1.2, 'inOutCubic', {});
      else CameraRig.follow(s.rig, snake);
    },
    nextTarget: () => {
      const list = [...s.run.state.snakes].sort((a, b) => b.mass - a.mass);
      const i = list.indexOf(s.rig.follow.target);
      act.followTarget(list[(i + 1) % list.length], false);
    },
    reveal: () => {
      const from = s.rig.cam;
      CameraRig.playKeyframes(s.rig, [
        { t: 0, x: from.x, y: from.y, zoom: from.zoom, rotation: from.rotation },
        { t: 6, x: 0, y: 0, zoom: Math.min(width, height) / (SnakeArena.RADIUS * 2.15), rotation: from.rotation + 0.15, ease: 'inOutCubic' },
      ], resolver);
    },
    setScale: v => TimeControl.setScale(s.tc, v),
    togglePause: () => TimeControl.setPaused(s.tc, !s.tc.paused),
    step: () => {
      if (!s.tc.paused) TimeControl.setPaused(s.tc, true);
      TimeControl.stepFrame(s.tc);
    },
    setAuto: (name, on) => { s.auto[name] = Boolean(on); },
    setFlags: flags => {
      Object.assign(s.flags, flags);
      Director.setFlags(s.run, s.flags);
    },
    setBots: n => {
      s.sandbox.bots = n;
      Director.setBots(s.run, n);
    },
    setFood: n => {
      s.sandbox.food = n;
      Director.setFood(s.run, n);
    },
    setPlayerLength: m => s.run.state.player && Director.setLength(s.run.state.player, m),
    setPlayerSpecies: id => {
      s.profile.species = id || null;
      if (s.run.state.player && id) Director.setSpecies(s.run.state.player, id);
    },
    setFrame: (name, value) => {
      s.frame[name] = value;
    },
    cleanFrame: () => {
      const clean = s.frame.hud || s.frame.names || s.frame.minimap;
      Object.assign(s.frame, { hud: !clean, names: !clean, minimap: !clean, debug: false });
    },
  };

  function keyPressed() {
    const el = document.activeElement;
    if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && el.type !== 'range' && el.type !== 'checkbox') return true;
    const k = key.toLowerCase();
    const handled = () => false;
    if (keyCode === 120) return StudioPanel.toggle(), handled();
    if (keyCode === 121) return toggleRecording(), handled();
    if (keyCode === 119) return screenshot(keyIsDown(SHIFT) ? 4 : 2), handled();
    if (k === 'k') return act.togglePause(), handled();
    if (k === 'l') return act.step(), handled();
    if ('12345'.includes(key) && key !== '') return act.setScale(TIME_PRESETS[Number(key) - 1]), handled();
    if (key === '-') return act.setScale(s.tc.base * 0.8), handled();
    if (key === '=' || key === '+') return act.setScale(s.tc.base * 1.25), handled();
    if (k === 'c') {
      const i = CameraRig.MODES.indexOf(s.rig.mode);
      const next = CameraRig.MODES[(i + 1) % CameraRig.MODES.length];
      if (next === 'keyframes') act.reveal();
      else act.setCameraMode(next);
      return handled();
    }
    if (keyCode === TAB) return act.nextTarget(), handled();
    if (key === '[') return act.previousShot(), handled();
    if (key === ']') return act.nextShot(), handled();
    if (keyCode === ENTER) return (keyIsDown(SHIFT) ? act.playAll() : act.replayShot()), handled();
    if (keyCode === ESCAPE) return act.stopShot(), handled();
    if (k === 'h') return act.cleanFrame(), handled();
    if (k === 'b') return act.setFrame('letterbox', !s.frame.letterbox), handled();
    if (k === 'g') {
      const i = Grade.NAMES.indexOf(s.frame.preset);
      return act.setFrame('preset', Grade.NAMES[(i + 1) % Grade.NAMES.length]), handled();
    }
    if (k === 'd') return act.setFrame('debug', !s.frame.debug), handled();
    if (k === 'n') return sandbox({ seed: 1 + Math.floor(Math.random() * 99999) }), handled();
    if (k === 'r') return act.reveal(), handled();
    // Flèches, Z/X, Q/E : caméra libre (lues à chaque image) ; pas de défilement de la page.
    return ![UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW, 32].includes(keyCode);
  }

  // Molette : zoom de la caméra libre ; clic droit ou molette glissés : déplacement libre.
  function bindPointer(canvas) {
    const toFree = () => {
      if (s.rig.mode !== 'free') CameraRig.setMode(s.rig, 'free');
    };
    const local = event => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height, k: width / rect.width };
    };
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      toFree();
      const p = local(event);
      CameraRig.zoomAt(s.rig, Math.exp(-event.deltaY * 0.0015), p.x, p.y, width, height);
    }, { passive: false });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 1 && event.button !== 2 && !(event.button === 0 && s.rig.mode === 'free' && s.flags.autopilot)) return;
      toFree();
      s.drag = local(event);
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!s.drag) return;
      const p = local(event);
      CameraRig.pan(s.rig, p.x - s.drag.x, p.y - s.drag.y);
      s.drag = p;
    });
    canvas.addEventListener('pointerup', () => { s.drag = null; });
  }

  function init({ profile = {}, canvas } = {}) {
    s.active = true;
    s.canvas = canvas;
    s.profile = { name: profile.name || 'Toi', species: profile.species ?? null };
    document.body.classList.add('studio');
    for (const id of ['menu', 'toolbar', 'settings', 'pause', 'arena-hud']) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }
    s.rig = CameraRig.create();
    s.shots = ShotPlayer.create(typeof TrailerShots === 'undefined' ? [] : TrailerShots);
    const problems = ShotPlayer.validateAll(s.shots.shots);
    if (problems.length) console.warn('Trailer Studio : plans à corriger\n' + problems.join('\n'));
    s.rec = Recorder.create(canvas);
    s.scratch = Grade.createScratch();
    sandbox();
    bindPointer(canvas);
    StudioPanel.build(document.body, { state: s, act, TIME_PRESETS, OUTPUTS: Object.keys(OUTPUTS), problems });
    say('Trailer Studio prêt · F9 : panneau');
  }

  return { DT, TIME_PRESETS, OUTPUTS, init, frame, keyPressed, windowResized, act, state: s,
    get active() { return s.active; } };
})();
