// Contrôle du temps de tournage. Le jeu avance par pas fixes (un pas = une image de jeu à
// 60 images/s, vitesses en px/image) : on ne change pas ce pas. À chaque image affichée on
// ajoute scale pas à un accumulateur et on joue les pas entiers ; le reste (alpha) sert à
// interpoler l'affichage entre les deux derniers pas (voir interpolation.js), ce qui donne des
// ralentis fluides jusqu'à 0,05×.
// - pause, pas à pas (stepFrame), échelle 0,05× à 4× ;
// - rampes : glisser vers un ralenti (in), le tenir (hold), revenir (out) ;
// - courbe : échelle en fonction du temps d'un plan ([{ t, scale, ease }]).
const TimeControl = (() => {
  const MIN = 0.05;
  const MAX = 4;
  // Au plus MAX_STEPS pas de jeu par image affichée (accéléré).
  const MAX_STEPS = 8;

  function clampScale(s) {
    return Math.max(MIN, Math.min(MAX, Number.isFinite(s) ? s : 1));
  }

  function create() {
    return { base: 1, scale: 1, paused: false, pending: 0, acc: 0, ramp: null, curve: null, curveTime: 0 };
  }

  // Échelle de base (le curseur) ; arrête une rampe en cours.
  function setScale(tc, s) {
    tc.base = clampScale(s);
    tc.scale = tc.base;
    tc.ramp = null;
  }

  function setPaused(tc, paused) {
    tc.paused = Boolean(paused);
    tc.pending = 0;
  }

  // Pas à pas : n pas de jeu à l'image suivante (seulement en pause).
  function stepFrame(tc, n = 1) {
    if (tc.paused) tc.pending += n;
  }

  // Rampe vers to en inDuration s, tenue hold s, retour à l'échelle de base en outDuration s.
  function rampTo(tc, to, { inDuration = 0.35, hold = 1.2, outDuration = 0.8, ease = 'inOutSine' } = {}) {
    tc.ramp = { from: tc.scale, to: clampScale(to), inDuration, hold, outDuration, ease, t: 0 };
  }

  // Courbe d'un plan : l'échelle suit les points (interpolés avec la courbe du point d'arrivée).
  function setCurve(tc, points) {
    tc.curve = points?.length ? [...points].sort((a, b) => a.t - b.t) : null;
    tc.curveTime = 0;
  }

  function evaluateCurve(points, time) {
    if (time <= points[0].t) return points[0].scale;
    for (let k = 1; k < points.length; k++) {
      if (time < points[k].t) {
        const u = Easing.apply(points[k].ease ?? 'inOutSine', (time - points[k - 1].t) / (points[k].t - points[k - 1].t));
        return Easing.lerp(points[k - 1].scale, points[k].scale, u);
      }
    }
    return points[points.length - 1].scale;
  }

  function rampScale(ramp, base) {
    const { t, inDuration, hold, outDuration, ease } = ramp;
    if (t < inDuration) return Easing.lerp(ramp.from, ramp.to, Easing.apply(ease, t / inDuration));
    if (t < inDuration + hold) return ramp.to;
    return Easing.lerp(ramp.to, base, Easing.apply(ease, (t - inDuration - hold) / Math.max(1e-6, outDuration)));
  }

  // Une image affichée de dt secondes (réelles, ou 1/60 fixe pendant l'enregistrement).
  // Renvoie le nombre de pas de jeu à jouer et alpha (part du pas suivant déjà écoulée).
  function advance(tc, dt) {
    let base = tc.base;
    if (tc.curve) {
      tc.curveTime += dt;
      base = clampScale(evaluateCurve(tc.curve, tc.curveTime));
    }
    tc.scale = base;
    if (tc.ramp) {
      tc.ramp.t += dt;
      const r = tc.ramp;
      tc.scale = clampScale(rampScale(r, base));
      if (r.t >= r.inDuration + r.hold + r.outDuration) tc.ramp = null;
    }
    if (tc.paused) {
      const steps = tc.pending;
      tc.pending = 0;
      tc.acc = 0;
      return { steps, alpha: 1 };
    }
    tc.acc += tc.scale * dt * 60;
    const steps = Math.min(MAX_STEPS, Math.floor(tc.acc + 1e-9));
    tc.acc = Math.min(1, tc.acc - steps);
    if (tc.acc < 1e-9) tc.acc = 0;
    // À 1× et plus, aucun besoin d'interpoler.
    return { steps, alpha: tc.scale >= 1 ? 1 : tc.acc };
  }

  return { MIN, MAX, MAX_STEPS, clampScale, create, setScale, setPaused, stepFrame, rampTo, setCurve, evaluateCurve, advance };
})();
