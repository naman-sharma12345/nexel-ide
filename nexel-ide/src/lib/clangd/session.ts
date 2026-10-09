// Renderer half of clangd IntelliSense: lifecycle (start / handshake / crash recovery / fallback), document sync
// (didOpen, debounced incremental didChange, didSave, didClose), diagnostics -> Monaco markers, and Monaco providers.
// Offline providers (dataset, snippets, CP templates, STL hover docs) stay registered; they step back while clangd is
// active and take over automatically whenever it is not (see isClangdActive()).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { LspClient, LspCancelled, type CancelToken } from '../lspClient';
import { pathToUri, uriToPath, uriKey, clangdLanguageFor } from './uri';
import {
  toLspPosition, toLspChanges, toMonacoCompletions, toMonacoHover, toMonacoSignatureHelp, toLocations, toMonacoSymbols,
  toMonacoHighlights, toMonacoTextEdits, toMonacoWorkspaceEdit, toMarkers, toMonacoRange, markdown,
} from './convert';
import { useLspStore, type ClangdUiStatus } from './state';

export interface ClangdBridge {
  lspStart?: (root: string, opts?: { std?: string; extraFlags?: string[] }) => Promise<{ ok: boolean; reason?: string; source?: string; compiler?: string | null; config?: string }>;
  lspSend?: (msg: unknown) => Promise<boolean>;
  lspRestart?: () => Promise<boolean>;
  lspStop?: () => Promise<boolean>;
  onLspMessage?: (cb: (msg: unknown) => void) => void;
  onLspStatus?: (cb: (status: string) => void) => void;
}
export interface ClangdConfig { root: string | null; enabled: boolean; std: string; extraFlags: string[] }
type Notify = (message: string, kind: 'info' | 'error' | 'success', ttlMs?: number) => void;

interface TrackedDoc { model: any; uri: string; lang: 'cpp' | 'c'; queue: any[]; timer: ReturnType<typeof setTimeout> | null; full: boolean; subs: Array<{ dispose(): void }> }

export const MARKER_OWNER = 'clangd';
export const CHANGE_DEBOUNCE_MS = 150;
const MAX_QUEUED_CHANGES = 400; // beyond this a full-text sync is cheaper
const TRIGGERS = ['.', '<', '>', ':', '"', '/', '*'];

export class ClangdSession {
  readonly client: LspClient;
  private bridge: ClangdBridge;
  private notifyUser: Notify;
  private monaco: any = null;
  private caps: any = null;
  private initialized = false;
  private handshaking: Promise<void> | null = null;
  private awaitingRestart = false;
  private docs = new Map<string, TrackedDoc>();
  private pendingDiags = new Map<string, any[]>();
  private busy = new Set<string>();
  private bgIndexing = false;
  private disposables: Array<{ dispose(): void }> = [];
  private config: ClangdConfig = { root: null, enabled: true, std: 'c++17', extraFlags: [] };
  private running = false;
  private toastedFallback = false;
  private serverInfo = '';
  private startMeta = '';

  constructor(bridge: ClangdBridge, notify: Notify = () => {}) {
    this.bridge = bridge; this.notifyUser = notify;
    this.client = new LspClient({ send: (m) => (this.bridge.lspSend ? this.bridge.lspSend(m) : false) }, 10_000);
    this.client.onNotification('textDocument/publishDiagnostics', (p) => this.onDiagnostics(p as any));
    this.client.onNotification('textDocument/clangd.fileStatus', (p: any) => {
      if (!p?.uri) return;
      const k = uriKey(p.uri);
      if (p.state && p.state !== 'idle') this.busy.add(k); else this.busy.delete(k);
      this.refreshReady(p.state && p.state !== 'idle' ? String(p.state) : undefined);
    });
    this.client.onNotification('$/progress', (p: any) => {
      const v = p?.value; if (!v) return;
      if (v.kind === 'begin') this.bgIndexing = true;
      if (v.kind === 'end') { this.bgIndexing = false; useLspStore.getState().patch({ progress: null }); }
      if (typeof v.percentage === 'number') useLspStore.getState().patch({ progress: v.percentage });
      this.refreshReady(v.message);
    });
    bridge.onLspMessage?.((m) => this.client.handleMessage(m));
    bridge.onLspStatus?.((s) => this.onMainStatus(s));
  }

  get available() { return !!this.bridge.lspStart; }
  get ready() { return this.initialized; }
  capabilities() { return this.caps; }

  // ---------- lifecycle ----------
  /** Applies settings / workspace root; starts, restarts or stops clangd as needed. */
  async configure(next: Partial<ClangdConfig>) {
    const prev = this.config;
    this.config = { ...prev, ...next, extraFlags: next.extraFlags ?? prev.extraFlags };
    const changed = prev.root !== this.config.root || prev.enabled !== this.config.enabled || prev.std !== this.config.std
      || prev.extraFlags.join(' ') !== this.config.extraFlags.join(' ');
    if (!changed && (this.running || !this.config.enabled || !this.config.root)) return;
    if (!this.config.enabled) { await this.stop(); this.setStatus('disabled', 'Turned off in Settings'); return; }
    if (!this.config.root) { await this.stop(); this.setStatus('off', 'Open a folder to start clangd'); return; }
    await this.start();
  }

  private async start() {
    if (!this.bridge.lspStart) { this.setStatus('fallback', 'Desktop app only. Built-in IntelliSense is active.'); return; }
    this.teardownServerState();
    this.setStatus('starting', 'Starting clangd…');
    let res: Awaited<ReturnType<NonNullable<ClangdBridge['lspStart']>>>;
    try { res = await this.bridge.lspStart(this.config.root!, { std: this.config.std, extraFlags: this.config.extraFlags }); }
    catch { res = { ok: false, reason: 'ipc-error' }; }
    if (!res?.ok) {
      this.running = false;
      if (res?.reason === 'clangd-not-found') {
        this.setStatus('fallback', 'clangd not found. Built-in IntelliSense is active.');
        if (!this.toastedFallback) { this.toastedFallback = true; this.notifyUser('clangd not found, using built-in C++ IntelliSense. Run "npm run fetch:clangd" or install clangd.', 'info', 6500); }
      } else if (res?.reason === 'invalid-root') this.setStatus('off', 'This folder cannot be used as a clangd workspace');
      else this.setStatus('error', `clangd could not start (${res?.reason ?? 'unknown'})`);
      return;
    }
    this.running = true;
    this.startMeta = [res.source, res.compiler, res.config === 'kept-user' ? 'project config' : res.config ? '.clangd' : ''].filter(Boolean).join(' · ');
    useLspStore.getState().patch({ source: res.source ?? null });
    await this.handshake();
  }

  /** initialize -> initialized -> didOpen every tracked editor model. */
  private handshake(): Promise<void> {
    if (this.handshaking) return this.handshaking;
    this.handshaking = (async () => {
      try {
        const root = this.config.root!;
        const rootUri = pathToUri(root);
        const init: any = await this.client.request('initialize', {
          processId: null,
          clientInfo: { name: 'Nexel IDE' },
          rootUri, rootPath: root,
          workspaceFolders: [{ uri: rootUri, name: root.split(/[\\/]/).filter(Boolean).pop() ?? 'workspace' }],
          capabilities: CLIENT_CAPABILITIES,
          initializationOptions: { clangdFileStatus: true },
        }, undefined, 60_000);
        this.caps = init?.capabilities ?? {};
        // serverInfo.version is e.g. "clangd version 19.1.2 (https://github.com/llvm/llvm-project ...)"
        const ver = /\d+\.\d+(?:\.\d+)?/.exec(String(init?.serverInfo?.version ?? ''))?.[0] ?? null;
        this.serverInfo = ver ? `clangd ${ver}` : 'clangd';
        useLspStore.getState().patch({ version: ver });
        this.client.notify('initialized', {});
        this.initialized = true;
        for (const d of this.docs.values()) this.openDoc(d);
        this.refreshReady();
      } catch (e) {
        if (e instanceof LspCancelled) return;
        this.initialized = false;
        this.setStatus('error', `clangd did not initialize: ${(e as Error).message}`);
        this.notifyUser('clangd did not respond. Built-in IntelliSense is active; click the clangd chip to restart.', 'error', 6500);
      } finally { this.handshaking = null; }
    })();
    return this.handshaking;
  }

  private onMainStatus(s: string) {
    if (!this.running) return;
    if (s === 'crashed') {
      this.teardownServerState(); this.awaitingRestart = true;
      this.setStatus('starting', 'clangd stopped unexpectedly. Restarting…');
    } else if (s === 'starting' && this.awaitingRestart) {
      this.awaitingRestart = false; this.setStatus('starting', 'Restarting clangd…');
      void this.handshake();
    } else if (s === 'failed') {
      this.teardownServerState(); this.running = false;
      this.setStatus('error', 'clangd crashed repeatedly. Built-in IntelliSense is active.');
      this.notifyUser('clangd crashed repeatedly, so C++ uses built-in IntelliSense. Click the clangd chip to restart it.', 'error', 7000);
    }
  }

  /** Status-bar "Restart clangd". */
  async restart() {
    if (!this.config.enabled || !this.config.root) return this.configure({});
    if (this.running && this.bridge.lspRestart) {
      this.teardownServerState(); this.awaitingRestart = true;
      this.setStatus('starting', 'Restarting clangd…');
      const ok = await this.bridge.lspRestart().catch(() => false);
      if (ok) return;
      this.awaitingRestart = false;
    }
    await this.start();
  }

  async stop() {
    const wasRunning = this.running;
    this.running = false; this.awaitingRestart = false;
    if (wasRunning && this.initialized) { try { await this.client.request('shutdown', null, undefined, 1500); } catch { /* ignore */ } this.client.notify('exit', null); }
    this.teardownServerState();
    if (wasRunning) await this.bridge.lspStop?.().catch(() => false);
  }

  /** Forget server-side state (documents, markers, in-flight requests) but keep the tracked models. */
  private teardownServerState() {
    this.initialized = false; this.caps = null; this.busy.clear(); this.bgIndexing = false;
    this.client.reset('clangd restarted');
    for (const d of this.docs.values()) { if (d.timer) clearTimeout(d.timer); d.timer = null; d.queue = []; d.full = false; this.clearMarkers(d.model); }
    this.pendingDiags.clear();
  }

  private setStatus(s: ClangdUiStatus, detail?: string) { useLspStore.getState().setStatus(s, detail); }
  private refreshReady(note?: string) {
    if (!this.initialized) return;
    const meta = [this.serverInfo, this.startMeta].filter(Boolean).join(' · ');
    if (this.busy.size || this.bgIndexing) this.setStatus('indexing', note ? `${note}…` : `Indexing · ${meta}`);
    else this.setStatus('ready', meta);
  }

  // ---------- documents ----------
  /** Start syncing a model shown in an editor (idempotent). Non-C/C++ and non-file models are ignored. */
  track(model: any) {
    if (!model || !this.monaco || model.isDisposed?.()) return;
    const raw = model.uri?.toString?.() ?? '';
    if (!/^file:/i.test(raw)) return;
    const path = uriToPath(raw);
    const lang = clangdLanguageFor(path);
    if (!lang) return;
    const key = uriKey(raw);
    if (this.docs.has(key)) return;
    const doc: TrackedDoc = { model, uri: pathToUri(path), lang, queue: [], timer: null, full: false, subs: [] };
    doc.subs.push(model.onDidChangeContent((e: any) => this.onModelChange(doc, e)));
    doc.subs.push(model.onWillDispose(() => this.untrack(key)));
    this.docs.set(key, doc);
    if (this.initialized) this.openDoc(doc);
  }

  private openDoc(d: TrackedDoc) {
    this.client.open(d.uri, d.lang, d.model.getValue());
    const pend = this.pendingDiags.get(uriKey(d.uri));
    if (pend) { this.pendingDiags.delete(uriKey(d.uri)); this.applyMarkers(d.model, pend); }
  }

  private onModelChange(d: TrackedDoc, e: any) {
    if (!this.initialized || !this.client.isOpen(d.uri)) return;
    if (e.isFlush || d.full) d.full = true; else d.queue.push(...toLspChanges(e));
    if (d.queue.length > MAX_QUEUED_CHANGES) d.full = true;
    if (d.timer) clearTimeout(d.timer);
    d.timer = setTimeout(() => this.flush(d), CHANGE_DEBOUNCE_MS);
  }

  /** Sends buffered edits now (called before every request so clangd sees what the user sees). */
  flush(d: TrackedDoc | undefined) {
    if (!d) return;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    if (!this.client.isOpen(d.uri)) return;
    const incremental = this.caps?.textDocumentSync?.change === 2 || this.caps?.textDocumentSync === 2;
    if (d.full || !incremental) { if (d.full || d.queue.length) this.client.change(d.uri, d.model.getValue()); }
    else if (d.queue.length) this.client.change(d.uri, d.queue);
    d.queue = []; d.full = false;
  }

  private untrack(key: string) {
    const d = this.docs.get(key); if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    d.subs.forEach(s => s.dispose());
    this.docs.delete(key);
    this.client.close(d.uri);
  }

  /** Called after a tab is written to disk. */
  notifySaved(path: string) {
    const d = this.docs.get(uriKey(path)); if (!d || !this.initialized) return;
    this.flush(d); this.client.save(d.uri);
  }

  /** Close a document when its tab closes (the model may be reused later; re-tracking reopens it). */
  closePath(path: string) { this.untrack(uriKey(path)); }

  private docFor(model: any) { const raw = model?.uri?.toString?.(); return raw ? this.docs.get(uriKey(raw)) : undefined; }

  // ---------- diagnostics ----------
  private onDiagnostics(p: { uri: string; diagnostics: any[]; version?: number }) {
    if (!p || typeof p.uri !== 'string') return;
    const key = uriKey(p.uri);
    const d = this.docs.get(key);
    if (!d) { this.pendingDiags.set(key, p.diagnostics ?? []); return; }
    this.applyMarkers(d.model, p.diagnostics ?? []);
  }
  private applyMarkers(model: any, diags: any[]) {
    if (!this.monaco || model.isDisposed?.()) return;
    this.monaco.editor.setModelMarkers(model, MARKER_OWNER, toMarkers(this.monaco, diags, (u) => this.monaco.Uri.parse(u)));
  }
  private clearMarkers(model: any) { if (this.monaco && !model.isDisposed?.()) this.monaco.editor.setModelMarkers(model, MARKER_OWNER, []); }

  // ---------- providers ----------
  /** Registers Monaco providers once. They no-op (returning undefined) whenever clangd is not serving. */
  attachMonaco(monaco: any) {
    if (this.monaco) return;
    this.monaco = monaco;
    const L = monaco.languages;
    const langs = ['cpp', 'c'];
    const can = (model: any) => this.initialized && !!this.docFor(model);
    const req = async <T,>(model: any, method: string, params: object, token?: CancelToken): Promise<T | undefined> => {
      const d = this.docFor(model); this.flush(d);
      try { return await this.client.request<T>(method, { textDocument: { uri: d!.uri }, ...params }, token); }
      catch { return undefined; }
    };
    const uri = (u: string) => monaco.Uri.parse(pathToUri(uriToPath(u)));
    const reg = (fn: (lang: string) => { dispose(): void }) => langs.forEach(l => this.disposables.push(fn(l)));

    // Cross-file navigation (Ctrl+click / F12 into another file) opens that file as a Nexel tab.
    if (monaco.editor.registerEditorOpener) this.disposables.push(monaco.editor.registerEditorOpener({
      openCodeEditor: (_src: any, resource: any, sel: any) => {
        if (resource?.scheme !== 'file') return false;
        const line = sel?.startLineNumber ?? sel?.lineNumber ?? 1; const col = sel?.startColumn ?? sel?.column ?? 1;
        (globalThis as any).window?.dispatchEvent?.(new CustomEvent('nexel:open-at', { detail: { path: uriToPath(resource.toString()), line, col } }));
        return true;
      },
    }));

    reg((l) => L.registerCompletionItemProvider(l, {
      triggerCharacters: TRIGGERS,
      provideCompletionItems: async (model: any, position: any, context: any, token: CancelToken) => {
        if (!can(model)) return undefined;
        const res = await req<any>(model, 'textDocument/completion', {
          position: toLspPosition(position),
          context: { triggerKind: (context?.triggerKind ?? 0) + 1, triggerCharacter: context?.triggerCharacter },
        }, token);
        if (res === undefined) return undefined;
        const w = model.getWordUntilPosition(position);
        const fallback = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        const { suggestions, incomplete } = toMonacoCompletions(monaco, res, fallback);
        return { suggestions, incomplete };
      },
      resolveCompletionItem: async (item: any, token: CancelToken) => {
        if (!this.initialized || !item?._lsp || item.documentation || !this.caps?.completionProvider?.resolveProvider) return item;
        try {
          const r: any = await this.client.request('completionItem/resolve', item._lsp, token);
          if (r) { item.documentation = markdown(r.documentation) ?? item.documentation; item.detail = r.detail ?? item.detail; }
        } catch { /* keep item */ }
        return item;
      },
    }));

    reg((l) => L.registerHoverProvider(l, {
      provideHover: async (model: any, position: any, token: CancelToken) => {
        if (!can(model)) return undefined;
        return toMonacoHover(await req(model, 'textDocument/hover', { position: toLspPosition(position) }, token)) ?? undefined;
      },
    }));

    reg((l) => L.registerSignatureHelpProvider(l, {
      signatureHelpTriggerCharacters: ['(', ',', '<'],
      signatureHelpRetriggerCharacters: [')'],
      provideSignatureHelp: async (model: any, position: any, token: CancelToken, context: any) => {
        if (!can(model)) return undefined;
        const res = await req(model, 'textDocument/signatureHelp', {
          position: toLspPosition(position),
          context: context ? { triggerKind: context.triggerKind ?? 1, triggerCharacter: context.triggerCharacter, isRetrigger: !!context.isRetrigger } : undefined,
        }, token);
        return toMonacoSignatureHelp(res) ?? undefined;
      },
    }));

    const locProvider = (method: string) => async (model: any, position: any, token: CancelToken) => {
      if (!can(model)) return undefined;
      const locs = toLocations(await req(model, method, { position: toLspPosition(position) }, token));
      await Promise.all(locs.map(l => this.ensurePeekModel(l.uri)));
      return locs.map(l => ({ uri: uri(l.uri), range: l.range }));
    };
    reg((l) => L.registerDefinitionProvider(l, { provideDefinition: locProvider('textDocument/definition') }));
    reg((l) => L.registerDeclarationProvider(l, { provideDeclaration: locProvider('textDocument/declaration') }));
    reg((l) => L.registerReferenceProvider(l, {
      provideReferences: async (model: any, position: any, ctx: any, token: CancelToken) => {
        if (!can(model)) return undefined;
        const locs = toLocations(await req(model, 'textDocument/references', { position: toLspPosition(position), context: { includeDeclaration: ctx?.includeDeclaration ?? true } }, token));
        await Promise.all(locs.map(l => this.ensurePeekModel(l.uri)));
        return locs.map(l => ({ uri: uri(l.uri), range: l.range }));
      },
    }));

    reg((l) => L.registerRenameProvider(l, {
      provideRenameEdits: async (model: any, position: any, newName: string, token: CancelToken) => {
        if (!can(model)) return undefined;
        const d = this.docFor(model); this.flush(d);
        try {
          const res = await this.client.request('textDocument/rename', { textDocument: { uri: d!.uri }, position: toLspPosition(position), newName }, token);
          return toMonacoWorkspaceEdit(res, uri);
        } catch (e) { return { edits: [], rejectReason: (e as Error).message }; }
      },
      resolveRenameLocation: async (model: any, position: any, token: CancelToken) => {
        if (!can(model)) return undefined;
        const r: any = await req(model, 'textDocument/prepareRename', { position: toLspPosition(position) }, token);
        if (!r) return { range: undefined as any, text: '', rejectReason: 'This symbol cannot be renamed.' };
        const range = toMonacoRange(r.range ?? r);
        return { range, text: r.placeholder ?? model.getValueInRange(range) };
      },
    }));

    reg((l) => L.registerDocumentSymbolProvider(l, {
      displayName: 'clangd',
      provideDocumentSymbols: async (model: any, token: CancelToken) => can(model) ? toMonacoSymbols(monaco, await req(model, 'textDocument/documentSymbol', {}, token)) : undefined,
    }));
    reg((l) => L.registerDocumentHighlightProvider(l, {
      provideDocumentHighlights: async (model: any, position: any, token: CancelToken) => can(model) ? toMonacoHighlights(monaco, await req(model, 'textDocument/documentHighlight', { position: toLspPosition(position) }, token)) : undefined,
    }));
    const fmtOpts = (o: any) => ({ tabSize: o?.tabSize ?? 4, insertSpaces: o?.insertSpaces ?? true });
    reg((l) => L.registerDocumentFormattingEditProvider(l, {
      displayName: 'clang-format (clangd)',
      provideDocumentFormattingEdits: async (model: any, options: any, token: CancelToken) => can(model) ? toMonacoTextEdits(await req(model, 'textDocument/formatting', { options: fmtOpts(options) }, token)) : undefined,
    }));
    reg((l) => L.registerDocumentRangeFormattingEditProvider(l, {
      displayName: 'clang-format (clangd)',
      provideDocumentRangeFormattingEdits: async (model: any, range: any, options: any, token: CancelToken) => can(model)
        ? toMonacoTextEdits(await req(model, 'textDocument/rangeFormatting', { range: { start: toLspPosition({ lineNumber: range.startLineNumber, column: range.startColumn }), end: toLspPosition({ lineNumber: range.endLineNumber, column: range.endColumn }) }, options: fmtOpts(options) }, token))
        : undefined,
    }));
  }

  /** Go-to/peek into a file that has no editor model yet (a header, another .cpp): load it read-only for the peek view. */
  private async ensurePeekModel(lspUri: string) {
    const m = this.monaco; if (!m) return;
    const muri = m.Uri.parse(pathToUri(uriToPath(lspUri)));
    if (m.editor.getModel(muri)) return;
    const api = (globalThis as any).window?.nexelAPI;
    if (!api?.readFileContent) return;
    try {
      const text = await api.readFileContent(uriToPath(lspUri));
      if (!m.editor.getModel(muri)) m.editor.createModel(text, 'cpp', muri);
    } catch { /* unreadable: Monaco shows the location without a preview */ }
  }

  dispose() {
    this.disposables.forEach(d => d.dispose()); this.disposables = [];
    for (const k of [...this.docs.keys()]) this.untrack(k);
    this.client.dispose();
  }
}

export const CLIENT_CAPABILITIES = {
  general: { positionEncodings: ['utf-16'] },
  window: { workDoneProgress: true },
  workspace: { workspaceFolders: true, configuration: false, applyEdit: false },
  textDocument: {
    synchronization: { didSave: true, willSave: false, willSaveWaitUntil: false, dynamicRegistration: false },
    completion: {
      contextSupport: true,
      completionItem: {
        snippetSupport: true, commitCharactersSupport: true, documentationFormat: ['markdown', 'plaintext'],
        deprecatedSupport: true, preselectSupport: true, insertReplaceSupport: true, labelDetailsSupport: true,
        tagSupport: { valueSet: [1] }, resolveSupport: { properties: ['documentation', 'detail'] },
      },
      completionItemKind: { valueSet: Array.from({ length: 25 }, (_, i) => i + 1) },
    },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    signatureHelp: { contextSupport: true, signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true }, activeParameterSupport: true } },
    definition: { linkSupport: true }, declaration: { linkSupport: true }, references: {}, documentHighlight: {},
    documentSymbol: { hierarchicalDocumentSymbolSupport: true, symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) } },
    formatting: {}, rangeFormatting: {},
    rename: { prepareSupport: true },
    publishDiagnostics: { relatedInformation: true, tagSupport: { valueSet: [1, 2] }, codeDescriptionSupport: true, versionSupport: true },
  },
};

// ---------- app singleton ----------
let singleton: ClangdSession | null = null;
/** The app-wide session (lazily bound to window.nexelAPI and the toast store). */
export function getClangd(notify?: Notify): ClangdSession {
  if (!singleton) singleton = new ClangdSession(((globalThis as any).window?.nexelAPI ?? {}) as ClangdBridge, notify);
  return singleton;
}
export function __resetClangdForTests() { singleton?.dispose(); singleton = null; }
