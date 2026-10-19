// Enregistrement du canvas en vidéo (MediaRecorder sur canvas.captureStream) : une image vidéo
// exactement par image dessinée (requestFrame), haut débit, un fichier par plan nommé d'après
// son id. MP4 (H.264) si le navigateur sait l'encoder, sinon WebM (VP9 / VP8).
// Captures d'écran haute résolution : on redessine l'image dans un canvas 2× ou 4× plus grand.
const Recorder = (() => {
  const TYPES = ['video/mp4;codecs=avc1.640034', 'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const BITRATE = 40_000_000;

  function defaultEnv() {
    return {
      MediaRecorder: typeof MediaRecorder === 'undefined' ? null : MediaRecorder,
      download: downloadBlob,
    };
  }

  function pickType(isSupported) {
    return TYPES.find(type => isSupported(type)) ?? '';
  }

  function extension(type) {
    return type.startsWith('video/mp4') ? 'mp4' : 'webm';
  }

  // Nom de fichier sûr à partir d'un id de plan.
  function fileName(id, ext) {
    const safe = String(id ?? 'plan').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
    return `${safe}.${ext}`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function create(canvas, env = defaultEnv()) {
    const rec = { recording: false, name: null, type: '', frames: 0, supported: Boolean(env.MediaRecorder && canvas?.captureStream) };
    let recorder = null;
    let track = null;
    let chunks = [];

    rec.start = id => {
      if (!rec.supported || rec.recording) return false;
      rec.type = pickType(t => env.MediaRecorder.isTypeSupported(t));
      // Flux à la demande : une image vidéo par appel à frame().
      const stream = canvas.captureStream(0);
      track = stream.getVideoTracks()[0];
      recorder = new env.MediaRecorder(stream, { mimeType: rec.type || undefined, videoBitsPerSecond: BITRATE });
      chunks = [];
      recorder.ondataavailable = event => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      rec.name = fileName(id, extension(rec.type || 'video/webm'));
      rec.frames = 0;
      recorder.start(1000);
      rec.recording = true;
      return true;
    };

    rec.frame = () => {
      if (!rec.recording) return;
      track.requestFrame?.();
      rec.frames++;
    };

    // Arrête et télécharge ; la promesse donne { name, size, frames }.
    rec.stop = () => new Promise(resolve => {
      if (!rec.recording) {
        resolve(null);
        return;
      }
      rec.recording = false;
      const name = rec.name;
      const frames = rec.frames;
      recorder.onstop = () => {
        const BlobClass = env.Blob ?? Blob;
        const blob = new BlobClass(chunks, { type: rec.type || 'video/webm' });
        env.download(blob, name);
        track?.stop();
        resolve({ name, size: blob.size, frames });
      };
      recorder.stop();
    });

    return rec;
  }

  // Capture haute résolution : draw(ctx, w, h) dessine l'image en pixels CSS dans un canvas
  // scale fois plus grand ; PNG téléchargé.
  function screenshot(draw, w, h, scale, name, env = defaultEnv()) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    draw(ctx, w, h);
    return new Promise(resolve => canvas.toBlob(blob => {
      env.download(blob, name);
      resolve({ name, width: canvas.width, height: canvas.height });
    }, 'image/png'));
  }

  return { TYPES, BITRATE, pickType, extension, fileName, create, screenshot, downloadBlob };
})();
