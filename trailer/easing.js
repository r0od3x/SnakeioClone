// Courbes d'accélération et interpolations des outils de tournage (caméra, ralentis).
const Easing = (() => {
  const CURVES = {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    inCubic: t => t ** 3,
    outCubic: t => 1 - (1 - t) ** 3,
    inOutCubic: t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    outExpo: t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
    inOutExpo: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  };

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  // Courbe par son nom (inOutCubic si inconnue), appliquée à t borné dans [0, 1].
  function apply(name, t) {
    return (CURVES[name] ?? CURVES.inOutCubic)(clamp01(t));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Angle le plus court entre a et b.
  function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // Amortissement exponentiel indépendant de la cadence : smoothing = constante de temps (s).
  // Renvoie la part du chemin à parcourir pendant dt (0 = immobile, 1 = arrivé).
  function damp(smoothing, dt) {
    if (!(smoothing > 0)) return 1;
    return 1 - Math.exp(-dt / smoothing);
  }

  return { CURVES, NAMES: Object.keys(CURVES), clamp01, apply, lerp, lerpAngle, damp };
})();
