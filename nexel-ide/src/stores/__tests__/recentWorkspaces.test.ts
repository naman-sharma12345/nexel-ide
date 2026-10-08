import { describe, it, expect } from 'vitest';
import { pushRecent } from '../useWorkspaceStore';

describe('pushRecent (MRU)', () => {
  it('puts newest first, dedupes and caps', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['1', '2', '3', '4', '5'], '6')).toEqual(['6', '1', '2', '3', '4']);
  });
});
