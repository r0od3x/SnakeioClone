// Menu de départ : nom du joueur, choix de l'espèce (aperçu dessiné par SnakePainter) ou
// « Au hasard », record. Interface seulement : la partie est créée par sketch.js.
const Menu = (() => {
  const PREVIEW = { w: 128, h: 58, scale: 0.55 };

  // Aperçu d'une espèce : un serpent immobile au corps ondulé, dessiné une fois.
  function drawPreview(canvas, species) {
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = PREVIEW.w * ratio;
    canvas.height = PREVIEW.h * ratio;
    ctx.scale(ratio * PREVIEW.scale, ratio * PREVIEW.scale);
    const w = PREVIEW.w / PREVIEW.scale;
    const h = PREVIEW.h / PREVIEW.scale;
    const snake = new Snake(w - 40, h / 2, species, species.name);
    snake.mass = 120;
    snake.syncSize();
    snake.vel.set(2.6, 0);
    snake.age = 5;
    snake.mode = species.hood ? 'chasse' : 'erre';
    snake.body = Array.from({ length: snake.targetSegments() }, (_, i) => {
      const t = (i + 1) * snake.spacing * 0.7;
      return { x: w - 40 - t, y: h / 2 + Math.sin(t / 32) * 14 };
    });
    // La hotte du cobra s'ouvre progressivement : quelques images pour l'ouvrir.
    for (let i = 0; i < (species.hood ? 20 : 1); i++) {
      ctx.clearRect(-10, -10, w + 20, h + 20);
      snake.show(ctx);
    }
  }

  function card(species, selected) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'species-card';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(selected));
    button.dataset.species = species?.id ?? '';
    if (species) {
      const canvas = document.createElement('canvas');
      canvas.style.width = `${PREVIEW.w}px`;
      canvas.style.height = `${PREVIEW.h}px`;
      button.append(canvas);
      drawPreview(canvas, species);
    } else {
      const dice = document.createElement('span');
      dice.className = 'species-random';
      dice.textContent = '?';
      button.append(dice);
    }
    const label = document.createElement('span');
    label.textContent = species ? species.name : 'Au hasard';
    button.append(label);
    return button;
  }

  // Remplit le menu à partir du profil ; onPlay(profile) est appelé au clic sur « Jouer » (ou Entrée).
  function bind(root, profile, onPlay) {
    const grid = root.querySelector('#species-grid');
    const name = root.querySelector('#player-name');
    name.value = profile.name;
    const cards = [null, ...SnakeSpecies.LIST].map(species => card(species, (species?.id ?? null) === profile.species));
    grid.replaceChildren(...cards);
    if (!cards.some(c => c.getAttribute('aria-checked') === 'true')) cards[0].setAttribute('aria-checked', 'true');
    grid.addEventListener('click', event => {
      const chosen = event.target.closest('.species-card');
      if (!chosen) return;
      for (const c of cards) c.setAttribute('aria-checked', String(c === chosen));
      profile.species = chosen.dataset.species || null;
    });
    const play = () => {
      profile.name = name.value.trim().slice(0, 16);
      onPlay(profile);
    };
    root.querySelector('#play').addEventListener('click', play);
    name.addEventListener('keydown', event => {
      if (event.key === 'Enter') play();
    });
    showRecord(root, profile);
  }

  function showRecord(root, profile) {
    root.querySelector('#menu-record').textContent = profile.record ? `Record : ${profile.record}` : '';
  }

  return { bind, showRecord, drawPreview };
})();
