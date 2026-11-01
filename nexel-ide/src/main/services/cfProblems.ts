// Built-in Codeforces problem fetcher (no external scraper). Parses statement pages with regexes.
export interface CFProblemData {
  index: string;
  title?: string;
  url: string;
  timeLimit: string;
  memoryLimit: string;
  statement?: string;
  inputFormat?: string;
  outputFormat?: string;
  note?: string;
  testCases?: Array<{ input: string; output: string }>;
  error?: string;
}

export function validateContestId(id: unknown): number {
  const n = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 99999999) throw new Error('Invalid contest id');
  return n;
}

export function validateProblemIndex(i: unknown): string {
  if (typeof i !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,2}$/.test(i)) throw new Error('Invalid problem index');
  return i.toUpperCase();
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&le;': '≤', '&ge;': '≥' };
export function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|nbsp|le|ge|#39);/g, (m) => ENTITIES[m] ?? m);
}

/** Strip scripts, event handlers, iframes and javascript: URLs from statement HTML. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '$1="#"');
}

function preText(inner: string): string {
  // Format B: <div class="test-example-line ...">line</div>; Format A: raw text with <br>
  let t = inner;
  if (/test-example-line/.test(t)) {
    const lines = [...t.matchAll(/<div[^>]*test-example-line[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => m[1]);
    t = lines.join('\n');
  } else {
    t = t.replace(/<br\s*\/?>/gi, '\n');
  }
  return decodeEntities(t.replace(/<[^>]+>/g, '')).replace(/\r/g, '').trim() + '\n';
}

export function parseSamples(html: string): Array<{ input: string; output: string }> {
  const out: Array<{ input: string; output: string }> = [];
  const block = html.match(/<div class="sample-test">([\s\S]*?)(?=<div class="note">|<\/div>\s*<\/div>\s*<\/div>\s*$|$)/i);
  const src = block ? block[1] : html;
  const ins = [...src.matchAll(/<div class="input">[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) => preText(m[1]));
  const outs = [...src.matchAll(/<div class="output">[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) => preText(m[1]));
  for (let i = 0; i < Math.min(ins.length, outs.length); i++) out.push({ input: ins[i], output: outs[i] });
  return out;
}

function section(html: string, cls: string): string | undefined {
  const m = html.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>\\s*(?=<div class="(?:input-specification|output-specification|sample-tests|note)"|</div>\\s*</div>\\s*</div>|$)`, 'i'));
  if (!m) return undefined;
  return sanitizeHtml(m[1].replace(/<div class="section-title">[\s\S]*?<\/div>/i, ''));
}

export function parseProblemPage(html: string, contestId: number, index: string): CFProblemData {
  const url = `https://codeforces.com/contest/${contestId}/problem/${index}`;
  const body = html.match(/<div class="problem-statement">([\s\S]*)/i)?.[1];
  if (!body) return { index, url, timeLimit: '', memoryLimit: '', error: 'Problem statement not available (contest may not have started or needs login)' };
  const title = decodeEntities((body.match(/<div class="title">([\s\S]*?)<\/div>/i)?.[1] ?? '').replace(/<[^>]+>/g, '')).replace(/^[A-Z0-9]+\.\s*/, '').trim();
  const tl = decodeEntities((body.match(/time limit per test<\/div>([\s\S]*?)<\/div>/i)?.[1] ?? '').replace(/<[^>]+>/g, '')).trim();
  const ml = decodeEntities((body.match(/memory limit per test<\/div>([\s\S]*?)<\/div>/i)?.[1] ?? '').replace(/<[^>]+>/g, '')).trim();
  // Statement = first plain <div> after the header
  const afterHeader = body.replace(/<div class="header">[\s\S]*?<\/div>\s*<\/div>\s*(?=<div)/i, '');
  const stmt = afterHeader.match(/^\s*<div>([\s\S]*?)<\/div>\s*(?=<div class="(?:input-specification|output-specification|sample-tests))/i)?.[1];
  const note = section(body, 'note');
  return {
    index, url, title, timeLimit: tl, memoryLimit: ml,
    statement: stmt ? sanitizeHtml(stmt) : undefined,
    inputFormat: section(body, 'input-specification'),
    outputFormat: section(body, 'output-specification'),
    note,
    testCases: parseSamples(body),
  };
}

type Fetch = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<any> }>;

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; if (e instanceof Error && /HTTP 40[34]/.test(e.message)) break; if (i < tries - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i)); }
  }
  throw err;
}

async function get(f: Fetch, url: string, json: boolean): Promise<any> {
  return withRetry(async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await f(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 NexelIDE' } });
      if (!r.ok) throw new Error(`Codeforces returned HTTP ${r.status}`);
      return json ? await r.json() : await r.text();
    } finally { clearTimeout(t); }
  });
}

const cache = new Map<number, { at: number; data: Record<string, CFProblemData> }>();

/** Loads a Codeforces page in a real browser engine (Electron hidden window) and returns its HTML. */
export type PageLoader = (url: string) => Promise<string>;

/** True when the HTML is a Cloudflare interstitial rather than a Codeforces page. */
export function isCloudflareChallenge(html: string): boolean {
  if (/class="problem-statement"/.test(html)) return false;
  return /Just a moment|cf_chl|cf-challenge|challenge-platform|Attention Required/i.test(html);
}

/** Split the complete-problemset page (/contest/X/problems) into one statement block per problem. */
export function splitProblemsPage(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = html.split(/(?=<div[^>]*\bproblemindex="[A-Za-z0-9]+")/i);
  for (const part of parts) {
    const idx = part.match(/^<div[^>]*\bproblemindex="([A-Za-z0-9]+)"/i)?.[1];
    if (idx && /class="problem-statement"/.test(part)) out[idx.toUpperCase()] = part;
  }
  if (Object.keys(out).length) return out;
  // Fallback: split on statements and read the index from each title ("A. Name").
  for (const part of html.split(/(?=<div class="problem-statement">)/i).slice(1)) {
    const idx = part.match(/<div class="title">\s*([A-Za-z][A-Za-z0-9]{0,2})\./)?.[1];
    if (idx) out[idx.toUpperCase()] = part;
  }
  return out;
}

class HttpBlockedError extends Error {}

async function getPage(f: Fetch, url: string, loader?: PageLoader): Promise<string> {
  let html: string | undefined;
  try {
    html = await get(f, url, false);
  } catch (e) {
    if (!loader) throw e;
  }
  if (html !== undefined && !isCloudflareChallenge(html)) return html;
  if (!loader) throw new HttpBlockedError('Codeforces blocked the request (Cloudflare). Sign in to Codeforces in Nexel or use Competitive Companion.');
  const viaBrowser = await loader(url);
  if (isCloudflareChallenge(viaBrowser)) throw new HttpBlockedError('Cloudflare check not passed yet. Solve it in the Codeforces window, then retry.');
  return viaBrowser;
}

const stub = (contestId: number, index: string, error: string, title?: string): CFProblemData =>
  ({ index, title, url: `https://codeforces.com/contest/${contestId}/problem/${index}`, timeLimit: '', memoryLimit: '', error });

/**
 * Fetch every problem of a contest. Works for live and finished contests.
 * 1. contest.standings with NO extra params (CF rejects from/count for non-admins during live contests).
 * 2. One load of /contest/X/problems (all statements), via HTTP, then a real browser window when Cloudflare blocks HTTP.
 * 3. Per-problem pages for anything missing.
 * 4. Names-only cards with an "open on Codeforces" error as the last resort.
 */
export async function fetchContestProblems(contestIdRaw: unknown, f: Fetch = fetch as unknown as Fetch, ttlMs = 60_000, loader?: PageLoader): Promise<Record<string, CFProblemData>> {
  const contestId = validateContestId(contestIdRaw);
  const hit = cache.get(contestId);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;

  const st = await get(f, `https://codeforces.com/api/contest.standings?contestId=${contestId}`, true)
    .catch((e) => { throw new Error(`Could not load contest ${contestId}: ${e instanceof Error ? e.message : e}. Open it on Codeforces: https://codeforces.com/contest/${contestId}`); });
  if (st.status !== 'OK') throw new Error(`Codeforces: ${st.comment || 'contest unavailable'} (contest may not have started yet)`);
  const list: Array<{ index: string; name?: string }> = st.result.problems ?? [];
  const result: Record<string, CFProblemData> = {};

  // One page load for every statement.
  let blocks: Record<string, string> = {};
  let lastError = '';
  try {
    blocks = splitProblemsPage(await getPage(f, `https://codeforces.com/contest/${contestId}/problems`, loader));
  } catch (e) { lastError = e instanceof Error ? e.message : String(e); }

  const missing: Array<{ index: string; name?: string }> = [];
  for (const p of list) {
    const index = validateProblemIndex(p.index);
    const b = blocks[index];
    const parsed = b ? parseProblemPage(b, contestId, index) : undefined;
    if (parsed && !parsed.error) result[index] = parsed; else missing.push({ index, name: p.name });
  }

  const blocked = lastError && /Cloudflare/.test(lastError);
  // Per-problem pages, 2 at a time with a pause to stay polite. Skip when Cloudflare already blocked us and no browser is available.
  for (let i = 0; i < missing.length; i += 2) {
    await Promise.all(missing.slice(i, i + 2).map(async ({ index, name }) => {
      if (blocked && !loader) { result[index] = stub(contestId, index, lastError, name); return; }
      try {
        const r = parseProblemPage(await getPage(f, `https://codeforces.com/contest/${contestId}/problem/${index}`, loader), contestId, index);
        result[index] = r.error ? { ...r, title: r.title || name } : r;
      } catch (e) {
        result[index] = stub(contestId, index, e instanceof Error ? e.message : String(e), name);
      }
    }));
    if (loader && i + 2 < missing.length) await new Promise((r) => setTimeout(r, 1000));
  }
  const ok = Object.values(result).some((r) => !r.error);
  if (ok) cache.set(contestId, { at: Date.now(), data: result });
  return result;
}
export function clearProblemCache() { cache.clear(); }
