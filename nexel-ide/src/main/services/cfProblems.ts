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
    try { return await fn(); } catch (e) { err = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i)); }
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

/** Fetch every problem of a contest. Works for upcoming (after start), live and finished contests. */
export async function fetchContestProblems(contestIdRaw: unknown, f: Fetch = fetch as unknown as Fetch, ttlMs = 60_000): Promise<Record<string, CFProblemData>> {
  const contestId = validateContestId(contestIdRaw);
  const hit = cache.get(contestId);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;

  const st = await get(f, `https://codeforces.com/api/contest.standings?contestId=${contestId}&from=1&count=1`, true)
    .catch((e) => { throw new Error(`Could not load contest ${contestId}: ${e instanceof Error ? e.message : e}. Open it on Codeforces: https://codeforces.com/contest/${contestId}`); });
  if (st.status !== 'OK') throw new Error(`Codeforces: ${st.comment || 'contest unavailable'} (contest may not have started yet)`);
  const list: Array<{ index: string }> = st.result.problems ?? [];
  const result: Record<string, CFProblemData> = {};
  // limit concurrency to 3 to stay polite (rate limit)
  for (let i = 0; i < list.length; i += 3) {
    await Promise.all(list.slice(i, i + 3).map(async (p) => {
      const index = validateProblemIndex(p.index);
      try {
        result[index] = parseProblemPage(await get(f, `https://codeforces.com/contest/${contestId}/problem/${index}`, false), contestId, index);
      } catch (e) {
        result[index] = { index, url: `https://codeforces.com/contest/${contestId}/problem/${index}`, timeLimit: '', memoryLimit: '', error: e instanceof Error ? e.message : String(e) };
      }
    }));
  }
  cache.set(contestId, { at: Date.now(), data: result });
  return result;
}
export function clearProblemCache() { cache.clear(); }
