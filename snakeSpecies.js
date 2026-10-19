// Espèces de serpents du mode Snake.io : couleurs, motif du dos, forme de la tête, yeux et
// particularités (hotte du cobra, sonnette du crotale). Données et petites fonctions de couleur
// seulement : le dessin est dans snakePainter.js.
// Motifs : bands (anneaux), saddles (selles), blotches (taches), diamonds (losanges),
// spots (points), stripes (rayures longitudinales), chevrons, plain (uni).
const SnakeSpecies = (() => {
  const LIST = [
    { id: 'ballPython', name: 'Python royal', base: '#4a3220', head: '#3f2a1a', ui: '#c99a5a', eye: '#3a2a12', pupil: 'slit', headShape: 'round',
      pattern: { kind: 'blotches', color: '#c39552', edge: '#22150a', every: 4 } },
    { id: 'corn', name: 'Serpent des blés', base: '#dd7a3c', head: '#cf6c33', ui: '#ff8a50', eye: '#b8331f', pupil: 'round', headShape: 'round',
      pattern: { kind: 'saddles', color: '#b3281b', edge: '#2b0d07', every: 5 } },
    { id: 'coral', name: 'Serpent corail', base: '#121212', head: '#121212', ui: '#e53935', eye: '#111111', pupil: 'round', headShape: 'round',
      pattern: { kind: 'bands', sequence: [['#c62828', 4], ['#f6cf3a', 1], ['#121212', 3], ['#f6cf3a', 1]] } },
    { id: 'diamondback', name: 'Crotale diamantin', base: '#9c8667', head: '#8b7558', ui: '#d8c3a0', eye: '#c9a227', pupil: 'slit', headShape: 'triangular', rattle: true,
      pattern: { kind: 'diamonds', color: '#4a3826', edge: '#efe4c8', every: 5 } },
    { id: 'blackMamba', name: 'Mamba noir', base: '#50554b', head: '#42463e', ui: '#9ea596', eye: '#141414', pupil: 'round', headShape: 'coffin', sheen: 0.32,
      pattern: { kind: 'plain' } },
    { id: 'greenTreePython', name: 'Python vert', base: '#2f9b3e', head: '#2a8c37', ui: '#66d36e', eye: '#d9c35a', pupil: 'slit', headShape: 'round',
      pattern: { kind: 'spots', color: '#eef8dc', every: 6 } },
    { id: 'garter', name: 'Couleuvre rayée', base: '#27322b', head: '#242c26', ui: '#e3d24a', eye: '#1a1a1a', pupil: 'round', headShape: 'round',
      pattern: { kind: 'stripes', color: '#e3d24a', side: '#a9c27e' } },
    { id: 'kingCobra', name: 'Cobra royal', base: '#615f35', head: '#58562f', ui: '#c8c27a', eye: '#1c1a10', pupil: 'round', headShape: 'round', hood: true,
      pattern: { kind: 'chevrons', color: '#dcd6a2', every: 6 } },
    { id: 'milk', name: 'Serpent laitier', base: '#b71c1c', head: '#151515', ui: '#ef5350', eye: '#151515', pupil: 'round', headShape: 'round',
      pattern: { kind: 'bands', sequence: [['#b71c1c', 3], ['#151515', 1], ['#f3efe4', 2], ['#151515', 1]] } },
    { id: 'gaboon', name: 'Vipère du Gabon', base: '#8b6b4d', head: '#d6c6a4', ui: '#bfa07a', eye: '#b58b2b', pupil: 'slit', headShape: 'triangular',
      pattern: { kind: 'diamonds', color: '#4a2e21', edge: '#dac7a3', every: 4 } },
    { id: 'boa', name: 'Boa constricteur', base: '#bba27c', head: '#a99069', ui: '#d7b98c', eye: '#7a5a2a', pupil: 'slit', headShape: 'round',
      pattern: { kind: 'saddles', color: '#6b3a24', edge: '#3a1e12', every: 7, tail: '#a3401f' } },
    { id: 'kingsnake', name: 'Serpent-roi', base: '#171717', head: '#171717', ui: '#efe5c4', eye: '#101010', pupil: 'round', headShape: 'round',
      pattern: { kind: 'bands', sequence: [['#171717', 3], ['#eee3c0', 1]] } },
  ];
  const KINDS = ['bands', 'saddles', 'blotches', 'diamonds', 'spots', 'stripes', 'chevrons', 'plain'];
  const NAMES = ['Kaa', 'Nagini', 'Ouroboros', 'Sifflet', 'Écaille', 'Ondine', 'Zigzag', 'Basilic', 'Vipérine',
    'Mamba', 'Jörmungand', 'Sésame', 'Nala', 'Python', 'Ruban', 'Silex', 'Mousse', 'Ambre', 'Cobalt', 'Sable'];

  function byId(id) {
    return LIST.find(s => s.id === id);
  }

  function random(rng = Math.random) {
    return LIST[Math.floor(rng() * LIST.length) % LIST.length];
  }

  // Couleur de l'anneau qui couvre le segment i (motif bands), en boucle sur la séquence.
  function bandColor(species, i) {
    const sequence = species.pattern.sequence;
    const period = sequence.reduce((n, [, length]) => n + length, 0);
    let k = ((i % period) + period) % period;
    for (const [color, length] of sequence) {
      if (k < length) return color;
      k -= length;
    }
    return species.base;
  }

  function rgb(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  }

  // Couleur assombrie : factor = part de la couleur gardée (0 à 1).
  function shade(hex, factor) {
    return `rgb(${rgb(hex).map(c => Math.round(c * factor)).join(', ')})`;
  }

  function rgba(hex, alpha) {
    return `rgba(${rgb(hex).join(', ')}, ${alpha})`;
  }

  // Mélange de deux couleurs (t = 0 : a, t = 1 : b).
  function mix(a, b, t) {
    const [ca, cb] = [rgb(a), rgb(b)];
    return `rgb(${ca.map((c, i) => Math.round(c + (cb[i] - c) * t)).join(', ')})`;
  }

  return { LIST, KINDS, NAMES, byId, random, bandColor, rgb, shade, rgba, mix };
})();
