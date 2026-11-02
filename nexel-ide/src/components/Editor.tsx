import { registerLangCompletions } from '../lib/langCompletions';
import { registerHoverDocs } from '../lib/hoverDocs';
import { registerSignatureHelp } from '../lib/signatureHelp';
import { toCrumbs } from '../lib/breadcrumbs';
import { getClangd } from '../lib/clangd/session';
import { isClangdActive } from '../lib/clangd/state';
import { pathToUri } from '../lib/clangd/uri';
import { useStatusStore } from '../stores/useStatusStore';
import { collectPluginCompletions } from '../plugins/registry';
import { collectOfflineItems } from '../lib/offlineCompletions';
import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import '../lib/monacoSetup';
import './Editor.css';
import { useEditorStore } from '../stores/useEditorStore';
import type { EditorTab } from '../stores/useEditorStore';
import { useJudgeStore } from '../stores/useJudgeStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { SHORTCUT_GROUPS } from '../lib/shortcuts';
import './ShortcutsSheet.css';
import logoImg from '../assets/logo.png';
import { useSettingsStore } from '../stores/useSettingsStore';
import { THEMES, monacoThemeName, monacoThemeData } from '../lib/themes';
import dataset from '../../dataset.json';

interface EditorProps {
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onCloseFile?: (filePath: string) => void;
}

export const Editor: React.FC<EditorProps> = ({ activeFilePath, onFileSelect, onCloseFile }) => {
  const settings = useSettingsStore();
  const recent = useWorkspaceStore(st => st.recentWorkspaces);
  const openRecent = useWorkspaceStore(st => st.openRecent);
  const openFolder = useWorkspaceStore(st => st.openWorkspaceDir);
  const {
    tabs,
    activeTabPath,
    focusedTabPath,
    isSplit,
    rightTabPath,
    splitRatio,
    autoSave,
    acCelebration,
    enableSnippets,
    updateTabContent,
    toggleSplit,
    setFocusedTabPath,
    closeTab,
    setAutoSave,
    setSplitRatio,
    closeAllTabs,
    closeSavedTabs,
  } = useEditorStore();

  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editorRef = useRef<any>(null);
  const completionProviderRef = useRef<any>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      
      if (percentage > 20 && percentage < 80) {
        setSplitRatio(percentage);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setSplitRatio]);

  // Clean up completion provider on unmount
  useEffect(() => {
    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
    };
  }, []);

  const toggleSplitTab = (path: string) => {
    toggleSplit(path);
    const updatedState = useEditorStore.getState();
    if (updatedState.activeTabPath) {
      onFileSelect(updatedState.activeTabPath);
    }
  };

  const handleCloseAllTabs = () => {
    setShowMenu(false);
    const hasDirty = tabs.some(t => t.isDirty);
    if (hasDirty) {
      const confirmClose = window.confirm("Some tabs have unsaved changes. Close all anyway?");
      if (!confirmClose) return;
    }
    closeAllTabs();
    if (onCloseFile) onCloseFile("");
  };

  const handleCloseOtherTabs = () => {
    setShowMenu(false);
    const others = tabs.filter(t => t.filePath !== activeTabPath);
    if (!others.length) return;
    if (others.some(t => t.isDirty) && !window.confirm("Close other tabs? Some have unsaved changes.")) return;
    others.forEach(t => { closeTab(t.filePath); getClangd().closePath(t.filePath); });
  };

  const handleCloseTabsToRight = () => {
    setShowMenu(false);
    const idx = tabs.findIndex(t => t.filePath === activeTabPath);
    const right = idx >= 0 ? tabs.slice(idx + 1) : [];
    if (!right.length) return;
    if (right.some(t => t.isDirty) && !window.confirm("Close tabs to the right? Some have unsaved changes.")) return;
    right.forEach(t => { closeTab(t.filePath); getClangd().closePath(t.filePath); });
  };

  const handleCloseTabsToLeft = () => {
    setShowMenu(false);
    const idx = tabs.findIndex(t => t.filePath === activeTabPath);
    const left = idx > 0 ? tabs.slice(0, idx) : [];
    if (!left.length) return;
    if (left.some(t => t.isDirty) && !window.confirm("Close tabs to the left? Some have unsaved changes.")) return;
    left.forEach(t => { closeTab(t.filePath); getClangd().closePath(t.filePath); });
  };

  const handleCloseSavedTabs = () => {
    setShowMenu(false);
    closeSavedTabs();
    const updatedState = useEditorStore.getState();
    if (updatedState.activeTabPath) {
      onFileSelect(updatedState.activeTabPath);
    } else {
      if (onCloseFile) onCloseFile("");
    }
  };

  // Sync with activeFilePath from props
  useEffect(() => {
    if (!activeFilePath) return;

    const existingTab = tabs.find(t => t.filePath === activeFilePath);
    if (existingTab) {
      useEditorStore.setState({ activeTabPath: activeFilePath });
      return;
    }

    const loadFile = async () => {
      try {
        const content = await window.nexelAPI.readFileContent(activeFilePath);
        const name = activeFilePath.split(/[\\/]/).pop() || activeFilePath;
        useEditorStore.getState().openFile(activeFilePath, name, content);
      } catch (err) {
        console.error("Failed to read selected file:", err);
      }
    };

    loadFile();
  }, [activeFilePath, tabs]);

  // Handle Ctrl+S and keybinds
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveActiveTab();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabPath) handleCloseTab(activeTabPath);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        if (isSplit && rightTabPath) toggleSplitTab(rightTabPath);
        else if (activeTabPath) toggleSplitTab(activeTabPath);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1' && isSplit && activeTabPath) {
        e.preventDefault();
        setFocusedTabPath(activeTabPath);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '2' && isSplit && rightTabPath) {
        e.preventDefault();
        setFocusedTabPath(rightTabPath);
      }
      // Editor font zoom: only when the key is not aimed at the terminal or a non-editor
      // input (rename box, search, palette). Monaco's own textarea still counts as editor context.
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        const ae = document.activeElement as HTMLElement | null;
        const inTerminal = !!ae?.closest?.('.xterm');
        const inOtherEditable = !!ae?.closest?.('input, textarea, [contenteditable="true"]') && !ae?.closest?.('.monaco-editor');
        if (!inTerminal && !inOtherEditable) {
          e.preventDefault();
          const { fontSize, setFontSize } = useSettingsStore.getState();
          if (e.key === '0') setFontSize(13);
          else if (e.key === '-') setFontSize(fontSize - 1);
          else setFontSize(fontSize + 1);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1 && activeTabPath) {
          const idx = tabs.findIndex(t => t.filePath === activeTabPath);
          const step = e.shiftKey ? -1 : 1;
          const next = tabs[(idx + step + tabs.length) % tabs.length];
          useEditorStore.setState({ activeTabPath: next.filePath, focusedTabPath: next.filePath });
          onFileSelect(next.filePath);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabPath]);

  // Handle Auto-Save loop
  useEffect(() => {
    if (autoSave) {
      autoSaveIntervalRef.current = setInterval(() => {
        saveAllDirtyTabs();
      }, 5000);
    } else {
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
    }

    return () => {
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
    };
  }, [autoSave, tabs]);

  // Auto-scroll active tab into view when selected
  useEffect(() => {
    if (!activeTabPath) return;
    const timer = setTimeout(() => {
      const activeTabEl = document.querySelector('.nx-editor-tab.active');
      if (activeTabEl) {
        activeTabEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [activeTabPath]);

  const saveActiveTab = async () => {
    const activeTab = tabs.find(t => t.filePath === activeTabPath);
    if (!activeTab || !activeTab.isDirty) return;

    try {
      await window.nexelAPI.writeFileContent(activeTab.filePath, activeTab.content);
      useEditorStore.getState().saveTabSuccess(activeTab.filePath);
      getClangd().notifySaved(activeTab.filePath);
      useStatusStore.getState().pushToast(`Saved ${activeTab.name}`, 'success');
    } catch (err) {
      console.error("Failed to save active file:", err);
      useStatusStore.getState().pushToast(`Could not save ${activeTab.name}`, 'error', 4000);
    }
  };

  const saveAllDirtyTabs = async () => {
    const dirtyTabs = tabs.filter(t => t.isDirty && !t.isOrphaned);
    for (const tab of dirtyTabs) {
      try {
        await window.nexelAPI.writeFileContent(tab.filePath, tab.content);
        useEditorStore.getState().saveTabSuccess(tab.filePath);
        getClangd().notifySaved(tab.filePath);
      } catch (err) {
        console.error("Auto-save write operation failed:", err);
      }
    }
  };

  const handleEditorChangeForTab = (path: string, value: string | undefined) => {
    updateTabContent(path, value || '');
  };

  const handleCloseTab = (path: string) => {
    const tabToClose = tabs.find(t => t.filePath === path);
    if (tabToClose?.isDirty) {
      const confirmClose = window.confirm(`File "${tabToClose.name}" has unsaved changes. Close anyway?`);
      if (!confirmClose) return;
    }

    closeTab(path);
    getClangd().closePath(path);

    const updatedState = useEditorStore.getState();
    if (updatedState.activeTabPath) {
      onFileSelect(updatedState.activeTabPath);
    } else if (onCloseFile) {
      onCloseFile(path);
    }
  };

  const getLanguage = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'cpp':
      case 'c':
      case 'h':
        return 'cpp';
      case 'py':
        return 'python';
      default:
        return 'plaintext';
    }
  };

  const langProvidersRef = useRef<{ dispose(): void }[] | null>(null);
  // Find-in-files / palette jump: reveal a line and pulse-highlight it.
  const flashRef = useRef<string[]>([]);
  useEffect(() => {
    const onReveal = (e: Event) => {
      const { line, col } = (e as CustomEvent<{ path: string; line: number; col: number }>).detail ?? {};
      const ed = editorRef.current;
      if (!ed || !Number.isFinite(line)) return;
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: col || 1 });
      ed.focus();
      flashRef.current = ed.deltaDecorations(flashRef.current, [{ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, options: { isWholeLine: true, className: 'nx-line-flash' } }]);
      window.setTimeout(() => { flashRef.current = editorRef.current?.deltaDecorations(flashRef.current, []) ?? []; }, 1400);
    };
    window.addEventListener('nexel:reveal', onReveal);
    return () => window.removeEventListener('nexel:reveal', onReveal);
  }, []);
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    // Feed the status bar: cursor + selection length (store skips no-op updates).
    const reportCursor = () => {
      const pos = editor.getPosition(); const sel = editor.getSelection(); const model = editor.getModel();
      if (!pos) return;
      useStatusStore.getState().setCursor(pos.lineNumber, pos.column, sel && model && !sel.isEmpty() ? model.getValueInRange(sel).length : 0);
    };
    editor.onDidChangeCursorSelection(reportCursor);
    editor.onDidFocusEditorText(reportCursor);
    editor.onDidChangeModel(reportCursor); // tab switch swaps the model; re-report the new cursor instead of leaving stale Ln/Col
    reportCursor();

    THEMES.forEach(t => monaco.editor.defineTheme(monacoThemeName(t.id), monacoThemeData(t)));
    monaco.editor.setTheme(monacoThemeName(useSettingsStore.getState().theme));

    if (!langProvidersRef.current) langProvidersRef.current = [...registerLangCompletions(monaco), ...registerHoverDocs(monaco), ...registerSignatureHelp(monaco)];
    // clangd: providers registered after the offline ones (so they are asked first); every C/C++ model shown in an
    // editor is synced. When clangd is absent or crashes the providers no-op and the offline ones serve alone.
    const clangd = getClangd((m, k, ttl) => useStatusStore.getState().pushToast(m, k, ttl));
    clangd.attachMonaco(monaco);
    clangd.track(editor.getModel());
    editor.onDidChangeModel(() => clangd.track(editor.getModel()));
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
    }
    completionProviderRef.current = monaco.languages.registerCompletionItemProvider('cpp', {
      provideCompletionItems: (model: any, position: any) => {
        const text = model.getValue();
        const hasUsingStd = /\busing\s+namespace\s+std\s*;/.test(text);

        const word = model.getWordUntilPosition(position);
        // Member / scope access (v.  p->  std::) belongs to clangd; dataset words there would only be noise.
        const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
        if (/(\.|->|::)\s*$/.test(before)) return { suggestions: [] };
        // With clangd active, it owns keywords/containers/algorithms; Nexel keeps its CP aliases and snippets.
        const clangdOn = isClangdActive();
        const contrib = collectPluginCompletions(useSettingsStore.getState().plugins);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];
        const kindFor = (cat: string, isSnippet: boolean) => {
          const K = monaco.languages.CompletionItemKind;
          if (isSnippet || cat === 'cp') return K.Snippet;
          if (cat === 'containers') return K.Class;
          if (cat === 'algorithms' || cat === 'math') return K.Function;
          if (cat === 'io') return K.Interface;
          return K.Keyword;
        };
        for (const item of collectOfflineItems({ dataset: { ...dataset, ...contrib.dataset }, snippets: contrib.snippets, clangdOn, pluginCategories: contrib.categories, enableSnippets, hasUsingStd })) {
          // Offline items rank after clangd's semantic results (clangd sortText starts with a digit run like "3f...").
          const sortText = item.isSnippet ? (clangdOn ? '~0001' : '0001') : (clangdOn ? '~' : '') + String(1000 - item.score).padStart(4, '0');
          suggestions.push({
            kind: kindFor(item.category, item.isSnippet),
            detail: item.detail,
            label: clangdOn ? { label: item.label, description: item.isSnippet ? 'snippet' : 'Nexel' } : item.label,
            documentation: { value: item.documentation },
            insertText: item.insertText,
            ...(item.isSnippet ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet } : {}),
            range: range,
            sortText: sortText,
          });
        }

        return { suggestions };
      }
    });
  };

  const activeTab = tabs.find(t => t.filePath === activeTabPath);

  const getStats = () => {
    if (!activeTab) return { lines: 0, chars: 0 };
    return {
      lines: activeTab.content.split('\n').length,
      chars: activeTab.content.length
    };
  };

  // Cursor-follow spotlight: writes CSS vars straight to the element (no React re-render per mousemove), rAF-throttled.
  const welcomeRaf = useRef(0);
  const onWelcomeMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget; const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    cancelAnimationFrame(welcomeRaf.current);
    welcomeRaf.current = requestAnimationFrame(() => { el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px'); });
  };

  const renderWelcomeBackdrop = () => (
    <div className="nx-editor-welcome-backdrop" onMouseMove={onWelcomeMove}>
      <div className="nx-welcome-grid" aria-hidden="true" />
      <div className="nx-welcome-spot" aria-hidden="true" />
      <div className="nx-welcome-orb nx-welcome-orb-a" aria-hidden="true" />
      <div className="nx-welcome-orb nx-welcome-orb-b" aria-hidden="true" />
      <div className="nx-welcome-glass-plate">
        <div className="nx-welcome-branding-wrapper">
          <img src={logoImg} className="nx-welcome-logo" alt="Nexel IDE Logo" />
          <h1 className="nx-welcome-headline">NEXEL IDE</h1>
        </div>
        <p className="nx-welcome-subtitle">A minimal, keyboard-first editor. Open a folder to get started.</p>
        <div className="nx-welcome-actions">
          <button className="nx-welcome-open-btn" onClick={() => { void openFolder(); }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            Open Folder
          </button>
        </div>
        <div className="nx-keycaps">
          {SHORTCUT_GROUPS[0].items.concat(SHORTCUT_GROUPS[1].items.slice(0, 2)).map((it, i) => (
            <div key={it.label} className="nx-keycap-row" style={{ animationDelay: `${220 + i * 55}ms` }}>
              <span>{it.label}</span><span>{it.keys.map((k, j) => <kbd key={j}>{k}</kbd>)}</span>
            </div>
          ))}
        </div>
        {recent.length > 0 && (
          <div className="nx-recent">
            <h4>Recent workspaces</h4>
            {recent.map((d, i) => (
              <button key={d} style={{ animationDelay: `${520 + i * 60}ms` }} onClick={() => { void openRecent(d); }}>
                <b>{d.split(/[\\/]/).filter(Boolean).pop() ?? d}</b><small title={d}>{d}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderTabContent = (tab: EditorTab) => {
    if (tab.filePath === 'nexel://snippets') {
      return <SnippetsViewer snippetsData={snippets} />;
    } else if (tab.filePath.startsWith('cf://')) {
      try {
        const parsed = JSON.parse(tab.content);
        return <ContestProblemViewer problemData={parsed} />;
      } catch (e) {
        console.error("Failed to parse problem statement JSON:", e);
        return (
          <div className="nx-contests-status-msg error">
            <p>Error rendering problem statement: Invalid data format.</p>
          </div>
        );
      }
    } else {
      return (
        <div className="nx-editor-workspace-area">
          <MonacoEditor
            height="100%"
            language={getLanguage(tab.name)}
            theme={monacoThemeName(settings.theme)}
            value={tab.content}
            // One Monaco model per file, keyed by its file:// URI, so clangd sees each document separately.
            path={pathToUri(tab.filePath)}
            onChange={(val) => handleEditorChangeForTab(tab.filePath, val)}
            beforeMount={(m: any) => THEMES.forEach(t => m.editor.defineTheme(monacoThemeName(t.id), monacoThemeData(t)))}
            onMount={handleEditorDidMount}
            options={{
              fontSize: settings.fontSize,
              fontFamily: 'Consolas, "Courier New", Courier, monospace',
              minimap: { enabled: settings.minimap },
              wordWrap: settings.wordWrap ? 'on' : 'off',
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
              lineNumbersMinChars: 3,
              automaticLayout: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              bracketPairColorization: { enabled: true },
              fontLigatures: settings.ligatures,
              roundedSelection: true,
              padding: { top: 16 },
              tabSize: settings.tabSize,
            }}
          />
        </div>
      );
    }
  };

  const rightTab = tabs.find(t => t.filePath === rightTabPath);

  return (
    <div ref={containerRef} className={`nx-editor-canvas ${acCelebration ? 'ac-celebrate-glow' : ''}`}>
      {/* Floating Premium tabs bar */}
      {tabs.length > 0 && (
        <div className="nx-floating-tabbar-container">
          <div className="nx-floating-tabbar">
            <div className="nx-tabs-scroll-stack">
              {tabs.map((tab) => (
                <div 
                  key={tab.filePath} 
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/nx-tab', tab.filePath); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/nx-tab')) e.preventDefault(); }}
                  onDrop={(e) => { const from = e.dataTransfer.getData('text/nx-tab'); if (from) { e.preventDefault(); useEditorStore.getState().moveTab(from, tab.filePath); } }}
                  className={`nx-editor-tab ${focusedTabPath === tab.filePath ? 'active' : ''} ${focusedTabPath === tab.filePath && acCelebration ? 'ac-celebrate-glow' : ''} ${tab.isOrphaned ? 'nx-tab-orphaned' : ''}`}
                  title={tab.isOrphaned ? `${tab.filePath} (deleted on disk - saving recreates the file)` : tab.filePath}
                  onClick={() => {
                    if (isSplit && rightTabPath === tab.filePath) {
                      setFocusedTabPath(tab.filePath);
                    } else {
                      useEditorStore.setState({ activeTabPath: tab.filePath, focusedTabPath: tab.filePath });
                      onFileSelect(tab.filePath);
                    }
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) { e.preventDefault(); handleCloseTab(tab.filePath); }
                  }}
                >
                  <span className="nx-tab-title">{tab.name}</span>
                  {tab.isOrphaned && (
                    <span className="nx-tab-orphan-badge" title="Deleted on disk - saving recreates the file">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </span>
                  )}
                  {tab.isDirty && <div className="nx-dirty-indicator-glow" />}
                  <div className="nx-tab-actions-group">
                    <button 
                      className={`nx-tab-split-btn ${isSplit && rightTabPath === tab.filePath ? 'active' : ''}`}
                      title={isSplit && rightTabPath === tab.filePath ? "Close Split Pane" : "Split to Right Pane"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSplitTab(tab.filePath);
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="3" width="18" height="18" rx="1.5" />
                        <line x1="12" y1="3" x2="12" y2="21" />
                      </svg>
                    </button>
                    <button 
                      className="nx-tab-close-btn" 
                      title="Close Tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(tab.filePath);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Minimalist Tab Actions Menu Dropdown */}
            <div className="nx-tab-menu-container">
              <button 
                className="nx-tab-menu-btn" 
                title="Tab Actions"
                onClick={() => setShowMenu(!showMenu)}
              >
                •••
              </button>
              {showMenu && (
                <div className="nx-tab-dropdown-menu">
                  <div className="nx-dropdown-item" onClick={saveAllDirtyTabs}>
                    Save All Tabs
                  </div>
                  <div className="nx-dropdown-item" onClick={handleCloseAllTabs}>
                    Close All Tabs
                  </div>
                  <div className="nx-dropdown-item" onClick={handleCloseOtherTabs}>
                    Close Other Tabs
                  </div>
                  <div className="nx-dropdown-item" onClick={handleCloseTabsToLeft}>
                    Close Tabs to the Left
                  </div>
                  <div className="nx-dropdown-item" onClick={handleCloseTabsToRight}>
                    Close Tabs to the Right
                  </div>
                  <div className="nx-dropdown-item warning" onClick={handleCloseSavedTabs}>
                    Close Saved Tabs
                  </div>
                </div>
              )}
            </div>

            {/* Global Toolbar actions inside floating bar */}
            {activeTabPath && (
              <div className="nx-editor-toolbar-actions">
                <button 
                  className={`nx-toolbar-btn auto-save ${autoSave ? 'active' : ''}`}
                  onClick={() => setAutoSave(!autoSave)}
                  title={autoSave ? "Disable Auto-Save" : "Enable Auto-Save"}
                >
                  <div className="nx-auto-save-led" />
                  Auto-Save
                </button>
                
                <button 
                  className="nx-toolbar-btn save" 
                  onClick={saveActiveTab}
                  disabled={!activeTab?.isDirty}
                  title="Save changes (Ctrl+S)"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor Main Content Area */}
      <div className="nx-editor-main-container">
        {isSplit ? (
          <div className="nx-editor-split-container">
            {/* Left Pane */}
            <div 
              className={`nx-editor-split-pane left ${focusedTabPath === activeTabPath ? 'focused' : ''}`} 
              style={{ width: `${splitRatio}%` }}
              onMouseDown={() => {
                if (activeTabPath && focusedTabPath !== activeTabPath) {
                  setFocusedTabPath(activeTabPath);
                }
              }}
            >
              {activeTab && activeTab.filePath !== rightTabPath ? (
                renderTabContent(activeTab)
              ) : (
                renderWelcomeBackdrop()
              )}
            </div>

            {/* Draggable vertical divider */}
            <div 
              className={`nx-editor-split-divider ${isDragging ? 'dragging' : ''}`} 
              onMouseDown={handleMouseDown}
            >
              <div className="nx-divider-glow-line" />
            </div>

            {/* Right Pane */}
            <div 
              className={`nx-editor-split-pane right ${focusedTabPath === rightTabPath ? 'focused' : ''}`} 
              style={{ width: `${100 - splitRatio}%` }}
              onMouseDown={() => {
                if (rightTabPath && focusedTabPath !== rightTabPath) {
                  setFocusedTabPath(rightTabPath);
                }
              }}
            >
              {rightTab ? (
                <div className="nx-right-pane-wrapper">
                  <div className="nx-right-pane-header">
                    <span className="nx-right-pane-title">{rightTab.name}</span>
                    <button 
                      className="nx-right-pane-close" 
                      onClick={() => { useEditorStore.setState({ isSplit: false, rightTabPath: null, focusedTabPath: activeTabPath }); }} 
                      title="Close Split Pane"
                    >
                      ×
                    </button>
                  </div>
                  <div className="nx-right-pane-content">
                    {renderTabContent(rightTab)}
                  </div>
                </div>
              ) : (
                renderWelcomeBackdrop()
              )}
            </div>
          </div>
        ) : (
          activeTab ? renderTabContent(activeTab) : renderWelcomeBackdrop()
        )}
      </div>

      {/* Status metrics footer */}
      {activeTab && (
        <div className="nx-editor-footer-metrics">
          <nav className="nx-crumbs" key={activeTab.filePath} aria-label="File path" title={activeTab.filePath}>
            {toCrumbs(activeTab.filePath, useWorkspaceStore.getState().rootPath).map((c, i, arr) => (
              <React.Fragment key={i}>
                {c.path ? (
                  <button
                    type="button"
                    className={`nx-crumb nx-crumb-btn ${c.isFile ? 'nx-crumb-file' : ''}`}
                    style={{ animationDelay: `${i * 35}ms` }}
                    title={`Reveal ${c.label} in Explorer`}
                    onClick={() => useWorkspaceStore.getState().revealPath(c.path!)}
                  >
                    {c.label}
                  </button>
                ) : (
                  <span className="nx-crumb" style={{ animationDelay: `${i * 35}ms` }}>{c.label}</span>
                )}
                {i < arr.length - 1 && <svg className="nx-crumb-sep" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </React.Fragment>
            ))}
          </nav>
          <div className="nx-footer-right-cluster">
            <span className="nx-footer-metric-pill">Monaco Editor</span>
            <span className="nx-footer-metric-pill">Lines: {getStats().lines}</span>
            <span className="nx-footer-metric-pill">Chars: {getStats().chars}</span>
            <span className="nx-footer-metric-pill active">Nexel Engine</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;

interface SnippetsViewerProps {
  snippetsData: Record<string, { prefix: string; description: string; body: string[] }>;
}

const SnippetsViewer: React.FC<SnippetsViewerProps> = ({ snippetsData }) => {
  const [search, setSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filteredSnippets = Object.entries(snippetsData).filter(([key, value]) => {
    const q = search.toLowerCase();
    return (
      key.toLowerCase().includes(q) ||
      (value.prefix && value.prefix.toLowerCase().includes(q)) ||
      (value.description && value.description.toLowerCase().includes(q))
    );
  });

  const handleCopy = (key: string, body: string[]) => {
    navigator.clipboard.writeText(body.join('\n'));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="nx-snippets-viewer">
      <div className="nx-snippets-header">
        <div>
          <h1 className="nx-snippets-title">NEXEL SNIPPETS</h1>
          <p className="nx-snippets-subtitle">Fast keyboard-expandable boilerplate fragments for Competitive Programming</p>
        </div>
        <input 
          type="text" 
          placeholder="Search snippets..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="nx-snippets-search"
        />
      </div>

      <div className="nx-snippets-grid">
        {filteredSnippets.map(([key, value]) => (
          <div key={key} className="nx-snippet-card">
            <div className="nx-snippet-card-header">
              <span className="nx-snippet-prefix-badge" title="Type prefix and press Tab to expand">{value.prefix}</span>
              <span className="nx-snippet-desc">{value.description}</span>
              <button 
                className={`nx-snippet-copy-btn ${copiedKey === key ? 'copied' : ''}`}
                onClick={() => handleCopy(key, value.body)}
              >
                {copiedKey === key ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="nx-snippet-code-block">
              <code>{value.body.join('\n')}</code>
            </pre>
          </div>
        ))}
        {filteredSnippets.length === 0 && (
          <div className="nx-snippets-empty">No matching snippets found.</div>
        )}
      </div>
    </div>
  );
};

interface ContestProblemViewerProps {
  problemData: {
    url: string;
    index: string;
    title: string;
    timeLimit: string;
    memoryLimit: string;
    statement?: string;
    inputFormat?: string;
    outputFormat?: string;
    note?: string;
    testCases?: Array<{ input: string; output: string }>;
  };
}

const ContestProblemViewer: React.FC<ContestProblemViewerProps> = React.memo(({ problemData }) => {
  useEffect(() => {
    const mj = (window as any).MathJax;
    if (mj && mj.typesetPromise) {
      mj.typesetPromise();
    }
  }, [problemData.url]);

  const handleImportSamples = () => {
    if (problemData.testCases && Array.isArray(problemData.testCases)) {
      useJudgeStore.getState().importSamples(problemData.testCases);
      alert("Sample test cases successfully imported to Nexel Judge System! Switch to the Judge tab to run them.");
    }
  };

  return (
    <div className="nx-cf-problem-viewer">
      <div className="nx-cf-problem-header">
        <h1 className="nx-cf-problem-title">{problemData.index}. {problemData.title}</h1>
        <div className="nx-cf-problem-meta-row">
          <div className="nx-cf-meta-chip">
            <span className="label">TIME LIMIT</span>
            <span className="value">{problemData.timeLimit}</span>
          </div>
          <div className="nx-cf-meta-chip">
            <span className="label">MEMORY LIMIT</span>
            <span className="value">{problemData.memoryLimit}</span>
          </div>
          <button className="nx-cf-import-btn" onClick={handleImportSamples}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="nx-import-icon">
              <path d="M12 5v14M5 12h14" />
            </svg>
            IMPORT SAMPLES TO JUDGE
          </button>
        </div>
      </div>

      <div className="nx-cf-problem-body">
        {problemData.statement && (
          <div className="nx-cf-section statement-section">
            <div dangerouslySetInnerHTML={{ __html: problemData.statement }} />
          </div>
        )}

        {problemData.inputFormat && (
          <div className="nx-cf-section">
            <h3 className="nx-cf-section-title">Input</h3>
            <div dangerouslySetInnerHTML={{ __html: problemData.inputFormat }} />
          </div>
        )}

        {problemData.outputFormat && (
          <div className="nx-cf-section">
            <h3 className="nx-cf-section-title">Output</h3>
            <div dangerouslySetInnerHTML={{ __html: problemData.outputFormat }} />
          </div>
        )}

        {problemData.testCases && problemData.testCases.length > 0 && (
          <div className="nx-cf-section">
            <h3 className="nx-cf-section-title">Sample Tests</h3>
            <div className="nx-cf-samples-stack">
              {problemData.testCases.map((tc, idx) => (
                <div key={idx} className="nx-cf-sample-box">
                  <div className="nx-cf-sample-header">
                    <span className="nx-sample-num">Example #{idx + 1}</span>
                    <div className="nx-cf-sample-actions">
                      <button 
                        className="nx-cf-copy-sample-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(tc.input);
                          alert(`Sample input #${idx + 1} copied to clipboard!`);
                        }}
                      >
                        Copy Input
                      </button>
                      <button 
                        className="nx-cf-copy-sample-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(tc.output);
                          alert(`Sample output #${idx + 1} copied to clipboard!`);
                        }}
                      >
                        Copy Output
                      </button>
                    </div>
                  </div>
                  <div className="nx-cf-sample-grid">
                    <div className="nx-cf-sample-column">
                      <div className="nx-cf-sample-label">INPUT</div>
                      <pre className="nx-cf-sample-pre"><code>{tc.input}</code></pre>
                    </div>
                    <div className="nx-cf-sample-column">
                      <div className="nx-cf-sample-label">OUTPUT</div>
                      <pre className="nx-cf-sample-pre"><code>{tc.output}</code></pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {problemData.note && (
          <div className="nx-cf-section note-section">
            <h3 className="nx-cf-section-title">Note</h3>
            <div dangerouslySetInnerHTML={{ __html: problemData.note }} />
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.problemData.url === next.problemData.url);
