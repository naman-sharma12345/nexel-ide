import { describe, it, expect } from 'vitest';
import { buildMatcher, searchText, searchFiles, DEFAULT_LIMITS } from './searchInFiles';

describe('searchInFiles', () => {
  it('escapes literals and rejects bad regex', () => {
    expect(buildMatcher('a.b')!.test('a.b')).toBe(true);
    expect(buildMatcher('a.b')!.test('axb')).toBe(false);
    expect(buildMatcher('(', { regex: true })).toBeNull();
    expect(buildMatcher('')).toBeNull();
  });
  it('finds positions, honours case and whole word', () => {
    const ms = searchText('int Foo;\nfoo foobar', buildMatcher('foo', { wholeWord: true })!, 10);
    expect(ms.map(m => [m.line, m.col])).toEqual([[1, 5], [2, 1]]);
    expect(searchText('Foo foo', buildMatcher('foo', { caseSensitive: true })!, 10)).toHaveLength(1);
  });
  it('does not hang on zero-width regex', () => {
    expect(searchText('abc', buildMatcher('x*', { regex: true })!, 10)).toHaveLength(0);
  });
  it('searches many files with caps, skips binary and aborts', async () => {
    const files = [{ path: '/b.cpp', name: 'b.cpp' }, { path: '/a.cpp', name: 'a.cpp' }, { path: '/x.png', name: 'x.png' }, { path: '/bin.dat', name: 'bin.dat' }];
    const data: Record<string, string> = { '/a.cpp': 'vector<int> v;', '/b.cpp': 'vector<long> w;\nvector<x>', '/x.png': 'vector', '/bin.dat': 'vec\u0000tor vector' };
    const r = await searchFiles(files, async p => data[p], 'vector');
    expect(r.results.map(x => x.name)).toEqual(['a.cpp', 'b.cpp']);
    expect(r.total).toBe(3);
    const capped = await searchFiles(files, async p => data[p], 'vector', {}, undefined, { ...DEFAULT_LIMITS, maxMatches: 1, concurrency: 1 });
    expect(capped.truncated).toBe(true);
    const ac = new AbortController(); ac.abort();
    expect((await searchFiles(files, async p => data[p], 'vector', {}, ac.signal)).results).toHaveLength(0);
  });
});
