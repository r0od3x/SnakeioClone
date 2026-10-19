import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server.mjs';
import { OnlineGame, loadClasses } from '../game.mjs';

// Lit le premier événement SSE d'un flux.
async function firstEvent(url) {
  const res = await fetch(url);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('\n\n')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  reader.cancel();
  return JSON.parse(text.split('\n\n')[0].replace(/^data: /, ''));
}

test('serveur : page et assets, deux joueurs rejoignent, état reçu, entrée acceptée', async () => {
  const game = new OnlineGame({ classes: loadClasses(), rules: { bots: 3 } });
  const host = startServer({ port: 0, host: '127.0.0.1', game, log: () => {} });
  await new Promise(resolve => host.server.once('listening', resolve));
  const base = `http://127.0.0.1:${host.server.address().port}`;
  try {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Snake\.io/);
    for (const path of ['/client.js', '/style.css', '/shared/snakePainter.js', '/shared/meadow.js']) {
      assert.equal((await fetch(base + path)).status, 200, path);
    }
    assert.equal((await fetch(`${base}/../server.mjs`)).status, 404, 'pas d\'accès aux autres fichiers');
    assert.equal((await fetch(`${base}/shared/vehicle.js`)).status, 404, 'seulement les fichiers de dessin');

    const join = name => fetch(`${base}/join`, { method: 'POST', body: JSON.stringify({ name }) }).then(r => r.json());
    const me = await join('Roode');
    const friend = await join('Ami');
    assert.ok(me.id && friend.id && me.id !== friend.id);
    assert.equal(game.players.size, 2);

    const snap = await firstEvent(`${base}/events?id=${me.id}`);
    assert.equal(snap.me.name, 'Roode');
    assert.equal(snap.players, 2);
    assert.ok(snap.snakes.some(s => s.me));

    const input = await fetch(`${base}/input?id=${friend.id}`, { method: 'POST', body: JSON.stringify({ x: 10, y: 20, boost: true }) });
    assert.equal(input.status, 204);
    assert.deepEqual(game.players.get(friend.id).snake.input, { x: 10, y: 20, boost: true });
    assert.equal((await fetch(`${base}/input?id=nope`, { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await fetch(`${base}/events?id=nope`)).status, 404);
    assert.equal((await fetch(`${base}/join`, { method: 'POST', body: 'pas du json' })).status, 400);
  } finally {
    await host.close();
  }
});
