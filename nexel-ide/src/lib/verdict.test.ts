import { describe, it, expect } from 'vitest';
import { judgeVerdict } from './verdict';
const lim = { timeMs: 1000, memKb: 262144 };
const base = { exitCode: 0, timeMs: 10, stdout: '1 2\n', expected: '1 2' };
describe('judgeVerdict', () => {
  it('AC ignores trailing whitespace and CRLF', () => expect(judgeVerdict({ ...base, stdout: '1 2  \r\n\r\n' }, lim)).toBe('AC'));
  it('WA', () => expect(judgeVerdict({ ...base, stdout: '3' }, lim)).toBe('WA'));
  it('TLE beats RE', () => expect(judgeVerdict({ ...base, exitCode: 1, timeMs: 2000 }, lim)).toBe('TLE'));
  it('MLE', () => expect(judgeVerdict({ ...base, memKb: 999999 }, lim)).toBe('MLE'));
  it('RE', () => expect(judgeVerdict({ ...base, exitCode: 139 }, lim)).toBe('RE'));
});
