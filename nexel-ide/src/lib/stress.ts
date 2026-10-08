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
