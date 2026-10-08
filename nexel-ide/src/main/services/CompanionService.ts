import * as http from 'http';

/**
 * Competitive Companion receiver.
 * The browser extension POSTs a JSON "problem" payload to http://127.0.0.1:27121.
 * Hardening: loopback-only bind, POST only, content-length cap (1 MB, enforced while streaming),
 * strict schema validation, filename sanitisation, bounded test count, request timeout.
 */
export const COMPANION_PORT = 27121;
export const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TESTS = 100;
const MAX_TEST_CHARS = 200_000;

export interface CompanionProblem {
  name: string;
  group: string;
  url: string;
  timeLimit: number;
  memoryLimit: number;
  tests: Array<{ input: string; output: string }>;
  fileName: string;
}

/** Turn arbitrary text into a safe cross-platform file stem (no separators, no reserved chars). */
export function sanitizeFileStem(raw: string): string {
  const s = String(raw)
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 64);
  return s || 'problem';
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : def);

/** Validate an untrusted payload. Returns null when it is not a usable problem. */
export function parseProblem(data: unknown): CompanionProblem | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const name = str(d.name, 200).trim();
  if (!name || !Array.isArray(d.tests)) return null;
  const tests: CompanionProblem['tests'] = [];
  for (const t of d.tests.slice(0, MAX_TESTS)) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    if (typeof o.input !== 'string' || typeof o.output !== 'string') continue;
    tests.push({ input: o.input.slice(0, MAX_TEST_CHARS), output: o.output.slice(0, MAX_TEST_CHARS) });
  }
  const group = str(d.group, 200);
  const url = /^https?:\/\//i.test(str(d.url, 500)) ? str(d.url, 500) : '';
  return {
    name, group, url, tests,
    timeLimit: num(d.timeLimit, 2000),
    memoryLimit: num(d.memoryLimit, 256),
    fileName: sanitizeFileStem(name),
  };
}

export class CompanionService {
  private server: http.Server | null = null;
  constructor(private onProblem: (p: CompanionProblem) => void) {}

  start(port = COMPANION_PORT): Promise<boolean> {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => {
        const reply = (code: number, msg = '') => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(msg); };
        if (req.method !== 'POST') return reply(405);
        const declared = Number(req.headers['content-length'] ?? 0);
        if (declared > MAX_BODY_BYTES) return reply(413);
        let size = 0; const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY_BYTES) { reply(413); req.destroy(); return; }
          chunks.push(c);
        });
        req.on('end', () => {
          if (res.writableEnded) return;
          try {
            const p = parseProblem(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            if (!p) return reply(400, 'invalid problem');
            this.onProblem(p);
            reply(200, 'ok');
          } catch { reply(400, 'invalid json'); }
        });
      });
      server.requestTimeout = 5000;
      server.headersTimeout = 5000;
      server.on('error', () => resolve(false)); // port busy (another IDE/CP tool): degrade silently
      server.listen(port, '127.0.0.1', () => { this.server = server; resolve(true); });
    });
  }

  stop() { this.server?.close(); this.server = null; }
}
