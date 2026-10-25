import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { handle } from './api';
import { localMode } from './db';
if (!localMode()) throw new Error('The Docker adapter is for local/test use only. Deploy the Netlify Function in production.');
const root = resolve('dist');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const request = new Request(url, { method: req.method, headers: req.headers as HeadersInit, ...(!['GET', 'HEAD'].includes(req.method ?? 'GET') ? { body: req as unknown as ReadableStream, duplex: 'half' } : {}) } as RequestInit);
      const response = await handle(request, req.socket.remoteAddress);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\') && file !== root) { res.writeHead(404); res.end(); return; }
    let bytes: Buffer; let type = types[extname(file)] ?? 'application/octet-stream';
    try { bytes = await readFile(file); } catch { bytes = await readFile(resolve(root, 'index.html')); type = types['.html']; }
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }); res.end(bytes);
  } catch { res.writeHead(500); res.end('The local application could not serve this request.'); }
});
server.listen(8888, '0.0.0.0', () => console.log('Planner running at http://localhost:8888'));
