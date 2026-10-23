// Décor réaliste du mode Snake.io : une prairie vue de dessus. Aucun effet sur la simulation.
// - Tuile d'herbe (256 px, sans raccord visible) : fond vert bruité, milliers de brins, trèfles.
// - Grandes taches claires et sombres (tuile de 1024 px) : l'herbe n'est jamais uniforme.
// - Décorations fixes tirées une fois (pierres, fleurs, touffes, feuilles mortes).
// - Bord de l'arène : un cercle de pierres ; dehors, l'herbe est plus sombre.
// - Ombres de nuages qui glissent lentement par-dessus tout.
const Meadow = (() => {
  const TILE = 256;
  const PATCH = 1024;
  const STONE_GAP = 24;
  const BLADES = ['#5f8f32', '#6f9e3a', '#3e6b22', '#82b14a', '#4a7a28', '#93bf55', '#355d1d', '#a3c45f'];
  const FLOWERS = ['#f7f5ee', '#f4d03f', '#a98bdc', '#f2a7c3', '#ffffff'];
  const cache = {};

  // Générateur pseudo-aléatoire à graine : le décor est le même à chaque partie.
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  }

  function makeCanvas(size) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  // Dessine fn aux 9 positions décalées d'une tuile : ce qui déborde réapparaît de l'autre côté.
  function wrapped(size, fn) {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  }

  function grassTile() {
    if ('grass' in cache) return cache.grass;
    const c = makeCanvas(TILE);
    cache.grass = c;
    if (!c) return null;
    const g = c.getContext('2d');
    const rng = seeded(7);
    g.fillStyle = '#4b7a2a';
    g.fillRect(0, 0, TILE, TILE);
    // Bruit de fond : terre et herbe rase.
    for (let i = 0; i < 1100; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      const s = 2 + rng() * 7;
      g.fillStyle = rng() < 0.15 ? 'rgba(92, 70, 38, 0.18)' : `rgba(${60 + rng() * 60 | 0}, ${100 + rng() * 60 | 0}, ${30 + rng() * 30 | 0}, 0.22)`;
      wrapped(TILE, (dx, dy) => g.fillRect(x + dx, y + dy, s, s * (0.6 + rng() * 0.8)));
    }
    // Brins d'herbe.
    g.lineCap = 'round';
    for (let i = 0; i < 3200; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      const len = 3 + rng() * 9;
      const a = rng() * Math.PI * 2;
      g.strokeStyle = BLADES[Math.floor(rng() * BLADES.length)];
      g.globalAlpha = 0.55 + rng() * 0.45;
      g.lineWidth = 0.8 + rng() * 1.3;
      const ex = Math.cos(a) * len;
      const ey = Math.sin(a) * len;
      const bend = (rng() - 0.5) * len * 0.6;
      wrapped(TILE, (dx, dy) => {
        g.beginPath();
        g.moveTo(x + dx, y + dy);
        g.quadraticCurveTo(x + dx + ex * 0.5 - ey * bend / len, y + dy + ey * 0.5 + ex * bend / len, x + dx + ex, y + dy + ey);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
    // Trèfles.
    for (let i = 0; i < 26; i++) {
      const x = rng() * TILE;
      const y = rng() * TILE;
      const a = rng() * Math.PI * 2;
      wrapped(TILE, (dx, dy) => {
        for (let k = 0; k < 3; k++) {
          g.fillStyle = k % 2 ? '#5d9a35' : '#4f8a2c';
          g.beginPath();
          g.arc(x + dx + Math.cos(a + k * 2.1) * 2.6, y + dy + Math.sin(a + k * 2.1) * 2.6, 2.6, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
    return c;
  }

  // Grandes taches douces, sombres ou claires (alpha faible), répétées sur une tuile de 1024 px.
  function blobTile(key, seed, colors, count, alpha) {
    if (key in cache) return cache[key];
    const c = makeCanvas(PATCH);
    cache[key] = c;
    if (!c) return null;
    const g = c.getContext('2d');
    const rng = seeded(seed);
    for (let i = 0; i < count; i++) {
      const x = rng() * PATCH;
      const y = rng() * PATCH;
      const r = 80 + rng() * 200;
      const color = colors[Math.floor(rng() * colors.length)];
      wrapped(PATCH, (dx, dy) => {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        grad.addColorStop(0, `rgba(${color}, ${alpha})`);
        grad.addColorStop(1, `rgba(${color}, 0)`);
        g.fillStyle = grad;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      });
    }
    return c;
  }

  function pattern(ctx, key, canvas) {
    if (!canvas) return null;
    const k = `${key}Pattern`;
    if (!cache[k]) cache[k] = ctx.createPattern(canvas, 'repeat');
    return cache[k];
  }

  function randomInDisk(rng, radius) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * radius;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  }

  // Décor fixe de l'arène (tiré une fois par rayon).
  function decorations(radius, seed = 11) {
    const key = `deco${radius}-${seed}`;
    if (cache[key]) return cache[key];
    const rng = seeded(seed);
    const items = [];
    const add = (kind, count) => {
      for (let i = 0; i < count; i++) {
        const p = randomInDisk(rng, radius - 60);
        items.push({ kind, x: p.x, y: p.y, size: 0.7 + rng() * 0.8, angle: rng() * Math.PI * 2, tone: rng() });
      }
    };
    add('tuft', 420);
    add('flowers', 170);
    add('leaf', 90);
    add('rock', 45);
    // Les pierres et les touffes hautes passent au-dessus des petites décorations.
    const order = { leaf: 0, flowers: 1, tuft: 2, rock: 3 };
    items.sort((a, b) => order[a.kind] - order[b.kind]);
    cache[key] = items;
    return items;
  }

  // Pierres du bord, une tous les STONE_GAP px sur le cercle.
  function stones(radius, seed = 23) {
    const key = `stones${radius}-${seed}`;
    if (cache[key]) return cache[key];
    const rng = seeded(seed);
    const count = Math.ceil(Math.PI * 2 * radius / STONE_GAP);
    const list = Array.from({ length: count }, (_, i) => {
      const a = i / count * Math.PI * 2 + (rng() - 0.5) * 0.004;
      const d = radius + 6 + (rng() - 0.5) * 8;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, size: 11 + rng() * 9, angle: rng() * Math.PI, tone: rng() };
    });
    cache[key] = list;
    return list;
  }

  function rock(ctx, x, y, size, angle, tone) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(14, 24, 6, 0.35)';
    ctx.beginPath();
    ctx.ellipse(size * 0.25, size * 0.35, size, size * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    const light = 120 + tone * 40 | 0;
    const grad = ctx.createRadialGradient(-size * 0.35, -size * 0.35, size * 0.1, 0, 0, size);
    grad.addColorStop(0, `rgb(${light + 40}, ${light + 38}, ${light + 30})`);
    grad.addColorStop(1, `rgb(${light - 45}, ${light - 45}, ${light - 50})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(96, 128, 54, 0.45)';
    ctx.beginPath();
    ctx.ellipse(size * 0.3, size * 0.2, size * 0.35, size * 0.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawItem(ctx, item) {
    const { x, y, size, angle, tone } = item;
    if (item.kind === 'rock') {
      rock(ctx, x, y, 10 + size * 14, angle, tone);
    } else if (item.kind === 'tuft') {
      ctx.lineCap = 'round';
      const blades = 7 + (tone * 6 | 0);
      for (let k = 0; k < blades; k++) {
        const a = angle + k / blades * Math.PI * 2 + Math.sin(k * 3.1) * 0.3;
        const len = (10 + (k * 7 % 9)) * size;
        ctx.strokeStyle = BLADES[(k + (tone * 8 | 0)) % BLADES.length];
        ctx.lineWidth = 1.6 * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 2, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
    } else if (item.kind === 'flowers') {
      const count = 3 + (tone * 4 | 0);
      const color = FLOWERS[(tone * FLOWERS.length) | 0];
      for (let k = 0; k < count; k++) {
        const fx = x + Math.cos(angle + k * 2.4) * 9 * size * (k ? 1 : 0);
        const fy = y + Math.sin(angle + k * 2.4) * 9 * size * (k ? 1 : 0);
        const pr = 2.6 * size;
        ctx.fillStyle = color;
        for (let p = 0; p < 5; p++) {
          const pa = angle + p * Math.PI * 0.4;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(pa) * pr, fy + Math.sin(pa) * pr, pr * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#e8a628';
        ctx.beginPath();
        ctx.arc(fx, fy, pr * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (item.kind === 'leaf') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      const s = 8 * size;
      ctx.fillStyle = tone < 0.5 ? '#a8742a' : '#c79a3a';
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 50, 20, 0.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  function inView(p, margin, view) {
    return p.x > view.left - margin && p.x < view.right + margin && p.y > view.top - margin && p.y < view.bottom + margin;
  }

  // Variantes pré-rendues du décor (taille 1, angle 0, résolution double) : dessiner une
  // décoration revient à un drawImage tourné et mis à l'échelle.
  const VARIANTS = 6;
  const SPRITE_SIZE = { tuft: 72, flowers: 64, leaf: 36, rock: 84 };

  function itemSprite(kind, variant) {
    const key = `sprite-${kind}-${variant}`;
    if (key in cache) return cache[key];
    const size = SPRITE_SIZE[kind];
    const c = makeCanvas(size * 2);
    cache[key] = c;
    if (!c) return null;
    const g = c.getContext('2d');
    g.scale(2, 2);
    drawItem(g, { kind, x: size / 2, y: size / 2, size: 1, angle: 0, tone: (variant + 0.5) / VARIANTS });
    return c;
  }

  function drawDecoration(ctx, item) {
    const variant = Math.min(VARIANTS - 1, Math.floor(item.tone * VARIANTS));
    const sprite = itemSprite(item.kind, variant);
    if (!sprite) return drawItem(ctx, item);
    const size = SPRITE_SIZE[item.kind] * item.size;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.angle);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // Vrai si toute la vue est loin à l'intérieur du cercle : ni bord ni dehors à dessiner.
  function deepInside(view, radius) {
    return [[view.left, view.top], [view.right, view.top], [view.left, view.bottom], [view.right, view.bottom]]
      .every(([x, y]) => Math.hypot(x, y) < radius * 0.86);
  }

  // Sol, décor et bord de l'arène (coordonnées du monde).
  function draw(ctx, view, radius) {
    const vw = view.right - view.left;
    const vh = view.bottom - view.top;
    const grass = pattern(ctx, 'grass', grassTile()) ?? '#4b7a2a';
    const patches = pattern(ctx, 'patches', blobTile('patches', 3, ['31, 61, 16', '156, 194, 90', '120, 100, 50'], 30, 0.28));
    const inside = deepInside(view, radius);
    if (!inside) {
      // Dehors : herbe haute et sombre ; le dedans est limité au disque.
      ctx.fillStyle = grass;
      ctx.fillRect(view.left, view.top, vw, vh);
      ctx.fillStyle = 'rgba(14, 26, 8, 0.62)';
      ctx.fillRect(view.left, view.top, vw, vh);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
    }
    // Dedans : herbe claire, taches, décor.
    ctx.fillStyle = grass;
    ctx.fillRect(view.left, view.top, vw, vh);
    if (patches) {
      ctx.fillStyle = patches;
      ctx.fillRect(view.left, view.top, vw, vh);
    }
    for (const item of decorations(radius)) if (inView(item, 50, view)) drawDecoration(ctx, item);
    if (!inside) {
      // Assombrissement près du bord, puis cercle de pierres.
      const edge = ctx.createRadialGradient(0, 0, radius * 0.86, 0, 0, radius);
      edge.addColorStop(0, 'rgba(20, 34, 10, 0)');
      edge.addColorStop(1, 'rgba(20, 34, 10, 0.45)');
      ctx.fillStyle = edge;
      ctx.fillRect(view.left, view.top, vw, vh);
      ctx.restore();
      for (const s of stones(radius)) {
        if (inView(s, 30, view)) drawDecoration(ctx, { kind: 'rock', x: s.x, y: s.y, size: s.size / 24, angle: s.angle, tone: s.tone });
      }
    }
  }

  // Le sol ne bouge pas : il est dessiné une fois par carré de CHUNK px du monde, gardé en cache
  // (les MAX_CHUNKS derniers utilisés), et chaque image ne fait qu'une vingtaine de drawImage.
  // Les carrés débordent d'1 px de chaque côté pour qu'aucun joint ne se voie entre eux.
  const CHUNK = 512;
  const chunks = new Map();
  let chunkRes = 1;

  function chunk(i, j, radius) {
    const key = `${i},${j},${radius}`;
    let c = chunks.get(key);
    if (c) {
      chunks.delete(key);
      chunks.set(key, c);
      return c;
    }
    const size = CHUNK + 2;
    c = makeCanvas(Math.ceil(size * chunkRes));
    const g = c.getContext('2d');
    const left = i * CHUNK - 1;
    const top = j * CHUNK - 1;
    g.scale(chunkRes, chunkRes);
    g.translate(-left, -top);
    draw(g, { left, top, right: left + size, bottom: top + size }, radius);
    chunks.set(key, c);
    // Le moins récemment vu part en premier.
    if (chunks.size > (chunkRes === 1 ? 64 : 36)) chunks.delete(chunks.keys().next().value);
    return c;
  }

  // Comme draw, en passant par le cache. Gros plans (zoom > 1,1, outils de tournage) : carrés
  // en double résolution pour rester nets.
  function drawCached(ctx, view, radius, zoom = 1) {
    if (typeof document === 'undefined') return draw(ctx, view, radius);
    const res = zoom > 1.1 ? 2 : 1;
    if (res !== chunkRes) {
      chunks.clear();
      chunkRes = res;
    }
    for (let j = Math.floor(view.top / CHUNK); j * CHUNK < view.bottom; j++) {
      for (let i = Math.floor(view.left / CHUNK); i * CHUNK < view.right; i++) {
        ctx.drawImage(chunk(i, j, radius), i * CHUNK - 1, j * CHUNK - 1, CHUNK + 2, CHUNK + 2);
      }
    }
  }

  // Ombres de nuages qui glissent lentement (par-dessus les serpents).
  function clouds(ctx, view, frame) {
    const tile = blobTile('clouds', 19, ['10, 22, 6'], 9, 0.2);
    const p = pattern(ctx, 'clouds', tile);
    if (!p) return;
    if (p.setTransform && typeof DOMMatrix !== 'undefined') {
      p.setTransform(new DOMMatrix().translate(frame * 0.25, frame * 0.1).scale(1.8));
    }
    ctx.fillStyle = p;
    ctx.fillRect(view.left, view.top, view.right - view.left, view.bottom - view.top);
  }

  return { TILE, PATCH, STONE_GAP, seeded, decorations, stones, draw, drawCached, clouds, drawRock: rock };
})();
