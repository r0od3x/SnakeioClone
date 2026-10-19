// Ralentis fluides : on garde les positions d'avant le dernier pas de jeu, et au dessin on place
// temporairement têtes, segments et proies entre « avant » et « maintenant » (alpha), puis on
// remet les vraies positions. La simulation n'est jamais modifiée.
const Interpolation = (() => {
  // Positions de tout ce qui bouge, avant un pas de jeu.
  function capture(state) {
    const snakes = new Map();
    for (const s of state.snakes) {
      const body = new Float64Array(s.body.length * 2);
      s.body.forEach((seg, i) => {
        body[i * 2] = seg.pos.x;
        body[i * 2 + 1] = seg.pos.y;
      });
      snakes.set(s, { x: s.pos.x, y: s.pos.y, body });
    }
    const foods = new Map();
    for (const f of state.foods) foods.set(f, { x: f.pos.x, y: f.pos.y });
    return { snakes, foods };
  }

  // Place l'affichage entre prev et l'état courant ; renvoie la fonction qui annule.
  function apply(state, prev, alpha) {
    if (!prev || alpha >= 1) return () => {};
    const saved = [];
    const move = (v, x, y) => {
      saved.push([v, v.x, v.y]);
      v.x += (x - v.x) * (1 - alpha);
      v.y += (y - v.y) * (1 - alpha);
    };
    for (const s of state.snakes) {
      const p = prev.snakes.get(s);
      if (!p) continue;
      move(s.pos, p.x, p.y);
      const n = Math.min(s.body.length, p.body.length / 2);
      for (let i = 0; i < n; i++) move(s.body[i].pos, p.body[i * 2], p.body[i * 2 + 1]);
    }
    for (const f of state.foods) {
      const p = prev.foods.get(f);
      if (p) move(f.pos, p.x, p.y);
    }
    return () => {
      for (let i = saved.length - 1; i >= 0; i--) {
        const [v, x, y] = saved[i];
        v.x = x;
        v.y = y;
      }
    };
  }

  return { capture, apply };
})();
