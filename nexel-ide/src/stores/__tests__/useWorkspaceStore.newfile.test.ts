import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../useWorkspaceStore';
import { useEditorStore } from '../useEditorStore';

describe('new file template behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useEditorStore.getState().setCppTemplate('// CP TEMPLATE');
    useWorkspaceStore.setState({
      rootPath: 'C:/ws', rootName: 'WS', tree: [],
      inlineInput: { visible: true, nodePath: 'C:/ws', mode: 'new-file', defaultValue: '' },
    });
  });

  it('writes the C++ template only into .cpp files, never other types', async () => {
    const writes: [string, string][] = [];
    vi.spyOn(window.nexelAPI, 'writeFileContent').mockImplementation(async (p: string, c: string) => { writes.push([p, c]); return true; });

    await useWorkspaceStore.getState().handleInlineSubmit('solve.cpp');
    expect(writes).toEqual([['C:/ws/solve.cpp', '// CP TEMPLATE']]);

    writes.length = 0;
    useWorkspaceStore.setState({ inlineInput: { visible: true, nodePath: 'C:/ws', mode: 'new-file', defaultValue: '' } });
    await useWorkspaceStore.getState().handleInlineSubmit('script.py');
    expect(writes).toEqual([]); // no C++ template in a Python file
  });

  it('writes nothing when no template is set', async () => {
    useEditorStore.getState().setCppTemplate('');
    const writes: [string, string][] = [];
    vi.spyOn(window.nexelAPI, 'writeFileContent').mockImplementation(async (p: string, c: string) => { writes.push([p, c]); return true; });
    await useWorkspaceStore.getState().handleInlineSubmit('a.cpp');
    expect(writes).toEqual([]);
  });
});
