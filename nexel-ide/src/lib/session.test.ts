import { describe, it, expect } from 'vitest';
import { sanitizeSession, saveSession, loadSession } from './session';

describe('session restore', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('round-trips and keeps the active tab', () => {
    const st = mem();
    saveSession({ root: 'C:/cp', paths: ['C:/cp/a.cpp', 'C:/cp/b.cpp'], active: 'C:/cp/b.cpp' }, st);
    expect(loadSession('C:\\cp', st)).toEqual({ root: 'C:\\cp', paths: ['C:/cp/a.cpp', 'C:/cp/b.cpp'], active: 'C:/cp/b.cpp' });
  });
  it('rejects other workspaces, traversal, outside paths and junk', () => {
    expect(sanitizeSession({ root: '/x', paths: ['/x/a'] }, '/y')).toBeNull();
    const s = sanitizeSession({ root: '/w', paths: ['/w/a.cpp', '/etc/passwd', '/w/../etc/x', 42, '/w/a.cpp'], active: '/etc/passwd' }, '/w');
    expect(s?.paths).toEqual(['/w/a.cpp']);
    expect(s?.active).toBe('/w/a.cpp');
    expect(sanitizeSession('x', '/w')).toBeNull();
  });
  it('caps the number of tabs', () => {
    const paths = Array.from({ length: 100 }, (_, i) => `/w/f${i}.cpp`);
    expect(sanitizeSession({ root: '/w', paths, active: null }, '/w')?.paths.length).toBe(24);
  });
});
