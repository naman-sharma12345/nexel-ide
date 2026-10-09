import { describe, it, expect } from 'vitest';
import { encodeFrame, FrameDecoder, MAX_FRAME_BYTES } from '../framing';
import { resolveClangd, platformKey, compileFlags } from '../resolveClangd';
import { validateLspMessage } from '../lspValidate';

describe('framing', () => {
  it('round-trips and handles split chunks and multibyte', () => {
    const a = encodeFrame({ jsonrpc: '2.0', id: 1, method: 'x', params: { t: 'héllo✓' } });
    const b = encodeFrame({ jsonrpc: '2.0', method: 'y' });
    const all = Buffer.concat([a, b]); const d = new FrameDecoder();
    const out = [...d.push(all.subarray(0, 7)), ...d.push(all.subarray(7, 40)), ...d.push(all.subarray(40))];
    expect(out).toHaveLength(2); expect((out[0] as any).params.t).toBe('héllo✓');
  });
  it('rejects oversized frames and skips bad json', () => {
    expect(() => new FrameDecoder().push(Buffer.from(`Content-Length: ${MAX_FRAME_BYTES + 1}\r\n\r\n`))).toThrow();
    expect(new FrameDecoder().push(Buffer.from('Content-Length: 3\r\n\r\n{x}'))).toEqual([]);
  });
});
describe('resolveClangd', () => {
  const base = { platform: 'linux', arch: 'x64', appRoot: '/app', resourcesPath: '/res', pathEnv: '/usr/bin:/opt' };
  it('platform keys', () => { expect(platformKey('win32', 'x64')).toBe('win-x64'); expect(platformKey('darwin', 'arm64')).toBe('mac-arm64'); });
  it('prefers bundled, then dev, then PATH, else null', () => {
    expect(resolveClangd({ ...base, exists: p => p === '/res/clangd/linux-x64/bin/clangd' })?.source).toBe('bundled');
    expect(resolveClangd({ ...base, exists: p => p === '/app/resources/clangd/linux-x64/bin/clangd' })?.source).toBe('dev');
    expect(resolveClangd({ ...base, exists: p => p === '/opt/clangd' })?.source).toBe('path');
    expect(resolveClangd({ ...base, exists: () => false })).toBeNull();
  });
  it('uses .exe on windows and honours absolute override', () => {
    expect(resolveClangd({ ...base, platform: 'win32', pathEnv: 'C:\\bin', exists: p => p.endsWith('clangd.exe') })?.path).toMatch(/clangd\.exe$/);
    expect(resolveClangd({ ...base, exists: () => true }, '/custom/clangd')?.source).toBe('override');
    expect(resolveClangd({ ...base, exists: () => false }, 'relative/clangd')).toBeNull();
  });
  it('compile flags', () => { expect(compileFlags('c++20', '/inc')).toBe('-xc++\n-std=c++20\n-Wall\n-I/inc\n'); });
});
describe('validateLspMessage', () => {
  it('allows textDocument/* and rejects others', () => {
    expect(validateLspMessage({ jsonrpc: '2.0', id: 1, method: 'textDocument/completion', params: {} })).toBeTruthy();
    expect(() => validateLspMessage({ jsonrpc: '2.0', method: 'workspace/executeCommand' })).toThrow();
    expect(() => validateLspMessage({ jsonrpc: '1.0', method: 'initialize' })).toThrow();
    expect(() => validateLspMessage('x')).toThrow();
    expect(validateLspMessage({ jsonrpc: '2.0', id: 3, result: null })).toBeTruthy();
  });
});
