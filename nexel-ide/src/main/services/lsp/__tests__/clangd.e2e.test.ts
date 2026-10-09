// @vitest-environment node
/**
 * Real end-to-end check: the pinned clangd (scripts/fetch-clangd.mjs) spawned through LanguageServerManager,
 * driven by the renderer LspClient, against a CP-style file using the bundled bits/stdc++.h shim.
 * Skipped when no clangd binary is available (run `npm run fetch:clangd` first).
 * On an arm64 Linux host the x64 release runs through qemu-x86_64 when it is installed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LanguageServerManager } from '../LanguageServerManager';
import { resolveClangd, clangdArgs, findCompiler, findOnPath } from '../resolveClangd';
import { ensureWorkspaceConfig } from '../workspaceConfig';
import { LspClient } from '../../../../lib/lspClient';

const APP = path.resolve(__dirname, '../../../../..');
const SHIM = path.join(APP, 'resources', 'nexel-include');

function pickBinary(): { bin: string; pre: string[] } | null {
  const found = resolveClangd({ platform: process.platform, arch: process.arch, appRoot: APP, pathEnv: process.env.PATH });
  if (found) return { bin: found.path, pre: [] };
  // arm64 Linux sandbox: run the official x64 build under user-mode emulation.
  const x64 = path.join(APP, 'resources', 'clangd', 'linux-x64', 'bin', 'clangd');
  const qemu = findOnPath('qemu-x86_64', { platform: process.platform, pathEnv: process.env.PATH });
  if (process.platform === 'linux' && process.arch !== 'x64' && fs.existsSync(x64) && qemu) return { bin: qemu, pre: ['-L', '/', x64] };
  return null;
}
const target = pickBinary();
const CODE = [
  '#include <bits/stdc++.h>',
  'using namespace std;',
  'int main() {',
  '    vector<int> v;',
  '    v.size();',
  '    int total = undeclaredThing + 1;',
  '    sort(v.begin(), v.end());',
  '    return total;',
  '}',
  '',
].join('\n');

describe.skipIf(!target)('clangd end-to-end (real binary)', () => {
  let dir = ''; let uri = ''; let mgr: LanguageServerManager; let client: LspClient;
  const diags: Array<{ version?: number; diagnostics: Array<{ message: string; severity: number; range: any }> }> = [];
  const statuses: string[] = [];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexel-e2e-'));
    const file = path.join(dir, 'A.cpp'); fs.writeFileSync(file, CODE);
    uri = pathToFileURL(file).href;
    const compiler = findCompiler({ platform: process.platform, pathEnv: process.env.PATH });
    const cfg = ensureWorkspaceConfig(dir, { std: 'c++17', extraFlags: [], includeDir: SHIM, compiler });
    expect(cfg.action).toBe('written');
    mgr = new LanguageServerManager(target!.bin, [...target!.pre, ...clangdArgs({ queryDriver: compiler })], dir,
      (m) => client.handleMessage(m), (s) => statuses.push(s));
    client = new LspClient({ send: (m) => { try { mgr.send(m); return true; } catch { return false; } } }, 120_000);
    client.onNotification('textDocument/publishDiagnostics', (p: any) => { if (p.uri === uri) diags.push(p); });
    mgr.start();
    const init: any = await client.request('initialize', {
      processId: process.pid, rootUri: pathToFileURL(dir).href, workspaceFolders: [{ uri: pathToFileURL(dir).href, name: 'e2e' }],
      capabilities: { textDocument: { completion: { completionItem: { snippetSupport: true, labelDetailsSupport: true } }, hover: { contentFormat: ['markdown'] },
        publishDiagnostics: { relatedInformation: true }, synchronization: { didSave: true } } },
      initializationOptions: { clangdFileStatus: true },
    });
    expect(init.capabilities.completionProvider).toBeTruthy();
    expect(init.capabilities.textDocumentSync.change ?? init.capabilities.textDocumentSync).toBe(2); // incremental
    client.notify('initialized', {});
    client.open(uri, 'cpp', CODE);
    const t0 = Date.now();
    while (!diags.length && Date.now() - t0 < 150_000) await new Promise(r => setTimeout(r, 200));
  }, 200_000);

  afterAll(() => { mgr?.stop(); client?.dispose(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('reports ready and resolves the bits/stdc++.h shim (no missing-header error)', () => {
    expect(statuses).toContain('ready');
    const all = diags.at(-1)!.diagnostics.map(d => d.message);
    expect(all.some(m => /file not found/i.test(m))).toBe(false);
  });

  it('hover on the #include resolves to the shipped nexel-include shim', async () => {
    const h: any = await client.request('textDocument/hover', { textDocument: { uri }, position: { line: 0, character: 14 } });
    const text = typeof h.contents === 'string' ? h.contents : h.contents.value;
    expect(text).toMatch(/nexel-include[\\/]bits[\\/]stdc\+\+\.h/);
  }, 120_000);

  it('flags an undeclared identifier as an error on the right line', () => {
    const d = diags.at(-1)!.diagnostics.find(x => /undeclared identifier 'undeclaredThing'/i.test(x.message));
    expect(d, JSON.stringify(diags.at(-1))).toBeTruthy();
    expect(d!.severity).toBe(1);
    expect(d!.range.start.line).toBe(5);
  });

  it('completes members after `v.` with push_back (member completion)', async () => {
    const res: any = await client.request('textDocument/completion', { textDocument: { uri }, position: { line: 4, character: 6 }, context: { triggerKind: 2, triggerCharacter: '.' } });
    const items = Array.isArray(res) ? res : res.items;
    const labels = items.map((i: any) => (i.filterText || i.label).trim());
    expect(labels).toContain('push_back');
    const pb = items.find((i: any) => (i.filterText || i.label).trim() === 'push_back');
    expect(pb.textEdit || pb.insertText).toBeTruthy();
  }, 120_000);

  it('hover on `v` returns its type', async () => {
    const h: any = await client.request('textDocument/hover', { textDocument: { uri }, position: { line: 3, character: 16 } });
    const text = typeof h.contents === 'string' ? h.contents : h.contents.value;
    expect(text).toMatch(/vector<int>/);
  }, 120_000);

  it('signature help inside sort( lists parameters', async () => {
    const s: any = await client.request('textDocument/signatureHelp', { textDocument: { uri }, position: { line: 6, character: 9 } });
    expect(s.signatures.length).toBeGreaterThan(0);
    expect(s.signatures[0].label).toMatch(/sort/);
  }, 120_000);

  it('incremental didChange fixes the error and diagnostics clear', async () => {
    const before = diags.length;
    // replace "undeclaredThing" (line 5, chars 16..31) with "41"
    client.change(uri, [{ range: { start: { line: 5, character: 16 }, end: { line: 5, character: 31 } }, text: '41' }]);
    const t0 = Date.now();
    while (diags.length === before && Date.now() - t0 < 90_000) await new Promise(r => setTimeout(r, 200));
    const last = diags.at(-1)!;
    expect(last.diagnostics.some(d => /undeclared/.test(d.message))).toBe(false);
  }, 120_000);

  it('document symbols include main', async () => {
    const syms: any = await client.request('textDocument/documentSymbol', { textDocument: { uri } });
    expect(syms.map((s: any) => s.name)).toContain('main');
  }, 120_000);
});
