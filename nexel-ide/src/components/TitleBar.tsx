import React, { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../stores/useUIStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { collectPluginMenuItems, collectPluginTitlebarItems } from '../plugins/registry';
import { runEditorMenuCommand } from '../lib/editorMenu';
import { useStatusStore } from '../stores/useStatusStore';
import { createPortal } from 'react-dom';
import { ShortcutsSheet } from './ShortcutsSheet';
import logoImg from '../assets/logo.png';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const aboutCloseRef = useRef<HTMLButtonElement>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { toggleSidebar, toggleTerminal, setTerminalVisible, openTemplateModal } = useUIStore();
  const { openWorkspaceDir, triggerHeaderNewFile, triggerHeaderNewFolder } = useWorkspaceStore();
  const wordWrap = useSettingsStore(s => s.wordWrap);
  const minimap = useSettingsStore(s => s.minimap);
  const pluginPrefs = useSettingsStore(s => s.plugins);
  const pluginTitlebarItems = collectPluginTitlebarItems(pluginPrefs);
  const pluginOptionItems = collectPluginMenuItems(pluginPrefs, 'Options');

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
  return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!aboutOpen) return;
    aboutCloseRef.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAboutOpen(false); }
      else if (e.key === 'Tab') { e.preventDefault(); aboutCloseRef.current?.focus(); }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [aboutOpen]);

  const handleControl = (action: 'minimize' | 'maximize' | 'close') => {
    if (action === 'minimize') window.nexelAPI.minimizeWindow();
    else if (action === 'maximize') window.nexelAPI.maximizeWindow();
    else if (action === 'close') window.nexelAPI.closeWindow();
  };

  const triggerOpenFolder = () => {
    setActiveMenu(null);
    openWorkspaceDir();
  };

  const runEdit = (command: string) => {
    setActiveMenu(null);
    if (!runEditorMenuCommand(command)) useStatusStore.getState().pushToast('Command unavailable. Check that a writable source file is open and clipboard access is available.', 'info');
  };

  const menus = {
    File: [
      { label: 'Open Folder...', action: triggerOpenFolder },
      { label: 'New File', action: () => { setActiveMenu(null); triggerHeaderNewFile(); } },
      { label: 'New Folder', action: () => { setActiveMenu(null); triggerHeaderNewFolder(); } },
    ],
    Edit: [
      { label: 'Undo', action: () => runEdit('undo') },
      { label: 'Redo', action: () => runEdit('redo') },
      { label: 'Cut', action: () => runEdit('editor.action.clipboardCutAction') },
      { label: 'Copy', action: () => runEdit('editor.action.clipboardCopyAction') },
      { label: 'Paste', action: () => runEdit('editor.action.clipboardPasteAction') },
    ],
    Selection: [
      { label: 'Select All', action: () => runEdit('editor.action.selectAll') },
      { label: 'Expand Selection', action: () => runEdit('editor.action.smartSelect.expand') },
    ],
    View: [
      { label: 'Toggle Sidebar', action: () => { setActiveMenu(null); toggleSidebar(); } },
      { label: 'Appearance / Settings...', action: () => { setActiveMenu(null); useSettingsStore.getState().openSettings(true); } },
      { label: `${wordWrap ? '✓ ' : ''}Word Wrap`, action: () => { setActiveMenu(null); useSettingsStore.getState().toggle('wordWrap'); } },
      { label: `${minimap ? '✓ ' : ''}Minimap`, action: () => { setActiveMenu(null); useSettingsStore.getState().toggle('minimap'); } },
    ],
    Terminal: [
      { label: 'New Terminal', action: () => { setActiveMenu(null); setTerminalVisible(true); } },
      { label: 'Toggle Terminal', action: () => { setActiveMenu(null); toggleTerminal(); } },
    ],
    Options: [
      { label: 'C++ Template...', action: () => { setActiveMenu(null); openTemplateModal(true); } },
      ...pluginOptionItems.map((it) => ({ label: it.label, action: () => { setActiveMenu(null); it.action(); } })),
    ],
    Help: [
      { label: 'About Nexel IDE', action: () => { setActiveMenu(null); setAboutOpen(true); } },
      { label: 'Keyboard Shortcuts', action: () => { setActiveMenu(null); setShortcutsOpen(true); } },
    ]
  };

    const switchMenu = (name: string, step: number, focusItem: boolean) => {
    const names = Object.keys(menus);
    const nextName = names[(names.indexOf(name) + step + names.length) % names.length];
    setActiveMenu(nextName);
    requestAnimationFrame(() => {
      const triggers = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('.nx-menu-trigger-btn') ?? [])];
      const trigger = triggers.find(t => t.textContent === nextName);
      if (focusItem) trigger?.parentElement?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
      else trigger?.focus();
    });
  };


  return (
    <div className="nx-titlebar-container">
      {shortcutsOpen && createPortal(<ShortcutsSheet onClose={() => setShortcutsOpen(false)} />, document.body)}
      {aboutOpen && createPortal(<div className="nx-about-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAboutOpen(false); }}>
        <section className="nx-about-box" role="dialog" aria-modal="true" aria-labelledby="nx-about-heading">
          <div className="nx-about-brand"><img src={logoImg} alt="" /><span>NEXEL</span></div>
          <h1 id="nx-about-heading">A workspace for your code.</h1>
          <p>Edit, search and build with a focused editor, split views and an integrated terminal.</p>
          <div className="nx-about-features"><span>Monaco editor</span><span>Local files</span><span>Optional CP tools</span></div>
          <footer><span>React · TypeScript · Electron</span><button ref={aboutCloseRef} onClick={() => setAboutOpen(false)}>Close</button></footer>
        </section>
      </div>, document.body)}
      {/* Draggable drag region */}
      <div className="nx-titlebar-drag-handle" />

      <div className="nx-titlebar-left" ref={menuRef}>
        <div className="nx-brand-logo">
          <img src={logoImg} className="nx-logo-img" alt="Nexel Logo" />
          <span className="nx-brand-text">NEXEL</span>
        </div>

        <div className="nx-menu-bar">
          {Object.entries(menus).map(([name, items]) => {
            const isOpen = activeMenu === name;
            return (
              <div key={name} className="nx-menu-trigger-container">
                <button
                  className={`nx-menu-trigger-btn ${isOpen ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenu(isOpen ? null : name);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveMenu(name);
                      const container = e.currentTarget.parentElement;
                      requestAnimationFrame(() => {
                        const buttons = container?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
                        if (buttons?.length) buttons[e.key === 'ArrowUp' ? buttons.length - 1 : 0].focus();
                      });
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault(); switchMenu(name, e.key === 'ArrowRight' ? 1 : -1, true);
                    } else if (e.key === 'Escape') setActiveMenu(null);
                  }}
                  onMouseEnter={() => {
                    if (activeMenu !== null) setActiveMenu(name);
                  }}
                >
                  {name}
                </button>

                {isOpen && (
                  <div className="nx-titlebar-dropdown" role="menu" aria-label={name}
                    onKeyDown={(e) => {
                      const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
                      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
                        e.preventDefault();
                        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
                          : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
                        buttons[next]?.focus();
                      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault(); switchMenu(name, e.key === 'ArrowRight' ? 1 : -1, true);
                      } else if (e.key === 'Escape') {
                        e.preventDefault(); e.stopPropagation(); setActiveMenu(null);
                        e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.nx-menu-trigger-btn')?.focus();
                      } else if (e.key === 'Tab') setActiveMenu(null);
                    }}>

                    {items.map((item, idx) => (
                      <button type="button" role="menuitem"
                        key={idx}
                        className="nx-titlebar-dropdown-item"
                        onClick={() => {
                          if (item.action) item.action();
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="nx-titlebar-right">
        {/* Plugin-contributed title bar buttons */}
        {pluginTitlebarItems.map((Item, i) => <Item key={i} />)}

        <button 
          className="nx-win-ctrl-btn minimize" 
          title="Minimize" 
          onClick={() => handleControl('minimize')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <button 
          className="nx-win-ctrl-btn maximize" 
          title="Maximize" 
          onClick={() => handleControl('maximize')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
        </button>
        <button 
          className="nx-win-ctrl-btn close" 
          title="Close" 
          onClick={() => handleControl('close')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    </div>
  );
};
