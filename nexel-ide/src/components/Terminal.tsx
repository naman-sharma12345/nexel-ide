import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './Terminal.css';
import { useSettingsStore } from '../stores/useSettingsStore';
import { getTheme } from '../lib/themes';

interface TerminalProps {
  visible: boolean;
  onClose: () => void;
  sidebarCollapsed: boolean;
}

export const Terminal: React.FC<TerminalProps> = ({ visible, onClose, sidebarCollapsed }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);

  const themeId = useSettingsStore(st => st.theme);
  useEffect(() => {
    const t = xtermInstance.current;
    if (t) t.options.theme = { ...t.options.theme, background: getTheme(themeId).bg0 };
  }, [themeId]);

  useEffect(() => {
    if (!visible || !terminalRef.current) return;

    // Initialize xterm with custom visual theme matching Monaco minimally
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'underline',
      fontSize: 12,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: getTheme(useSettingsStore.getState().theme).bg0, // follows the active Nexel theme
        foreground: '#e2e3e5', // Light gray text
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.1)',
        black: '#000000',
        red: '#C5A3A3', // Muted red keyword tone
        green: '#A3C5B5', // Muted green type tone
        yellow: '#D3C1A5', // Muted gold number tone
        blue: '#B0C4DE', // Muted blue string tone
        magenta: '#D4C2AD', // Muted peach function tone
        cyan: '#8c95a5',
        white: '#ffffff',
      },
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    // Fit terminal layout to container
    setTimeout(() => {
      try {
        fitAddon.fit();
        window.nexelAPI.resizeTerminal(term.cols, term.rows);
      } catch {
        // Ignore terminal resizing errors on layout change
      }
    }, 100);

    xtermInstance.current = term;
    fitAddonInstance.current = fitAddon;

    let isNative = false;
    let commandInputBuffer = '';

    // Spawn native shell process in main
    window.nexelAPI.createTerminal().then((nativeActive) => {
      isNative = nativeActive;
    });

    // Listen to data from shell -> write to terminal
    window.nexelAPI.onTerminalData((data: string) => {
      term.write(data);
    });

    // Write terminal key inputs -> shell process stdin
    const onDataDisposable = term.onData((data) => {
      if (isNative) {
        window.nexelAPI.writeTerminal(data);
      } else {
        // Fallback TTY emulation: manual echo + standard input stream pipe
        for (let i = 0; i < data.length; i++) {
          const char = data[i];
          
          if (char === '\r') {
            term.write('\r\n');
            window.nexelAPI.writeTerminal(commandInputBuffer + '\r\n');
            commandInputBuffer = '';
          } else if (char === '\u007F' || char === '\b') {
            if (commandInputBuffer.length > 0) {
              commandInputBuffer = commandInputBuffer.slice(0, -1);
              term.write('\b \b');
            }
          } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
            commandInputBuffer += char;
            term.write(char);
          } else {
            // Forward other characters (arrows, tab, ctrl+c, etc.) directly
            window.nexelAPI.writeTerminal(char);
          }
        }
      }
    });

    // Handle resize on observer updates
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        window.nexelAPI.resizeTerminal(term.cols, term.rows);
      } catch {
        // Ignore terminal resizing errors on observer trigger
      }
    });
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      onDataDisposable.dispose();
      term.dispose();
      xtermInstance.current = null;
      fitAddonInstance.current = null;
      resizeObserver.disconnect();
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div 
      className="nx-terminal-panel"
      style={{ left: sidebarCollapsed ? '0px' : '290px' }}
    >
      <div className="nx-terminal-header">
        <div className="nx-term-header-left">
          <svg className="nx-term-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span className="nx-term-title">TERMINAL</span>
        </div>
        <div className="nx-term-header-right">
          <button className="nx-term-header-btn close" onClick={onClose} title="Close Terminal Panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="nx-terminal-body" ref={terminalRef} />
    </div>
  );
};
