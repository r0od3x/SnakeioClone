// Serveur du Snake.io en ligne (réseau local) : à lancer sur le PC hôte avec `node server.mjs`.
// Il sert la page du jeu, simule la partie (game.mjs) 60 fois par seconde et envoie à chaque
// joueur ce qui l'entoure 20 fois par seconde (Server-Sent Events). Les joueurs envoient leur
// point visé et l'accélération (POST /input). Aucune dépendance : modules intégrés de Node.
import http from 'node:http';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { OnlineGame } from './game.mjs';

const TICK_MS = 1000 / 60;
// Un instantané toutes les SEND_EVERY images (60 / 3 = 20 par seconde).
const SEND_EVERY = 3;
// Un joueur déconnecté depuis plus longtemps que ça est retiré de la partie (ms).
const LEAVE_AFTER_MS = 5000;

const FILES = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/client.js': ['public/client.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
};
for (const name of ['snakeSpecies.js', 'snakePainter.js', 'meadow.js', 'preySprites.js']) {
  FILES[`/shared/${name}`] = [`shared/${name}`, 'text/javascript; charset=utf-8'];
}

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error('trop gros'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function startServer({ port = 3000, host = '0.0.0.0', game = new OnlineGame(), log = console.log } = {}) {
  // id du joueur -> { res (flux SSE ou null), lastSeen }
  const clients = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && FILES[url.pathname]) {
        const [file, type] = FILES[url.pathname];
        const body = await readFile(new URL(`./${file}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(body);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/join') {
        const { name } = JSON.parse((await readBody(req)) || '{}');
        const player = game.join(name);
        if (!player) return json(res, 503, { error: 'Partie pleine' });
        clients.set(player.id, { res: null, lastSeen: Date.now() });
        log(`+ ${player.name} a rejoint la partie (${game.players.size} joueur(s))`);
        return json(res, 200, { id: player.id, name: player.name, radius: game.rules.radius });
      }
      if (req.method === 'POST' && url.pathname === '/input') {
        const id = url.searchParams.get('id');
        const ok = game.setInput(id, JSON.parse((await readBody(req)) || '{}'));
        if (clients.has(id)) clients.get(id).lastSeen = Date.now();
        res.writeHead(ok ? 204 : 404, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        const id = url.searchParams.get('id');
        if (!game.players.has(id)) return json(res, 404, { error: 'Joueur inconnu' });
        // X-Accel-Buffering : demande aux proxys (tunnel Internet) de ne pas retenir le flux.
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
          Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.socket?.setNoDelay(true);
        res.write(`data: ${JSON.stringify(game.snapshot(id))}\n\n`);
        const client = clients.get(id) ?? { lastSeen: Date.now() };
        client.res = res;
        clients.set(id, client);
        req.on('close', () => {
          if (client.res === res) client.res = null;
          client.lastSeen = Date.now();
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable');
    } catch (error) {
      json(res, 400, { error: error.message });
    }
  });

  // Pas de temps fixe : sous Windows, les minuteries ne tombent que toutes les ~15,6 ms ; on
  // rattrape donc le temps réel écoulé (plusieurs images de simulation par appel si besoin) pour
  // garder exactement 60 images par seconde, et les envois suivent le même compteur.
  let tick = 0;
  let last = performance.now();
  let pending = 0;
  const loop = setInterval(() => {
    const nowPrecise = performance.now();
    pending = Math.min(pending + nowPrecise - last, TICK_MS * 10);
    last = nowPrecise;
    let send = false;
    while (pending >= TICK_MS) {
      pending -= TICK_MS;
      game.step();
      tick++;
      if (tick % SEND_EVERY === 0) send = true;
    }
    const now = Date.now();
    for (const [id, client] of clients) {
      if (!game.players.has(id)) {
        clients.delete(id);
        continue;
      }
      if (!client.res && now - client.lastSeen > LEAVE_AFTER_MS) {
        log(`- ${game.players.get(id).name} a quitté la partie`);
        game.leave(id);
        clients.delete(id);
        continue;
      }
      if (client.res && send) client.res.write(`data: ${JSON.stringify(game.snapshot(id))}\n\n`);
    }
  }, 4);

  server.listen(port, host);
  return {
    server, game, clients,
    close() {
      clearInterval(loop);
      for (const client of clients.values()) client.res?.end();
      return new Promise(resolve => server.close(resolve));
    },
  };
}

// Adresses du PC sur le réseau local, à donner à l'ami.
export function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = startServer({ port });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Le port ${port} est déjà utilisé. Essaie un autre port, par exemple :  PORT=3001 node server.mjs`);
      process.exit(1);
    }
    throw error;
  });
  server.on('listening', () => {
    console.log(`Snake.io en ligne : http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`  pour ton ami (même Wi-Fi) : http://${ip}:${port}`);
    console.log('Ctrl+C pour arrêter.');
  });
}
