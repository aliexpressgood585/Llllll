/**
 * Minimal Deribit JSON-RPC client over WebSocket (public methods only — no API keys).
 * Docs: https://docs.deribit.com/  ·  endpoint wss://www.deribit.com/ws/api/v2
 * WebSocket is used instead of REST so the browser is not subject to CORS.
 */
export interface RpcClient {
  call<T>(method: string, params?: Record<string, unknown>): Promise<T>;
  close(): void;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class DeribitWsClient implements RpcClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private opening: Promise<void> | null = null;
  private closed = false;
  lastLatencyMs = 0;

  constructor(private url = 'wss://www.deribit.com/ws/api/v2', private timeoutMs = 12000) {}

  private open(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      const fail = (msg: string) => {
        this.opening = null;
        reject(new Error(msg));
      };
      ws.onopen = () => {
        this.ws = ws;
        this.opening = null;
        resolve();
      };
      ws.onerror = () => fail('Deribit WebSocket error');
      ws.onclose = () => {
        this.ws = null;
        for (const [id, p] of this.pending) {
          globalThis.clearTimeout(p.timer);
          p.reject(new Error('Deribit WebSocket closed'));
          this.pending.delete(id);
        }
      };
      ws.onmessage = (ev) => {
        let msg: { id?: number; result?: unknown; error?: { message: string; code: number }; usIn?: number; usOut?: number };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.id === undefined) return;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        globalThis.clearTimeout(p.timer);
        if (msg.usIn && msg.usOut) this.lastLatencyMs = (msg.usOut - msg.usIn) / 1000;
        if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else p.resolve(msg.result);
      };
    });
    return this.opening;
  }

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) throw new Error('client closed');
    await this.open();
    const id = ++this.seq;
    const t0 = performance.now();
    return new Promise<T>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timeout`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          this.lastLatencyMs = performance.now() - t0;
          resolve(v as T);
        },
        reject,
        timer,
      });
      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
