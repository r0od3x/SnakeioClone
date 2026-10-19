// Segment du corps d'un serpent : un Vehicle qui suit le segment devant lui (la tête pour le
// premier, déjà déplacé à cette image). Steering « arrive » vers le point situé spacing px
// derrière le meneur : vitesse désirée = écart × catchUp (1 : le segment rejoint ce point en
// une image), puis steering = désirée - vitesse, limité à maxForce. La locomotion fournie
// (update) le déplace ; sa vitesse est donc celle du corps à cet endroit.
class BodySegment extends Vehicle {
  constructor(x, y) {
    super(x, y);
    // Part de l'écart rattrapée par image ; force et vitesse max assez grandes pour suivre
    // un serpent qui accélère et tourne court.
    this.catchUp = 1;
    this.maxForce = 8;
    this.maxSpeed = 30;
  }

  // Le peintre et les collisions lisent les segments comme des points.
  get x() {
    return this.pos.x;
  }

  get y() {
    return this.pos.y;
  }

  // leader : position {x, y} du meneur ; leaderVel : sa vitesse (sert seulement à placer un
  // segment né sur son meneur) ; spacing : écart voulu (px).
  follow(leader, leaderVel, spacing) {
    let ax = this.pos.x - leader.x;
    let ay = this.pos.y - leader.y;
    let d = Math.hypot(ax, ay);
    // Segment né sur son meneur : on vise derrière lui, à l'opposé de sa vitesse.
    if (d < 1e-6) {
      const speed = Math.hypot(leaderVel.x, leaderVel.y);
      if (speed === 0) return createVector(0, 0);
      ax = -leaderVel.x;
      ay = -leaderVel.y;
      d = speed;
    }
    const tx = leader.x + ax / d * spacing;
    const ty = leader.y + ay / d * spacing;
    const desired = createVector((tx - this.pos.x) * this.catchUp, (ty - this.pos.y) * this.catchUp)
      .limit(this.maxSpeed);
    return p5.Vector.sub(desired, this.vel).limit(this.maxForce);
  }
}
