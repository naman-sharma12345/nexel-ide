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

import { isCloudflareChallenge, splitProblemsPage } from '../cfProblems';
import { isCodeforcesUrl } from '../cfBrowserLoader';

const cfPage = '<html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=1"></script><div id="cf_chl_opt"></div></html>';
const problemsPage = `<div class="problemindexholder" problemindex="A">${page(fmtA)}</div><div class="problemindexholder" problemindex="B">${page(fmtB).replace('A. Watermelon', 'B. Melon')}</div>`;

describe('live contest fetch', () => {
  beforeEach(() => clearProblemCache());
  const api = (url: string, seen: string[]) => { seen.push(url); return { ok: true, status: 200, text: async () => '', json: async () => ({ status: 'OK', result: { problems: [{ index: 'A', name: 'Watermelon' }, { index: 'B', name: 'Melon' }] } }) }; };

  it('detects Cloudflare pages and not real problems', () => {
    expect(isCloudflareChallenge(cfPage)).toBe(true);
    expect(isCloudflareChallenge(page(fmtA) + '<script src="/cdn-cgi/challenge-platform/x"></script>')).toBe(false);
  });
  it('splits the complete problemset page', () => {
    const b = splitProblemsPage(problemsPage);
    expect(Object.keys(b)).toEqual(['A', 'B']);
  });
  it('calls standings with no from/count params (live contests reject them)', async () => {
    const seen: string[] = [];
    const f = async (url: string) => url.includes('/api/') ? api(url, seen) : { ok: true, status: 200, text: async () => problemsPage, json: async () => ({}) };
    const r = await fetchContestProblems(2277, f as never);
    expect(seen[0]).toBe('https://codeforces.com/api/contest.standings?contestId=2277');
    expect(r.A.title).toBe('Watermelon');
    expect(r.B.title).toBe('Melon');
  });
  it('uses one /problems load for all statements', async () => {
    const pages: string[] = [];
    const f = async (url: string) => url.includes('/api/') ? api(url, []) : (pages.push(url), { ok: true, status: 200, text: async () => problemsPage, json: async () => ({}) });
    await fetchContestProblems(2278, f as never);
    expect(pages).toEqual(['https://codeforces.com/contest/2278/problems']);
  });
  it('falls back to the browser loader on Cloudflare 403', async () => {
    const f = async (url: string) => url.includes('/api/') ? api(url, []) : { ok: false, status: 403, text: async () => cfPage, json: async () => ({}) };
    const loaded: string[] = [];
    const loader = async (url: string) => { loaded.push(url); return problemsPage; };
    const r = await fetchContestProblems(2279, f as never, 60_000, loader);
    expect(loaded).toEqual(['https://codeforces.com/contest/2279/problems']);
    expect(r.A.testCases?.length).toBe(1);
    expect(r.B.testCases?.[0].input).toBe('8\n1 < 2\n');
  }, 20000);
  it('falls back to the browser loader when HTTP 200 is a challenge page', async () => {
    const f = async (url: string) => url.includes('/api/') ? api(url, []) : { ok: true, status: 200, text: async () => cfPage, json: async () => ({}) };
    const r = await fetchContestProblems(2280, f as never, 60_000, async () => problemsPage);
    expect(r.A.error).toBeUndefined();
  });
  it('without a browser, returns named cards with a Cloudflare hint instead of throwing', async () => {
    const f = async (url: string) => url.includes('/api/') ? api(url, []) : { ok: false, status: 403, text: async () => cfPage, json: async () => ({}) };
    const r = await fetchContestProblems(2281, f as never);
    expect(r.A.title).toBe('Watermelon');
    expect(r.A.error).toMatch(/Cloudflare|403/);
  }, 20000);
  it('loader only accepts codeforces.com https URLs', () => {
    expect(isCodeforcesUrl('https://codeforces.com/contest/1/problems')).toBe(true);
    expect(isCodeforcesUrl('https://evil.com/?codeforces.com')).toBe(false);
    expect(isCodeforcesUrl('http://codeforces.com/')).toBe(false);
  });
});
