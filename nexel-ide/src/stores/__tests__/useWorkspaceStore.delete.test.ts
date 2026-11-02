import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../useWorkspaceStore';
import { useEditorStore } from '../useEditorStore';
import { useStatusStore } from '../useStatusStore';

const target = { name: 'folder', path: '/ws/folder', type: 'folder' as const };
describe('delete failure reconciliation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useWorkspaceStore.setState({ rootPath: '/ws', tree: [], pendingDelete: null });
    useEditorStore.setState({ tabs: [
      { filePath: '/ws/folder/gone.txt', content: 'gone buffer', originalContent: 'gone disk', name: 'gone.txt', isDirty: true },
      { filePath: '/ws/folder/stay.txt', content: 'stay buffer', originalContent: 'stay disk', name: 'stay.txt', isDirty: true },
    ] });
    useStatusStore.setState({ toasts: [] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window.nexelAPI, 'deleteNode').mockRejectedValue(new Error('EACCES: permission denied'));
    vi.spyOn(window.nexelAPI, 'readWorkspaceFiles').mockResolvedValue([]);
  });
  it('warns for dirty descendants and cancellation leaves buffers untouched', async () => {
    await useWorkspaceStore.getState().handleDeleteNode(target);
    expect(useWorkspaceStore.getState().pendingDelete?.dirtyNames).toEqual(['gone.txt', 'stay.txt']);
    useWorkspaceStore.getState().cancelDeleteNode();
    expect(window.nexelAPI.deleteNode).not.toHaveBeenCalled();
    expect(useEditorStore.getState().tabs.map(t => t.content)).toEqual(['gone buffer', 'stay buffer']);
  });
  it('marks only confirmed missing paths orphaned after partial deletion', async () => {
    vi.spyOn(window.nexelAPI, 'readFileContent').mockImplementation(async p => {
      if (p.endsWith('/gone.txt')) throw new Error('ENOENT: no such file');
      return 'on disk';
    });
    await useWorkspaceStore.getState().handleDeleteNode(target);
    await useWorkspaceStore.getState().confirmDeleteNode();
    const tabs = useEditorStore.getState().tabs;
    expect(tabs[0].isOrphaned).toBe(true);
    expect(tabs[1].isOrphaned).not.toBe(true);
    expect(tabs.map(t => t.content)).toEqual(['gone buffer', 'stay buffer']);
    expect(useStatusStore.getState().toasts.some(t => t.kind === 'error' && t.message.includes('Could not delete folder'))).toBe(true);
  });
  it('does not mistake read permission errors or a failed tree refresh for deletion', async () => {
    vi.spyOn(window.nexelAPI, 'readWorkspaceFiles').mockRejectedValue(new Error('EIO'));
    vi.spyOn(window.nexelAPI, 'readFileContent').mockRejectedValue(new Error('EACCES'));
    await useWorkspaceStore.getState().handleDeleteNode(target);
    await useWorkspaceStore.getState().confirmDeleteNode();
    expect(useEditorStore.getState().tabs.every(t => !t.isOrphaned && t.isDirty)).toBe(true);
  });
});
