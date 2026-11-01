import { describe, it, expect } from 'vitest';
import { templateFor } from './cpTemplates';
describe('cpTemplates', () => {
  it('returns fast-io cpp', () => { expect(templateFor('CPP')).toContain('sync_with_stdio'); });
  it('empty for unknown', () => { expect(templateFor('xyz')).toBe(''); });
});
