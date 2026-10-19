// Navigateur d'un joueur : rejoint la partie, envoie le point visé et l'accélération, reçoit
// ce qui l'entoure 20 fois par seconde et le dessine avec les assets de Snake.io (prairie,
// espèces réalistes, proies). Le rendu interpole entre deux instantanés pour rester fluide.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // Retard d'affichage (ms) : on dessine entre les deux derniers instantanés reçus.
  const RENDER_DELAY = 100;
  const KINDS = ['cricket', 'egg', 'frog', 'mouse'];
  const FOOD_SIZE = { cricket: [4, 6.5], egg: [5, 4.2], frog: [7, 4.4], mouse: [9, 4.6] };

  let playerId = null;
  const snapshots = [];
  const camera = { x: 0, y: 0, zoom: 1 };
  // moved : rien n'est envoyé tant que la souris n'a pas bougé (le serpent va tout droit).
  const input = { sx: 0, sy: 0, boost: false, mouseDown: false, space: false, moved: false };
  // Objet de dessin persistant par serpent (la hotte du cobra garde son ouverture d'une image à l'autre).
  const painted = new Map();
  let frame = 0;
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Rejoindre ----------
  document.getElementById('join-form').addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.getElementById('name').value;
    try {
      const res = await fetch('/join', { method: 'POST', body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Impossible de rejoindre');
      playerId = data.id;
      try { localStorage.setItem('snake-name', name); } catch { /* pas grave */ }
      document.getElementById('join').hidden = true;
      listen();
    } catch (error) {
      document.getElementById('join-error').textContent = error.message;
    }
  });
  try {
    document.getElementById('name').value = localStorage.getItem('snake-name') ?? '';
  } catch { /* stockage indisponible : pas grave */ }
  // Lien direct : http://<hôte>:3000/?name=Kaa rejoint la partie sans passer par le formulaire.
  const linkName = new URLSearchParams(location.search).get('name');
  if (linkName) {
    document.getElementById('name').value = linkName;
    document.getElementById('join-form').requestSubmit();
  }

  function listen() {
    const source = new EventSource(`/events?id=${encodeURIComponent(playerId)}`);
    source.onmessage = event => {
      snapshots.push({ at: performance.now(), data: JSON.parse(event.data) });
      while (snapshots.length > 4) snapshots.shift();
    };
    source.onerror = () => {
      document.getElementById('rank').textContent = 'Connexion perdue… reconnexion';
    };
  }

  // ---------- Entrées ----------
  addEventListener('mousemove', e => { input.sx = e.clientX; input.sy = e.clientY; input.moved = true; });
  addEventListener('mousedown', () => { input.mouseDown = true; });
  addEventListener('mouseup', () => { input.mouseDown = false; });
  addEventListener('keydown', e => { if (e.code === 'Space') { input.space = true; e.preventDefault(); } });
  addEventListener('keyup', e => { if (e.code === 'Space') input.space = false; });

  function worldTarget() {
    return {
      x: camera.x + (input.sx - innerWidth / 2) / camera.zoom,
      y: camera.y + (input.sy - innerHeight / 2) / camera.zoom,
    };
  }

  // Entrée envoyée dès qu'elle change (au plus 30 fois par seconde), et au moins toutes les 250 ms.
  let lastSent = '';
  let lastSentAt = 0;
  setInterval(() => {
    if (!playerId || !input.moved) return;
    const t = worldTarget();
    const body = JSON.stringify({ x: Math.round(t.x), y: Math.round(t.y), boost: input.mouseDown || input.space });
    const now = performance.now();
    if (body === lastSent && now - lastSentAt < 250) return;
    lastSent = body;
    lastSentAt = now;
    fetch(`/input?id=${encodeURIComponent(playerId)}`, { method: 'POST', body, keepalive: true }).catch(() => {});
  }, 33);

  // ---------- Interpolation ----------
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // État à afficher : instantané interpolé au temps (maintenant - RENDER_DELAY).
  function currentState() {
    if (!snapshots.length) return null;
    const target = performance.now() - RENDER_DELAY;
    let older = snapshots[0];
    let newer = snapshots[snapshots.length - 1];
    for (let i = 0; i < snapshots.length - 1; i++) {
      if (snapshots[i].at <= target && snapshots[i + 1].at >= target) {
        older = snapshots[i];
        newer = snapshots[i + 1];
        break;
      }
    }
    const span = newer.at - older.at;
    const t = span > 0 ? Math.max(0, Math.min(1, (target - older.at) / span)) : 1;
    const previous = new Map(older.data.snakes.map(s => [s.k, s]));
    const snakes = newer.data.snakes.map(s => {
      const p = previous.get(s.k);
      if (!p) return s;
      const n = Math.min(p.body.length, s.body.length);
      const body = s.body.slice();
      for (let i = 0; i < n; i++) body[i] = lerp(p.body[i], s.body[i], t);
      return { ...s, x: lerp(p.x, s.x, t), y: lerp(p.y, s.y, t), a: lerpAngle(p.a, s.a, t), r: lerp(p.r, s.r, t), body };
    });
    return { ...newer.data, snakes };
  }

  // ---------- Dessin ----------
  // Objet lu par SnakePainter (mêmes champs qu'un Snake).
  function paintable(s) {
    let o = painted.get(s.k);
    if (!o) {
      o = { pos: { x: 0, y: 0 }, vel: { x: 1, y: 0, angle: 0, heading() { return this.angle; } }, body: [], age: 0,
        tonguePhase: (s.k * 37) % 110 };
      painted.set(s.k, o);
    }
    o.pos.x = s.x;
    o.pos.y = s.y;
    o.vel.angle = s.a;
    o.r = s.r;
    o.spacing = s.sp * 2;
    o.species = SnakeSpecies.byId(s.s) ?? SnakeSpecies.LIST[0];
    o.mode = s.md;
    o.boosting = Boolean(s.b);
    o.lookAt = s.lx === null ? null : { x: s.lx, y: s.ly };
    o.age = frame;
    o.body.length = 0;
    for (let i = 0; i < s.body.length; i += 2) o.body.push({ x: s.body[i], y: s.body[i + 1] });
    return o;
  }

  function drawFoods(state, view) {
    const foods = state.foods;
    for (let i = 0; i < foods.length; i += 4) {
      const x = foods[i];
      const y = foods[i + 1];
      if (x < view.left - 30 || x > view.right + 30 || y < view.top - 30 || y > view.bottom + 30) continue;
      const kind = KINDS[foods[i + 2]] ?? 'egg';
      const [r, scale] = FOOD_SIZE[kind];
      const size = r * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(foods[i + 3]);
      ctx.drawImage(PreySprites.get(kind), -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  function drawNames(state) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    for (const s of state.snakes) {
      if (s.me) continue;
      const y = s.y - s.r * 1.4 - 10;
      ctx.font = `${s.h ? 800 : 600} 13px Inter, "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = s.h ? '#c6f36b' : 'rgba(255, 255, 250, 0.9)';
      ctx.fillText(s.h ? `★ ${s.n}` : s.n, s.x, y - 12);
      ctx.font = '500 10px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(235, 240, 220, 0.7)';
      ctx.fillText(SnakeSpecies.byId(s.s)?.name ?? '', s.x, y);
    }
    ctx.restore();
  }

  function drawMinimap(state, w, h) {
    const size = 132;
    const cx = w - size / 2 - 20;
    const cy = h - size / 2 - 20;
    const scale = (size / 2 - 8) / state.radius;
    ctx.save();
    ctx.fillStyle = 'rgba(16, 26, 10, 0.62)';
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(92, 140, 52, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, state.radius * scale, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y, color, who] of state.minimap) {
      ctx.fillStyle = who === 1 ? '#ffffff' : who === 2 ? '#c6f36b' : color;
      ctx.beginPath();
      ctx.arc(cx + x * scale, cy + y * scale, who ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function updateCamera(state) {
    const me = state.snakes.find(s => s.me);
    const focus = me ?? state.me.death;
    if (focus) {
      // Loin (apparition, réapparition) : la caméra saute ; sinon elle suit en douceur.
      const far = Math.hypot(focus.x - camera.x, focus.y - camera.y) > 600;
      camera.x += (focus.x - camera.x) * (far ? 1 : 0.15);
      camera.y += (focus.y - camera.y) * (far ? 1 : 0.15);
    }
    const goal = me ? Math.min(1.05, Math.max(0.6, 1.05 - (me.r - 9) * 0.022)) : camera.zoom;
    camera.zoom += (goal - camera.zoom) * 0.03;
  }

  let lastHud = 0;
  function updateHud(state) {
    if (performance.now() - lastHud < 150) return;
    lastHud = performance.now();
    const me = state.me;
    document.getElementById('length').textContent = me.mass;
    document.getElementById('rank').textContent = me.alive
      ? `Rang ${me.rank} sur ${me.total} · ${me.kills} élimination${me.kills > 1 ? 's' : ''}` : 'En attente…';
    document.getElementById('species').textContent = me.species;
    document.getElementById('players').textContent = `${state.players} joueur${state.players > 1 ? 's' : ''} en ligne`;
    document.getElementById('board').replaceChildren(...state.board.map((row, i) => {
      const li = document.createElement('li');
      li.className = [row.me ? 'me' : '', row.h ? 'human' : ''].join(' ').trim();
      const cells = [String(i + 1), '', row.n, String(row.m)].map((text, k) => {
        const span = document.createElement('span');
        span.textContent = text;
        if (k === 1) {
          span.className = 'dot';
          span.style.background = row.c;
        }
        return span;
      });
      li.append(...cells);
      return li;
    }));
    document.getElementById('death').hidden = me.alive;
    if (!me.alive && me.death) {
      document.getElementById('death-text').textContent =
        `Arrêté par ${me.death.by ?? 'le bord de l\'arène'} · longueur ${me.death.length} · retour dans ${Math.max(0, Math.ceil(me.respawnIn / 60))} s`;
    }
  }

  function render() {
    requestAnimationFrame(render);
    frame++;
    const w = innerWidth;
    const h = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const state = currentState();
    if (!state) {
      Meadow.draw(ctx, { left: -w / 2, top: -h / 2, right: w / 2, bottom: h / 2 }, 1500);
      return;
    }
    updateCamera(state);
    const { x, y, zoom } = camera;
    const view = { left: x - w / 2 / zoom, right: x + w / 2 / zoom, top: y - h / 2 / zoom, bottom: y + h / 2 / zoom };
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);
    Meadow.draw(ctx, view, state.radius);
    drawFoods(state, view);
    const order = [...state.snakes].sort((a, b) => a.me - b.me || a.m - b.m);
    for (const s of order) SnakePainter.draw(ctx, paintable(s));
    Meadow.clouds(ctx, view, frame);
    drawNames(state);
    ctx.restore();
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(255, 236, 180, 0.06)');
    vignette.addColorStop(1, 'rgba(8, 14, 4, 0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    drawMinimap(state, w, h);
    updateHud(state);
    // Les serpents disparus ne gardent pas leur objet de dessin.
    if (frame % 120 === 0) {
      const alive = new Set(state.snakes.map(s => s.k));
      for (const k of painted.keys()) if (!alive.has(k)) painted.delete(k);
    }
  }
  requestAnimationFrame(render);
})();
