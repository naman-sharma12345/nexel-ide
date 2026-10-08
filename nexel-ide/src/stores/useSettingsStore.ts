import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { electronStorage } from './electronStorage';
import { DEFAULT_THEME_ID, THEMES } from '../lib/themes';

export interface SettingsState {
  theme: string;
  fontSize: number;
  minimap: boolean;
  ligatures: boolean;
  wordWrap: boolean;
  tabSize: number;
  settingsOpen: boolean;
  setTheme: (id: string) => void;
  setFontSize: (n: number) => void;
  setTabSize: (n: number) => void;
  toggle: (k: 'minimap' | 'ligatures' | 'wordWrap') => void;
  openSettings: (open: boolean) => void;
  reset: () => void;
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
const DEFAULTS = { theme: DEFAULT_THEME_ID, fontSize: 13, minimap: false, ligatures: true, wordWrap: false, tabSize: 2 };

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      settingsOpen: false,
      // Validate everything that comes in: persisted/IPC data is untrusted.
      setTheme: (id) => set(THEMES.some(t => t.id === id) ? { theme: id } : {}),
      setFontSize: (n) => set({ fontSize: clamp(n, 10, 24) }),
      setTabSize: (n) => set({ tabSize: clamp(n, 1, 8) }),
      toggle: (k) => set((s) => ({ [k]: !s[k] } as Partial<SettingsState>)),
      openSettings: (open) => set({ settingsOpen: open }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'nexel-settings',
      storage: createJSONStorage(() => electronStorage),
      partialize: (s) => ({ theme: s.theme, fontSize: s.fontSize, minimap: s.minimap, ligatures: s.ligatures, wordWrap: s.wordWrap, tabSize: s.tabSize }),
    }
  )
);
