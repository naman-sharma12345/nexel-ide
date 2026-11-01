import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../useWorkspaceStore';

const seedTree = () => [
  {
    name: 'src', path: '/ws/src', type: 'folder' as const, isOpen: false,
    children: [
      { name: 'main.py', path: '/ws/src/main.py', type: 'file' as const },
      {
        name: 'deep', path: '/ws/src/deep', type: 'folder' as const, isOpen: false,
        children: [{ name: 'x.py', path: '/ws/src/deep/x.py', type: 'file' as const }],
      },
    ],
  },
  { name: 'README.md', path: '/ws/README.md', type: 'file' as const },
];

describe('revealPath', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ tree: seedTree(), lastSelectedNode: null });
  });

  it('opens ancestor folders and selects a nested file', () => {
    useWorkspaceStore.getState().revealPath('/ws/src/deep/x.py');
    const { tree, lastSelectedNode } = useWorkspaceStore.getState();
    expect(tree[0].isOpen).toBe(true);
    expect(tree[0].children?.[1].isOpen).toBe(true);
    expect(lastSelectedNode?.path).toBe('/ws/src/deep/x.py');
    expect(tree[1].isOpen).toBeUndefined();
  });

  it('opens and selects a folder crumb target', () => {
    useWorkspaceStore.getState().revealPath('/ws/src');
    const { tree, lastSelectedNode } = useWorkspaceStore.getState();
    expect(tree[0].isOpen).toBe(true);
    expect(lastSelectedNode?.path).toBe('/ws/src');
  });

  it('tolerates windows separators', () => {
    useWorkspaceStore.getState().revealPath('\\ws\\src\\main.py');
    expect(useWorkspaceStore.getState().lastSelectedNode?.path).toBe('/ws/src/main.py');
  });

  it('does nothing for unknown paths', () => {
    useWorkspaceStore.getState().revealPath('/ws/nope/none.txt');
    const { tree, lastSelectedNode } = useWorkspaceStore.getState();
    expect(tree[0].isOpen).toBe(false);
    expect(lastSelectedNode).toBeNull();
  });
});
