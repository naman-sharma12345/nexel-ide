import { describe, it, expect } from 'vitest';
import { findCall, splitParams } from './signatureHelp';
describe('signatureHelp', () => {
  it('finds innermost call and arg index', () => {
    expect(findCall('sort(a.begin(), ')).toEqual({ name: 'sort', argIndex: 1 });
    expect(findCall('x = max(f(1,2), g(')).toEqual({ name: 'g', argIndex: 0 });
    expect(findCall('foo(1); ')).toBeNull();
  });
  it('splits params respecting templates', () => {
    expect(splitParams('void sort(RandomIt first, RandomIt last, Compare comp = less<>())')).toHaveLength(3);
    expect(splitParams('void f(map<int, int> m, int k)')).toEqual(['map<int, int> m', 'int k']);
  });
});
