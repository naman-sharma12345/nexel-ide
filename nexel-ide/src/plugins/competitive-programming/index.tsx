import React, { lazy, useEffect } from 'react';
import { registerPlugin } from '../registry';
import { useJudgeStore } from '../../stores/useJudgeStore';
import { useWorkspaceStore, type FileNode } from '../../stores/useWorkspaceStore';
import { useEditorStore } from '../../stores/useEditorStore';
import { useStatusStore } from '../../stores/useStatusStore';

/** Panels are lazy-loaded here so the shell never imports CP modules. */
const JudgeSystem = lazy(() => import('../../components/JudgeSystem'));
const ContestsSystem = lazy(() => import('../../components/ContestsSystem'));

/**
 * Competitive Companion: browser extension -> new solution file + judge samples.
 * Attached only while the plugin is enabled; no listener exists when disabled.
 */
function useCompanionImport(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    window.nexelAPI.onCompanionProblem?.(async (p) => {
      const ws = useWorkspaceStore.getState();
      const dir = ws.activeDir ?? ws.rootPath;
      const toast = useStatusStore.getState().pushToast;
      if (!dir) { toast('Open a workspace folder first, then re-send the problem', 'error', 4000); return; }
      try {
        const taken = new Set((function walk(ns: FileNode[]): string[] { return ns.flatMap(n => [n.name, ...walk(n.children ?? [])]); })(ws.tree));
        let name = `${p.fileName}.cpp`, i = 2;
        while (taken.has(name)) name = `${p.fileName}_${i++}.cpp`; // never overwrite an existing solution
        const filePath = await window.nexelAPI.createFile(dir, name);
        const body = useEditorStore.getState().cppTemplate;
        if (body) await window.nexelAPI.writeFileContent(filePath, body);
        await ws.refreshTree();
        useEditorStore.getState().openFile(filePath, name, body);
        useJudgeStore.getState().importSamples(p.tests);
        toast(`Imported ${p.name} · ${p.tests.length} sample${p.tests.length === 1 ? '' : 's'}`, 'success', 4000);
      } catch (e) { console.error(e); toast('Could not import problem from Competitive Companion', 'error', 4000); }
    });
  }, [enabled]);
}

/**
 * Competitive Programming: judge with sample tests, stress testing, Codeforces contests
 * and Competitive Companion import. Opt-in: Nexel is a general-purpose IDE by default;
 * enabling this adds the CP dock sections, palette commands and the companion listener.
 * No data is deleted when disabled - test cases and settings are kept for re-enabling.
 */
registerPlugin({
  id: 'competitive-programming',
  name: 'Competitive Programming',
  blurb: 'Judge with sample tests, stress testing, Codeforces contests and Competitive Companion import',
  sections: ['judge', 'contests'],
  commandIds: ['judge', 'contests'],
  defaultEnabled: false,
  panels: { judge: JudgeSystem, contests: ContestsSystem },
  useActivation: useCompanionImport,
  navItems: [
    {
      id: 'judge',
      label: 'Judge',
      icon: (
        <svg className="nd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22V13m0 0l-4 2m4-2l4 2" />
          <path d="M12 7V2m0 5a3 3 0 1 0 0 6 3 3 0 1 0 0-6z" />
          <path d="M5 17h14M3 22h18" />
        </svg>
      ),
    },
    {
      id: 'contests',
      label: 'Codeforces Contests',
      icon: (
        <svg className="nd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22h9M3 22h9M12 2v20M17 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
        </svg>
      ),
    },
  ],
});
export {};
