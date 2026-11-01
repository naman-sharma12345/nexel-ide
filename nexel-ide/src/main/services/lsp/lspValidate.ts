/** Only a safe subset of LSP traffic may cross the renderer->main boundary. */
const ALLOWED = /^(initialize|initialized|shutdown|exit|\$\/cancelRequest|completionItem\/resolve|textDocument\/[A-Za-z]+|workspace\/(didChangeConfiguration|didChangeWatchedFiles|symbol))$/;
export const MAX_LSP_MESSAGE_CHARS = 4_000_000;

export function validateLspMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('lsp: message must be an object');
  const m = msg as Record<string, unknown>;
  if (m.jsonrpc !== '2.0') throw new Error('lsp: bad jsonrpc version');
  if ('id' in m && !(typeof m.id === 'number' || typeof m.id === 'string')) throw new Error('lsp: bad id');
  if (typeof m.method === 'string') {
    if (!ALLOWED.test(m.method)) throw new Error(`lsp: method not allowed: ${m.method.slice(0, 60)}`);
  } else if ('method' in m || !('id' in m) || !('result' in m || 'error' in m)) throw new Error('lsp: not a request, notification or response');
  if (JSON.stringify(m).length > MAX_LSP_MESSAGE_CHARS) throw new Error('lsp: message too large');
  return m;
}

export const CPP_STANDARDS = ['c++11', 'c++14', 'c++17', 'c++20', 'c++23'] as const;
export type CppStd = typeof CPP_STANDARDS[number];
export interface ClangdOptions { std: CppStd; extraFlags: string[] }

/**
 * Compiler flags the renderer may ask for. They only ever land in the generated .clangd file (never in clangd's argv),
 * and anything that can load code into clangd (-fplugin, -Xclang, -load, @response files, -B/--gcc-toolchain) is refused.
 */
const FLAG_OK = /^-(D[A-Za-z_]\w*(=[^\s"'`$\\;|&<>]*)?|U[A-Za-z_]\w*|W[A-Za-z0-9=+_-]*|w|pedantic(-errors)?|O[0-3sz]?|f(?!plugin)[A-Za-z0-9=+_-]+|m(arch|tune)=[A-Za-z0-9_-]+|I[^\s"'`$;|&<>]+|isystem[^\s"'`$;|&<>]+)$/;
export const MAX_EXTRA_FLAGS = 32;

export function validateClangdOptions(raw: unknown): ClangdOptions {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const std = (CPP_STANDARDS as readonly string[]).includes(o.std as string) ? (o.std as CppStd) : 'c++17';
  const list = Array.isArray(o.extraFlags) ? o.extraFlags : typeof o.extraFlags === 'string' ? o.extraFlags.split(/\s+/) : [];
  const extraFlags = list
    .filter((f): f is string => typeof f === 'string' && f.length > 0 && f.length <= 200 && FLAG_OK.test(f))
    .slice(0, MAX_EXTRA_FLAGS);
  return { std, extraFlags };
}

/** Splits a user-typed flag string and reports which flags would be dropped (for the Settings hint). */
export function partitionFlags(input: string): { ok: string[]; rejected: string[] } {
  const ok: string[] = []; const rejected: string[] = [];
  for (const f of input.split(/\s+/).filter(Boolean)) (f.length <= 200 && FLAG_OK.test(f) && ok.length < MAX_EXTRA_FLAGS ? ok : rejected).push(f);
  return { ok, rejected };
}
