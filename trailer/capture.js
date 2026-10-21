// Capture image par image (index.html?studio&capture=<id du plan>&size=540p), pilotée par
// l'enregistreur local (trailer/recorder/capture.mjs). La boucle de p5 est arrêtée : chaque
// image est dessinée par redraw() (le studio avance de 1/60 s exactement), ses pixels RGBA sont
// envoyés à l'enregistreur, et on attend sa réponse avant l'image suivante. La vidéo est donc
// exacte image par image, quelle que soit la vitesse de la machine.
// Relevés envoyés avec la prise : image du moment clé, événements, bruitages, luminosité moyenne
// de chaque image (images flash), sujets hors champ.
const TrailerCapture = (() => {
  const SIZES = ['540p', '720p', '1080p', '1440p', '4k'];

  function params(search = typeof location === 'undefined' ? '' : location.search) {
    const p = new URLSearchParams(search);
    if (!p.has('capture')) return null;
    const size = SIZES.includes(p.get('size')) ? p.get('size') : '1080p';
    return { id: p.get('capture'), size, mode: p.get('mode') === 'final' ? 'final' : 'draft' };
  }

  function requested() {
    return Boolean(params());
  }

  // Monde -> écran pour la caméra dessinée (même transformation que SnakeArena.show).
  function toScreen(cam, w, h, p) {
    const dx = p.x - cam.x;
    const dy = p.y - cam.y;
    const r = cam.rotation ?? 0;
    return {
      x: w / 2 + cam.zoom * (dx * Math.cos(r) - dy * Math.sin(r)),
      y: h / 2 + cam.zoom * (dx * Math.sin(r) + dy * Math.cos(r)),
    };
  }

  // Rôles qui doivent rester à l'image : subjects du plan, sinon la cible de la caméra, les
  // cibles nommées des images-clés et l'acteur du moment clé.
  function subjectsOf(shot) {
    if (Array.isArray(shot.subjects)) return shot.subjects;
    const roles = new Set();
    if (shot.camera?.target) roles.add(shot.camera.target);
    for (const k of shot.camera?.keys ?? []) if (typeof k.target === 'string') roles.add(k.target);
    if (shot.key?.role) roles.add(shot.key.role);
    // 'key' est un point (le lieu du moment clé), pas un serpent à garder à l'image.
    roles.delete('key');
    return [...roles];
  }

  // Sujets vivants dont la tête est hors de la partie visible (bandes noires exclues).
  function offscreen(snakes, cam, w, h, bar = 0) {
    return snakes.filter(({ snake }) => {
      const p = toScreen(cam, w, h, snake.pos);
      return p.x < 0 || p.x > w || p.y < bar || p.y > h - bar;
    }).map(({ role }) => role);
  }

  // Luminosité moyenne (0 à 255) sur un pixel sur step.
  function luma(data, step = 64) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * step) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
    return n ? sum / n : 0;
  }

  async function post(path, body, json = true) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': json ? 'application/json' : 'application/octet-stream' },
      body: json ? JSON.stringify(body) : body,
    });
    if (!response.ok) throw new Error(`${path} : ${response.status} ${await response.text()}`);
    return response.json();
  }

  async function run(options) {
    const studio = TrailerStudio;
    const s = studio.state;
    const index = s.shots.shots.findIndex(shot => shot.id === options.id);
    if (index < 0) throw new Error(`plan inconnu : ${options.id}`);
    // noLoop() n'annule pas l'image déjà demandée à requestAnimationFrame : on la laisse passer,
    // sinon elle ferait avancer la prise d'un pas avant la première image capturée.
    noLoop();
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    studio.act.setOutput(options.size);
    studio.act.setFraming(true);
    document.getElementById('studio-panel')?.setAttribute('hidden', '');
    studio.act.playShot(index, false);
    const shot = s.shot;
    if (!shot) throw new Error(`plan ${options.id} : impossible à préparer (moment clé introuvable ?)`);
    const w = width;
    const h = height;
    const frames = Math.round(shot.duration * 60);
    const roles = subjectsOf(shot);
    await post('/take/start', { id: shot.id, width: w, height: h, fps: 60, frames, mode: options.mode });
    // Lecture des pixels par une copie : lire directement le canvas du jeu à chaque image ferait
    // passer Chrome en dessin logiciel pour ce canvas (près de 10 fois plus lent).
    const reader = document.createElement('canvas');
    reader.width = w;
    reader.height = h;
    const readerCtx = reader.getContext('2d', { willReadFrequently: true });
    const log = { keyFrame: null, events: [], sfx: [], luma: [], offscreen: [], timing: { draw: 0, read: 0, send: 0 } };
    for (let frame = 0; frame < frames; frame++) {
      const t0 = performance.now();
      redraw();
      const t1 = performance.now();
      const run = s.run;
      for (const e of s.frameEvents) {
        log.events.push({ frame, type: e.type });
        if (log.keyFrame === null && shot.key && KeyMoment.matches(run, e, shot.key)) log.keyFrame = frame;
      }
      if (shot.key && Number.isFinite(shot.key.step) && log.keyFrame === null && frame >= Math.round(shot.keyAt * 60)) log.keyFrame = frame;
      for (const cue of s.frameSfx) log.sfx.push({ frame, ...cue });
      readerCtx.drawImage(drawingContext.canvas, 0, 0);
      const data = readerCtx.getImageData(0, 0, w, h).data;
      const t2 = performance.now();
      log.luma.push(Math.round(luma(data) * 10) / 10);
      const subjects = roles.map(role => ({ role, snake: Director.resolve(run, role) }))
        .filter(({ snake }) => snake && run.state.snakes.includes(snake));
      const out = offscreen(subjects, s.renderCamera, w, h, Grade.letterboxBar(w, h, s.letterbox));
      if (out.length) log.offscreen.push({ frame, roles: out });
      await post(`/take/frame?n=${frame}${log.keyFrame === frame ? '&key=1' : ''}`, data.buffer, false);
      log.timing.draw += t1 - t0;
      log.timing.read += t2 - t1;
      log.timing.send += performance.now() - t2;
    }
    for (const k of Object.keys(log.timing)) log.timing[k] = Math.round(log.timing[k] / frames * 10) / 10;
    const plan = {
      seed: shot.setup?.seed ?? null, keyAt: shot.keyAt ?? null, keyStep: shot.keyStep ?? null,
      startStep: shot.startStep ?? null, notes: shot.notes ?? '', letterbox: Boolean(s.frame.letterbox),
    };
    return post('/take/end', { id: shot.id, ...log, plan });
  }

  function start() {
    const options = params();
    // Laisse le premier dessin de p5 se terminer avant de prendre la main.
    setTimeout(() => run(options).catch(error => {
      console.error(error);
      fetch('/take/fail', { method: 'POST', body: String(error?.stack ?? error) });
    }), 50);
  }

  return { SIZES, params, requested, toScreen, subjectsOf, offscreen, luma, start };
})();
