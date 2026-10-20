import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export async function serveTestGame(root) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.ttf': 'font/ttf',
  };
  const server = createServer((request, response) => {
    try {
      let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (name === '/') {
        name = '/index.html';
      }
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      let body = readFileSync(file);
      if (name === '/assets/game.js') {
        let code = body.toString();
        const alias = code.match(/get mode\(\)\s*\{\s*return ([\w$]+)\.mode/)[1];
        code = code.replace(
          /window\.__GAME__\s*=/,
          `window.__QA_APP__ = ${alias};window.__GAME__ =`,
        );
        body = Buffer.from(code);
      }
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  };
}
