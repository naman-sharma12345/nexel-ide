// Tier-1 signature help for C++ STL calls: zero-install, derived from hoverDocs.
import { CPP_DOCS } from './hoverDocs';

export interface CallContext { name: string; argIndex: number }

/** Finds the innermost unclosed call before the cursor, e.g. "sort(a, b" -> {sort, 1}. */
export function findCall(textBefore: string): CallContext | null {
  let depth = 0, commas = 0;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    const c = textBefore[i];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') {
      if (depth === 0) {
        if (c !== '(') return null;
        const m = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(textBefore.slice(0, i));
        return m ? { name: m[1], argIndex: commas } : null;
      }
      depth--;
    } else if (c === ',' && depth === 0) commas++;
    else if (c === ';' && depth === 0) return null;
  }
  return null;
}

export function splitParams(sig: string): string[] {
  const open = sig.indexOf('(');
  const close = sig.lastIndexOf(')');
  if (open < 0 || close < open) return [];
  const out: string[] = []; let d = 0, cur = '';
  for (const ch of sig.slice(open + 1, close)) {
    if (ch === '<' || ch === '(') d++;
    if (ch === '>' || ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function registerSignatureHelp(monaco: any): { dispose(): void }[] {
  return [monaco.languages.registerSignatureHelpProvider('cpp', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp(model: any, pos: any) {
      const before = model.getValueInRange({ startLineNumber: Math.max(1, pos.lineNumber - 20), startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column });
      const call = findCall(before);
      const d = call && CPP_DOCS[call.name];
      if (!call || !d || !d.sig.includes('(')) return null;
      const params = splitParams(d.sig);
      return {
        value: {
          signatures: [{ label: d.sig, documentation: { value: d.doc + (d.cx ? `\n\n**${d.cx}**` : '') }, parameters: params.map(p => ({ label: p })) }],
          activeSignature: 0,
          activeParameter: Math.min(call.argIndex, Math.max(0, params.length - 1)),
        },
        dispose() {},
      };
    },
  })];
}
