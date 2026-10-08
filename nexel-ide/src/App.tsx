import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useUIStore } from './stores/useUIStore';
import { useEditorStore } from './stores/useEditorStore';
import { NavDock } from './components/NavDock';
import { Explorer } from './components/Explorer';
import { Editor } from './components/Editor';
import { TitleBar } from './components/TitleBar';
import { Terminal } from './components/Terminal';
const JudgeSystem = lazy(() => import('./components/JudgeSystem'));
const ContestsSystem = lazy(() => import('./components/ContestsSystem'));
import { useWorkspaceStore, type FileNode } from './stores/useWorkspaceStore';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { SettingsPanel } from './components/SettingsPanel';
import { useSettingsStore } from './stores/useSettingsStore';
import { useStatusStore } from './stores/useStatusStore';
import { useJudgeStore } from './stores/useJudgeStore';
import { applyTheme, THEMES } from './lib/themes';
import './App.css';

function App() {
  const {
    currentSection,
    sidebarCollapsed,
    isHoverRevealed,
    terminalVisible,
    templateModalVisible,
    setSection,
    toggleSidebar,
    setTerminalVisible,
    openTemplateModal,
    setIsHoverRevealed,
  } = useUIStore();

  const {
    activeTabPath,
    focusedTabPath,
    cppTemplate,
    openFile,
    setCppTemplate,
    tabs,
  } = useEditorStore();

  const [tempTemplate, setTempTemplate] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const tree = useWorkspaceStore(s => s.tree);
  const themeId = useSettingsStore(s => s.theme);
  const firstTheme = useRef(true);
  useEffect(() => { applyTheme(themeId, document.documentElement, !firstTheme.current); firstTheme.current = false; }, [themeId]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setQuickOpen(false); setPaletteOpen(o => !o); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '/' && !(e.target as HTMLElement)?.closest?.('.monaco-editor')) { e.preventDefault(); setShortcutsOpen(o => !o); }
      else if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); const st = useSettingsStore.getState(); st.openSettings(!st.settingsOpen); }
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setPaletteOpen(false); setQuickOpen(o => !o); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  // Competitive Companion: browser extension -> new solution file + judge samples
  useEffect(() => {
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
        openFile(filePath, name, body);
        useJudgeStore.getState().importSamples(p.tests);
        toast(`Imported ${p.name} · ${p.tests.length} sample${p.tests.length === 1 ? '' : 's'}`, 'success', 4000);
      } catch (e) { console.error(e); toast('Could not import problem from Competitive Companion', 'error', 4000); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const paletteCommands = [
    { id: 'ws', label: 'Go to Workspace', run: () => setSection('workspace') },
    { id: 'judge', label: 'Go to Judge', run: () => setSection('judge') },
    { id: 'contests', label: 'Go to Contests', run: () => setSection('contests') },
    { id: 'sidebar', label: 'Toggle Sidebar', run: () => toggleSidebar() },
    { id: 'term', label: 'Toggle Terminal', run: () => setTerminalVisible(!terminalVisible) },
    { id: 'tpl', label: 'Edit C++ Template', run: () => openTemplateModal(true) },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', hint: 'Ctrl+/', run: () => setShortcutsOpen(true) },
    { id: 'settings', label: 'Open Settings', hint: 'Ctrl+,', run: () => useSettingsStore.getState().openSettings(true) },
    ...THEMES.map(t => ({ id: 'theme-' + t.id, label: `Theme: ${t.name}`, run: () => useSettingsStore.getState().setTheme(t.id) })),
    { id: 'minimap', label: 'Toggle Minimap', run: () => useSettingsStore.getState().toggle('minimap') },
    { id: 'wrap', label: 'Toggle Word Wrap', run: () => useSettingsStore.getState().toggle('wordWrap') },
  ];

  const flatFiles = (nodes: FileNode[]): FileNode[] => nodes.flatMap(n => n.type === 'file' ? [n] : flatFiles(n.children ?? []));
  const fileCommands = flatFiles(tree).map(n => ({ id: n.path, label: n.name, hint: n.path.split('/').slice(-2, -1)[0] ?? '', run: () => { void handleFileSelect(n.path); } }));

  useEffect(() => {
    if (templateModalVisible) {
      setTempTemplate(cppTemplate);
    }
  }, [templateModalVisible, cppTemplate]);

  const handleFileSelect = async (filePath: string) => {
    const existing = tabs.find((t) => t.filePath === filePath);
    if (existing) {
      useEditorStore.getState().openFile(filePath, existing.name, existing.content);
    } else {
      try {
        const content = await window.nexelAPI.readFileContent(filePath);
        const name = filePath.split('/').pop() || filePath;
        openFile(filePath, name, content);
      } catch (err) {
        console.error("Failed to read selected file:", err);
      }
    }
  };

  const handleCloseFile = () => {
    // Setting activeTabPath to null or managing it via editor store
    useEditorStore.setState({ activeTabPath: null });
  };

  const handleSelectSection = (id: string) => {
    if (id === 'workspace' || id === 'judge' || id === 'contests') {
      if (currentSection === id) {
        toggleSidebar();
      } else {
        setSection(id);
        useUIStore.setState({ sidebarCollapsed: false });
      }
    } else {
      setSection(id);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      width: '100vw', 
      height: '100vh', 
      overflow: 'hidden', 
      backgroundColor: 'var(--nx-bg-0)' 
    }}>
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
      {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />}
      {quickOpen && <CommandPalette commands={fileCommands} placeholder="Go to file…" label="Quick open" onClose={() => setQuickOpen(false)} />}
      <TitleBar />

      <div style={{ 
        flexGrow: 1,
        width: '100vw',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Invisible Hover Trigger zone at absolute left edge when NavDock is collapsed */}
        {sidebarCollapsed && (
          <div 
            className="nx-navdock-hover-trigger"
            onMouseEnter={() => setIsHoverRevealed(true)}
            style={{
              position: 'fixed',
              left: 0,
              top: '34px',
              width: '24px',
              height: 'calc(100vh - 34px - var(--nx-status-h))',
              zIndex: 9999,
              background: 'transparent'
            }}
          />
        )}

        {/* Floating high-fidelity glass dock layer (collapses off-screen, reveals on hover) */}
        <div 
          className={`nx-navdock-wrapper-container ${sidebarCollapsed ? 'collapsed' : ''} ${isHoverRevealed ? 'hover-revealed' : ''}`}
          onMouseLeave={() => setIsHoverRevealed(false)}
          style={{
            height: 'calc(100vh - 34px - var(--nx-status-h))',
            zIndex: 10000,
            position: 'fixed',
            top: '34px',
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <NavDock 
            activeSection={currentSection} 
            onSelect={handleSelectSection} 
            sidebarCollapsed={sidebarCollapsed}
          />
        </div>

        {/* Workspace Panel Stream (Collapses completely on toggle, no hover reveal) */}
        <div 
          className={`nx-sidebar-container ${sidebarCollapsed ? 'collapsed' : ''}`}
          style={{ 
            display: (currentSection === 'workspace' || currentSection === 'judge' || currentSection === 'contests') ? 'flex' : 'none',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            height: '100%'
          }}
        >
          <div style={{ display: currentSection === 'workspace' ? 'flex' : 'none', height: '100%', width: '100%' }}>
            <Explorer 
              onFileSelect={handleFileSelect} 
              activeFilePath={focusedTabPath || activeTabPath}
            />
          </div>
          <div style={{ display: currentSection === 'judge' ? 'flex' : 'none', height: '100%', width: '100%' }}>
            <Suspense fallback={<div className="nx-skeleton" style={{flex:1,margin:12,borderRadius:12}} />}><JudgeSystem activeFilePath={focusedTabPath || activeTabPath} /></Suspense>
          </div>
          <div style={{ display: currentSection === 'contests' ? 'flex' : 'none', height: '100%', width: '100%' }}>
            <Suspense fallback={<div className="nx-skeleton" style={{flex:1,margin:12,borderRadius:12}} />}><ContestsSystem /></Suspense>
          </div>
        </div>

        {/* Main UI Text Editor Core Canvas */}
        <div style={{ 
          flexGrow: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          background: 'var(--nx-bg-0)',
          position: 'relative'
        }}>
          {/* Editor panel is always mounted but toggled using CSS to prevent vanishing tabs */}
          <div style={{ display: (currentSection === 'workspace' || currentSection === 'judge' || currentSection === 'contests') ? 'flex' : 'none', width: '100%', height: '100%' }}>
            <Editor 
              activeFilePath={activeTabPath} 
              onFileSelect={handleFileSelect}
              onCloseFile={handleCloseFile}
            />
          </div>
        </div>
      </div>
      
      <StatusBar />
      <Toasts />
      <SettingsPanel />
      <Terminal 
        visible={terminalVisible} 
        onClose={() => setTerminalVisible(false)} 
        sidebarCollapsed={sidebarCollapsed}
      />

      {/* C++ Template Configuration Modal */}
      {templateModalVisible && (
        <div className="nx-template-modal-overlay">
          <div className="nx-template-modal">
            <div className="nx-template-modal-header">
              <h2 className="nx-template-modal-title">C++ FILE TEMPLATE</h2>
              <div className="nx-template-glow-badge">OPTIONS</div>
            </div>
            <p className="nx-template-modal-desc">
              Specify the default boilerplate code to automatically insert when creating any new `.cpp` files. Leave blank to create empty files.
            </p>
            <textarea
              className="nx-template-textarea"
              value={tempTemplate}
              onChange={(e) => setTempTemplate(e.target.value)}
              placeholder={`#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello World!" << endl;\n    return 0;\n}`}
            />
            <div className="nx-template-modal-actions">
              <button 
                className="nx-template-modal-btn cancel"
                onClick={() => openTemplateModal(false)}
              >
                Cancel
              </button>
              <button 
                className="nx-template-modal-btn save"
                onClick={() => {
                  setCppTemplate(tempTemplate);
                  openTemplateModal(false);
                }}
              >
                Save Boilerplate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;