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

describe('toCrumbs paths', () => {
  it('maps each segment to its absolute path (windows)', () => {
    const c = toCrumbs('C:\\cp\\codeforces\\1950A.cpp', 'C:/cp');
    expect(c.map(x => x.path)).toEqual(['C:/cp', 'C:/cp/codeforces', 'C:/cp/codeforces/1950A.cpp']);
  });
  it('maps each segment to its absolute path (posix)', () => {
    const c = toCrumbs('/home/u/ws/src/main.py', '/home/u/ws');
    expect(c.map(x => x.path)).toEqual(['/home/u/ws', '/home/u/ws/src', '/home/u/ws/src/main.py']);
  });
  it('builds absolute paths outside the workspace too', () => {
    const c = toCrumbs('/tmp/a.cpp', '/home/u/ws');
    expect(c.map(x => x.path)).toEqual(['/tmp', '/tmp/a.cpp']);
  });
  it('ellipsis crumb has no path', () => {
    const c = toCrumbs('/r/a/b/c/d/e/f/g.cpp', '/r', 5);
    expect(c[1].path).toBeNull();
    expect(c[2].path).toBe('/r/a/b/c/d/e');
  });
});
