// Interface HTML par-dessus le canvas : score, classement, fil des éliminations, écran de mort.
// Lit seulement les données de SnakeArena.hud(state).
const Hud = (() => {
  function el(id) {
    return document.getElementById(id);
  }

  function span(text, className = '') {
    const node = document.createElement('span');
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function board(rows) {
    return rows.map((row, i) => {
      const item = document.createElement('li');
      if (row.isPlayer) item.className = 'me';
      const dot = span('', 'dot');
      dot.style.background = row.color;
      dot.style.color = row.color;
      item.append(span(String(i + 1)), dot, span(row.name), span(String(row.mass)));
      return item;
    });
  }

  // « Kaa a éliminé Toi », ou « Toi a quitté l'arène » (mort contre le bord).
  function feed(items) {
    return items.map(entry => {
      const item = document.createElement('li');
      if (entry.mine) item.className = 'mine';
      const victim = span(entry.victim, 'who');
      victim.style.color = entry.victimColor;
      if (entry.killer) {
        const killer = span(entry.killer, 'who');
        killer.style.color = entry.color;
        item.append(killer, span(' a éliminé '), victim);
      } else {
        item.append(victim, span(' est sorti de l\'arène'));
      }
      return item;
    });
  }

  function deathStats(stats, length) {
    const rows = [['Longueur', length], ['Éliminations', stats.kills], ['Meilleur rang', stats.bestRank ?? '–'],
      ['Proies', stats.eaten]];
    return rows.flatMap(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = String(value);
      return [dt, dd];
    });
  }

  function render(state, profile) {
    const hud = SnakeArena.hud(state);
    el('hud-length').textContent = hud.length;
    el('hud-rank').textContent = hud.rankText;
    el('hud-species').textContent = hud.species;
    el('hud-record').textContent = profile.record ? `Record : ${profile.record}` : '';
    el('hud-board').replaceChildren(...board(hud.board));
    el('hud-feed').replaceChildren(...feed(hud.feed));
    const death = el('hud-death');
    if (death.hidden !== !hud.dead) {
      death.hidden = !hud.dead;
      if (hud.dead) el('hud-death-stats').replaceChildren(...deathStats(hud.stats, state.lastDeath?.length ?? 0));
    }
    el('hud-death-text').textContent = hud.deathText;
  }

  return { render, feed, board };
})();
