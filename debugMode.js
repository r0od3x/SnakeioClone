// Interrupteur de débogage partagé par les scénarios (bouton « Debug » et touche D).
const DebugMode = (() => {
  let enabled = false;
  const listeners = [];

  function toggle() {
    enabled = !enabled;
    for (const listener of listeners) listener(enabled);
    return enabled;
  }

  function bindToggle(button) {
    const render = () => {
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = `Debug : ${enabled ? 'activé' : 'désactivé'}`;
    };
    button.addEventListener('click', toggle);
    listeners.push(render);
    render();
    return render;
  }

  return { toggle, bindToggle, get enabled() { return enabled; } };
})();
