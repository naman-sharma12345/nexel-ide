import { useStatusStore } from '../stores/useStatusStore';
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
import snippets from '../../snippets.json';

interface EditorProps {
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onCloseFile?: (filePath: string) => void;
}

export const Editor: React.FC<EditorProps> = ({ activeFilePath, onFileSelect, onCloseFile }) => {
  const settings = useSettingsStore();
  const recent = useWorkspaceStore(st => st.recentWorkspaces);
  const openRecent = useWorkspaceStore(st => st.openRecent);
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
        const name = activeFilePath.split('/').pop() || activeFilePath;
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
      useStatusStore.getState().pushToast(`Saved ${activeTab.name}`, 'success');
    } catch (err) {
      console.error("Failed to save active file:", err);
      useStatusStore.getState().pushToast(`Could not save ${activeTab.name}`, 'error', 4000);
    }
  };

  const saveAllDirtyTabs = async () => {
    const dirtyTabs = tabs.filter(t => t.isDirty);
    for (const tab of dirtyTabs) {
      try {
        await window.nexelAPI.writeFileContent(tab.filePath, tab.content);
        useEditorStore.getState().saveTabSuccess(tab.filePath);
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
    if (onCloseFile) onCloseFile(path);

    const updatedState = useEditorStore.getState();
    if (updatedState.activeTabPath) {
      onFileSelect(updatedState.activeTabPath);
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
    reportCursor();

    THEMES.forEach(t => monaco.editor.defineTheme(monacoThemeName(t.id), monacoThemeData(t)));
    monaco.editor.setTheme(monacoThemeName(useSettingsStore.getState().theme));

    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
    }
    completionProviderRef.current = monaco.languages.registerCompletionItemProvider('cpp', {
      provideCompletionItems: (model: any, position: any) => {
        const text = model.getValue();
        const hasUsingStd = /\busing\s+namespace\s+std\s*;/.test(text);

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];
        const categories = ['keywords', 'containers', 'algorithms', 'math', 'io', 'cp'];

        categories.forEach(category => {
          const items = (dataset as any)[category] || [];
          items.forEach((item: any) => {
            let label = item.label;
            let insertText = item.insertText || item.label;

            if (hasUsingStd) {
              if (label.startsWith('std::')) {
                label = label.substring(5);
              }
              if (insertText.startsWith('std::')) {
                insertText = insertText.substring(5);
              }
            }

            let kind = monaco.languages.CompletionItemKind.Keyword;
            if (category === 'containers') {
              kind = monaco.languages.CompletionItemKind.Class;
            } else if (category === 'algorithms' || category === 'math') {
              kind = monaco.languages.CompletionItemKind.Function;
            } else if (category === 'io') {
              kind = monaco.languages.CompletionItemKind.Interface;
            } else if (category === 'cp') {
              kind = monaco.languages.CompletionItemKind.Snippet;
            }

            const score = item.score !== undefined ? item.score : 50;
            const sortText = String(1000 - score).padStart(4, '0');

            suggestions.push({
              label: label,
              kind: kind,
              detail: item.detail || `${category} (Nexel Autocomplete)`,
              documentation: {
                value: item.documentation || '',
              },
              insertText: insertText,
              range: range,
              sortText: sortText,
            });
          });
        });

        if (enableSnippets) {
          Object.entries(snippets).forEach(([key, val]: [string, any]) => {
            const bodyStr = Array.isArray(val.body) ? val.body.join('\n') : val.body;
            suggestions.push({
              label: val.prefix,
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: val.description || 'Snippet',
              documentation: {
                value: `**${val.description || key}**\n\n\`\`\`cpp\n${bodyStr}\n\`\`\``
              },
              insertText: bodyStr,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              sortText: '0001'
            });
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

  const renderWelcomeBackdrop = () => (
    <div className="nx-editor-welcome-backdrop">
      <div className="nx-welcome-glass-plate">
        <div className="nx-welcome-branding-wrapper">
          <img src={logoImg} className="nx-welcome-logo" alt="Nexel IDE Logo" />
          <h1 className="nx-welcome-headline">NEXEL IDE</h1>
        </div>
        <p className="nx-welcome-subtitle">A premium minimal workspace with native Monaco integration.</p>
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
                  className={`nx-editor-tab ${focusedTabPath === tab.filePath ? 'active' : ''} ${focusedTabPath === tab.filePath && acCelebration ? 'ac-celebrate-glow' : ''}`}
                  onClick={() => {
                    if (isSplit && rightTabPath === tab.filePath) {
                      setFocusedTabPath(tab.filePath);
                    } else {
                      useEditorStore.setState({ activeTabPath: tab.filePath, focusedTabPath: tab.filePath });
                      onFileSelect(tab.filePath);
                    }
                  }}
                >
                  <span className="nx-tab-title">{tab.name}</span>
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
          <span className="nx-footer-path">{activeTab.filePath}</span>
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
