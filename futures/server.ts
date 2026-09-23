import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Local HTTP server: the desk page (/), /api/state and /api/control (POST {action}).
 * Binds to 127.0.0.1 by default; control requests are accepted only from the same machine.
 */
export function startServer(port: number, host: string, getState: () => unknown, control: (a: string) => Promise<string>, report: () => string) {
  const page = join(import.meta.dirname, 'public', 'index.html');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/state') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return void res.end(JSON.stringify(getState()));
    }
    if (url.pathname === '/api/report') {
      res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' });
      return void res.end(report());
    }
    if (url.pathname === '/api/control' && req.method === 'POST') {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') || process.env.FUT_ALLOW_REMOTE_CONTROL === '1';
      if (!local) return void res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'control is local-only' }));
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
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readFileSync(page));
  });
  server.listen(port, host, () => console.log(`futures desk on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  return server;
}
