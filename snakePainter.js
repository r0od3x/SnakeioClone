// Dessin réaliste d'un serpent vu de dessus (canvas 2D). Aucun effet sur la simulation.
// Le corps est un polygone : la ligne médiane (tête + segments) décalée de ± la demi-largeur,
// qui s'affine vers la queue. Dans ce contour : motif de l'espèce, écailles, ombrage
// cylindrique (bords sombres, reflet du côté de la lumière). Puis ombre portée sur l'herbe,
// tête (forme, yeux, narines, langue), hotte du cobra et sonnette du crotale.
const SnakePainter = (() => {
  // Lumière venant d'en haut à gauche (vecteur unitaire).
  const LIGHT = { x: -0.6, y: -0.8 };
  // Le corps garde sa largeur jusqu'à TAPER_START (fraction de la longueur), puis s'affine
  // jusqu'à TAIL_WIDTH × r au bout de la queue.
  const TAPER_START = 0.45;
  const TAIL_WIDTH = 0.16;
  let scaleCanvas = null;
  let scalePattern = null;
  const hoods = new WeakMap();

  // Demi-largeur du corps au point i (0 = tête, n - 1 = bout de la queue).
  function widthAt(i, n, r) {
    const t = n > 1 ? i / (n - 1) : 0;
    if (t <= TAPER_START) return r * (0.84 + 0.16 * Math.min(1, t / 0.06));
    const k = (t - TAPER_START) / (1 - TAPER_START);
    return r * (1 - (1 - TAIL_WIDTH) * Math.pow(k, 1.4));
  }

  function points(snake) {
    return [{ x: snake.pos.x, y: snake.pos.y }, ...snake.body];
  }

  // Normale unitaire en chaque point (à gauche de la direction tête -> avant).
  function normals(pts) {
    const n = pts.length;
    const out = [];
    let last = { x: 0, y: 1 };
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-9) last = { x: -dy / d, y: dx / d };
      out.push(last);
    }
    return out;
  }

  function offset(pts, nrm, f) {
    return pts.map((p, i) => ({ x: p.x + nrm[i].x * f(i), y: p.y + nrm[i].y * f(i) }));
  }

  // Contour du corps : bord gauche de la tête à la queue, pointe, bord droit en revenant.
  function outline(pts, nrm, w) {
    const n = pts.length;
    const left = offset(pts, nrm, i => w[i]);
    const right = offset(pts, nrm, i => -w[i]);
    const last = pts[n - 1];
    const prev = pts[n - 2];
    const d = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
    const tip = { x: last.x + (last.x - prev.x) / d * w[n - 1] * 1.6, y: last.y + (last.y - prev.y) / d * w[n - 1] * 1.6 };
    return [...left, tip, ...right.reverse()];
  }

  function polygon(ctx, poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }

  function polyline(ctx, line) {
    ctx.beginPath();
    ctx.moveTo(line[0].x, line[0].y);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
  }

  // Pseudo-aléatoire stable par segment : les taches ne bougent pas d'une image à l'autre.
  function hash(i) {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  function ellipseAt(ctx, p, nrm, along, across) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, along, across, Math.atan2(-nrm.x, nrm.y), 0, Math.PI * 2);
  }

  // Ombre portée floue sur l'herbe : on dessine la forme très loin hors écran et on ne garde
  // que son ombre, ramenée sous le serpent (les ombres ignorent la transformation du canvas).
  // Le décalage annule le déplacement réel à l'écran (far × colonne x de la matrice), ce qui
  // reste juste quand la caméra est tournée ; la direction de l'ombre reste fixe à l'écran.
  function castShadow(ctx, draw, r) {
    const m = ctx.getTransform();
    const scale = Math.hypot(m.a, m.b) || 1;
    const far = 100000;
    ctx.save();
    ctx.translate(-far, 0);
    ctx.shadowColor = 'rgba(14, 24, 6, 0.55)';
    ctx.shadowBlur = r * 0.9 * scale;
    ctx.shadowOffsetX = far * m.a + r * 0.45 * scale;
    ctx.shadowOffsetY = far * m.b + r * 0.7 * scale;
    ctx.fillStyle = '#000000';
    draw();
    ctx.fill();
    ctx.restore();
  }

  // Tuile d'écailles (arcs qui se chevauchent), répétée sur le corps et la tête.
  function scales(ctx) {
    if (scalePattern) return scalePattern;
    if (typeof document === 'undefined') return null;
    scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 24;
    scaleCanvas.height = 20;
    const g = scaleCanvas.getContext('2d');
    for (const [ox, oy] of [[0, 0], [12, 10], [24, 0], [0, 20], [24, 20], [12, -10], [-12, 10], [36, 10], [12, 30]]) {
      g.beginPath();
      g.arc(ox, oy, 11, 0.15 * Math.PI, 0.85 * Math.PI);
      g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      g.lineWidth = 1.6;
      g.stroke();
      g.beginPath();
      g.arc(ox, oy - 2, 9, 1.2 * Math.PI, 1.8 * Math.PI);
      g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      g.lineWidth = 1.2;
      g.stroke();
    }
    scalePattern = ctx.createPattern(scaleCanvas, 'repeat');
    return scalePattern;
  }

  function fillScales(ctx, r, bounds, alpha) {
    const pattern = scales(ctx);
    if (!pattern) return;
    // Écailles proportionnelles à la taille du serpent.
    if (pattern.setTransform && typeof DOMMatrix !== 'undefined') pattern.setTransform(new DOMMatrix().scale(r / 22));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.restore();
  }

  function bounds(poly, pad) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of poly) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }

  // Motif du dos selon l'espèce (dessiné à l'intérieur du contour, qui sert de masque).
  function drawPattern(ctx, sp, pts, nrm, w, spacing) {
    const p = sp.pattern;
    const n = pts.length;
    const every = p.every ?? 5;
    if (p.kind === 'bands') {
      // Anneaux : on regroupe les segments consécutifs de même couleur en un quadrilatère.
      let start = 0;
      for (let i = 1; i <= n; i++) {
        const color = SnakeSpecies.bandColor(sp, start);
        if (i < n && SnakeSpecies.bandColor(sp, i) === color) continue;
        if (color !== sp.base) {
          const end = Math.min(i, n - 1);
          const idx = [];
          for (let k = start; k <= end; k++) idx.push(k);
          const left = idx.map(k => ({ x: pts[k].x + nrm[k].x * w[k] * 1.5, y: pts[k].y + nrm[k].y * w[k] * 1.5 }));
          const right = idx.map(k => ({ x: pts[k].x - nrm[k].x * w[k] * 1.5, y: pts[k].y - nrm[k].y * w[k] * 1.5 })).reverse();
          if (idx.length > 1) {
            polygon(ctx, [...left, ...right]);
            ctx.fillStyle = color;
            ctx.fill();
          }
        }
        start = i;
      }
      return;
    }
    if (p.kind === 'stripes') {
      polyline(ctx, pts);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = w[0] * 0.34;
      ctx.lineJoin = 'round';
      ctx.stroke();
      for (const side of [-1, 1]) {
        polyline(ctx, offset(pts, nrm, i => side * w[i] * 0.62));
        ctx.strokeStyle = p.side;
        ctx.lineWidth = w[0] * 0.16;
        ctx.stroke();
      }
      return;
    }
    for (let i = 3; i < n - 1; i += every) {
      const c = pts[i];
      const nm = nrm[i];
      const wi = w[i];
      if (p.kind === 'saddles') {
        // Selle sur le dos (les flancs restent de la couleur de fond), petite tache sur chaque flanc
        // entre deux selles.
        const color = p.tail && i > n * 0.72 ? p.tail : p.color;
        ellipseAt(ctx, c, nm, spacing * every * 0.3, wi * 0.78);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = wi * 0.12;
        ctx.stroke();
        const j = Math.min(n - 1, i + Math.floor(every / 2));
        for (const side of [-1, 1]) {
          const at = { x: pts[j].x + nrm[j].x * w[j] * 0.92 * side, y: pts[j].y + nrm[j].y * w[j] * 0.92 * side };
          ellipseAt(ctx, at, nrm[j], spacing * every * 0.14, w[j] * 0.28);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = w[j] * 0.08;
          ctx.stroke();
        }
      } else if (p.kind === 'blotches') {
        // Taches irrégulières (deux ellipses fondues), alternées d'un flanc à l'autre,
        // avec un cœur sombre allongé.
        const h = hash(i);
        const side = (i / every) % 2 ? 1 : -1;
        const lateral = side * (0.18 + h * 0.3) * wi;
        const at = { x: c.x + nm.x * lateral, y: c.y + nm.y * lateral };
        const along = spacing * every * (0.32 + h * 0.16);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = wi * 0.08;
        ellipseAt(ctx, at, nm, along, wi * (0.55 + hash(i + 7) * 0.25));
        ctx.fill();
        ctx.stroke();
        const k = Math.min(n - 1, i + 1);
        const off = { x: at.x + nrm[k].x * -lateral * 0.6, y: at.y + nrm[k].y * -lateral * 0.6 };
        ellipseAt(ctx, off, nrm[k], along * 0.6, wi * 0.42);
        ctx.fill();
        ellipseAt(ctx, at, nm, along * 0.45, wi * (0.08 + h * 0.08));
        ctx.fillStyle = SnakeSpecies.rgba(sp.base, 0.85);
        ctx.fill();
      } else if (p.kind === 'diamonds') {
        const dir = { x: nm.y, y: -nm.x };
        const a = spacing * every * 0.5;
        const b = wi * 0.92;
        polygon(ctx, [{ x: c.x + dir.x * a, y: c.y + dir.y * a }, { x: c.x + nm.x * b, y: c.y + nm.y * b },
          { x: c.x - dir.x * a, y: c.y - dir.y * a }, { x: c.x - nm.x * b, y: c.y - nm.y * b }]);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = wi * 0.18;
        ctx.stroke();
      } else if (p.kind === 'spots') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, wi * 0.2, 0, Math.PI * 2);
        ctx.fill();
        const side = (i / every) % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.arc(c.x + nm.x * wi * 0.58 * side, c.y + nm.y * wi * 0.58 * side, wi * 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'chevrons') {
        const j = Math.min(n - 1, i + 2);
        ctx.beginPath();
        ctx.moveTo(pts[j].x + nrm[j].x * w[j] * 0.95, pts[j].y + nrm[j].y * w[j] * 0.95);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(pts[j].x - nrm[j].x * w[j] * 0.95, pts[j].y - nrm[j].y * w[j] * 0.95);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = wi * 0.24;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
  }

  // Bords plus sombres et reflet décalé vers la lumière : le corps paraît rond et brillant.
  function shading(ctx, poly, pts, nrm, w, sp, r) {
    polygon(ctx, poly);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.lineWidth = r * 0.75;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const sheen = sp.sheen ?? 0.22;
    const ridge = offset(pts, nrm, i => w[i] * 0.38 * (nrm[i].x * LIGHT.x + nrm[i].y * LIGHT.y));
    polyline(ctx, ridge);
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255, 255, 248, ${sheen * 0.45})`;
    ctx.lineWidth = r * 0.75;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 248, ${sheen})`;
    ctx.lineWidth = r * 0.28;
    ctx.stroke();
  }

  function headPath(ctx, shape, r) {
    ctx.beginPath();
    if (shape === 'triangular') {
      ctx.moveTo(r * 1.45, 0);
      ctx.quadraticCurveTo(r * 1.35, r * 0.72, r * 0.2, r * 1.12);
      ctx.quadraticCurveTo(-r * 0.6, r * 1.05, -r * 0.8, r * 0.55);
      ctx.lineTo(-r * 0.8, -r * 0.55);
      ctx.quadraticCurveTo(-r * 0.6, -r * 1.05, r * 0.2, -r * 1.12);
      ctx.quadraticCurveTo(r * 1.35, -r * 0.72, r * 1.45, 0);
    } else if (shape === 'coffin') {
      ctx.ellipse(r * 0.35, 0, r * 1.35, r * 0.82, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(r * 0.3, 0, r * 1.2, r * 0.95, 0, 0, Math.PI * 2);
    }
    ctx.closePath();
  }

  function tongue(ctx, r, extension) {
    const start = r * 1.3;
    const len = r * 1.1 * extension;
    ctx.strokeStyle = '#a3123f';
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(start, 0);
    ctx.lineTo(start + len, 0);
    ctx.lineTo(start + len + r * 0.35 * extension, r * 0.2 * extension);
    ctx.moveTo(start + len, 0);
    ctx.lineTo(start + len + r * 0.35 * extension, -r * 0.2 * extension);
    ctx.stroke();
  }

  function eyes(ctx, sp, r, look) {
    const x = sp.headShape === 'triangular' ? r * 0.5 : r * 0.62;
    for (const side of [-1, 1]) {
      const y = r * 0.62 * side;
      const iris = ctx.createRadialGradient(x - r * 0.05, y - r * 0.05, 0, x, y, r * 0.24);
      iris.addColorStop(0, SnakeSpecies.mix(sp.eye, '#ffffff', 0.35));
      iris.addColorStop(1, sp.eye);
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = r * 0.05;
      ctx.stroke();
      const px = x + Math.cos(look) * r * 0.05;
      const py = y + Math.sin(look) * r * 0.05;
      ctx.fillStyle = '#050505';
      ctx.beginPath();
      if (sp.pupil === 'slit') ctx.ellipse(px, py, r * 0.045, r * 0.18, 0, 0, Math.PI * 2);
      else ctx.arc(px, py, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(x - r * 0.08, y - r * 0.08, r * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    // Narines.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(r * (sp.headShape === 'triangular' ? 1.22 : 1.3), r * 0.22 * side, r * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHead(ctx, snake) {
    const sp = snake.species;
    const r = snake.r;
    const heading = snake.vel.heading();
    const look = snake.lookAt
      ? Math.atan2(snake.lookAt.y - snake.pos.y, snake.lookAt.x - snake.pos.x) - heading
      : 0;
    ctx.save();
    ctx.translate(snake.pos.x, snake.pos.y);
    ctx.rotate(heading);
    // La langue sort régulièrement (et plus souvent en chasse).
    const period = snake.mode === 'chasse' ? 50 : 110;
    const cycle = (snake.age + (snake.tonguePhase ?? 0)) % period;
    if (cycle < 16) tongue(ctx, r, Math.sin(cycle / 16 * Math.PI));
    castShadow(ctx, () => headPath(ctx, sp.headShape, r), r);
    headPath(ctx, sp.headShape, r);
    const shine = ctx.createRadialGradient(r * 0.1, -r * 0.35, r * 0.1, r * 0.2, 0, r * 1.4);
    shine.addColorStop(0, SnakeSpecies.mix(sp.head, '#ffffff', 0.28));
    shine.addColorStop(1, sp.head);
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.save();
    headPath(ctx, sp.headShape, r);
    ctx.clip();
    fillScales(ctx, r * 0.8, { x: -r * 2, y: -r * 2, w: r * 4, h: r * 4 }, 0.3);
    headPath(ctx, sp.headShape, r);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = r * 0.45;
    ctx.stroke();
    ctx.restore();
    headPath(ctx, sp.headShape, r);
    ctx.strokeStyle = SnakeSpecies.shade(sp.head, 0.4);
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.stroke();
    eyes(ctx, sp, r, look);
    ctx.restore();
  }

  // Hotte du cobra : elle s'ouvre en chasse, en fuite ou en accélération.
  function drawHood(ctx, snake, pts, nrm) {
    const open = snake.boosting || snake.mode === 'chasse' || snake.mode === 'fuite';
    const level = (hoods.get(snake) ?? 0) + ((open ? 1 : 0) - (hoods.get(snake) ?? 0)) * 0.12;
    hoods.set(snake, level);
    if (level < 0.05 || pts.length < 4) return;
    const r = snake.r;
    const c = pts[2];
    const sp = snake.species;
    ellipseAt(ctx, c, nrm[2], r * 1.25, r * (1 + 1.1 * level));
    ctx.fillStyle = SnakeSpecies.shade(sp.base, 0.95);
    ctx.fill();
    ctx.strokeStyle = SnakeSpecies.shade(sp.base, 0.45);
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
    ellipseAt(ctx, c, nrm[2], r * 0.7, r * (0.5 + 0.7 * level));
    ctx.strokeStyle = SnakeSpecies.rgba(sp.pattern.color, 0.7);
    ctx.lineWidth = r * 0.16;
    ctx.stroke();
  }

  // Sonnette du crotale : anneaux beiges au bout de la queue, qui vibrent en fuite ou en accélération.
  function drawRattle(ctx, snake, pts, w) {
    const n = pts.length;
    if (n < 3) return;
    const last = pts[n - 1];
    const prev = pts[n - 3];
    const a = Math.atan2(last.y - prev.y, last.x - prev.x);
    const shaking = snake.boosting || snake.mode === 'fuite';
    const shake = shaking ? Math.sin(snake.age * 1.7) * snake.r * 0.12 : 0;
    const size = Math.max(2.5, w[n - 1] * 2.2);
    ctx.save();
    ctx.translate(last.x, last.y);
    ctx.rotate(a);
    ctx.translate(0, shake);
    for (let k = 0; k < 4; k++) {
      const s = size * (1 - k * 0.14);
      ctx.beginPath();
      ctx.ellipse(k * s * 0.75 + s * 0.4, 0, s * 0.45, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = k % 2 ? '#cdbb8e' : '#d9c99f';
      ctx.fill();
      ctx.strokeStyle = '#6d5d3b';
      ctx.lineWidth = Math.max(0.8, s * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, snake) {
    const pts = points(snake);
    const n = pts.length;
    if (!ctx || n < 2) return;
    const sp = snake.species;
    const r = snake.r;
    const nrm = normals(pts);
    const w = pts.map((_, i) => widthAt(i, n, r));
    const poly = outline(pts, nrm, w);
    ctx.save();
    ctx.lineJoin = 'round';
    castShadow(ctx, () => polygon(ctx, poly), r);
    polygon(ctx, poly);
    ctx.fillStyle = sp.base;
    ctx.fill();
    ctx.save();
    polygon(ctx, poly);
    ctx.clip();
    drawPattern(ctx, sp, pts, nrm, w, snake.spacing);
    fillScales(ctx, r, bounds(poly, r), 0.35);
    shading(ctx, poly, pts, nrm, w, sp, r);
    ctx.restore();
    polygon(ctx, poly);
    ctx.strokeStyle = SnakeSpecies.shade(sp.base, 0.35);
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.stroke();
    if (sp.rattle) drawRattle(ctx, snake, pts, w);
    if (sp.hood) drawHood(ctx, snake, pts, nrm);
    drawHead(ctx, snake);
    ctx.restore();
  }

  return { LIGHT, TAPER_START, TAIL_WIDTH, widthAt, points, normals, offset, outline, hash, castShadow, draw };
})();
