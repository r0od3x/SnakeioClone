// Images des proies du mode Snake.io, dessinées une fois sur des petits canvas (vues de dessus,
// tournées vers la droite) : œuf, grillon, grenouille, souris. Aucun effet sur la simulation.
const PreySprites = (() => {
  const SIZE = 96;
  const cache = {};

  function shadow(g, rx, ry) {
    g.fillStyle = 'rgba(14, 24, 6, 0.35)';
    g.beginPath();
    g.ellipse(52, 54, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  function radial(g, x, y, r, inner, outer) {
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    return grad;
  }

  function egg(g) {
    shadow(g, 24, 18);
    g.fillStyle = radial(g, 48, 48, 26, '#fffdf4', '#d9ccb0');
    g.beginPath();
    g.ellipse(48, 48, 25, 19, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(120, 90, 50, 0.45)';
    for (const [x, y, r] of [[40, 42, 2], [56, 50, 1.6], [50, 38, 1.2], [36, 54, 1.4], [60, 42, 1.1]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  function cricket(g) {
    shadow(g, 26, 10);
    g.strokeStyle = '#3a2b14';
    g.lineCap = 'round';
    // Pattes arrière puissantes, pattes avant, antennes.
    g.lineWidth = 3.4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(44, 48 + s * 6);
      g.lineTo(26, 48 + s * 18);
      g.lineTo(14, 48 + s * 12);
      g.stroke();
    }
    g.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(58, 48 + s * 5);
      g.lineTo(66, 48 + s * 15);
      g.moveTo(52, 48 + s * 6);
      g.lineTo(54, 48 + s * 17);
      g.stroke();
      g.beginPath();
      g.moveTo(72, 48 + s * 3);
      g.quadraticCurveTo(84, 48 + s * 10, 94, 48 + s * 22);
      g.lineWidth = 1;
      g.stroke();
      g.lineWidth = 1.8;
    }
    g.fillStyle = radial(g, 46, 48, 22, '#8a6b36', '#3f2e15');
    g.beginPath();
    g.ellipse(44, 48, 22, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = radial(g, 68, 48, 8, '#6d5328', '#2e210f');
    g.beginPath();
    g.ellipse(68, 48, 7, 6.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(26, 46);
    g.lineTo(60, 46);
    g.stroke();
  }

  function frog(g) {
    shadow(g, 26, 22);
    const skin = '#5e9c3a';
    g.fillStyle = '#4a7f2c';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(32, 48 + s * 20, 16, 7, s * 0.5, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(62, 48 + s * 17, 8, 4, -s * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = radial(g, 50, 48, 24, '#8cc95c', skin);
    g.beginPath();
    g.ellipse(48, 48, 23, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(30, 60, 15, 0.55)';
    for (const [x, y, r] of [[40, 44, 3.5], [50, 54, 3], [36, 54, 2.5], [46, 40, 2.2]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    for (const s of [-1, 1]) {
      g.fillStyle = '#f2e9a0';
      g.beginPath();
      g.arc(64, 48 + s * 9, 5.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111111';
      g.beginPath();
      g.ellipse(65, 48 + s * 9, 2.2, 3.2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  function mouse(g) {
    shadow(g, 30, 16);
    g.strokeStyle = '#c99a9a';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(22, 48);
    g.bezierCurveTo(10, 40, 8, 62, 2, 58);
    g.stroke();
    g.fillStyle = radial(g, 46, 48, 26, '#b8aea4', '#6e655c');
    g.beginPath();
    g.ellipse(44, 48, 24, 15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = radial(g, 70, 48, 12, '#b0a69b', '#776d63');
    g.beginPath();
    g.ellipse(68, 48, 13, 9.5, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = '#8f8379';
      g.beginPath();
      g.arc(62, 48 + s * 10, 6.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8a7a7';
      g.beginPath();
      g.arc(62, 48 + s * 10, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111111';
      g.beginPath();
      g.arc(73, 48 + s * 4.5, 1.8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(240, 240, 240, 0.45)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(80, 48 + s * 2);
      g.lineTo(92, 48 + s * 9);
      g.moveTo(80, 48 + s * 2);
      g.lineTo(93, 48 + s * 3);
      g.stroke();
    }
    g.fillStyle = '#e48f9a';
    g.beginPath();
    g.arc(81, 48, 2.2, 0, Math.PI * 2);
    g.fill();
  }

  const PAINTERS = { egg, cricket, frog, mouse };

  function get(kind) {
    if (kind in cache) return cache[kind];
    if (typeof document === 'undefined' || !PAINTERS[kind]) return (cache[kind] = null);
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    PAINTERS[kind](c.getContext('2d'));
    cache[kind] = c;
    return c;
  }

  return { SIZE, KINDS: Object.keys(PAINTERS), get };
})();
