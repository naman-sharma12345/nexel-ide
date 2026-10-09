// Pure LSP <-> Monaco conversions. `M` is the monaco namespace (only enums + Uri are used), injected for tests.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LspPosition { line: number; character: number }
export interface LspRange { start: LspPosition; end: LspPosition }
export interface MonacoRange { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }

// LSP positions are 0-based UTF-16 code units; Monaco columns are 1-based UTF-16 code units, so it is a +1 shift.
export const toLspPosition = (p: { lineNumber: number; column: number }): LspPosition => ({ line: p.lineNumber - 1, character: p.column - 1 });
export const toMonacoRange = (r: LspRange): MonacoRange => ({
  startLineNumber: r.start.line + 1, startColumn: r.start.character + 1, endLineNumber: r.end.line + 1, endColumn: r.end.character + 1,
});
export const toLspRange = (r: MonacoRange): LspRange => ({
  start: { line: r.startLineNumber - 1, character: r.startColumn - 1 }, end: { line: r.endLineNumber - 1, character: r.endColumn - 1 },
});

/** Monaco content-change event -> ordered LSP incremental changes (Monaco orders them for sequential application). */
export function toLspChanges(e: { changes: Array<{ range: MonacoRange; rangeLength: number; text: string }> }) {
  return e.changes.map(c => ({ range: toLspRange(c.range), rangeLength: c.rangeLength, text: c.text }));
}

const LSP_COMPLETION_KINDS = ['', 'Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property',
  'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant', 'Struct', 'Event', 'Operator', 'TypeParameter'];
export function completionKind(M: any, k?: number) {
  const name = (k && LSP_COMPLETION_KINDS[k]) || 'Text';
  return M.languages.CompletionItemKind[name] ?? M.languages.CompletionItemKind.Text;
}

const LSP_SYMBOL_KINDS = ['', 'File', 'Module', 'Namespace', 'Package', 'Class', 'Method', 'Property', 'Field', 'Constructor', 'Enum', 'Interface',
  'Function', 'Variable', 'Constant', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Key', 'Null', 'EnumMember', 'Struct', 'Event', 'Operator', 'TypeParameter'];
export function symbolKind(M: any, k?: number) {
  const name = (k && LSP_SYMBOL_KINDS[k]) || 'Variable';
  return M.languages.SymbolKind[name] ?? M.languages.SymbolKind.Variable;
}

/** LSP DiagnosticSeverity (1 error .. 4 hint) -> Monaco MarkerSeverity (8 error, 4 warning, 2 info, 1 hint). */
export function markerSeverity(M: any, s?: number) {
  const S = M.MarkerSeverity;
  return s === 2 ? S.Warning : s === 3 ? S.Info : s === 4 ? S.Hint : S.Error;
}

export function markdown(doc: unknown): { value: string; isTrusted?: boolean } | undefined {
  if (doc == null) return undefined;
  if (typeof doc === 'string') return doc ? { value: escapePlain(doc) } : undefined;
  const d = doc as { kind?: string; value?: string; language?: string };
  if (typeof d.value !== 'string' || !d.value) return undefined;
  if (d.language) return { value: '```' + d.language + '\n' + d.value + '\n```' }; // legacy MarkedString
  return { value: d.kind === 'plaintext' ? escapePlain(d.value) : d.value };
}
/** Plain text must not be interpreted as markdown (e.g. `a*b*c` in a comment). */
const escapePlain = (s: string) => s.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');

export interface ConvertedCompletion { suggestions: any[]; incomplete: boolean }

/** CompletionList | CompletionItem[] -> Monaco suggestions. `fallbackRange` is the word range at the cursor. */
export function toMonacoCompletions(M: any, res: any, fallbackRange: MonacoRange): ConvertedCompletion {
  if (!res) return { suggestions: [], incomplete: false };
  const items: any[] = Array.isArray(res) ? res : Array.isArray(res.items) ? res.items : [];
  const incomplete = !Array.isArray(res) && !!res.isIncomplete;
  const suggestions = items.map((it) => toMonacoCompletion(M, it, fallbackRange));
  return { suggestions, incomplete };
}

export function toMonacoCompletion(M: any, it: any, fallbackRange: MonacoRange) {
  const L = M.languages;
  const rawLabel = String(it.label ?? '');
  const label = rawLabel.replace(/^[\s•]+/, ''); // clangd prefixes "•" when an #include would be inserted
  let range: any = fallbackRange;
  let insertText = it.insertText ?? label;
  const te = it.textEdit;
  if (te) {
    insertText = te.newText;
    if (te.range) range = toMonacoRange(te.range);
    else if (te.insert && te.replace) range = { insert: toMonacoRange(te.insert), replace: toMonacoRange(te.replace) };
  }
  const ld = it.labelDetails;
  const detailFromLabel = ld?.detail ?? '';
  const out: any = {
    label: { label, detail: detailFromLabel || undefined, description: ld?.description || it.detail || undefined },
    kind: completionKind(M, it.kind),
    detail: it.detail,
    documentation: markdown(it.documentation),
    insertText,
    range,
    sortText: it.sortText,
    filterText: it.filterText ?? label,
    preselect: !!it.preselect,
    commitCharacters: it.commitCharacters,
    insertTextRules: it.insertTextFormat === 2 ? L.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    tags: it.deprecated || (Array.isArray(it.tags) && it.tags.includes(1)) ? [L.CompletionItemTag.Deprecated] : undefined,
    additionalTextEdits: Array.isArray(it.additionalTextEdits) ? it.additionalTextEdits.map((e: any) => ({ range: toMonacoRange(e.range), text: e.newText })) : undefined,
    _lsp: it,
  };
  return out;
}

export function toMonacoHover(res: any) {
  if (!res || res.contents == null) return null;
  const c = res.contents;
  const parts = (Array.isArray(c) ? c : [c]).map(markdown).filter(Boolean) as { value: string }[];
  if (!parts.length) return null;
  return { contents: parts, range: res.range ? toMonacoRange(res.range) : undefined };
}

export function toMonacoSignatureHelp(res: any) {
  if (!res || !Array.isArray(res.signatures) || !res.signatures.length) return null;
  return {
    value: {
      signatures: res.signatures.map((s: any) => ({
        label: s.label,
        documentation: markdown(s.documentation),
        parameters: (s.parameters ?? []).map((p: any) => ({ label: p.label, documentation: markdown(p.documentation) })),
        activeParameter: s.activeParameter,
      })),
      activeSignature: res.activeSignature ?? 0,
      activeParameter: res.activeParameter ?? 0,
    },
    dispose() {},
  };
}

/** Location | Location[] | LocationLink[] -> [{uri, range}] (uri strings, mapped to Monaco Uris by the caller). */
export function toLocations(res: any): Array<{ uri: string; range: MonacoRange }> {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : [res];
  return arr.map((l: any) => l.targetUri
    ? { uri: l.targetUri, range: toMonacoRange(l.targetSelectionRange ?? l.targetRange) }
    : { uri: l.uri, range: toMonacoRange(l.range) }).filter(l => typeof l.uri === 'string');
}

export function toMonacoSymbols(M: any, res: any): any[] {
  if (!Array.isArray(res)) return [];
  const conv = (s: any): any => s.location
    ? { name: s.name, detail: '', kind: symbolKind(M, s.kind), tags: [], containerName: s.containerName, range: toMonacoRange(s.location.range), selectionRange: toMonacoRange(s.location.range) }
    : { name: s.name, detail: s.detail ?? '', kind: symbolKind(M, s.kind), tags: [], range: toMonacoRange(s.range), selectionRange: toMonacoRange(s.selectionRange ?? s.range), children: (s.children ?? []).map(conv) };
  return res.map(conv);
}

export function toMonacoHighlights(M: any, res: any): any[] {
  if (!Array.isArray(res)) return [];
  const K = M.languages.DocumentHighlightKind;
  return res.map((h: any) => ({ range: toMonacoRange(h.range), kind: h.kind === 3 ? K.Write : h.kind === 2 ? K.Read : K.Text }));
}

export const toMonacoTextEdits = (res: any): Array<{ range: MonacoRange; text: string }> =>
  Array.isArray(res) ? res.map((e: any) => ({ range: toMonacoRange(e.range), text: e.newText })) : [];

/** WorkspaceEdit (changes or documentChanges) -> flat per-file edits; `toUri` maps a URI string to a Monaco Uri. */
export function toMonacoWorkspaceEdit(res: any, toUri: (u: string) => any) {
  const edits: any[] = [];
  if (!res) return { edits };
  if (res.changes) for (const [uri, list] of Object.entries(res.changes as Record<string, any[]>)) {
    for (const e of list) edits.push({ resource: toUri(uri), textEdit: { range: toMonacoRange(e.range), text: e.newText }, versionId: undefined });
  }
  if (Array.isArray(res.documentChanges)) for (const dc of res.documentChanges) {
    if (!dc.textDocument || !Array.isArray(dc.edits)) continue;
    for (const e of dc.edits) edits.push({ resource: toUri(dc.textDocument.uri), textEdit: { range: toMonacoRange(e.range), text: e.newText }, versionId: undefined });
  }
  return { edits };
}

/** publishDiagnostics -> Monaco markers. */
export function toMarkers(M: any, diagnostics: any[], toUri: (u: string) => any) {
  return (diagnostics ?? []).map((d: any) => {
    const r = toMonacoRange(d.range);
    const code = d.code == null ? undefined : d.codeDescription?.href ? { value: String(d.code), target: toUri(d.codeDescription.href) } : String(d.code);
    return {
      ...r,
      // zero-width ranges would be invisible: widen to one character
      endColumn: r.startLineNumber === r.endLineNumber && r.endColumn <= r.startColumn ? r.startColumn + 1 : r.endColumn,
      message: d.message,
      severity: markerSeverity(M, d.severity),
      source: d.source || 'clangd',
      code,
      tags: Array.isArray(d.tags) ? d.tags.filter((t: number) => t === 1 || t === 2) : undefined,
      relatedInformation: Array.isArray(d.relatedInformation) ? d.relatedInformation.map((ri: any) => ({
        resource: toUri(ri.location.uri), message: ri.message, ...toMonacoRange(ri.location.range),
      })) : undefined,
    };
  });
}
