import { buildMatcher, type SearchOptions } from './searchInFiles';
/** Replace all matches in text. Literal mode treats `$` in the replacement literally; regex mode supports $1 groups. */
export function replaceInText(content: string, query: string, replacement: string, opts: SearchOptions = {}): { text: string; count: number } {
  const re = buildMatcher(query, opts);
  if (!re) return { text: content, count: 0 };
  let count = 0;
  const text = content.replace(re, (...args) => {
    const m = args[0] as string;
    if (m.length === 0) return m;
    count++;
    if (!opts.regex) return replacement;
    const groups = args.slice(1, -2).filter(a => typeof a === 'string' || a === undefined) as Array<string | undefined>;
    return replacement.replace(/\$(\d{1,2}|&|\$)/g, (_s, k: string) => k === '$' ? '$' : k === '&' ? m : (groups[Number(k) - 1] ?? ''));
  });
  return { text, count };
}
