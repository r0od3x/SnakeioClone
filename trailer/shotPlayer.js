// Lecture de la liste des plans : plan courant, précédent / suivant, rejouer, tout enchaîner,
// horloge du plan et actions datées (cues) à exécuter. Le studio applique les plans
// (studio.js) ; ici : vérification des données et horloge, sans dessin ni simulation.
const ShotPlayer = (() => {
  const ID = /^[A-Za-z0-9_-]+$/;
  const ACTIONS = ['cut', 'slowmo', 'release', 'keyframes'];
  const EVENTS = ['kill', 'nearMiss', 'encircle'];

  // Liste des problèmes d'un plan (vide : plan valide).
  function validate(shot) {
    const errors = [];
    const where = `plan ${shot?.id ?? '?'}`;
    if (!shot || typeof shot !== 'object') return ['plan absent'];
    if (typeof shot.id !== 'string' || !ID.test(shot.id)) errors.push(`${where} : id invalide (lettres, chiffres, - et _)`);
    if (!(shot.duration > 0)) errors.push(`${where} : duration doit être > 0`);
    const scenario = shot.setup?.scenario ?? 'open';
    if (typeof Director !== 'undefined' && !Director.SCENARIOS.includes(scenario)) errors.push(`${where} : scène inconnue ${scenario}`);
    const type = shot.camera?.type ?? 'game';
    if (typeof CameraRig !== 'undefined' && !CameraRig.MODES.includes(type)) errors.push(`${where} : caméra inconnue ${type}`);
    if (type === 'keyframes') {
      const keys = shot.camera.keys;
      if (!Array.isArray(keys) || !keys.length) errors.push(`${where} : keyframes sans images-clés`);
      else if (keys.some((k, i) => !Number.isFinite(k.t) || (i && k.t < keys[i - 1].t))) errors.push(`${where} : images-clés non triées`);
    }
    if (type === 'follow' && !shot.camera.target) errors.push(`${where} : follow sans target`);
    for (const p of shot.time ?? []) {
      if (!Number.isFinite(p.t) || !(p.scale > 0)) errors.push(`${where} : point de temps invalide`);
    }
    for (const cue of shot.cues ?? []) {
      if (!ACTIONS.includes(cue.action) || !Number.isFinite(cue.t)) errors.push(`${where} : action invalide ${cue.action}`);
    }
    for (const type of shot.events?.autoSlowmo?.on ?? []) {
      if (!EVENTS.includes(type)) errors.push(`${where} : événement inconnu ${type}`);
    }
    return errors;
  }

  function validateAll(shots) {
    const errors = shots.flatMap(validate);
    const ids = shots.map(s => s.id);
    for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errors.push(`id en double : ${id}`);
    return errors;
  }

  function create(shots) {
    return { shots, index: 0, time: 0, playing: false, all: false, pending: [] };
  }

  function current(player) {
    return player.shots[player.index] ?? null;
  }

  // Démarre le plan index (borné à la liste) ; renvoie le plan.
  function start(player, index = player.index) {
    const n = player.shots.length;
    if (!n) return null;
    player.index = ((index % n) + n) % n;
    player.time = 0;
    player.playing = true;
    player.pending = [...(current(player).cues ?? [])].sort((a, b) => a.t - b.t);
    return current(player);
  }

  function next(player) {
    return start(player, player.index + 1);
  }

  function previous(player) {
    return start(player, player.index - 1);
  }

  function stop(player) {
    player.playing = false;
    player.all = false;
    player.pending = [];
  }

  // Avance l'horloge du plan (dt s) : actions arrivées à échéance, et fin du plan.
  function tick(player, dt) {
    if (!player.playing) return { cues: [], ended: false };
    player.time += dt;
    const cues = [];
    while (player.pending.length && player.pending[0].t <= player.time) cues.push(player.pending.shift());
    const ended = player.time >= current(player).duration;
    if (ended) player.playing = false;
    return { cues, ended };
  }

  return { ACTIONS, EVENTS, validate, validateAll, create, current, start, next, previous, stop, tick };
})();
