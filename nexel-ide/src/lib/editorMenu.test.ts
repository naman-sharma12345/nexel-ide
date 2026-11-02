import { describe, expect, it, vi } from 'vitest';
import type { editor } from 'monaco-editor';
import { registerMenuEditor, runEditorMenuCommand } from './editorMenu';
import { useEditorStore } from '../stores/useEditorStore';
import { pathToUri } from './clangd/uri';

it('routes to focused document, not the last mounted split editor, and drops disposed editors', () => {
  const make = (path: string) => {
    let dispose = () => {};
    const instance = { getModel: () => ({ uri: { toString: () => pathToUri(path) } }), focus: vi.fn(), trigger: vi.fn(), onDidDispose: (cb: () => void) => { dispose = cb; return { dispose: vi.fn() }; } };
    registerMenuEditor(instance as unknown as editor.IStandaloneCodeEditor);
    return { instance, dispose: () => dispose() };
  };
  const left = make('/ws/left.txt'), right = make('/ws/right.txt');
  useEditorStore.setState({ activeTabPath: '/ws/left.txt', focusedTabPath: '/ws/left.txt' });
  expect(runEditorMenuCommand('undo')).toBe(true);
  expect(left.instance.trigger).toHaveBeenCalledWith('nexel-menu', 'undo', null);
  expect(right.instance.trigger).not.toHaveBeenCalled();
  useEditorStore.setState({ focusedTabPath: '/ws/right.txt' });
  expect(runEditorMenuCommand('redo')).toBe(true);
  expect(right.instance.trigger).toHaveBeenCalledWith('nexel-menu', 'redo', null);
  right.dispose();
  expect(runEditorMenuCommand('undo')).toBe(false);
  left.dispose();
});

describe('no source document', () => {
  it('does not dispatch to an unrelated editor', () => {
    useEditorStore.setState({ activeTabPath: null, focusedTabPath: null });
    expect(runEditorMenuCommand('undo')).toBe(false);
  });
});
