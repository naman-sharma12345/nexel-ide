// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { LanguageServerManager, MAX_RESTARTS, type LspStatus } from '../LanguageServerManager';

// A fake language server: answers every framed request with {result: method} and exits on "exit".
const ECHO = `
let buf = Buffer.alloc(0);
process.stdin.on('data', c => { buf = Buffer.concat([buf, c]);
  for (;;) { const h = buf.indexOf('\\r\\n\\r\\n'); if (h < 0) break; const n = +/Content-Length: (\\d+)/.exec(buf.subarray(0, h))[1];
    if (buf.length < h + 4 + n) break; const m = JSON.parse(buf.subarray(h + 4, h + 4 + n)); buf = buf.subarray(h + 4 + n);
    if (m.method === 'exit') process.exit(0);
    if (m.id !== undefined) { const b = JSON.stringify({ jsonrpc: '2.0', id: m.id, result: m.method }); process.stdout.write('Content-Length: ' + Buffer.byteLength(b) + '\\r\\n\\r\\n' + b); } } });
setInterval(() => {}, 1000);`;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 5000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await wait(10); return f(); };

describe('LanguageServerManager', () => {
  it('spawns with fixed argv, round-trips framed JSON-RPC, rejects disallowed methods, and stops the process', async () => {
    const got: any[] = []; const st: LspStatus[] = [];
    const m = new LanguageServerManager(process.execPath, ['-e', ECHO], process.cwd(), (x) => got.push(x), (s) => st.push(s));
    m.start();
    m.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(await until(() => got.length === 1)).toBe(true);
    expect(got[0]).toEqual({ jsonrpc: '2.0', id: 1, result: 'initialize' });
    expect(st).toEqual(['starting', 'ready']);
    expect(() => m.send({ jsonrpc: '2.0', id: 2, method: 'workspace/executeCommand' })).toThrow(/not allowed/);
    const pid = m.pid!; m.stop();
    expect(st.at(-1)).toBe('off');
    expect(await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } })).toBe(true);
    expect(() => m.send({ jsonrpc: '2.0', id: 3, method: 'initialize' })).toThrow(/not running/);
  });

  it('restarts a crashing server with backoff, then gives up with "failed"', async () => {
    const st: LspStatus[] = [];
    const m = new LanguageServerManager(process.execPath, ['-e', 'process.exit(3)'], process.cwd(), () => {}, (s) => st.push(s), { baseDelayMs: 5 });
    m.start();
    expect(await until(() => st.at(-1) === 'failed', 8000)).toBe(true);
    expect(st.filter(s => s === 'crashed')).toHaveLength(MAX_RESTARTS);
    expect(st.filter(s => s === 'starting')).toHaveLength(MAX_RESTARTS + 1);
    m.stop();
  });

  it('a missing binary reports crashed/failed instead of throwing', async () => {
    const st: LspStatus[] = [];
    const m = new LanguageServerManager('/nonexistent/clangd', [], process.cwd(), () => {}, (s) => st.push(s), { baseDelayMs: 1 });
    expect(() => m.start()).not.toThrow();
    expect(await until(() => st.at(-1) === 'failed', 5000)).toBe(true);
  });
});
