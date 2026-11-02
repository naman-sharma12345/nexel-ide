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
  instance.trigger('nexel-menu', command, null);
  return true;
}
