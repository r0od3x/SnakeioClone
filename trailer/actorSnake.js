// Serpent « acteur » des scènes de tournage : un SnakeBot qui peut suivre un script avant de
// rendre la main à son IA. Le script ne fait que choisir le point visé ; le steering reste un
// seek de Reynolds (vitesse désirée - vitesse, limitée à maxForce), filtré par turnOnly, et la
// locomotion est celle de Vehicle. Rien n'est téléporté pendant un plan.
// Scripts :
// - { kind: 'orbit', center, radius, dir } : tourne autour d'un point ou d'un serpent ;
// - { kind: 'heading', angle } : va tout droit dans une direction ;
// - { kind: 'seek', target } : vise un point, un serpent ou une fonction qui renvoie un point.
// Options : frames (durée en pas de jeu, ensuite l'IA reprend), boost (accélérer),
// then (script suivant quand frames est écoulé, au lieu de l'IA).
// Orbite : shrink (px par pas) resserre le rayon jusqu'à minRadius (piège qui se referme).
class ActorSnake extends SnakeBot {
  // Distance d'anticipation sur l'orbite (px) : plus grande = trajectoire plus douce.
  static ORBIT_LEAD = 70;

  constructor(x, y, species, name, script = null) {
    super(x, y, species, name);
    this.isActor = true;
    this.script = script;
  }

  static point(target) {
    const t = typeof target === 'function' ? target() : target;
    if (!t) return null;
    return t.pos ? { x: t.pos.x, y: t.pos.y } : { x: t.x, y: t.y };
  }

  // Point visé par le script en cours (null : pas de script).
  scriptPoint() {
    const s = this.script;
    if (!s) return null;
    if (s.kind === 'orbit') {
      const c = ActorSnake.point(s.center) ?? { x: 0, y: 0 };
      const a = Math.atan2(this.pos.y - c.y, this.pos.x - c.x) + (s.dir ?? 1) * ActorSnake.ORBIT_LEAD / Math.max(1, s.radius);
      return { x: c.x + Math.cos(a) * s.radius, y: c.y + Math.sin(a) * s.radius };
    }
    if (s.kind === 'heading') return { x: this.pos.x + Math.cos(s.angle) * 200, y: this.pos.y + Math.sin(s.angle) * 200 };
    if (s.kind === 'seek') return ActorSnake.point(s.target);
    return null;
  }

  steer(world) {
    if (this.script && this.script.frames !== undefined && this.script.frames-- <= 0) this.script = this.script.then ?? null;
    const s = this.script;
    if (s?.kind === 'orbit' && s.shrink) s.radius = Math.max(s.minRadius ?? 0, s.radius - s.shrink);
    const p = this.scriptPoint();
    if (!p) return super.steer(world);
    this.mode = 'script';
    this.target = createVector(p.x, p.y);
    this.lookAt = this.target;
    return this.seek(this.target);
  }

  wantsBoost(world) {
    return this.script ? Boolean(this.script.boost) : super.wantsBoost(world);
  }
}
