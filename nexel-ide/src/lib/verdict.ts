export type Verdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE';
export interface RunResult { exitCode: number | null; signal?: string | null; timeMs: number; memKb?: number; stdout: string; expected: string; }
export interface Limits { timeMs: number; memKb: number; }

const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');

/** Classify a run in the same precedence Codeforces uses: TLE > MLE > RE > WA > AC. */
export function judgeVerdict(r: RunResult, lim: Limits): Verdict {
  if (r.timeMs > lim.timeMs || r.signal === 'SIGXCPU') return 'TLE';
  if ((r.memKb ?? 0) > lim.memKb) return 'MLE';
  if (r.exitCode !== 0) return 'RE';
  return norm(r.stdout) === norm(r.expected) ? 'AC' : 'WA';
}
