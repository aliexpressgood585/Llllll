import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

/**
 * Local HTTP server: /api/state (bot snapshot), /api/control (POST {action}), and the built dashboard from dist/.
 * Binds to 127.0.0.1 by default — the control endpoint must never be exposed publicly.
 */
export function startServer(port: number, host: string, getState: () => unknown, control: (action: string) => Promise<string>) {
  const dist = join(process.cwd(), 'dist');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (url.pathname === '/api/state') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return void res.end(JSON.stringify(getState()));
    }
    if (url.pathname === '/api/control' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const { action } = JSON.parse(body || '{}') as { action?: string };
        const r = await control(String(action));
        res.writeHead(r === 'ok' ? 200 : 400, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ result: r }));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ error: String(e) }));
      }
    }
    // static dashboard
    let file = normalize(join(dist, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return void res.end('Dashboard not built yet — run `npm run build`. API: /api/state');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  server.listen(port, host, () => console.log(`dashboard + API on http://${host}:${port}  (#bot tab)`));
  return server;
}
