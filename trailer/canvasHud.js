// Interface du jeu dessinée dans le canvas (longueur, classement, fil des éliminations) : en
// studio, l'interface HTML n'apparaîtrait pas dans les vidéos enregistrées. Même style que
// style.css (cartes vitrées sombres, dégradé vert pâle). Lit SnakeArena.hud(state).
const CanvasHud = (() => {
  const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

  function card(ctx, x, y, w, h, r = 18) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.fillStyle = 'rgba(18, 28, 12, 0.62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function label(ctx, text, x, y) {
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = 'rgba(238, 241, 255, 0.55)';
    ctx.fillText(text.toUpperCase().split('').join(' '), x, y);
  }

  function score(ctx, hud, top) {
    card(ctx, 20, top + 20, 200, 108);
    label(ctx, 'Longueur', 42, top + 46);
    const g = ctx.createLinearGradient(42, 0, 160, 0);
    g.addColorStop(0, '#f6f9c8');
    g.addColorStop(1, '#9be15d');
    ctx.font = `800 44px ${FONT}`;
    ctx.fillStyle = g;
    ctx.fillText(String(hud.length), 40, top + 92);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(238, 241, 255, 0.72)';
    ctx.fillText(hud.rankText, 42, top + 114);
  }

  function board(ctx, hud, w, top) {
    const width = 230;
    const x = w - width - 20;
    card(ctx, x, top + 20, width, 42 + hud.board.length * 26);
    label(ctx, 'Classement', x + 16, top + 44);
    hud.board.forEach((row, i) => {
      const y = top + 70 + i * 26;
      if (row.isPlayer) {
        ctx.fillStyle = 'rgba(155, 225, 93, 0.25)';
        ctx.fillRect(x + 8, y - 16, width - 16, 23);
      }
      ctx.font = `${row.isPlayer ? 700 : 400} 13px ${FONT}`;
      ctx.fillStyle = 'rgba(238, 241, 255, 0.4)';
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), x + 16, y);
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(x + 40, y - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = row.isPlayer ? '#ffffff' : 'rgba(238, 241, 255, 0.85)';
      ctx.fillText(row.name, x + 54, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(row.mass), x + width - 16, y);
      ctx.textAlign = 'left';
    });
  }

  function feed(ctx, hud, w, top) {
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'center';
    hud.feed.slice(-4).forEach((entry, i) => {
      const text = entry.killer ? `${entry.killer} a éliminé ${entry.victim}` : `${entry.victim} est sorti de l'arène`;
      const tw = ctx.measureText(text).width + 28;
      const y = top + 22 + i * 34;
      card(ctx, w / 2 - tw / 2, y, tw, 28, 14);
      ctx.fillStyle = 'rgba(238, 241, 255, 0.85)';
      ctx.fillText(text, w / 2, y + 19);
    });
    ctx.textAlign = 'left';
  }

  // top : hauteur des bandes noires (l'interface reste dans l'image utile).
  function draw(ctx, state, w, h, top = 0) {
    const hud = SnakeArena.hud(state);
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    if (!hud.dead) score(ctx, hud, top);
    board(ctx, hud, w, top);
    feed(ctx, hud, w, top);
    ctx.restore();
    return hud;
  }

  return { draw };
})();
