import { describe, it, expect } from 'vitest';
import { useEditorStore } from '../useEditorStore';
describe('moveTab', () => {
  it('reorders tabs', () => {
    const s = useEditorStore.getState();
    s.openFile('/a', 'a', ''); s.openFile('/b', 'b', ''); s.openFile('/c', 'c', '');
    useEditorStore.getState().moveTab('/c', '/a');
    expect(useEditorStore.getState().tabs.map((t) => t.name)).toEqual(['c', 'a', 'b']);
  });
});
