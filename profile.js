// Profil du joueur gardé dans le navigateur : nom, espèce choisie (null = au hasard) et record.
// Le stockage est injectable (tests) ; s'il est indisponible (navigation privée), tout marche
// quand même, sans mémoire d'une visite à l'autre.
const Profile = (() => {
  const KEY = 'snake-io-profile';

  function defaultStorage() {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  function empty() {
    return { name: '', species: null, record: 0 };
  }

  function load(storage = defaultStorage()) {
    try {
      const saved = JSON.parse(storage?.getItem(KEY) ?? 'null');
      if (!saved || typeof saved !== 'object') return empty();
      return {
        name: typeof saved.name === 'string' ? saved.name.slice(0, 16) : '',
        species: typeof saved.species === 'string' ? saved.species : null,
        record: Number.isFinite(saved.record) && saved.record > 0 ? Math.round(saved.record) : 0,
      };
    } catch {
      return empty();
    }
  }

  function save(profile, storage = defaultStorage()) {
    try {
      storage?.setItem(KEY, JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }

  // Nouveau record si length le dépasse ; renvoie vrai dans ce cas.
  function submitScore(profile, length, storage = defaultStorage()) {
    if (!(length > profile.record)) return false;
    profile.record = Math.round(length);
    save(profile, storage);
    return true;
  }

  return { KEY, load, save, submitScore, empty };
})();
