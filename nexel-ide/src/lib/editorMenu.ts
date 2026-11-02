import type { editor } from 'monaco-editor';
import { useEditorStore } from '../stores/useEditorStore';
import { pathToUri } from './clangd/uri';

const editors = new Set<editor.IStandaloneCodeEditor>();

export function registerMenuEditor(instance: editor.IStandaloneCodeEditor) {
  editors.add(instance);
  const subscription = instance.onDidDispose(() => { editors.delete(instance); subscription.dispose(); });
}

/** Resolve by focused document, not by whichever split pane mounted last. */
export function runEditorMenuCommand(command: string): boolean {
  const { focusedTabPath, activeTabPath } = useEditorStore.getState();
  const path = focusedTabPath ?? activeTabPath;
  if (!path) return false;
  const uri = pathToUri(path);
  const instance = [...editors].find(e => e.getModel()?.uri.toString() === uri);
  if (!instance) return false;
  instance.focus();
  try {
    if (command.startsWith('editor.action.clipboard')) {
      if (!command.endsWith('CopyAction') && instance.getRawOptions().readOnly) return false;
      const model = instance.getModel();
      const selection = instance.getSelection();
      if (!model || !selection) return false;
      if (command.endsWith('PasteAction')) {
        const read = window.nexelAPI.readClipboardText;
        if (!read) return false;
        const text = read();
        if (text) {
          instance.pushUndoStop();
          const applied = instance.executeEdits('nexel-menu-paste', [{ range: selection, text, forceMoveMarkers: true }]);
          instance.pushUndoStop();
          if (!applied) return false;
        }
      } else {
        const write = window.nexelAPI.writeClipboardText;
        if (!write) return false;
        const line = selection.startLineNumber;
        const range = selection.isEmpty()
          ? { startLineNumber: line, startColumn: 1, endLineNumber: line < model.getLineCount() ? line + 1 : line, endColumn: line < model.getLineCount() ? 1 : model.getLineMaxColumn(line) }
          : selection;
        write(model.getValueInRange(range));
        if (command.endsWith('CutAction')) {
          instance.pushUndoStop();
          const applied = instance.executeEdits('nexel-menu-cut', [{ range, text: '', forceMoveMarkers: true }]);
          instance.pushUndoStop();
          if (!applied) return false;
        }
      }
    } else instance.trigger('nexel-menu', command, null);
    return true;
  } catch { return false; }
}
