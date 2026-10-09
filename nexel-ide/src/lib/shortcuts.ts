export interface ShortcutGroup { title: string; items: Array<{ label: string; keys: string[] }>; }

/** Single source of truth for the cheat-sheet and the welcome screen. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  { title: 'Navigate', items: [
    { label: 'Quick open file', keys: ['Ctrl', 'P'] },
    { label: 'Find in files', keys: ['Ctrl', 'Shift', 'F'] },
    { label: 'Palette', keys: ['Ctrl', 'Shift', 'P'] },
    { label: 'Settings', keys: ['Ctrl', ','] },
    { label: 'Shortcuts', keys: ['Ctrl', '/'] },
  ] },
  { title: 'Edit', items: [
    { label: 'Save file', keys: ['Ctrl', 'S'] },
    { label: 'Close tab', keys: ['Ctrl', 'W'] },
    { label: 'Find in file', keys: ['Ctrl', 'F'] },
    { label: 'Toggle comment', keys: ['Ctrl', '/'] },
  ] },
  { title: 'Workspace', items: [
    { label: 'Toggle terminal', keys: ['Ctrl', '`'] },
    { label: 'Switch theme', keys: ['Ctrl', 'Shift', 'P'] },
    { label: 'Import problem', keys: ['Companion'] },
  ] },
];

/** Normalise a KeyboardEvent into the label used by SHORTCUT_GROUPS (for live keycap highlighting). */
export function keyLabel(e: KeyboardEvent): string {
  if (e.key === 'Control' || e.key === 'Meta') return 'Ctrl';
  if (e.key === 'Shift') return 'Shift';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}
