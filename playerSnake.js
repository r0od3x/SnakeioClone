// Serpent du joueur : seek du point visé par la souris (en coordonnées du monde),
// accélération tant que le clic ou Espace est maintenu.
class PlayerSnake extends Snake {
  steer(world) {
    const target = world.input?.target;
    this.mode = 'joueur';
    this.target = target ?? null;
    if (!target) return createVector(0, 0);
    this.lookAt = target;
    return this.seek(target);
  }

  wantsBoost(world) {
    return Boolean(world.input?.boost);
  }
}
