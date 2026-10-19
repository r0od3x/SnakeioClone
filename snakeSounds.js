// Bruitages du mode Snake.io, synthétisés par la Web Audio API (sortie audio de l'ordinateur) :
// croc quand le joueur mange, souffle continu pendant l'accélération, « chomp » à chaque
// élimination, plainte descendante à la mort, arpège montant à la réapparition, fanfare pour
// la première place, « ding » à chaque palier de longueur. Rien n'est joué si le son est coupé.
const SnakeSounds = (() => {
  const VOLUME = 0.22;
  const SILENCE = 0.001;
  // Notes (Hz) : réapparition (do-mi-sol) et fanfare (sol-do-mi-sol).
  const RESPAWN = [523.25, 659.25, 783.99];
  const FANFARE = [783.99, 1046.5, 1318.5, 1568];

  function defaultAudioContext() {
    return typeof window === 'undefined' ? undefined : window.AudioContext || window.webkitAudioContext;
  }

  function create(AudioContextClass = defaultAudioContext(), rng = Math.random) {
    let context = null;
    let master = null;
    let noise = null;
    let hiss = null;
    let enabled = false;

    function build() {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = VOLUME;
      master.connect(context.destination);
      noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = rng() * 2 - 1;
    }

    function envelope(level, t, duration) {
      const gain = context.createGain();
      gain.gain.setValueAtTime(level, t);
      gain.gain.exponentialRampToValueAtTime(SILENCE, t + duration);
      gain.connect(master);
      return gain;
    }

    // Note : forme d'onde, fréquence de départ et d'arrivée, début, durée, niveau.
    function tone(type, from, to, t, duration, level) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, t);
      if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, t + duration);
      oscillator.connect(envelope(level, t, duration));
      oscillator.start(t);
      oscillator.stop(t + duration);
    }

    function burst(type, frequency, t, duration, level) {
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      source.connect(filter);
      filter.connect(envelope(level, t, duration));
      source.start(t);
      source.stop(t + duration);
    }

    const sounds = {
      eat(t) {
        tone('sine', 520 + rng() * 120, 980, t, 0.07, 0.35);
        burst('highpass', 3000, t, 0.03, 0.25);
      },
      kill(t) {
        tone('square', 240, 70, t, 0.2, 0.45);
        burst('lowpass', 900, t, 0.18, 0.7);
      },
      death(t) {
        tone('sawtooth', 420, 55, t, 0.9, 0.4);
        tone('sine', 210, 40, t + 0.05, 0.9, 0.35);
        burst('lowpass', 500, t, 0.5, 0.5);
      },
      respawn(t) {
        RESPAWN.forEach((f, i) => tone('triangle', f, f, t + i * 0.08, 0.18, 0.4));
      },
      firstPlace(t) {
        FANFARE.forEach((f, i) => tone('square', f, f, t + i * 0.1, i === FANFARE.length - 1 ? 0.45 : 0.14, 0.22));
      },
      milestone(t) {
        tone('sine', 1320, 1320, t, 0.5, 0.35);
        tone('sine', 1980, 1980, t, 0.35, 0.15);
      },
    };

    // Joue un bruitage par son nom ; renvoie false si le son est coupé ou indisponible.
    function play(name) {
      if (!enabled || !context || !sounds[name]) return false;
      sounds[name](context.currentTime);
      return true;
    }

    // Souffle continu (bruit filtré qui monte et descend en douceur) tant que le joueur accélère.
    function setBoost(on) {
      if (!context) return false;
      const active = enabled && on;
      if (active && !hiss) {
        const source = context.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;
        const gain = context.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.18, context.currentTime, 0.05);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start();
        hiss = { source, gain };
      } else if (!active && hiss) {
        hiss.gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
        hiss.source.stop(context.currentTime + 0.3);
        hiss = null;
      }
      return active;
    }

    // Le contexte audio n'est créé qu'une fois le son activé (après un clic de l'utilisateur).
    function setEnabled(on) {
      if (Boolean(on) === enabled) return enabled;
      if (on && !AudioContextClass) return false;
      if (on && !context) build();
      if (on && context) context.resume();
      enabled = Boolean(on);
      if (!enabled) setBoost(false);
      return enabled;
    }

    // Bruitages des événements d'une image du mode Snake.io.
    function react(events) {
      const played = [];
      const add = name => { if (play(name)) played.push(name); };
      if (events.death) add('death');
      if (events.kills > 0) add('kill');
      if (events.eaten > 0) add('eat');
      if (events.rank === 1) add('firstPlace');
      if (events.milestone) add('milestone');
      if (events.respawned) add('respawn');
      setBoost(Boolean(events.boosting));
      return played;
    }

    return {
      supported: Boolean(AudioContextClass),
      play, setBoost, setEnabled, react,
      get enabled() { return enabled; },
      get boosting() { return hiss !== null; },
    };
  }

  return { VOLUME, RESPAWN, FANFARE, create };
})();
