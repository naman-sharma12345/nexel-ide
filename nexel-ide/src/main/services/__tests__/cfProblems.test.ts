import { describe, it, expect, beforeEach } from 'vitest';
import { parseProblemPage, parseSamples, sanitizeHtml, fetchContestProblems, clearProblemCache, validateContestId } from '../cfProblems';

const page = (sample: string) => `<div class="problem-statement"><div class="header"><div class="title">A. Watermelon</div><div class="time-limit"><div class="property-title">time limit per test</div>1 second</div><div class="memory-limit"><div class="property-title">memory limit per test</div>256 megabytes</div></div><div><p>Split <script>x()</script>it.</p></div><div class="input-specification"><div class="section-title">Input</div><p>One int w.</p></div><div class="output-specification"><div class="section-title">Output</div><p>YES or NO.</p></div><div class="sample-tests"><div class="section-title">Example</div><div class="sample-test">${sample}</div></div></div>`;
const fmtA = `<div class="input"><div class="title">Input</div><pre>8<br />1 2</pre></div><div class="output"><div class="title">Output</div><pre>YES<br /></pre></div>`;
const fmtB = `<div class="input"><div class="title">Input</div><pre><div class="test-example-line test-example-line-even">8</div><div class="test-example-line test-example-line-odd">1 &lt; 2</div></pre></div><div class="output"><div class="title">Output</div><pre><div class="test-example-line">YES</div></pre></div>`;

describe('cfProblems', () => {
  beforeEach(() => clearProblemCache());
  it('parses old <br> samples', () => { expect(parseSamples(fmtA)).toEqual([{ input: '8\n1 2\n', output: 'YES\n' }]); });
  it('parses test-example-line samples', () => { expect(parseSamples(fmtB)[0].input).toBe('8\n1 < 2\n'); });
  it('parses a full page and strips scripts', () => {
    const p = parseProblemPage(page(fmtA), 4, 'A');
    expect(p.title).toBe('Watermelon');
    expect(p.timeLimit).toContain('1 second');
    expect(p.statement).not.toContain('script');
    expect(p.testCases?.length).toBe(1);
  });
  it('returns error card when statement missing', () => { expect(parseProblemPage('<html/>', 4, 'A').error).toBeTruthy(); });
  it('sanitizes handlers', () => { expect(sanitizeHtml('<a href="javascript:x" onclick="y()">z</a>')).not.toMatch(/onclick|javascript/); });
  it('validates ids', () => { expect(() => validateContestId('1; rm')).toThrow(); expect(validateContestId('1981')).toBe(1981); });
  it('fetches problems via API + pages, routes errors', async () => {
    const f = async (url: string) => url.includes('/api/')
      ? { ok: true, status: 200, text: async () => '', json: async () => ({ status: 'OK', result: { problems: [{ index: 'A' }, { index: 'B' }] } }) }
      : url.endsWith('/A') ? { ok: true, status: 200, text: async () => page(fmtB), json: async () => ({}) }
      : { ok: false, status: 404, text: async () => '', json: async () => ({}) };
    const r = await fetchContestProblems(4, f as never);
    expect(r.A.testCases?.length).toBe(1);
    expect(r.B.error).toMatch(/404/);
  }, 20000);
  it('reports contest not started', async () => {
    const f = async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({ status: 'FAILED', comment: 'contestId: not found' }) });
    await expect(fetchContestProblems(5, f as never)).rejects.toThrow(/not found/);
  });
});
