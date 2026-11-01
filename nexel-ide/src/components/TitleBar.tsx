import React, { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../stores/useUIStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useEditorStore } from '../stores/useEditorStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { pluginEnabledById } from '../plugins/registry';
import logoImg from '../assets/logo.png';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { toggleSidebar, toggleTerminal, setTerminalVisible, openTemplateModal } = useUIStore();
  const { openWorkspaceDir, triggerHeaderNewFile, triggerHeaderNewFolder } = useWorkspaceStore();
  const { enableSnippets, setEnableSnippets, openSnippets } = useEditorStore();
  const cpOn = useSettingsStore(s => pluginEnabledById('competitive-programming', s.plugins));

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

  const handleControl = (action: 'minimize' | 'maximize' | 'close') => {
    if (action === 'minimize') window.nexelAPI.minimizeWindow();
    else if (action === 'maximize') window.nexelAPI.maximizeWindow();
    else if (action === 'close') window.nexelAPI.closeWindow();
  };

  const triggerOpenFolder = () => {
    setActiveMenu(null);
    openWorkspaceDir();
  };

  const menus = {
    File: [
      { label: 'Open Folder...', action: triggerOpenFolder },
      { label: 'New File', action: () => { setActiveMenu(null); triggerHeaderNewFile(); } },
      { label: 'New Folder', action: () => { setActiveMenu(null); triggerHeaderNewFolder(); } },
    ],
    Edit: [
      { label: 'Undo', action: () => {} },
      { label: 'Redo', action: () => {} },
      { label: 'Cut', action: () => {} },
      { label: 'Copy', action: () => {} },
      { label: 'Paste', action: () => {} },
    ],
    Selection: [
      { label: 'Select All', action: () => {} },
      { label: 'Expand Selection', action: () => {} },
    ],
    View: [
      { label: 'Toggle Sidebar', action: () => { setActiveMenu(null); toggleSidebar(); } },
      { label: 'Appearance', action: () => {} },
    ],
    Terminal: [
      { label: 'New Terminal', action: () => { setActiveMenu(null); setTerminalVisible(true); } },
      { label: 'Toggle Terminal', action: () => { setActiveMenu(null); toggleTerminal(); } },
    ],
    Options: [
      { label: 'C++ Template...', action: () => { setActiveMenu(null); openTemplateModal(true); } },
      ...(cpOn ? [{ label: 'Snippets Manager...', action: () => { setActiveMenu(null); openSnippets(); } }] : []),
    ],
    Help: [
      { label: 'About Nexel IDE', action: () => alert('Nexel IDE v1.0.0 - Built with React + TypeScript + Monaco') },
    ]
  };

  return (
    <div className="nx-titlebar-container">
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
                  onMouseEnter={() => {
                    if (activeMenu !== null) setActiveMenu(name);
                  }}
                >
                  {name}
                </button>

                {isOpen && (
                  <div className="nx-titlebar-dropdown">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="nx-titlebar-dropdown-item"
                        onClick={() => {
                          if (item.action) item.action();
                        }}
                      >
                        {item.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="nx-titlebar-right">
        {/* Snippets Toggle Switch */}
        <div className="nx-titlebar-toggle-wrapper" title="Toggle Snippets Autocomplete">
          <span className="nx-titlebar-toggle-label">Snippets</span>
          <div 
            className={`nx-titlebar-switch-track ${enableSnippets ? 'active' : ''}`}
            onClick={() => {
              setEnableSnippets(!enableSnippets);
            }}
          >
            <div className="nx-titlebar-switch-thumb" />
          </div>
        </div>

        {/* Snippets List Button (CP plugin content) */}
        {cpOn && <button
          className="nx-titlebar-snippets-btn"
          onClick={openSnippets}
          title="Show Available Snippets List"
          aria-label="Snippets list"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>}

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
