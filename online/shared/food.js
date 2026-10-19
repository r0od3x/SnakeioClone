// Proie du mode Snake.io : grillon, œuf, grenouille ou souris selon sa valeur nutritive.
// Les grillons et les souris se promènent (wander, très lentement) en restant dans l'arène ;
// œufs et grenouilles restent sur place (freinage jusqu'à l'arrêt). À moins de attractRange px
// d'une tête, la proie est happée : seek vers la bouche, comme les orbes de slither.io.
class Food extends Vehicle {
  // Rayon de capture (px), taille du dessin (× r) et vitesse de marche (0 = immobile).
  static KINDS = {
    cricket: { r: 4, draw: 6.5, walk: 0.55 },
    egg: { r: 5, draw: 4.2, walk: 0 },
    frog: { r: 7, draw: 4.4, walk: 0 },
    mouse: { r: 9, draw: 4.6, walk: 0.7 },
  };

  static kindFor(value) {
    if (value < 1.5) return 'cricket';
    if (value < 2.5) return 'egg';
    if (value < 3.5) return 'frog';
    return 'mouse';
  }

  constructor(x, y, value, vx = 0, vy = 0) {
    super(x, y);
    this.value = value;
    this.kind = Food.kindFor(value);
    const spec = Food.KINDS[this.kind];
    this.r = spec.r;
    this.drawScale = spec.draw;
    this.walkSpeed = spec.walk;
    this.vel.set(vx, vy);
    this.snapSpeed = 7;
    this.maxSpeed = Math.max(this.snapSpeed, Math.hypot(vx, vy));
    this.maxForce = 0.7;
    this.brakeForce = 0.12;
    this.attractRange = 45;
    this.age = 0;
    // Orientation au repos et réglages du wander des proies vivantes.
    this.angle = (x * 0.37 + y * 0.11) % (Math.PI * 2);
    this.wanderDistance = 12;
    this.wanderRadius = 6;
    this.wanderJitter = 0.35;
    this.wanderTheta = 0;
  }

  nearestHead(heads) {
    let best = null;
    let bestD = Infinity;
    for (const head of heads) {
      const d = Math.hypot(head.pos.x - this.pos.x, head.pos.y - this.pos.y);
      if (d < head.r + this.attractRange && d < bestD) {
        best = head;
        bestD = d;
      }
    }
    return best;
  }

  // Happée par la tête la plus proche ; sinon promenade (proies vivantes) ou freinage.
  applyBehaviors(heads = [], arenaRadius = Infinity, rng = Math.random) {
    const head = this.nearestHead(heads);
    if (head) {
      this.maxSpeed = this.snapSpeed;
      this.applyForce(this.seek(head.pos));
      return;
    }
    const speed = this.vel.mag();
    if (this.walkSpeed > 0 && speed <= this.walkSpeed + 0.05) {
      this.maxSpeed = this.walkSpeed;
      const nearEdge = Math.hypot(this.pos.x, this.pos.y) > arenaRadius - 80;
      this.applyForce((nearEdge ? this.seek(createVector(0, 0)) : Wander.steer(this, rng)).limit(this.maxForce * 0.1));
      return;
    }
    this.applyForce(this.vel.copy().mult(-1).limit(this.brakeForce));
  }

  update() {
    super.update();
    this.age++;
    if (this.vel.mag() > 0.05) this.angle = this.vel.heading();
  }

  // Apparition en douceur (0 à 1).
  fadeIn() {
    return Math.min(1, this.age / 20);
  }

  show(ctx = typeof drawingContext === 'undefined' ? null : drawingContext, frame = 0, sprite = null) {
    if (!ctx) return;
    const size = this.r * this.drawScale * this.fadeIn();
    if (sprite) {
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.rotate(this.angle);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#d9ccb0';
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}
