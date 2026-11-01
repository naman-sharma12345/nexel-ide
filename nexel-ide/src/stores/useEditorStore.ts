import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { electronStorage } from './electronStorage';

export interface EditorTab {
  filePath: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabPath: string | null;
  focusedTabPath: string | null;
  isSplit: boolean;
  rightTabPath: string | null;
  splitRatio: number;
  autoSave: boolean;
  cppTemplate: string;
  enableSnippets: boolean;
  acCelebration: boolean;
  
  openFile: (filePath: string, name: string, content: string) => void;
  closeTab: (filePath: string) => void;
  moveTab: (from: string, to: string) => void;
  updateTabContent: (filePath: string, content: string) => void;
  toggleSplit: (filePath: string) => void;
  setFocusedTabPath: (path: string | null) => void;
  setCppTemplate: (template: string) => void;
  setEnableSnippets: (enable: boolean) => void;
  setAutoSave: (autoSave: boolean) => void;
  setSplitRatio: (ratio: number) => void;
  triggerAcCelebration: () => void;
  openCfProblem: (contestId: number, problem: { index: string } & Record<string, unknown>) => void;
  openSnippets: () => void;
  closeAllTabs: () => void;
  closeSavedTabs: () => void;
  saveTabSuccess: (filePath: string) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabPath: null,
      focusedTabPath: null,
      isSplit: false,
      rightTabPath: null,
      splitRatio: 50,
      autoSave: false,
      cppTemplate: '',
      enableSnippets: true,
      acCelebration: false,

      openFile: (filePath, name, content) => {
        const { tabs } = get();
        const existingTab = tabs.find((t) => t.filePath === filePath);
        if (existingTab) {
          set({ activeTabPath: filePath, focusedTabPath: filePath });
          return;
        }
        const newTab: EditorTab = {
          filePath,
          name,
          content,
          originalContent: content,
          isDirty: false,
        };
        set({
          tabs: [...tabs, newTab],
          activeTabPath: filePath,
          focusedTabPath: filePath,
        });
      },

      moveTab: (from, to) => {
        const { tabs } = get();
        const a = tabs.findIndex((t) => t.filePath === from);
        const b = tabs.findIndex((t) => t.filePath === to);
        if (a < 0 || b < 0 || a === b) return;
        const next = tabs.slice();
        const [m] = next.splice(a, 1);
        next.splice(b, 0, m);
        set({ tabs: next });
      },
      closeTab: (filePath) => {
        const { tabs, activeTabPath, rightTabPath } = get();
        let nextIsSplit = get().isSplit;
        let nextRightTabPath = rightTabPath;

        if (rightTabPath === filePath) {
          nextIsSplit = false;
          nextRightTabPath = null;
        }

        const remainingTabs = tabs.filter((t) => t.filePath !== filePath);
        let nextActiveTabPath = activeTabPath;

        if (activeTabPath === filePath) {
          if (remainingTabs.length > 0) {
            nextActiveTabPath = remainingTabs[remainingTabs.length - 1].filePath;
          } else {
            nextActiveTabPath = null;
          }
        }

        set({
          tabs: remainingTabs,
          activeTabPath: nextActiveTabPath,
          focusedTabPath: nextActiveTabPath,
          isSplit: nextIsSplit,
          rightTabPath: nextRightTabPath,
        });
      },

      updateTabContent: (filePath, content) => {
        const { tabs } = get();
        set({
          tabs: tabs.map((t) =>
            t.filePath === filePath
              ? { ...t, content, isDirty: content !== t.originalContent }
              : t
          ),
        });
      },

      toggleSplit: (filePath) => {
        const { isSplit, rightTabPath, tabs, activeTabPath } = get();
        if (isSplit && rightTabPath === filePath) {
          set({ isSplit: false, rightTabPath: null, focusedTabPath: activeTabPath });
        } else {
          let nextActiveTabPath = activeTabPath;
          if (activeTabPath === filePath) {
            const otherTab = tabs.find((t) => t.filePath !== filePath);
            if (otherTab) {
              nextActiveTabPath = otherTab.filePath;
            }
          }
          set({ isSplit: true, rightTabPath: filePath, activeTabPath: nextActiveTabPath, focusedTabPath: filePath });
        }
      },

      setFocusedTabPath: (path) => set({ focusedTabPath: path }),

      setCppTemplate: (template) => set({ cppTemplate: template }),
      
      setEnableSnippets: (enable) => set({ enableSnippets: enable }),

      setAutoSave: (autoSave) => set({ autoSave }),

      setSplitRatio: (splitRatio) => set({ splitRatio }),

      triggerAcCelebration: () => {
        set({ acCelebration: true });
        setTimeout(() => set({ acCelebration: false }), 1500);
      },

      openCfProblem: (contestId, problem) => {
        const { tabs } = get();
        const tabPath = `cf://${contestId}/${problem.index}`;
        const tabName = `CF ${contestId}${problem.index}`;
        const existingTab = tabs.find((t) => t.filePath === tabPath);
        if (existingTab) {
          set({ activeTabPath: tabPath, focusedTabPath: tabPath });
          return;
        }
        const newTab: EditorTab = {
          filePath: tabPath,
          name: tabName,
          content: JSON.stringify(problem),
          originalContent: JSON.stringify(problem),
          isDirty: false,
        };
        set({
          tabs: [...tabs, newTab],
          activeTabPath: tabPath,
          focusedTabPath: tabPath,
        });
      },

      openSnippets: () => {
        const { tabs } = get();
        const existingTab = tabs.find((t) => t.filePath === 'nexel://snippets');
        if (existingTab) {
          set({ activeTabPath: 'nexel://snippets', focusedTabPath: 'nexel://snippets' });
          return;
        }
        const newTab: EditorTab = {
          filePath: 'nexel://snippets',
          name: 'Code Snippets',
          content: '',
          originalContent: '',
          isDirty: false,
        };
        set({
          tabs: [...tabs, newTab],
          activeTabPath: 'nexel://snippets',
          focusedTabPath: 'nexel://snippets',
        });
      },

      closeAllTabs: () => {
        set({
          tabs: [],
          activeTabPath: null,
          focusedTabPath: null,
          isSplit: false,
          rightTabPath: null,
        });
      },

      closeSavedTabs: () => {
        const { tabs, rightTabPath, activeTabPath } = get();
        const remaining = tabs.filter((t) => t.isDirty);
        
        let nextIsSplit = get().isSplit;
        let nextRightTabPath = rightTabPath;
        if (rightTabPath && !remaining.some((t) => t.filePath === rightTabPath)) {
          nextIsSplit = false;
          nextRightTabPath = null;
        }

        let nextActiveTabPath = activeTabPath;
        if (remaining.length > 0) {
          if (!remaining.some((t) => t.filePath === activeTabPath)) {
            nextActiveTabPath = remaining[remaining.length - 1].filePath;
          }
        } else {
          nextActiveTabPath = null;
        }

        set({
          tabs: remaining,
          activeTabPath: nextActiveTabPath,
          focusedTabPath: nextActiveTabPath,
          isSplit: nextIsSplit,
          rightTabPath: nextRightTabPath,
        });
      },

      saveTabSuccess: (filePath) => {
        const { tabs } = get();
        set({
          tabs: tabs.map((t) =>
            t.filePath === filePath
              ? { ...t, originalContent: t.content, isDirty: false }
              : t
          ),
        });
      }
    }),
    {
      name: 'nexel-editor-store',
      storage: createJSONStorage(() => electronStorage),
      // We don't want to persist the editor tabs since their content is loaded dynamically,
      // but we do want to persist settings like autoSave, cppTemplate, and enableSnippets.
      partialize: (state) => ({
        autoSave: state.autoSave,
        cppTemplate: state.cppTemplate,
        enableSnippets: state.enableSnippets,
      }),
    }
  )
);
