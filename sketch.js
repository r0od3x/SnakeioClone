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
const SLIDERS = [['bots', 'snake-bots'], ['baseSpeed', 'snake-speed'], ['boostSpeed', 'snake-boost'],
  ['agility', 'snake-agility'], ['perception', 'snake-perception'], ['food', 'snake-food']];

function $(id) {
  return document.getElementById(id);
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
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
      const a = frameCount / 140;
      state.input = { target: createVector(Math.cos(a) * 500, Math.sin(a) * 500), boost: false };
    }
    return;
  }
  SnakeArena.setInput(state, mouseX, mouseY, (mouseIsPressed && pressedOnCanvas) || keyIsDown(32), width, height);
}

function draw() {
  if (phase !== 'paused') {
    readInput();
    SnakeArena.step(state, width, height);
  }
  SnakeArena.show(state);
  if (phase !== 'menu') {
    // Mort : « Éliminé » écrit par des rats qui fuient la souris.
    RatTitle.update(ratTitle, !state.player, mouseInside() ? { x: mouseX, y: mouseY } : null, width, height);
    RatTitle.draw(drawingContext, ratTitle, width, height);
  }
  snakeSounds.setEnabled(soundOn && phase === 'play');
  if (phase === 'play') snakeSounds.react(state.events);
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
  if (document.activeElement?.tagName === 'INPUT' && document.activeElement.type === 'text') return true;
  if (key === 'd' || key === 'D') DebugMode.toggle();
  if (key === 'p' || key === 'P' || keyCode === ESCAPE) setPaused(phase === 'play');
  if ((key === 'r' || key === 'R') && phase === 'play' && !state.player) SnakeArena.respawn(state);
  // Espace = accélérer : on évite le défilement de la page.
  return key !== ' ';
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
