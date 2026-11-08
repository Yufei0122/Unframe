import http from 'node:http';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../mobile/dist');
try { await access(path.join(root, 'index.html')); } catch { console.error('Export the mobile app first: npm.cmd run mobile:export'); process.exit(1); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const port = Number(process.env.PORT) || 8082;
server.listen(port, '127.0.0.1', () => console.log(`Unframe mobile web preview: http://127.0.0.1:${port}`));
