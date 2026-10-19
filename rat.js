// Rat de l'écran « Éliminé » : il rejoint sa place dans les lettres (arrive de Reynolds) et fuit
// la souris quand elle approche (flee() fourni, pondéré), puis revient. Coordonnées de l'écran.
class Rat extends Vehicle {
  constructor(x, y, home) {
    super(x, y);
    this.home = createVector(home.x, home.y);
    this.r = 6;
    this.maxSpeed = 10;
    this.maxForce = 0.7;
    // Arrive : ralentit à moins de slowRadius px de sa place.
    this.slowRadius = 70;
    // Peur : la souris à moins de fearRadius px fait fuir, avec un poids fleeWeight.
    this.fearRadius = 90;
    this.fleeWeight = 3;
    this.scared = false;
    // Orientation affichée (garde la dernière direction de course une fois arrêté).
    this.angle = (x * 0.31 + y * 0.17) % (Math.PI * 2);
  }

  // Arrive de Reynolds : vitesse désirée réduite près de la cible, steering = désirée - vitesse.
  arrive(target) {
    const desired = p5.Vector.sub(target, this.pos);
    const d = desired.mag();
    desired.setMag(d < this.slowRadius ? this.maxSpeed * d / this.slowRadius : this.maxSpeed);
    return p5.Vector.sub(desired, this.vel).limit(this.maxForce);
  }

  // pointer : {x, y} de la souris dans le canvas, ou null.
  applyBehaviors(pointer) {
    const force = this.arrive(this.home);
    this.scared = false;
    if (pointer && Math.hypot(pointer.x - this.pos.x, pointer.y - this.pos.y) < this.fearRadius) {
      this.scared = true;
      force.add(this.flee({ pos: createVector(pointer.x, pointer.y) }).mult(this.fleeWeight));
    }
    this.applyForce(force.limit(this.maxForce * this.fleeWeight));
  }

  update() {
    super.update();
    if (this.vel.mag() > 0.3) this.angle = this.vel.heading();
  }

  show(ctx, sprite, size = 18) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);
    if (sprite) ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    else {
      ctx.fillStyle = '#7d736a';
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.35, size * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
