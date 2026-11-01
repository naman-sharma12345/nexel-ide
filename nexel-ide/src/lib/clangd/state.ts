import { create } from 'zustand';

/**
 * User-facing clangd state for the status chip.
 *  disabled  - turned off in Settings (offline IntelliSense only)
 *  off       - no workspace folder open yet / not running
 *  starting  - process spawned, initialize in flight
 *  indexing  - ready, but clangd is parsing/building the AST or background-indexing
 *  ready     - serving requests
 *  fallback  - clangd not available on this machine; built-in providers serve C++
 *  error     - clangd crashed repeatedly or failed to initialize; built-in providers serve C++
 */
export type ClangdUiStatus = 'disabled' | 'off' | 'starting' | 'indexing' | 'ready' | 'fallback' | 'error';

interface LspState {
  status: ClangdUiStatus;
  detail: string;          // one line for the tooltip ("clangd 19.1.2 · bundled · g++")
  version: string | null;
  source: string | null;
  progress: number | null; // background-index percentage, when reported
  setStatus: (status: ClangdUiStatus, detail?: string) => void;
  patch: (p: Partial<Pick<LspState, 'version' | 'source' | 'progress' | 'detail'>>) => void;
}

export const useLspStore = create<LspState>()((set) => ({
  status: 'off', detail: 'Open a folder to start clangd', version: null, source: null, progress: null,
  setStatus: (status, detail) => set((s) => (s.status === status && (detail === undefined || s.detail === detail) ? s : { status, ...(detail !== undefined ? { detail } : {}) })),
  patch: (p) => set(p),
}));

/** True while clangd is answering requests: offline providers then step back to avoid duplicate items. */
export function isClangdActive() {
  const s = useLspStore.getState().status;
  return s === 'ready' || s === 'indexing';
}

export const STATUS_LABEL: Record<ClangdUiStatus, string> = {
  disabled: 'off', off: 'idle', starting: 'starting', indexing: 'indexing', ready: 'ready', fallback: 'fallback', error: 'error',
};

export const STATUS_HINT: Record<ClangdUiStatus, string> = {
  disabled: 'clangd is turned off in Settings. Built-in C++ completions, hovers and snippets are active.',
  off: 'Open a workspace folder to start clangd.',
  starting: 'Starting clangd…',
  indexing: 'clangd is parsing your file. Results get richer as it finishes.',
  ready: 'clangd is running: completions, hovers, diagnostics, go-to-definition, rename and formatting.',
  fallback: 'clangd was not found. Using built-in completions. Packaged builds include it; in dev run "npm run fetch:clangd" or put clangd on PATH.',
  error: 'clangd stopped responding. Using built-in completions until it is restarted.',
};
