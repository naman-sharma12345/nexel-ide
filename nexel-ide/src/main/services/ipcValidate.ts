/** Validation for untrusted IPC arguments (the renderer is treated as untrusted: XSS in Monaco/xterm must not become code execution). */
export interface ValidTestCase { id: number; input: string; expected: string; }
export const JUDGE_LIMITS = { maxCases: 200, maxCaseBytes: 2_000_000, minTimeMs: 100, maxTimeMs: 20_000, minMemMb: 16, maxMemMb: 2048, defaultTimeMs: 2000, defaultMemMb: 256 };
const SOLUTION_EXT = /\.(cpp|cc|java|py|js)$/i;

export function validateJudgeArgs(filePath: unknown, testCases: unknown, timeLimit: unknown, memoryLimit: unknown) {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 4096 || filePath.includes('\0')) throw new Error('judge: invalid file path');
  if (!SOLUTION_EXT.test(filePath)) throw new Error('judge: unsupported file type');
  if (!Array.isArray(testCases) || testCases.length > JUDGE_LIMITS.maxCases) throw new Error('judge: too many or invalid test cases');
  let bytes = 0;
  const cases: ValidTestCase[] = testCases.map((t: any, i) => {
    const input = typeof t?.input === 'string' ? t.input : '', expected = typeof t?.expected === 'string' ? t.expected : '';
    bytes += input.length + expected.length;
    if (bytes > JUDGE_LIMITS.maxCaseBytes) throw new Error('judge: test data too large');
    return { id: Number.isFinite(t?.id) ? Number(t.id) : i + 1, input, expected };
  });
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    filePath, cases,
    timeLimit: clamp(timeLimit, JUDGE_LIMITS.minTimeMs, JUDGE_LIMITS.maxTimeMs, JUDGE_LIMITS.defaultTimeMs),
    memoryLimit: clamp(memoryLimit, JUDGE_LIMITS.minMemMb, JUDGE_LIMITS.maxMemMb, JUDGE_LIMITS.defaultMemMb),
  };
}
