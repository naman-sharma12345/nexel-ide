import { describe, it, expect } from 'vitest';
import { fuzzyScore } from '../CommandPalette';
describe('fuzzyScore', () => {
  it('matches subsequences', () => { expect(fuzzyScore('gj', 'Go to Judge')).toBeGreaterThanOrEqual(0); });
  it('rejects non-matches', () => { expect(fuzzyScore('xyz', 'Go to Judge')).toBe(-1); });
  it('prefers tighter matches', () => { expect(fuzzyScore('jud', 'Judge')).toBeLessThan(fuzzyScore('jud', 'Go to Judge')); });
});
