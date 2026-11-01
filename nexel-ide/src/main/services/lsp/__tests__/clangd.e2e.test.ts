// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
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

// ---------------------------------------------------------------------------------------------------------------
// Same real clangd, but driven through the renderer's ClangdSession + Monaco providers (fake Monaco surface).
// This is the exact code path the editor uses: providers -> session -> bridge -> LanguageServerManager -> clangd.
import { ClangdSession } from '../../../../lib/clangd/session';
import { pathToUri } from '../../../../lib/clangd/uri';
import { useLspStore } from '../../../../lib/clangd/state';

function miniMonaco() {
  const markers = new Map<string, any[]>(); const providers: Record<string, any> = {};
  const reg = (k: string) => (lang: string, p: any) => { if (lang === 'cpp') providers[k] = p; return { dispose() {} }; };
  const M: any = {
    MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
    Uri: { parse: (s: string) => ({ toString: () => s, scheme: s.split(':')[0] }) },
    editor: { setModelMarkers: (m: any, _o: string, ms: any[]) => markers.set(m.uri.toString(), ms), getModel: () => ({}), createModel: () => ({}) },
    languages: new Proxy({
      CompletionItemKind: { Method: 0, Function: 1, Field: 3, Variable: 4, Class: 5, Keyword: 17, Text: 18, Snippet: 27 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 }, CompletionItemTag: { Deprecated: 1 },
      SymbolKind: { Function: 11, Variable: 12, Class: 4 }, DocumentHighlightKind: { Text: 0, Read: 1, Write: 2 },
    } as any, { get: (t, k: string) => k in t ? t[k] : k.startsWith('register') ? reg(k.replace(/^register|Provider$/g, '')) : undefined }),
  };
  return { M, markers, providers };
}
function liveModel(uri: string, text: string) {
  const subs: Array<(e: any) => void> = []; let value = text;
  const lines = () => value.split('\n');
  return {
    uri: { toString: () => uri }, getValue: () => value, isDisposed: () => false,
    getWordUntilPosition: (p: any) => { const l = lines()[p.lineNumber - 1].slice(0, p.column - 1); const m = /\w*$/.exec(l)!; return { word: m[0], startColumn: p.column - m[0].length, endColumn: p.column }; },
    getValueInRange: (r: any) => lines()[r.startLineNumber - 1].slice(r.startColumn - 1, r.endColumn - 1),
    onDidChangeContent: (cb: any) => { subs.push(cb); return { dispose() {} }; }, onWillDispose: () => ({ dispose() {} }),
    /** apply one single-line replacement and fire a Monaco-shaped content event */
    replace(line: number, startCol: number, endCol: number, text: string) {
      const ls = lines(); const l = ls[line - 1]; ls[line - 1] = l.slice(0, startCol - 1) + text + l.slice(endCol - 1); value = ls.join('\n');
      subs.forEach(s => s({ changes: [{ range: { startLineNumber: line, startColumn: startCol, endLineNumber: line, endColumn: endCol }, rangeLength: endCol - startCol, text }] }));
    },
  };
}

describe.skipIf(!target)('clangd through ClangdSession + Monaco providers (real binary)', () => {
  let dir = ''; let mgr: LanguageServerManager | null = null; let session: ClangdSession;
  const { M, markers, providers } = miniMonaco();
  let model: ReturnType<typeof liveModel>; let uri = '';
  const tok = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexel-e2e-session-'));
    const file = path.join(dir, 'B.cpp'); fs.writeFileSync(file, CODE);
    uri = pathToUri(file);
    const compiler = findCompiler({ platform: process.platform, pathEnv: process.env.PATH });
    let onMsg: (m: unknown) => void = () => {}; let onStatus: (s: string) => void = () => {};
    session = new ClangdSession({
      lspStart: async (root: string, opts: any) => {
        ensureWorkspaceConfig(root, { std: opts.std, extraFlags: opts.extraFlags ?? [], includeDir: SHIM, compiler });
        mgr = new LanguageServerManager(target!.bin, [...target!.pre, ...clangdArgs({ queryDriver: compiler })], root, (m) => onMsg(m), (s) => onStatus(s));
        mgr.start(); return { ok: true, source: 'dev', compiler: 'g++', config: 'written' };
      },
      lspSend: async (m) => { try { mgr!.send(m); return true; } catch { return false; } },
      lspStop: async () => { mgr?.stop(); return true; },
      onLspMessage: (cb) => { onMsg = cb; }, onLspStatus: (cb) => { onStatus = cb; },
    });
    session.attachMonaco(M);
    model = liveModel(uri, CODE);
    session.track(model);
    await session.configure({ root: dir, enabled: true, std: 'c++17', extraFlags: ['-Wshadow'] });
    const t0 = Date.now();
    while (!(markers.get(uri) ?? []).length && Date.now() - t0 < 150_000) await new Promise(r => setTimeout(r, 200));
  }, 200_000);
  afterAll(async () => { await session?.stop(); session?.dispose(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('status is ready with the server version', () => {
    expect(['ready', 'indexing']).toContain(useLspStore.getState().status);
    expect(useLspStore.getState().version).toBe('19.1.2');
  });

  it('publishDiagnostics became Monaco error markers (1-based, severity 8)', () => {
    const m = (markers.get(uri) ?? []).find(x => /undeclaredThing/.test(x.message));
    expect(m).toMatchObject({ severity: 8, startLineNumber: 6 });
  });

  it('completion provider after `v.` returns push_back as a method with a snippet edit', async () => {
    const res = await providers.CompletionItem.provideCompletionItems(model, { lineNumber: 5, column: 7 }, { triggerKind: 1, triggerCharacter: '.' }, tok);
    const pb = res.suggestions.find((s: any) => s.label.label === 'push_back');
    expect(pb).toBeTruthy(); expect(pb.kind).toBe(M.languages.CompletionItemKind.Method);
    expect(pb.range.startLineNumber ?? pb.range.insert.startLineNumber).toBe(5);
  }, 120_000);

  it('hover provider on `v` shows vector<int>', async () => {
    const h = await providers.Hover.provideHover(model, { lineNumber: 4, column: 17 }, tok);
    expect(h.contents.map((c: any) => c.value).join('\n')).toMatch(/vector<int>/);
  }, 120_000);

  it('definition, references and rename work on `v`', async () => {
    const defs = await providers.Definition.provideDefinition(model, { lineNumber: 7, column: 10 }, tok);
    expect(defs[0].range.startLineNumber).toBe(4);
    const refs = await providers.Reference.provideReferences(model, { lineNumber: 4, column: 17 }, { includeDeclaration: true }, tok);
    expect(refs.length).toBeGreaterThanOrEqual(3);
    const loc = await providers.Rename.resolveRenameLocation(model, { lineNumber: 4, column: 17 }, tok);
    expect(loc.text).toBe('v');
    const edits = await providers.Rename.provideRenameEdits(model, { lineNumber: 4, column: 17 }, 'arr', tok);
    expect(edits.edits.length).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('document symbols, highlights and formatting answer', async () => {
    const syms = await providers.DocumentSymbol.provideDocumentSymbols(model, tok);
    expect(syms.map((s: any) => s.name)).toContain('main');
    const hl = await providers.DocumentHighlight.provideDocumentHighlights(model, { lineNumber: 4, column: 17 }, tok);
    expect(hl.length).toBeGreaterThanOrEqual(2);
    const fmt = await providers.DocumentFormattingEdit.provideDocumentFormattingEdits(model, { tabSize: 4, insertSpaces: true }, tok);
    expect(Array.isArray(fmt)).toBe(true);
  }, 120_000);

  it('a debounced incremental edit clears the error marker', async () => {
    // line 6: "    int total = undeclaredThing + 1;" -> replace undeclaredThing (cols 17..32) with 41
    model.replace(6, 17, 32, '41');
    const t0 = Date.now();
    while ((markers.get(uri) ?? []).some(x => /undeclared/.test(x.message)) && Date.now() - t0 < 90_000) await new Promise(r => setTimeout(r, 200));
    expect((markers.get(uri) ?? []).some(x => /undeclared/.test(x.message))).toBe(false);
  }, 120_000);
});
