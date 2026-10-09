/**
 * Find-in-files engine. Pure + dependency-injected so it is unit-testable and the
 * renderer never gains new filesystem powers: it reuses the already-validated
 * readFileContent IPC. Bounded on every axis (files, bytes, matches, concurrency)
 * and cancellable through an AbortSignal — a "bounded buffer + worker pool" shape.
 */
export interface SearchOptions { caseSensitive?: boolean; regex?: boolean; wholeWord?: boolean; }
export interface SearchMatch { line: number; col: number; length: number; text: string; }
export interface FileResult { path: string; name: string; matches: SearchMatch[]; }
export interface SearchLimits { maxMatches: number; maxFiles: number; maxFileBytes: number; concurrency: number; maxLineChars: number; }
export const DEFAULT_LIMITS: SearchLimits = { maxMatches: 500, maxFiles: 2000, maxFileBytes: 1_000_000, concurrency: 8, maxLineChars: 240 };
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|exe|dll|so|o|obj|bin|zip|7z|gz|mp4|mp3|pdf|woff2?|ttf)$/i;

/** Builds a safe global RegExp, or null if the pattern is invalid / empty. Escapes literals so users can't ReDoS themselves by accident. */
export function buildMatcher(query: string, opts: SearchOptions = {}): RegExp | null {
  if (!query) return null;
  try {
    let src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (opts.wholeWord) src = `\\b(?:${src})\\b`;
    return new RegExp(src, 'g' + (opts.caseSensitive ? '' : 'i'));
  } catch { return null; }
}

export function searchText(content: string, re: RegExp, cap: number, maxLineChars = 240): SearchMatch[] {
  const out: SearchMatch[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < cap; i++) {
    const line = lines[i];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) && out.length < cap) {
      if (m[0].length === 0) { re.lastIndex++; continue; } // avoid infinite loop on zero-width matches
      out.push({ line: i + 1, col: m.index + 1, length: m[0].length, text: line.length > maxLineChars ? line.slice(Math.max(0, m.index - 60), m.index + maxLineChars - 60) : line });
    }
  }
  return out;
}

export async function searchFiles(
  files: Array<{ path: string; name: string }>,
  read: (path: string) => Promise<string>,
  query: string,
  opts: SearchOptions = {},
  signal?: AbortSignal,
  limits: SearchLimits = DEFAULT_LIMITS,
  onProgress?: (results: FileResult[], done: number, total: number) => void,
): Promise<{ results: FileResult[]; total: number; truncated: boolean }> {
  const re = buildMatcher(query, opts);
  const results: FileResult[] = [];
  if (!re) return { results, total: 0, truncated: false };
  const queue = files.filter(f => !SKIP_EXT.test(f.name)).slice(0, limits.maxFiles);
  let total = 0, next = 0, done = 0, truncated = files.length > limits.maxFiles;
  const worker = async () => {
    while (!signal?.aborted && total < limits.maxMatches) {
      const f = queue[next++]; if (!f) return;
      try {
        const content = await read(f.path);
        if (content.length > limits.maxFileBytes || content.includes('\u0000')) continue; // skip huge / binary files
        const ms = searchText(content, new RegExp(re.source, re.flags), limits.maxMatches - total, limits.maxLineChars);
        if (ms.length) { total += ms.length; results.push({ path: f.path, name: f.name, matches: ms }); }
      } catch { /* unreadable file: skip */ }
      done++; onProgress?.(results, done, queue.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limits.concurrency, queue.length) }, worker));
  if (total >= limits.maxMatches) truncated = true;
  results.sort((a, b) => a.path.localeCompare(b.path));
  return { results, total, truncated };
}
