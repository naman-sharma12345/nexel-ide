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
  /** clangd IntelliSense for C/C++ (falls back to built-in providers when off or unavailable). */
  clangdEnabled: boolean;
  cppStd: CppStd;
  /** Extra compiler flags for the generated .clangd (validated again in the main process). */
  clangdFlags: string;
  settingsOpen: boolean;
  setTheme: (id: string) => void;
  setFontSize: (n: number) => void;
  setTabSize: (n: number) => void;
  toggle: (k: 'minimap' | 'ligatures' | 'wordWrap' | 'clangdEnabled') => void;
  setCppStd: (s: string) => void;
  setClangdFlags: (f: string) => void;
  openSettings: (open: boolean) => void;
  reset: () => void;
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
export const CPP_STDS = ['c++17', 'c++20', 'c++23'] as const;
export type CppStd = typeof CPP_STDS[number];
const DEFAULTS = { theme: DEFAULT_THEME_ID, fontSize: 13, minimap: false, ligatures: true, wordWrap: false, tabSize: 2, clangdEnabled: true, cppStd: 'c++17' as CppStd, clangdFlags: '' };
/** Normalises a flag string: single spaces, bounded length (main re-validates every flag). */
export const normaliseFlags = (f: string) => String(f ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);

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
      setCppStd: (v) => set((CPP_STDS as readonly string[]).includes(v) ? { cppStd: v as CppStd } : {}),
      setClangdFlags: (f) => set({ clangdFlags: normaliseFlags(f) }),
      openSettings: (open) => set({ settingsOpen: open }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'nexel-settings',
      storage: createJSONStorage(() => electronStorage),
      partialize: (s) => ({ theme: s.theme, fontSize: s.fontSize, minimap: s.minimap, ligatures: s.ligatures, wordWrap: s.wordWrap, tabSize: s.tabSize,
        clangdEnabled: s.clangdEnabled, cppStd: s.cppStd, clangdFlags: s.clangdFlags }),
      // Persisted data is untrusted: keep only valid clangd values.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p,
          clangdEnabled: typeof p.clangdEnabled === 'boolean' ? p.clangdEnabled : current.clangdEnabled,
          cppStd: (CPP_STDS as readonly string[]).includes(p.cppStd as string) ? (p.cppStd as CppStd) : current.cppStd,
          clangdFlags: typeof p.clangdFlags === 'string' ? normaliseFlags(p.clangdFlags) : current.clangdFlags };
      },
    }
  )
);
