// Renderer-side JSON-RPC client for clangd (transport injected, so it is unit-testable).
export interface LspTransport { send(msg: unknown): Promise<boolean> | boolean }
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; method: string };

/** LSP incremental change (0-based UTF-16 positions, in the coordinates of the document before this change). */
export interface LspContentChange {
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
  rangeLength?: number;
  text: string;
}

/** Minimal cancellation shape (Monaco's CancellationToken fits it). */
export interface CancelToken { isCancellationRequested: boolean; onCancellationRequested?: (cb: () => void) => unknown }

export class LspCancelled extends Error { constructor() { super('LSP request cancelled'); this.name = 'LspCancelled'; } }

export class LspClient {
  private id = 0;
  private pending = new Map<number, Pending>();
  private versions = new Map<string, number>();
  private notifHandlers = new Map<string, Set<(p: unknown) => void>>();
  private requestHandlers = new Map<string, (p: unknown) => unknown>();
  private t: LspTransport;
  private timeoutMs: number;
  constructor(t: LspTransport, timeoutMs = 8000) { this.t = t; this.timeoutMs = timeoutMs; }

  request<T = unknown>(method: string, params: unknown, token?: CancelToken, timeoutMs = this.timeoutMs): Promise<T> {
    if (token?.isCancellationRequested) return Promise.reject(new LspCancelled());
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        this.notify('$/cancelRequest', { id });
        reject(new Error(`LSP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, method });
      token?.onCancellationRequested?.(() => {
        const p = this.pending.get(id); if (!p) return;
        clearTimeout(p.timer); this.pending.delete(id);
        this.notify('$/cancelRequest', { id });
        p.reject(new LspCancelled());
      });
      Promise.resolve(this.t.send({ jsonrpc: '2.0', id, method, params })).then((ok) => {
        if (ok === false && this.pending.delete(id)) { clearTimeout(timer); reject(new Error('LSP not running')); }
      }, (e) => { if (this.pending.delete(id)) { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); } });
    });
  }
  notify(method: string, params: unknown) { void Promise.resolve(this.t.send({ jsonrpc: '2.0', method, params })).catch(() => {}); }
  /** Subscribe to a server notification; returns an unsubscribe function. Several listeners may share a method. */
  onNotification(method: string, cb: (p: unknown) => void): () => void {
    let set = this.notifHandlers.get(method);
    if (!set) { set = new Set(); this.notifHandlers.set(method, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  }
  /** Answer a server->client request (default answer is a null result). */
  onRequest(method: string, cb: (p: unknown) => unknown) { this.requestHandlers.set(method, cb); }

  handleMessage(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const m = raw as { id?: number | string; method?: unknown; params?: unknown; result?: unknown; error?: { message?: string } };
    if ((typeof m.id === 'number' || typeof m.id === 'string') && typeof m.method !== 'string') {
      const p = this.pending.get(m.id as number); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(m.id as number);
      if (m.error) p.reject(new Error(m.error.message || 'LSP error')); else p.resolve(m.result);
    } else if (typeof m.method === 'string') {
      if (m.id !== undefined) {
        let result: unknown;
        try { result = this.requestHandlers.get(m.method)?.(m.params) ?? null; } catch { result = null; }
        void Promise.resolve(this.t.send({ jsonrpc: '2.0', id: m.id, result })).catch(() => {});
      }
      const set = this.notifHandlers.get(m.method);
      if (set) for (const cb of [...set]) { try { cb(m.params); } catch { /* a bad listener must not kill the pump */ } }
    }
  }
  isOpen(uri: string) { return this.versions.has(uri); }
  version(uri: string) { return this.versions.get(uri) ?? 0; }
  open(uri: string, languageId: string, text: string) {
    this.versions.set(uri, 1);
    this.notify('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text } });
  }
  /** Full-text change (string) or an ordered list of incremental changes. */
  change(uri: string, changes: string | LspContentChange[]) {
    if (!this.versions.has(uri)) return;
    const v = (this.versions.get(uri) ?? 0) + 1; this.versions.set(uri, v);
    const contentChanges = typeof changes === 'string' ? [{ text: changes }] : changes;
    this.notify('textDocument/didChange', { textDocument: { uri, version: v }, contentChanges });
  }
  save(uri: string) { if (this.versions.has(uri)) this.notify('textDocument/didSave', { textDocument: { uri } }); }
  close(uri: string) { if (!this.versions.delete(uri)) return; this.notify('textDocument/didClose', { textDocument: { uri } }); }
  /** Forget all documents and fail in-flight requests (used when the server restarts). */
  reset(reason = 'LSP restarted') {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(reason)); }
    this.pending.clear(); this.versions.clear();
  }
  dispose() { this.reset('disposed'); this.notifHandlers.clear(); this.requestHandlers.clear(); }
}
