// Généré par trailer/planner.mjs (npm run trailer:plan) : ne pas modifier à la main.
// Pour chaque plan à moment clé : graine retenue, pas de jeu du moment clé, empreinte du plan.
const TrailerPlan = {
  "near-miss": {
    "seed": 5,
    "step": 89,
    "signature": "{\"setup\":{\"invincible\":true,\"autopilot\":true,\"seed\":5,\"scenario\":\"nearMiss\",\"bots\":0},\"key\":{\"event\":\"nearMiss\",\"role\":\"a\"}}",
    "event": {
      "type": "nearMiss",
      "x": 419.9999999999984,
      "y": -220
    }
  },
  "kill-burst": {
    "seed": 8,
    "step": 132,
    "signature": "{\"setup\":{\"invincible\":true,\"autopilot\":true,\"seed\":8,\"scenario\":\"killBurst\",\"bots\":2,\"food\":200},\"key\":{\"event\":\"kill\",\"role\":\"victim\"}}",
    "event": {
      "type": "kill",
      "x": 470.24827986168395,
      "y": 56.85849644479522
    }
  },
  "the-trap": {
    "seed": 3,
    "step": 546,
    "signature": "{\"setup\":{\"invincible\":true,\"autopilot\":true,\"seed\":3,\"scenario\":\"encircle\",\"bots\":3,\"release\":150,\"tighten\":0.45,\"minRadius\":15,\"ring\":1},\"key\":{\"event\":\"kill\",\"role\":\"prey\",\"killer\":\"hunter\"}}",
    "event": {
      "type": "kill",
      "x": 235.65198586661052,
      "y": -132.78960354449717
    }
  },
  "cut-off": {
    "seed": 1,
    "step": 214,
    "signature": "{\"setup\":{\"invincible\":true,\"autopilot\":true,\"seed\":1,\"scenario\":\"cutOff\",\"bots\":6},\"key\":{\"event\":\"kill\",\"role\":\"victim\",\"killer\":\"killer\"}}",
    "event": {
      "type": "kill",
      "x": 453.8000000000013,
      "y": -180
    }
  },
  "underdog": {
    "seed": 3,
    "step": 158,
    "signature": "{\"setup\":{\"invincible\":true,\"autopilot\":true,\"seed\":3,\"scenario\":\"underdog\",\"bots\":6},\"key\":{\"event\":\"kill\",\"role\":\"giant\",\"killer\":\"small\"}}",
    "event": {
      "type": "kill",
      "x": 208.19999999999945,
      "y": -220
    }
  }
};
