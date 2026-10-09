// Renderer-side JSON-RPC client for clangd (transport injected, so it is unit-testable).
export interface LspTransport { send(msg: unknown): Promise<boolean> | boolean }
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class LspClient {
  private id = 0;
  private pending = new Map<number, Pending>();
  private versions = new Map<string, number>();
  private notifHandlers = new Map<string, (p: unknown) => void>();
  private t: LspTransport;
  private timeoutMs: number;
  constructor(t: LspTransport, timeoutMs = 8000) { this.t = t; this.timeoutMs = timeoutMs; }

  request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`LSP ${method} timed out`)); }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      Promise.resolve(this.t.send({ jsonrpc: '2.0', id, method, params })).then((ok) => {
        if (ok === false) { clearTimeout(timer); this.pending.delete(id); reject(new Error('LSP not running')); }
      });
    });
  }
  notify(method: string, params: unknown) { void this.t.send({ jsonrpc: '2.0', method, params }); }
  onNotification(method: string, cb: (p: unknown) => void) { this.notifHandlers.set(method, cb); }

  handleMessage(m: any) {
    if (!m || typeof m !== 'object') return;
    if (typeof m.id === 'number' && !m.method) {
      const p = this.pending.get(m.id); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message || 'LSP error')) : p.resolve(m.result);
    } else if (typeof m.method === 'string') {
      if (m.id !== undefined) void this.t.send({ jsonrpc: '2.0', id: m.id, result: null }); // ack server requests
      this.notifHandlers.get(m.method)?.(m.params);
    }
  }
  open(uri: string, languageId: string, text: string) {
    this.versions.set(uri, 1);
    this.notify('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text } });
  }
  change(uri: string, text: string) {
    const v = (this.versions.get(uri) ?? 0) + 1; this.versions.set(uri, v);
    this.notify('textDocument/didChange', { textDocument: { uri, version: v }, contentChanges: [{ text }] });
  }
  close(uri: string) { this.versions.delete(uri); this.notify('textDocument/didClose', { textDocument: { uri } }); }
  dispose() { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('disposed')); } this.pending.clear(); }
}
