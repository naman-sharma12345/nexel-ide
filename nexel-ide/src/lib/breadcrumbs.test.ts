import { describe, it, expect } from 'vitest';
import { toCrumbs } from './breadcrumbs';

describe('toCrumbs', () => {
  it('is relative to the workspace root, led by its folder name', () => {
    const c = toCrumbs('C:\\cp\\codeforces\\1950A.cpp', 'C:/cp');
    expect(c.map(x => x.label)).toEqual(['cp', 'codeforces', '1950A.cpp']);
    expect(c[2].isFile).toBe(true);
    expect(c[0].isFile).toBe(false);
  });
  it('falls back to the full path outside the workspace', () => {
    expect(toCrumbs('/tmp/a.cpp', '/home/u/ws').map(x => x.label)).toEqual(['tmp', 'a.cpp']);
  });
  it('does not treat a sibling with a shared prefix as inside the root', () => {
    expect(toCrumbs('/ws2/a.cpp', '/ws').map(x => x.label)).toEqual(['ws2', 'a.cpp']);
  });
  it('collapses very deep paths', () => {
    const c = toCrumbs('/r/a/b/c/d/e/f/g.cpp', '/r', 5);
    expect(c.length).toBe(5);
    expect(c[1].label).toBe('…');
    expect(c[4].label).toBe('g.cpp');
  });
});
