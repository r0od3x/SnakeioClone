// Image « cinéma » appliquée après le dessin du jeu, sur le canvas entier (pixels réels) :
// étalonnage (contraste, saturation, luminosité via ctx.filter), lueur (copie floutée ajoutée),
// teinte, vignette, et bandes noires (format 2,39:1) qui peuvent entrer et sortir en douceur.
const Grade = (() => {
  const PRESETS = {
    none: null,
    cinematic: { contrast: 1.1, saturate: 1.12, brightness: 0.98, glow: 0.2, blur: 14, tint: 'rgba(255, 170, 90, 0.07)', vignette: 0.5 },
    golden: { contrast: 1.06, saturate: 1.25, brightness: 1.03, glow: 0.28, blur: 18, tint: 'rgba(255, 190, 80, 0.14)', vignette: 0.42 },
    moody: { contrast: 1.22, saturate: 0.8, brightness: 0.9, glow: 0.14, blur: 10, tint: 'rgba(40, 80, 120, 0.12)', vignette: 0.68 },
  };
  const ASPECT = 2.39;

  // Hauteur d'une bande noire (px) pour un écran w × h ; amount de 0 (absente) à 1.
  function letterboxBar(w, h, amount = 1, aspect = ASPECT) {
    return Math.max(0, (h - w / aspect) / 2) * Math.max(0, Math.min(1, amount));
  }

  function filterString(p) {
    return `contrast(${p.contrast}) saturate(${p.saturate}) brightness(${p.brightness})`;
  }

  // scratch : un canvas de travail réutilisé d'une image à l'autre (createScratch).
  function createScratch() {
    return typeof document === 'undefined' ? null : document.createElement('canvas');
  }

  function apply(ctx, presetName, scratch) {
    const p = PRESETS[presetName];
    if (!p || !scratch) return false;
    const canvas = ctx.canvas;
    const W = canvas.width;
    const H = canvas.height;
    if (scratch.width !== W || scratch.height !== H) {
      scratch.width = W;
      scratch.height = H;
    }
    const sg = scratch.getContext('2d');
    sg.clearRect(0, 0, W, H);
    sg.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.filter = filterString(p);
    ctx.drawImage(scratch, 0, 0);
    if (p.glow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = p.glow;
      ctx.filter = `blur(${Math.max(1, p.blur * W / 1920)}px) brightness(1.15)`;
      ctx.drawImage(scratch, 0, 0);
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = p.tint;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, `rgba(0, 0, 0, ${p.vignette})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return true;
  }

  function letterbox(ctx, amount, aspect = ASPECT) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const bar = letterboxBar(W, H, amount, aspect);
    if (bar <= 0) return 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, Math.ceil(bar));
    ctx.fillRect(0, H - Math.ceil(bar), W, Math.ceil(bar));
    ctx.restore();
    return bar;
  }

  return { PRESETS, NAMES: Object.keys(PRESETS), ASPECT, letterboxBar, filterString, createScratch, apply, letterbox };
})();
