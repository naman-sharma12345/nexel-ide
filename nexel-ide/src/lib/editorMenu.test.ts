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

describe('explicit text clipboard actions', () => {
  function setup(readOnly = false) {
    let dispose = () => {};
    const range = { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 5, isEmpty: () => false };
    const instance = {
      getModel: () => ({ uri: { toString: () => pathToUri('/ws/clip.txt') }, getValueInRange: () => 'abc' }),
      getSelection: () => range, getRawOptions: () => ({ readOnly }), focus: vi.fn(), trigger: vi.fn(),
      pushUndoStop: vi.fn(), executeEdits: vi.fn(() => true),
      onDidDispose: (cb: () => void) => { dispose = cb; return { dispose: vi.fn() }; },
    };
    registerMenuEditor(instance as unknown as editor.IStandaloneCodeEditor);
    useEditorStore.setState({ activeTabPath: '/ws/clip.txt', focusedTabPath: '/ws/clip.txt' });
    return { instance, dispose: () => dispose() };
  }
  it('writes selection before Cut and creates one isolated undo step', () => {
    const f = setup(); const write = vi.fn(); window.nexelAPI.writeClipboardText = write;
    expect(write).not.toHaveBeenCalled();
    expect(runEditorMenuCommand('editor.action.clipboardCutAction')).toBe(true);
    expect(write).toHaveBeenCalledWith('abc');
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(f.instance.executeEdits.mock.invocationCallOrder[0]);
    expect(f.instance.pushUndoStop).toHaveBeenCalledTimes(2);
    f.dispose();
  });
  it('failed clipboard write never deletes selected text', () => {
    const f = setup(); window.nexelAPI.writeClipboardText = () => { throw new Error('denied'); };
    expect(runEditorMenuCommand('editor.action.clipboardCutAction')).toBe(false);
    expect(f.instance.executeEdits).not.toHaveBeenCalled(); f.dispose();
  });
  it('failed Paste read leaves text unchanged; successful Paste has undo boundaries', () => {
    const f = setup(); window.nexelAPI.readClipboardText = () => { throw new Error('denied'); };
    expect(runEditorMenuCommand('editor.action.clipboardPasteAction')).toBe(false);
    expect(f.instance.executeEdits).not.toHaveBeenCalled();
    window.nexelAPI.readClipboardText = () => 'pasted';
    expect(runEditorMenuCommand('editor.action.clipboardPasteAction')).toBe(true);
    expect(f.instance.executeEdits).toHaveBeenCalledWith('nexel-menu-paste', [expect.objectContaining({ text: 'pasted' })]);
    expect(f.instance.pushUndoStop).toHaveBeenCalledTimes(2); f.dispose();
  });
  it('dispatches clipboard writes only for the focused split document', () => {
    const clip = setup();
    let dispose = () => {};
    const other = {
      getModel: () => ({ uri: { toString: () => pathToUri('/ws/right-clip.txt') }, getValueInRange: () => 'right selection' }),
      getSelection: () => ({ startLineNumber: 1, isEmpty: () => false }),
      getRawOptions: () => ({}), focus: vi.fn(), trigger: vi.fn(),
      onDidDispose: (cb: () => void) => { dispose = cb; return { dispose: vi.fn() }; },
    };
    registerMenuEditor(other as unknown as editor.IStandaloneCodeEditor);
    const write = vi.fn(); window.nexelAPI.writeClipboardText = write;
    useEditorStore.setState({ activeTabPath: '/ws/clip.txt', focusedTabPath: '/ws/right-clip.txt' });
    expect(runEditorMenuCommand('editor.action.clipboardCopyAction')).toBe(true);
    expect(write).toHaveBeenLastCalledWith('right selection');
    useEditorStore.setState({ focusedTabPath: '/ws/clip.txt' });
    expect(runEditorMenuCommand('editor.action.clipboardCopyAction')).toBe(true);
    expect(write).toHaveBeenLastCalledWith('abc');
    clip.dispose(); dispose();
  });
  it('an editor rejecting Paste is reported as unsuccessful', () => {
    const f = setup(); window.nexelAPI.readClipboardText = () => 'paste';
    f.instance.executeEdits.mockReturnValue(false);
    expect(runEditorMenuCommand('editor.action.clipboardPasteAction')).toBe(false);
    f.dispose();
  });
  it('read-only Cut/Paste do not access clipboard or mutate text; Copy is allowed', () => {
    const f = setup(true); const write = vi.fn(), read = vi.fn(() => 'text');
    window.nexelAPI.writeClipboardText = write; window.nexelAPI.readClipboardText = read;
    expect(runEditorMenuCommand('editor.action.clipboardCutAction')).toBe(false);
    expect(runEditorMenuCommand('editor.action.clipboardPasteAction')).toBe(false);
    expect(write).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    expect(f.instance.executeEdits).not.toHaveBeenCalled();
    expect(runEditorMenuCommand('editor.action.clipboardCopyAction')).toBe(true);
    expect(write).toHaveBeenCalledWith('abc'); f.dispose();
  });
});
