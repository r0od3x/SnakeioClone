// Boucle p5 et interactions de Snake.io. Phases : menu (une partie de démonstration tourne
// derrière), jeu, pause. Toute la simulation est dans SnakeArena ; ici : entrées, interface, son.
let state;
let phase = 'menu';
let ratTitle = RatTitle.create();
let soundOn = false;
// Le clic maintenu n'accélère que s'il a commencé sur le canvas (pas sur un bouton).
let pressedOnCanvas = false;
// Réglages des sliders, gardés d'une partie à l'autre ; profil (nom, espèce, record) du navigateur.
const params = SnakeArena.initialParams();
const profile = Profile.load();
const snakeSounds = SnakeSounds.create();
// La simulation avance à 60 pas par seconde quel que soit l'écran : les images perdues sont
// rattrapées (au plus MAX_STEPS pas par image), et un écran à 120 / 144 Hz n'accélère pas le jeu.
const STEP_MS = 1000 / 60;
const MAX_STEPS = 4;
let stepClock = 0;
const SLIDERS = [['bots', 'snake-bots'], ['baseSpeed', 'snake-speed'], ['boostSpeed', 'snake-boost'],
  ['agility', 'snake-agility'], ['perception', 'snake-perception'], ['food', 'snake-food']];

function $(id) {
  return document.getElementById(id);
}

// Trailer Studio (index.html?studio) : il prend alors la main sur la boucle et le clavier.
function studioActive() {
  return typeof TrailerStudio !== 'undefined' && TrailerStudio.active;
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  // Une image par pixel CSS : sur un écran haute densité (×1,5, ×2), dessiner 2 à 4 fois plus
  // de pixels fait tomber la fluidité sans que la différence se voie en jeu.
  pixelDensity(1);
  canvas.parent('game');
  canvas.elt.addEventListener('pointerdown', () => { pressedOnCanvas = true; });
  window.addEventListener('pointerup', () => { pressedOnCanvas = false; });
  state = demoGame();

  for (const [name, id] of SLIDERS) {
    SnakeArena.bindParamSlider($(id), $(`${id}-value`), name, (param, value) => SnakeArena.setParam(params, param, value, state));
  }
  Menu.bind($('menu'), profile, startGame);
  DebugMode.bindToggle($('debug-toggle'));
  $('settings-toggle').addEventListener('click', () => toggleSettings());
  $('sound-toggle').addEventListener('click', toggleSound);
  $('pause-toggle').addEventListener('click', () => setPaused(phase !== 'paused'));
  $('resume').addEventListener('click', () => setPaused(false));
  $('pause-menu').addEventListener('click', backToMenu);
  $('respawn-now').addEventListener('click', () => SnakeArena.respawn(state));
  $('to-menu').addEventListener('click', backToMenu);
  showPhase();
  if (typeof TrailerStudio !== 'undefined') TrailerStudio.init({ profile, canvas: canvas.elt });
}

// Partie de démonstration derrière le menu : le « joueur » tourne en rond tranquillement.
function demoGame() {
  return SnakeArena.create(params, Math.random, { name: 'Démo' });
}

function startGame(chosen) {
  Profile.save(chosen);
  state = SnakeArena.create(params, Math.random, chosen);
  ratTitle = RatTitle.create();
  phase = 'play';
  showPhase();
}

function backToMenu() {
  saveRecord();
  state = demoGame();
  ratTitle = RatTitle.create();
  phase = 'menu';
  Menu.showRecord($('menu'), profile);
  showPhase();
}

function setPaused(paused) {
  if (phase === 'menu') return;
  phase = paused ? 'paused' : 'play';
  showPhase();
}

function toggleSettings(open = $('settings').hidden) {
  $('settings').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
}

function toggleSound() {
  soundOn = !soundOn;
  $('sound-toggle').setAttribute('aria-pressed', String(soundOn));
  $('sound-toggle').textContent = soundOn ? '🔊' : '🔇';
}

function showPhase() {
  $('menu').hidden = phase !== 'menu';
  $('pause').hidden = phase !== 'paused';
  $('arena-hud').hidden = phase === 'menu';
  $('toolbar').hidden = phase === 'menu';
  $('pause-toggle').setAttribute('aria-pressed', String(phase === 'paused'));
  if (phase === 'menu') toggleSettings(false);
}

function mouseInside() {
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

function readInput() {
  if (phase === 'menu') {
    const p = state.player;
    if (p) {
      const a = state.frame / 140;
      state.input = { target: createVector(Math.cos(a) * 500, Math.sin(a) * 500), boost: false };
    }
    return;
  }
  SnakeArena.setInput(state, mouseX, mouseY, (mouseIsPressed && pressedOnCanvas) || keyIsDown(32), width, height);
}

// Nombre de pas de simulation dus depuis l'image précédente. Un écart de moins d'une ms avec un
// nombre entier de pas (60 Hz irrégulier) compte pour ce nombre, sinon on alternerait 0 et 2 pas.
function stepsDue() {
  let dt = deltaTime;
  const k = Math.round(dt / STEP_MS);
  if (k >= 1 && Math.abs(dt - k * STEP_MS) < 1) dt = k * STEP_MS;
  stepClock = Math.min(stepClock + dt, STEP_MS * MAX_STEPS);
  const steps = Math.floor(stepClock / STEP_MS + 1e-6);
  stepClock = Math.max(0, stepClock - steps * STEP_MS);
  return steps;
}

function draw() {
  if (studioActive()) {
    TrailerStudio.frame();
    return;
  }
  snakeSounds.setEnabled(soundOn && phase === 'play');
  for (let i = stepsDue(); i > 0; i--) {
    if (phase !== 'paused') {
      readInput();
      SnakeArena.step(state, width, height);
      if (phase === 'play') snakeSounds.react(state.events);
    }
    // Mort : « Éliminé » écrit par des rats qui fuient la souris.
    if (phase !== 'menu') RatTitle.update(ratTitle, !state.player, mouseInside() ? { x: mouseX, y: mouseY } : null, width, height);
  }
  SnakeArena.show(state);
  if (phase !== 'menu') RatTitle.draw(drawingContext, ratTitle, width, height);
  if (phase !== 'menu' && frameCount % 6 === 0) {
    if (frameCount % 30 === 0) saveRecord();
    Hud.render(state, profile);
  }
}

// Record : la plus grande longueur atteinte dans une partie (pas en démonstration).
function saveRecord() {
  if (phase === 'menu') return;
  Profile.submitScore(profile, state.stats.best);
}

function keyPressed() {
  if (studioActive()) return TrailerStudio.keyPressed();
  if (document.activeElement?.tagName === 'INPUT' && document.activeElement.type === 'text') return true;
  if (key === 'd' || key === 'D') DebugMode.toggle();
  if (key === 'p' || key === 'P' || keyCode === ESCAPE) setPaused(phase === 'play');
  if ((key === 'r' || key === 'R') && phase === 'play' && !state.player) SnakeArena.respawn(state);
  // Espace = accélérer : on évite le défilement de la page.
  return key !== ' ';
}

function windowResized() {
  if (studioActive() && TrailerStudio.windowResized()) return;
  resizeCanvas(windowWidth, windowHeight);
}
