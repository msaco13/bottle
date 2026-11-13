// A tiny static server for working on this at home: node dev-server.mjs
// Nothing here ships. The real thing is just the static files.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8899);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/dev/shot') {       // save a canvas capture while building
    const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString(), ext = s.startsWith('data:image/jpeg') ? '.jpg' : '.png';
      fs.mkdirSync(path.join(root, '.shots'), { recursive: true });
      fs.writeFileSync(path.join(root, '.shots', name + ext), Buffer.from(s.slice(s.indexOf(',') + 1), 'base64'));
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  if (url.pathname === '/broken.html') {                             // the page with its main file missing, to test the safety net
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('js/main.js', 'js/missing.js'));
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('Bottle on http://localhost:' + PORT));
