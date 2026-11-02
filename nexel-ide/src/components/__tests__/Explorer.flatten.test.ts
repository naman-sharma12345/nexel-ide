import { describe, it, expect } from 'vitest';
import { flattenVisibleNodes } from '../Explorer';
import type { FileNode } from '../../stores/useWorkspaceStore';

const tree: FileNode[] = [
  {
    name: 'src', path: '/w/src', type: 'folder', isOpen: true,
    children: [
      { name: 'main.py', path: '/w/src/main.py', type: 'file' },
      { name: 'main.cpp', path: '/w/src/main.cpp', type: 'file' },
    ],
  },
  { name: 'README.md', path: '/w/README.md', type: 'file' },
];

describe('flattenVisibleNodes', () => {
  it('lists open folder children in render order with parents', () => {
    const flat = flattenVisibleNodes(tree);
    expect(flat.map(f => f.node.path)).toEqual(['/w/src', '/w/src/main.py', '/w/src/main.cpp', '/w/README.md']);
    expect(flat[1].parent?.path).toBe('/w/src');
    expect(flat[3].parent).toBeNull();
  });
  it('hides children of closed folders', () => {
    const closed: FileNode[] = [{ ...tree[0], isOpen: false }, tree[1]];
    expect(flattenVisibleNodes(closed).map(f => f.node.path)).toEqual(['/w/src', '/w/README.md']);
  });
  it('handles nested folders', () => {
    const nested: FileNode[] = [{
      name: 'a', path: '/a', type: 'folder', isOpen: true,
      children: [{ name: 'b', path: '/a/b', type: 'folder', isOpen: true, children: [{ name: 'c.txt', path: '/a/b/c.txt', type: 'file' }] }],
    }];
    expect(flattenVisibleNodes(nested).map(f => f.node.path)).toEqual(['/a', '/a/b', '/a/b/c.txt']);
  });
});
