// Écran « Éliminé » du mode Snake.io : le mot est écrit par des centaines de rats (Rat).
// À la mort du joueur, les rats accourent des bords de l'écran vers les points des lettres ;
// la souris les fait fuir. À la réapparition, ils s'enfuient hors de l'écran puis disparaissent.
// Gestion de l'écran seulement : chaque rat calcule et applique ses forces lui-même.
const RatTitle = (() => {
  const TEXT = 'Éliminé';
  const MAX_RATS = 700;
  const STEP = 8;

  function create() {
    return { rats: [], active: false };
  }

  // Points des lettres : pixels opaques d'une image {width, height, data} pris tous les step px.
  function sample(image, step = STEP) {
    const points = [];
    for (let y = 0; y < image.height; y += step) {
      for (let x = 0; x < image.width; x += step) {
        if (image.data[(y * image.width + x) * 4 + 3] > 128) points.push({ x, y });
      }
    }
    return points;
  }

  // Garde au plus max points, répartis régulièrement dans la liste.
  function thin(points, max = MAX_RATS) {
    if (points.length <= max) return points;
    const stride = points.length / max;
    return Array.from({ length: max }, (_, i) => points[Math.floor(i * stride)]);
  }

  // Le mot dessiné sur un canvas caché, centré un peu au-dessus du milieu de l'écran.
  function textPoints(w, h, text = TEXT) {
    if (typeof document === 'undefined') return [];
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(w));
    canvas.height = Math.max(1, Math.floor(h));
    const g = canvas.getContext('2d');
    const size = Math.floor(Math.min(w * 0.19, h * 0.34));
    g.font = `900 ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000000';
    g.fillText(text, w / 2, h * 0.42);
    return thin(sample(g.getImageData(0, 0, canvas.width, canvas.height), STEP));
  }

  // Un rat par point, parti d'un bord de l'écran tiré au hasard.
  function form(points, w, h, rng = Math.random) {
    return points.map(p => {
      const side = Math.floor(rng() * 4);
      const t = rng();
      const start = [
        { x: t * w, y: -20 }, { x: w + 20, y: t * h }, { x: t * w, y: h + 20 }, { x: -20, y: t * h },
      ][side];
      return new Rat(start.x, start.y, p);
    });
  }

  // Chaque rat vise un point loin hors de l'écran, dans la direction opposée au centre.
  function scatter(rats, w, h) {
    for (const rat of rats) {
      const dx = rat.pos.x - w / 2;
      const dy = rat.pos.y - h / 2;
      const d = Math.hypot(dx, dy) || 1;
      rat.home.set(w / 2 + dx / d * (w + h), h / 2 + dy / d * (w + h));
      rat.slowRadius = 1;
    }
  }

  function offScreen(rat, w, h) {
    return rat.pos.x < -40 || rat.pos.x > w + 40 || rat.pos.y < -40 || rat.pos.y > h + 40;
  }

  // Une image : formation à la mort, fuite à la réapparition, puis forces et locomotion des rats.
  // points : points des lettres à utiliser (par défaut, le mot rendu sur un canvas caché).
  function update(title, active, pointer, w, h, rng = Math.random, points = null) {
    if (active && !title.active) title.rats = form(points ?? textPoints(w, h), w, h, rng);
    if (!active && title.active) scatter(title.rats, w, h);
    title.active = active;
    for (const rat of title.rats) {
      rat.applyBehaviors(active ? pointer : null);
      rat.update();
    }
    if (!active) title.rats = title.rats.filter(rat => !offScreen(rat, w, h));
  }

  function draw(ctx, title, w, h) {
    if (!ctx || !title.rats.length) return;
    if (title.active) {
      const veil = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      veil.addColorStop(0, 'rgba(10, 16, 6, 0.35)');
      veil.addColorStop(1, 'rgba(10, 16, 6, 0.8)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
    }
    const sprite = PreySprites.get('mouse');
    for (const rat of title.rats) rat.show(ctx, sprite);
  }

  return { TEXT, MAX_RATS, STEP, create, sample, thin, textPoints, form, scatter, update, draw };
})();
