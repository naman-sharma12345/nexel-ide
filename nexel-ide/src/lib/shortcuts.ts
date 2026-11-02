export interface ShortcutItem { label: string; keys: string[]; cp?: boolean; }
export interface ShortcutGroup { title: string; items: ShortcutItem[]; }

/** Single source of truth for the cheat-sheet and the welcome screen. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  { title: 'Navigate', items: [
    { label: 'Quick open file', keys: ['Ctrl', 'P'] },
    { label: 'Next tab', keys: ['Ctrl', 'Tab'] },
    { label: 'Split editor right', keys: ['Ctrl', '\\'] },
    { label: 'Find in files', keys: ['Ctrl', 'Shift', 'F'] },
    { label: 'Palette', keys: ['Ctrl', 'Shift', 'P'] },
    { label: 'Settings', keys: ['Ctrl', ','] },
    { label: 'This sheet (outside editor)', keys: ['Ctrl', '/'] },
  ] },
  { title: 'Edit', items: [
    { label: 'Save file', keys: ['Ctrl', 'S'] },
    { label: 'Close tab', keys: ['Ctrl', 'W'] },
    { label: 'Find in file', keys: ['Ctrl', 'F'] },
    { label: 'Bigger editor font', keys: ['Ctrl', '='] },
    { label: 'Smaller editor font', keys: ['Ctrl', '-'] },
    { label: 'Reset editor font', keys: ['Ctrl', '0'] },
    { label: 'Toggle comment (in editor)', keys: ['Ctrl', '/'] },
  ] },
  { title: 'Workspace', items: [
    { label: 'Zen mode', keys: ['Ctrl', 'Alt', 'Z'] },
    { label: 'Toggle terminal', keys: ['Ctrl', '`'] },
    { label: 'Switch theme via palette', keys: ['Ctrl', 'Shift', 'P'] },
    { label: 'Import problem (Companion)', keys: ['Companion'], cp: true },
  ] },
];

/** Groups visible for the current plugin state: CP-only rows only when the CP plugin is on. */
export function shortcutGroupsFor(cpOn: boolean): ShortcutGroup[] {
  if (cpOn) return SHORTCUT_GROUPS;
  return SHORTCUT_GROUPS
    .map(g => ({ ...g, items: g.items.filter(it => !it.cp) }))
    .filter(g => g.items.length > 0);
}

/** Normalise a KeyboardEvent into the label used by SHORTCUT_GROUPS (for live keycap highlighting). */
export function keyLabel(e: KeyboardEvent): string {
  if (e.key === 'Control' || e.key === 'Meta') return 'Ctrl';
  if (e.key === 'Shift') return 'Shift';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}
