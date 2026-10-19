// Serpent d'un joueur en ligne : comme PlayerSnake de Snake.io, mais chaque serpent lit l'entrée
// de son propre joueur (point visé dans le monde et accélération), envoyée par son navigateur.
class NetPlayerSnake extends Snake {
  constructor(x, y, species, name, playerId) {
    super(x, y, species, name);
    this.playerId = playerId;
    this.input = { x: null, y: null, boost: false };
  }

  // Steering : seek du point visé par la souris du joueur ; rien tant qu'il n'a rien envoyé.
  steer() {
    this.mode = 'joueur';
    if (this.input.x === null || this.input.y === null) return createVector(0, 0);
    const target = createVector(this.input.x, this.input.y);
    this.target = target;
    this.lookAt = target;
    return this.seek(target);
  }

  wantsBoost() {
    return Boolean(this.input.boost);
  }
}
