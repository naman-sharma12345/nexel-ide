import { describe, it, expect } from 'vitest';
import { hoverFor } from './hoverDocs';
describe('hoverFor', () => {
  it('knows STL calls', () => { expect(hoverFor('cpp', 'lower_bound')?.cx).toBe('O(log n)'); });
  it('knows python helpers', () => { expect(hoverFor('python', 'heappush')).toBeTruthy(); });
  it('ignores unknown and prototype keys', () => { expect(hoverFor('cpp', 'toString')).toBeUndefined(); expect(hoverFor('java', 'sort')).toBeUndefined(); });
});
