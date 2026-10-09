/**
 * Nexel theme registry. A theme is a small set of design-token overrides (applied as CSS custom
 * properties on <html>) plus a matching Monaco colour set, so chrome, editor and terminal stay coherent.
 * All themes are dark by design: component CSS layers translucent white over --nx-bg-*.
 */
export interface NexelTheme {
  id: string;
  name: string;
  blurb: string;
  bg0: string; bg1: string; bg2: string; editorBg: string;
  accent: string; accent2: string;
  light?: boolean;
  /** Monaco syntax colours (hex without #) */
  syntax: { keyword: string; string: string; number: string; type: string; fn: string; comment: string; fg: string };
}

export const THEMES: NexelTheme[] = [
  { id: 'nexel', name: 'Nexel Emerald', blurb: 'The signature obsidian + emerald.',
    bg0: '#0B0B0D', bg1: '#111114', bg2: '#17171B', editorBg: '#050507', accent: '#34d399', accent2: '#22d3ee',
    syntax: { keyword: 'C5A3A3', string: 'B0C4DE', number: 'D3C1A5', type: 'A3C5B5', fn: 'D4C2AD', comment: '6D727C', fg: 'E2E3E5' } },
  { id: 'midnight', name: 'Midnight Indigo', blurb: 'Deep blue-black with electric violet.',
    bg0: '#0A0B14', bg1: '#10111E', bg2: '#171929', editorBg: '#060712', accent: '#818cf8', accent2: '#38bdf8',
    syntax: { keyword: 'B7A6F0', string: '9FD3C7', number: 'F2C18D', type: '7FB4F5', fn: 'E7D49A', comment: '616A8C', fg: 'DDE1F5' } },
  { id: 'ember', name: 'Ember', blurb: 'Warm charcoal with a molten amber glow.',
    bg0: '#0E0B0A', bg1: '#161110', bg2: '#1E1816', editorBg: '#090605', accent: '#fb923c', accent2: '#f43f5e',
    syntax: { keyword: 'F28B82', string: 'E6C99A', number: 'F6A86A', type: 'EAB77A', fn: 'F2D3A0', comment: '7A6A62', fg: 'EFE4DE' } },
  { id: 'sakura', name: 'Sakura Night', blurb: 'Plum shadows, soft rose highlights.',
    bg0: '#0D0A10', bg1: '#141019', bg2: '#1C1623', editorBg: '#08060B', accent: '#f472b6', accent2: '#c084fc',
    syntax: { keyword: 'F08FBF', string: 'C7B3F2', number: 'F5C2A0', type: 'B79CF5', fn: 'F3D5E5', comment: '71637D', fg: 'EBE3F0' } },
  { id: 'mono', name: 'Mono Contrast', blurb: 'Pure black and white, maximum legibility.',
    bg0: '#000000', bg1: '#090909', bg2: '#121212', editorBg: '#000000', accent: '#ffffff', accent2: '#a3a3a3',
    syntax: { keyword: 'FFFFFF', string: 'D4D4D4', number: 'BFBFBF', type: 'EDEDED', fn: 'F5F5F5', comment: '7A7A7A', fg: 'F5F5F5' } },
  { id: 'frost', name: 'Nord Frost', blurb: 'Cool slate with glacier-blue light.',
    bg0: '#0C1016', bg1: '#121821', bg2: '#19212D', editorBg: '#080B10', accent: '#7dd3fc', accent2: '#a5b4fc',
    syntax: { keyword: '88C0D0', string: 'A3BE8C', number: 'D8A9C4', type: '8FBCBB', fn: 'EBCB8B', comment: '5E6B7E', fg: 'DDE5F0' } },
  { id: 'forest', name: 'Deep Forest', blurb: 'Mossy near-black with lime sparks.',
    bg0: '#0A0F0C', bg1: '#101712', bg2: '#16201A', editorBg: '#060A07', accent: '#a3e635', accent2: '#2dd4bf',
    syntax: { keyword: 'B8D98A', string: 'E3D3A0', number: 'F0B98A', type: '8AD1B5', fn: 'D9E8B0', comment: '5F7064', fg: 'E1EBE3' } },
  { id: 'gold', name: 'Obsidian Gold', blurb: 'Black glass with a warm champagne-gold edge.',
    bg0: '#0C0B09', bg1: '#13110D', bg2: '#1B1812', editorBg: '#070605', accent: '#facc15', accent2: '#f59e0b',
    syntax: { keyword: 'E8C46A', string: 'C9D6A3', number: 'F0A77A', type: 'D9B98C', fn: 'F4E4B0', comment: '786F5C', fg: 'EDE7D8' } },
  { id: 'aurora', name: 'Aurora Teal', blurb: 'Deep ocean black with teal and magenta light.',
    bg0: '#080E10', bg1: '#0E161A', bg2: '#141F24', editorBg: '#050A0C', accent: '#2dd4bf', accent2: '#e879f9',
    syntax: { keyword: 'E49BF2', string: '9FE3D4', number: 'F5C38A', type: '7ADBE0', fn: 'D6F0E8', comment: '587178', fg: 'DCEBEE' } },
  { id: 'dusk', name: 'Solar Dusk', blurb: 'Violet twilight fading into coral sunset.',
    bg0: '#0D0A12', bg1: '#150F1B', bg2: '#1D1626', editorBg: '#08060C', accent: '#fb7185', accent2: '#a78bfa',
    syntax: { keyword: 'FB8FA0', string: 'F5C9A8', number: 'F9A87A', type: 'B9A3F5', fn: 'F3DDB8', comment: '6E6180', fg: 'ECE3F0' } },
  // Light: authored as a dark palette and optically inverted (see html[data-theme='light'] in index.css).
  { id: 'light', name: 'Paper Light', blurb: 'Warm paper white with dark ink and emerald accents.', light: true,
    bg0: '#f7f5ef', bg1: '#efece3', bg2: '#e6e2d6', editorBg: '#fdfcf8', accent: '#059669', accent2: '#0891b2',
    syntax: { keyword: 'A6264B', string: '0B6E4F', number: 'B45309', type: '1D4ED8', fn: '6D28D9', comment: '8A857A', fg: '1C1914' } },
];

export const DEFAULT_THEME_ID = 'nexel';
export const getTheme = (id: string): NexelTheme => THEMES.find(t => t.id === id) ?? THEMES[0];
export const monacoThemeName = (id: string) => `nexel-${getTheme(id).id}`;

/** '#34d399' -> '52 211 153' (space-separated so it works in rgb(var(--x) / a)). */
export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Writes a theme's tokens to <html>. A transient class lets colours glide instead of snapping. */
export function applyTheme(id: string, root: HTMLElement = document.documentElement, animate = true): NexelTheme {
  const t = getTheme(id);
  if (animate) {
    root.classList.add('nx-theme-switching');
    window.setTimeout(() => root.classList.remove('nx-theme-switching'), 450);
  }
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set('--nx-bg-0', t.bg0); set('--nx-bg-1', t.bg1); set('--nx-bg-2', t.bg2); set('--nx-editor-bg', t.editorBg);
  set('--nx-accent', t.accent); set('--nx-accent-2', t.accent2);
  set('--nx-accent-rgb', hexToRgbTriplet(t.accent)); set('--nx-accent2-rgb', hexToRgbTriplet(t.accent2));
  root.dataset.theme = t.id;
  return t;
}

/** Monaco theme data for a Nexel theme. */
export function monacoThemeData(t: NexelTheme) {
  const a = t.accent.replace('#', '');
  return {
    base: (t.light ? 'vs' : 'vs-dark') as 'vs' | 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: t.syntax.comment, fontStyle: 'italic' },
      { token: 'keyword', foreground: t.syntax.keyword, fontStyle: 'bold' },
      { token: 'string', foreground: t.syntax.string },
      { token: 'number', foreground: t.syntax.number },
      { token: 'regexp', foreground: t.syntax.string },
      { token: 'type', foreground: t.syntax.type, fontStyle: 'bold' },
      { token: 'class', foreground: t.syntax.fg, fontStyle: 'bold' },
      { token: 'function', foreground: t.syntax.fn },
      { token: 'variable', foreground: t.syntax.fg },
      { token: 'identifier', foreground: t.syntax.fg },
    ],
    colors: {
      'editor.background': t.editorBg,
      'editor.foreground': '#' + t.syntax.fg,
      'editor.lineHighlightBackground': t.bg1,
      'editorLineNumber.foreground': t.light ? '#b5b0a2' : '#303035',
      'editorLineNumber.activeForeground': t.light ? '#1C1914' : '#FFFFFF',
      'editor.selectionBackground': `#${a}33`,
      'editor.selectionHighlightBackground': `#${a}18`,
      'editorCursor.foreground': t.accent,
      'editorIndentGuide.activeBackground1': `#${a}55`,
      'editorWidget.background': t.bg1,
      'editorWidget.border': t.light ? '#d8d3c4' : '#202025',
    },
  };
}
