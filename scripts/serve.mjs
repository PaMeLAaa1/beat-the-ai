import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let filename = resolve(root, '.' + pathname);
    const withinRoot = filename === resolve(root) || filename.startsWith(resolve(root) + sep);
    if (!withinRoot) {
      response.writeHead(403);
      response.end();
      return;
    }
    const info = await stat(filename);
    if (info.isDirectory()) filename = resolve(filename, 'index.html');
    const content = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': mime[extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404);
    response.end();
  }
});
server.listen(port, host, () => {
  const address = server.address();
  console.log('暴打 AI: http://' + host + ':' + address.port);
});
