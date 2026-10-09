import { spawn, ChildProcess } from 'node:child_process';
import { encodeFrame, FrameDecoder } from './framing';
import { validateLspMessage } from './lspValidate';

export type LspStatus = 'off' | 'starting' | 'ready' | 'crashed';
/** Owns one clangd child per manager; restarts with exponential backoff (1s,2s,4s... max 30s, 5 tries). */
export class LanguageServerManager {
  private proc: ChildProcess | null = null;
  private dec = new FrameDecoder();
  private retries = 0;
  private stopped = false;
  status: LspStatus = 'off';
  private bin: string; private args: string[]; private cwd: string;
  private onMessage: (m: unknown) => void; private onStatus: (s: LspStatus) => void;
  constructor(bin: string, args: string[], cwd: string, onMessage: (m: unknown) => void, onStatus: (s: LspStatus) => void = () => {}) {
    this.bin = bin; this.args = args; this.cwd = cwd; this.onMessage = onMessage; this.onStatus = onStatus;
  }

  private set(s: LspStatus) { this.status = s; this.onStatus(s); }

  start() {
    this.stopped = false; this.set('starting'); this.dec = new FrameDecoder();
    const p = spawn(this.bin, this.args, { cwd: this.cwd, stdio: ['pipe', 'pipe', 'ignore'], shell: false });
    this.proc = p;
    p.stdout!.on('data', (c: Buffer) => { try { for (const m of this.dec.push(c)) { this.retries = 0; if (this.status !== 'ready') this.set('ready'); this.onMessage(m); } } catch { p.kill(); } });
    p.stdin!.on('error', () => {});
    p.on('error', () => this.crashed());
    p.on('exit', () => { if (!this.stopped) this.crashed(); });
  }
  private crashed() {
    this.proc = null; this.set('crashed');
    if (this.stopped || this.retries >= 5) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.retries++);
    setTimeout(() => { if (!this.stopped) this.start(); }, delay).unref?.();
  }
  send(msg: unknown) {
    const m = validateLspMessage(msg);
    if (!this.proc?.stdin?.writable) throw new Error('lsp: server not running');
    this.proc.stdin.write(encodeFrame(m));
  }
  stop() { this.stopped = true; this.proc?.kill(); this.proc = null; this.set('off'); }
}
