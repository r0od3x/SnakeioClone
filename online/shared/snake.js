// Serpent façon slither.io (espèce réelle, voir snakeSpecies.js) : la tête est le véhicule et
// le corps une chaîne de véhicules (BodySegment) qui suivent chacun celui de devant. Le serpent avance toujours : son steering
// ne fait que tourner (pas de freinage), et sa vitesse de croisière double en accélération,
// ce qui coûte de la masse et laisse des orbes derrière lui.
// Sous-classes : PlayerSnake (suit la souris), SnakeBot (IA de sélection d'action).
class Snake extends Vehicle {
  static START_MASS = 20;
  static MAX_SEGMENTS = 400;

  constructor(x, y, species, name = '') {
    super(x, y);
    this.species = species;
    this.name = name;
    this.mass = Snake.START_MASS;
    // Vitesses de croisière (px/image) ; l'accélération coûte boostCost de masse par image
    // et lâche une orbe toutes les dropInterval images. Pas d'accélération sous minBoostMass.
    this.baseSpeed = 2.6;
    this.boostSpeed = 5.2;
    this.maxSpeed = this.baseSpeed;
    // Agilité : force de virage max d'un petit serpent (les gros tournent plus large).
    this.agility = 0.4;
    this.boostCost = 0.12;
    this.dropInterval = 6;
    this.minBoostMass = 15;
    this.boosting = false;
    this.boostFrames = 0;
    this.drops = [];
    this.kills = 0;
    this.alive = true;
    this.age = 0;
    // Point regardé (affichage des yeux) et décalage du mouvement de la langue.
    this.lookAt = null;
    // Dernière décision : mode, point visé et force appliquée (affichage de débogage).
    this.mode = '';
    this.target = null;
    this.steering = createVector(0, 0);
    this.tonguePhase = Math.floor(Math.abs(x * 7 + y * 13)) % 110;
    this.vel.set(this.baseSpeed, 0);
    this.body = [];
    this.syncSize();
    this.resetBody();
  }

  // Taille : rayon, espacement des segments et agilité dépendent de la masse ;
  // un gros serpent tourne plus large.
  syncSize() {
    this.r = 7 + Math.min(18, Math.sqrt(Math.max(0, this.mass)) * 0.55);
    this.spacing = this.r * 0.55;
    this.maxForce = this.agility * Math.min(1, Math.max(0.45, 10 / this.r));
  }

  targetSegments() {
    return Math.min(Snake.MAX_SEGMENTS, Math.floor(10 + this.mass / 4));
  }

  bodyLength() {
    return this.body.length * this.spacing;
  }

  // Corps droit derrière la tête, dans le sens opposé à la vitesse, déjà lancé à sa vitesse.
  resetBody() {
    const heading = this.vel.mag() ? this.vel.heading() : 0;
    this.body = Array.from({ length: this.targetSegments() }, (_, i) => {
      const segment = new BodySegment(this.pos.x - Math.cos(heading) * this.spacing * (i + 1),
        this.pos.y - Math.sin(heading) * this.spacing * (i + 1));
      segment.vel.set(this.vel.x, this.vel.y);
      return segment;
    });
  }

  grow(amount) {
    this.mass += amount;
    this.syncSize();
  }

  // Steering propre à chaque serpent (sous-classes) ; accélérer ou non.
  steer() {
    return createVector(0, 0);
  }

  wantsBoost() {
    return false;
  }

  // Un serpent ne freine pas : on garde la composante latérale de la force (virage) et la
  // composante longitudinale ne sert qu'à rejoindre la vitesse de croisière.
  turnOnly(force) {
    const speed = this.vel.mag();
    if (speed === 0) return force;
    const ux = this.vel.x / speed;
    const uy = this.vel.y / speed;
    const along = force.x * ux + force.y * uy;
    let lx = force.x - along * ux;
    let ly = force.y - along * uy;
    // Cible pile derrière : aucune composante latérale, on choisit un côté pour faire demi-tour en arc.
    if (along < 0 && Math.hypot(lx, ly) < 1e-6 * Math.max(1, -along)) {
      lx = -uy * -along;
      ly = ux * -along;
    }
    const cruise = Math.max(-this.maxForce * 0.5, Math.min(this.maxForce, this.maxSpeed - speed));
    return createVector(lx + ux * cruise, ly + uy * cruise);
  }

  applyBehaviors(world) {
    this.boosting = this.wantsBoost(world) && this.mass > this.minBoostMass;
    this.maxSpeed = this.boosting ? this.boostSpeed : this.baseSpeed;
    const force = this.turnOnly(this.steer(world)).limit(this.maxForce);
    this.steering = force.copy();
    this.applyForce(force);
  }

  update() {
    super.update();
    this.age++;
    if (this.boosting) {
      this.mass = Math.max(this.minBoostMass, this.mass - this.boostCost);
      this.boostFrames++;
      const tail = this.body[this.body.length - 1] ?? this.pos;
      if (this.boostFrames % this.dropInterval === 0) {
        this.drops.push({ x: tail.x, y: tail.y, value: 1 });
      }
    }
    this.syncSize();
    this.updateBody();
  }

  // Chaîne de véhicules : chaque segment suit celui de devant (la tête pour le premier) avec
  // son steering, puis la locomotion fournie le déplace. Un nouveau segment naît au bout de la queue.
  updateBody() {
    const target = this.targetSegments();
    while (this.body.length < target) {
      const last = this.body[this.body.length - 1] ?? this;
      this.body.push(new BodySegment(last.pos.x, last.pos.y));
    }
    if (this.body.length > target) this.body.length = target;
    let leader = this;
    for (const segment of this.body) {
      segment.applyForce(segment.follow(leader.pos, leader.vel, this.spacing));
      segment.update();
      leader = segment;
    }
  }

  // Orbes lâchées depuis la dernière image (vidées à la lecture).
  takeDrops() {
    const drops = this.drops;
    this.drops = [];
    return drops;
  }

  // Vrai si un disque (point, radius) touche le corps (hors des deux premiers segments).
  touchesBody(point, radius) {
    if (Math.hypot(point.x - this.pos.x, point.y - this.pos.y) > this.bodyLength() + radius + this.r) return false;
    for (let i = 2; i < this.body.length; i++) {
      const seg = this.body[i];
      if (Math.hypot(point.x - seg.x, point.y - seg.y) < radius * 0.8 + this.r) return true;
    }
    return false;
  }

  // À la mort, le corps devient des proies : 80 % de la masse, un segment sur deux.
  remains() {
    const points = this.body.filter((_, i) => i % 2 === 0);
    const value = Math.max(1, this.mass * 0.8 / Math.max(1, points.length));
    return points.map(p => ({ x: p.x, y: p.y, value }));
  }

  // Dessin réaliste (snakePainter.js).
  show(ctx = typeof drawingContext === 'undefined' ? null : drawingContext) {
    SnakePainter.draw(ctx, this);
  }

  // Couleur du mode courant (affichage de débogage).
  static MODE_COLORS = {
    joueur: '#ffffff', évite: '#ff5252', bord: '#ff9100', fuite: '#ffd740', chasse: '#ff4081',
    mange: '#69f0ae', erre: '#82b1ff',
  };

  debugColor() {
    return Snake.MODE_COLORS[this.mode] ?? '#ffffff';
  }

  // Débogage : vitesse (drawVector fourni par Vehicle), force de steering (drawArrow de vehicle.js),
  // point visé relié à la tête, et étiquette mode / vitesse / masse.
  showDebug(ctx) {
    const color = this.debugColor();
    this.drawVector(this.pos, this.vel.copy().mult(12));
    const scale = 45 / Math.max(1e-6, this.agility);
    if (this.steering.mag() > 1e-6) drawArrow(this.pos, this.steering.copy().mult(scale), '#ffe14d');
    if (this.target) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this.target.x, this.target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(this.target.x, this.target.y, 7, 0, Math.PI * 2);
      ctx.moveTo(this.target.x - 11, this.target.y);
      ctx.lineTo(this.target.x + 11, this.target.y);
      ctx.moveTo(this.target.x, this.target.y - 11);
      ctx.lineTo(this.target.x, this.target.y + 11);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    const label = `${this.mode || '?'}${this.boosting ? ' · accélère' : ''}`;
    ctx.fillText(label, this.pos.x, this.pos.y + this.r * 1.6 + 14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(`v ${this.vel.mag().toFixed(1)}/${this.maxSpeed.toFixed(1)} · m ${Math.round(this.mass)}`,
      this.pos.x, this.pos.y + this.r * 1.6 + 27);
    ctx.restore();
  }
}
