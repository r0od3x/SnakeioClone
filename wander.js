// Wander de Reynolds, partagé par les cibles, le requin, les serpents et les proies : le calcul
// est la méthode wander() de Vehicle. Ce module garde l'appel Wander.steer(vehicle, rng) pour
// les classes qui ont leur propre méthode wander (StaminaTarget) ou qui l'utilisent comme
// comportement parmi d'autres (SnakeBot, Food, Shark).
// Le véhicule porte ses réglages : wanderDistance, wanderRadius (px), wanderJitter (rad/image)
// et son état wanderTheta.
const Wander = (() => {
  function steer(vehicle, rng = Math.random) {
    return Vehicle.prototype.wander.call(vehicle, rng);
  }

  return { steer };
})();
