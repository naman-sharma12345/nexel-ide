import { describe, it, expect } from 'vitest';
import { LspClient } from './lspClient';
describe('LspClient', () => {
  it('correlates responses and bumps versions', async () => {
    const sent: any[] = [];
    const c = new LspClient({ send: (m) => { sent.push(m); return true; } });
    const p = c.request('textDocument/hover', {});
    c.handleMessage({ id: sent[0].id, result: { ok: 1 } });
    expect(await p).toEqual({ ok: 1 });
    c.open('file:///a.cpp', 'cpp', 'x'); c.change('file:///a.cpp', 'y');
    expect(sent[2].params.textDocument.version).toBe(2);
  });
  it('rejects on error, timeout and not running', async () => {
    const sent: any[] = [];
    const c = new LspClient({ send: (m) => { sent.push(m); return true; } }, 20);
    const p = c.request('x', {}); c.handleMessage({ id: sent[0].id, error: { message: 'bad' } });
    await expect(p).rejects.toThrow('bad');
    await expect(c.request('y', {})).rejects.toThrow('timed out');
    await expect(new LspClient({ send: () => false }).request('z', {})).rejects.toThrow('not running');
  });
  it('dispatches notifications and acks server requests', () => {
    const sent: any[] = []; let got: unknown;
    const c = new LspClient({ send: (m) => { sent.push(m); return true; } });
    c.onNotification('textDocument/publishDiagnostics', (p) => { got = p; });
    c.handleMessage({ id: 9, method: 'textDocument/publishDiagnostics', params: { a: 1 } });
    expect(got).toEqual({ a: 1 }); expect(sent[0].id).toBe(9);
  });
});
