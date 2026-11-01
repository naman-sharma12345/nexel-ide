import { describe, it, expect } from 'vitest';
import { explorerRowState } from '../Explorer';

describe('explorerRowState', () => {
  it('never marks two rows active: the open file wins over the clicked node', () => {
    expect(explorerRowState('/ws/a.cpp', '/ws/b.md', '/ws/a.cpp')).toBe('active');
    expect(explorerRowState('/ws/a.cpp', '/ws/b.md', '/ws/b.md')).toBe('selected');
    expect(explorerRowState('/ws/a.cpp', '/ws/b.md', '/ws/c.txt')).toBe('none');
  });
  it('a row that is both clicked and open is active only', () => {
    expect(explorerRowState('/ws/a.cpp', '/ws/a.cpp', '/ws/a.cpp')).toBe('active');
  });
  it('handles empty states', () => {
    expect(explorerRowState(null, null, '/ws/a.cpp')).toBe('none');
    expect(explorerRowState(undefined, null, '/ws/a.cpp')).toBe('none');
    expect(explorerRowState(null, '/ws/a.cpp', '/ws/a.cpp')).toBe('selected');
  });
});
