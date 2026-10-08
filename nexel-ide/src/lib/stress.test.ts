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
