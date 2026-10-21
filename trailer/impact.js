// Effets d'impact pour la bande-annonce (dessin seulement, la partie n'est pas modifiée).
// Dans le jeu, un serpent éliminé disparaît d'un coup et ses orbes grossissent en 20 pas de jeu :
// au ralenti, la victime « s'évapore » et les orbes restent minuscules pendant tout le moment fort.
// Ici, en temps du film (pas en temps de jeu) :
// - fantôme : le corps de la victime reste visible et se dissout pendant que ses orbes apparaissent ;
// - onde de choc : un anneau et un éclair doux au point d'impact, à la taille de la victime ;
// - orbes : toute nouvelle orbe grossit en POP secondes de film, ralenti ou non.
const Impact = (() => {
  const RING = 0.75;
  const GHOST = 0.55;
  const POP = 0.3;
  // Âge (pas de jeu) auquel une orbe est dessinée en entier (voir Food.fadeIn).
  const FULL_AGE = 20;

  function create() {
    return { list: [], seen: new WeakMap() };
  }

  // Élimination : point d'impact (la tête de la victime) et victime, à l'instant time (s de film).
  function add(fx, event, time) {
    if (event.type !== 'kill' || !event.victim) return null;
    const victim = event.victim;
    const radius = Math.max(90, Math.min(340, victim.r * 9));
    const impact = { x: victim.pos.x, y: victim.pos.y, victim, radius, t0: time };
    fx.list.push(impact);
    return impact;
  }

  function prune(fx, time) {
    fx.list = fx.list.filter(i => time - i.t0 < Math.max(RING, GHOST));
  }

  // Orbes neuves agrandies selon le temps du film ; renvoie la fonction qui remet leur âge.
  function popFoods(fx, foods, time) {
    const saved = [];
    for (const food of foods) {
      if (!fx.seen.has(food)) fx.seen.set(food, time);
      if (food.age >= FULL_AGE) continue;
      const shown = Math.min(FULL_AGE, ((time - fx.seen.get(food)) / POP) * FULL_AGE);
      if (shown > food.age) {
        saved.push([food, food.age]);
        food.age = shown;
      }
    }
    return () => {
      for (const [food, age] of saved) food.age = age;
    };
  }

  function easeOut(u) {
    return 1 - (1 - u) ** 3;
  }

  // Dessin dans le repère du monde (même transformation que SnakeArena.show).
  function draw(ctx, fx, cam, w, h, time, paint = (c, snake) => snake.show(c)) {
    prune(fx, time);
    if (!fx.list.length) return 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    if (cam.rotation) ctx.rotate(cam.rotation);
    ctx.translate(-cam.x, -cam.y);
    for (const i of fx.list) {
      const t = time - i.t0;
      if (t < GHOST) {
        ctx.save();
        ctx.globalAlpha = (1 - t / GHOST) ** 1.6;
        paint(ctx, i.victim);
        ctx.restore();
      }
      if (t < RING) {
        const u = t / RING;
        const r = i.radius * easeOut(u);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(i.x, i.y, 0, i.x, i.y, Math.max(1, r));
        glow.addColorStop(0, `rgba(255, 245, 210, ${0.55 * (1 - u)})`);
        glow.addColorStop(1, 'rgba(255, 245, 210, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(i.x, i.y, Math.max(1, r), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - u)})`;
        ctx.lineWidth = Math.max(1.5, i.radius * 0.06 * (1 - u));
        ctx.beginPath();
        ctx.arc(i.x, i.y, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    return fx.list.length;
  }

  return { RING, GHOST, POP, FULL_AGE, create, add, prune, popFoods, draw };
})();
