import { describe, it, expect } from 'vitest';
import { PYTHON_ITEMS, JAVA_ITEMS } from './langCompletions';
describe('langCompletions', () => {
  it('has unique labels', () => {
    for (const l of [PYTHON_ITEMS, JAVA_ITEMS]) expect(new Set(l.map(i => i.label)).size).toBe(l.length);
  });
});
