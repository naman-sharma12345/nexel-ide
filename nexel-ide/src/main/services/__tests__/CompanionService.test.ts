import { describe, it, expect } from 'vitest';
import { parseProblem, sanitizeFileStem, CompanionService } from '../CompanionService';

describe('Companion parsing', () => {
  it('sanitises file names', () => {
    expect(sanitizeFileStem('A. Two Sum / ../etc')).toBe('A._Two_Sum_..etc');
    expect(sanitizeFileStem('../../x')).toBe('x');
    expect(sanitizeFileStem('???')).toBe('problem');
  });
  it('rejects junk and keeps valid tests only', () => {
    expect(parseProblem(null)).toBeNull();
    expect(parseProblem({ name: 'x' })).toBeNull();
    const p = parseProblem({ name: 'B', url: 'javascript:alert(1)', tests: [{ input: '1', output: '2' }, { input: 3 }, null] });
    expect(p?.tests).toHaveLength(1);
    expect(p?.url).toBe('');
    expect(p?.timeLimit).toBe(2000);
  });
  it('listens on loopback, accepts valid POST and rejects GET', async () => {
    let got = '';
    const svc = new CompanionService(p => { got = p.name; });
    expect(await svc.start(27999)).toBe(true);
    const ok = await fetch('http://127.0.0.1:27999', { method: 'POST', body: JSON.stringify({ name: 'Hi', tests: [] }) });
    expect(ok.status).toBe(200); expect(got).toBe('Hi');
    expect((await fetch('http://127.0.0.1:27999')).status).toBe(405);
    expect((await fetch('http://127.0.0.1:27999', { method: 'POST', body: 'nope' })).status).toBe(400);
    svc.stop();
  });
});
