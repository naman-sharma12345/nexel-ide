import { describe, it, expect } from 'vitest';
import { genArrayCase, firstDiff } from './stress';
describe('stress', () => {
  it('is deterministic and bounded', () => {
    const o = { maxN: 5, maxV: 9 };
    expect(genArrayCase(7, o)).toBe(genArrayCase(7, o));
    const [n, row] = genArrayCase(7, o).split('\n');
    expect(row.split(' ').length).toBe(+n);
    expect(+n).toBeLessThanOrEqual(5);
  });
  it('finds first diff', () => {
    expect(firstDiff('1\n2\n', '1\n3')).toEqual({ line: 2, a: '2', b: '3' });
    expect(firstDiff('a \n', 'a')).toBeNull();
  });
});

import { runStress } from './stress';
describe('runStress', () => {
  it('passes when both programs agree', async () => {
    const run = async (_f: string, input: string) => ({ out: input.length + '\n', verdict: 'AC' });
    const r = await runStress(run, { solution: 'a', brute: 'b', iterations: 5, maxN: 5, maxV: 9 });
    expect(r.ok).toBe(true); expect(r.ran).toBe(5);
  });
  it('stops at the first mismatch and returns the failing input', async () => {
    let calls = 0;
    const run = async (f: string) => { calls++; return { out: f === 'a' && calls > 4 ? 'X\n' : '1\n', verdict: 'AC' }; };
    const r = await runStress(run, { solution: 'a', brute: 'b', iterations: 50, maxN: 5, maxV: 9 });
    expect(r.ok).toBe(false); expect(r.failure?.verdict).toBe('WA'); expect(r.failure?.diff?.line).toBe(1);
  });
  it('honours abort', async () => {
    const ac = new AbortController(); ac.abort();
    const r = await runStress(async () => ({ out: '', verdict: 'AC' }), { solution: 'a', brute: 'b', iterations: 9, maxN: 5, maxV: 9 }, ac.signal);
    expect(r.stopped).toBe(true);
  });
});
