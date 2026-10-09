import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pathToUri, uriToPath, uriKey, clangdLanguageFor, samePath } from './uri';
import { toMonacoCompletion, toMonacoCompletions, toMarkers, toMonacoHover, toLocations, toMonacoSymbols, toMonacoWorkspaceEdit, toLspChanges, markerSeverity, toMonacoSignatureHelp } from './convert';
import { ClangdSession, CHANGE_DEBOUNCE_MS } from './session';
import { useLspStore, isClangdActive } from './state';

// --- a tiny fake of the monaco surface the session touches ---
function fakeMonaco() {
  const markers = new Map<string, any[]>();
  const providers: Record<string, any[]> = {};
  const models = new Map<string, any>();
  const reg = (kind: string) => (lang: string, p: any) => { (providers[kind] ??= []).push({ lang, p }); return { dispose() {} }; };
  const M: any = {
    MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
    Uri: { parse: (s: string) => ({ toString: () => s, scheme: s.split(':')[0] }) },
    editor: {
      setModelMarkers: (m: any, owner: string, ms: any[]) => markers.set(`${owner}|${m.uri.toString()}`, ms),
      getModel: (u: any) => models.get(u.toString()) ?? null,
      createModel: (text: string, _l: string, u: any) => { const m = makeModel(u.toString(), text); models.set(u.toString(), m); return m; },
      registerEditorOpener: () => ({ dispose() {} }),
    },
    languages: {
      CompletionItemKind: { Method: 0, Function: 1, Constructor: 2, Field: 3, Variable: 4, Class: 5, Struct: 6, Interface: 7, Module: 8, Property: 9, Event: 10, Operator: 11, Unit: 12, Value: 13, Constant: 14, Enum: 15, EnumMember: 16, Keyword: 17, Text: 18, Color: 19, File: 20, Reference: 21, Folder: 23, TypeParameter: 24, Snippet: 27 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      CompletionItemTag: { Deprecated: 1 },
      SymbolKind: { File: 0, Module: 1, Namespace: 2, Class: 4, Method: 5, Function: 11, Variable: 12 },
      DocumentHighlightKind: { Text: 0, Read: 1, Write: 2 },
      registerCompletionItemProvider: reg('completion'), registerHoverProvider: reg('hover'), registerSignatureHelpProvider: reg('signature'),
      registerDefinitionProvider: reg('definition'), registerDeclarationProvider: reg('declaration'), registerReferenceProvider: reg('references'),
      registerRenameProvider: reg('rename'), registerDocumentSymbolProvider: reg('symbols'), registerDocumentHighlightProvider: reg('highlight'),
      registerDocumentFormattingEditProvider: reg('format'), registerDocumentRangeFormattingEditProvider: reg('rangeFormat'),
    },
  };
  return { M, markers, providers, models };
}
function makeModel(uri: string, text: string) {
  const listeners: Array<(e: any) => void> = []; const disposeCbs: Array<() => void> = [];
  let value = text; let disposed = false;
  return {
    uri: { toString: () => uri },
    getValue: () => value,
    isDisposed: () => disposed,
    getWordUntilPosition: (p: any) => ({ startColumn: p.column, endColumn: p.column, word: '' }),
    getValueInRange: () => 'v',
    onDidChangeContent: (cb: any) => { listeners.push(cb); return { dispose() {} }; },
    onWillDispose: (cb: any) => { disposeCbs.push(cb); return { dispose() {} }; },
    edit: (e: any, next: string) => { value = next; listeners.forEach(l => l(e)); },
    dispose: () => { disposeCbs.forEach(c => c()); disposed = true; },
  };
}

describe('uri mapping', () => {
  it('posix paths round-trip with percent-encoding', () => {
    expect(pathToUri('/home/naman/cp/a b#1.cpp')).toBe('file:///home/naman/cp/a%20b%231.cpp');
    expect(uriToPath('file:///home/naman/cp/a%20b%231.cpp')).toBe('/home/naman/cp/a b#1.cpp');
  });
  it('windows drive letters (both slash styles) and clangd/Monaco spellings compare equal', () => {
    expect(pathToUri('C:\\Users\\Naman\\CP Contest\\A.cpp')).toBe('file:///C:/Users/Naman/CP%20Contest/A.cpp');
    expect(pathToUri('c:/cp/A.cpp')).toBe('file:///C:/cp/A.cpp');
    expect(uriToPath('file:///c%3A/cp/A.cpp')).toBe('C:\\cp\\A.cpp');
    expect(samePath('file:///C:/CP/a.cpp', 'file:///c%3A/cp/a.cpp')).toBe(true);
    expect(uriKey('C:\\cp\\A.cpp')).toBe(uriKey('file:///c%3A/cp/A.cpp'));
  });
  it('UNC shares and unicode', () => {
    expect(pathToUri('\\\\server\\share\\x.cpp')).toBe('file://server/share/x.cpp');
    expect(uriToPath('file://server/share/x.cpp')).toBe('\\\\server\\share\\x.cpp');
    expect(uriToPath(pathToUri('/tmp/नमन/a.cpp'))).toBe('/tmp/नमन/a.cpp');
  });
  it('language detection', () => {
    expect(clangdLanguageFor('/a/x.cpp')).toBe('cpp'); expect(clangdLanguageFor('C:\\a\\x.C')).toBe('c');
    expect(clangdLanguageFor('/a/x.hpp')).toBe('cpp'); expect(clangdLanguageFor('/a/x.py')).toBeNull(); expect(clangdLanguageFor('/a/Makefile')).toBeNull();
  });
});

describe('LSP -> Monaco conversion', () => {
  const { M } = fakeMonaco();
  const R = { startLineNumber: 5, startColumn: 7, endLineNumber: 5, endColumn: 7 };
  it('completion: label details, snippet, textEdit range, sort/filter, deprecated, docs', () => {
    const c = toMonacoCompletion(M, {
      label: ' push_back', labelDetails: { detail: '(const int &x)' }, detail: 'void', kind: 2, insertTextFormat: 2, sortText: '3f8', filterText: 'push_back',
      textEdit: { range: { start: { line: 4, character: 6 }, end: { line: 4, character: 8 } }, newText: 'push_back(${1:x})' },
      documentation: { kind: 'markdown', value: 'Adds an element' }, deprecated: true,
    }, R);
    expect(c.label).toEqual({ label: 'push_back', detail: '(const int &x)', description: 'void' });
    expect(c.kind).toBe(M.languages.CompletionItemKind.Method);
    expect(c.insertText).toBe('push_back(${1:x})'); expect(c.insertTextRules).toBe(4);
    expect(c.range).toEqual({ startLineNumber: 5, startColumn: 7, endLineNumber: 5, endColumn: 9 });
    expect(c.sortText).toBe('3f8'); expect(c.filterText).toBe('push_back'); expect(c.tags).toEqual([1]);
    expect(c.documentation).toEqual({ value: 'Adds an element' });
  });
  it('completion: insert/replace edits, include-insertion bullet, incomplete lists, plaintext escaping', () => {
    const c = toMonacoCompletion(M, { label: '•vector', textEdit: { insert: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } }, replace: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, newText: 'vector' }, documentation: 'a*b*c' }, R);
    expect(c.label.label).toBe('vector'); expect(c.range.insert.endColumn).toBe(3); expect(c.range.replace.endColumn).toBe(5);
    expect(c.documentation.value).toBe('a\\*b\\*c');
    expect(toMonacoCompletions(M, { isIncomplete: true, items: [{ label: 'x' }] }, R).incomplete).toBe(true);
    expect(toMonacoCompletions(M, null, R).suggestions).toEqual([]);
  });
  it('diagnostics: severity mapping, zero-width widening, codes, related info', () => {
    expect([1, 2, 3, 4].map(s => markerSeverity(M, s))).toEqual([8, 4, 2, 1]);
    const [m] = toMarkers(M, [{ range: { start: { line: 5, character: 16 }, end: { line: 5, character: 16 } }, severity: 1, message: "Use of undeclared identifier 'x'", code: 'undeclared_var_use', source: 'clang',
      relatedInformation: [{ location: { uri: 'file:///a.cpp', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }, message: 'here' }] }], M.Uri.parse);
    expect(m).toMatchObject({ startLineNumber: 6, startColumn: 17, endColumn: 18, severity: 8, code: 'undeclared_var_use', source: 'clang' });
    expect(m.relatedInformation[0]).toMatchObject({ message: 'here', startLineNumber: 1 });
  });
  it('hover, signature help, locations, symbols, workspace edits, incremental changes', () => {
    expect(toMonacoHover({ contents: { kind: 'markdown', value: '### variable `v`\n---\nType: `vector<int>`' } })!.contents[0].value).toContain('vector<int>');
    expect(toMonacoHover({ contents: [{ language: 'cpp', value: 'int x' }] })!.contents[0].value).toBe('```cpp\nint x\n```');
    expect(toMonacoHover(null)).toBeNull();
    const sh = toMonacoSignatureHelp({ signatures: [{ label: 'sort(It a, It b)', parameters: [{ label: [5, 9] }, { label: [11, 15] }] }], activeParameter: 1 })!;
    expect(sh.value.activeParameter).toBe(1); expect(sh.value.signatures[0].parameters[0].label).toEqual([5, 9]);
    expect(toLocations([{ targetUri: 'file:///h.h', targetRange: { start: { line: 1, character: 0 }, end: { line: 9, character: 0 } }, targetSelectionRange: { start: { line: 2, character: 4 }, end: { line: 2, character: 8 } } }])[0])
      .toEqual({ uri: 'file:///h.h', range: { startLineNumber: 3, startColumn: 5, endLineNumber: 3, endColumn: 9 } });
    const sym = toMonacoSymbols(M, [{ name: 'main', kind: 12, range: { start: { line: 2, character: 0 }, end: { line: 8, character: 1 } }, selectionRange: { start: { line: 2, character: 4 }, end: { line: 2, character: 8 } }, children: [] }])[0];
    expect(sym).toMatchObject({ name: 'main', kind: 11, selectionRange: { startLineNumber: 3, startColumn: 5 } });
    const we = toMonacoWorkspaceEdit({ changes: { 'file:///a.cpp': [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: 'w' }] } }, M.Uri.parse);
    expect(we.edits[0].textEdit.text).toBe('w');
    expect(toLspChanges({ changes: [{ range: { startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 5 }, rangeLength: 2, text: 'ab' }] }))
      .toEqual([{ range: { start: { line: 1, character: 2 }, end: { line: 1, character: 4 } }, rangeLength: 2, text: 'ab' }]);
  });
});

// --- session with a scripted fake clangd behind the bridge ---
function fakeBridge(opts: { start?: any } = {}) {
  const sent: any[] = []; let onMsg: (m: any) => void = () => {}; let onStatus: (s: string) => void = () => {};
  const bridge = {
    lspStart: vi.fn(async () => opts.start ?? { ok: true, source: 'bundled', compiler: 'g++', config: 'written' }),
    lspSend: vi.fn(async (m: any) => {
      sent.push(m);
      if (m.method === 'initialize') queueMicrotask(() => onMsg({ jsonrpc: '2.0', id: m.id, result: { capabilities: { textDocumentSync: { change: 2 }, completionProvider: {} }, serverInfo: { name: 'clangd', version: '19.1.2 (x)' } } }));
      if (m.method === 'textDocument/completion') queueMicrotask(() => onMsg({ jsonrpc: '2.0', id: m.id, result: { isIncomplete: false, items: [{ label: 'push_back', kind: 2, sortText: '1' }] } }));
      if (m.method === 'shutdown') queueMicrotask(() => onMsg({ jsonrpc: '2.0', id: m.id, result: null }));
      if (m.method === 'textDocument/hover') queueMicrotask(() => onMsg({ jsonrpc: '2.0', id: m.id, result: { contents: { kind: 'markdown', value: 'Type: `vector<int>`' } } }));
      return true;
    }),
    lspRestart: vi.fn(async () => true), lspStop: vi.fn(async () => true),
    onLspMessage: (cb: any) => { onMsg = cb; }, onLspStatus: (cb: any) => { onStatus = cb; },
  };
  return { bridge, sent, emit: (m: any) => onMsg(m), status: (s: string) => onStatus(s) };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('ClangdSession', () => {
  beforeEach(() => useLspStore.setState({ status: 'off', detail: '', progress: null }));

  it('starts, initializes, opens tracked models, syncs incrementally, maps diagnostics and serves completion/hover', async () => {
    const { M, markers, providers } = fakeMonaco(); const fb = fakeBridge();
    const s = new ClangdSession(fb.bridge);
    s.attachMonaco(M);
    const model = makeModel('file:///ws/A.cpp', 'int main(){ vector<int> v; v. }');
    s.track(model); s.track(makeModel('file:///ws/notes.txt', 'x')); // non-C++ ignored
    await s.configure({ root: '/ws', enabled: true, std: 'c++20', extraFlags: ['-DLOCAL'] });
    expect(fb.bridge.lspStart).toHaveBeenCalledWith('/ws', { std: 'c++20', extraFlags: ['-DLOCAL'] });
    expect(useLspStore.getState().status).toBe('ready');
    expect(isClangdActive()).toBe(true);
    expect(useLspStore.getState().detail).toContain('clangd 19.1.2');
    const opened = fb.sent.filter(m => m.method === 'textDocument/didOpen');
    expect(opened).toHaveLength(1); expect(opened[0].params.textDocument).toMatchObject({ uri: 'file:///ws/A.cpp', languageId: 'cpp', version: 1 });

    vi.useFakeTimers();
    model.edit({ changes: [{ range: { startLineNumber: 1, startColumn: 30, endLineNumber: 1, endColumn: 30 }, rangeLength: 0, text: 'p' }] }, 'x');
    model.edit({ changes: [{ range: { startLineNumber: 1, startColumn: 31, endLineNumber: 1, endColumn: 31 }, rangeLength: 0, text: 'u' }] }, 'x');
    expect(fb.sent.filter(m => m.method === 'textDocument/didChange')).toHaveLength(0); // debounced
    vi.advanceTimersByTime(CHANGE_DEBOUNCE_MS + 5);
    vi.useRealTimers();
    const ch = fb.sent.filter(m => m.method === 'textDocument/didChange');
    expect(ch).toHaveLength(1); expect(ch[0].params.textDocument.version).toBe(2); expect(ch[0].params.contentChanges).toHaveLength(2);
    expect(ch[0].params.contentChanges[0].range.start).toEqual({ line: 0, character: 29 });

    fb.emit({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: 'file:///ws/A.cpp', diagnostics: [{ range: { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } }, severity: 1, message: 'boom' }] } });
    expect(markers.get('clangd|file:///ws/A.cpp')![0]).toMatchObject({ message: 'boom', severity: 8 });

    const comp = providers.completion.find(p => p.lang === 'cpp').p;
    const res = await comp.provideCompletionItems(model, { lineNumber: 1, column: 32 }, { triggerKind: 1, triggerCharacter: '.' }, { isCancellationRequested: false });
    expect(res.suggestions.map((x: any) => x.label.label)).toEqual(['push_back']);
    expect(fb.sent.find(m => m.method === 'textDocument/completion').params.context).toEqual({ triggerKind: 2, triggerCharacter: '.' });
    const hov = await providers.hover.find(p => p.lang === 'cpp').p.provideHover(model, { lineNumber: 1, column: 25 }, { isCancellationRequested: false });
    expect(hov.contents[0].value).toContain('vector<int>');

    s.notifySaved('/ws/A.cpp'); expect(fb.sent.at(-1).method).toBe('textDocument/didSave');
    s.closePath('/ws/A.cpp'); expect(fb.sent.at(-1).method).toBe('textDocument/didClose');
  });

  it('falls back (providers no-op, offline active) when clangd is missing, and toasts once', async () => {
    const { M, providers } = fakeMonaco(); const fb = fakeBridge({ start: { ok: false, reason: 'clangd-not-found' } });
    const toasts: string[] = []; const s = new ClangdSession(fb.bridge, (m) => toasts.push(m));
    s.attachMonaco(M); const model = makeModel('file:///ws/A.cpp', ''); s.track(model);
    await s.configure({ root: '/ws', enabled: true });
    expect(useLspStore.getState().status).toBe('fallback'); expect(isClangdActive()).toBe(false);
    expect(await providers.completion[0].p.provideCompletionItems(model, { lineNumber: 1, column: 1 }, {}, {})).toBeUndefined();
    await s.configure({ root: '/ws2' }); expect(toasts).toHaveLength(1);
  });

  it('recovers from a crash: clears markers, re-initializes on restart, then errors after repeated failure', async () => {
    const { M, markers } = fakeMonaco(); const fb = fakeBridge(); const toasts: string[] = [];
    const s = new ClangdSession(fb.bridge, (m) => toasts.push(m)); s.attachMonaco(M);
    const model = makeModel('file:///ws/A.cpp', 'x'); s.track(model);
    await s.configure({ root: '/ws', enabled: true });
    fb.emit({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: 'file:///ws/A.cpp', diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'e' }] } });
    fb.status('crashed');
    expect(useLspStore.getState().status).toBe('starting'); expect(markers.get('clangd|file:///ws/A.cpp')).toEqual([]);
    fb.status('starting'); await tick(); await tick();
    expect(useLspStore.getState().status).toBe('ready');
    expect(fb.sent.filter(m => m.method === 'initialize')).toHaveLength(2);
    expect(fb.sent.filter(m => m.method === 'textDocument/didOpen')).toHaveLength(2); // re-opened after restart
    fb.status('failed');
    expect(useLspStore.getState().status).toBe('error'); expect(toasts.at(-1)).toMatch(/crashed repeatedly/);
  });

  it('indexing state from clangd.fileStatus and $/progress', async () => {
    const { M } = fakeMonaco(); const fb = fakeBridge(); const s = new ClangdSession(fb.bridge); s.attachMonaco(M);
    await s.configure({ root: '/ws', enabled: true });
    fb.emit({ jsonrpc: '2.0', method: 'textDocument/clangd.fileStatus', params: { uri: 'file:///ws/A.cpp', state: 'parsing includes' } });
    expect(useLspStore.getState().status).toBe('indexing');
    fb.emit({ jsonrpc: '2.0', method: 'textDocument/clangd.fileStatus', params: { uri: 'file:///ws/A.cpp', state: 'idle' } });
    expect(useLspStore.getState().status).toBe('ready');
    fb.emit({ jsonrpc: '2.0', method: '$/progress', params: { token: 'backgroundIndexProgress', value: { kind: 'begin', title: 'indexing', percentage: 10 } } });
    expect(useLspStore.getState()).toMatchObject({ status: 'indexing', progress: 10 });
    fb.emit({ jsonrpc: '2.0', method: '$/progress', params: { token: 'backgroundIndexProgress', value: { kind: 'end' } } });
    expect(useLspStore.getState()).toMatchObject({ status: 'ready', progress: null });
  });

  it('disabled in settings stops clangd and shows disabled; no bridge means desktop-only fallback', async () => {
    const fb = fakeBridge(); const s = new ClangdSession(fb.bridge); s.attachMonaco(fakeMonaco().M);
    await s.configure({ root: '/ws', enabled: true }); await s.configure({ enabled: false });
    expect(fb.bridge.lspStop).toHaveBeenCalled(); expect(useLspStore.getState().status).toBe('disabled');
    const s2 = new ClangdSession({}); await s2.configure({ root: '/ws', enabled: true });
    expect(useLspStore.getState().status).toBe('fallback');
  });
});
