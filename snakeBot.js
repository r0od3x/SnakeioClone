// Serpent IA. Perception -> sélection de l'action par priorité (Reynolds) -> steering :
// 1. évite : un corps dans le couloir devant la tête -> virage du côté libre ;
// 2. bord : la tête va sortir de l'arène -> seek du centre ;
// 3. fuite : une tête plus grosse (masse × 1,3) proche -> flee() fourni ;
// 4. chasse : une tête plus petite (masse × 0,7) proche -> seek d'un point devant elle (couper la route) ;
// 5. mange : l'orbe la plus proche -> seek ;
// 6. erre : wander.
class SnakeBot extends Snake {
  constructor(x, y, species, name) {
    super(x, y, species, name);
    // Perception des orbes et des têtes (px), marge latérale du couloir d'évitement (px).
    this.perception = 320;
    this.predatorRange = 180;
    this.preyRange = 250;
    this.dangerMargin = 10;
    // Coupe la route : point visé lead images devant la proie.
    this.lead = 25;
    this.wanderDistance = 60;
    this.wanderRadius = 30;
    this.wanderJitter = 0.3;
    this.wanderTheta = 0;
    this.mode = 'erre';
    this.danger = null;
    this.edge = false;
    this.predator = null;
    this.prey = null;
    this.food = null;
  }

  // Longueur du couloir surveillé devant la tête (px).
  lookAhead() {
    return 50 + this.r * 4;
  }

  heading() {
    const speed = this.vel.mag();
    return speed ? { x: this.vel.x / speed, y: this.vel.y / speed } : { x: 1, y: 0 };
  }

  // Point de corps (tête comprise) le plus proche dans le couloir devant soi.
  findDanger(snakes) {
    const u = this.heading();
    const L = this.lookAhead();
    let best = null;
    for (const other of snakes) {
      if (other === this || !other.alive) continue;
      const reach = other.bodyLength() + L + other.r + this.r;
      if (Math.hypot(other.pos.x - this.pos.x, other.pos.y - this.pos.y) > reach) continue;
      for (const p of [other.pos, ...other.body]) {
        const rx = p.x - this.pos.x;
        const ry = p.y - this.pos.y;
        const along = rx * u.x + ry * u.y;
        if (along <= 0 || along > L) continue;
        const lateral = -rx * u.y + ry * u.x;
        if (Math.abs(lateral) >= this.r + other.r + this.dangerMargin) continue;
        if (!best || along < best.along) best = { along, lateral, snake: other };
      }
    }
    return best;
  }

  edgeAhead(radius) {
    const u = this.heading();
    const L = this.lookAhead();
    return Math.hypot(this.pos.x + u.x * L, this.pos.y + u.y * L) > radius - this.r * 2;
  }

  findHeads(snakes) {
    let predator = null;
    let prey = null;
    for (const other of snakes) {
      if (other === this || !other.alive) continue;
      const d = Math.hypot(other.pos.x - this.pos.x, other.pos.y - this.pos.y);
      if (other.mass > this.mass * 1.3 && d < this.predatorRange && (!predator || d < predator.d)) predator = { snake: other, d };
      if (other.mass < this.mass * 0.7 && d < this.preyRange && (!prey || d < prey.d)) prey = { snake: other, d };
    }
    return { predator, prey };
  }

  nearestFood(foods) {
    let best = null;
    let bestD = this.perception;
    for (const food of foods) {
      const d = Math.hypot(food.pos.x - this.pos.x, food.pos.y - this.pos.y);
      if (d < bestD) {
        best = food;
        bestD = d;
      }
    }
    return best;
  }

  perceive(world) {
    this.danger = this.findDanger(world.snakes ?? []);
    this.edge = this.edgeAhead(world.arenaRadius ?? Infinity);
    const { predator, prey } = this.findHeads(world.snakes ?? []);
    this.predator = predator;
    this.prey = prey;
    this.food = this.nearestFood(world.foods ?? []);
  }

  steer(world) {
    this.perceive(world);
    if (this.danger) {
      this.mode = 'évite';
      const u = this.heading();
      const side = this.danger.lateral >= 0 ? -1 : 1;
      const desired = createVector(-u.y * side + u.x * 0.2, u.x * side + u.y * 0.2).setMag(this.maxSpeed);
      this.lookAt = null;
      this.target = createVector(this.pos.x + desired.x * 20, this.pos.y + desired.y * 20);
      return p5.Vector.sub(desired, this.vel);
    }
    if (this.edge) {
      this.mode = 'bord';
      this.lookAt = { x: 0, y: 0 };
      this.target = createVector(0, 0);
      return this.seek(this.target);
    }
    if (this.predator) {
      this.mode = 'fuite';
      const away = p5.Vector.sub(this.pos, this.predator.snake.pos).setMag(80);
      this.lookAt = this.predator.snake.pos;
      this.target = createVector(this.pos.x + away.x, this.pos.y + away.y);
      return this.flee(this.predator.snake);
    }
    if (this.prey) {
      this.mode = 'chasse';
      const p = this.prey.snake;
      const cutoff = createVector(p.pos.x + p.vel.x * this.lead, p.pos.y + p.vel.y * this.lead);
      this.lookAt = cutoff;
      this.target = cutoff;
      return this.seek(cutoff);
    }
    if (this.food) {
      this.mode = 'mange';
      this.lookAt = this.food.pos;
      this.target = this.food.pos;
      return this.seek(this.food.pos);
    }
    this.mode = 'erre';
    this.lookAt = null;
    const force = Wander.steer(this, world.rng);
    this.target = this.wanderTarget;
    return force;
  }

  // Accélère pour fuir, ou pour finir une chasse quand la proie est tout près.
  wantsBoost() {
    if (this.mode === 'fuite') return this.mass > 30;
    return this.mode === 'chasse' && this.prey && this.prey.d < 160 && this.mass > 40;
  }

  // Débogage : en plus de Snake.showDebug, la perception, le couloir surveillé devant la tête
  // (rouge s'il contient un corps), et des anneaux autour de la proie, du prédateur et de l'orbe visés.
  showDebug(ctx) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.perception, 0, Math.PI * 2);
    ctx.stroke();
    const u = this.heading();
    const L = this.lookAhead();
    const half = this.r * 2 + this.dangerMargin;
    const corner = (along, lateral) => [this.pos.x + u.x * along - u.y * lateral, this.pos.y + u.y * along + u.x * lateral];
    ctx.beginPath();
    ctx.moveTo(...corner(0, half));
    ctx.lineTo(...corner(L, half));
    ctx.lineTo(...corner(L, -half));
    ctx.lineTo(...corner(0, -half));
    ctx.closePath();
    ctx.fillStyle = this.danger ? 'rgba(255, 82, 82, 0.22)' : 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = this.danger ? '#ff5252' : 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();
    if (this.danger) {
      const [x, y] = corner(this.danger.along, this.danger.lateral);
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const ring = (pos, radius, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    };
    if (this.prey) ring(this.prey.snake.pos, this.prey.snake.r * 2, Snake.MODE_COLORS.chasse);
    if (this.predator) ring(this.predator.snake.pos, this.predator.snake.r * 2.2, Snake.MODE_COLORS.fuite);
    if (this.food && this.mode === 'mange') ring(this.food.pos, this.food.r + 6, Snake.MODE_COLORS.mange);
    ctx.restore();
    super.showDebug(ctx);
  }
}
