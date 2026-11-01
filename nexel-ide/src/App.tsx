import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { getClangd } from './lib/clangd/session';
import { useUIStore } from './stores/useUIStore';
import { useEditorStore } from './stores/useEditorStore';
import { NavDock } from './components/NavDock';
import { Explorer } from './components/Explorer';
import { Editor } from './components/Editor';
import { TitleBar } from './components/TitleBar';
import { Terminal } from './components/Terminal';
import { useWorkspaceStore, type FileNode } from './stores/useWorkspaceStore';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { SettingsPanel } from './components/SettingsPanel';
import { useSettingsStore } from './stores/useSettingsStore';
import { useStatusStore } from './stores/useStatusStore';
import { applyTheme, THEMES } from './lib/themes';
import { switchTheme } from './lib/themeTransition';
import { SearchPanel } from './components/SearchPanel';
import { loadSession, saveSession } from './lib/session';
import { listPlugins, pluginEnabled } from './plugins/registry';
import './plugins/competitive-programming';
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [zen, setZen] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('nx-zen', zen); return () => document.documentElement.classList.remove('nx-zen'); }, [zen]);
  const tree = useWorkspaceStore(s => s.tree);
  const themeId = useSettingsStore(s => s.theme);
  const pluginPrefs = useSettingsStore(s => s.plugins);
  const enabledPlugins = listPlugins().filter(pl => pluginEnabled(pl, pluginPrefs));
  const pluginSections = new Set(enabledPlugins.flatMap(pl => pl.sections));
  const pluginCommands = new Set(enabledPlugins.flatMap(pl => pl.commandIds));
  const pluginNavItems = enabledPlugins.flatMap(pl => pl.navItems);
  // Disabled-plugin section still active (e.g. just toggled off): fall back to workspace.
  useEffect(() => {
    const owned = listPlugins().some(pl => pl.sections.includes(currentSection));
    if (owned && !pluginSections.has(currentSection)) setSection('workspace');
  }, [currentSection, pluginPrefs]);
  const firstTheme = useRef(true);
  useEffect(() => { applyTheme(themeId, document.documentElement, !firstTheme.current); firstTheme.current = false; }, [themeId]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setPaletteOpen(false); setQuickOpen(false); setSearchOpen(o => !o); }
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setQuickOpen(false); setPaletteOpen(o => !o); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '/' && !(e.target as HTMLElement)?.closest?.('.monaco-editor')) { e.preventDefault(); setShortcutsOpen(o => !o); }
      else if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); setZen(z => !z); }
      else if (e.key === 'Escape' && document.documentElement.classList.contains('nx-zen') && !(e.target as HTMLElement)?.closest?.('.monaco-editor')) setZen(false);
      else if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); const st = useSettingsStore.getState(); st.openSettings(!st.settingsOpen); }
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setPaletteOpen(false); setQuickOpen(o => !o); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); useUIStore.getState().toggleTerminal(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  // Session restore: reopen last workspace's tabs once, then keep the session saved (debounced).
  const restored = useRef(false);
  const rootPath = useWorkspaceStore(s => s.rootPath);
  useEffect(() => {
    if (restored.current || !rootPath) return;
    restored.current = true;
    if (useEditorStore.getState().tabs.length) return;
    const sess = loadSession(rootPath);
    if (!sess) return;
    void (async () => {
      for (const p of sess.paths.filter(x => x !== sess.active)) {
        try { useEditorStore.getState().openFile(p, p.split(/[\\/]/).pop() ?? p, await window.nexelAPI.readFileContent(p)); } catch { /* file gone: skip */ }
      }
      if (sess.active) { try { useEditorStore.getState().openFile(sess.active, sess.active.split(/[\\/]/).pop() ?? sess.active, await window.nexelAPI.readFileContent(sess.active)); } catch { /* skip */ } }
      useStatusStore.getState().pushToast(`Restored ${sess.paths.length} tab${sess.paths.length === 1 ? '' : 's'}`, 'info', 2500);
    })();
  }, [rootPath]);
  useEffect(() => {
    if (!rootPath || !restored.current) return;
    const t = window.setTimeout(() => { if (tabs.length) saveSession({ root: rootPath, paths: tabs.map(x => x.filePath), active: activeTabPath }); }, 400);
    return () => window.clearTimeout(t);
  }, [tabs, activeTabPath, rootPath]);
  // clangd IntelliSense follows the workspace root and the IntelliSense settings (restarts only when they change).
  const clangdEnabled = useSettingsStore(s => s.clangdEnabled);
  const cppStd = useSettingsStore(s => s.cppStd);
  const clangdFlags = useSettingsStore(s => s.clangdFlags);
  useEffect(() => {
    void getClangd((m, k, ttl) => useStatusStore.getState().pushToast(m, k, ttl))
      .configure({ root: rootPath, enabled: clangdEnabled, std: cppStd, extraFlags: clangdFlags.split(' ').filter(Boolean) });
  }, [rootPath, clangdEnabled, cppStd, clangdFlags]);
  // Go to Definition into another file (clangd): open it as a tab, then reveal the line.
  useEffect(() => {
    const onOpenAt = (e: Event) => {
      const { path: p, line, col } = (e as CustomEvent<{ path: string; line: number; col: number }>).detail ?? {};
      if (typeof p !== 'string') return;
      void handleFileSelect(p).then(() => window.setTimeout(() => window.dispatchEvent(new CustomEvent('nexel:reveal', { detail: { path: p, line, col } })), 160));
    };
    window.addEventListener('nexel:open-at', onOpenAt);
    return () => window.removeEventListener('nexel:open-at', onOpenAt);
  });
  // Plugin activation hooks (e.g. the CP companion listener attaches only while its plugin is on)
  const pluginsAll = useMemo(() => listPlugins(), []);
  const enabledPluginIds = new Set(enabledPlugins.map(pl => pl.id));
  for (const pl of pluginsAll) pl.useActivation?.(enabledPluginIds.has(pl.id));
  const paletteCommands = [
    { id: 'ws', label: 'Go to Workspace', run: () => setSection('workspace') },
    { id: 'judge', label: 'Go to Judge', run: () => setSection('judge') },
    { id: 'contests', label: 'Go to Contests', run: () => setSection('contests') },
    { id: 'zen', label: 'Toggle Zen Mode', hint: 'Ctrl+Alt+Z', run: () => setZen(z => !z) },
    { id: 'sidebar', label: 'Toggle Sidebar', run: () => toggleSidebar() },
    { id: 'term', label: 'Toggle Terminal', run: () => setTerminalVisible(!terminalVisible) },
    { id: 'tpl', label: 'Edit C++ Template', run: () => openTemplateModal(true) },
    { id: 'findfiles', label: 'Find in Files', hint: 'Ctrl+Shift+F', run: () => setSearchOpen(true) },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', hint: 'Ctrl+/', run: () => setShortcutsOpen(true) },
    { id: 'settings', label: 'Open Settings', hint: 'Ctrl+,', run: () => useSettingsStore.getState().openSettings(true) },
    ...THEMES.map(t => ({ id: 'theme-' + t.id, label: `Theme: ${t.name}`, run: () => switchTheme(t.id) })),
    { id: 'minimap', label: 'Toggle Minimap', run: () => useSettingsStore.getState().toggle('minimap') },
    { id: 'wrap', label: 'Toggle Word Wrap', run: () => useSettingsStore.getState().toggle('wordWrap') },
  ].filter(c => {
    const owner = listPlugins().find(pl => pl.commandIds.includes(c.id));
    return !owner || pluginCommands.has(c.id);
  });

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
        const name = filePath.split(/[\\/]/).pop() || filePath;
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
      {searchOpen && <SearchPanel files={flatFiles(tree)} onClose={() => setSearchOpen(false)} onOpen={async (p, line, col) => { await handleFileSelect(p); window.setTimeout(() => window.dispatchEvent(new CustomEvent('nexel:reveal', { detail: { path: p, line, col } })), 120); }} />}
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
            pluginItems={pluginNavItems}
            sidebarCollapsed={sidebarCollapsed}
          />
        </div>

        {/* Workspace Panel Stream (Collapses completely on toggle, no hover reveal) */}
        <div 
          className={`nx-sidebar-container ${sidebarCollapsed ? 'collapsed' : ''}`}
          style={{ 
            display: (currentSection === 'workspace' || pluginSections.has(currentSection)) ? 'flex' : 'none',
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
          {/* Plugin-owned dock sections render their panels from the registry; the shell imports no plugin modules */}
          {pluginsAll.flatMap(pl => (pl.sections ?? []).filter(sec => pluginSections.has(sec) && pl.panels?.[sec]).map(sec => {
            const Panel = pl.panels![sec];
            return (
              <div key={sec} style={{ display: currentSection === sec ? 'flex' : 'none', height: '100%', width: '100%' }}>
                <Suspense fallback={<div className="nx-skeleton" style={{flex:1,margin:12,borderRadius:12}} />}><Panel activeFilePath={focusedTabPath || activeTabPath} /></Suspense>
              </div>
            );
          }))}
        </div>

        {/* Main UI Text Editor Core Canvas */}
        <div style={{ 
          flexGrow: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          background: 'var(--nx-bg-0)',
          position: 'relative'
        }}>
          {/* Editor panel is always mounted but toggled using CSS to prevent vanishing tabs */}
          <div style={{ display: (currentSection === 'workspace' || pluginSections.has(currentSection)) ? 'flex' : 'none', width: '100%', height: '100%' }}>
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
