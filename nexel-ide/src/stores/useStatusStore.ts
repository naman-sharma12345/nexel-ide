import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; message: string; }

interface StatusState {
  line: number;
  col: number;
  selected: number;
  toasts: Toast[];
  setCursor: (line: number, col: number, selected?: number) => void;
  pushToast: (message: string, kind?: ToastKind, ttlMs?: number) => number;
  dismissToast: (id: number) => void;
}

let nextId = 1;
const MAX_TOASTS = 4; // bounded queue: never let a burst of events flood the screen

export const useStatusStore = create<StatusState>()((set, get) => ({
  line: 1,
  col: 1,
  selected: 0,
  toasts: [],
  setCursor: (line, col, selected = 0) => {
    const s = get();
    if (s.line === line && s.col === col && s.selected === selected) return; // skip no-op renders
    set({ line, col, selected });
  },
  pushToast: (message, kind = 'info', ttlMs = 2600) => {
    const id = nextId++;
    set(s => ({ toasts: [...s.toasts.filter(t => t.message !== message).slice(-(MAX_TOASTS - 1)), { id, kind, message }] }));
    if (ttlMs > 0) setTimeout(() => get().dismissToast(id), ttlMs);
    return id;
  },
  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
