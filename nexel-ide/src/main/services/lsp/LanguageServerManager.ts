import { spawn, ChildProcess } from 'node:child_process';
import { encodeFrame, FrameDecoder } from './framing';
import { validateLspMessage } from './lspValidate';

export type LspStatus = 'off' | 'starting' | 'ready' | 'crashed' | 'failed';
export const MAX_RESTARTS = 5;

/**
 * Owns one clangd child process. argv is fixed by the main process (never by the renderer), stdio only, no shell.
 * Restarts with exponential backoff (1s, 2s, 4s ... max 30s) up to MAX_RESTARTS, then reports 'failed'.
 */
export class LanguageServerManager {
  private proc: ChildProcess | null = null;
  private dec = new FrameDecoder();
  private retries = 0;
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  status: LspStatus = 'off';
  private bin: string; private args: string[]; private cwd: string;
  private onMessage: (m: unknown) => void; private onStatus: (s: LspStatus) => void;
  constructor(bin: string, args: string[], cwd: string, onMessage: (m: unknown) => void, onStatus: (s: LspStatus) => void = () => {}) {
    this.bin = bin; this.args = [...args]; this.cwd = cwd; this.onMessage = onMessage; this.onStatus = onStatus;
  }

  private set(s: LspStatus) { this.status = s; this.onStatus(s); }

  start() {
    this.stopped = false; this.set('starting'); this.dec = new FrameDecoder();
    let p: ChildProcess;
    try { p = spawn(this.bin, this.args, { cwd: this.cwd, stdio: ['pipe', 'pipe', 'ignore'], shell: false, windowsHide: true }); }
    catch { this.crashed(null); return; }
    this.proc = p;
    p.stdout!.on('data', (c: Buffer) => {
      let msgs: unknown[];
      try { msgs = this.dec.push(c); } catch { p.kill(); return; }
      for (const m of msgs) {
        if (this.status !== 'ready') { this.retries = 0; this.set('ready'); }
        try { this.onMessage(m); } catch { /* never let a consumer kill the pump */ }
      }
    });
    p.stdin!.on('error', () => {});
    p.on('error', () => this.crashed(p));
    p.on('exit', () => this.crashed(p));
  }
  private crashed(p: ChildProcess | null) {
    if (p && this.proc !== p) return; // stale process (already replaced or stopped)
    this.proc = null;
    if (this.stopped) return;
    if (this.retries >= MAX_RESTARTS) { this.set('failed'); return; }
    this.set('crashed');
    const delay = Math.min(30_000, 1000 * 2 ** this.retries++);
    this.restartTimer = setTimeout(() => { this.restartTimer = null; if (!this.stopped) this.start(); }, delay);
    (this.restartTimer as { unref?: () => void }).unref?.();
  }
  /** Validates and frames one message. Throws when the message is not allowed or the server is down. */
  send(msg: unknown) {
    const m = validateLspMessage(msg);
    if (!this.proc?.stdin?.writable) throw new Error('lsp: server not running');
    this.proc.stdin.write(encodeFrame(m));
  }
  /** Manual restart (status-bar menu): resets the crash budget. */
  restart() { this.stop(); this.retries = 0; this.start(); }
  /** Asks clangd to exit, then makes sure it does (SIGKILL after 1.5s). Safe to call repeatedly. */
  stop() {
    this.stopped = true;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    const p = this.proc; this.proc = null;
    if (p) {
      try { if (p.stdin?.writable) { p.stdin.write(encodeFrame({ jsonrpc: '2.0', method: 'exit' })); p.stdin.end(); } } catch { /* ignore */ }
      try { p.kill(); } catch { /* ignore */ }
      const t = setTimeout(() => { try { if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); } catch { /* ignore */ } }, 1500);
      (t as { unref?: () => void }).unref?.();
    }
    if (this.status !== 'off') this.set('off');
  }
  get pid() { return this.proc?.pid ?? null; }
}
