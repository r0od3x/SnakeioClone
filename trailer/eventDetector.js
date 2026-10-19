// Moments forts repérés après chaque pas de jeu, pour déclencher un ralenti ou un changement
// de caméra : élimination (kill), frôlement d'une tête contre un autre serpent (nearMiss), petit
// serpent encerclé par un gros (encircle). Lecture seule : rien n'est modifié dans la partie.
const EventDetector = (() => {
  const DEFAULTS = {
    // Frôlement : marge entre le contact et la tête plus petite que nearFactor × (r1 + r2).
    nearFactor: 0.6,
    // Encerclement : part des directions (24 secteurs) couvertes par le corps du gros serpent.
    coverage: 0.8, sectors: 24, minRatio: 2,
    // Images (pas de jeu) avant de signaler à nouveau le même couple.
    cooldown: { nearMiss: 120, encircle: 240 },
  };

  function create(options = {}) {
    return { ...DEFAULTS, ...options, last: new Map(), ids: new WeakMap(), nextId: 1 };
  }

  function id(det, snake) {
    if (!det.ids.has(snake)) det.ids.set(snake, det.nextId++);
    return det.ids.get(snake);
  }

  function ready(det, frame, type, a, b) {
    const key = `${type}:${id(det, a)}:${id(det, b)}`;
    const last = det.last.get(key);
    if (last !== undefined && frame - last < det.cooldown[type]) return false;
    det.last.set(key, frame);
    return true;
  }

  // Avant le pas : qui est là, et où (pour situer une élimination).
  function snapshot(state) {
    return new Map(state.snakes.map(s => [s, { x: s.pos.x, y: s.pos.y }]));
  }

  // Plus petite marge entre la tête de a et le corps (tête comprise) de b.
  function clearance(a, b) {
    let best = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) - (a.r * 0.8 + b.r);
    let point = b.pos;
    for (const seg of b.body) {
      const d = Math.hypot(a.pos.x - seg.x, a.pos.y - seg.y) - (a.r * 0.8 + b.r);
      if (d < best) {
        best = d;
        point = seg;
      }
    }
    return { margin: best, point };
  }

  function coverage(det, small, big) {
    const reach = Math.max(150, big.bodyLength() * 0.25);
    const filled = new Set();
    for (const seg of big.body) {
      const dx = seg.x - small.pos.x;
      const dy = seg.y - small.pos.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      filled.add(Math.floor(a / (Math.PI * 2) * det.sectors) % det.sectors);
    }
    return filled.size / det.sectors;
  }

  function detect(det, state, before = new Map()) {
    const events = [];
    const frame = state.frame;
    for (const [snake, at] of before) {
      if (state.snakes.includes(snake)) continue;
      const entry = [...state.feed].reverse().find(e => e.victim === snake.name && e.frame === frame);
      events.push({ type: 'kill', x: at.x, y: at.y, victim: snake, killer: entry?.killer ?? null, frame });
    }
    for (const a of state.snakes) {
      for (const b of state.snakes) {
        if (a === b) continue;
        const reach = b.bodyLength() + a.r + b.r + 60;
        const dx = a.pos.x - b.pos.x;
        const dy = a.pos.y - b.pos.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        const { margin, point } = clearance(a, b);
        const heading = a.vel.x * (point.x - a.pos.x) + a.vel.y * (point.y - a.pos.y);
        if (margin > 0 && margin < det.nearFactor * (a.r + b.r) && heading > 0 && ready(det, frame, 'nearMiss', a, b)) {
          events.push({ type: 'nearMiss', x: (a.pos.x + point.x) / 2, y: (a.pos.y + point.y) / 2, actors: [a, b], frame });
        }
        if (b.mass >= a.mass * det.minRatio && b.body.length >= 30 && coverage(det, a, b) >= det.coverage
          && ready(det, frame, 'encircle', a, b)) {
          events.push({ type: 'encircle', x: a.pos.x, y: a.pos.y, actors: [b, a], frame });
        }
      }
    }
    return events;
  }

  return { DEFAULTS, create, snapshot, clearance, coverage, detect };
})();
