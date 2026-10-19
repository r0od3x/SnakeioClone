// Caméras de tournage. La caméra produite { x, y, zoom, rotation } remplace celle du jeu au
// moment du dessin (SnakeArena.show lit state.camera) ; la simulation n'est pas touchée.
// Modes :
// - game : la caméra du jeu (suit le joueur) ;
// - free : déplacement et zoom libres sur toute la carte, amortis ;
// - follow : suit un serpent (joueur ou IA) avec zoom, décalage, amortissement et anticipation
//   dans le sens du mouvement ; cutTo() fait une transition douce vers une autre cible ;
// - keyframes : trajectoire par images-clés (position fixe ou serpent, zoom, rotation, courbe).
// La caméra avance en temps réel : elle continue de bouger quand le jeu est en pause.
const CameraRig = (() => {
  const MODES = ['game', 'free', 'follow', 'keyframes'];
  const ZOOM = { min: 0.08, max: 4 };

  function clampZoom(z) {
    return Math.max(ZOOM.min, Math.min(ZOOM.max, z));
  }

  function create(start = { x: 0, y: 0, zoom: 1 }) {
    const cam = { x: start.x, y: start.y, zoom: start.zoom ?? 1, rotation: start.rotation ?? 0 };
    return {
      mode: 'game', cam,
      free: { ...cam, smoothing: 0.18 },
      follow: { target: null, zoom: 1, offset: { x: 0, y: 0 }, smoothing: 0.25, lookAhead: 25, rotation: 0, last: null },
      keys: null, keyTime: 0, resolve: null,
      transition: null,
    };
  }

  function setMode(rig, mode) {
    if (!MODES.includes(mode)) throw new RangeError(`mode de caméra inconnu : ${mode}`);
    if (mode === 'free') Object.assign(rig.free, { x: rig.cam.x, y: rig.cam.y, zoom: rig.cam.zoom, rotation: rig.cam.rotation });
    rig.mode = mode;
    rig.transition = null;
  }

  // Point visé par la caméra de suivi : la tête, plus un décalage, plus l'anticipation
  // (lookAhead images de vitesse devant). Cible disparue : on garde sa dernière position.
  function followGoal(settings, state) {
    const t = settings.target;
    const alive = t && (!state || state.snakes.includes(t));
    if (alive) settings.last = { x: t.pos.x + t.vel.x * settings.lookAhead, y: t.pos.y + t.vel.y * settings.lookAhead };
    const base = settings.last ?? { x: 0, y: 0 };
    return { x: base.x + settings.offset.x, y: base.y + settings.offset.y, zoom: settings.zoom, rotation: settings.rotation };
  }

  // target : un serpent (suivi), ou un point { x, y } fixe (par exemple le lieu d'une élimination).
  function follow(rig, target, options = {}) {
    const point = target && !target.pos ? { x: target.x, y: target.y } : null;
    Object.assign(rig.follow, options, { target: point ? null : target, last: point });
    rig.mode = 'follow';
  }

  // Transition douce (duration s, courbe ease) de la vue actuelle vers une nouvelle cible.
  function cutTo(rig, target, duration = 1.2, ease = 'inOutCubic', options = {}) {
    const from = { ...rig.cam };
    follow(rig, target, options);
    rig.transition = { from, t: 0, duration: Math.max(0.001, duration), ease };
  }

  // Images-clés : [{ t (s), x?, y? ou target?, zoom?, rotation?, ease? }] triées par t.
  // resolve(name) donne un serpent pour une cible nommée (« player », « hunter »…).
  function playKeyframes(rig, keys, resolve = () => null) {
    if (!Array.isArray(keys) || !keys.length) throw new RangeError('au moins une image-clé');
    rig.keys = [...keys].sort((a, b) => a.t - b.t);
    rig.keyTime = 0;
    rig.resolve = resolve;
    rig.mode = 'keyframes';
    rig.transition = null;
  }

  // Position d'une image-clé : un serpent (cible nommée ou objet), sinon x / y fixes.
  function keyPoint(key, resolve, previous) {
    const target = typeof key.target === 'string' ? resolve(key.target) : key.target;
    const p = target?.pos ?? (key.x !== undefined ? key : previous);
    return {
      x: p?.x ?? 0, y: p?.y ?? 0,
      zoom: key.zoom ?? previous?.zoom ?? 1, rotation: key.rotation ?? previous?.rotation ?? 0,
    };
  }

  // Vue au temps time le long des images-clés ; la courbe d'une image-clé règle l'arrivée sur elle.
  function evaluateKeys(keys, time, resolve = () => null) {
    let previous = keyPoint(keys[0], resolve, null);
    if (time <= keys[0].t || keys.length === 1) return previous;
    for (let k = 1; k < keys.length; k++) {
      const next = keyPoint(keys[k], resolve, previous);
      if (time < keys[k].t) {
        const u = Easing.apply(keys[k].ease ?? 'inOutCubic', (time - keys[k - 1].t) / (keys[k].t - keys[k - 1].t));
        // Zoom interpolé en logarithme : un zoom arrière paraît régulier à l'œil.
        return {
          x: Easing.lerp(previous.x, next.x, u), y: Easing.lerp(previous.y, next.y, u),
          zoom: Math.exp(Easing.lerp(Math.log(previous.zoom), Math.log(next.zoom), u)),
          rotation: Easing.lerp(previous.rotation, next.rotation, u),
        };
      }
      previous = next;
    }
    return previous;
  }

  function keysDuration(rig) {
    return rig.keys ? rig.keys[rig.keys.length - 1].t : 0;
  }

  // Déplacement libre en pixels d'écran (tient compte du zoom et de la rotation).
  function pan(rig, dx, dy) {
    const f = rig.free;
    const c = Math.cos(-f.rotation);
    const s = Math.sin(-f.rotation);
    f.x -= (dx * c - dy * s) / f.zoom;
    f.y -= (dx * s + dy * c) / f.zoom;
  }

  // Zoom libre par un facteur, en gardant le point sous le curseur (sx, sy) immobile.
  function zoomAt(rig, factor, sx, sy, w, h) {
    const f = rig.free;
    const before = toWorld(f, sx, sy, w, h);
    f.zoom = clampZoom(f.zoom * factor);
    const after = toWorld(f, sx, sy, w, h);
    f.x += before.x - after.x;
    f.y += before.y - after.y;
  }

  function rotate(rig, angle) {
    rig.free.rotation += angle;
  }

  // Écran -> monde pour une vue donnée.
  function toWorld(view, sx, sy, w, h) {
    const dx = (sx - w / 2) / view.zoom;
    const dy = (sy - h / 2) / view.zoom;
    const r = -(view.rotation ?? 0);
    return { x: view.x + dx * Math.cos(r) - dy * Math.sin(r), y: view.y + dx * Math.sin(r) + dy * Math.cos(r) };
  }

  function approach(cam, goal, k) {
    cam.x += (goal.x - cam.x) * k;
    cam.y += (goal.y - cam.y) * k;
    cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(goal.zoom) - Math.log(cam.zoom)) * k);
    cam.rotation = Easing.lerpAngle(cam.rotation, goal.rotation ?? 0, k);
  }

  // Une image (dt en secondes réelles) : met à jour rig.cam selon le mode.
  function update(rig, dt, state = null) {
    const cam = rig.cam;
    if (rig.mode === 'game') {
      if (state) Object.assign(cam, { x: state.camera.x, y: state.camera.y, zoom: state.camera.zoom, rotation: 0 });
      return cam;
    }
    if (rig.mode === 'free') {
      approach(cam, rig.free, Easing.damp(rig.free.smoothing, dt));
      return cam;
    }
    if (rig.mode === 'keyframes') {
      rig.keyTime += dt;
      Object.assign(cam, evaluateKeys(rig.keys, rig.keyTime, rig.resolve));
      return cam;
    }
    const goal = followGoal(rig.follow, state);
    const tr = rig.transition;
    if (tr) {
      tr.t += dt;
      const u = Easing.apply(tr.ease, tr.t / tr.duration);
      cam.x = Easing.lerp(tr.from.x, goal.x, u);
      cam.y = Easing.lerp(tr.from.y, goal.y, u);
      cam.zoom = Math.exp(Easing.lerp(Math.log(tr.from.zoom), Math.log(goal.zoom), u));
      cam.rotation = Easing.lerpAngle(tr.from.rotation, goal.rotation, u);
      if (tr.t >= tr.duration) rig.transition = null;
      return cam;
    }
    approach(cam, goal, Easing.damp(rig.follow.smoothing, dt));
    return cam;
  }

  return { MODES, ZOOM, create, setMode, follow, cutTo, playKeyframes, evaluateKeys, keysDuration, followGoal,
    pan, zoomAt, rotate, toWorld, update };
})();
