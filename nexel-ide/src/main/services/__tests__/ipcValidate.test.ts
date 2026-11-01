import { describe, it, expect } from 'vitest';
import { validateJudgeArgs, JUDGE_LIMITS } from '../ipcValidate';

describe('validateJudgeArgs', () => {
  it('accepts a normal request and clamps limits', () => {
    const v = validateJudgeArgs('/w/a.cpp', [{ id: 1, input: '1', expected: '2' }], 999999, 1);
    expect(v.timeLimit).toBe(JUDGE_LIMITS.maxTimeMs);
    expect(v.memoryLimit).toBe(JUDGE_LIMITS.minMemMb);
    expect(v.cases[0].expected).toBe('2');
  });
  it('falls back to defaults for junk limits', () => {
    const v = validateJudgeArgs('/w/a.py', [], 'x', NaN);
    expect(v.timeLimit).toBe(JUDGE_LIMITS.defaultTimeMs);
    expect(v.memoryLimit).toBe(JUDGE_LIMITS.defaultMemMb);
  });
  it('rejects bad paths, types, and oversized payloads', () => {
    expect(() => validateJudgeArgs('/etc/passwd', [], 1000, 64)).toThrow();
    expect(() => validateJudgeArgs('a\0.cpp', [], 1000, 64)).toThrow();
    expect(() => validateJudgeArgs(5, [], 1000, 64)).toThrow();
    expect(() => validateJudgeArgs('/a.cpp', new Array(201).fill({}), 1000, 64)).toThrow();
    expect(() => validateJudgeArgs('/a.cpp', [{ input: 'x'.repeat(2_000_001), expected: '' }], 1000, 64)).toThrow();
  });
});
