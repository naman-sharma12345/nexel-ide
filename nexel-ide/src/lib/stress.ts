// Deterministic random-test generator for stress testing (mulberry32 PRNG).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface ArrayCaseOpts { maxN: number; maxV: number; minV?: number }
/** Generates "n\na1 a2 ... an\n" with bounded size so a bad option can't blow memory. */
export function genArrayCase(seed: number, o: ArrayCaseOpts): string {
  const r = mulberry32(seed);
  const maxN = Math.min(Math.max(1, Math.floor(o.maxN)), 200000);
  const lo = Math.floor(o.minV ?? 1), hi = Math.max(lo, Math.floor(o.maxV));
  const n = 1 + Math.floor(r() * maxN);
  const a = Array.from({ length: n }, () => lo + Math.floor(r() * (hi - lo + 1)));
  return `${n}\n${a.join(' ')}\n`;
}
/** First differing line between two outputs (whitespace-trimmed), or null. */
export function firstDiff(x: string, y: string): { line: number; a: string; b: string } | null {
  const p = x.trimEnd().split('\n'), q = y.trimEnd().split('\n');
  for (let i = 0; i < Math.max(p.length, q.length); i++) {
    const l = (p[i] ?? '').trimEnd(), m = (q[i] ?? '').trimEnd();
    if (l !== m) return { line: i + 1, a: l, b: m };
  }
  return null;
}

export interface StressRun { (filePath: string, input: string): Promise<{ out: string; verdict: string }>; }
export interface StressOpts { solution: string; brute: string; iterations: number; maxN: number; maxV: number; seed?: number; }
export interface StressFailure { iteration: number; seed: number; input: string; expected: string; actual: string; verdict: string; diff: { line: number; a: string; b: string } | null; }
export interface StressProgress { done: number; total: number; }
export interface StressResult { ok: boolean; ran: number; failure?: StressFailure; stopped?: boolean; }

/**
 * Runs `solution` and `brute` on generated inputs until the first mismatch / non-AC verdict.
 * Bounded (iterations clamped to 1..2000) and cancellable through the AbortSignal, so a runaway
 * stress loop can never pin the CPU: the loop yields to the event loop between iterations.
 */
export async function runStress(run: StressRun, o: StressOpts, signal?: AbortSignal, onProgress?: (p: StressProgress) => void): Promise<StressResult> {
  const total = Math.min(Math.max(1, Math.floor(o.iterations)), 2000);
  const base = o.seed ?? 1;
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) return { ok: true, ran: i, stopped: true };
    const seed = base + i;
    const input = genArrayCase(seed, { maxN: o.maxN, maxV: o.maxV });
    const b = await run(o.brute, input);
    if (b.verdict !== 'AC' && b.verdict !== 'IDLE') return { ok: false, ran: i + 1, failure: { iteration: i + 1, seed, input, expected: b.out, actual: b.out, verdict: 'BRUTE-' + b.verdict, diff: null } };
    const s = await run(o.solution, input);
    const diff = firstDiff(b.out, s.out);
    if (s.verdict !== 'AC' || diff) return { ok: false, ran: i + 1, failure: { iteration: i + 1, seed, input, expected: b.out, actual: s.out, verdict: s.verdict !== 'AC' ? s.verdict : 'WA', diff } };
    onProgress?.({ done: i + 1, total });
    await new Promise(r => setTimeout(r, 0));
  }
  return { ok: true, ran: total };
}
